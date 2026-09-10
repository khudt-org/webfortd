#!/usr/bin/env tsx
/**
 * webfortd 출처 마크다운 자동 분해 스크립트 — 2026-08 3층 재생성판
 *
 * 입력: data/source-md/*.md (2층 마크다운 정본 v4 4종 + 2020 단체협약)
 * 출력: content/<axis>/<slug>.md (atomic 페이지, status='draft' 강제)
 *       docs/decompose-report.md (페이지별 신뢰도·경고 리포트)
 *
 * 실행:
 *   tsx scripts/decompose-source.ts                 # 입력 폴더 전체(frozen 출처는 건너뜀)
 *   tsx scripts/decompose-source.ts --dry-run       # 파일 쓰기 없이 stdout 요약만
 *   tsx scripts/decompose-source.ts --file <path>   # 단일 파일 모드
 *   tsx scripts/decompose-source.ts --reset         # source_origin 일치 파일 삭제 후 재생성
 *   tsx scripts/decompose-source.ts --include-frozen  # frozen 출처(단체협약)도 다시 쓴다
 *
 * 설계 정본: docs/DECOMPOSE_V2_DESIGN.md (자문 메모 260828 동일본).
 *
 * 핵심 규칙:
 *  - 슬러그 체계 2종. `outline`(4종): 출처 접두 + 부에서 자기 수준까지 전 조상 번호
 *    (「Ⅱ부 > 2. > 1) > (1) 교수학습」 → `2023-research-2-2-1-1`). 번호 없는 제목은
 *    부모 경로 + `x<n>`, 같은 경로에 같은 번호가 두 번이면 `-d2` + 경고, 5.5만 자 분할은
 *    `-pt<n>`, 부모 서문 개요 페이지는 부모 경로 그대로. 순번 fallback(`p-NNN`·
 *    `appendix-NNN`)은 없으며 만들 수 없으면 fatal. `article`(단체협약): 종전 제N조 방식
 *    그대로(주소 불변, frozen).
 *  - 분해 단위는 splitLevel 제목. 부모 제목과 첫 자식 사이 서문은 100자 이상이면
 *    개요 페이지, 미만이면 첫 자식 본문 앞에 붙인다.
 *  - 제목 후보 제외: `<표 …>`·`<그림 …>`·참고·TIP·Q&A 로 시작하는 제목은 본문 굵게로
 *    강등(parent_headings 오인 차단).
 *  - 같은 출처 안에서 title이 중복되면 부모 제목(번호 제거)을 접두로 붙인다.
 *  - 제목 끝 쪽수(`\s\d{1,3}$`)가 source_page와 같으면 제거.
 *  - 본문 100자 미만 조각은 다음 형제(없으면 이전 형제) 본문에 `## 원제목` 소절로 병합.
 *  - 5.5만 자 초과 본문은 표 블록 경계에서만 분할, 제목 `(1/N)`.
 *  - 쪽 주석 `<!-- p.X (pdf N) -->`는 frontmatter source_page*로 옮기고 본문에서 제거.
 *  - 이미지 `(이미지: alt)`는 TODO 마커 다음 줄에 원문을 남긴다(alt가 화면에서 사라지지
 *    않게). image:apply가 마커와 alt 줄을 함께 치환한다.
 *  - 같은 부모 경로 아래 형제 목록을 `## 관련 페이지`로 본문 끝에 붙인다(제목 + 원본 쪽).
 *  - 모든 분해 페이지는 status='draft' 강제. 공개는 2차 검증 뒤 `kb:bootstrap`.
 *  - 위원장이 수동 작성한 content/resources/* 등은 source_origin이 달라 --reset에서 보호.
 *  - idempotency: 동일 입력 두 번 실행 → 동일 출력.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import {
  CONTENT_AXES,
  type ContentAxis,
  type Frontmatter,
} from '../src/types/kb'
import { parseOutlineNumber, stripOutlineNumber, type OutlineKind, type OutlineNumber } from './lib/outline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const SOURCE_MD_DIR = path.join(REPO_ROOT, 'data/source-md')
const CONTENT_DIR = path.join(REPO_ROOT, 'content')
const REPORT_PATH = path.join(REPO_ROOT, 'docs/decompose-report.md')
const MANIFEST_PATH = path.join(REPO_ROOT, 'public/source-images/manifest.json')
const AXIS_OVERRIDES_PATH = path.join(REPO_ROOT, 'content/_axis-overrides.json')

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
// 이미지 패턴: 한 줄 안의 `(이미지: ...)`만 검출.
const IMAGE_PATTERN_RE = /\(이미지:\s*([^\n]+?)\)(?=\s|$)/gm
// 2층 v4 쪽 주석: `<!-- p.230 (pdf 254) -->` / `<!-- p.Ⅰ-3 (pdf 15) -->` / `<!-- p.pdf2 (pdf 2) -->`
const PAGE_COMMENT_RE = /<!--\s*p\.([^\s]+)\s*\(pdf\s*(\d+)\)\s*-->/g

// 코드블록 마스킹용 정규식 (sync-content.ts와 동일 정책 + indent 코드블록 추가).
const FENCED_CODE_RE = /```[\s\S]*?```/g
const INLINE_CODE_RE = /`[^`\n]*`/g
const INDENT_CODE_RE = /(^|\n)((?:[ ]{4}|\t)[^\n]*(?:\n(?:[ ]{4}|\t)[^\n]*)*)/g

/** 2층 v4가 남기는 HTML 태그 중 3층·렌더가 허용하는 것(속성 없음). validate·kb-mdx와 동일 목록. */
export const ALLOWED_HTML_TAGS = ['br', 'mark', 'sub', 'sup'] as const
/** 파서 잔존 태그 — 본문에 남아 있으면 2층 승격 누락 신호(validate가 오류로 잡는다). */
export const FORBIDDEN_HTML_TAGS = ['page_header', 'page_number', 'page_footer', 'u', 'figure', 'span'] as const

/**
 * 9/7 제5차 회의 결정 3: 연구 절차만 서술한 문서는 위키·챗봇 검색에서 제외하고 자료실 원본(PDF·마크다운 정본)으로만
 * 안내한다. 2층 정본에는 그대로 남고 3층 페이지·관련 페이지 목록에서만 빠진다.
 */
export const EXCLUDED_SLUGS = new Set([
  '2023-research-1-3-1', // 1) 연구 수행 절차
  '2023-research-1-3-2', // 2) 연구 운영 조직 체계
  '2023-research-app-2-x1', '2023-research-app-2-x2', '2023-research-app-2-x3', '2023-research-app-2-x4', // 델파이 1차 조사지
  '2023-research-app-3-x1', '2023-research-app-3-x2', '2023-research-app-3-x3', '2023-research-app-3-x4', // 델파이 2차 조사지
  '2023-research-4-3-1-1', // (1) 1차 및 2차 전문가협의회 진행 절차(청각)
  '2023-research-4-3-1-2', // (2) 3차 전문가협의회 진행 절차(청각)
])

const OVERVIEW_MIN_CHARS = 100
const MERGE_MAX_CHARS = 100
// 2026-08-30 위원장 결정: 델파이 2차 특수학교용(4.9만 자)이 한 건으로 들어가도록 5만 → 5.5만(예산 5.25만).
// validate-frontmatter.ts BODY_MAX_CHARS와 같은 값이어야 한다.
const SPLIT_MAX_CHARS = 55_000
/** 분할 판정 예산 — 분할 뒤에 붙는 관련 페이지 블록·이미지 alt 줄(최대 ~2,000자)을 미리 뺀다 */
const SPLIT_BUDGET_CHARS = SPLIT_MAX_CHARS - 2_500
const RELATED_MAX = 20

// ---------- 입력 파일 → source 메타 매핑 ----------

interface SourceFileMeta {
  sourceOrigin: string
  slugPrefix: string
  /** 분해 단위 헤딩 레벨 */
  splitLevel: 2 | 3 | 4
  /** 주소 체계. outline = 번호 경로(4종), article = 제N조(단체협약, 종전 방식 보존) */
  slugScheme: 'outline' | 'article'
  /** true면 --include-frozen 없이는 파일을 다시 쓰지 않는다(편집기 커밋 보호) */
  frozen?: boolean
  year: number
  docType: Frontmatter['type']
  source: { organization: string; citation: string; url?: string }
  defaultDisabilityTypes: Frontmatter['disability_types']
  forcedAxis?: ContentAxis
}

