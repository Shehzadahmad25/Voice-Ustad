import { getSupabaseClient } from '@/lib/supabase'

const LETTERS = ['A', 'B', 'C', 'D'] as const

function normalizeRow(row: any) {
  const opts: string[] = Array.isArray(row.options) ? row.options : Object.values(row.options ?? {})
  const idx: number = typeof row.correct_index === 'number' ? row.correct_index : 0
  return {
    id:           row.id ?? '',
    topic_slug:   row.topic_slug ?? '',
    chapter_slug: row.chapter_slug ?? '',
    question:     row.question ?? '',
    explanation:  row.explanation ?? '',
    options: {
      A: opts[0] ?? '',
      B: opts[1] ?? '',
      C: opts[2] ?? '',
      D: opts[3] ?? '',
    },
    correct_answer: LETTERS[idx] ?? 'A',
  }
}

export async function getQuizQuestions({
  chapterSlugs,
  limit,
  board = 'kpk',
}: {
  chapterSlugs: string[]
  limit: number
  board?: string
}) {
  const sb = getSupabaseClient()
  if (!sb) return []
  const { data, error } = await sb
    .from('quiz_questions')
    .select('*')
    .in('chapter_slug', chapterSlugs)
    .eq('board', board)
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(normalizeRow)
}
