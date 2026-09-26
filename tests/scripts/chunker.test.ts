import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripFrontmatter, stripPageHeaders, stripRelatedPages, replaceWikilinks, splitByH2, applyCharLimits, MAX_CHUNK_CHARS, MIN_CHUNK_CHARS, chunkDocument } from '../../scripts/lib/chunker.ts'

test('stripFrontmatter — frontmatter 블록 제거', () => {
  const input = '---\nslug: foo\ntitle: bar\n---\n\n본문 내용입니다.'
  const result = stripFrontmatter(input)
  assert.equal(result, '본문 내용입니다.')
})

test('stripFrontmatter — frontmatter 없으면 원본 반환', () => {
  const input = '본문만 있음'
  assert.equal(stripFrontmatter(input), '본문만 있음')
})

test('stripPageHeaders — <page_header> 태그 제거', () => {
  const input = '본문\n<page_header>p.10</page_header>\n다음 문단'
  assert.equal(stripPageHeaders(input), '본문\n\n다음 문단')
})

test('splitByH2 — H2 헤딩 기준 분할, 헤딩 라인은 섹션 첫 줄로 포함', () => {
  const input = '서두 문장.\n\n## 첫 섹션\n내용 A.\n\n## 두 번째\n내용 B.'
  const result = splitByH2(input)
  assert.equal(result.length, 3)
  assert.equal(result[0].section, '(no-section)')
  assert.equal(result[0].text, '서두 문장.')
  assert.equal(result[1].section, '## 첫 섹션')
  assert.equal(result[1].text, '## 첫 섹션\n내용 A.')
  assert.equal(result[2].section, '## 두 번째')
  assert.equal(result[2].text, '## 두 번째\n내용 B.')
})

test('splitByH2 — H2 없으면 단일 청크', () => {
  const input = '제목 없는 단편 문장.'
  const result = splitByH2(input)
  assert.equal(result.length, 1)
  assert.equal(result[0].section, '(no-section)')
})

test('applyCharLimits — 800자 cap 초과 시 문단 단위 분할', () => {
  const longSection = {
    section: '## 긴 섹션',
    text: '## 긴 섹션\n' + Array(20).fill('가나다라마바사아자차카타파하'.repeat(8)).join('\n\n'),
  }
  // 각 라인 ~96자 × 20개 ≈ 1900자, 문단 구분이 있어야 분할 가능
  const result = applyCharLimits([longSection])
  assert.ok(result.length >= 2, '800자 초과는 최소 2개로 분할')
  for (const r of result) {
    assert.ok(r.text.length <= MAX_CHUNK_CHARS + 100, '하드 cap 근사치')
  }
})

test('applyCharLimits — 50자 미만 인접 섹션 병합', () => {
  const tiny = [
    { section: '(no-section)', text: '짧은 한 줄.' },
    { section: '## A', text: '## A\n또 짧음.' },
    { section: '## B', text: '## B\n' + '내용'.repeat(50) },
  ]
  const result = applyCharLimits(tiny)
  // 앞의 두 단편은 병합 또는 다음 정상 청크에 합류, 50자 이상 청크만 남음
  for (const r of result) {
    assert.ok(r.text.length >= MIN_CHUNK_CHARS || result.length === 1, '최소 길이 보장')
  }
})

test('chunkDocument — frontmatter+page_header strip → 청크 배열 + metadata', () => {
  const raw = `---
slug: test-1
title: 테스트
axis: policies
type: 안내서
---

서두.

## 섹션 A
내용 A.
<page_header>p.5</page_header>

## 섹션 B
내용 B.`
  const result = chunkDocument(raw, {
    slug: 'test-1',
    title: '테스트',
    axis: 'policies',
    type: '안내서',
    source_origin: 'sample-source',
  })
  assert.ok(result.length >= 1)
  for (let i = 0; i < result.length; i++) {
    assert.equal(result[i].metadata.chunk_index, i)
    assert.equal(result[i].metadata.slug, 'test-1')
    assert.equal(result[i].metadata.axis, 'policies')
    assert.ok(!result[i].text.includes('<page_header>'))
    assert.ok(!result[i].text.includes('---\nslug:'))
  }
})

test('chunkDocument — frontmatter-only doc → 빈 배열', () => {
  const raw = '---\nslug: empty\n---\n\n'
  const result = chunkDocument(raw, { slug: 'empty', title: 'Empty', axis: 'policies', type: 't', source_origin: null })
  assert.deepEqual(result, [])
})

