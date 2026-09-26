import matter from 'gray-matter'

// ---------- 원문 위치 추적 텍스트 ----------
//
// 청크 텍스트는 전처리(쪽 머리 제거·관련 페이지 제거·위키링크 치환·문장 경계 공백 정규화)를
// 거치므로 원문의 부분 문자열이 아니다. 그래서 글자마다 원문 위치를 함께 들고 다닌다.
// `map[i]`는 `text[i]`가 온 원문 위치(JS 문자열 인덱스, UTF-16 코드 단위)이고, 치환·결합으로
// 새로 생긴 글자는 가장 가까운 원문 글자의 위치를 물려받는다.
//
// 청크의 `char_start`/`char_end`는 **마크다운 파일 원문 전체(frontmatter 포함)** 기준의
// 반열린 구간 [start, end)다. `raw.slice(char_start, char_end)`가 그 청크가 온 원문 구간이다.

export interface MappedText {
  text: string
  map: number[]
}

function identity(text: string, offset = 0): MappedText {
  return { text, map: Array.from({ length: text.length }, (_, i) => offset + i) }
}

function mslice(m: MappedText, start: number, end = m.text.length): MappedText {
  return { text: m.text.slice(start, end), map: m.map.slice(start, end) }
}

/** 조각을 `sep`로 잇는다. 구분자 글자는 앞 조각의 마지막 원문 위치를 물려받는다. */
function mjoin(parts: MappedText[], sep: string): MappedText {
  let text = ''
  const map: number[] = []
  parts.forEach((p, i) => {
    if (i > 0 && sep) {
      const anchor = map.length > 0 ? map[map.length - 1] : (p.map[0] ?? 0)
      text += sep
      for (let k = 0; k < sep.length; k++) map.push(anchor)
    }
    text += p.text
    map.push(...p.map)
  })
  return { text, map }
}

function mtrim(m: MappedText): MappedText {
  const lead = m.text.length - m.text.trimStart().length
  const trail = m.text.length - m.text.trimEnd().length
  return mslice(m, lead, Math.max(lead, m.text.length - trail))
}

function globalize(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
}

/** `String.prototype.split(regex)`와 같은 결과(캡처 그룹 없는 정규식 전제)를 위치와 함께 낸다. */
function msplit(m: MappedText, re: RegExp): MappedText[] {
  const g = globalize(re)
  const out: MappedText[] = []
  let last = 0
  for (const match of m.text.matchAll(g)) {
    if (match[0].length === 0) continue
    out.push(mslice(m, last, match.index))
    last = match.index + match[0].length
  }
  out.push(mslice(m, last))
  return out
}

/**
 * 정규식 치환. `fn`은 대체 문자열과, 대체 글자들이 원문 매치의 몇 번째 글자부터 대응하는지(`from`)를 낸다.
 */
function mreplace(
  m: MappedText,
  re: RegExp,
  fn: (match: RegExpMatchArray) => { text: string; from?: number },
): MappedText {
  const g = globalize(re)
  let text = ''
  const map: number[] = []
  let last = 0
  for (const match of m.text.matchAll(g)) {
    const start = match.index
    const len = match[0].length
    text += m.text.slice(last, start)
    map.push(...m.map.slice(last, start))
    const rep = fn(match)
    const from = rep.from ?? 0
    for (let k = 0; k < rep.text.length; k++) {
      map.push(m.map[start + Math.min(from + k, Math.max(len - 1, 0))] ?? m.map[start] ?? 0)
    }
    text += rep.text
    last = start + len
  }
  text += m.text.slice(last)
  map.push(...m.map.slice(last))
  return { text, map }
}

// ---------- 전처리 ----------

export function stripFrontmatter(raw: string): string {
  const { content } = matter(raw)
  return content.trim()
}

/** frontmatter를 뺀 본문을 원문 위치와 함께 낸다. 본문 위치를 확정할 수 없으면 null. */
function bodyWithOffsets(raw: string): MappedText | null {
  const { content } = matter(raw)
  const offset = raw.endsWith(content) ? raw.length - content.length : raw.indexOf(content)
  if (offset < 0) return null
  return mtrim(identity(content, offset))
}

const PAGE_HEADER_RE = /<page_header>[^<]*<\/page_header>/g
const EXCESS_NEWLINES_RE = /\n{3,}/g

