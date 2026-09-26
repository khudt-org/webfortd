import 'server-only'

/**
 * 비용 유발 API(외부 유료 호출: Deepgram·Gemini·Upstage)용 경량 rate limiter.
 *
 * 설계:
 *   - in-memory sliding window. Vercel Fluid Compute는 함수 인스턴스를 동시 요청 간
 *     재사용하므로 인스턴스 수명 동안 카운터가 유지된다. 인스턴스가 여러 개면
 *     한도가 인스턴스 수만큼 곱해질 수 있는 best-effort 방어선 — 분산 카운터(Upstash 등)
 *     도입 전까지의 1차 가드로, 단일 IP의 비용 폭주(루프 호출)를 차단하는 목적.
 *   - 키는 클라이언트 IP (Vercel `x-forwarded-for` 첫 항목). IP를 알 수 없으면
 *     'unknown' 버킷으로 묶어 보수적으로 제한.
 *   - 메모리 누수 방지: 호출 시마다 만료 엔트리를 정리하고 버킷 수 상한을 둔다.
 */

interface Bucket {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000 // 비정상적으로 많은 고유 IP가 쌓이면 오래된 것부터 정리

export interface RateLimitResult {
  ok: boolean
  /** 한도 초과 시 재시도까지 남은 초 (안내 메시지용) */
  retryAfterSeconds: number
}

/**
 * 슬라이딩 윈도우 검사. windowMs 동안 limit회 초과 시 거부.
 * @param key 식별자 (보통 `${라우트}:${ip}`)
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      // 가장 오래 전에 삽입된 키부터 제거 (Map은 삽입 순서 유지)
      const oldest = buckets.keys().next().value
      if (oldest !== undefined) buckets.delete(oldest)
    }
    bucket = { timestamps: [] }
    buckets.set(key, bucket)
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs)

  if (bucket.timestamps.length >= limit) {
    const oldestInWindow = bucket.timestamps[0]
    const retryAfterMs = windowMs - (now - oldestInWindow)
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  bucket.timestamps.push(now)
  return { ok: true, retryAfterSeconds: 0 }
}

/** Vercel/프록시 환경에서 클라이언트 IP 추출. 없으면 'unknown'. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** 429 JSON 응답 헬퍼 (Retry-After 헤더 포함, 한국어 안내). */
export function json429(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({
      error: `요청이 너무 잦아요. ${retryAfterSeconds}초 후 다시 시도해 주세요.`,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'retry-after': String(retryAfterSeconds),
      },
    },
  )
}

/**
 * 채팅 이력 조회(`GET /api/chat/threads`·`/api/chat/threads/[id]`) 한도. 유료 호출은 없지만
 * 매 호출이 인증 조회 + DB select라 루프 호출을 막는다. 두 라우트가 한 버킷을 공유한다
 * (목록 1회 + 복원 여러 회가 한 화면 흐름이라). 정상 사용(화면 진입마다 수 회)에는 닿지 않는다.
 */
export const CHAT_HISTORY_READ_LIMIT = 60
export const CHAT_HISTORY_READ_WINDOW_MS = 60_000

/** 이력 조회 한도 검사. 초과면 429 응답, 아니면 null. */
export function limitChatHistoryRead(req: Request): Response | null {
  const rate = checkRateLimit(
    `chat-history:${getClientIp(req)}`,
    CHAT_HISTORY_READ_LIMIT,
    CHAT_HISTORY_READ_WINDOW_MS,
  )
  return rate.ok ? null : json429(rate.retryAfterSeconds)
}
