export async function generateAIQuestions({
  chapterSlugs,
  count,
  board = 'kpk',
}: {
  chapterSlugs: string[]
  count: number
  board?: string
}) {
  const res = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterSlugs, count, board }),
  })
  const data = await res.json()
  return data.questions ?? []
}
