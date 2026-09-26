/**
 * webfortd Phase 2 M2 — 빌드 인덱스 → Supabase 동기화 스크립트
 *
 * scripts/sync-content.ts가 생성한 kb-index.generated.json + 마크다운 정본을 입력으로
 * 받아 documents/wiki_backlinks 테이블을 idempotent 동기화한다.
 *
 * 본 파일은 *Task 2 범위*만 포함한다:
 *   - transformDocumentRow (frontmatter → row 객체)
 *   - loadBody (frontmatter 분리 후 본문 로딩)
 *   - extractWikiLinks / extractEmbeddedMedia (module-private 헬퍼)
 *
 * 후속 Task에서 upsert / backlinks sync / CLI main이 추가된다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { KBDocumentSummary } from '@/lib/kb'
import kbIndex from '@/lib/kb-index.generated.json'

// .env.local shadowing 차단 helper — 단일 source of truth는 scripts/lib/env-loader.ts.
// sync 스크립트(이 파일) / publish 스크립트 / 통합 테스트가 동일 함수를 공유한다.
import { loadDotEnvLocalOverrides } from './lib/env-loader.ts'

/**
 * Node CLI 환경 전용 admin client.
 *
 * `@/lib/supabase/admin`은 `import 'server-only'`로 Next.js client bundle을
 * 차단하는데, 이 가드는 raw Node 환경(`node --import tsx`)에서도 throw하므로
 * 이 스크립트에서는 import 불가. CLI는 항상 Node 컨텍스트이고 SUPABASE_SECRET_KEY가
 * `.env.local`로만 주입되므로 client bundle 누출 위험이 원천 차단됨.
 *
 * 빌드/Server Component용 admin은 그대로 `@/lib/supabase/admin`이 책임지고,
 * 이 스크립트는 동일 createClient 옵션을 그대로 사용한다.
 */
function createCliAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 미설정')
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const REPO_ROOT = process.cwd()

/**
 * slug→id fetch 결과의 길이를 검증. PostgREST 기본 1000 row cap이 미래 1000+ docs 시
 * silent truncation 일으키는 것 차단. 부족하면 진단 메시지와 함께 throw.
 * 실제 구현은 scripts/lib/assert-id-rows.ts — 여기서는 re-export.
 */
import { assertIdRowsComplete } from './lib/assert-id-rows.ts'
export { assertIdRowsComplete } from './lib/assert-id-rows.ts'

/**
 * Supabase `documents` 테이블 row 객체 형태.
 *
 * D2: frontmatter의 `references`는 SQL reserved word라 컬럼명 `references_data`로 rename.
 * B2 (Phase B M1): `status`는 frontmatter 값을 그대로 반영 (마크다운 정본). 기존 D1(draft 강제) 폐기.
 */
export interface DocumentRow {
  slug: string
  title: string
  subtitle: string | null
  type: string
  disability_types: string[]
  domains: string[]
  regions: string[]
  year: number
  effective_date: string | null
  source: Record<string, unknown>
  references_data: unknown[]
  status: 'draft' | 'in_review' | 'published' | 'archived' | 'deprecated'
  authors: string[]
  reviewed_by: string[]
  reviewer_notes: string | null
  accessibility: Record<string, unknown>
  content_md: string
  source_path: string
  wiki_links: string[]
  embedded_media: unknown[]
  parent_headings: string[]
  source_origin: string | null
  axis: string
}

/**
 * frontmatter + 본문을 documents 테이블 row 객체로 변환한다.
 *
 * - B2: status는 입력 frontmatter 값을 반영 (없으면 'draft' fallback). 마크다운 정본.
 * - D2: `references` → `references_data` 컬럼명 rename. row 객체에 `references` 키 *없음*.
 * - wiki_links는 kb-index의 `wikilink_adjacency`에서 받은 값을 그대로 사용 (sync-content.ts의
 *   code-block 마스킹된 추출 결과와 단일 source 보장). M2 codex-rescue carry-over 2 처리.
 */
