/**
 * 에이전트 지침(CLAUDE.md·.claude/rules) 크기 예산과 rules 색인 일치.
 *
 * CLAUDE.md는 매 세션·매 리뷰어 서브에이전트가 전량 읽는다 — 크기가 곧 토큰 비용이다.
 * 2026-11-08: 이력·디렉터리 지도·사업 맥락·영역 규칙을 옮겨 56KB → 19KB.
 * 넘으면 항목을 지우지 말고 한 영역 전용 항목은 .claude/rules/<영역>.md로, 근거·세부는
 * docs/PATTERNS.md의 같은 제목 절로, 날짜 서사는 CHANGELOG.md로 옮긴다.
 *
 * CLAUDE.md·.claude/는 공개 저장소라 추적하지 않는다(.gitignore). 그래서 파일이 없는
 * 클론(CI 등)에서는 건너뛴다 — 이 게이트는 지침 파일이 있는 로컬 체크아웃에서만 의미가 있다.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const BUDGET_BYTES = 21_500
// rules 파일은 길면 앞부분만 실린다(doc-audit 스킬 diet.md §5-A 6단계, 단위는 글자). 여유를 두고 30,000자.
const RULE_BUDGET_CHARS = 30_000

// 작업 디렉터리와 무관하게 저장소 루트를 고정한다(다른 곳에서 실행하면 skip으로 거짓 녹색이 된다).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const claudePath = path.join(root, "CLAUDE.md")
const rulesDir = path.join(root, ".claude", "rules")
const hasClaude = existsSync(claudePath)
const ruleFiles = existsSync(rulesDir)
  ? readdirSync(rulesDir).filter((f) => f.endsWith(".md")).sort()
  : []
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n")

describe("CLAUDE.md 크기 예산", { skip: !hasClaude && "CLAUDE.md 없음(추적 제외 파일)" }, () => {
  it(`CLAUDE.md는 ${BUDGET_BYTES.toLocaleString("en-US")} bytes 이하다`, () => {
    const size = statSync(claudePath).size
    assert.ok(
      size <= BUDGET_BYTES,
      `${size} bytes > ${BUDGET_BYTES}: 영역 항목은 .claude/rules로, 상세는 docs/PATTERNS.md로, 서사는 CHANGELOG.md로 옮길 것`,
    )
  })

  it("CLAUDE.md 색인과 .claude/rules 파일 목록이 같다", () => {
    const indexed = [...new Set([...read(claudePath).matchAll(/`\.claude\/rules\/([^`/*]+\.md)`/g)].map((m) => m[1]))].sort() // `*.md` 같은 글롭 언급은 제외
    assert.deepEqual(indexed, ruleFiles)
  })
})

describe(".claude/rules 파일", { skip: ruleFiles.length === 0 && ".claude/rules 없음(추적 제외 폴더)" }, () => {
  for (const f of ruleFiles) {
    it(`${f}는 paths 머리를 갖고 상한 안이다`, () => {
      const text = read(path.join(rulesDir, f))
      assert.match(text, /^---\npaths:\n( {2}- "[^"]+"\n)+---\n/)
      assert.ok([...text].length <= RULE_BUDGET_CHARS, `${f}: ${[...text].length}자 > ${RULE_BUDGET_CHARS}`)
    })
  }
})
