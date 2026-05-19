import { getSupabaseClient } from '@/lib/supabase'

export interface QuizAttemptPayload {
  userId: string
  mode: 'quick' | 'sunday'
  totalQuestions: number
  correctCount: number
  wrongCount: number
  accuracy: number
  xpEarned: number
  chapterSlugs: string[]
  board?: string
}

export async function saveQuizAttempt(payload: QuizAttemptPayload) {
  const sb = getSupabaseClient()
  if (!sb) return null

  const { data, error } = await sb.from('quiz_attempts').insert({
    user_id: payload.userId,
    mode: payload.mode,
    total_questions: payload.totalQuestions,
    correct_count: payload.correctCount,
    wrong_count: payload.wrongCount,
    accuracy: payload.accuracy,
    xp_earned: payload.xpEarned,
    chapter_slugs: payload.chapterSlugs,
    board: payload.board ?? 'kpk',
    attempted_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[saveQuizAttempt] error:', error.message)
    return null
  }

  return data
}