export function transformDocumentRow(
  doc: KBDocumentSummary,
  contentMd: string,
  wikiLinksFromAdjacency: string[],
): DocumentRow {
  const fm = doc.frontmatter
  return {
    slug: doc.slug,
    title: fm.title,
    subtitle: fm.subtitle ?? null,
    type: fm.type,
    disability_types: fm.disability_types ?? [],
    domains: fm.domains ?? [],
    regions: fm.regions ?? [],
    year: fm.year,
    effective_date: fm.effective_date ?? null,
    source: fm.source as Record<string, unknown>,
    references_data: (fm.references ?? []) as unknown[],
    // B2 (Phase B M1): frontmatter status 반영. 마크다운이 정본 — DB는 그 파생.
    // 기존 D1(draft 강제)은 폐기. published 전환은 마크다운 frontmatter 수정(kb:bootstrap
    // 또는 직접 편집) → sync로 일원화.
    status: fm.status ?? 'draft',
    authors: fm.authors ?? [],
    reviewed_by: fm.reviewed_by ?? [],
    reviewer_notes: fm.reviewer_notes ?? null,
    accessibility: fm.accessibility as Record<string, unknown>,
    content_md: contentMd,
    source_path: doc.filePath,
    wiki_links: wikiLinksFromAdjacency,
    embedded_media: extractEmbeddedMedia(contentMd),
    parent_headings: fm.parent_headings ?? [],
    source_origin: fm.source_origin ?? null,
    axis: doc.axis,
  }
}

// ---------- module-private 헬퍼 ----------

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g

function extractEmbeddedMedia(markdown: string): unknown[] {
  const media: unknown[] = []
  for (const m of markdown.matchAll(IMAGE_RE)) {
    media.push({ alt: m[1], url: m[2], caption: m[3] ?? null })
  }
  return media
}

// ---------- 본문 로딩 ----------

/**
 * 마크다운 정본 파일에서 frontmatter를 제외한 본문 영역을 로딩한다.
 * filePath는 저장소 루트 기준 상대 경로(예: `content/agreements/test.md`).
 */
export function loadBody(filePath: string): string {
  const full = path.join(REPO_ROOT, filePath)
  const raw = fs.readFileSync(full, 'utf8')
  const { content } = matter(raw)
  return content
}

// ---------- documents batch upsert ----------

export interface UpsertOptions {
  batchSize?: number
  onProgress?: (done: number, total: number) => void
}

export async function upsertDocuments(
  client: SupabaseClient,
  rows: DocumentRow[],
  opts: UpsertOptions = {},
): Promise<{ totalUpserted: number }> {
  const batchSize = opts.batchSize ?? 50
  let done = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const { error } = await client
      .from('documents')
      .upsert(chunk, { onConflict: 'slug' })
    if (error) {
      throw new Error(
        `documents upsert 실패 (batch ${i / batchSize + 1}, slugs ${chunk.map((r) => r.slug).slice(0, 3).join(', ')}...): ${error.message}`,
      )
    }
    done += chunk.length
    opts.onProgress?.(done, rows.length)
  }
  return { totalUpserted: done }
}

// ---------- 고아 documents 정리 (content에 없는 slug) ----------

/**
 * documents upsert는 `onConflict: 'slug'`라 주소가 바뀌거나 지워진 문서의 구 행이 그대로 남는다
 * (v3 → 3층 주소 체계 전환 때 구 slug 행이 published로 남아 RAG 검색에 걸린다). content에 없는 slug의
 * 행을 지운다 — `document_chunks`·`wiki_backlinks`는 `on delete cascade`(0001)로 함께 사라진다.
 *
 * 안전장치: 지울 행이 DB 전체의 과반이면 `--allow-mass-delete` 없이는 중단한다(잘못된 작업 트리·
 * 빈 인덱스로 돌린 sync가 DB를 비우는 사고 차단). content가 0건이면 플래그와 무관하게 중단한다.
 */
