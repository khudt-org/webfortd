/**
 * KB 인덱스 쿼리 — fs 비의존 경량 모듈.
 *
 * kb.ts(getKBDocBySlug 등)는 `path.join(CONTENT_ROOT, ...)` + `fs.readFileSync`로 본문을
 * 읽으므로, Turbopack NFT가 content/ 전체(535개) + node_modules를 함수 번들에 trace한다.
 * 목록·카운트만 필요한 동적 페이지(axis 목록 페이지, 위키 홈 둘러보기 카드)가 kb.ts를
 * import하면 그 거대 trace를 함께 끌어와 Hobby 서버리스 함수 크기 한계를 초과 → 배포 실패.
 *
 * 따라서 kb-index.generated.json만 읽는 순수 쿼리 함수를 이 모듈로 분리한다.
 * 본문(content)이 필요 없는 곳은 반드시 `@/lib/kb`가 아닌 `@/lib/kb-query`에서 import할 것.
 */

import { cache } from "react"
import type { ContentAxis, DocumentSummary, Frontmatter } from "@/types/kb"
import kbIndex from "@/lib/kb-index.generated.json"

export interface Backlink {
  from: string
  /** `#section` anchor — 같은 페이지 내 헤딩 또는 anchor target */
  anchor?: string
  /** `|표시명` alias — 위키링크 본문에 노출되는 사용자 정의 표시 텍스트 */
  link_text?: string
}

export interface KBDocumentSummary extends DocumentSummary {
  /** 검색 인덱스에 노출되는 본문 첫 500자 — sync-content가 채움 */
  body_excerpt: string
}

export interface KBIndexShape {
  generated_at: string | null
  content_hash: string
  source_count: number
  documents: KBDocumentSummary[]
  wiki_backlinks: Record<string, Backlink[]>
  broken_wikilinks: Array<{ source: string; target: string; line: number }>
  slug_index: Record<string, string>
  wikilink_adjacency: Record<string, string[]>
}

// JSON import는 unknown 타입 — KBIndexShape로 좁힌다.
export const INDEX = kbIndex as unknown as KBIndexShape

export interface FilterParams {
  axis?: ContentAxis
  disability_types?: string[]
  domains?: string[]
  regions?: string[]
  year?: number
  type?: string
  status?: string
}

function matchesFilter(doc: KBDocumentSummary, f: FilterParams): boolean {
  const fm = doc.frontmatter as Frontmatter
  if (f.axis && doc.axis !== f.axis) return false
  if (f.year !== undefined && fm.year !== f.year) return false
  if (f.type && fm.type !== f.type) return false
  if (f.status && fm.status !== f.status) return false
  if (f.disability_types?.length) {
    const hit = f.disability_types.some((t) => fm.disability_types.includes(t as never))
    if (!hit) return false
  }
  if (f.domains?.length) {
    const hit = f.domains.some((d) => fm.domains.includes(d as never))
    if (!hit) return false
  }
  if (f.regions?.length) {
    const hit = f.regions.some((r) => fm.regions.includes(r as never))
    if (!hit) return false
  }
  return true
}

export const getDocsByFilter = cache(
  async (filter: FilterParams = {}): Promise<KBDocumentSummary[]> => {
    return INDEX.documents.filter((d) => matchesFilter(d, filter))
  },
)
