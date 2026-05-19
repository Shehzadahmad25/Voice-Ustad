import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

interface TopicItem {
  topic_title: string
  topic_code?: string
}

// ── Legacy chapter-quiz shape (from chat sidebar) ────────────────────────────
interface LegacyBody {
  chapter_id?: string | number
  chapter_title?: string
  topics?: TopicItem[]
}

// ── New quiz-page shape ───────────────────────────────────────────────────────
interface QuizBody {
  chapterSlugs?: string[]
  count?: number
  board?: string
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as LegacyBody & QuizBody

  // Route to legacy handler if legacy fields present
  if (body.chapter_title && Array.isArray(body.topics)) {
    return handleLegacy(body as LegacyBody)
  }

  // New quiz-page handler
  return handleQuizPage(body as QuizBody)
}

// ── Legacy handler (chat sidebar "Take Chapter Quiz") ─────────────────────────
async function handleLegacy(body: LegacyBody): Promise<NextResponse> {
  const { chapter_title, topics } = body

  if (!chapter_title || !topics?.length) {
    return NextResponse.json(
      { ok: false, error: 'chapter_title and topics[] required' },
      { status: 400 },
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY not configured' },
      { status: 500 },
    )
  }

  const count =
    topics.length <= 5 ? 30 : topics.length <= 10 ? 40 : 50
  const topicList = topics.map((t) => t.topic_title).join(', ')
  const seed = Math.random().toString(36).substring(7)

  const prompt = `You are a chemistry teacher creating a multiple choice quiz for FSc (Grade 11) students in Pakistan studying KPK board.

Chapter: ${chapter_title}
Variation seed: ${seed} — use this to generate fresh, unique questions different from previous runs.

You must cover ALL of these topics: ${topicList}
Distribute ${count} questions evenly across all topics.
Each topic must appear in at least 2-3 questions. No topic may be skipped.

Question style — vary across these types for each topic:
- Definition: "What is X?" or "Which statement best defines X?"
- Formula/equation: "What is the formula for X?" or "Which equation represents X?"
- Calculation/application: numerical or applied problem using the concept
- Example/identification: "Which of the following is an example of X?"

Rules:
1. Generate exactly ${count} questions total
2. Only test concepts from the topic list above
3. Each question has exactly 4 options: A, B, C, D
4. Exactly one correct answer per question
5. Questions must be clear, unambiguous, and appropriate for Grade 11 KPK board
6. Distractors (wrong options) must be plausible, not obviously wrong

Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Format:
[
  {
    "question": "Question text?",
    "options": { "A": "option a", "B": "option b", "C": "option c", "D": "option d" },
    "correct_answer": "A",
    "topic_name": "Topic Name"
  }
]`

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error('[generate-quiz legacy] OpenAI error:', errText)
    return NextResponse.json(
      { ok: false, error: `OpenAI API error: ${openaiRes.status}` },
      { status: 500 },
    )
  }

  const openaiData = await openaiRes.json()
  const rawText: string = openaiData.choices?.[0]?.message?.content ?? ''

  let questions: unknown[]
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')
    questions = JSON.parse(jsonMatch[0])
    if (!Array.isArray(questions) || questions.length === 0)
      throw new Error('Empty questions array')
  } catch (e) {
    console.error('[generate-quiz legacy] parse error:', e, 'raw:', rawText.slice(0, 500))
    return NextResponse.json(
      { ok: false, error: 'Failed to parse OpenAI response' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, questions, count })
}

// ── New quiz-page handler ─────────────────────────────────────────────────────
async function handleQuizPage(body: QuizBody): Promise<NextResponse> {
  const { chapterSlugs = [], count = 10 } = body

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY not configured' },
      { status: 500 },
    )
  }

  // Fetch context chunks from Supabase using service role key
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  let contextLines: string[] = []

  if (supabaseUrl && serviceKey) {
    try {
      const sb = getServiceClient()
      const { data: chunks } = await sb
        .from('content_chunks')
        .select('topic_slug, term, book_definition, guide_explanation')
        .limit(20)

      if (chunks && chunks.length > 0) {
        contextLines = chunks.map((c: any) => {
          const parts = [c.term, c.book_definition, c.guide_explanation]
            .filter(Boolean)
            .join('. ')
          return `[${c.topic_slug ?? 'general'}]: ${parts}`
        })
      }
    } catch (err) {
      console.warn('[generate-quiz] content_chunks fetch failed, proceeding without context:', err)
    }
  }

  const contextBlock =
    contextLines.length > 0
      ? `\nUse this syllabus context to ground your questions:\n${contextLines.join('\n')}\n`
      : ''

  const chapterNote =
    chapterSlugs.length > 0
      ? `Focus on these chapters/topics: ${chapterSlugs.join(', ')}.`
      : 'Cover general FSc Chemistry topics.'

  const seed = Math.random().toString(36).substring(7)

  const prompt = `You are a chemistry teacher creating a multiple choice quiz for FSc students in Pakistan (KPK board).
${contextBlock}
${chapterNote}
Variation seed: ${seed}

Generate exactly ${count} multiple choice questions. Each question must have exactly 4 options (A, B, C, D) with exactly one correct answer. Include a brief explanation for the correct answer.

Return ONLY valid JSON (no markdown, no code fences) matching this schema:
{
  "questions": [
    {
      "id": "q1",
      "topic_slug": "topic-name",
      "question": "Question text?",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correct_answer": "A",
      "explanation": "Brief explanation of the correct answer."
    }
  ]
}`

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error('[generate-quiz] OpenAI error:', errText)
    return NextResponse.json(
      { ok: false, error: `OpenAI API error: ${openaiRes.status}` },
      { status: 500 },
    )
  }

  const openaiData = await openaiRes.json()
  const rawText: string = openaiData.choices?.[0]?.message?.content ?? ''

  let questions: unknown[] = []
  try {
    const parsed = JSON.parse(rawText)
    questions = parsed.questions ?? []
    if (!Array.isArray(questions)) throw new Error('questions is not array')
  } catch (e) {
    console.error('[generate-quiz] parse error:', e, 'raw:', rawText.slice(0, 500))
    return NextResponse.json(
      { ok: false, error: 'Failed to parse AI response' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, questions })
}