export const ORPHAN_MASS_DELETE_RATIO = 0.5

export interface OrphanCleanupPlan {
  orphans: string[]
  dbTotal: number
  blocked: boolean
  reason: string | null
}

export function planOrphanCleanup(
  dbSlugs: string[],
  contentSlugs: string[],
  opts: { allowMassDelete: boolean },
): OrphanCleanupPlan {
  const dbTotal = dbSlugs.length
  if (contentSlugs.length === 0) {
    return { orphans: [], dbTotal, blocked: true, reason: 'content 문서가 0건 — 인덱스 생성 실패 의심, 정리 중단' }
  }
  const keep = new Set(contentSlugs)
  const orphans = dbSlugs.filter((s) => !keep.has(s)).sort()
  if (orphans.length > dbTotal * ORPHAN_MASS_DELETE_RATIO && !opts.allowMassDelete) {
    return {
      orphans,
      dbTotal,
      blocked: true,
      reason: `삭제 대상 ${orphans.length}건이 DB ${dbTotal}건의 과반 — 의도한 정리면 --allow-mass-delete로 다시 실행`,
    }
  }
  return { orphans, dbTotal, blocked: false, reason: null }
}

/** documents의 slug 전체(PostgREST 1000행 상한을 넘어도 누락 없이 페이징). */
export async function fetchAllDocumentSlugs(
  client: SupabaseClient,
  pageSize = 1000,
): Promise<string[]> {
  const slugs: string[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('documents')
      .select('slug')
      .order('slug')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`documents slug fetch 실패: ${error.message}`)
    const page = (data ?? []) as { slug: string }[]
    slugs.push(...page.map((r) => r.slug))
    if (page.length < pageSize) return slugs
  }
}

export async function deleteOrphanDocuments(
  client: SupabaseClient,
  slugs: string[],
  batchSize = 100,
): Promise<number> {
  let deleted = 0
  for (let i = 0; i < slugs.length; i += batchSize) {
    const batch = slugs.slice(i, i + batchSize)
    const { error } = await client.from('documents').delete().in('slug', batch)
    if (error) {
      throw new Error(`고아 documents 삭제 실패 (slugs ${batch.slice(0, 3).join(', ')}...): ${error.message}`)
    }
    deleted += batch.length
  }
  return deleted
}

function describeOrphanPlan(plan: OrphanCleanupPlan): string {
  const sample = plan.orphans.slice(0, 10).join(', ')
  return `고아 documents ${plan.orphans.length}건 / DB ${plan.dbTotal}건${plan.orphans.length > 0 ? ` — 예: ${sample}${plan.orphans.length > 10 ? ' …' : ''}` : ''}`
}

// ---------- wiki_backlinks sync (delete + insert per source) ----------

/**
 * `wiki_backlinks` 테이블 row 객체 형태.
 *
 * D3: `line`은 sync 시점에 채우지 않는다 (`scripts/sync-content.ts`가 valid
 * backlink push 시 line을 omit). 항상 `null` insert. DB 컬럼은 future-reserved.
 */
export interface WikiBacklinkInsert {
  source_doc_id: string
  target_slug: string
  anchor: string | null
  link_text: string | null
  line: number | null
}

export interface SyncBacklinksResult {
  totalInserted: number
  skippedSources: string[]
}