const SOURCE_FILE_MAP: Record<string, SourceFileMeta> = {
  '2023 장애유형별 장애인교원 근무 지원 방안_최종보고서_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md': {
    sourceOrigin: '2023-disability-types-work-support-report',
    slugPrefix: '2023-research',
    splitLevel: 4,
    slugScheme: 'outline',
    year: 2023,
    docType: '연구보고서',
    source: {
      organization: '교육부',
      citation: '2023 장애유형별 장애인교원 근무 지원 방안 최종보고서',
    },
    defaultDisabilityTypes: ['전체'],
  },
  '2023 장애인교원 인사관리안내서(단면)_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md': {
    sourceOrigin: '2023-hr-guide',
    slugPrefix: '2023-hr',
    splitLevel: 4,
    slugScheme: 'outline',
    year: 2023,
    docType: '안내서',
    source: {
      organization: '교육부',
      citation: '2023 장애인교원 인사관리안내서',
    },
    defaultDisabilityTypes: ['전체'],
  },
  '241210_책자_내지_중부대학교_장애인교원_근무지원_안내자료_V4_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md': {
    sourceOrigin: '2024-jbu-work-support-guide',
    slugPrefix: '2024-jbu',
    splitLevel: 4,
    slugScheme: 'outline',
    year: 2024,
    docType: '안내서',
    source: {
      organization: '중부대학교',
      citation: '단위학교 차원의 장애인교원 근무 지원 안내자료(각급학교용)',
    },
    defaultDisabilityTypes: ['전체'],
  },
  '교육부와 함께하는장애인교원노동조합 간 2020 단체협약.md': {
    sourceOrigin: '2020-collective-agreement',
    slugPrefix: '2020-ca',
    splitLevel: 4,
    slugScheme: 'article',
    frozen: true,
    year: 2020,
    docType: '지침',
    source: {
      organization: '교육부·함께하는장애인교원노동조합',
      citation: '교육부와 함께하는장애인교원노동조합 간 2020 단체협약 (2023.6.2. 개정)',
    },
    defaultDisabilityTypes: ['전체'],
    forcedAxis: 'agreements',
  },
  '내지_장애인교원_지원인력_직무_수행_안내자료인쇄용_156P_수정_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md': {
    sourceOrigin: '2024-support-staff-duty-guide',
    slugPrefix: '2024-staff',
    splitLevel: 3,
    slugScheme: 'outline',
    year: 2024,
    docType: '안내서',
    source: {
      organization: '교육부',
      citation: '장애인교원 지원인력 직무 수행 안내자료',
    },
    defaultDisabilityTypes: ['전체'],
  },
}

// ---------- 휴리스틱 매핑 테이블 ----------

const DOMAIN_KEYWORD_TABLE: Array<{ pattern: RegExp; domain: Frontmatter['domains'][number] }> = [
  { pattern: /(임용|채용|신규발령|임용시험|발령|전보|승진|전직|평정|성과급)/, domain: '인사관리' },
  { pattern: /(휴가|휴직|병가|복무|근무성적|업무분장|직무|복직)/, domain: '복무관리' },
  { pattern: /(지원인력|근로지원인|보조공학|편의지원|편의제공|접근성|문자통역|수어통역|대체자료|디지털교과서|웹접근성)/, domain: '편의지원' },
  { pattern: /(차별|권리구제|고충|인권|불이익|부당노동|개인정보)/, domain: '권리구제' },
  { pattern: /(연수|자격연수|직무연수|특별연수|파견|교원연수|교육연수)/, domain: '연수교육' },
  { pattern: /(법령|조례|지침|단체협약|법|규정|시행령|시행규칙|훈령|예규)/, domain: '정책법령' },
  { pattern: /(연구|통계|현황|조사|실태조사|보고서|분석)/, domain: '연구통계' },
  { pattern: /(인식개선|홍보|카드뉴스|장애이해|이해교육)/, domain: '인식개선' },
]

const DISABILITY_KEYWORD_TABLE: Array<{ pattern: RegExp; value: Frontmatter['disability_types'][number] }> = [
  { pattern: /(시각장애|시각 장애|시각교원|시각장애인 교원|시각 장애인)/, value: '시각' },
  { pattern: /(청각장애|청각 장애|청각교원|청각장애인 교원|청각 장애인|난청)/, value: '청각' },
  { pattern: /(지체장애|지체 장애|지체교원|지체장애인 교원|지체[·ㆍ‧]뇌병변|척수|절단)/, value: '지체' }, // 「지체·뇌병변장애」 병기 표기 포함(2차 검수 39번)
  { pattern: /(뇌병변|뇌성마비)/, value: '뇌병변' },
  { pattern: /(발달장애|자폐|지적장애)/, value: '발달' },
  { pattern: /(내부장애|간장애|신장장애|심장장애)/, value: '내부장애' },
]

const REGION_KEYWORD_TABLE: Array<{ pattern: RegExp; value: Frontmatter['regions'][number] }> = [
  { pattern: /서울특별시|서울교육청|서울시교육청/, value: '서울' },
  { pattern: /부산광역시|부산교육청|부산시교육청/, value: '부산' },
  { pattern: /대구광역시|대구교육청|대구시교육청/, value: '대구' },
  { pattern: /인천광역시|인천교육청|인천시교육청/, value: '인천' },
  { pattern: /광주광역시|광주교육청|광주시교육청/, value: '광주' },
  { pattern: /대전광역시|대전교육청|대전시교육청/, value: '대전' },
  { pattern: /울산광역시|울산교육청|울산시교육청/, value: '울산' },
  { pattern: /세종특별자치시|세종시교육청|세종교육청/, value: '세종' },
  { pattern: /경기도교육청|경기교육청/, value: '경기' },
  { pattern: /강원특별자치도|강원도교육청|강원교육청/, value: '강원' },
  { pattern: /충청북도교육청|충북교육청/, value: '충북' },
  { pattern: /충청남도교육청|충남교육청/, value: '충남' },
  { pattern: /전라북도교육청|전북교육청|전북특별자치도/, value: '전북' },
  { pattern: /전라남도교육청|전남교육청/, value: '전남' },
  { pattern: /경상북도교육청|경북교육청/, value: '경북' },
  { pattern: /경상남도교육청|경남교육청/, value: '경남' },
  { pattern: /제주특별자치도|제주교육청|제주도교육청/, value: '제주' },
]

// ---------- 타입 ----------

export interface PageOutput {
  outputPath: string
  relativePath: string
  slug: string
  axis: ContentAxis
  frontmatter: Frontmatter
  body: string
  confidence: 'high' | 'medium' | 'low'
  lowConfidenceFields: string[]
  imagePatternCount: number
}

export interface PageReport {
  slug: string
  relativePath: string
  axis: ContentAxis
  confidence: 'high' | 'medium' | 'low'
  lowConfidenceFields: string[]
  unmatchedImages: number
  todoMarkers: string[]
}

export interface DecomposeWarning {
  kind: 'range' | 'dup_number' | 'merged' | 'split' | 'overview' | 'demoted_heading' | 'unnumbered' | 'title_dedup' | 'page_strip' | 'excluded'
  slug: string
  detail: string
}

export interface DecomposeResult {
  sourceOrigin: string
  pages: PageOutput[]
  report: PageReport[]
  unmatchedImages: Array<{ slug: string; pattern: string; lineNo: number }>
  slugCollisions: Array<{ original: string; resolved: string; count: number }>
  warnings: DecomposeWarning[]
}

interface ImageManifestEntry {
  source: string
  page: number
  figure: number
  path: string
  alt?: string | null
}

// ---------- 코드블록 마스킹 (위치 보존) ----------

function maskCodeBlocks(body: string): string {
  const masker = (m: string) => m.replace(/[^\n]/g, ' ')
  let masked = body.replace(FENCED_CODE_RE, masker)
  masked = masked.replace(INLINE_CODE_RE, masker)
  // indent 코드블록: 줄 단위 list marker 휴리스틱 회피 (codex-rescue P1 #5).
  masked = masked.replace(INDENT_CODE_RE, (full: string, leading: string, code: string) => {
    if (/^\s*[-*+]\s|^\s*\d+\.\s/m.test(code)) return full
    return leading + code.replace(/[^\n]/g, ' ')
  })
  return masked
}

