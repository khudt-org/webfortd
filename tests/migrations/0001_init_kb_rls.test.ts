/**
 * webfortd Phase 2 M2 — RLS 통합 테스트 fixture 확장 (M1 carry-over 3)
 *
 * 운영 DB에 draft·published 문서가 각각 1건 이상 있다는 전제만으로 admin/anon
 * 양방향 RLS를 검증한다. 행 수는 콘텐츠 공개 상태에 따라 계속 바뀌므로
 * (535 draft → 535 published + FAQ draft 9 …) 절대 수치를 가정하지 않고,
 * 상태 토글 없이 기존 행으로 판정해 운영 DB에 쓰지 않는다.
 *
 * 환경 트랩 가드 (Task 5 발견):
 *   `~/.zshrc:64`에 다른 프로젝트의 SUPABASE_SECRET_KEY가 export되어 있으면
 *   `node --env-file=.env.local`은 *기존 env를 덮어쓰지 않으므로* stale 키가 사용된다.
 *   이 가드를 `before` 블록에서 `loadDotEnvLocalOverrides()`로 차단한다.
 *
 *   주의 1: `loadDotEnvLocalOverrides`를 *모듈 top-level에서* 호출하면 `npm run test`
 *   (env-file 없이 실행되는 회귀 테스트)에서도 .env.local을 자동 로딩해서 통합 테스트가
 *   실 DB에 hit한다. 그래서 `before` 블록 안으로 한정해 envFile 없으면 자연스레 skip.
 *
 *   주의 2: skipReason은 모듈 top-level에서 결정되어 before보다 먼저 평가된다.
 *   shadowing 케이스(zshrc에 stale 키 *존재*)에서는 skipReason=false → before 실행 →
 *   override 적용 → 정확한 키로 client 구성. env가 *완전 부재*인 케이스(npm run test)
 *   에서는 skipReason 활성 → before 미실행 → loadDotEnvLocalOverrides 미호출.
 *
 *   주의 3: before 안에서 process.env를 *재조회*해야 한다. 모듈 top의 const 캡처는
 *   override 이전 값이므로 stale.
 */
import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadDotEnvLocalOverrides } from '../../scripts/lib/env-loader.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

// false vs '' 주의: node:test의 skip 옵션은 falsy 값으로 false를 기대.
// 0001_init_kb.test.ts와 동일한 패턴(`: false`)을 사용한다.
const skipReason =
  !url || !anonKey || !secretKey
    ? 'env 미설정 (test:integration으로 실행 필요 — NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY)'
    : false

