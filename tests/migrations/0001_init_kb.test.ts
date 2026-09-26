import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// env가 없으면 통합 테스트 전체를 skip (npm run test 회귀 보호).
// npm run test:integration은 --env-file=.env.local로 강제 로드하므로 정상 실행됨.
const skipReason = !url || !anonKey
  ? 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정 — `npm run test:integration` 사용 필요'
  : false

// anon 클라이언트로 부모 문서를 다시 읽어 전부 published인지 확인한다.
// anon이 부모를 못 읽으면(= draft 등) 파생 행이 새어 나온 것이다.
async function assertParentsPublished(client: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const { data, error } = await client
    .from('documents')
    .select('id, status')
    .in('id', unique)
  assert.equal(error, null)
  const visible = new Set((data ?? []).filter((d) => d.status === 'published').map((d) => d.id))
  const orphans = unique.filter((id) => !visible.has(id))
  assert.deepEqual(orphans, [], 'anon에게 published 아닌 문서의 파생 행이 노출됨')
}

describe('0001_init_kb migration', { skip: skipReason }, () => {
  let supabase: SupabaseClient

  before(() => {
    // skip이 활성화되면 before도 실행되지 않지만, 안전망으로 한 번 더 확인.
    supabase = createClient(url!, anonKey!)
  })

  // 운영 DB의 행 수는 콘텐츠 공개 상태에 따라 계속 바뀐다(0건 → 535건 → …).
  // 절대 수치 대신 "anon에게 보이는 것은 published 문서와 그 파생 행뿐"이라는 RLS 불변식을 단언한다.
  test('documents 테이블이 존재하고 anon에게는 published만 보인다', async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('id, slug, status')
      .limit(50)
    assert.equal(error, null, error ? `select 실패: ${error.message}` : '')
    const leaked = (data ?? []).filter((d) => d.status !== 'published')
    assert.deepEqual(leaked, [], 'anon에게 published 아닌 문서가 노출됨')
  })

  test('document_chunks 테이블이 존재하고 anon에게는 published 문서의 청크만 보인다', async () => {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, document_id')
      .limit(50)
    assert.equal(error, null)
    await assertParentsPublished(supabase, (data ?? []).map((r) => r.document_id))
  })

  test('wiki_backlinks 테이블이 존재하고 anon에게는 published 문서의 백링크만 보인다', async () => {
    const { data, error } = await supabase
      .from('wiki_backlinks')
      .select('id, source_doc_id')
      .limit(50)
    assert.equal(error, null)
    await assertParentsPublished(supabase, (data ?? []).map((r) => r.source_doc_id))
  })

  test('taxonomy_terms 테이블이 존재하고 anon select 가능 (RLS true)', async () => {
    const { data, error } = await supabase
      .from('taxonomy_terms')
      .select('id')
      .limit(1)
    assert.equal(error, null)
    assert.deepEqual(data, [])
  })

  test('RLS: anon은 draft documents를 직접 insert 불가', async () => {
    // Precondition: schema가 적용되어 있어야 RLS를 실제로 테스트 가능
    // (적용 전 PGRST205 'table not found'가 regex /42501|PGRST/에 매치되어 false positive로 통과하는 문제 차단)
    const { error: existsError } = await supabase
      .from('documents')
      .select('id')
      .limit(0)
    assert.equal(
      existsError,
      null,
      `schema 미적용 — supabase db push 먼저. 실제 error: ${existsError?.code} ${existsError?.message}`,
    )

    // Actual RLS test
    const { error } = await supabase.from('documents').insert({
      slug: 'rls-test-' + Date.now(),
      title: 'RLS test',
      type: '기타',
      year: 2026,
      source: { organization: 'test', citation: 'test' },
      axis: 'uncategorized',
    })
    assert.notEqual(
      error,
      null,
      'anon insert가 차단되어야 하는데 성공함 (RLS 게이트 누수)',
    )
    // 42501 = Postgres permission denied (RLS rejection의 정확한 SQLSTATE)
    assert.equal(
      error?.code,
      '42501',
      `예상 42501 (RLS rejection), 실제: ${error?.code} ${error?.message}`,
    )
  })
})
