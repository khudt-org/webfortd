import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadDocumentCore, submitBodyCore } from '../src/lib/editor/edit-core.ts'

const SAMPLE = '---\ntitle: "표본"\nstatus: published\n---\n원래 본문\n'
const editor = { canEdit: true, userId: '123e4567-e89b-12d3-a456-426614174000', email: 'e@x.y' }

function deps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getEditor: async () => editor,
    getFile: async () => ({ ok: true, value: { text: SAMPLE, sha: 'sha-1' } }),
    putFile: async () => ({ ok: true, value: { commitSha: 'c1', contentSha: 'sha-1-new' } }),
    rateLimit: () => true,
    ...overrides,
  } as never
}

describe('loadDocumentCore', () => {
  it('권한자는 본문과 baseSha와 문서 URL을 받는다', async () => {
    const r = await loadDocumentCore(deps(), '2020-ca-1-2')
    assert.equal(r.status, 'ok')
    if (r.status === 'ok') {
      assert.equal(r.body, '원래 본문\n')
      assert.equal(r.baseSha, 'sha-1')
      assert.equal(r.docPath, '/agreements/2020-ca-1-2')
    }
  })
  it('nested resource(resources/law 등)도 축 단순 합성이 아닌 실제 경로로 해석된다 (C2 회귀 방지)', async () => {
    // codex-rescue PR #31 P1과 동일한 함정: `/${axis}/${slug}` 단순 합성은
    // content/resources/law/ordinance-comparison.md 같은 nested 경로에서 404를 낸다.
    const r = await loadDocumentCore(deps(), 'ordinance-comparison')
    assert.equal(r.status, 'ok')
    if (r.status === 'ok') {
      assert.equal(r.docPath, '/resources/law/ordinance-comparison')
    }
  })
  it('비로그인은 forbidden + needLogin 문구', async () => {
    const r = await loadDocumentCore(
      deps({ getEditor: async () => ({ canEdit: false, userId: null, email: null }) }),
      '2020-ca-1-2',
    )
    assert.equal(r.status, 'forbidden')
    if (r.status === 'forbidden') assert.ok(r.message.includes('로그인'))
  })
  it('로그인했으나 무권한은 forbidden + 기존 문구(권한 등록 안내)', async () => {
    const r = await loadDocumentCore(
      deps({ getEditor: async () => ({ canEdit: false, userId: 'user-1', email: 'e@x.y' }) }),
      '2020-ca-1-2',
    )
    assert.equal(r.status, 'forbidden')
    if (r.status === 'forbidden') assert.ok(r.message.includes('권한 등록'))
  })
  it('미등록 slug·GET 404는 not_found', async () => {
    assert.equal((await loadDocumentCore(deps(), 'no-such-slug-xyz')).status, 'not_found')
    const r = await loadDocumentCore(deps({ getFile: async () => ({ ok: false, reason: 'not_found' }) }), '2020-ca-1-2')
    assert.equal(r.status, 'not_found')
  })
  it('auth 실패는 system(관리자 문의 문구)', async () => {
    const r = await loadDocumentCore(deps({ getFile: async () => ({ ok: false, reason: 'auth' }) }), '2020-ca-1-2')
    assert.equal(r.status, 'system')
    assert.ok(r.message.includes('관리자'))
  })
})

describe('submitBodyCore', () => {
  const args = { slug: '2020-ca-1-2', baseSha: 'sha-1', body: '고친 본문\n' }
  it('정상 경로: frontmatter 보존 병합 + 가명 커밋 메시지 + accepted + newBaseSha', async () => {
    let put = null as { text: string; message: string } | null
    const r = await submitBodyCore(
      deps({ putFile: async (a: { text: string; message: string }) => { put = a; return { ok: true, value: { commitSha: 'c1', contentSha: 'sha-2' } } } }),
      args,
    )
    assert.equal(r.status, 'accepted')
    if (r.status === 'accepted') assert.equal(r.newBaseSha, 'sha-2')
    assert.ok(put)
    assert.ok(put!.text.startsWith('---\ntitle: "표본"'))
    assert.ok(put!.text.endsWith('고친 본문\n'))
    assert.ok(put!.message.includes('[editor:123e4567]'))
    assert.ok(!put!.message.includes('e@x.y'))
  })
  it('SHA가 다르면 conflict + 최신본 동봉', async () => {
    const r = await submitBodyCore(
      deps({ getFile: async () => ({ ok: true, value: { text: SAMPLE, sha: 'sha-2' } }) }),
      args,
    )
    assert.equal(r.status, 'conflict')
    if (r.status === 'conflict') {
      assert.equal(r.latestSha, 'sha-2')
      assert.equal(r.latestBody, '원래 본문\n')
    }
  })
  it('검증 실패 본문은 rejected(커밋 시도 없음)', async () => {
    let putCalled = false
    const big = 'a'.repeat(200 * 1024 + 1)
    const r = await submitBodyCore(
      deps({ putFile: async () => { putCalled = true; return { ok: true, value: { commitSha: 'c1' } } } }),
      { ...args, body: big },
    )
    assert.equal(r.status, 'rejected')
    assert.equal(putCalled, false)
  })
  it('rate limit 초과는 rate_limited', async () => {
    const r = await submitBodyCore(deps({ rateLimit: () => false }), args)
    assert.equal(r.status, 'rate_limited')
  })
  it('비로그인은 forbidden + needLogin 문구', async () => {
    const r = await submitBodyCore(
      deps({ getEditor: async () => ({ canEdit: false, userId: null, email: null }) }),
      args,
    )
    assert.equal(r.status, 'forbidden')
    if (r.status === 'forbidden') assert.ok(r.message.includes('로그인'))
  })
  it('로그인했으나 무권한은 forbidden + 기존 문구(권한 등록 안내)', async () => {
    const r = await submitBodyCore(
      deps({ getEditor: async () => ({ canEdit: false, userId: 'user-1', email: 'e@x.y' }) }),
      args,
    )
    assert.equal(r.status, 'forbidden')
    if (r.status === 'forbidden') assert.ok(r.message.includes('권한 등록'))
  })
  it('PUT 시점 레이스 충돌은 자기 제출값이 아닌 재조회한 서버 최신본을 동봉', async () => {
    let getFileCalls = 0
    const LATEST = '---\ntitle: "표본"\nstatus: published\n---\n다른 사람이 고친 본문\n'
    const r = await submitBodyCore(
      deps({
        getFile: async () => {
          getFileCalls += 1
          if (getFileCalls === 1) return { ok: true, value: { text: SAMPLE, sha: 'sha-1' } }
          return { ok: true, value: { text: LATEST, sha: 'sha-2' } }
        },
        putFile: async () => ({ ok: false, reason: 'conflict' }),
      }),
      args,
    )
    assert.equal(r.status, 'conflict')
    if (r.status === 'conflict') {
      assert.equal(r.latestSha, 'sha-2')
      assert.equal(r.latestBody, '다른 사람이 고친 본문\n')
    }
    assert.equal(getFileCalls, 2)
  })
})
