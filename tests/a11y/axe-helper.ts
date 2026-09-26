// axe-core 공통 헬퍼 — critical 0건 + serious baseline lock.
//
// PR D (codex-rescue follow-up) 구조:
//   1. critical 위반 → 즉시 fail (회귀 차단 hard gate)
//   2. serious 위반 → route별 baseline 비교
//      - actual[rule] > baseline[rule] → fail (신규 회귀)
//      - actual에 baseline 없는 신규 rule → fail
//      - actual[rule] < baseline[rule] → console.log (개선 — baseline update 권고)
//      - 동일 → pass
//
// Baseline: tests/a11y/axe-serious-baseline.json
// 갱신: `tests/a11y/axe-serious-baseline.json`을 아래 개선 로그에 맞춰 직접 수정(자동 갱신 스크립트 없음)
// Fix trigger: Phase 5 진입 전 + 에스앤씨랩 평가 전 모든 baseline 0건

import AxeBuilder from '@axe-core/playwright'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BLOCKING_IMPACTS = new Set(['critical'])
const SERIOUS_IMPACTS = new Set(['serious'])

type RouteBaseline = Record<string, number>
type BaselineFile = {
  routes: Record<string, RouteBaseline>
}

const baselinePath = join(process.cwd(), 'tests/a11y/axe-serious-baseline.json')
const baselineFile: BaselineFile = JSON.parse(readFileSync(baselinePath, 'utf8'))

function countByRule(violations: Array<{ id: string }>): RouteBaseline {
  const counts: RouteBaseline = {}
  for (const v of violations) {
    counts[v.id] = (counts[v.id] ?? 0) + 1
  }
  return counts
}

// 404·리다이렉트 화면을 그 route 키로 감사해 초록을 내지 않게 응답 상태와 최종 경로를 단언한다.
export async function expectNoAxeViolations(page: Page, info: TestInfo, route: string) {
  const res = await page.goto(route, { waitUntil: 'domcontentloaded' })
  expect(res?.status(), `${route} — 응답 상태`).toBe(200)
  expect(new URL(page.url()).pathname, `${route} — 최종 경로`).toBe(new URL(route, page.url()).pathname)
  await page.waitForLoadState('load')

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const critical = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''))
  const serious = results.violations.filter((v) => SERIOUS_IMPACTS.has(v.impact ?? ''))

  if (critical.length > 0 || serious.length > 0) {
    const fmt = (v: (typeof results.violations)[number]) =>
      `[${v.impact}] ${v.id}: ${v.help}\n  ${v.helpUrl}\n  affected: ${v.nodes.length} node(s)`
    const report = [...critical, ...serious].map(fmt).join('\n\n')
    await info.attach('axe-violations', { body: report, contentType: 'text/plain' })
  }

  // critical hard gate
  expect(critical, `${route} — critical 0건 기대, ${critical.length}건 발견`).toEqual([])

  // serious baseline lock
  const baseline = baselineFile.routes[route] ?? {}
  const actual = countByRule(serious)

  // 1) 신규 rule (baseline에 없음) → fail
  const newRules = Object.keys(actual).filter((rule) => !(rule in baseline))
  expect(
    newRules,
    `${route} — serious 신규 rule 회귀: ${newRules.join(', ')} (axe-serious-baseline.json 갱신 또는 fix 필요)`,
  ).toEqual([])

  // 2) baseline 초과 → fail
  const regressions: string[] = []
  for (const rule of Object.keys(actual)) {
    if (actual[rule] > (baseline[rule] ?? 0)) {
      regressions.push(`${rule}: actual=${actual[rule]} > baseline=${baseline[rule] ?? 0}`)
    }
  }
  expect(
    regressions,
    `${route} — serious 회귀:\n  ${regressions.join('\n  ')}`,
  ).toEqual([])

  // 3) 개선 권고 (baseline > actual)
  const improvements: string[] = []
  for (const rule of Object.keys(baseline)) {
    const expectedCount = baseline[rule]
    const actualCount = actual[rule] ?? 0
    if (actualCount < expectedCount) {
      improvements.push(`${rule}: actual=${actualCount} < baseline=${expectedCount}`)
    }
  }
  if (improvements.length > 0) {
    console.log(
      `[a11y improvement] ${route} — baseline 갱신 권고: ${improvements.join(', ')} (axe-serious-baseline.json 직접 수정)`,
    )
  }
}
