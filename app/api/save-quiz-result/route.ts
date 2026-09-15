import { NextRequest, NextResponse } from 'next/server';
import { requireUser, authError } from '@/lib/apiAuth';
import { QUIZ_MIN_COUNT } from '@/lib/quizConfig';

export const runtime = 'nodejs';
export const maxDuration = 10; // fast DB queries only

interface Question {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct_answer: string;
  topic_name: string;
}

/**
 * POST /api/save-quiz-result
 *
 * Identity comes from the bearer token (lib/apiAuth.ts), never from the body.
 * This route writes with the service-role client, so until 2026-09 anyone
 * could POST a fake result into any user's history by picking a user_id.
 *
 * The body may still carry `user_id` (the current client sends it). It is
 * compared against the token and a mismatch is REJECTED with 403 rather than
 * silently overwritten, so any caller sending someone else's id shows up in
 * the logs instead of being quietly corrected.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return authError(auth);
  const { db, userId } = auth;

  const body = await req.json();
  const { user_id: bodyUserId, chapter_id, chapter_title, answers, questions } = body as {
    user_id?: string;
    chapter_id: string | number;
    chapter_title: string;
    answers: string[];
    questions: Question[];
  };

  if (bodyUserId && bodyUserId !== userId) {
    console.warn(`[save-quiz-result] REJECTED user_id mismatch: body=${bodyUserId} token=${userId}`);
    return NextResponse.json(
      { ok: false, error: 'user_id does not match the signed-in user' },
      { status: 403 },
    );
  }
  const user_id = userId;

  if (!chapter_id || !chapter_title || !answers || !questions?.length) {
    return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
  }

  // Server-side safety net: never persist a stub quiz. A legitimately
  // generated chapter quiz always has >= QUIZ_MIN_COUNT questions.
  if (questions.length < QUIZ_MIN_COUNT) {
    return NextResponse.json(
      { ok: false, error: `Quiz too short (${questions.length} < ${QUIZ_MIN_COUNT}) — not saved` },
      { status: 422 },
    );
  }

  // Score calculation + per-topic breakdown
  let score = 0;
  const topicScores: Record<string, { correct: number; total: number }> = {};

  questions.forEach((q, i) => {
    const topic = q.topic_name || 'Unknown';
    if (!topicScores[topic]) topicScores[topic] = { correct: 0, total: 0 };
    topicScores[topic].total++;
    if (answers[i] === q.correct_answer) {
      score++;
      topicScores[topic].correct++;
    }
  });

  const total = questions.length;
  const percentage = Math.round((score / total) * 100);

  // Weak topics: scored < 60% on that topic
  const weak_topics = Object.entries(topicScores)
    .filter(([, s]) => s.total > 0 && s.correct / s.total < 0.6)
    .map(([topic]) => topic);

  const suggested_review = weak_topics.slice(0, 5);

  const { error: dbError } = await db.from('student_quiz_results').insert({
    user_id,
    chapter_id,
    chapter_title,
    score,
    total_questions: total,
    percentage,
    weak_topics,
    suggested_review,
    taken_at: new Date().toISOString(),
  });

  if (dbError) {
    console.error('[save-quiz-result] DB error:', dbError.message);
    // Still return results — save failure is non-fatal for the user
  }

  return NextResponse.json({ ok: true, score, total, percentage, weak_topics, suggested_review });
}
