/**
 * lib/streak.ts
 * -------------
 * Daily study-streak updater — call from any meaningful study action
 * (asking a question, viewing a topic, starting a quiz).
 *
 * Previously only chat send() updated the streak, so daily topic/quiz
 * activity never advanced it, and any 2+ day gap between chat messages
 * reset it to 1 — users were stuck on "1 Day Streak" forever.
 *
 * The localStorage guard uses the UTC date to match update_streak's SQL
 * date arithmetic (the old local-midnight guard let PKT early-morning
 * calls through to a same-UTC-day no-op, wasting the day's chance).
 * The SQL function itself is idempotent per UTC day (verified), so a
 * missing/cleared guard is harmless.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const GUARD_KEY = 'vu_last_streak'

export function touchDailyStreak(
  supabase: SupabaseClient | null | undefined,
  userId: string | null | undefined,
): void {
  if (!supabase || !userId || typeof window === 'undefined') return

  const todayUtc = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(GUARD_KEY) === todayUtc) return // already recorded today

  Promise.resolve(supabase.rpc('update_streak', { p_user_id: userId }))
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) {
        console.error('[streak] update_streak failed:', error.message)
        return
      }
      localStorage.setItem(GUARD_KEY, todayUtc)
      console.log('[streak] study activity recorded for', todayUtc)
    })
    .catch((e: unknown) => console.error('[streak] update_streak exception:', (e as Error)?.message))
}
