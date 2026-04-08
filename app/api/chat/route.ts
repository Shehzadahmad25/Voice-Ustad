/**
 * /api/chat — Clean strict-pipeline chat endpoint
 * ------------------------------------------------
 * FLOW:
 *   POST { question, chapterNumber }
 *     1. classifyQuestionType  — detect intent
 *     2. retrieveBookContent   — fetch ONLY matching DB blocks
 *     3. if not found          — return empty response immediately (no AI call)
 *     4. formatWithLLM         — format retrieved content (temp=0, JSON only)
 *     5. validateAnswer        — clean + validate; retry once on failure
 *     6. if retry fails        — fallback to raw DB blocks (no AI)
 *     7. return final JSON
 *
 * Response shape (success):
 * {
 *   found: true,
 *   questionType: "definition",
 *   chapter: "Unit 1 — Stoichiometry",
 *   topic: "Mole",
 *   page: 5,
 *   definition: "...",
 *   explanation: "",
 *   formula: "",
 *   flabel: "",
 *   example: ""
 * }
 *
 * Response shape (not found):
 * {
 *   found: false,
 *   questionType: "definition",
 *   chapter: "", topic: "", page: null,
 *   definition: "", explanation: "", formula: "", flabel: "", example: ""
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { classifyQuestionType }  from '@/lib/classifyQuestionType';
import { retrieveBookContent }   from '@/lib/retrieveBookContent';
import { formatWithLLM }         from '@/lib/formatWithLLM';
import { validateAnswer, buildFallback } from '@/lib/validateAnswer';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const MAX_QUESTION_CHARS = 400;

async function getSession(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ── Response builders ─────────────────────────────────────────────────────────

function notFoundResponse(questionType: string) {
  return NextResponse.json(
    {
      found: false,
      questionType,
      chapter: '',
      topic: '',
      page: null,
      definition: '',
      explanation: '',
      formula: '',
      flabel: '',
      example: '',
    },
    { status: 200 },
  );
}

function successResponse(
  questionType: string,
  chapter: string,
  topic: string,
  page: number | null,
  answer: {
    definition: string;
    explanation: string;
    formula: string;
    flabel: string;
    example: string;
  },
) {
  return NextResponse.json(
    {
      found: true,
      questionType,
      chapter,
      topic,
      page,
      definition:  answer.definition,
      explanation: answer.explanation,
      formula:     answer.formula,
      flabel:      answer.flabel,
      example:     answer.example,
    },
    { status: 200 },
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────────────────
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit (20 requests/min per user) ─────────────────────────────────
    const rl = checkRateLimit(`chat:${session.user.id}`, 20);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests', retryAfterMs: rl.retryAfterMs },
        { status: 429 },
      );
    }

    const body = await request.json();
    const question      = String(body?.question ?? '').trim();
    const chapterNumber = Number(body?.chapterNumber ?? 0);

    // ── Input validation ──────────────────────────────────────────────────────
    if (!question) {
      return NextResponse.json(
        { ok: false, error: 'question is required' },
        { status: 400 },
      );
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { ok: false, error: `question too long (max ${MAX_QUESTION_CHARS} chars)` },
        { status: 400 },
      );
    }
    if (!chapterNumber || chapterNumber <= 0) {
      return NextResponse.json(
        { ok: false, error: 'chapterNumber must be a positive integer' },
        { status: 400 },
      );
    }

    // ── Step 1: Classify ──────────────────────────────────────────────────────
    const questionType = classifyQuestionType(question);

    // ── Step 2: Retrieve from DB ──────────────────────────────────────────────
    const retrieval = await retrieveBookContent(question, questionType, chapterNumber);

    // ── Step 3: Not found → return immediately, no AI call ───────────────────
    if (!retrieval.found) {
      return notFoundResponse(questionType);
    }

    // ── Step 4: Format with LLM ───────────────────────────────────────────────
    console.log(`[chat] OpenAI call | user=${session.user.id} | chapter=${chapterNumber} | q=${question.slice(0, 80)}`);
    let formattedAnswer;
    try {
      formattedAnswer = await formatWithLLM(question, retrieval);
    } catch (llmErr) {
      // LLM failed entirely → fallback to raw DB blocks
      console.error('[chat/route] formatWithLLM failed:', llmErr);
      const fallback = buildFallback({}, retrieval.blocks, retrieval.page);
      return successResponse(
        questionType,
        retrieval.chapter,
        retrieval.topic,
        retrieval.page,
        fallback,
      );
    }

    // ── Step 5: Validate ──────────────────────────────────────────────────────
    let validation = validateAnswer(formattedAnswer);

    if (!validation.valid) {
      // ── Step 5a: One retry with the same retrieved content ─────────────────
      console.warn('[chat/route] validation failed, retrying:', validation.errors);
      try {
        const retryAnswer = await formatWithLLM(question, retrieval);
        validation = validateAnswer(retryAnswer);
      } catch {
        validation = { valid: false, errors: ['retry failed'], answer: formattedAnswer };
      }

      // ── Step 5b: Fallback to raw DB blocks ─────────────────────────────────
      if (!validation.valid) {
        console.warn('[chat/route] retry failed, using raw DB fallback');
        const fallback = buildFallback({}, retrieval.blocks, retrieval.page);
        return successResponse(
          questionType,
          retrieval.chapter,
          retrieval.topic,
          retrieval.page,
          fallback,
        );
      }
    }

    // ── Step 6: Return clean validated answer ─────────────────────────────────
    return successResponse(
      questionType,
      retrieval.chapter,
      retrieval.topic,
      retrieval.page,
      validation.answer,
    );

  } catch (err) {
    console.error('[chat/route] unhandled error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
