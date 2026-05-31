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

function shuffle<T>(arr: T[]): T[] {
  return arr.sort(() => Math.random() - 0.5)
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
          .limit(10)

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

    const count = Math.min(topicNames.length * 2, 30)

    // ── DB-first: try quiz_questions table before calling OpenAI ─────────────
    if (body.chapterNumber) {
      try {
        const sb = getServiceClient()
        const { data: dbRows } = await sb
          .from('quiz_questions')
          .select('*')
          .eq('board', 'KPK')
          .eq('chapter_slug', body.chapterNumber)
          .limit(60)

        if (dbRows && dbRows.length >= 10) {
          console.log('[generate-quiz legacy] serving from DB:', dbRows.length, 'questions')
          return NextResponse.json({ ok: true, questions: shuffle(dbRows).slice(0, count), count })
        }
        console.log('[generate-quiz legacy] DB returned', dbRows?.length ?? 0, 'questions — falling back to OpenAI')
      } catch (dbErr: any) {
        console.warn('[generate-quiz legacy] DB query failed:', dbErr?.message)
      }
    }

    const seed = Math.random().toString(36).substring(7)

    console.log('[generate-quiz legacy] chapter:', resolvedTitle, '| topics:', topicNames.length, '| count:', count)

    const prompt = `Generate ${count} FSc Chemistry MCQs for Grade 11 KPK board Pakistan.
Chapter: ${resolvedTitle || 'FSc Chemistry'} | Topics: ${topicNames.slice(0, 15).join(', ')}
Seed: ${seed}
Return ONLY a JSON array, no markdown:
[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"B","topic_name":"..."}]
Rules: cover all topics, plausible distractors, vary correct_answer across A B C D equally.`

    const legacyController = new AbortController()
    const legacyTimer = setTimeout(() => legacyController.abort(), 55000)
    let openaiRes: Response
    try {
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: legacyController.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 2500,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      clearTimeout(legacyTimer)
    } catch (fetchErr: any) {
      clearTimeout(legacyTimer)
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
    const safeCount = Math.min(count, 30)

    let truncatedContext = ''
    try {
      const sb = getServiceClient()
      const { data: chunks } = await sb
        .from('content_chunks')
        .select('topic_slug, book_definition')
        .limit(8)

      if (chunks && chunks.length > 0) {
        const raw = chunks
          .map((c: any) => `[${c.topic_slug ?? 'general'}]: ${(c.book_definition || '').slice(0, 200)}`)
          .join('\n')
        truncatedContext = raw.slice(0, 2000)
      }
    } catch (chunkErr: any) {
      console.warn('[generate-quiz page] content_chunks fetch failed:', chunkErr?.message)
    }

    // ── DB-first: try quiz_questions table before calling OpenAI ─────────────
    if (chapterSlugs.length > 0) {
      try {
        const sb = getServiceClient()
        const { data: dbRows } = await sb
          .from('quiz_questions')
          .select('*')
          .eq('board', 'KPK')
          .in('chapter_slug', chapterSlugs)
          .limit(60)

        if (dbRows && dbRows.length >= 10) {
          console.log('[generate-quiz page] serving from DB:', dbRows.length, 'questions')
          return NextResponse.json({ ok: true, questions: shuffle(dbRows).slice(0, safeCount) })
        }
        console.log('[generate-quiz page] DB returned', dbRows?.length ?? 0, 'questions — falling back to OpenAI')
      } catch (dbErr: any) {
        console.warn('[generate-quiz page] DB query failed:', dbErr?.message)
      }
    }

    const seed = Math.random().toString(36).substring(7)

    const prompt = `Generate ${safeCount} FSc Chemistry MCQs for KPK board Pakistan.${truncatedContext ? `\nContent:\n${truncatedContext}` : ''}
Return ONLY valid JSON: {"questions":[{"question":"...","options":["opt1","opt2","opt3","opt4"],"correct_index":0,"explanation":"brief","topic_slug":"slug"}]}
Rules: 4 options each, 1 correct answer, vary correct_index 0-3 equally. Seed: ${seed}`

    const pageController = new AbortController()
    const pageTimer = setTimeout(() => pageController.abort(), 55000)
    let openaiRes: Response
    try {
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: pageController.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      clearTimeout(pageTimer)
    } catch (fetchErr: any) {
      clearTimeout(pageTimer)
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