/** 제목 후보에서 제외할 참고 박스·표 캡션(본문 굵게로 강등) */
const NON_HEADING_RE = /^(<\s*표|〈\s*표|<\s*그림|〈\s*그림|\[\s*그림|참\s*고(?=\s|:|$|[^가-힣])|TIP(?=\s|:|$)|Q\s*&\s*A)/i

// ---------- 슬러그 생성기 (article 스킴, 단체협약 보존) ----------

function asciiKebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function makeArticleSlug(heading: string, meta: SourceFileMeta, fallbackIndex: number): string {
  const ascii = asciiKebab(heading)
  if (ascii && SLUG_RE.test(ascii)) return `${meta.slugPrefix}-${ascii}`
  const articleMatch = heading.match(/제\s*(\d+)\s*조/)
  if (articleMatch) return `${meta.slugPrefix}-art-${articleMatch[1].padStart(3, '0')}`
  const chapterMatch = heading.match(/제\s*(\d+)\s*장/)
  if (chapterMatch) return `${meta.slugPrefix}-ch-${chapterMatch[1].padStart(2, '0')}`
  const sectionMatch = heading.match(/제\s*(\d+)\s*절/)
  if (sectionMatch) return `${meta.slugPrefix}-sec-${sectionMatch[1].padStart(2, '0')}`
  if (/전\s*문/.test(heading)) return `${meta.slugPrefix}-preamble`
  if (/부\s*칙/.test(heading)) return `${meta.slugPrefix}-supplementary`
  if (/부\s*록/.test(heading)) return `${meta.slugPrefix}-appendix-${String(fallbackIndex).padStart(3, '0')}`
  return `${meta.slugPrefix}-p-${String(fallbackIndex).padStart(3, '0')}`
}

// ---------- 헤딩 추출 ----------

interface HeadingMatch {
  level: number
  text: string
  offset: number
  lineNo: number
  /** 이 제목 줄의 끝 offset(다음 줄 시작 직전) */
  lineEnd: number
}

function extractHeadings(masked: string, maxLevel: number): HeadingMatch[] {
  const HEADING_LINE_RE = /^(#{1,6})\s+(.+?)\s*$/gm
  const out: HeadingMatch[] = []
  let m: RegExpExecArray | null
  while ((m = HEADING_LINE_RE.exec(masked)) !== null) {
    const level = m[1].length
    if (level > maxLevel) continue
    const offset = m.index
    const lineNo = masked.slice(0, offset).split('\n').length
    out.push({ level, text: m[2].trim(), offset, lineNo, lineEnd: offset + m[0].length })
  }
  return out
}

// ---------- 휴리스틱 ----------

function inferDomainsForSection(headingPath: string[], bodySample: string): Frontmatter['domains'] {
  const haystack = headingPath.join(' ') + ' ' + bodySample
  const found = new Set<Frontmatter['domains'][number]>()
  for (const { pattern, domain } of DOMAIN_KEYWORD_TABLE) {
    if (pattern.test(haystack)) found.add(domain)
    if (found.size >= 3) break
  }
  return Array.from(found)
}

function inferDisabilityTypes(
  headingPath: string[],
  bodySample: string,
  fallback: Frontmatter['disability_types'],
): Frontmatter['disability_types'] {
  const haystack = headingPath.join(' ') + ' ' + bodySample
  const found = new Set<Frontmatter['disability_types'][number]>()
  for (const { pattern, value } of DISABILITY_KEYWORD_TABLE) {
    if (pattern.test(haystack)) found.add(value)
  }
  if (found.size === 0) return fallback
  return Array.from(found)
}

function inferRegions(bodySample: string): Frontmatter['regions'] {
  const found = new Set<Frontmatter['regions'][number]>()
  for (const { pattern, value } of REGION_KEYWORD_TABLE) {
    if (pattern.test(bodySample)) found.add(value)
  }
  if (found.size === 0) return ['전국']
  return Array.from(found)
}

function pickAxis(
  meta: SourceFileMeta,
  fm: Pick<Frontmatter, 'type' | 'disability_types' | 'regions' | 'domains'>,
): { axis: ContentAxis; confidence: 'high' | 'medium' | 'low' } {
  if (meta.forcedAxis) return { axis: meta.forcedAxis, confidence: 'high' }
  if (fm.domains.includes('정책법령')) return { axis: 'policies', confidence: 'high' }
  const concreteDts = fm.disability_types.filter((d) => d !== '전체' && d !== '기타')
  if (concreteDts.length === 1) return { axis: 'disability-types', confidence: 'high' }
  const concreteRegions = fm.regions.filter((r) => r !== '전국')
  if (concreteRegions.length === 1) return { axis: 'regions', confidence: 'medium' }
  if (fm.domains.length >= 1) return { axis: 'domains', confidence: 'medium' }
  return { axis: 'uncategorized', confidence: 'low' }
}

// ---------- 본문 처리 ----------

function processBodyImages(
  body: string,
  source: string,
  unmatched: Array<{ slug: string; pattern: string; lineNo: number }>,
  slug: string,
): { body: string; imagePatternCount: number; todoMarkers: string[] } {
  // 분해 단계에서 자동 ![](path) 삽입은 하지 않는다(codex-rescue M3 P0). TODO 마커 다음 줄에
  // 원문 `(이미지: alt)`를 남겨 alt가 화면·RAG에서 사라지지 않게 한다(2026-08 개정).
  // image:apply가 마커와 이 alt 줄을 함께 `![alt](path)`로 치환한다.
  const todoMarkers: string[] = []
  let imagePatternCount = 0
  const result = body.replace(IMAGE_PATTERN_RE, (_full, alt: string) => {
    imagePatternCount += 1
    const trimmedAlt = alt.trim()
    unmatched.push({ slug, pattern: trimmedAlt.slice(0, 100), lineNo: 0 })
    todoMarkers.push(`image-pending: ${trimmedAlt.slice(0, 40)}`)
    return `<!-- TODO: image-link source=${source} -- 원본: (이미지: ${trimmedAlt}) -->\n(이미지: ${trimmedAlt})`
  })
  return { body: result, imagePatternCount, todoMarkers }
}

function stripPageComments(body: string): string {
  return body
    .replace(new RegExp(PAGE_COMMENT_RE.source + '[ \t]*\n?', 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 본문 안 제목 수준을 가장 얕은 것이 `##`이 되도록 평행 이동(페이지 H1 아래 h2부터). */
function normalizeBodyHeadings(body: string): string {
  const masked = maskCodeBlocks(body)
  const levels: number[] = []
  const re = /^(#{1,6})\s+\S/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) levels.push(m[1].length)
  if (levels.length === 0) return body
  const min = Math.min(...levels)
  const shift = 2 - min
  if (shift === 0) return body
  const lines = body.split('\n')
  const maskedLines = masked.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const hm = maskedLines[i].match(/^(#{1,6})(\s+\S.*)$/)
    if (!hm) continue
    const newLevel = Math.min(6, Math.max(2, hm[1].length + shift))
    lines[i] = '#'.repeat(newLevel) + lines[i].slice(hm[1].length)
  }
  return lines.join('\n')
}

/** 표 블록 경계에서만 자르는 5.5만 자 분할. 단일 표가 한도를 넘으면 그대로 두고 경고. */
function splitLargeBody(body: string): { parts: string[]; oversizedTable: boolean } {
  if (body.length <= SPLIT_BUDGET_CHARS) return { parts: [body], oversizedTable: false }
  const lines = body.split('\n')
  // 블록 = 표(연속 `|` 줄) 또는 빈 줄로 구분되는 문단
  const blocks: string[] = []
  let cur: string[] = []
  let inTable = false
  for (const line of lines) {
    const isTableLine = /^\s*\|/.test(line)
    if (isTableLine) {
      if (!inTable && cur.length > 0) { blocks.push(cur.join('\n')); cur = [] }
      inTable = true
      cur.push(line)
      continue
    }
    if (inTable) { blocks.push(cur.join('\n')); cur = []; inTable = false }
    if (line.trim() === '') {
      if (cur.length > 0) { blocks.push(cur.join('\n')); cur = [] }
      continue
    }
    cur.push(line)
  }
  if (cur.length > 0) blocks.push(cur.join('\n'))
  const parts: string[] = []
  let acc: string[] = []
  let accLen = 0
  let oversizedTable = false
  for (const b of blocks) {
    if (b.length > SPLIT_MAX_CHARS) oversizedTable = true
    if (accLen + b.length > SPLIT_BUDGET_CHARS && acc.length > 0) {
      parts.push(acc.join('\n\n'))
      acc = []
      accLen = 0
    }
    acc.push(b)
    accLen += b.length + 2
  }
  if (acc.length > 0) parts.push(acc.join('\n\n'))
  return { parts, oversizedTable }
}

function textLength(body: string): number {
  return body.replace(/\s+/g, '').length
}

// ---------- outline 트리 구축 ----------

interface OutlineNode {
  heading: HeadingMatch
  number: OutlineNumber
  /** 경로 세그먼트(부에서 자기까지) */
  segs: string[]
  parent: OutlineNode | null
  children: OutlineNode[]
  /** 이 제목 직후 ~ 첫 자식(또는 다음 형제/상위) 직전의 본문 */
  preface: string
  /** 이 노드 범위의 본문 끝 offset */
  endOffset: number
}

interface PagePlan {
  slug: string
  title: string
  body: string
  parentHeadings: string[]
  parentPath: string
  /** 관련 페이지 형제 그룹 키(= 부모 노드 경로). 슬러그 역파싱 금지 */
  groupPath: string
  /** 이 절의 원문 끝 offset(쪽 주석 범위 계산용) */
  endOffset: number
  /** 문서 순서 */
  order: number
  isOverview: boolean
  headingOffset: number
  level: number
  numberKind: OutlineKind
}

interface PageRef { slug: string; title: string; page?: string }

function findPageComment(body: string, beforeOffset: number): { page: string; pdf: number } | null {
  const re = new RegExp(PAGE_COMMENT_RE.source, 'g')
  let last: { page: string; pdf: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (m.index >= beforeOffset) break
    last = { page: m[1], pdf: Number(m[2]) }
  }
  return last
}

/**
 * 절 본문 [start, end) 안의 마지막 쪽 주석 라벨. 단, 그 주석 뒤에 본문 텍스트가 없으면(다음 절 제목 직전에 붙은
 * 다음 쪽의 주석) 세지 않는다 — 2차 검수에서 `source_page_end`가 다음 절 시작 쪽으로 한 쪽 넘치던 원인.
 * `pdf` 접두 라벨(인쇄 쪽 번호 없는 쪽)도 끝 쪽으로 쓰지 않는다.
 */
function lastPageCommentIn(body: string, start: number, end: number): string | null {
  const re = new RegExp(PAGE_COMMENT_RE.source, 'g')
  re.lastIndex = start
  let last: string | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (m.index >= end) break
    const after = body.slice(m.index + m[0].length, end).replace(new RegExp(PAGE_COMMENT_RE.source, 'g'), '')
    if (!/\S/.test(after)) break
    if (m[1].startsWith('pdf')) continue
    last = m[1]
  }
  return last
}

/** 제목 후보 제외 줄을 굵게로 강등한 본문(위치 보존을 위해 길이 유지 안 함 — 분해 전에 한 번만 적용). */
function demoteNonHeadings(body: string, warnings: DecomposeWarning[]): string {
  const masked = maskCodeBlocks(body)
  const lines = body.split('\n')
  const maskedLines = masked.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const hm = maskedLines[i].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!hm) continue
    if (NON_HEADING_RE.test(hm[2])) {
      lines[i] = `**${lines[i].slice(hm[1].length).trim()}**`
      warnings.push({ kind: 'demoted_heading', slug: '', detail: `L${i + 1} ${hm[2].slice(0, 60)}` })
    }
  }
  return lines.join('\n')
}

function buildOutlinePages(
  body: string,
  meta: SourceFileMeta,
  warnings: DecomposeWarning[],
): PagePlan[] {
  const masked = maskCodeBlocks(body)
  const headings = extractHeadings(masked, meta.splitLevel)
  if (headings.length === 0) return []

  // 1) 트리 + 경로 세그먼트
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  const unnumberedCount = new Map<string, number>()
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]
    while (stack.length > 0 && stack[stack.length - 1].heading.level >= h.level) stack.pop()
    const parent = stack[stack.length - 1] ?? null
    const number = parseOutlineNumber(h.text)
    const parentSegs = parent ? parent.segs : []
    const parentKey = parentSegs.join('-')
    let seg: string
    if (number.kind === 'appendix-root') {
      seg = 'app'
    } else if (number.kind === 'appendix') {
      const underApp = parent?.segs.includes('app')
      const base = number.sub !== undefined ? String(number.sub) : String(number.value)
      // `[부록 1-2]`는 부모(◇ 부록1.)가 이미 app-1이므로 sub만, 부모가 부록 루트가 아니면 app-N 접두
      seg = underApp ? base : `app-${base}`
    } else if (number.kind === 'none') {
      const n = (unnumberedCount.get(parentKey) ?? 0) + 1
      unnumberedCount.set(parentKey, n)
      seg = `x${n}`
      warnings.push({ kind: 'unnumbered', slug: `${meta.slugPrefix}-${[...parentSegs, seg].join('-')}`, detail: h.text.slice(0, 60) })
    } else {
      seg = String(number.value)
    }
    // 같은 부모 아래 같은 세그먼트 → -d2, -d3 …(원본 번호 오류)
    const siblings = parent ? parent.children : roots
    let finalSeg = seg
    let d = 2
    while (siblings.some((s) => s.segs[s.segs.length - 1] === finalSeg)) {
      finalSeg = `${seg}-d${d}`
      d += 1
    }
    if (finalSeg !== seg) {
      warnings.push({ kind: 'dup_number', slug: `${meta.slugPrefix}-${[...parentSegs, finalSeg].join('-')}`, detail: `「${h.text.slice(0, 50)}」 번호 중복 → ${finalSeg}` })
    }
    // 자기 범위의 끝: 다음 제목 중 level ≤ 자기 level
    const next = headings.slice(i + 1).find((n) => n.level <= h.level)
    const endOffset = next ? next.offset : body.length
    const node: OutlineNode = {
      heading: h,
      number,
      segs: [...parentSegs, finalSeg],
      parent,
      children: [],
      preface: '',
      endOffset,
    }
    siblings.push(node)
    stack.push(node)
  }

  // 2) 서문(preface): 제목 다음 줄 ~ 첫 자식 제목 직전
  const walk = (node: OutlineNode) => {
    const bodyStart = body.indexOf('\n', node.heading.offset)
    const start = bodyStart < 0 ? body.length : bodyStart + 1
    const end = node.children.length > 0 ? node.children[0].heading.offset : node.endOffset
    node.preface = body.slice(start, end)
    node.children.forEach(walk)
  }
  roots.forEach(walk)

  // 3) 페이지 계획
  const plans: PagePlan[] = []
  let order = 0
  const pathOf = (n: OutlineNode | null): string => (n ? `${meta.slugPrefix}-${n.segs.join('-')}` : meta.slugPrefix)
  const pushPlan = (node: OutlineNode, bodyText: string, isOverview: boolean) => {
    const parentChain = ancestors(node)
    plans.push({
      slug: pathOf(node),
      title: node.heading.text,
      body: bodyText,
      parentHeadings: parentChain.map((a) => a.heading.text),
      parentPath: pathOf(node.parent),
      // 개요 페이지는 그 절 자체를 대표하므로 형제 그룹도 같은 부모 아래(일반 페이지와 동일)
      groupPath: pathOf(node.parent),
      endOffset: isOverview ? (node.children[0]?.heading.offset ?? node.endOffset) : node.endOffset,
      order: order++,
      isOverview,
      headingOffset: node.heading.offset,
      level: node.heading.level,
      numberKind: node.number.kind,
    })
  }
  const ancestors = (node: OutlineNode): OutlineNode[] => {
    const out: OutlineNode[] = []
    let p = node.parent
    while (p) { out.unshift(p); p = p.parent }
    return out
  }
  const visit = (node: OutlineNode) => {
    if (node.children.length === 0) {
      // 분해 단위(또는 자식이 없는 상위 제목) → 페이지
      pushPlan(node, node.preface, false)
      return
    }
    // 부모: 서문이 100자 이상이면 개요 페이지, 미만이면 첫 자식 앞에 붙인다
    if (textLength(stripPageComments(node.preface)) >= OVERVIEW_MIN_CHARS) {
      pushPlan(node, node.preface, true)
      warnings.push({ kind: 'overview', slug: `${meta.slugPrefix}-${node.segs.join('-')}`, detail: node.heading.text.slice(0, 60) })
    } else if (textLength(stripPageComments(node.preface)) > 0) {
      // 100자 미만 서문은 첫 자식 앞에 붙이되 어느 절의 서문인지 라벨을 단다(2차 검수 9·27번: 「1) 장애정도」
      // 첫 줄이 「2. 장애인교원의 구분」 도입문이라 위치가 어긋나 보였다). 쪽 주석은 라벨 블록 밖(앞)에 남겨
      // 쪽 계산이 그대로 되게 한다.
      const comments = [...node.preface.matchAll(new RegExp(PAGE_COMMENT_RE.source, 'g'))].map((m) => m[0])
      const quoted = stripPageComments(node.preface).trim().split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')
      const labeled = `> 「${node.heading.text}」 서문\n>\n${quoted}`
      node.children[0].preface = [...comments, labeled].join('\n') + '\n\n' + node.children[0].preface
    }
    node.children.forEach(visit)
  }
  roots.forEach(visit)
  return plans
}

// ---------- article 스킴 (단체협약, 종전 로직) ----------

interface RawSection {
  heading: HeadingMatch
  body: string
  parentHeadings: HeadingMatch[]
}

function buildArticleSections(body: string, splitLevel: number): RawSection[] {
  const masked = maskCodeBlocks(body)
  const headings = extractHeadings(masked, splitLevel)
  if (headings.length === 0) return []
  const sections: RawSection[] = []
  const parentStack: HeadingMatch[] = []
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= h.level) parentStack.pop()
    if (h.level < splitLevel) { parentStack.push(h); continue }
    const next = headings.slice(i + 1).find((n) => n.level <= h.level)
    const endOffset = next ? next.offset : body.length
    const bodyStart = body.indexOf('\n', h.offset)
    const sectionBody = body.slice(bodyStart + 1, endOffset).trim()
    sections.push({ heading: h, body: sectionBody, parentHeadings: [...parentStack] })
  }
  return sections
}

