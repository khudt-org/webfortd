#!/usr/bin/env tsx
/**
 * 서버 함수 번들 추적 범위 게이트 — next build 직후 실행.
 *
 * Next.js는 각 서버 함수가 실행 중 읽을 파일을 `.next/server/**\/*.nft.json`에 기록하고
 * Vercel은 그 목록을 함수 번들로 싣는다. `path.join(process.cwd(), 변수)`처럼 범위를
 * 좁힐 수 없는 경로가 하나라도 있으면 추적이 저장소 전체(data/·public/source-images 등)로
 * 넓어져 함수 1개가 220MB, 배포 1건이 약 2GB가 된다(2026-09-25 Hobby Functions Storage
 * 10GB 초과의 원인). 이 스크립트는 허용 경로 밖 파일이 추적되면 빌드를 실패시킨다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// 함수가 실행 중 읽어도 되는 위치. 새 런타임 파일 읽기가 필요하면 여기에 추가한다.
const ALLOWED_PREFIXES = ['.next/', 'node_modules/', 'content/']
const ALLOWED_FILES = ['src/lib/kb-index.generated.json']

export function isAllowed(relPath: string): boolean {
  return ALLOWED_FILES.includes(relPath) || ALLOWED_PREFIXES.some((p) => relPath.startsWith(p))
}

function findNftFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.nft.json'))
    .map((e) => path.join(e.parentPath, e.name))
}

/** 허용 범위 밖 추적 파일을 함수별로 모은다. 비어 있으면 통과. */
export function collectViolations(repoRoot: string): Map<string, string[]> {
  const violations = new Map<string, string[]>()
  for (const nft of findNftFiles(path.join(repoRoot, '.next/server'))) {
    const { files } = JSON.parse(fs.readFileSync(nft, 'utf-8')) as { files: string[] }
    const bad = files
      .map((f) => path.relative(repoRoot, path.resolve(path.dirname(nft), f)).split(path.sep).join('/'))
      .filter((rel) => !isAllowed(rel))
    if (bad.length > 0) violations.set(path.relative(repoRoot, nft), bad)
  }
  return violations
}

function main() {
  const repoRoot = process.cwd()
  const violations = collectViolations(repoRoot)
  if (violations.size === 0) {
    console.log('함수 추적 범위 검사 통과')
    return
  }
  console.error('허용 범위 밖 파일이 서버 함수 번들에 추적됐다. 빌드 로그의 "Encountered unexpected file in NFT list" 경고가 가리키는 모듈의 경로 조합을 고칠 것.')
  for (const [nft, bad] of violations) {
    console.error(`- ${nft}: ${bad.length}개 (예: ${bad.slice(0, 3).join(', ')})`)
  }
  process.exit(1)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main()
