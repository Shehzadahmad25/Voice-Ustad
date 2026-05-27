import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

interface TopicItem {
  topic_title?: string
  term?: string          // ScopeTopic shape from chat sidebar
  topic_code?: string
  topic_slug?: string
}

// ── Legacy chapter-quiz shape (from chat sidebar) ────────────────────────────
interface LegacyBody {
  chapter_id?: string | number   // Supabase UUID — used to fetch chunks as fallback
  chapterId?: string | number    // alias
  chapterNumber?: string         // '1'–'24'
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
  // FIX 4 — API key guard at the very top
  if (!process.env.OPENAI_API_KEY) {
    console.error('[generate-quiz] OPENAI_API_KEY not set')
    return NextResponse.json({ questions: [], error: 'API key not configured' }, { status: 500 })
  }

  // FIX 1 — entire handler wrapped in try/catch, always returns JSON
  try {
    const body = (await req.json()) as LegacyBody & QuizBody
    console.log('[generate-quiz] body:', JSON.stringify({
      chapter_title: body.chapter_title,
      chapterId: body.chapterId ?? body.chapter_id,
      chapterNumber: body.chapterNumber,
      topicsLength: body.topics?.length,
      topicsSample: body.topics?.slice(0, 2),
      chapterSlugs: body.chapterSlugs,
    }))

    // Route to legacy handler if legacy fields present
    if (body.chapter_title || body.chapterId || body.chapter_id) {
      return handleLegacy(body as LegacyBody)
    }

    // New quiz-page handler
    return handleQuizPage(body as QuizBody)

  } catch (error: any) {
    console.error('[generate-quiz] fatal error:', error)
    return NextResponse.json(
      { questions: [], error: error?.message ?? 'Unknown error' },
      { status: 500 },
    )
  }
}

// ── Legacy handler (chat sidebar "Take Chapter Quiz") ─────────────────────────
async function handleLegacy(body: LegacyBody): Promise<NextResponse> {
  try {
    const resolvedChapterId = body.chapterId ?? body.chapter_id
    let resolvedTitle = body.chapter_title ?? ''
    let resolvedTopics: TopicItem[] = body.topics ?? []

    // If topics array is empty or missing, fetch from content_chunks by chapter_id
    if (resolvedTopics.length === 0 && resolvedChapterId) {
      try {
        const sb = getServiceClient()
        const { data: chunks } = await sb
          .from('content_chunks')
          .select('topic_slug, term, book_definition')
          .eq('chapter_id', String(resolvedChapterId))
          .limit(60)

        if (chunks && chunks.length > 0) {
          resolvedTopics = chunks.map((c: any) => ({
            topic_title: c.term || c.topic_slug || 'General',
            term: c.term || c.topic_slug || 'General',
            topic_slug: c.topic_slug,
          }))
          console.log('[generate-quiz legacy] fetched', resolvedTopics.length, 'topics from chunks by chapter_id')
        }
      } catch (chunkErr: any) {
        console.warn('[generate-quiz legacy] chunk fallback failed:', chunkErr?.message)
      }
    }

    // Last-resort: generic topic so quiz always generates
    if (resolvedTopics.length === 0) {
      resolvedTopics = [{ topic_title: `${resolvedTitle || 'Chemistry'} — General`, term: `${resolvedTitle || 'Chemistry'} — General` }]
      console.warn('[generate-quiz legacy] no topics found, using generic fallback')
    }

    // Normalise topic names — accept both `term` and `topic_title` shapes
    const topicNames = resolvedTopics
      .map(t => t.term || t.topic_title || '')
      .filter(Boolean)

    const count = topicNames.length <= 5 ? 30 : topicNames.length <= 10 ? 40 : 50
    const topicList = topicNames.join(', ')
    const seed = Math.random().toString(36).substring(7)

    console.log('[generate-quiz legacy] chapter:', resolvedTitle, '| topics:', topicNames.length, '| count:', count)

    const prompt = `You are a chemistry teacher creating a multiple choice quiz for FSc (Grade 11) students in Pakistan studying KPK board.

Chapter: ${resolvedTitle || 'FSc Chemistry'}
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

    // FIX 2 — OpenAI call wrapped in its own try/catch
    let openaiRes: Response
    try {
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
    } catch (fetchErr: any) {
      console.error('[generate-quiz legacy] OpenAI fetch failed:', fetchErr?.message)
      return NextResponse.json({ questions: [], error: 'AI generation failed: ' + (fetchErr?.message ?? 'network error') })
    }

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[generate-quiz legacy] OpenAI HTTP error:', openaiRes.status, errText.slice(0, 200))
      return NextResponse.json({ questions: [], error: `OpenAI API error: ${openaiRes.status}` })
    }

    const openaiData = await openaiRes.json()
    const rawText: string = openaiData.choices?.[0]?.message?.content ?? ''
    console.log('[generate-quiz legacy] raw response:', rawText.substring(0, 200))

    // FIX 3 — Parse response safely
    let questions: unknown[]
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('No JSON array in response')
      questions = JSON.parse(jsonMatch[0])
      if (!Array.isArray(questions) || questions.length === 0)
        throw new Error('Empty questions array')
    } catch (parseError: any) {
      console.error('[generate-quiz legacy] JSON parse error:', parseError?.message, '| raw:', rawText.slice(0, 500))
      return NextResponse.json({ questions: [], error: 'Failed to parse AI response' })
    }

    return NextResponse.json({ ok: true, questions, count })

  } catch (error: any) {
    console.error('[generate-quiz legacy] unhandled error:', error)
    return NextResponse.json({ questions: [], error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

// ── New quiz-page handler ─────────────────────────────────────────────────────
async function handleQuizPage(body: QuizBody): Promise<NextResponse> {
  try {
    const { chapterSlugs = [], count = 10 } = body

    let contextLines: string[] = []
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
    } catch (chunkErr: any) {
      console.warn('[generate-quiz page] content_chunks fetch failed:', chunkErr?.message)
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

    // FIX 2 — OpenAI call wrapped in its own try/catch
    let openaiRes: Response
    try {
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      })
    } catch (fetchErr: any) {
      console.error('[generate-quiz page] OpenAI fetch failed:', fetchErr?.message)
      return NextResponse.json({ questions: [], error: 'AI generation failed: ' + (fetchErr?.message ?? 'network error') })
    }

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('[generate-quiz page] OpenAI HTTP error:', openaiRes.status, errText.slice(0, 200))
      return NextResponse.json({ questions: [], error: `OpenAI API error: ${openaiRes.status}` })
    }

    const openaiData = await openaiRes.json()
    const rawText: string = openaiData.choices?.[0]?.message?.content ?? '{}'
    console.log('[generate-quiz page] raw response:', rawText.substring(0, 200))

    // FIX 3 — Parse response safely
    let questions: unknown[] = []
    try {
      const parsed = JSON.parse(rawText)
      questions = parsed.questions ?? []
      if (!Array.isArray(questions)) throw new Error('questions is not array')
    } catch (parseError: any) {
      console.error('[generate-quiz page] JSON parse error:', parseError?.message, '| raw:', rawText.slice(0, 500))
      return NextResponse.json({ questions: [], error: 'Failed to parse AI response' })
    }

    return NextResponse.json({ ok: true, questions })

  } catch (error: any) {
    console.error('[generate-quiz page] unhandled error:', error)
    return NextResponse.json({ questions: [], error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}