function buildArticlePlans(body: string, meta: SourceFileMeta): PagePlan[] {
  const sections = buildArticleSections(body, meta.splitLevel)
  const usedSlugs = new Set<string>()
  const plans: PagePlan[] = []
  let fallbackIndex = 0
  let order = 0
  for (const section of sections) {
    if (section.body.replace(/\s+/g, '').length === 0) continue
    fallbackIndex += 1
    let baseSlug = makeArticleSlug(section.heading.text, meta, fallbackIndex)
    if (!SLUG_RE.test(baseSlug)) baseSlug = `${meta.slugPrefix}-p-${String(fallbackIndex).padStart(3, '0')}`
    let finalSlug = baseSlug
    if (usedSlugs.has(finalSlug)) {
      let n = 2
      while (usedSlugs.has(`${baseSlug}-${n}`)) n++
      finalSlug = `${baseSlug}-${n}`
    }
    usedSlugs.add(finalSlug)
    plans.push({
      slug: finalSlug,
      title: section.heading.text,
      body: section.body,
      parentHeadings: section.parentHeadings.map((h) => h.text),
      parentPath: meta.slugPrefix,
      groupPath: meta.slugPrefix,
      endOffset: section.heading.offset + section.body.length,
      order: order++,
      isOverview: false,
      headingOffset: section.heading.offset,
      level: section.heading.level,
      numberKind: 'none',
    })
  }
  return plans
}