/**
 * 페이지별 wiki_backlinks를 idempotent 동기화한다.
 *
 * D5: source_doc_id별 *기존 row 일괄 삭제 → 신규 insert*. upsert composite key가
 * 없어 unique constraint 활용 불가. "이 페이지의 backlinks를 현재 인덱스 기준
 * 으로 재구성"이라는 의미를 명시.
 *
 * D3: 모든 row의 `line`은 null (sync-content.ts가 line을 미저장).
 *
 * 입력 `bySource`는 *source perspective* (Record<sourceSlug, links[]>).
 * 각 link의 `to` 필드는 target slug (DB 컬럼 `target_slug`와 1:1 매핑).
 * kb-index.generated.json의 `wiki_backlinks`는 target perspective이므로 caller
 * 는 `invertBacklinksToSourcePerspective`로 변환해서 넘겨야 한다.
 *
 * `anchor`/`link_text`는 link에 있으면 *그대로 보존*해서 row에 들어간다 (현재
 * sync-content.ts가 emit하지 않아 항상 null이지만, 미래 변경 시 자동 반영됨 —
 * D1 surrogate PK 결정의 forward-compat 의도).
 */
export async function syncWikiBacklinks(
  client: SupabaseClient,
  bySource: Record<
    string,
    { to: string; anchor?: string; link_text?: string }[]
  >,
  slugToId: Record<string, string>,
): Promise<SyncBacklinksResult> {
  // 1. source_doc_ids 매핑 + 미존재 source 수집
  const sourceIds: string[] = []
  const inserts: WikiBacklinkInsert[] = []
  const skipped: string[] = []

  for (const [sourceSlug, links] of Object.entries(bySource)) {
    const sourceId = slugToId[sourceSlug]
    if (!sourceId) {
      skipped.push(sourceSlug)
      continue
    }
    sourceIds.push(sourceId)
    for (const link of links) {
      inserts.push({
        source_doc_id: sourceId,
        target_slug: link.to,
        anchor: link.anchor ?? null,
        link_text: link.link_text ?? null,
        line: null, // D3
      })
    }
  }

  // 2. 기존 row 일괄 삭제 (D5)
  if (sourceIds.length > 0) {
    const { error: delError } = await client
      .from('wiki_backlinks')
      .delete()
      .in('source_doc_id', sourceIds)
    if (delError) {
      throw new Error(`wiki_backlinks delete 실패: ${delError.message}`)
    }
  }

  // 3. 신규 insert (batch 500)
  if (inserts.length > 0) {
    const batchSize = 500
    for (let i = 0; i < inserts.length; i += batchSize) {
      const chunk = inserts.slice(i, i + batchSize)
      const { error } = await client.from('wiki_backlinks').insert(chunk)
      if (error) {
        throw new Error(`wiki_backlinks insert 실패: ${error.message}`)
      }
    }
  }

  return { totalInserted: inserts.length, skippedSources: skipped }
}

/**
 * kb-index의 wiki_backlinks (target perspective) → source perspective 변환.
 *
 * 입력: `{ 'target-slug': [{ from: 'source-slug', anchor?, link_text? }] }`
 *   - 인덱스의 wiki_backlinks는 "이 target을 가리키는 source 목록"
 *   - inner field `from`은 source slug
 *
 * 출력: `{ 'source-slug': [{ to: 'target-slug', anchor?, link_text? }] }`
 *   - source 페이지가 어떤 target을 가리키는가
 *   - inner field `to`는 target slug (DB column wiki_backlinks.target_slug와 시맨틱 정합)
 *
 * **anchor/link_text/line은 보존**: 현재 sync-content.ts가 valid backlink에 anchor/link_text를
 * emit하지 않지만 (corpus 0건), forward-compat 위해 pass-through. 미래에 sync-content.ts가
 * 변경되면 자동 반영됨 (D1 surrogate PK 결정과 정합).
 */
export function invertBacklinksToSourcePerspective(
  byTarget: Record<
    string,
    { from: string; anchor?: string; link_text?: string }[]
  >,
): Record<
  string,
  { to: string; anchor?: string; link_text?: string }[]
