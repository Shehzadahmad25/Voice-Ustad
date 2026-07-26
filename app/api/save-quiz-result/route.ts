import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { QUIZ_MIN_COUNT } from '@/lib/quizConfig';

export const runtime = 'nodejs';
export const maxDuration = 10; // fast DB queries only

interface Question {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct_answer: string;
  topic_name: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, chapter_id, chapter_title, answers, questions } = body as {
    user_id: string;
    chapter_id: string | number;
    chapter_title: string;
    answers: string[];
    questions: Question[];
  };

  if (!user_id || !chapter_id || !chapter_title || !answers || !questions?.length) {
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

  const db = getServiceClient();

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