// ---------- 후처리: 병합·분할·제목·관련 페이지 ----------

function outlineKindsAtOrAbove(plan: PagePlan, planKinds: Map<string, OutlineKind>): Set<OutlineKind> {
  const kinds = new Set<OutlineKind>()
  if (plan.numberKind !== 'none' && plan.numberKind !== 'appendix' && plan.numberKind !== 'appendix-root') kinds.add(plan.numberKind)
  const parentKind = planKinds.get(plan.parentPath)
  if (parentKind && parentKind !== 'none') kinds.add(parentKind)
  return kinds
}

function detectRangeViolations(body: string, kinds: Set<OutlineKind>): string[] {
  if (kinds.size === 0) return []
  const masked = maskCodeBlocks(body)
  const hits: string[] = []
  for (const line of masked.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('|') || t.startsWith('-') || t.startsWith('*') || t.startsWith('>')) continue
    const n = parseOutlineNumber(t)
    if (n.kind !== 'none' && kinds.has(n.kind)) hits.push(t.slice(0, 50))
  }
  return hits
}

// ---------- 단일 파일 분해 ----------

export function decomposeFile(args: {
  filePath: string
  imageManifest: ImageManifestEntry[]
  axisOverrides?: Record<string, ContentAxis>
}): DecomposeResult {
  const { filePath, axisOverrides = {} } = args
  const fileName = path.basename(filePath)
  const meta = SOURCE_FILE_MAP[fileName]
  if (!meta) {
    throw new Error(`SOURCE_FILE_MAP에 없는 파일: ${fileName}. scripts/decompose-source.ts 상단 매핑 표에 추가 필요.`)
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const { content: rawBody } = matter(fileContent)
  const warnings: DecomposeWarning[] = []

  let plans: PagePlan[]
  let body = rawBody
  if (meta.slugScheme === 'outline') {
    body = demoteNonHeadings(rawBody, warnings)
    plans = buildOutlinePages(body, meta, warnings)
  } else {
    plans = buildArticlePlans(body, meta)
  }

  // 쪽 정보(본문 제거 전에 계산)
  const pageInfo = new Map<string, { page?: string; end?: string; pdf?: number }>()
  for (const p of plans) {
    const start = findPageComment(body, p.headingOffset)
    const bodyStart = body.indexOf('\n', p.headingOffset) + 1
    const end = lastPageCommentIn(body, bodyStart, p.endOffset)
    // `pdf373` 같은 라벨은 인쇄 쪽이 아니므로 source_page_pdf로만 보낸다(BACKLOG C10)
    const page = start && !start.page.startsWith('pdf') ? start.page : undefined
    pageInfo.set(p.slug, { page, end: end ?? page, pdf: start?.pdf })
  }

  // 본문 정리: 쪽 주석 제거 + 제목 수준 정규화
  for (const p of plans) {
    p.body = normalizeBodyHeadings(stripPageComments(p.body))
  }

  // 제목 끝 쪽수 제거(source_page와 같을 때만)
  for (const p of plans) {
    const m = p.title.match(/^(.*\S)\s(\d{1,3})$/)
    const info = pageInfo.get(p.slug)
    if (m && info?.page && String(Number(info.page.replace(/^.*?(\d+)$/, '$1'))) === m[2]) {
      warnings.push({ kind: 'page_strip', slug: p.slug, detail: `「${p.title}」 → 「${m[1]}」` })
      p.title = m[1]
    }
  }

  // 결정 3 제외 문서: 페이지·관련 페이지 목록 모두에서 뺀다(2층 정본에는 남는다)
  plans = plans.filter((p) => {
    if (!EXCLUDED_SLUGS.has(p.slug)) return true
    warnings.push({ kind: 'excluded', slug: p.slug, detail: `「${p.title}」 위키·챗봇 제외(9/7 결정 3)` })
    return false
  })

  // 빈 조각 병합(100자 미만 → 다음 형제, 없으면 이전 형제). 개요 페이지는 이미 100자 이상.
  if (meta.slugScheme === 'outline') {
    const merged = new Set<string>()
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i]
      if (merged.has(p.slug)) continue
      if (textLength(p.body) >= MERGE_MAX_CHARS) continue
      const sibling = (dir: 1 | -1): PagePlan | undefined => {
        for (let j = i + dir; j >= 0 && j < plans.length; j += dir) {
          if (merged.has(plans[j].slug)) continue
          if (plans[j].parentPath === p.parentPath && !plans[j].isOverview) return plans[j]
          if (plans[j].level < p.level) break
        }
        return undefined
      }
      const target = sibling(1) ?? sibling(-1)
      if (!target) continue
      const demoted = p.body.replace(/^(#{2,5})(\s+\S)/gm, '#$1$2')
      const fragment = `## ${p.title}\n\n${demoted}`.trim()
      const targetIsAfter = target.order > p.order
      target.body = targetIsAfter ? `${fragment}\n\n${target.body}`.trim() : `${target.body}\n\n${fragment}`.trim()
      merged.add(p.slug)
      warnings.push({ kind: 'merged', slug: p.slug, detail: `「${p.title}」(${textLength(p.body)}자) → ${target.slug}` })
    }
    plans = plans.filter((p) => !merged.has(p.slug))
  }

  // 5.5만 자 분할(표 경계)
  const expanded: PagePlan[] = []
  for (const p of plans) {
    const { parts, oversizedTable } = splitLargeBody(p.body)
    if (parts.length === 1) { expanded.push(p); continue }
    if (oversizedTable) warnings.push({ kind: 'split', slug: p.slug, detail: '단일 표가 5.5만 자를 넘어 그 블록은 자르지 못함' })
    parts.forEach((part, idx) => {
      const clone: PagePlan = { ...p, slug: `${p.slug}-pt${idx + 1}`, title: `${p.title} (${idx + 1}/${parts.length})`, body: part }
      expanded.push(clone)
      pageInfo.set(clone.slug, pageInfo.get(p.slug) ?? {})
    })
    warnings.push({ kind: 'split', slug: p.slug, detail: `${parts.length}개로 분할` })
  }
  plans = expanded

  // 제목 유일성(출처 내): 중복 그룹을 구분해 주는 가장 얕은 조상 제목(번호 제거) 하나를
  // 접두로 붙인다(「뇌병변장애 고려 사항」). 부모 하나로 안 갈리면 한 단계 위 조상으로,
  // 그래도 안 갈리면 두 조상을 함께 붙인다.
  if (meta.slugScheme === 'outline') {
    const byTitle = new Map<string, PagePlan[]>()
    for (const p of plans) {
      const arr = byTitle.get(p.title) ?? []
      arr.push(p)
      byTitle.set(p.title, arr)
    }
    const prefixAt = (p: PagePlan, depth: number): string | undefined => {
      const h = p.parentHeadings[p.parentHeadings.length - depth]
      return h ? stripOutlineNumber(h) : undefined
    }
    for (const [, group] of byTitle) {
      if (group.length < 2) continue
      const candidates: Array<(p: PagePlan) => string | undefined> = [
        (p) => prefixAt(p, 1),
        (p) => prefixAt(p, 2),
        (p) => {
          const a = prefixAt(p, 2)
          const b = prefixAt(p, 1)
          return a && b ? `${a} ${b}` : undefined
        },
      ]
      let applied = false
      for (const cand of candidates) {
        const titles = group.map((p) => {
          const prefix = cand(p)
          return prefix ? `${prefix} ${p.title}` : p.title
        })
        if (new Set(titles).size === group.length) {
          group.forEach((p, i) => {
            if (titles[i] !== p.title) {
              warnings.push({ kind: 'title_dedup', slug: p.slug, detail: `「${p.title}」 → 「${titles[i]}」` })
              p.title = titles[i]
            }
          })
          applied = true
          break
        }
      }
      if (!applied) {
        for (const p of group) warnings.push({ kind: 'title_dedup', slug: p.slug, detail: `「${p.title}」 조상 접두로도 유일하지 않음` })
      }
    }
  }

  // 관련 페이지 블록: 같은 그룹(groupPath) 아래 형제. 부모의 개요 페이지가 있으면 첫 항목,
  // 형제 중 개요 페이지(자식을 가진 절)도 목록에 포함한다(설계 §3.4).
  if (meta.slugScheme === 'outline') {
    const byGroup = new Map<string, PagePlan[]>()
    for (const p of plans) {
      const arr = byGroup.get(p.groupPath) ?? []
      arr.push(p)
      byGroup.set(p.groupPath, arr)
    }
    const overviewBySlug = new Map(plans.filter((p) => p.isOverview).map((p) => [p.slug, p]))
    for (const p of plans) {
      const refs: PageRef[] = []
      const parentOverview = overviewBySlug.get(p.groupPath)
      if (parentOverview && parentOverview.slug !== p.slug) {
        refs.push({ slug: parentOverview.slug, title: parentOverview.title, page: pageInfo.get(parentOverview.slug)?.page })
      }
      for (const s of byGroup.get(p.groupPath) ?? []) {
        if (s.slug === p.slug) continue
        refs.push({ slug: s.slug, title: s.title, page: pageInfo.get(s.slug)?.page })
      }
      if (refs.length === 0) continue
      let shown = refs
      if (refs.length > RELATED_MAX) shown = [...refs.slice(0, RELATED_MAX / 2), ...refs.slice(-RELATED_MAX / 2)]
      const lines = shown.map((r) => `- [[${r.slug}|${linkLabel(r.title)}]]${r.page ? ` (원본 ${formatPage(r.page)})` : ''}`)
      p.body = `${p.body}\n\n## 관련 페이지\n\n${lines.join('\n')}`.trim()
    }
  }

  const planKinds = new Map(plans.map((p) => [p.slug, p.numberKind]))

  const pages: PageOutput[] = []
  const report: PageReport[] = []
  const unmatchedImages: Array<{ slug: string; pattern: string; lineNo: number }> = []
  const usedSlugs = new Set<string>()

  for (const plan of plans) {
    const finalSlug = plan.slug
    if (!SLUG_RE.test(finalSlug)) {
      throw new Error(`[decompose] 주소가 kebab-case가 아님: '${finalSlug}' (제목 「${plan.title}」). 순번 fallback은 없으므로 번호 파서를 고쳐야 한다.`)
    }
    if (usedSlugs.has(finalSlug)) {
      throw new Error(`[decompose] 주소 중복: '${finalSlug}' (제목 「${plan.title}」). 경로 체계상 생길 수 없는 충돌 — 번호 파서·-d 규칙 점검.`)
    }
    usedSlugs.add(finalSlug)

    if (meta.slugScheme === 'outline') {
      const hits = detectRangeViolations(plan.body, outlineKindsAtOrAbove(plan, planKinds))
      for (const h of hits) warnings.push({ kind: 'range', slug: finalSlug, detail: h })
    }

    const { body: processedBody, imagePatternCount, todoMarkers } = processBodyImages(
      plan.body,
      meta.sourceOrigin,
      unmatchedImages,
      finalSlug,
    )

    const headingPath = [...plan.parentHeadings, plan.title]
    const bodySample = plan.body.slice(0, 500)
    const inferredDomains = inferDomainsForSection(headingPath, bodySample)
    const hasInferredDomains = inferredDomains.length > 0
    const finalDomains: Frontmatter['domains'] = hasInferredDomains ? inferredDomains : ['정책법령']
    // 장애유형은 앞 500자가 아니라 본문 전체로 판정한다(2차 검수 20·39번: 뒤쪽 청각·지체 절이 빠졌다)
    // 관련 페이지 목록의 형제 제목(「(1) 지체장애」 등)은 판정 재료가 아니다(간장애 문서에 「지체」가 붙던 원인)
    const inferredDts = inferDisabilityTypes(headingPath, plan.body.replace(/\n## 관련 페이지\n[\s\S]*$/, ''), meta.defaultDisabilityTypes)
    const inferredRegions = inferRegions(plan.body)

    const lowConfidenceFields: string[] = []
    if (!hasInferredDomains) lowConfidenceFields.push('domains')
    if (
      inferredDts.length === 1
      && inferredDts[0] === '전체'
      && headingPath.some((h) => /(시각|청각|지체|뇌병변|발달|내부장애)/.test(h))
    ) {
      lowConfidenceFields.push('disability_types')
    }
    if (inferredRegions.length === 1 && inferredRegions[0] === '전국') {
      if (/(시·도교육청|시도교육청|지역|광역|특별시|광역시)/.test(plan.body)) lowConfidenceFields.push('regions')
    }

    const { axis: heuristicAxis, confidence: axisConfidence } = pickAxis(meta, {
      type: meta.docType,
      disability_types: inferredDts,
      regions: inferredRegions,
      domains: hasInferredDomains ? inferredDomains : ([] as Frontmatter['domains']),
    })

    const overrideAxis = axisOverrides[finalSlug]
    if (overrideAxis && meta.forcedAxis && overrideAxis !== meta.forcedAxis) {
      process.stderr.write(
        `[decompose] FATAL: axis override가 forcedAxis와 충돌 — slug='${finalSlug}', ` +
        `forcedAxis='${meta.forcedAxis}', override='${overrideAxis}' (source=${meta.sourceOrigin})\n` +
        `         forcedAxis source의 페이지는 override 금지. _axis-overrides.json에서 해당 항목 제거.\n`,
      )
      process.exit(2)
    }
    const axis: ContentAxis = overrideAxis ?? heuristicAxis
    const isOverridden = overrideAxis !== undefined && overrideAxis !== heuristicAxis
    if (isOverridden) lowConfidenceFields.push(`axis-overridden:${heuristicAxis}->${overrideAxis}`)

    const confidence: 'high' | 'medium' | 'low' =
      isOverridden
        ? 'high'
        : lowConfidenceFields.length === 0 && axisConfidence === 'high'
          ? 'high'
          : axisConfidence === 'low' || lowConfidenceFields.length >= 2
            ? 'low'
            : 'medium'

    const info = pageInfo.get(finalSlug) ?? {}
    const fm: Frontmatter = {
      title: plan.title,
      type: meta.docType,
      disability_types: inferredDts,
      domains: finalDomains,
      regions: inferredRegions,
      year: meta.year,
      status: 'draft',
      source: meta.source,
      source_origin: meta.sourceOrigin,
      parent_headings: plan.parentHeadings,
      ...(info.page ? { source_page: info.page } : {}),
      ...(info.end && info.end !== info.page ? { source_page_end: info.end } : {}),
      ...(info.pdf ? { source_page_pdf: info.pdf } : {}),
      authors: [],
      reviewed_by: [],
      references: [],
      accessibility: {
        alt_text_complete: imagePatternCount === 0,
        captions_available: false,
        reading_level: 'standard',
        audio_tts_ready: false,
      },
    }

    const relativePath = `content/${axis}/${finalSlug}.md`
    pages.push({
      outputPath: path.join(REPO_ROOT, relativePath),
      relativePath,
      slug: finalSlug,
      axis,
      frontmatter: fm,
      body: processedBody,
      confidence,
      lowConfidenceFields,
      imagePatternCount,
    })
    report.push({ slug: finalSlug, relativePath, axis, confidence, lowConfidenceFields, unmatchedImages: 0, todoMarkers })
  }

  for (const item of unmatchedImages) {
    const r = report.find((r) => r.slug === item.slug)
    if (r) r.unmatchedImages += 1
  }

  return { sourceOrigin: meta.sourceOrigin, pages, report, unmatchedImages, slugCollisions: [], warnings }
}

/** 위키링크 표시명에 `]`·`|`가 들어가면 링크 구문이 깨지므로 전각 괄호·슬래시로 바꾼다(frontmatter title은 원문 유지). */
function linkLabel(title: string): string {
  return title.replace(/\[/g, '〔').replace(/\]/g, '〕').replace(/\|/g, '/')
}

/** `<!-- p.X -->`의 X를 사람이 읽는 표기로: 숫자 → N쪽, pdfN → PDF N쪽, Ⅰ-3 같은 장 쪽수 → 그대로 */
function formatPage(page: string): string {
  const pdf = page.match(/^pdf(\d+)$/i)
  if (pdf) return `PDF ${pdf[1]}쪽`
  return `${page}쪽`
}

// ---------- 마크다운 출력 ----------

function serializeFrontmatter(fm: Frontmatter): string {
  const lines: string[] = ['---']
  lines.push(`title: ${JSON.stringify(fm.title)}`)
  lines.push(`type: ${fm.type}`)
  lines.push(`disability_types: [${fm.disability_types.map((v) => JSON.stringify(v)).join(', ')}]`)
  lines.push(`domains: [${fm.domains.map((v) => JSON.stringify(v)).join(', ')}]`)
  lines.push(`regions: [${fm.regions.map((v) => JSON.stringify(v)).join(', ')}]`)
  lines.push(`year: ${fm.year}`)
  lines.push(`status: ${fm.status}`)
  lines.push('source:')
  lines.push(`  organization: ${JSON.stringify(fm.source.organization)}`)
  lines.push(`  citation: ${JSON.stringify(fm.source.citation)}`)
  if (fm.source.url) lines.push(`  url: ${JSON.stringify(fm.source.url)}`)
  lines.push(`source_origin: ${JSON.stringify(fm.source_origin)}`)
  const parentHeadings = fm.parent_headings ?? []
  if (parentHeadings.length === 0) {
    lines.push('parent_headings: []')
  } else {
    lines.push(`parent_headings: [${parentHeadings.map((v) => JSON.stringify(v)).join(', ')}]`)
  }
  if (fm.source_page) lines.push(`source_page: ${JSON.stringify(fm.source_page)}`)
  if (fm.source_page_end) lines.push(`source_page_end: ${JSON.stringify(fm.source_page_end)}`)
  if (fm.source_page_pdf) lines.push(`source_page_pdf: ${fm.source_page_pdf}`)
  lines.push('reviewed_by: []')
  lines.push('references: []')
  lines.push('accessibility:')
  lines.push(`  alt_text_complete: ${fm.accessibility?.alt_text_complete ?? false}`)
  lines.push(`  captions_available: ${fm.accessibility?.captions_available ?? false}`)
  lines.push(`  reading_level: ${fm.accessibility?.reading_level ?? 'standard'}`)
  lines.push(`  audio_tts_ready: ${fm.accessibility?.audio_tts_ready ?? false}`)
  lines.push('---')
  return lines.join('\n')
}

function writePage(page: PageOutput): void {
  const fm = serializeFrontmatter(page.frontmatter)
  const content = `${fm}\n\n# ${page.frontmatter.title}\n\n${page.body}\n`
  fs.mkdirSync(path.dirname(page.outputPath), { recursive: true })
  fs.writeFileSync(page.outputPath, content, 'utf-8')
}

// ---------- 리포트 ----------

const WARNING_LABEL: Record<DecomposeWarning['kind'], string> = {
  range: '제목 범위 밖 번호(2층 승격 누락 의심)',
  dup_number: '같은 경로에 같은 번호(-d 접미)',
  merged: '빈 조각 병합(100자 미만)',
  split: '5.5만 자 분할',
  overview: '개요 페이지(부모 서문 100자 이상)',
  demoted_heading: '제목 후보 제외(굵게 강등)',
  unnumbered: '번호 없는 제목(x<n>)',
  title_dedup: '제목 중복 해소(부모 접두)',
  page_strip: '제목 끝 쪽수 제거',
}

function writeReport(allResults: DecomposeResult[]): void {
  const lines: string[] = []
  lines.push('# webfortd 출처 마크다운 분해 리포트')
  lines.push('')
  lines.push('자동 생성. `tsx scripts/decompose-source.ts` 실행 결과. 규칙 정본: `docs/DECOMPOSE_V2_DESIGN.md`.')
  lines.push('')
  for (const result of allResults) {
    lines.push(`## ${result.sourceOrigin}`)
    lines.push('')
    lines.push(`- 분해 페이지: ${result.pages.length}개`)
    lines.push(`- 이미지 미매칭: ${result.unmatchedImages.length}건`)
    const byAxis = new Map<string, number>()
    const byConfidence = new Map<string, number>()
    let totalChars = 0
    for (const p of result.pages) {
      byAxis.set(p.axis, (byAxis.get(p.axis) ?? 0) + 1)
      byConfidence.set(p.confidence, (byConfidence.get(p.confidence) ?? 0) + 1)
      totalChars += p.body.length
    }
    lines.push(`- axis 분포: ${[...byAxis.entries()].map(([a, n]) => `${a}=${n}`).join(', ')}`)
    lines.push(`- 신뢰도 분포: ${[...byConfidence.entries()].map(([c, n]) => `${c}=${n}`).join(', ')}`)
    lines.push(`- 평균 본문 길이: ${result.pages.length ? Math.round(totalChars / result.pages.length) : 0}자`)
    lines.push('')
    const byKind = new Map<DecomposeWarning['kind'], DecomposeWarning[]>()
    for (const w of result.warnings) {
      const arr = byKind.get(w.kind) ?? []
      arr.push(w)
      byKind.set(w.kind, arr)
    }
    for (const kind of Object.keys(WARNING_LABEL) as DecomposeWarning['kind'][]) {
      const arr = byKind.get(kind)
      if (!arr || arr.length === 0) continue
      lines.push(`### ${WARNING_LABEL[kind]} (${arr.length}건)`)
      lines.push('')
      for (const w of arr.slice(0, 40)) lines.push(`- \`${w.slug || '-'}\` — ${w.detail}`)
      if (arr.length > 40) lines.push(`- ... 외 ${arr.length - 40}건`)
      lines.push('')
    }
    const lowPages = result.pages.filter((p) => p.confidence === 'low')
    if (lowPages.length > 0) {
      lines.push('### 신뢰도 low 페이지 (검수 우선)')
      lines.push('')
      for (const p of lowPages) lines.push(`- \`${p.relativePath}\` — 낮은 필드: ${p.lowConfidenceFields.join(', ') || '(없음, axis만 low)'}`)
      lines.push('')
    }
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n', 'utf-8')
}

// ---------- --reset 처리 ----------

function resetSourcePages(sourceOrigin: string): number {
  let count = 0
  for (const axis of CONTENT_AXES) {
    const dir = path.join(CONTENT_DIR, axis)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue
      const full = path.join(dir, entry)
      const content = fs.readFileSync(full, 'utf-8')
      try {
        const parsed = matter(content)
        if ((parsed.data as { source_origin?: string }).source_origin === sourceOrigin) {
          fs.unlinkSync(full)
          count += 1
        }
      } catch {
        // skip on parse error
      }
    }
  }
  return count
}

// ---------- 매니페스트 로딩 ----------

function loadAxisOverrides(): Record<string, ContentAxis> {
  if (!fs.existsSync(AXIS_OVERRIDES_PATH)) return {}
  try {
    const raw = JSON.parse(fs.readFileSync(AXIS_OVERRIDES_PATH, 'utf-8'))
    const overrides = raw.overrides ?? {}
    const validated: Record<string, ContentAxis> = {}
    for (const [slug, axis] of Object.entries(overrides)) {
      if (typeof axis !== 'string' || !(CONTENT_AXES as readonly string[]).includes(axis)) {
        process.stderr.write(`[decompose] _axis-overrides.json 잘못된 axis 값: '${slug}' → '${axis}'\n`)
        process.exit(2)
      }
      validated[slug] = axis as ContentAxis
    }
    return validated
  } catch (e) {
    process.stderr.write(`[decompose] _axis-overrides.json 파싱 실패: ${(e as Error).message}\n`)
    process.exit(2)
  }
}

function loadImageManifest(): ImageManifestEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  } catch (e) {
    process.stderr.write(`[decompose] manifest.json 파싱 실패 — 빈 매니페스트로 진행: ${(e as Error).message}\n`)
    return []
  }
}

// ---------- CLI 엔트리 ----------

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const reset = argv.includes('--reset')
  const includeFrozen = argv.includes('--include-frozen')
  const fileArgIdx = argv.indexOf('--file')
  const fileArg = fileArgIdx >= 0 ? argv[fileArgIdx + 1] : null

  // SOURCE_FILE_MAP prefix 충돌 검사 (codex-rescue P1 #4)
  const seenPrefixes = new Map<string, string>()
  for (const [fileName, meta] of Object.entries(SOURCE_FILE_MAP)) {
    const prev = seenPrefixes.get(meta.slugPrefix)
    if (prev) {
      process.stderr.write(`[decompose] SOURCE_FILE_MAP prefix 충돌: '${meta.slugPrefix}' — ${prev} vs ${fileName}\n`)
      process.exit(2)
    }
    seenPrefixes.set(meta.slugPrefix, fileName)
  }

  const manifestEntries = loadImageManifest()
  const axisOverrides = loadAxisOverrides()
  if (Object.keys(axisOverrides).length > 0) {
    process.stdout.write(`[decompose] axis 오버라이드 ${Object.keys(axisOverrides).length}건 로드 (content/_axis-overrides.json)\n`)
  }

  let inputFiles: string[]
  if (fileArg) {
    inputFiles = [path.isAbsolute(fileArg) ? fileArg : path.join(REPO_ROOT, fileArg)]
  } else {
    if (!fs.existsSync(SOURCE_MD_DIR)) {
      process.stderr.write(`[decompose] ${SOURCE_MD_DIR} 가 없습니다.\n`)
      process.exit(1)
    }
    inputFiles = fs
      .readdirSync(SOURCE_MD_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => path.join(SOURCE_MD_DIR, f))
  }

  process.stdout.write(`[decompose] 입력 파일 ${inputFiles.length}개\n`)
  process.stdout.write(`[decompose] 매니페스트 엔트리 ${manifestEntries.length}개\n`)
  if (dryRun) process.stdout.write('[decompose] DRY RUN — 파일 쓰기 없음\n')
  if (reset) process.stdout.write('[decompose] --reset 활성 — source_origin 일치 파일 사전 삭제\n')

  const allResults: DecomposeResult[] = []

  for (const filePath of inputFiles) {
    const fileName = path.basename(filePath)
    const meta = SOURCE_FILE_MAP[fileName]
    if (!meta) {
      process.stderr.write(`[decompose] SKIP ${fileName} (SOURCE_FILE_MAP에 없음)\n`)
      continue
    }
    const writable = !meta.frozen || includeFrozen
    if (!writable && !dryRun) {
      process.stdout.write(`[decompose] SKIP ${fileName} (frozen — 편집기 커밋 보호. 다시 쓰려면 --include-frozen)\n`)
      continue
    }
    if (reset && !dryRun) {
      const removed = resetSourcePages(meta.sourceOrigin)
      process.stdout.write(`[decompose] reset: ${meta.sourceOrigin} → ${removed}개 삭제\n`)
    }
    const result = decomposeFile({ filePath, imageManifest: manifestEntries, axisOverrides })
    allResults.push(result)
    const count = (k: DecomposeWarning['kind']) => result.warnings.filter((w) => w.kind === k).length
    const avg = result.pages.length ? Math.round(result.pages.reduce((s, p) => s + p.body.length, 0) / result.pages.length) : 0
    process.stdout.write(
      `[decompose] ${fileName} → ${result.pages.length}개 페이지(평균 ${avg}자), 개요 ${count('overview')}, 병합 ${count('merged')}, 분할 ${count('split')}, ` +
      `범위 경고 ${count('range')}, 번호 중복 ${count('dup_number')}, 번호 없음 ${count('unnumbered')}, 제목 중복 해소 ${count('title_dedup')}, 제외 ${count('excluded')}, 이미지 ${result.unmatchedImages.length}건\n`,
    )
    if (!dryRun) {
      for (const page of result.pages) writePage(page)
    } else {
      const largest = [...result.pages].sort((a, b) => b.body.length - a.body.length).slice(0, 8)
      process.stdout.write(`           가장 긴 페이지: ${largest.map((p) => `${p.slug}(${p.body.length})`).join(', ')}\n`)
    }
  }

  // 글로벌 path 유일성 검사 (codex-rescue P1 #4)
  const pathSeen = new Map<string, string>()
  for (const r of allResults) {
    for (const p of r.pages) {
      const prev = pathSeen.get(p.relativePath)
      if (prev) {
        process.stderr.write(`[decompose] 글로벌 path 충돌: ${p.relativePath} — ${prev} (source A) vs ${r.sourceOrigin} (source B)\n`)
        process.exit(3)
      }
      pathSeen.set(p.relativePath, r.sourceOrigin)
    }
  }

  // axis override stale slug 검출 (codex-rescue M4 P1 #1) — 전체 실행에서만
  if (!fileArg && Object.keys(axisOverrides).length > 0) {
    const allSlugs = new Set<string>()
    for (const r of allResults) for (const p of r.pages) allSlugs.add(p.slug)
    // 이번 실행에서 건너뛴(frozen) 출처의 키는 판정 대상이 아니다.
    const processed = new Set(allResults.map((r) => r.sourceOrigin))
    const skippedPrefixes = Object.values(SOURCE_FILE_MAP)
      .filter((m) => !processed.has(m.sourceOrigin))
      .map((m) => `${m.slugPrefix}-`)
    const staleKeys = Object.keys(axisOverrides).filter(
      (k) => !allSlugs.has(k) && !skippedPrefixes.some((p) => k.startsWith(p)),
    )
    if (staleKeys.length > 0) {
      process.stderr.write(`[decompose] FATAL: _axis-overrides.json에 분해 결과와 매칭 안 되는 slug ${staleKeys.length}건:\n`)
      for (const k of staleKeys) process.stderr.write(`         · '${k}' → '${axisOverrides[k]}'\n`)
      process.stderr.write(`         오타이거나 source 변경으로 slug가 사라진 경우. _axis-overrides.json에서 항목 제거 또는 정정.\n`)
      process.exit(4)
    }
  }

  if (!dryRun) {
    writeReport(allResults)
    process.stdout.write(`[decompose] 리포트: ${path.relative(REPO_ROOT, REPORT_PATH)}\n`)
  } else {
    let totalPages = 0
    let totalLow = 0
    let totalMedium = 0
    for (const r of allResults) {
      totalPages += r.pages.length
      totalLow += r.pages.filter((p) => p.confidence === 'low').length
      totalMedium += r.pages.filter((p) => p.confidence === 'medium').length
    }
    process.stdout.write(`[decompose] DRY RUN 요약 — 페이지 ${totalPages}, low ${totalLow}, medium ${totalMedium}\n`)
  }
}

main().catch((e) => {
  process.stderr.write(`[decompose] 실패: ${(e as Error).message}\n${(e as Error).stack}\n`)
  process.exit(1)
})