test('chunkDocument — chunk_index 연속성', () => {
  const raw = `---\nslug: x\n---\n\n## A\n` + '가'.repeat(900) + '\n\n## B\n' + '나'.repeat(900)
  const result = chunkDocument(raw, { slug: 'x', title: 'X', axis: 'policies', type: 't', source_origin: null })
  const indices = result.map((c) => c.metadata.chunk_index)
  assert.deepEqual(indices, Array.from({ length: result.length }, (_, i) => i))
})

// ---------- C9 ①: 관련 페이지·위키링크 전처리 ----------

const META = { slug: 'x', title: 't', axis: 'a', type: 'y', source_origin: null }

test('stripRelatedPages — `## 관련 페이지` 블록을 다음 ## 헤딩 전까지 제거(### 소제목 포함)', () => {
  const input = '본문.\n\n## 관련 페이지\n\n### 상위 문서\n\n- [[a|가]]\n\n## 다음 절\n내용'
  assert.equal(stripRelatedPages(input), '본문.\n\n## 다음 절\n내용')
})

test('stripRelatedPages — 문서 끝의 블록도 제거, 없으면 원본 그대로', () => {
  assert.equal(stripRelatedPages('본문.\n\n## 관련 페이지\n\n- [[a|가]]\n'), '본문.\n\n')
  assert.equal(stripRelatedPages('본문만.'), '본문만.')
})

test('replaceWikilinks — 표시명 우선, 없으면 slug, 앵커는 버림', () => {
  assert.equal(
    replaceWikilinks('[[a-b|제1조]] 및 [[c-d]] 및 [[e#sec|절]] 및 [[f#sec]]'),
    '제1조 및 c-d 및 절 및 f',
  )
})

test('chunkDocument — 관련 페이지는 청크에서 빠지고 본문 위키링크는 표시명으로', () => {
  const raw = [
    '---', 'slug: x', '---', '',
    '## 개요', '이 절은 [[2023-hr-1|인사관리 개요]]를 보완하는 설명입니다. 충분히 긴 본문을 둡니다.', '',
    '## 관련 페이지', '', '### 형제 문서', '', '- [[2023-hr-2|형제]] (원본 3쪽)',
  ].join('\n')
  const all = chunkDocument(raw, META).map((c) => c.text).join('\n')
  assert.ok(!all.includes('관련 페이지'))
  assert.ok(!all.includes('[['))
  assert.ok(all.includes('인사관리 개요를 보완'))
})

// ---------- E7: char_start / char_end ----------

test('chunkDocument — char_start/char_end는 파일 원문(frontmatter 포함) 기준 반열린 구간', () => {
  const raw = '---\nslug: x\n---\n\n## 첫 절\n' + '가'.repeat(60) + '\n\n## 둘째 절\n' + '나'.repeat(60) + '\n'
  const chunks = chunkDocument(raw, META)
  assert.equal(chunks.length, 2)
  for (const c of chunks) {
    assert.ok(c.char_start !== null && c.char_end !== null)
    assert.equal(raw.slice(c.char_start!, c.char_end!), c.text)
  }
  assert.equal(chunks[0].char_start, raw.indexOf('## 첫 절'))
})

test('chunkDocument — 위키링크 치환 뒤에도 구간은 원문 링크 구문 전체를 덮는다', () => {
  const raw = '---\nslug: x\n---\n' + '앞 문장 '.repeat(10) + '[[s|표시]] 뒤 문장 끝.'
  const [c] = chunkDocument(raw, META)
  assert.ok(c.text.endsWith('표시 뒤 문장 끝.'))
  assert.equal(c.char_end, raw.length)
  assert.equal(raw.slice(c.char_start!, c.char_end!), raw.slice(raw.indexOf('앞')))
})

test('chunkDocument — 긴 문단 분할 청크는 원문에서 겹치지 않고 순서대로 이어진다', () => {
  const sentence = '가'.repeat(199) + '.'
  const raw = '---\nslug: x\n---\n' + Array(6).fill(sentence).join(' ')
  const chunks = chunkDocument(raw, META)
  assert.ok(chunks.length >= 2)
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].char_start! >= chunks[i - 1].char_end!, `청크 ${i} 구간 역행`)
  }
  assert.equal(chunks.at(-1)!.char_end, raw.length)
})