function stripPageHeadersMapped(m: MappedText): MappedText {
  return mreplace(mreplace(m, PAGE_HEADER_RE, () => ({ text: '' })), EXCESS_NEWLINES_RE, () => ({
    text: '\n\n',
  }))
}

export function stripPageHeaders(body: string): string {
  return stripPageHeadersMapped(identity(body)).text
}

/**
 * `## 관련 페이지` 블록(3층 분해가 붙이는 상위·하위·형제 링크 목록)을 다음 `#`·`##` 헤딩 전까지 뺀다.
 * 링크 목록은 문서 내용이 아니라 탐색 장치라 임베딩하면 검색 신호를 흐린다.
 */
const RELATED_PAGES_RE = /^## 관련 페이지[^\n]*(?:\n[\s\S]*?)?(?=^#{1,2} |(?![\s\S]))/gm

function stripRelatedPagesMapped(m: MappedText): MappedText {
  return mreplace(m, RELATED_PAGES_RE, () => ({ text: '' }))
}

export function stripRelatedPages(body: string): string {
  return stripRelatedPagesMapped(identity(body)).text
}

/** 위키링크 `[[slug]]`·`[[slug#anchor]]`·`[[slug|표시명]]`을 표시 글자로 바꾼다(`kb-mdx.ts`와 같은 규칙: 표시명, 없으면 slug). */
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

function replaceWikilinksMapped(m: MappedText): MappedText {
  return mreplace(m, WIKILINK_RE, (match) => {
    const label = match[3]
    if (label !== undefined) {
      const labelAt = match[0].lastIndexOf('|') + 1
      const lead = label.length - label.trimStart().length
      return { text: label.trim(), from: labelAt + lead }
    }
    const slug = match[1]
    return { text: slug.trim(), from: 2 + (slug.length - slug.trimStart().length) }
  })
}

export function replaceWikilinks(body: string): string {
  return replaceWikilinksMapped(identity(body)).text
}

// ---------- 섹션 분할 ----------

export interface RawSection {
  section: string
  text: string
}

interface MappedSection {
  section: string
  text: MappedText
}

const H2_LINE_RE = /^## .*$/gm

function splitByH2Mapped(body: MappedText): MappedSection[] {
  const bounds: { at: number; section: string }[] = [{ at: 0, section: '(no-section)' }]
  for (const match of body.text.matchAll(H2_LINE_RE)) {
    if (match.index === 0) bounds[0] = { at: 0, section: match[0].trim() }
    else bounds.push({ at: match.index, section: match[0].trim() })
  }
  const sections: MappedSection[] = []
  bounds.forEach((b, i) => {
    const end = i + 1 < bounds.length ? bounds[i + 1].at : body.text.length
    const text = mtrim(mslice(body, b.at, end))
    if (text.text) sections.push({ section: b.section, text })
  })
  return sections
}

export function splitByH2(body: string): RawSection[] {
  return splitByH2Mapped(identity(body)).map((s) => ({ section: s.section, text: s.text.text }))
}

// ---------- 청크 ----------

export interface ChunkMetadata {
  slug: string
  title: string
  axis: string
  type: string
  section: string
  chunk_index: number
  source_origin: string | null
}

export interface Chunk {
  text: string
  metadata: ChunkMetadata
  /** 마크다운 파일 원문(frontmatter 포함) 기준 반열린 구간 [char_start, char_end). 위치를 확정할 수 없으면 null. */
  char_start: number | null
  char_end: number | null
}

export type ChunkDocumentInput = Omit<ChunkMetadata, 'section' | 'chunk_index'>

export function chunkDocument(raw: string, meta: ChunkDocumentInput): Chunk[] {
  const located = bodyWithOffsets(raw)
  const body = located ?? identity(stripFrontmatter(raw))
  const prepared = replaceWikilinksMapped(stripRelatedPagesMapped(stripPageHeadersMapped(body)))
  const sections = applyCharLimitsMapped(splitByH2Mapped(prepared))

  return sections.map((sec, i) => ({
    text: sec.text.text,
    metadata: {
      slug: meta.slug,
      title: meta.title,
      axis: meta.axis,
      type: meta.type,
      section: sec.section,
      chunk_index: i,
      source_origin: meta.source_origin,
    },
    char_start: located && sec.text.map.length > 0 ? Math.min(...sec.text.map) : null,
    char_end: located && sec.text.map.length > 0 ? Math.max(...sec.text.map) + 1 : null,
  }))
}

