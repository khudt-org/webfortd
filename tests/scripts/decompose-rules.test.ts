/**
 * decompose-source.ts 분해 규칙 단위 테스트(BACKLOG E8).
 *
 * tests/decompose-source.test.ts는 실파일(data/source-md) e2e라 규칙 하나가 깨져도 어느 규칙인지
 * 가리키지 못한다. 여기서는 규칙 함수를 합성 입력으로 한 가지씩 확인한다.
 * 규칙 정본: docs/DECOMPOSE_V2_DESIGN.md.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  attachFormLabels,
  buildOutlinePages,
  demoteNonHeadings,
  detectRangeViolations,
  lastPageCommentIn,
  mergeShortPlans,
  normalizeBodyHeadings,
  splitLargeBody,
  stripPageComments,
  textLength,
  SPLIT_BUDGET_CHARS,
  SPLIT_MAX_CHARS,
  type DecomposeWarning,
  type PagePlan,
  type SourceFileMeta,
} from '../../scripts/decompose-source'

const META: SourceFileMeta = {
  sourceOrigin: 'test-origin',
  slugPrefix: 't',
  splitLevel: 4,
  slugScheme: 'outline',
  year: 2026,
  docType: '기타',
  source: { organization: 'test', citation: 'test' },
  defaultDisabilityTypes: [],
}

const LONG = '가'.repeat(120) // 개요 페이지 기준(100자) 이상
const SHORT = '짧은 서문'

function plansOf(body: string) {
  const warnings: DecomposeWarning[] = []
  const plans = buildOutlinePages(body, META, warnings)
  return { plans, warnings, slugs: plans.map((p) => p.slug) }
}

describe('주소(outline) — 조상 번호 누적', () => {
  it('부에서 자기 수준까지 번호가 슬러그에 쌓인다', () => {
    const { slugs } = plansOf(['# Ⅱ. 부', '## 2. 장', '### 1) 절', '본문'].join('\n'))
    assert.deepEqual(slugs, ['t-2-2-1'])
  })

  it('번호 없는 제목은 부모 경로 + x<n>이고 경고를 남긴다', () => {
    const { slugs, warnings } = plansOf(['# Ⅰ. 부', '## 가나 소개', '본문', '## 다라 소개', '본문'].join('\n'))
    assert.deepEqual(slugs, ['t-1-x1', 't-1-x2'])
    assert.equal(warnings.filter((w) => w.kind === 'unnumbered').length, 2)
  })

  it('같은 부모 아래 같은 번호는 -d2로 갈리고 dup_number 경고를 남긴다', () => {
    const { slugs, warnings } = plansOf(['# Ⅰ. 부', '## 1. 첫째', '본문', '## 1. 또 첫째', '본문'].join('\n'))
    assert.deepEqual(slugs, ['t-1-1', 't-1-1-d2'])
    assert.equal(warnings.filter((w) => w.kind === 'dup_number').length, 1)
  })

  it('부록: 루트 아래 ◇ 부록N.은 app-N, 루트 밖 [부록 N]도 app-N', () => {
    assert.deepEqual(plansOf(['# 부록', '## ◇ 부록1. 서식', '본문'].join('\n')).slugs, ['t-app-1'])
    assert.deepEqual(plansOf(['# [부록 3] 조사지', '본문'].join('\n')).slugs, ['t-app-3'])
  })
})

describe('개요 페이지·짧은 서문', () => {
  it('서문 100자 이상 부모는 부모 경로 그대로 개요 페이지가 된다', () => {
    const { plans, warnings } = plansOf(['# Ⅰ. 부', LONG, '## 1. 장', '본문'].join('\n'))
    assert.deepEqual(plans.map((p) => [p.slug, p.isOverview]), [['t-1', true], ['t-1-1', false]])
    assert.equal(warnings.filter((w) => w.kind === 'overview').length, 1)
  })

  it('서문 100자 미만은 첫 자식 앞에 라벨 있는 인용 블록으로 붙는다', () => {
    const { plans } = plansOf(['# Ⅰ. 부', SHORT, '## 1. 장', '본문'].join('\n'))
    assert.deepEqual(plans.map((p) => p.slug), ['t-1-1'])
    assert.match(plans[0].body, /^> 「Ⅰ\. 부」 서문\n>\n> 짧은 서문\n\n/)
  })
})

describe('빈 조각 병합(mergeShortPlans)', () => {
  const plan = (slug: string, body: string, order: number, extra: Partial<PagePlan> = {}): PagePlan => ({
    slug, title: `제목 ${slug}`, body, parentHeadings: [], parentPath: 't-1', groupPath: 't-1',
    endOffset: 0, order, isOverview: false, headingOffset: 0, level: 2, numberKind: 'dot', ...extra,
  })

  it('100자 미만 조각은 다음 형제 앞에 ## 원제목 소절로 붙고 안의 제목은 한 단계 내려간다', () => {
    const warnings: DecomposeWarning[] = []
    const out = mergeShortPlans([plan('a', '## 소제목\n짧음', 0), plan('b', LONG, 1)], warnings)
    assert.deepEqual(out.map((p) => p.slug), ['b'])
    assert.equal(out[0].body, `## 제목 a\n\n### 소제목\n짧음\n\n${LONG}`)
    assert.equal(warnings[0].kind, 'merged')
  })

  it('다음 형제가 없으면 이전 형제 끝에 붙는다', () => {
    const out = mergeShortPlans([plan('a', LONG, 0), plan('b', '짧음', 1)], [])
    assert.deepEqual(out.map((p) => p.slug), ['a'])
    assert.ok(out[0].body.endsWith('## 제목 b\n\n짧음'))
  })

  it('개요 페이지·다른 부모의 페이지는 병합 대상이 아니고, 대상이 없으면 그대로 남는다', () => {
    const out = mergeShortPlans(
      [plan('ov', LONG, 0, { isOverview: true }), plan('a', '짧음', 1), plan('z', LONG, 2, { parentPath: 't-2' })],
      [],
    )
    assert.deepEqual(out.map((p) => p.slug), ['ov', 'a', 'z'])
  })

  it('길이는 공백을 빼고 센다', () => {
    assert.equal(textLength(' 가 \n나\t다 '), 3)
  })
})

describe('5.5만 자 분할(splitLargeBody)', () => {
  it('예산 이하 본문은 그대로 한 조각', () => {
    assert.deepEqual(splitLargeBody('짧은 본문'), { parts: ['짧은 본문'], oversizedTable: false })
  })

  it('문단 경계에서 자르고 각 조각은 예산을 넘지 않는다', () => {
    const para = '나'.repeat(10_000)
    const body = Array.from({ length: 12 }, () => para).join('\n\n')
    const { parts, oversizedTable } = splitLargeBody(body)
    assert.equal(oversizedTable, false)
    assert.ok(parts.length > 1)
    for (const p of parts) assert.ok(p.length <= SPLIT_BUDGET_CHARS, `조각 ${p.length}자`)
    assert.equal(parts.join('\n\n'), body)
  })

  it('표는 자르지 않는다 — 한도를 넘는 단일 표는 한 덩어리로 두고 oversizedTable', () => {
    const row = `| ${'다'.repeat(100)} |`
    const table = Array.from({ length: Math.ceil(SPLIT_MAX_CHARS / row.length) + 10 }, () => row).join('\n')
    const { parts, oversizedTable } = splitLargeBody(`머리말\n\n${table}\n\n맺음말`)
    assert.equal(oversizedTable, true)
    assert.ok(parts.some((p) => p === table), '표 블록이 한 조각 안에 온전히 있어야 한다')
  })
})

describe('제목 강등·서식 라벨·제목 수준', () => {
  it('<표>·<그림>·참고·TIP 제목은 굵게로 강등하고 코드 블록 안은 건드리지 않는다', () => {
    const warnings: DecomposeWarning[] = []
    const out = demoteNonHeadings(['## <표 1> 현황', '## 1. 정상 제목', '```', '## <표 2> 코드', '```', '### 참고: 메모'].join('\n'), warnings)
    assert.deepEqual(out.split('\n'), ['**<표 1> 현황**', '## 1. 정상 제목', '```', '## <표 2> 코드', '```', '**참고: 메모**'])
    assert.equal(warnings.filter((w) => w.kind === 'demoted_heading').length, 2)
  })

  it('제목 직전 [별지 …] 라벨은 그 제목 아래 첫 줄로 옮기고 쪽 주석은 제자리에 둔다', () => {
    const warnings: DecomposeWarning[] = []
    const body = ['앞 문서 끝', '', '[별지 제20호 서식]', '<!-- p.12 (pdf 14) -->', '## 서약서', '본문'].join('\n')
    const out = attachFormLabels(body, warnings)
    assert.deepEqual(out.split('\n'), ['앞 문서 끝', '', '<!-- p.12 (pdf 14) -->', '## 서약서', '', '[별지 제20호 서식]', '본문'])
    assert.equal(warnings[0].kind, 'form_label')
  })

  it('라벨이 아닌 줄 뒤의 제목은 그대로', () => {
    const body = '그냥 문장\n## 제목\n본문'
    assert.equal(attachFormLabels(body, []), body)
  })

  it('본문 제목은 가장 얕은 것이 ##이 되도록 평행 이동한다', () => {
    assert.equal(normalizeBodyHeadings('#### 가\n##### 나'), '## 가\n### 나')
    assert.equal(normalizeBodyHeadings('# 가\n## 나'), '## 가\n### 나')
    assert.equal(normalizeBodyHeadings('## 가'), '## 가')
  })
})

describe('쪽 주석·범위 경고', () => {
  it('쪽 주석을 본문에서 지우고 빈 줄을 하나로 줄인다', () => {
    assert.equal(stripPageComments('가\n<!-- p.3 (pdf 5) -->\n\n\n나'), '가\n\n나')
  })

  it('끝 쪽은 뒤에 본문이 있는 마지막 주석이고 pdf 라벨은 쓰지 않는다', () => {
    const body = '<!-- p.3 (pdf 5) -->\n가\n<!-- p.pdf7 (pdf 7) -->\n나\n<!-- p.5 (pdf 8) -->\n'
    assert.equal(lastPageCommentIn(body, 0, body.length), '3')
  })

  it('자기·부모와 같은 번호 계열로 시작하는 본문 줄을 범위 경고로 잡는다(표·목록·인용 줄 제외)', () => {
    const body = ['2. 다음 절이 본문에 섞임', '| 3. 표 안 |', '- 4. 목록', '> 5. 인용', '1) 다른 계열'].join('\n')
    assert.deepEqual(detectRangeViolations(body, new Set(['dot'])), ['2. 다음 절이 본문에 섞임'])
    assert.deepEqual(detectRangeViolations(body, new Set()), [])
  })
})
