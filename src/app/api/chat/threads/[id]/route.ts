/**
 * M3(iOS): thread 메시지 복원. 웹 이력 복원 UX에도 재사용될 공용 자산.
 * RLS가 본인 thread·메시지만 반환 보장. 비로그인 401, 남의 thread는 RLS로 404.
 */
import { limitChatHistoryRead } from '@/lib/rate-limit'
import { getRequestAuth } from '@/lib/supabase/request-auth'

export const runtime = 'nodejs'

// uuid 형식 사전 검증: 잘못된 형식이 supabase까지 가면 22P02 오류로 500이 되므로,
// 여기서 걸러 404(조용한 미존재 취급)로 통일한다.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * source_refs 방어적 정규화. jsonb 컬럼이라 정상 경로면 배열이지만, 과거 이중 인코딩 버그
 * (route.ts가 JSON.stringify를 거쳐 저장한 문자열)로 남은 행이 있을 수 있어 문자열/배열/null
 * 3케이스를 모두 안전하게 배열로 통일한다. 파싱 실패는 빈 배열로 폴백(대화 본문 자체는 보존되고
 * 출처 카드만 비게 되는 열화가, 행 전체를 500 에러로 날리는 것보다 사용자에게 덜 해롭다).
 */
export function normalizeSourceRefs(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const limited = limitChatHistoryRead(request)
  if (limited) return limited

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return Response.json({ error: '대화를 찾을 수 없어요.' }, { status: 404 })
  }
  const { supabase, user } = await getRequestAuth(request)
  if (!user) {
    return Response.json({ error: '로그인이 필요해요.' }, { status: 401 })
  }
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('id, title')
    .eq('id', id)
    .maybeSingle()
  if (threadError) {
    console.error('[chat/threads/[id]] thread select 실패:', threadError.message)
    return Response.json({ error: '대화를 불러오지 못했어요.' }, { status: 500 })
  }
  if (!thread) {
    return Response.json({ error: '대화를 찾을 수 없어요.' }, { status: 404 })
  }
  const { data: messages, error: msgError } = await supabase
    .from('chat_messages')
    .select('id, role, content, source_refs, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })
  if (msgError) {
    console.error('[chat/threads/[id]] messages select 실패:', msgError.message)
    return Response.json({ error: '대화를 불러오지 못했어요.' }, { status: 500 })
  }
  const normalizedMessages = (messages ?? []).map((m) => ({
    ...m,
    source_refs: normalizeSourceRefs(m.source_refs),
  }))
  return Response.json({ thread, messages: normalizedMessages })
}
