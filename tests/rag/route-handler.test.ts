/**
 * Phase 3 M3 Task 3 — app/api/chat/route.ts helper 단위 테스트.
 *
 * Route Handler 자체는 Supabase + AI Gateway 통합 의존성이 커서 실 호출 X.
 * 분리 가능한 helper들을 named export로 노출 후 단위 검증:
 *   - extractUserText: UIMessage parts에서 text 추출
 *   - json400 응답 형식 회귀 가드
 *   - POST handler smoke: messages 빈 배열 → 400 (early return, retrieval 미호출)
 *
 * 실행: `npm test` (단위 테스트 포함 glob에 이미 포함됨)
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { extractUserText, json400, POST } from '../../src/app/api/chat/route.ts'
import type { UIMessage } from 'ai'

describe('rag/route-handler', () => {
  // ── extractUserText ─────────────────────────────────────────────────────────

  test('extractUserText — 단일 text part 추출', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'user',
      parts: [{ type: 'text', text: '편의지원 신청 방법을 알려주세요.' }],
    }
    const result = extractUserText(message)
    assert.strictEqual(result, '편의지원 신청 방법을 알려주세요.')
  })

  test('extractUserText — 여러 text parts 개행 연결', () => {
    const message: UIMessage = {
      id: 'm2',
      role: 'user',
      parts: [
        { type: 'text', text: '첫 번째 파트' },
        { type: 'text', text: '두 번째 파트' },
      ],
    }
    const result = extractUserText(message)
    assert.strictEqual(result, '첫 번째 파트\n두 번째 파트')
  })

  test('extractUserText — text 외 part(image 등) skip', () => {
    const message: UIMessage = {
      id: 'm3',
      role: 'user',
      parts: [
        // image part — text 속성 없음
        { type: 'image', image: 'data:image/png;base64,abc' } as unknown as Parameters<typeof extractUserText>[0]['parts'][number],
        { type: 'text', text: '이미지 설명해주세요.' },
      ],
    }
    const result = extractUserText(message)
    assert.strictEqual(result, '이미지 설명해주세요.')
  })

  test('extractUserText — parts 빈 배열 → 빈 문자열', () => {
    const message: UIMessage = {
      id: 'm4',
      role: 'user',
      parts: [],
    }
    const result = extractUserText(message)
    assert.strictEqual(result, '')
  })

  // ── POST handler smoke ───────────────────────────────────────────────────────

  test('POST — messages 빈 배열 → 400 "messages 배열이 비어 있어요."', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })

    const res = await POST(req)

    assert.strictEqual(res.status, 400)
    const body = await res.json() as { error?: string }
    assert.strictEqual(body.error, 'messages 배열이 비어 있어요.')
  })
})

// json400 helper 회귀 가드 (named export 검증)
test('json400 — status 400 + JSON error body', async () => {
  const res = json400('테스트 에러 메시지')
  assert.strictEqual(res.status, 400)
  const body = await res.json() as { error?: string }
  assert.strictEqual(body.error, '테스트 에러 메시지')
  assert.ok(res.headers.get('content-type')?.includes('application/json'))
})
