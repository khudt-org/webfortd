/**
 * E6 — /api/chat 서버 첨부 검증의 magic bytes 단계.
 * E1 — 이력 미저장 신호(finish metadata)와 이력 조회 rate limit.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateFileParts, buildFinishMetadata } from '@/app/api/chat/route.ts'
import { GET as listThreads } from '@/app/api/chat/threads/route.ts'
import { GET as getThread } from '@/app/api/chat/threads/[id]/route.ts'
import {
  checkRateLimit,
  CHAT_HISTORY_READ_LIMIT,
  CHAT_HISTORY_READ_WINDOW_MS,
} from '@/lib/rate-limit'

const dataUrl = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0, 0])

describe('validateFileParts — magic bytes (E6)', () => {
  it('선언 MIME과 시그니처가 맞으면 통과', () => {
    assert.deepEqual(
      validateFileParts([{ mediaType: 'image/png', url: dataUrl('image/png', PNG) }]),
      { ok: true },
    )
  })

  it('PNG라고 선언했지만 내용이 JPEG이면 거부(한국어 사유)', () => {
    const r = validateFileParts([{ mediaType: 'image/png', url: dataUrl('image/png', JPEG) }])
    assert.equal(r.ok, false)
    assert.match((r as { reason: string }).reason, /파일 내용이 형식과 맞지 않아요/)
  })

  it('비허용 MIME은 기존대로 형식 사유로 거부', () => {
    const r = validateFileParts([{ mediaType: 'text/plain', url: 'data:text/plain;base64,aGk=' }])
    assert.equal(r.ok, false)
    assert.match((r as { reason: string }).reason, /지원하지 않는 파일 형식/)
  })
})

describe('buildFinishMetadata — 이력 미저장 신호 (E1)', () => {
  it('저장 성공: historyUnsaved 없음, 신규 threadId 포함', () => {
    assert.deepEqual(buildFinishMetadata([], 'tid', false), { sourceRefs: [], threadId: 'tid' })
  })

  it('저장 안 됨: historyUnsaved: true', () => {
    assert.deepEqual(buildFinishMetadata([], null, true), { sourceRefs: [], historyUnsaved: true })
  })
})

describe('이력 조회 rate limit (E1)', () => {
  const ip = '203.0.113.77'
  const req = (url: string) => new Request(url, { headers: { 'x-forwarded-for': ip } })

  it('한도를 넘기면 두 조회 라우트 모두 인증 조회 전에 429', async () => {
    for (let i = 0; i < CHAT_HISTORY_READ_LIMIT; i++) {
      checkRateLimit(`chat-history:${ip}`, CHAT_HISTORY_READ_LIMIT, CHAT_HISTORY_READ_WINDOW_MS)
    }
    const list = await listThreads(req('https://x.test/api/chat/threads'))
    assert.equal(list.status, 429)
    assert.ok(list.headers.get('retry-after'))
    const id = '00000000-0000-0000-0000-000000000000'
    const one = await getThread(req(`https://x.test/api/chat/threads/${id}`), {
      params: Promise.resolve({ id }),
    })
    assert.equal(one.status, 429)
  })
})
