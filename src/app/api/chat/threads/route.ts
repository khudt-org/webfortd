/**
 * Phase 3 M5 — 로그인 사용자의 chat_threads 목록.
 *
 * GET only. RLS가 본인 thread만 반환 보장 (auth.uid() 매칭 + deleted_at is null).
 * 비로그인: 빈 배열 + 200 (UI가 분기 없이 안전하게 사용 가능).
 * M3(iOS): Bearer JWT가 있으면 우선 사용, 없으면 기존 쿠키 SSR 경로(웹 무회귀).
 */
import { limitChatHistoryRead } from '@/lib/rate-limit'
import { getRequestAuth } from '@/lib/supabase/request-auth'

export const runtime = 'nodejs'

const MAX_THREADS = 20 // spec §2 D6 — 시범 단계 절대 다수 사용자가 < 20 threads

export async function GET(request: Request): Promise<Response> {
  const limited = limitChatHistoryRead(request)
  if (limited) return limited

  const { supabase, user } = await getRequestAuth(request)

  if (!user) {
    return new Response(JSON.stringify({ threads: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const { data, error } = await supabase
    .from('chat_threads')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(MAX_THREADS)

  if (error) {
    console.error('[chat/threads] select failed:', error.message)
    return new Response(
      JSON.stringify({ error: '대화 목록을 불러오지 못했어요.' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    )
  }

  return new Response(JSON.stringify({ threads: data ?? [] }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