export const MAX_CHUNK_CHARS = 800
export const MIN_CHUNK_CHARS = 50

/**
 * 문장 경계 후보 정규식 — 한국어/영어 마침표·물음표·느낌표·전각부호·줄바꿈
 * lookbehind: 부호 뒤에서만 split (부호는 직전 문장에 붙어 남음)
 */
const SENTENCE_BOUNDARY = /(?<=[\.!\?。！？\n])\s+/

/**
 * 800자 초과 단일 문단을 sentence boundary 단위로 split.
 * sentence가 여전히 800자 초과면 hard char-slice fallback.
 * hard slice path는 모든 글자 보존. sentence split path는 경계 공백이 단일 공백으로 정규화된다.
 */
function splitLongParagraphMapped(p: MappedText): MappedText[] {
  if (p.text.length === 0) return []
  if (p.text.length <= MAX_CHUNK_CHARS) return [p]

  // 1단계: sentence boundary로 split
  const sentences = msplit(p, SENTENCE_BOUNDARY).filter((s) => s.text.length > 0)
  const merged: MappedText[] = []
  let buf: MappedText | null = null
  for (const s of sentences) {
    const candidate: MappedText = buf ? mjoin([buf, s], ' ') : s
    if (candidate.text.length > MAX_CHUNK_CHARS && buf) {
      merged.push(buf)
      buf = s
    } else {
      buf = candidate
    }
  }
  if (buf && buf.text) merged.push(buf)

  // 2단계: 여전히 cap 초과면 hard slice
  const final: MappedText[] = []
  for (const chunk of merged) {
    if (chunk.text.length <= MAX_CHUNK_CHARS) {
      final.push(chunk)
    } else {
      for (let i = 0; i < chunk.text.length; i += MAX_CHUNK_CHARS) {
        final.push(mslice(chunk, i, i + MAX_CHUNK_CHARS))
      }
    }
  }
  return final
}

export function splitLongParagraph(p: string): string[] {
  return splitLongParagraphMapped(identity(p)).map((m) => m.text)
}

function applyCharLimitsMapped(sections: MappedSection[]): MappedSection[] {
  const result: MappedSection[] = []
  let buffer: MappedSection | null = null

  for (const sec of sections) {
    // 큰 섹션은 문단(빈 줄) 단위로 800자 cap 적용
    if (sec.text.text.length > MAX_CHUNK_CHARS) {
      if (buffer) {
        result.push(buffer)
        buffer = null
      }
      const paragraphs = msplit(sec.text, /\n\n+/)
      let chunk: MappedText | null = null
      for (const p of paragraphs) {
        // M1 carry #1: 단일 문단이 cap 초과면 split 후 각각 처리
        const pieces = splitLongParagraphMapped(p)
        for (const piece of pieces) {
          if (chunk && chunk.text && chunk.text.length + 2 + piece.text.length > MAX_CHUNK_CHARS) {
            result.push({ section: sec.section, text: mtrim(chunk) })
            chunk = piece
          } else {
            chunk = chunk && chunk.text ? mjoin([chunk, piece], '\n\n') : piece
          }
        }
      }
      if (chunk && chunk.text.trim()) result.push({ section: sec.section, text: mtrim(chunk) })
      continue
    }

    // 작은 섹션은 buffer에 누적, MIN 이상이면 flush
    if (!buffer) {
      buffer = { ...sec }
    } else {
      buffer = { section: buffer.section, text: mjoin([buffer.text, sec.text], '\n\n') }
      // 첫 섹션 라벨 유지 — 검색·인용에 우호적
    }
    if (buffer.text.text.length >= MIN_CHUNK_CHARS) {
      result.push(buffer)
      buffer = null
    }
  }
  if (buffer) result.push(buffer)
  return result
}

export function applyCharLimits(sections: RawSection[]): RawSection[] {
  return applyCharLimitsMapped(
    sections.map((s) => ({ section: s.section, text: identity(s.text) })),
  ).map((s) => ({ section: s.section, text: s.text.text }))
}
