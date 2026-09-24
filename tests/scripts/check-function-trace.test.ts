/**
 * 서버 함수 번들 추적 범위 게이트 단위 테스트.
 * 저장소 전체가 추적되면 잡고, 정상 추적은 통과시키는지 본다.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectViolations, isAllowed } from '../../scripts/check-function-trace.ts'

// functions: 함수 디렉터리(.next/server/app 기준) → 그 nft에 적힌 추적 파일(저장소 루트 기준)
function makeRepo(functions: Record<string, string[]>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nft-'))
  for (const [fn, files] of Object.entries(functions)) {
    const dir = path.join(root, '.next/server/app', fn)
    fs.mkdirSync(dir, { recursive: true })
    const rel = files.map((f) => path.relative(dir, path.join(root, f)))
    fs.writeFileSync(path.join(dir, 'page.js.nft.json'), JSON.stringify({ version: 1, files: rel }))
  }
  return root
}

describe('isAllowed', () => {
  test('빌드 산출물·의존성·콘텐츠·인덱스는 허용', () => {
    for (const p of ['.next/server/chunks/a.js', 'node_modules/next/x.js', 'content/faq/a.md', 'src/lib/kb-index.generated.json']) {
      assert.equal(isAllowed(p), true, p)
    }
  })

  test('원본 자료·공개 이미지·저장소 루트 파일은 거부', () => {
    for (const p of ['data/source-hwp/a.hwp', 'public/source-images/a.png', 'package.json', 'content-backup/a.md']) {
      assert.equal(isAllowed(p), false, p)
    }
  })
})

describe('collectViolations', () => {
  test('정상 추적이면 위반 없음', () => {
    const root = makeRepo({ '(wiki)/[...kb]': ['.next/server/chunks/a.js', 'node_modules/next/x.js', 'content/faq/a.md'] })
    assert.equal(collectViolations(root).size, 0)
  })

  test('저장소 전체를 추적한 함수만 위반 파일과 함께 보고', () => {
    const root = makeRepo({
      '(wiki)/[...kb]': ['.next/server/chunks/a.js', 'content/faq/a.md'],
      '(gov)/legacy/resources/law-guide': ['.next/server/chunks/a.js', 'data/source-hwp/a.hwp', 'package.json'],
    })
    assert.deepEqual(Object.fromEntries(collectViolations(root)), {
      [path.join('.next/server/app/(gov)/legacy/resources/law-guide', 'page.js.nft.json')]: ['data/source-hwp/a.hwp', 'package.json'],
    })
  })

  test('.next/server가 없으면 위반 없음(정적 export 등)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nft-'))
    assert.equal(collectViolations(root).size, 0)
  })
})
