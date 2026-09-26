/**
 * Phase 3 M3 — RAG 채팅 Route Handler.
 *
 * 흐름:
 *   validateUIMessages → clampHistory(5턴) → extractUserText
 *   → retrieveChunks(topK=5) → buildSystemPrompt
 *   → convertToModelMessages → streamText(gateway('google/gemini-3.5-flash'))
 *   → toUIMessageStreamResponse + source_refs in messageMetadata
 *
 * 설계 결정:
 *   - runtime='nodejs': service_role + retrieval RPC (Edge 비호환)
 *   - maxDuration=60: streamText 60초 timeout
 *   - PIPA: user query 본문 로그 X, 토큰 사용량만 onFinish 로그
 *   - AI Gateway 인증은 Task 8 활성화 후 smoke (Task 4)에서 검증
 *
 * 참고: docs/superpowers/specs/2026-05-23-phase-3-rag-design.md §7.2
 */
import {
  streamText,
  gateway,
  convertToModelMessages,
  validateUIMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import { checkRateLimit, getClientIp, json429 } from '@/lib/rate-limit'
import { retrieveChunks } from '@/lib/rag/retrieval.ts'
import { buildSystemPrompt, clampHistory } from '@/lib/rag/prompt-builder.ts'
import { getBearerJwt, getRequestAuth } from '@/lib/supabase/request-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { parseHwpToMarkdown } from '@/lib/chat/upstage-parse.ts'
import {
  ALLOWED_MIMES,
  MAX_FILE_SIZE,
  SIGNATURE_PROBE_BYTES,
  matchesFileSignature,
} from '@/lib/chat/file-validation.ts'
import { getPreviewActive } from '@/lib/admin/preview'

// M7.2 — HWP/HWPX MIME 집합. 서버에서 Upstage Document Parse로 markdown 추출.
// PDF/이미지는 messages.parts에 그대로 두어 Gemini multimodal로 직접 전달.
const HWP_MIMES = new Set([
  'application/x-hwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/zip', // HWPX 구버전 흡수 (file-validation.ts 정합)
])

// M7.2 patch — 서버 invariant. 클라이언트 검증(file-validation.ts) 우회 시 server reject.
// codex-rescue P1 #3: 직접 POST로 여러 HWP 연속 호출 또는 대용량 PDF 우회 차단.
const SERVER_ALLOWED_MIMES = new Set<string>([...ALLOWED_MIMES, 'application/zip'])

interface FilePartLike {
  mediaType: string
  url: string
  filename?: string
}

/**
 * data URL 또는 base64 string의 decoded byte 길이를 계산.
 * `data:${mime};base64,${b64}` → b64 길이 * 3 / 4 - padding.
 */
function decodedByteLength(url: string): number {
  const base64 = url.startsWith('data:') ? url.split(',')[1] ?? '' : url
  const padding = (base64.match(/=+$/)?.[0] ?? '').length
  return Math.floor((base64.length * 3) / 4) - padding
}

/** data URL 앞부분만 디코딩(시그니처 판정용). base64 4자 = 3바이트라 4의 배수로 자른다. */
function decodeHead(url: string, bytes: number): Uint8Array {
  const base64 = url.startsWith('data:') ? url.split(',')[1] ?? '' : url
  const chars = Math.ceil(bytes / 3) * 4
  return new Uint8Array(Buffer.from(base64.slice(0, chars), 'base64'))
}

export function validateFileParts(parts: FilePartLike[]): { ok: true } | { ok: false; reason: string } {
  if (parts.length > 1) {
    return { ok: false, reason: '한 번에 한 개 파일만 첨부할 수 있어요.' }
  }
  for (const fp of parts) {
    if (!SERVER_ALLOWED_MIMES.has(fp.mediaType)) {
      return { ok: false, reason: `지원하지 않는 파일 형식이에요. (${fp.mediaType})` }
    }
    if (!fp.url.startsWith('data:')) {
      return { ok: false, reason: '첨부 파일 형식이 올바르지 않아요.' }
    }
    if (decodedByteLength(fp.url) > MAX_FILE_SIZE) {
      return { ok: false, reason: '파일이 너무 커요. 10MB 이하만 가능해요.' }
    }
    // E6: 확장자·MIME만 바꾼 파일(예: 실행 파일을 .png로)이 Gemini·Upstage로 넘어가지 않게.
    if (!matchesFileSignature(fp.mediaType, decodeHead(fp.url, SIGNATURE_PROBE_BYTES))) {
      return {
        ok: false,
        reason: '파일 내용이 형식과 맞지 않아요. 파일이 손상됐거나 확장자가 바뀌었는지 확인해 주세요.',
      }
    }
  }
  return { ok: true }
}

export const runtime = 'nodejs' // service_role + retrieval RPC (Edge 비호환)
export const maxDuration = 60 // streamText 60초 timeout

const HISTORY_MAX_TURNS = 5 // D5
const RETRIEVAL_TOP_K = 5 // RAG design §7.2
const TITLE_MAX_CHARS = 30 // M5 D1 — thread title은 첫 user 메시지 첫 30자 truncate
// 비용 가드 — 익명 허용 엔드포인트인데 매 호출이 Gemini 임베딩+생성(+첨부 시 Upstage)
// 유료 호출로 직결되므로 IP당 한도. 정상 사용(응답 수 초 소요)에는 닿지 않는 수준.
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000

interface ChatRequestBody {
  messages?: unknown
  /** M5 — 클라이언트가 기존 thread 이어가기. 신규 thread는 undefined. */
  threadId?: string
}

export async function POST(req: Request): Promise<Response> {
  const rate = checkRateLimit(`chat:${getClientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!rate.ok) {
    return json429(rate.retryAfterSeconds)
  }

  // 1. 요청 본문 파싱
  let body: ChatRequestBody
  try {
    body = (await req.json()) as ChatRequestBody
  } catch {
    return json400('요청 본문이 유효한 JSON이 아니에요.')
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return json400('messages 배열이 비어 있어요.')
  }

  // 2. UIMessage 검증
  let validated: UIMessage[]
  try {
    validated = await validateUIMessages({ messages: body.messages as UIMessage[] })
  } catch (err) {
    return json400(`messages 형식이 올바르지 않아요: ${(err as Error).message}`)
  }

  // 3. history clamp (D5)
  let clamped: UIMessage[]
  try {
    clamped = clampHistory(validated, HISTORY_MAX_TURNS)
  } catch (err) {
    return json400((err as Error).message)
  }

  // 4. 마지막 user 메시지의 텍스트 + 파일 추출
  const lastUser = clamped[clamped.length - 1]
  const queryText = extractUserText(lastUser)
  const fileParts = extractFileParts(lastUser)
  if (!queryText.trim() && fileParts.length === 0) {
    return json400('질의 텍스트나 첨부 파일이 필요해요.')
  }

  // M7.2 patch — 서버 invariant 검증 (codex-rescue P1 #3).
  // 직접 POST 우회로 다중 파일·비허용 MIME·>10MB가 들어오면 reject.
  const validation = validateFileParts(fileParts)
  if (!validation.ok) {
    return json400(validation.reason)
  }

  // M7.2: HWP/HWPX는 Upstage Document Parse로 markdown 추출 → systemPrompt 추가 컨텍스트로.
  // PDF/이미지는 messages.parts에 남겨 Gemini multimodal로 직접 전달.
  let attachmentMarkdown: string | undefined
  const hwpParts = fileParts.filter((fp) => HWP_MIMES.has(fp.mediaType))
  if (hwpParts.length > 0) {
    try {
      const markdowns: string[] = []
      for (const fp of hwpParts) {
        const buffer = dataUrlToArrayBuffer(fp.url)
        const md = await parseHwpToMarkdown(buffer, fp.mediaType)
        markdowns.push(md)
      }
      attachmentMarkdown = markdowns.join('\n\n---\n\n')
    } catch (err) {
      // parseHwpToMarkdown은 이미 한국어 에러로 throw
      const msg = err instanceof Error ? err.message : '문서 파싱 중 오류가 발생했어요.'
      return json400(msg)
    }
    // HWP/HWPX part는 messages.parts에서 제거 — 이미 system prompt에 흡수됨
    lastUser.parts = (lastUser.parts ?? []).filter(
      (p) => p.type !== 'file' || !HWP_MIMES.has((p as { mediaType?: string }).mediaType ?? ''),
    )
  }

  // 5. RAG retrieval (M2). 첨부만 있고 텍스트 비면 첨부 markdown 첫 200자를 query로 fallback.
  const retrievalQuery = queryText.trim() || (attachmentMarkdown ?? '').slice(0, 200) || '첨부 문서'
  // M3(B7): RAG 기본 published-only. admin Draft Mode일 때만 draft 포함.
  // getPreviewActive() = draftMode().isEnabled ∧ 현재 사용자 isAdmin (M2 cookie 누수 방어 재사용).
  // 익명·일반 사용자는 includeDrafts 생략 → retrieval 기본값 false → 검수 안 된 draft 인용 차단.
  const includeDrafts = await getPreviewActive()
  let retrieval
  try {
    retrieval = await retrieveChunks(retrievalQuery, {
      topK: RETRIEVAL_TOP_K,
      includeDrafts,
    })
  } catch (err) {
    // retrieval.ts:92가 이미 formatSupabaseError로 마스킹된 Error 객체를 throw
    // (`match_chunks RPC 실패: [code] 한국어 description` 형태).
    // 여기서는 그대로 .message 사용 — PII 노출 없음 + catch unknown 타입 강제 캐스트 회피.
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[chat] retrieval failed:', errorMessage)
    return json500('자료 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.')
  }

  // 6. 시스템 프롬프트 조립 (M7.2: attachmentMarkdown 있으면 추가 섹션)
  const systemPrompt = buildSystemPrompt(retrieval.chunks, attachmentMarkdown)

  // 7. AI SDK v6 model messages 변환
  // AI SDK v6 권장: system은 별도 파라미터로 분리 (UIMessage system role prepend는 비표준).
  const modelMessages = await convertToModelMessages(clamped)

  // M5: 서버측 user 검증 (cookies 기반 SSR auth, 클라이언트 hint 신뢰 X).
  // 비로그인 사용자는 user=null → onFinish DB 저장 분기 skip.
  // M3(iOS): Bearer JWT가 있으면 우선 사용, 없으면 기존 쿠키 SSR 경로(웹 무회귀).
  const { user } = await getRequestAuth(req)

  // 8. streaming 응답
  const result = streamText({
    model: gateway('google/gemini-3.5-flash'),
    system: systemPrompt,
    messages: modelMessages,
  })

  // 9. UI message stream — sourceRefs·(신규) threadId를 생성 완료 "후" metadata로 전달.
  //
  // 이전 구현은 streamText.onFinish에서 newThreadId를 set하고
  // toUIMessageStreamResponse.messageMetadata({ part: 'finish' })에서 읽었지만,
  // 두 콜백은 서로 다른 tee 스트림에서 실행되어 순서 보장이 없다 —
  // DB RPC(수십~수백 ms)가 끝나기 전에 finish part가 먼저 흘러 threadId가
  // 거의 항상 누락됐다 (로그인 사용자의 대화가 턴마다 새 thread로 분절되는 버그).
  // createUIMessageStream.execute는 result.text를 await한 뒤 DB 저장을 마치고
  // message-metadata chunk를 직접 write하므로 순서가 구조적으로 보장된다.
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // finish chunk는 metadata write 후 수동 전송 (sendFinish: false)
      writer.merge(result.toUIMessageStream({ sendFinish: false }))

      // 본문 생성 완료 대기 (delta는 merge로 이미 클라이언트에 흐르는 중)
      const text = await result.text
      const usage = await result.usage

      // 비용·토큰 로그 (PIPA — user query 본문은 로그 X)
      console.log('[chat] finish', {
        promptTokens: usage?.inputTokens,
        completionTokens: usage?.outputTokens,
        chunksUsed: retrieval.chunks.length,
        sourcesCount: retrieval.sources.length,
        loggedIn: !!user,
      })

      // M5: 로그인 사용자만 DB 저장. 비로그인은 클라이언트 useState 휘발 모드.
      let newThreadId: string | null = null
      // E1: 저장을 기대할 만한 요청(로그인 or Bearer 제시)인데 저장되지 않았으면 신호를 낸다.
      // Bearer가 무효면 user=null로 조용히 비로그인 취급되던 경로(iOS 토큰 만료)가 대표 사례.
      // 헤더 없는 익명 요청은 휘발이 설계라 신호 대상이 아니다.
      let historyUnsaved = !user && getBearerJwt(req) !== null
      if (user) {
        const admin = getAdminClient()
        // Finding(critical): RPC 인자는 jsonb 컬럼에 그대로 바인딩되므로 객체를 직접 전달한다.
        // JSON.stringify를 거치면 jsonb 컬럼에 "이스케이프된 문자열"이 저장되는 이중 인코딩이
        // 발생해, 이후 select로 읽어올 때 배열이 아니라 string이 반환된다(이력 복원 깨짐).
        const tokenUsage = {
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
        }

        try {
          if (!body.threadId) {
            // M5 D2: 신규 thread (assistant 응답 성공 후 INSERT, partial state 회피)
            // M5 D3: 단일 RPC atomic (thread + 2 메시지)
            const title = queryText.slice(0, TITLE_MAX_CHARS)
            const { data, error } = await admin.rpc('create_thread_with_messages', {
              p_user_id: user.id,
              p_title: title,
              p_user_content: queryText,
              p_assistant_content: text,
              p_source_refs: retrieval.sources,
              p_token_usage: tokenUsage,
            })
            if (error) throw error
            newThreadId = data as string
          } else {
            // M5 D4: 기존 thread append (DB가 user_id 소유권 검증)
            const { error } = await admin.rpc('append_messages', {
              p_thread_id: body.threadId,
              p_user_id: user.id,
              p_user_content: queryText,
              p_assistant_content: text,
              p_source_refs: retrieval.sources,
              p_token_usage: tokenUsage,
            })
            if (error) throw error
          }
        } catch (err) {
          // PIPA: error.message는 retrieval.ts 패턴대로 마스킹된 형태로만 노출.
          // 사용자 응답은 이미 streaming 완료 — metadata의 historyUnsaved로만 알린다.
          const masked = err instanceof Error ? err.message : String(err)
          console.error('[chat] history save failed:', masked)
          historyUnsaved = true
        }
      }

      writer.write({
        type: 'message-metadata',
        messageMetadata: buildFinishMetadata(retrieval.sources, newThreadId, historyUnsaved),
      })
      writer.write({ type: 'finish' })
    },
  })

  return createUIMessageStreamResponse({ stream })
}

/**
 * 응답 완료 시 message-metadata. `historyUnsaved`는 저장 실패 때만 싣는다(성공·익명은 키 없음).
 */
export function buildFinishMetadata<T>(
  sourceRefs: T,
  newThreadId: string | null,
  historyUnsaved: boolean,
): { sourceRefs: T; threadId?: string; historyUnsaved?: true } {
  return {
    sourceRefs,
    ...(newThreadId ? { threadId: newThreadId } : {}),
    ...(historyUnsaved ? { historyUnsaved: true as const } : {}),
  }
}

/**
 * UIMessage.parts에서 text 파트만 추출·결합 (AI SDK v6 형식).
 * image 등 non-text 파트는 skip.
 */
export function extractUserText(message: UIMessage): string {
  const textParts = (message.parts ?? []).filter(
    (p): p is { type: 'text'; text: string } =>
      p.type === 'text' && typeof (p as { text?: unknown }).text === 'string',
  )
  return textParts
    .map((p) => p.text)
    .join('\n')
    .trim()
}

/**
 * M7.2 — UIMessage.parts에서 file 파트 추출. AI SDK v6 FileUIPart shape:
 * `{ type: 'file', mediaType: string, url: string, filename?: string }`
 *
 * 클라이언트가 url에 data URL(`data:${mime};base64,...`)로 인코딩해 전달.
 * 서버는 mediaType 분기 후 HWP/HWPX만 Upstage 위임, PDF/이미지는 messages.parts에
 * 남겨 Gemini multimodal로 직접 전달.
 */
export function extractFileParts(message: UIMessage): Array<{ mediaType: string; url: string; filename?: string }> {
  return (message.parts ?? [])
    .filter(
      (p): p is { type: 'file'; mediaType: string; url: string; filename?: string } =>
        p.type === 'file' &&
        typeof (p as { mediaType?: unknown }).mediaType === 'string' &&
        typeof (p as { url?: unknown }).url === 'string',
    )
    .map((p) => ({ mediaType: p.mediaType, url: p.url, filename: p.filename }))
}

/**
 * M7.2 — data URL(`data:${mime};base64,...`)에서 base64 본문 추출 → ArrayBuffer.
 * 일반 base64 string도 허용 (data URL prefix 없음).
 */
function dataUrlToArrayBuffer(url: string): ArrayBuffer {
  const base64 = url.startsWith('data:') ? url.split(',')[1] ?? '' : url
  const buf = Buffer.from(base64, 'base64')
  // Buffer.buffer가 ArrayBufferLike라 slice로 ArrayBuffer 보장
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export function json400(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export function json500(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