> {
  const bySource: Record<
    string,
    { to: string; anchor?: string; link_text?: string }[]
  > = {}
  for (const [targetSlug, links] of Object.entries(byTarget)) {
    for (const link of links) {
      const sourceSlug = link.from
      if (!bySource[sourceSlug]) bySource[sourceSlug] = []
      bySource[sourceSlug].push({
        to: targetSlug,
        anchor: link.anchor,
        link_text: link.link_text,
      })
    }
  }
  return bySource
}

// ---------- CLI main ----------

interface MainOptions {
  dryRun: boolean
  allowMassDelete: boolean
}

/**
 * sync-content-to-db CLI entry.
 *
 * 동작 모드:
 *   - dry-run: kb-index 로드 → 전체 535건 transform → slug 중복 검증 → backlinks invert
 *     까지만 수행하고 종료. DB write 없음.
 *   - normal: dry-run 단계 + 고아 정리 계획(과반 삭제면 쓰기 전에 중단) + admin client로
 *     documents upsert + 고아 documents 삭제 + slug→id fetch + wiki_backlinks sync(delete+insert per source).
 *
 * dry-run도 DB 접속 정보가 있으면 documents slug를 **읽기만** 해서 고아 정리 대상을 보고한다.
 *
 * 모든 단계는 idempotent. 중간 실패 시 재실행으로 회복 가능.
 *
 * 호출 컨텍스트:
 *   - `npm run kb:sync:dry-run` — dry-run
 *   - `npm run kb:sync` — 실 운영 적용
 *   - 두 script 모두 `node --env-file=.env.local --import tsx` 통해 SUPABASE_SECRET_KEY 주입
 */