describe('0001_init_kb RLS fixture (M2 sync 후)', { skip: skipReason }, () => {
  let anon: SupabaseClient
  let admin: SupabaseClient
  let draftIds: string[] = []
  let publishedSample: { id: string; slug: string } | null = null

  before(() => {
    // shadowing 차단: .env.local 값을 process.env에 강제 override (Task 5 발견 트랩).
    // skip 옵션이 false인 경우에만 실행되므로 `npm run test` 회귀에는 영향 없음.
    loadDotEnvLocalOverrides()
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const a = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const s = process.env.SUPABASE_SECRET_KEY!
    anon = createClient(u, a)
    admin = createClient(u, s, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  })

  test('precondition: draft·published 문서가 각각 1건 이상 (admin)', async () => {
    const { data: drafts, error: e1 } = await admin
      .from('documents')
      .select('id')
      .eq('status', 'draft')
      .limit(200)
    assert.equal(e1, null)
    draftIds = (drafts ?? []).map((d) => d.id)
    assert.ok(draftIds.length > 0, 'draft 문서가 없어 anon 차단 방향을 검증할 수 없음')

    const { data: pub, error: e2 } = await admin
      .from('documents')
      .select('id, slug')
      .eq('status', 'published')
      .limit(1)
      .single()
    assert.equal(e2, null)
    publishedSample = pub
    assert.ok(publishedSample, 'published 문서가 없어 anon 노출 방향을 검증할 수 없음')
  })

  test('anon은 draft documents를 read할 수 없음', async () => {
    const { data, error } = await anon
      .from('documents')
      .select('id, slug, status')
      .eq('status', 'draft')
      .limit(5)
    assert.equal(error, null) // RLS는 row 필터, 에러는 안 남
    assert.deepEqual(data, []) // 모두 차단되어 빈 배열

    // id로 직접 지목해도 보이지 않아야 한다(status 필터에 기대지 않는 확인)
    const { data: byId } = await anon.from('documents').select('id').in('id', draftIds)
    assert.deepEqual(byId, [])
  })

  test('anon은 published 문서를 id로 read할 수 있음', async () => {
    assert.ok(publishedSample)
    const { data: anonRead, error } = await anon
      .from('documents')
      .select('id, slug, status')
      .eq('id', publishedSample.id)
      .single()
    assert.equal(error, null)
    assert.equal(anonRead?.status, 'published')
    assert.equal(anonRead?.slug, publishedSample.slug)
  })

  test('anon은 draft 문서의 wiki_backlinks를 read할 수 없음', async () => {
    const { data } = await anon
      .from('wiki_backlinks')
      .select('id')
      .in('source_doc_id', draftIds)
    assert.deepEqual(data, [])
  })

  test('published 페이지의 backlinks는 anon이 read 가능 (D6 — target_slug 노출 invariant)', async () => {
    // backlinks를 가진 published source를 *명시적*으로 고른다(silent pass 차단)
    const { data: pubDocs } = await admin
      .from('documents')
      .select('id')
      .eq('status', 'published')
      .limit(200)
    const pubIds = (pubDocs ?? []).map((d) => d.id)
    const { data: candidates } = await admin
      .from('wiki_backlinks')
      .select('source_doc_id')
      .in('source_doc_id', pubIds)
      .limit(1)
    const sourceDocId = candidates?.[0]?.source_doc_id
    assert.ok(
      sourceDocId,
      'published 문서의 wiki_backlinks가 없어 D6 invariant 검증 불가 — sync 누락 의심',
    )

    const { data: anonBlinks } = await anon
      .from('wiki_backlinks')
      .select('id, target_slug')
      .eq('source_doc_id', sourceDocId)
    assert.ok((anonBlinks?.length ?? 0) > 0)
    // D6: target_slug가 draft 문서를 가리키더라도 노출 OK (slug는 저장소에 공개)
  })

  test('anon은 wiki_backlinks insert 불가 (RLS)', async () => {
    const { error } = await anon
      .from('wiki_backlinks')
      .insert({
        source_doc_id: '00000000-0000-0000-0000-000000000000',
        target_slug: 'fake',
      })
    assert.notEqual(error, null)
    assert.equal(error?.code, '42501')
  })

  test('anon은 documents status를 update 불가', async () => {
    // draft 문서를 대상으로 한다(anon에게 보이지 않는 행 — 가장 흔한 누수 경로)
    const { data: sample } = await admin
      .from('documents')
      .select('id, status, updated_at')
      .eq('status', 'draft')
      .limit(1)
      .single()
    assert.ok(sample)
    const { error, count } = await anon
      .from('documents')
      .update({ status: 'published' }, { count: 'exact' })
      .eq('id', sample.id)
      .select()

    // RLS는 row visibility 필터라 update affected 0 + error null이거나 explicit error.
    // Supabase는 RLS로 invisible한 row를 update할 때 count를 0 또는 null로 반환할 수 있음
    // (PostgREST의 Prefer: count=exact 동작에서 빈 결과셋이 null로 직렬화되는 케이스).
    // 두 값 모두 "anon이 row를 변경하지 못함"의 시맨틱이라 RLS 차단으로 인정.
    if (error === null) {
      assert.ok(
        count === 0 || count === null,
        `anon update가 row 변경 안 함 (RLS row visibility), count=${count}`,
      )

      // 추가 검증: admin이 즉시 다시 읽어 원래 값 그대로인지 확인
      // (RLS 누수로 실제 변경이 발생했다면 status·updated_at이 바뀐다)
      const { data: postCheck } = await admin
        .from('documents')
        .select('status, updated_at')
        .eq('id', sample.id)
        .single()
      assert.equal(postCheck?.status, sample.status, 'anon update가 실제로 row를 변경했음 (RLS 누수)')
      assert.equal(postCheck?.updated_at, sample.updated_at, 'anon update가 updated_at을 바꿨음 (RLS 누수)')
    } else {
      assert.match(error.code ?? '', /42501|PGRST/)
    }
  })
})
