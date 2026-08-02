import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { QUIZ_TARGET_COUNT, QUIZ_MIN_COUNT, QUIZ_MIN_TOPIC_COVERAGE } from '@/lib/quizConfig'
import {
  validateQuestions,
  buildSourceBlocks,
  batchChunks,
  shuffleOptions,
  groundingRules,
  type ContentChunk,
  type RawQuestion,
} from '@/lib/quizValidation'

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

// Fisher-Yates. `arr.sort(() => Math.random() - 0.5)` is not a uniform shuffle
// (and mutates its input), which skewed which DB questions students saw.
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Generates + validates questions for ONE batch of sources.
 *
 * Batches are run in parallel by the callers: a whole chapter in a single
 * prompt measured ~160s against a 60s route budget, because the model emits
 * "working" for every question serially.
 */
async function generateBatch(opts: {
  chunks: ContentChunk[]
  header: string
  count: number
  perSourceMax: number
  timeoutMs: number
  tag: string
}): Promise<RawQuestion[]> {
  const { chunks, header, count, perSourceMax, timeoutMs, tag } = opts
  const chunkIndex = new Map<string, ContentChunk>(chunks.map((c) => [String(c.id), c]))

  const prompt = `${header}

${groundingRules(count, perSourceMax)}

SOURCES
${buildSourceBlocks(chunks)}

Return ONLY this JSON object:
{"questions":[{"source_id":"<id>","working":"<how you got the answer>","answer_text":"<the answer as plain text>","question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"B","explanation":"<one sentence, from the source>"}]}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,   // factual recall, not creative writing
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      console.error(`[${tag}] OpenAI HTTP ${res.status}:`, (await res.text()).slice(0, 200))
      return []
    }

    const data = await res.json()
    const rawText: string = data.choices?.[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(rawText)
    const candidates: RawQuestion[] = Array.isArray(parsed) ? parsed : (parsed.questions ?? [])
    if (!Array.isArray(candidates)) return []

    const { kept, rejected } = validateQuestions(candidates, chunkIndex)
    console.log(`[${tag}] ${chunks.length} sources -> ${candidates.length} generated, ${kept.length} passed`,
      Object.keys(rejected).length ? `| rejected: ${JSON.stringify(rejected)}` : '')
    return kept.map(shuffleOptions)
  } catch (err: any) {
    console.error(`[${tag}] batch failed:`, err?.name === 'AbortError' ? 'timeout' : err?.message)
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** De-duplicates by question text, so parallel batches cannot repeat a fact. */
function dedupeQuestions(questions: RawQuestion[]): RawQuestion[] {
  const seen = new Set<string>()
  const out: RawQuestion[] = []
  for (const q of questions) {
    const key = String(q.question).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
  }
  return out
}

// Normalise a topic string for fuzzy matching (case/punctuation-insensitive).
function normTopic(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Fraction of `topicNames` that appear as a question's `topic_name`.
// Returns 1 (skip) when the batch carries no topic_name at all, so a missing
// field never falsely fails a quiz — the prompt still requests it.
function topicCoverage(questions: any[], topicNames: string[]): number {
  const sent = topicNames.map(normTopic).filter(Boolean)
  if (sent.length === 0) return 1
  const returned = questions.map(q => normTopic(q?.topic_name)).filter(Boolean)
  if (returned.length === 0) return 1
  const covered = new Set<string>()
  for (const s of sent) {
    if (returned.some(r => r === s || r.includes(s) || s.includes(r))) covered.add(s)
  }
  return covered.size / sent.length
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
    let chunks: ContentChunk[] = []
    let resolvedUnit = Number(body.chapterNumber) || 0

    // Always load the chapter's chunks — they are the only permitted source of
    // fact for generation, and the only source of real subtopic labels.
    //
    // NOTE: content_chunks keys on `chapter` (integer unit number), NOT on a
    // `chapter_id` uuid — that column does not exist. The old
    // `.eq('chapter_id', <uuid>)` therefore threw on every single call and the
    // catch below swallowed it, which is why generation was never grounded and
    // every topic badge fell through to the "<Chapter> — General" label.
    try {
      const sb = getServiceClient()

      if (!resolvedUnit && resolvedChapterId) {
        const { data: ch } = await sb
          .from('chapters')
          .select('unit_number, title')
          .eq('id', String(resolvedChapterId))
          .single()
        if (ch) {
          resolvedUnit = ch.unit_number
          resolvedTitle = resolvedTitle || ch.title
        }
      }

      if (resolvedUnit) {
        const { data, error } = await sb
          .from('content_chunks')
          .select('id, section, term, topic_slug, book_definition, guide_explanation, formula, example_q, example_solution, example_answer')
          .eq('chapter', resolvedUnit)
          .order('section')
        if (error) throw new Error(error.message)
        chunks = data ?? []
      }

      if (chunks.length > 0 && resolvedTopics.length === 0) {
        resolvedTopics = chunks.map((c) => ({
          topic_title: c.term ?? undefined,
          term: c.term ?? undefined,
          topic_slug: c.topic_slug ?? undefined,
        }))
      }
      console.log('[generate-quiz legacy] loaded', chunks.length, 'grounding chunks for unit', resolvedUnit)
    } catch (chunkErr: any) {
      console.error('[generate-quiz legacy] chunk load FAILED:', chunkErr?.message)
    }

    // No chunks means no grounded source of truth. Refusing is correct —
    // the old generic-topic fallback just licensed the model to invent a quiz.
    if (chunks.length === 0) {
      console.error('[generate-quiz legacy] no content_chunks for unit', resolvedUnit, '— refusing to generate')
      return NextResponse.json(
        { questions: [], error: 'No chapter content available to build a quiz from.' },
        { status: 503 },
      )
    }

    // Normalise topic names — accept both `term` and `topic_title` shapes
    const topicNames = resolvedTopics
      .map(t => t.term || t.topic_title || '')
      .filter(Boolean)

    // Aim for QUIZ_TARGET_COUNT, but never fewer than one question per topic.
    // Chapters with more topics than the target (currently ch2=32, ch16=33)
    // get a slightly longer quiz — one question per topic — rather than
    // silently dropping the extras (the old `.slice(0, 15)` bug).
    const topicCount = topicNames.length
    const count = Math.max(QUIZ_TARGET_COUNT, topicCount || QUIZ_TARGET_COUNT)
    const perTopicMax = Math.ceil(count / (topicCount || count))

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

        if (dbRows && dbRows.length >= QUIZ_MIN_COUNT) {
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

    // Sources are split into batches generated IN PARALLEL. One prompt holding
    // a whole chapter measured ~160s against this route's 60s budget.
    const batches = batchChunks(chunks, 8)
    const perBatchCount = Math.ceil(count / batches.length)
    const header = `You are writing FSc Chemistry Grade 11 MCQs for the KPK board, Pakistan.
Chapter: ${resolvedTitle || 'FSc Chemistry'}
Seed: ${seed}`

    console.log('[generate-quiz legacy] chapter:', resolvedTitle,
      '| chunks:', chunks.length, '| batches:', batches.length, '| target:', count)

    const settled = await Promise.allSettled(
      batches.map((batch, i) => generateBatch({
        chunks: batch,
        header,
        count: perBatchCount,
        perSourceMax: perTopicMax,
        timeoutMs: 45000,
        tag: `generate-quiz legacy b${i + 1}/${batches.length}`,
      })),
    )

    let questions = dedupeQuestions(
      settled.flatMap(r => (r.status === 'fulfilled' ? r.value : [])),
    )

    const coverage = topicCoverage(questions, topicNames)
    console.log('[generate-quiz legacy] merged', questions.length, 'questions |',
      Math.round(coverage * 100) + '% topic coverage')

    if (questions.length < QUIZ_MIN_COUNT) {
      return NextResponse.json({
        questions: [],
        error: `Only ${questions.length} questions passed validation (need ${QUIZ_MIN_COUNT})`,
      })
    }

    if (coverage < QUIZ_MIN_TOPIC_COVERAGE) {
      console.warn('[generate-quiz legacy] thin topic coverage',
        Math.round(coverage * 100) + '% — serving anyway, batching already spreads across sources')
    }

    questions = shuffle(questions).slice(0, count)

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

    // Grounding sources. Previously each chunk was cut to 200 chars and the
    // whole context to 4000 — which sliced definitions, formulas and worked
    // examples mid-sentence, so the model was "grounded" on fragments and
    // filled the gaps from memory. Full rows now, capped by row count.
    let chunks: ContentChunk[] = []
    try {
      const sb = getServiceClient()
      const chunkQuery = sb
        .from('content_chunks')
        .select('id, section, term, topic_slug, book_definition, guide_explanation, formula, example_q, example_solution, example_answer')
        .order('section')
        .limit(60)

      const { data, error } = chapterSlugs.length > 0
        ? await chunkQuery.eq('board', 'KPK').in('chapter', chapterSlugs.map(Number))
        : await chunkQuery
      if (error) throw new Error(error.message)
      chunks = data ?? []
      console.log('[generate-quiz page] loaded', chunks.length, 'grounding chunks for', chapterSlugs.join(',') || 'all chapters')
    } catch (chunkErr: any) {
      console.error('[generate-quiz page] content_chunks fetch failed:', chunkErr?.message)
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

    // Same refusal rule as the chapter path: no grounding, no quiz.
    if (chunks.length === 0) {
      console.error('[generate-quiz page] no content_chunks available — refusing to generate')
      return NextResponse.json(
        { questions: [], error: 'No chapter content available to build a quiz from.' },
        { status: 503 },
      )
    }

    const seed = Math.random().toString(36).substring(7)
    const perSourceMax = Math.max(1, Math.ceil(safeCount / chunks.length))

    // Same parallel batching as the chapter path — one prompt holding every
    // chunk blows past the route budget.
    const batches = batchChunks(chunks, 8)
    const perBatchCount = Math.ceil(safeCount / batches.length)
    const header = `You are writing FSc Chemistry MCQs for the KPK board, Pakistan.
Seed: ${seed}`

    console.log('[generate-quiz page] chunks:', chunks.length, '| batches:', batches.length, '| target:', safeCount)

    const settled = await Promise.allSettled(
      batches.map((batch, i) => generateBatch({
        chunks: batch,
        header,
        count: perBatchCount,
        perSourceMax,
        timeoutMs: 45000,
        tag: `generate-quiz page b${i + 1}/${batches.length}`,
      })),
    )

    const merged = dedupeQuestions(
      settled.flatMap(r => (r.status === 'fulfilled' ? r.value : [])),
    )

    if (merged.length === 0) {
      return NextResponse.json({ questions: [], error: 'No questions survived validation' })
    }

    // /quiz reads options[] + correct_index (getOptions/getCorrectIndex accept
    // both shapes, but emit the array form explicitly).
    const questions = shuffle(merged).slice(0, safeCount).map((q) => {
      const opts = ['A', 'B', 'C', 'D'].map(k => q.options![k])
      return {
        ...q,
        options: opts,
        correct_index: ['A', 'B', 'C', 'D'].indexOf(String(q.correct_answer)),
      }
    })

    console.log('[generate-quiz page] merged', questions.length, 'questions')
    return NextResponse.json({ ok: true, questions })

  } catch (error: any) {
    console.error('[generate-quiz page] unhandled error:', error)
    return NextResponse.json({ questions: [], error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}