async function main(opts: MainOptions): Promise<void> {
  // shadowing 차단: ~/.zshrc 등의 stale export보다 .env.local 우선
  loadDotEnvLocalOverrides()

  const startedAt = Date.now()
  const index = kbIndex as unknown as {
    documents: KBDocumentSummary[]
    wiki_backlinks: Record<
      string,
      { from: string; anchor?: string; link_text?: string }[]
    >
    wikilink_adjacency: Record<string, string[]>
  }
  const { documents, wiki_backlinks, wikilink_adjacency } = index

  console.log(
    `[sync] 입력: ${documents.length} documents, ${Object.keys(wiki_backlinks).length} target slugs`,
  )

  // 1. transform (전체) — wiki_links는 wikilink_adjacency single source 사용 (M2 carry-over 2).
  // adjacency에 없는 doc.slug (즉 wiki_links 0건 페이지)는 빈 배열 default.
  const rows: DocumentRow[] = []
  for (const doc of documents) {
    const body = loadBody(doc.filePath)
    const links = wikilink_adjacency[doc.slug] ?? []
    rows.push(transformDocumentRow(doc, body, links))
  }

  // 2. dry-run validation — slug 중복 검증
  const slugCounts: Record<string, number> = {}
  for (const r of rows) slugCounts[r.slug] = (slugCounts[r.slug] ?? 0) + 1
  const duplicates = Object.entries(slugCounts).filter(([, n]) => n > 1)
  if (duplicates.length > 0) {
    throw new Error(
      `slug 중복 ${duplicates.length}건: ${duplicates
        .slice(0, 5)
        .map((d) => d[0])
        .join(', ')}...`,
    )
  }

  const contentSlugs = rows.map((r) => r.slug)

  if (opts.dryRun) {
    console.log(
      `[sync] DRY-RUN — transform ${rows.length} rows OK. DB write 생략.`,
    )
    const bySourceDry = invertBacklinksToSourcePerspective(wiki_backlinks)
    console.log(
      `[sync] backlinks (source perspective): ${Object.keys(bySourceDry).length} source pages`,
    )
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      console.log('[sync] DRY-RUN — DB 접속 정보 없음, 고아 documents 점검 생략')
      return
    }
    const plan = planOrphanCleanup(
      await fetchAllDocumentSlugs(createCliAdminClient()),
      contentSlugs,
      { allowMassDelete: opts.allowMassDelete },
    )
    console.log(`[sync] DRY-RUN — ${describeOrphanPlan(plan)}`)
    if (plan.blocked) console.log(`[sync] DRY-RUN — 적용 시 중단됨: ${plan.reason}`)
    return
  }

  // 3. 고아 정리 계획 — 쓰기 전에 판정해 과반 삭제면 아무것도 쓰지 않고 중단
  const client = createCliAdminClient()
  const orphanPlan = planOrphanCleanup(
    await fetchAllDocumentSlugs(client),
    contentSlugs,
    { allowMassDelete: opts.allowMassDelete },
  )
  console.log(`[sync] ${describeOrphanPlan(orphanPlan)}`)
  if (orphanPlan.blocked) {
    throw new Error(`[sync] 중단: ${orphanPlan.reason}`)
  }

  // 4. documents upsert (batch 50, 100/50 단위로 progress 로그)
  await upsertDocuments(client, rows, {
    batchSize: 50,
    onProgress: (done, total) => {
      if (done % 100 === 0 || done === total) {
        console.log(`[sync] documents ${done}/${total}`)
      }
    },
  })

  // 5. 고아 documents 삭제(청크·백링크는 cascade). upsert 뒤라 content 문서는 이미 최신이다.
  if (orphanPlan.orphans.length > 0) {
    const deleted = await deleteOrphanDocuments(client, orphanPlan.orphans)
    console.log(`[sync] 고아 documents ${deleted}건 삭제`)
  }

  // 6. slug → id 매핑 fetch
  // PostgREST 기본 1000 row cap을 미래 1000+ docs 시점에도 비활성화하기 위해
  // .range(0, rows.length + 100)로 generous ceiling 명시 + assertIdRowsComplete로 검증.
  const { data: idRows, error: fetchError } = await client
    .from('documents')
    .select('id, slug')
    .range(0, rows.length + 100)
  if (fetchError) {
    throw new Error(`documents id fetch 실패: ${fetchError.message}`)
  }
  assertIdRowsComplete(idRows, rows.length)
  // reviewer I-1: DB에 중복 slug가 있으면 silent drop 방지 (UNIQUE constraint로 거의 불가능하지만 belt-and-suspenders)
  const slugToId: Record<string, string> = {}
  for (const r of idRows ?? []) {
    const slug = r.slug as string
    if (slugToId[slug]) {
      throw new Error(
        `DB에 중복 slug 발견: ${slug} (id ${slugToId[slug]}, ${r.id}). documents 테이블 UNIQUE 제약 확인 필요.`,
      )
    }
    slugToId[slug] = r.id as string
  }

  // 7. backlinks invert + sync
  const bySource = invertBacklinksToSourcePerspective(wiki_backlinks)
  const backlinksResult = await syncWikiBacklinks(client, bySource, slugToId)

  console.log(
    `[sync] backlinks inserted: ${backlinksResult.totalInserted}, skipped sources: ${backlinksResult.skippedSources.length}`,
  )
  if (backlinksResult.skippedSources.length > 0) {
    console.warn(
      `[sync] skipped sources sample: ${backlinksResult.skippedSources.slice(0, 5).join(', ')}`,
    )
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[sync] 완료 (${elapsed}s) — documents ${rows.length}, backlinks ${backlinksResult.totalInserted}`,
  )
}

// Run if invoked directly (tsx ESM 환경: import.meta.url과 process.argv[1] 비교).
// fileURLToPath로 양쪽 정규화해서 file:// scheme/encoding 차이를 흡수.
const invokedPath = process.argv[1]
  ? fileURLToPath(new URL(`file://${process.argv[1]}`))
  : ''
const modulePath = fileURLToPath(import.meta.url)
if (invokedPath === modulePath) {
  const dryRun = process.argv.includes('--dry-run')
  const allowMassDelete = process.argv.includes('--allow-mass-delete')
  main({ dryRun, allowMassDelete }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
