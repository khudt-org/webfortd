/**
 * decompose-source.ts 회귀 테스트 (2026-08 3층 재생성판)
 *
 * 입력은 실파일(data/source-md/ v4 4종 + 단체협약)이므로 e2e 형태로 검증한다.
 * 규칙 정본: docs/DECOMPOSE_V2_DESIGN.md. 번호 파서 단위 테스트는 scripts/lib/outline.ts 대상.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import matter from 'gray-matter'
import { parseOutlineNumber, stripOutlineNumber } from '../scripts/lib/outline'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const TSX_BIN = path.join(REPO_ROOT, 'node_modules/.bin/tsx')
const DECOMPOSE_SCRIPT = path.join(REPO_ROOT, 'scripts/decompose-source.ts')
const SOURCE_DIR = path.join(REPO_ROOT, 'data/source-md')
const OUTLINE_PREFIXES = ['2023-research', '2023-hr', '2024-jbu', '2024-staff']

function runDecompose(args: string[]): string {
  return execFileSync(TSX_BIN, [DECOMPOSE_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function walkContent(): string[] {
  const out: string[] = []
  const stack = [path.join(REPO_ROOT, 'content')]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '_archive-v3') continue
        stack.push(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
    }
  }
  return out
}

function outlinePages(): Array<{ file: string; slug: string; data: Record<string, unknown>; body: string }> {
  return walkContent()
    .filter((f) => OUTLINE_PREFIXES.some((p) => path.basename(f).startsWith(`${p}-`)))
    .map((file) => {
      const parsed = matter(fs.readFileSync(file, 'utf-8'))
      return { file, slug: path.basename(file, '.md'), data: parsed.data, body: parsed.content }
    })
}

describe('A. 번호 파서(outline)', () => {
  it('2층 v4 제목 번호 7계열을 정규화한다', () => {
    assert.deepEqual(parseOutlineNumber('Ⅱ. 장애인교원 지원 관련 선행연구 분석'), { kind: 'roman', value: 2 })
    assert.deepEqual(parseOutlineNumber('2. 분석 결과'), { kind: 'dot', value: 2 })
    assert.deepEqual(parseOutlineNumber('1) 정보접근 분야'), { kind: 'paren-close', value: 1 })
    assert.deepEqual(parseOutlineNumber('(3) 학교업무'), { kind: 'paren', value: 3 })
    assert.deepEqual(parseOutlineNumber('⑦ 해외 지원 사례'), { kind: 'circled', value: 7 })
    assert.deepEqual(parseOutlineNumber('㉣ 진행 및 참여자'), { kind: 'kor-circled', value: 4 })
    assert.deepEqual(parseOutlineNumber('다. 장애인 교원의 장애유형별 특성'), { kind: 'kor-dot', value: 3 })
    assert.deepEqual(parseOutlineNumber('라) 청각장애'), { kind: 'kor-close', value: 4 })
  })

  it('부록 계열: 루트·◇ 부록N.·[부록 N-M]·<부록N>', () => {
    assert.deepEqual(parseOutlineNumber('부록'), { kind: 'appendix-root' })
    assert.deepEqual(parseOutlineNumber('◇ 부록1. 장애인교원 근무지원 방안 개발 관련 자료'), { kind: 'appendix', value: 1 })
    assert.deepEqual(parseOutlineNumber('[부록 1- 2] 교사 직무 유형에 따른'), { kind: 'appendix', value: 1, sub: 2 })
    assert.deepEqual(parseOutlineNumber('<부록3> 장애인교원 관련 유관기관 정보'), { kind: 'appendix', value: 3 })
  })

  it('번호 없는 제목(□·평문)은 none', () => {
    assert.equal(parseOutlineNumber('□ 학생 좌석 배치 지원 절차').kind, 'none')
    assert.equal(parseOutlineNumber('근로지원인 서비스 신청서').kind, 'none')
  })

  it('stripOutlineNumber는 번호 표지만 뗀다', () => {
    assert.equal(stripOutlineNumber('(2) 뇌병변장애'), '뇌병변장애')
    assert.equal(stripOutlineNumber('Ⅲ. 시각장애인교원 지원 방안'), '시각장애인교원 지원 방안')
    assert.equal(stripOutlineNumber('□ 지원 원칙'), '지원 원칙')
  })
})

describe('B. dry-run·입력 파일', () => {
  it('data/source-md/ 최상위에는 v4 4종 + 단체협약 5개가 있고 v3는 v3/ 하위에 보존된다', () => {
    const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.md'))
    assert.equal(files.length, 5, `현재 ${files.length}: ${files.join(', ')}`)
    assert.equal(files.filter((f) => f.includes('_fused_v4_')).length, 4)
    const v3 = fs.readdirSync(path.join(SOURCE_DIR, 'v3')).filter((f) => f.endsWith('_fused_v3.md'))
    assert.equal(v3.length, 4)
  })

  it('--dry-run이 정상 종료하고 페이지 수가 두 번 같다(idempotency 신호)', () => {
    const a = runDecompose(['--dry-run']).match(/DRY RUN 요약 — 페이지 (\d+)/)
    const b = runDecompose(['--dry-run']).match(/DRY RUN 요약 — 페이지 (\d+)/)
    assert.ok(a && b, 'stdout에 페이지 수 보고가 있어야 함')
    assert.equal(a![1], b![1])
    assert.ok(parseInt(a![1], 10) >= 300, `4종 재생성 페이지 수가 300 이상이어야 함 (현재 ${a![1]})`)
  })

  it('단체협약은 frozen — 전체 실행에서 건너뛰고 --file dry-run은 40개 이상 보고', () => {
    const caPath = path.join(SOURCE_DIR, '교육부와 함께하는장애인교원노동조합 간 2020 단체협약.md')
    assert.ok(fs.existsSync(caPath))
    const out = runDecompose(['--dry-run', '--file', caPath])
    const m = out.match(/페이지 (\d+)/)
    assert.ok(m && parseInt(m[1], 10) >= 40, `단체협약은 H4 분할로 40개 이상 (현재 ${m?.[1]})`)
    const src = fs.readFileSync(DECOMPOSE_SCRIPT, 'utf-8')
    assert.match(src, /frozen: true/, '단체협약 frozen 플래그 누락')
    assert.match(src, /--include-frozen/, 'frozen 해제 플래그 누락')
  })
})

describe('C. 주소 체계(outline)', () => {
  const pages = outlinePages()

  it('4종 파생 페이지가 300건 이상이고 전부 draft·reviewed_by 빈 배열', () => {
    assert.ok(pages.length >= 300, `현재 ${pages.length}`)
    for (const p of pages) {
      assert.equal(p.data.status, 'draft', `${p.slug}: 재생성 페이지는 2차 검증 전까지 draft`)
      assert.deepEqual(p.data.reviewed_by, [], `${p.slug}: reviewed_by는 비어 있어야 함`)
    }
  })

  it('순번 fallback(-p-NNN·-appendix-NNN)이 없고 슬러그는 kebab-case', () => {
    const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
    for (const p of pages) {
      assert.ok(SLUG_RE.test(p.slug), `kebab-case 위반: ${p.slug}`)
      assert.doesNotMatch(p.slug, /-(p|appendix)-\d{3}(-|$)/, `순번 fallback 재발: ${p.slug}`)
    }
  })

  it('경로 주소: 조상 번호가 슬러그에 누적된다(2023-hr 「Ⅱ > 2. > 2) > (1)」 = 2023-hr-2-2-2-1)', () => {
    const p = pages.find((x) => x.slug === '2023-hr-2-2-2-1')
    assert.ok(p, '2023-hr-2-2-2-1 없음')
    assert.equal(p!.data.title, '(1) 개요')
    assert.deepEqual(p!.data.parent_headings, ['Ⅱ. 장애인교원 인사관리', '2. 장애인교원 인사관리 지원 내용', '2) 전보 임용'])
  })

  it('부록·분할·개요·번호 없음 주소 형태가 존재한다', () => {
    const slugs = new Set(pages.map((p) => p.slug))
    assert.ok(slugs.has('2023-research-app-1-2'), '[부록 1-2] → app-1-2')
    // 델파이 조사지 8건(app-2-x*·app-3-x*)은 9/7 결정 3으로 3층에서 제외 — 5.5만 자 한도 검증은 위키에 남는 최대 문서로
    assert.ok(slugs.has('2023-research-app-1-4'), '[부록 1-4](3.3만 자)는 5.5만 자 예산 안에서 한 건')
    assert.ok(![...slugs].some((s) => /-pt\d+$/.test(s)), '현 4종에는 분할 페이지가 없어야 한다(있으면 한도 재검토)')
    assert.ok([...slugs].some((s) => /-x\d+$/.test(s)), '번호 없는 제목 x<n>')
    const overview = pages.find((p) => p.slug === '2023-hr-1-2-2')
    assert.ok(overview && overview.data.title === '2) 장애유형', '부모 서문 개요 페이지')
  })

  it('같은 출처 안에서 title이 유일하다', () => {
    const byOrigin = new Map<string, Set<string>>()
    for (const p of pages) {
      const origin = String(p.data.source_origin)
      const set = byOrigin.get(origin) ?? new Set()
      assert.ok(!set.has(String(p.data.title)), `${origin}: 제목 중복 「${p.data.title}」`)
      set.add(String(p.data.title))
      byOrigin.set(origin, set)
    }
  })

  it('제목 끝에 목차 쪽수가 남지 않는다', () => {
    for (const p of pages) {
      const title = String(p.data.title)
      const m = title.match(/\s(\d{1,3})$/)
      if (m && p.data.source_page) {
        assert.notEqual(String(p.data.source_page).replace(/^.*?(\d+)$/, '$1'), m[1], `${p.slug}: 제목 끝 쪽수 잔존 「${title}」`)
      }
    }
  })
})

describe('D. 본문 규칙', () => {
  const pages = outlinePages()

  it('쪽 주석은 본문에 없고 frontmatter source_page로 옮겨진다', () => {
    let withPage = 0
    for (const p of pages) {
      assert.doesNotMatch(p.body, /<!--\s*p\./, `${p.slug}: 쪽 주석 잔존`)
      if (p.data.source_page) {
        withPage += 1
        assert.equal(typeof p.data.source_page, 'string')
        if (p.data.source_page_pdf !== undefined) assert.equal(typeof p.data.source_page_pdf, 'number')
      }
    }
    assert.ok(withPage / pages.length > 0.9, `source_page 보유 비율 ${withPage}/${pages.length}`)
  })

  it('관련 페이지 블록은 [[slug|제목]] (원본 N쪽) 형식이고 대상이 실제 페이지다', () => {
    const slugs = new Set(pages.map((p) => p.slug))
    let blocks = 0
    for (const p of pages) {
      const m = p.body.match(/\n## 관련 페이지\n\n([\s\S]*)$/)
      if (!m) continue
      blocks += 1
      for (const line of m[1].trim().split('\n')) {
        const lm = line.match(/^- \[\[([a-z0-9-]+)\|([^\]]+)\]\]( \(원본 [^)]+쪽\))?$/)
        assert.ok(lm, `${p.slug}: 관련 페이지 행 형식 위반 — ${line}`)
        assert.ok(slugs.has(lm![1]), `${p.slug}: 관련 페이지 대상 없음 ${lm![1]}`)
      }
    }
    assert.ok(blocks / pages.length > 0.8, `관련 페이지 블록 비율 ${blocks}/${pages.length}`)
  })

  it('이미지 마커 다음 줄에 원문 (이미지: alt)가 보존된다', () => {
    let markers = 0
    for (const p of pages) {
      const re = /<!-- TODO: image-link source=[\w-]+ -- 원본: \(이미지: ([^\n]+?)\) -->\n\(이미지: \1\)/g
      const found = p.body.match(/<!-- TODO: image-link/g)?.length ?? 0
      const preserved = [...p.body.matchAll(re)].length
      assert.equal(found, preserved, `${p.slug}: 마커 ${found}건 중 alt 보존 ${preserved}건`)
      markers += found
    }
    assert.ok(markers >= 1, 'v4 이미지 패턴이 최소 1건은 마커로 남아야 함')
  })

  it('허용 태그만 남고(br·mark·sub·sup) 파서 잔존 태그는 없다', () => {
    for (const p of pages) {
      // 소문자 태그명만 검사(`<IV-18>` 같은 본문 표 번호 표기는 태그가 아니다)
      const tags = p.body.replace(/<!--[\s\S]*?-->/g, '').match(/<\/?[a-z_]+\b[^>]*>/g) ?? []
      for (const t of tags) {
        assert.match(t, /^<\/?(br|mark|sub|sup)\s*\/?>$/, `${p.slug}: 허용 밖 태그 ${t}`)
      }
    }
  })

  it('본문 안 소제목은 ##부터 시작한다(페이지 H1 아래 계층 정규화)', () => {
    for (const p of pages) {
      const withoutH1 = p.body.replace(/^\s*# [^\n]*\n/, '')
      const levels = [...withoutH1.replace(/```[\s\S]*?```/g, '').matchAll(/^(#{1,6})\s+\S/gm)].map((m) => m[1].length)
      if (levels.length === 0) continue
      assert.equal(Math.min(...levels), 2, `${p.slug}: 본문 최상위 소제목이 h${Math.min(...levels)}`)
    }
  })
})

describe('E. 단체협약·수동 페이지 보호', () => {
  it('agreements/는 2020-ca-* 40개 이상이고 published 상태를 유지한다', () => {
    const dir = path.join(REPO_ROOT, 'content/agreements')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    assert.ok(files.length >= 40)
    assert.ok(files.every((f) => f.startsWith('2020-ca-')))
    const published = files.filter((f) => /status:\s*published/.test(fs.readFileSync(path.join(dir, f), 'utf-8')))
    assert.equal(published.length, files.length, '단체협약은 재생성 대상이 아니므로 published 유지')
  })

  it('FrontmatterSchema에 source_page 3필드와 published gate가 있다', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'src/types/kb.ts'), 'utf-8')
    assert.match(src, /source_page: z\.string\(\)\.optional\(\)/)
    assert.match(src, /source_page_end: z\.string\(\)\.optional\(\)/)
    assert.match(src, /source_page_pdf: z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/)
    assert.match(src, /status === 'published'/)
  })
})

describe('F. 참조 정합(대응표·이미지 매핑·검증 게이트)', () => {
  it('slug 대응표 CSV가 있고 4종 구 주소 455건 이상이 새 주소를 가진다', () => {
    const csv = fs.readFileSync(path.join(REPO_ROOT, 'docs/slug-migration-2026-08.csv'), 'utf-8')
    const rows = csv.split('\n').slice(1).filter(Boolean)
    const mapped = rows.filter((r) => !/^[^,]+,,/.test(r))
    assert.ok(rows.length >= 480, `행 ${rows.length}`)
    assert.ok(mapped.length >= 450, `대응 ${mapped.length}`)
  })

  it('src 큐레이션·axis override·FAQ 위키링크에 구 주소가 남아 있지 않다', () => {
    const slugs = new Set(walkContent().map((f) => path.basename(f, '.md')))
    const targets = [
      'src/lib/wiki-popular.ts', 'src/lib/wiki-role-entries.ts', 'src/lib/media-curation.ts',
      'content/_axis-overrides.json',
      ...fs.readdirSync(path.join(REPO_ROOT, 'content/faq')).map((f) => `content/faq/${f}`),
    ]
    for (const t of targets) {
      const text = fs.readFileSync(path.join(REPO_ROOT, t), 'utf-8')
      for (const m of text.matchAll(/\b(2023-research|2023-hr|2024-jbu|2024-staff)-[a-z0-9-]+/g)) {
        if (m[0].endsWith('-seat-assignment-flow')) continue // 미디어 카탈로그 자체 슬러그
        assert.ok(slugs.has(m[0]), `${t}: 존재하지 않는 주소 ${m[0]}`)
      }
    }
  })

  it('image-mappings 키는 alt 해시 스킴이고 본문 ![](source-images) 수는 매핑 수와 같다(P0 회귀 가드)', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/image-mappings.ts'), 'utf-8')
    assert.match(src, /altHash\(alt\)/, 'alt 해시 키 누락')
    assert.match(src, /manifestByPath/, '매니페스트 path 정합 가드 누락')
    assert.match(src, /manifestEntry\.source !== occ\.source/, 'source 교차 검증 가드 누락')
    const j = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'content/_image-mappings.json'), 'utf-8'))
    const mappedCount = Object.values(j.mappings ?? {}).filter((e) => (e as { manifest_path?: string | null }).manifest_path).length
    let bodyImageCount = 0
    for (const f of walkContent()) bodyImageCount += (fs.readFileSync(f, 'utf-8').match(/!\[[^\]]+\]\(\/source-images\//g) ?? []).length
    assert.equal(bodyImageCount, mappedCount)
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'content/_archive-v3/_image-mappings.json')), 'v3 매핑 archive 누락')
  })

  it('validate-frontmatter.ts에 본문 게이트 6종이 있다', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/validate-frontmatter.ts'), 'utf-8')
    for (const code of ['forbidden_html_tag', 'unbalanced_html_tag', 'broken_wikilink', 'duplicate_title', 'body_too_short', 'body_too_long', 'legacy_slug', 'stale_axis_override']) {
      assert.match(src, new RegExp(code), `${code} 게이트 누락`)
    }
  })

  it('kb-mdx가 위키링크를 링크로 바꾸고 허용 태그를 되살린다', async () => {
    const { escapeKbContent } = await import('../src/lib/kb-mdx.ts')
    const out = escapeKbContent('a [[x-1|표시]] b [[y-2]] <br> <mark>강조</mark> <u>x</u> {z}', {
      resolveWikilink: (slug) => (slug === 'x-1' ? '/policies/x-1' : null),
    })
    assert.equal(out, 'a [표시](/policies/x-1) b y-2 <br /> <mark>강조</mark> &lt;u>x&lt;/u> &#123;z&#125;')
  })

  it('decompose-source.ts 안전 가드(prefix·path 유일성·override 충돌·stale)가 유지된다', () => {
    const src = fs.readFileSync(DECOMPOSE_SCRIPT, 'utf-8')
    assert.match(src, /SOURCE_FILE_MAP prefix 충돌/)
    assert.match(src, /글로벌 path 충돌/)
    assert.match(src, /axis override가 forcedAxis와 충돌/)
    assert.match(src, /_axis-overrides\.json에 분해 결과와 매칭 안 되는 slug/)
    assert.match(src, /INDENT_CODE_RE/)
  })
})

describe('G. 2차 검수 반영(2026-09-11, 9/7 결정 4건)', () => {
  const pages = outlinePages()
  const bySlug = new Map(pages.map((p) => [p.slug, p]))
  const EXCLUDED = [
    '2023-research-1-3-1', '2023-research-1-3-2',
    '2023-research-app-2-x1', '2023-research-app-2-x2', '2023-research-app-2-x3', '2023-research-app-2-x4',
    '2023-research-app-3-x1', '2023-research-app-3-x2', '2023-research-app-3-x3', '2023-research-app-3-x4',
    '2023-research-4-3-1-1', '2023-research-4-3-1-2',
  ]

  it('결정 3: 연구 절차 서술 문서 12건은 생성되지 않고 관련 페이지에서도 참조되지 않는다', () => {
    for (const slug of EXCLUDED) assert.ok(!bySlug.has(slug), `${slug}가 생성됨`)
    for (const p of pages) {
      for (const slug of EXCLUDED) assert.ok(!p.body.includes(`[[${slug}|`), `${p.slug}가 제외 문서 ${slug}를 참조`)
    }
    assert.ok(bySlug.has('2023-research-4-3-1-3'), '결과가 담긴 (3) 1차~3차 전문가협의회 결과는 남아야 함')
  })

  it('쪽 범위: source_page_end가 다음 절 시작 쪽으로 넘치지 않고 pdf 접두 라벨은 source_page에 쓰지 않는다', () => {
    const cerebral = bySlug.get('2023-hr-1-2-2-2')! // (2) 뇌병변장애: 원본 15쪽에서 끝남(2차 검수 29번)
    assert.equal(cerebral.data.source_page, '15')
    assert.ok(cerebral.data.source_page_end === undefined || cerebral.data.source_page_end === '15', `end=${cerebral.data.source_page_end}`)
    const teaching = bySlug.get('2023-research-2-2-1-1')! // 정보접근 (1) 교수학습: 7~9쪽(20번)
    assert.equal(teaching.data.source_page, '7')
    assert.equal(teaching.data.source_page_end, '9')
    for (const p of pages) {
      if (p.data.source_page) assert.doesNotMatch(String(p.data.source_page), /^pdf/, `${p.slug}: source_page가 pdf 접두`)
      if (p.data.source_page_end) assert.doesNotMatch(String(p.data.source_page_end), /^pdf/, `${p.slug}: source_page_end가 pdf 접두`)
    }
  })

  it('100자 미만 부모 서문은 첫 자식 앞에 라벨 있는 인용 블록으로 붙는다(9·27번)', () => {
    const degree = bySlug.get('2023-hr-1-2-1')! // 1) 장애정도 ← 「2. 장애인교원의 구분」 도입문
    assert.match(degree.body, /^\s*# [^\n]+\n\n> 「2\. 장애인교원의 구분」 서문\n>\n> ◦ 장애인교원에 대한 특성과/)
  })

  it('장애유형은 본문 전체로 판정하되 관련 페이지의 형제 제목은 재료가 아니다(20·30·39번)', () => {
    const guide = bySlug.get('2024-jbu-2-2-3-2')!.data.disability_types as string[]
    for (const dt of ['시각', '청각', '지체', '뇌병변']) assert.ok(guide.includes(dt), `2024-jbu-2-2-3-2에 ${dt} 없음: ${guide}`)
    const liver = bySlug.get('2023-hr-1-2-2-10')!.data.disability_types as string[]
    assert.ok(!liver.includes('지체'), `간장애 문서에 지체: ${liver}`)
  })

  it('2층 반영 확인: 캡션 자동 번호·서식 전사 메모·병합 반복·상위 제목', () => {
    for (const p of pages) {
      assert.doesNotMatch(p.body, /<표 [ⅠⅡⅢⅣⅤIV]+->|\[그림 [ⅠⅡⅢⅣⅤIV]+-\]/, `${p.slug}: 캡션 번호 빈 채로 남음`)
      assert.ok(!p.body.includes('(서식 전사:'), `${p.slug}: 내부 작업 메모 노출`)
      assert.doesNotMatch(p.body, /^\|  \| (참고|지원 사례|유의사항) \|/m, `${p.slug}: 5열 박스 잔존`)
    }
    // 인사관리 부록3 「4. 편의지원 유형별 관련 기관, 시설 연락처」 아래 「1) 인적지원」(28번)
    const contacts = bySlug.get('2023-hr-app-3-4-1')!
    assert.ok(contacts, '2023-hr-app-3-4-1 없음')
    assert.ok((contacts.data.parent_headings as string[]).some((h) => h.startsWith('4. 편의지원 유형별')), String(contacts.data.parent_headings))
    // 지원인력 「다. 학습 활동 지원」 유의사항 1회(44번)
    const staff = bySlug.get('2024-staff-4-2-3')!
    assert.equal(staff.body.split('스마트 기기를 조작하기 어려운 경우').length - 1, 1)
    // 중부대 Q&A 절차 9단계(39번)·인사관리 4) 기타 인사 관리 등(35번)
    assert.ok(bySlug.get('2024-jbu-2-2-3-2')!.body.includes('① 지원 요청 → ② 관리자에게 지원 요청'))
    assert.ok(bySlug.has('2023-hr-2-2-4-1') && bySlug.get('2023-hr-2-2-4-1')!.data.title === '(1) 전직 임용 과정에서의 차별 금지', '전직 임용 절 누락')
  })
})
