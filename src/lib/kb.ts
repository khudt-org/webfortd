/**
 * webfortd 콘텐츠 로더 (KB Loader) — M2
 *
 * sync-content.ts가 생성한 src/lib/kb-index.generated.json을 정적 import해서
 * Next.js 16 App Router의 Server Component에 콘텐츠 메타데이터를 공급한다.
 *
 * 본문(content)은 JSON에 없으므로 호출 시점에 파일에서 직접 로딩한다.
 *
 * 기존 src/lib/mdx.ts는 M2 단계에서 즉시 제거하지 않는다 — 목록 페이지가 여전히
 * getAllDocs를 사용하므로. 라우팅 [slug] 페이지만 신 로더로 전환한다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { cache } from 'react'
import matter from 'gray-matter'
import type { ContentAxis } from '@/types/kb'
import {
  INDEX,
  getDocsByFilter,
  type Backlink,
  type KBDocumentSummary,
  type FilterParams,
} from '@/lib/kb-query'

// kb-index 쿼리 API(INDEX/getDocsByFilter/FilterParams)는 fs 비의존 kb-query.ts로 분리됨.
// 본문이 필요 없는 소비자(axis 목록·홈 카드)는 '@/lib/kb-query'에서 직접 import해
// content/ 전체를 함수 번들에 trace하는 것을 피한다. 여기서는 기존 '@/lib/kb' import 호환을 위해 re-export.
export { getDocsByFilter }
export type { Backlink, KBDocumentSummary, FilterParams }

// ---------- 타입 ----------

export interface Heading {
  level: number
  text: string
  id: string
}

export interface DocumentFull extends KBDocumentSummary {
  content: string
  headings: Heading[]
  backlinks: Backlink[]
}

// ---------- 내부 헬퍼 ----------

// 본문 경로는 content/ 기준으로만 조합한다. 저장소 루트 + 변수로 조합하면 빌드의 파일 추적이
// 읽을 범위를 좁히지 못해 data/·public/source-images 등 저장소 전체를 함수 번들에 싣는다
// (함수 1개 220MB, 배포 1건 약 2GB로 Hobby Functions Storage 10GB 초과, 2026-09-25 실측).
const CONTENT_ROOT = path.join(process.cwd(), 'content')
const CONTENT_PREFIX = 'content/'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/\s+/g, '-')
    .trim()
}

function extractHeadings(content: string): Heading[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const headings: Heading[] = []
  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
      id: slugify(match[2].trim()),
    })
  }
  return headings
}

// ---------- 조회 API ----------

export function getAllSlugs(): string[] {
  return Object.keys(INDEX.slug_index)
}

/**
 * 특정 subsection(예: 'research', 'law')에 속한 슬러그만 반환.
 * M2 단계의 임시 shim — 옵션 C 라우팅 호환. axis-only 전환 시 제거 예정.
 *
 * 위치 기반 매칭: filePath 형식이 `content/<axis>/<subsection>/<stem>.md`(4 parts)인
 * 문서에서 parts[2] === subsection인 경우만 인정. `.includes()` 부분 매칭은 false-positive
 * 위험(예: 다른 axis에 `research-based-...` 같은 디렉터리가 생기면 부적절 매치).
 *
 * @deprecated M3 라우팅 재구성 후 getDocsByFilter({ axis }) + slug 매핑으로 교체.
 */
export function getSlugsBySubsection(subsection: string): string[] {
  const out: string[] = []
  for (const [slug, filePath] of Object.entries(INDEX.slug_index)) {
    const parts = filePath.split('/')
    // content/<axis>/<subsection>/<stem>.md  → parts.length === 4
    if (parts.length === 4 && parts[2] === subsection) {
      out.push(slug)
    }
  }
  return out
}

export function getBacklinks(slug: string): Backlink[] {
  return INDEX.wiki_backlinks[slug] ?? []
}

export function getWikilinkAdjacency(): Record<string, string[]> {
  return INDEX.wikilink_adjacency
}

/**
 * slug 하나로 문서 전체 로딩 (메타 + 본문 + 헤딩 + 백링크).
 */
export const getKBDocBySlug = cache(
  async (slug: string): Promise<DocumentFull | null> => {
    const filePath = INDEX.slug_index[slug]
    if (!filePath?.startsWith(CONTENT_PREFIX)) return null

    const absPath = path.join(CONTENT_ROOT, filePath.slice(CONTENT_PREFIX.length))
    if (!absPath.startsWith(CONTENT_ROOT + path.sep)) return null
    if (!fs.existsSync(absPath)) return null

    const summary = INDEX.documents.find((d) => d.slug === slug)
    if (!summary) return null

    const fileContent = fs.readFileSync(absPath, 'utf-8')
    const { content } = matter(fileContent)
    const headings = extractHeadings(content)
    const backlinks = getBacklinks(slug)

    return {
      ...summary,
      content,
      headings,
      backlinks,
    }
  },
)

/**
 * 라우팅 호환 어댑터 — 기존 mdx.ts의 (section, subsection, slug) 시그니처를
 * slug 단일로 변환. M2 단계에서 라우팅 코드 diff를 최소화하기 위함.
 * section/subsection은 무시하고 slug로만 조회한다.
 */
export const getKBDocBySlugCompat = cache(
  async (
    _section: string,
    _subsection: string,
    slug: string,
  ): Promise<DocumentFull | null> => {
    return getKBDocBySlug(slug)
  },
)

/**
 * generateStaticParams 보조. 특정 subsection 슬러그만 반환하여 라우팅의
 * 정적 경로를 그대로 유지한다.
 */
export function getStaticParamsForSubsection(subsection: string): Array<{ slug: string }> {
  return getSlugsBySubsection(subsection).map((slug) => ({ slug }))
}

/**
 * axis-only 라우팅용 슬러그 조회 — M3에서 도입.
 * filePath가 `content/<axis>/<slug>.md` 형태(3 parts)인 문서만 반환.
 * resources 같은 nested 구조(4 parts)는 의도적으로 제외 — 기존 라우트가 처리.
 */
export function getSlugsByAxis(axis: ContentAxis): string[] {
  const out: string[] = []
  for (const [slug, filePath] of Object.entries(INDEX.slug_index)) {
    const parts = filePath.split('/')
    if (parts.length === 3 && parts[1] === axis) {
      out.push(slug)
    }
  }
  return out
}

export function getStaticParamsForAxis(axis: ContentAxis): Array<{ slug: string }> {
  return getSlugsByAxis(axis).map((slug) => ({ slug }))
}
