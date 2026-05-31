'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Question {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct_answer: string;
  topic_name: string;
}

interface WrongItem {
  topic: string;
  chapter: string;
  question: string;
  yourAnswer: string;
  correctAnswer: string;
  topicSlug: string;
  chapterSlug: string;
}

interface QuizResultsData {
  score: number;
  total: number;
  pct: number;
  grade: string;
  xpEarned: number;
  wrongItems: WrongItem[];
}

export interface ScopeTopic {
  topic_code: string;
  topic_title: string;
  page: number | null;
}

interface Props {
  chapterId: string;
  chapterTitle: string;
  /** Chapter unit number as a string: '1' … '24'. Used for p_chapter_slug in RPCs. */
  chapterNumber: string;
  topics: ScopeTopic[];
  userId: string;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeFromPct(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'F';
}

function gradeColor(g: string): string {
  if (g === 'A+' || g === 'A') return '#22c55e';
  if (g === 'B+' || g === 'B') return '#3b82f6';
  if (g === 'C') return '#f97316';
  return '#ef4444';
}

function motivationalMsg(pct: number): string {
  if (pct >= 80) return "Excellent! You're well prepared 🎉";
  if (pct >= 60) return 'Good effort! Review weak topics 👍';
  if (pct >= 40) return 'Keep practicing! Focus on weak areas 📚';
  return 'Needs work. Revise these topics seriously ⚠️';
}

// ── Button styles ─────────────────────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '9px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
  fontFamily: 'inherit',
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: '#19c37d',
  color: '#000',
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.08)',
  color: '#ececec',
  border: '1px solid rgba(255,255,255,0.1)',
};

// ── Overlay / card ────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(0,0,0,0.88)',
  backdropFilter: 'blur(12px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  background: '#111d30',
  border: '1px solid #1a2d47',
  borderRadius: '18px',
  padding: '28px 24px',
  maxWidth: '580px',
  width: '100%',
  maxHeight: '88vh',
  overflowY: 'auto',
  boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
  position: 'relative',
};

// ── Loading messages ──────────────────────────────────────────────────────────

const loadingMessages = [
  'Analyzing chapter topics...',
  'Crafting challenging questions...',
  'Making sure every topic is covered...',
  'Adding tricky distractors...',
  'Balancing difficulty levels...',
  'Almost there, preparing your quiz...',
  'Double checking answers...',
  'Finalizing your personalized quiz...',
];

function shuffleOptions(question: any): any {
  const keys = ['A', 'B', 'C', 'D'] as const
  const opts = keys.map(k => question.options[k] as string)
  const correctText = question.options[question.correct_answer as keyof typeof question.options] as string
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  const newIdx = opts.indexOf(correctText)
  const newKey = keys[newIdx]
  return {
    ...question,
    options: { A: opts[0], B: opts[1], C: opts[2], D: opts[3] },
    correct_answer: newKey,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuizModal({ chapterId, chapterTitle, chapterNumber, topics, userId, onClose }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [quizResults, setQuizResults] = useState<QuizResultsData | null>(null);
  const [msgIndex, setMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const generateQuiz = useCallback(async () => {
    setLoading(true);
    setGenError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setShowResults(false);
    setQuizResults(null);

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)
    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, chapter_title: chapterTitle, topics }),
      });
      clearTimeout(timeoutId)
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to generate quiz');
      setQuestions((data.questions as any[]).map(shuffleOptions) as Question[]);
    } catch (e: unknown) {
      clearTimeout(timeoutId)
      const isAbort = e instanceof Error && e.name === 'AbortError'
      setGenError(isAbort
        ? 'Quiz generation taking longer than expected, please try again'
        : (e instanceof Error ? e.message : 'Failed to generate quiz'));
    } finally {
      setLoading(false);
    }
  }, [chapterId, chapterTitle, topics]);

  useEffect(() => { generateQuiz(); }, [generateQuiz]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!loading) { setProgress(0); setMsgIndex(0); return; }
    const progressInterval = setInterval(() => {
      setProgress((p) => { const rem = 90 - p; return p + rem * (0.5 / 90); });
    }, 500);
    const msgInterval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % loadingMessages.length);
    }, 5000);
    return () => { clearInterval(progressInterval); clearInterval(msgInterval); };
  }, [loading]);

  const selectAnswer = (opt: string) => {
    if (showResults) return;
    setAnswers((prev) => ({ ...prev, [currentIndex]: opt }));
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const answersArr = questions.map((_, i) => answers[i] ?? '');
      const total = questions.length;

      // Build score and wrong-items list
      let score = 0;
      const wrongItems: WrongItem[] = [];

      questions.forEach((q, i) => {
        const selected = answersArr[i];
        const correct = q.correct_answer;
        if (selected === correct) {
          score++;
        } else {
          const selectedText = q.options[selected as keyof typeof q.options] || selected || '—';
          const correctText = q.options[correct as keyof typeof q.options] || correct;
          const raw = q.question;
          wrongItems.push({
            topic: q.topic_name || 'Unknown Topic',
            chapter: chapterTitle,
            question: raw.length > 80 ? raw.slice(0, 80) + '…' : raw,
            yourAnswer: selectedText,
            correctAnswer: correctText,
            topicSlug: (q.topic_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            chapterSlug: chapterNumber,
          });
        }
      });

      const pct = total > 0 ? Math.round((score / total) * 100) : 0;
      const grade = gradeFromPct(pct);
      const xpEarned = score * 10;

      // Save to student_quiz_results via API
      try {
        await fetch('/api/save-quiz-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            chapter_id: chapterId,
            chapter_title: chapterTitle,
            answers: answersArr,
            questions,
          }),
        });
      } catch (e) {
        console.error('[QuizModal] save-quiz-result error:', e);
      }

      // Save to quiz_attempts + run RPCs
      if (supabase && userId) {
        const answerObjs = questions.map((q, i) => ({
          topic_name: q.topic_name,
          selected: answersArr[i],
          correct: q.correct_answer,
          isCorrect: answersArr[i] === q.correct_answer,
        }));

        try {
          await supabase.from('quiz_attempts').insert({
            user_id: userId,
            mode: 'chat-quiz',
            chapter_slugs: JSON.stringify([chapterNumber]),
            score,
            total,
            grade,
            xp_earned: xpEarned,
            time_taken_seconds: null,
            completed_at: new Date().toISOString(),
            answers: JSON.stringify(answerObjs),
          });
        } catch (e) {
          console.error('[QuizModal] quiz_attempts insert error:', e);
        }

        try {
          await supabase.rpc('increment_xp', { p_user_id: userId, p_amount: xpEarned });
        } catch (e) {
          console.error('[QuizModal] increment_xp error:', e);
        }

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!q.topic_name) continue;
          const topicSlug = String(q.topic_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const isCorrect = answersArr[i] === q.correct_answer;
          console.log('Saving topic attempt:', {
            topic_slug: topicSlug,
            chapter_slug: chapterNumber,
            was_correct: isCorrect,
          });
          try {
            await supabase.rpc('record_topic_attempt', {
              p_user_id: userId,
              p_topic_slug: topicSlug,
              p_chapter_slug: chapterNumber,
              p_subject: 'Chemistry',
              p_board: 'KPK',
              p_was_correct: isCorrect,
            });
          } catch { /* non-fatal */ }
        }
      }

      setQuizResults({ score, total, pct, grade, xpEarned, wrongItems });
      setShowResults(true);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading screen ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: '36px 20px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: '34px', marginBottom: '20px' }}>⚡</div>
            <div style={{ color: '#f1f5f9', fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>
              Generating Your Quiz
            </div>
            <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>
              Generating 30 questions for{' '}
              <span style={{ color: '#19c37d', fontWeight: 600 }}>{topics.length} topics</span>
              {' '}in <span style={{ color: '#f1f5f9' }}>{chapterTitle}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '6px', height: '6px', marginBottom: '10px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: 'linear-gradient(90deg, #19c37d, #0ea86a)',
                borderRadius: '6px', transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ color: '#475569', fontSize: '11px', textAlign: 'right', marginBottom: '20px' }}>
              {Math.round(progress)}%
            </div>
            <div style={{ color: '#64748b', fontSize: '13px', minHeight: '20px', marginBottom: '20px' }}>
              {loadingMessages[msgIndex]}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '24px' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: '7px', height: '7px', borderRadius: '50%', background: '#19c37d',
                  animation: `quizPulse 1.2s ease-in-out ${i * 0.22}s infinite`,
                }} />
              ))}
            </div>
            <style>{`@keyframes quizPulse{0%,80%,100%{opacity:.2;transform:scale(.75)}40%{opacity:1;transform:scale(1)}}`}</style>
            <div style={{ color: '#475569', fontSize: '12px', borderTop: '1px solid #1a2d47', paddingTop: '16px' }}>
              Generating quiz questions... this may take 20–30 seconds
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error screen ──────────────────────────────────────────────────────────────

  if (genError) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
            <div style={{ color: '#ef4444', fontSize: '15px', marginBottom: '8px' }}>Failed to generate quiz</div>
            <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>{genError}</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={generateQuiz} style={btnPrimary}>Try Again</button>
              <button onClick={onClose} style={btnSecondary}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Results screen ────────────────────────────────────────────────────────────

  if (showResults && quizResults) {
    const gc = gradeColor(quizResults.grade);
    const uniqueTopics = [...new Set(quizResults.wrongItems.map(w => w.topic))];

    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Quiz Complete — {chapterTitle}
            </span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' }}
              aria-label="Close"
            >×</button>
          </div>

          {/* Score card */}
          <div style={{
            textAlign: 'center', padding: '20px 16px 24px',
            borderBottom: '1px solid #1a2d47', marginBottom: '16px',
          }}>
            {/* Grade circle */}
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              border: `3px solid ${gc}`, background: `${gc}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: gc, fontFamily: 'var(--font-sora, Sora, sans-serif)' }}>
                {quizResults.grade}
              </span>
            </div>

            <div style={{ fontSize: '34px', fontWeight: 800, color: '#f1f5f9', lineHeight: 1, marginBottom: '4px', fontFamily: 'var(--font-sora, Sora, sans-serif)' }}>
              {quizResults.score}/{quizResults.total}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: gc, marginBottom: '10px' }}>
              {quizResults.pct}%
            </div>

            <div style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: '999px',
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
              color: '#f59e0b', fontSize: '13px', fontWeight: 700, marginBottom: '12px',
            }}>
              ⚡ +{quizResults.xpEarned} XP earned
            </div>

            <div style={{ color: '#94a3b8', fontSize: '14px' }}>
              {motivationalMsg(quizResults.pct)}
            </div>
          </div>

          {/* Stat row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e', fontFamily: 'var(--font-sora, Sora, sans-serif)' }}>
                {quizResults.score}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>✅ Correct</div>
            </div>
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-sora, Sora, sans-serif)' }}>
                {quizResults.total - quizResults.score}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>✗ Wrong</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1a2d47', borderRadius: '10px', padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#94a3b8', fontFamily: 'var(--font-sora, Sora, sans-serif)' }}>
                {quizResults.total}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>⏱ Questions</div>
            </div>
          </div>

          {/* Weak topics */}
          {quizResults.wrongItems.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                ⚠️ Topics to Revise ({quizResults.wrongItems.length})
              </div>
              {quizResults.wrongItems.map((item, idx) => (
                <div key={idx} style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  borderLeft: '3px solid #ef4444',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>{item.topic}</span>
                    <button
                      onClick={() => router.push(`/chat?topic=${item.topicSlug}&chapter=${item.chapterSlug}`)}
                      style={{
                        padding: '2px 8px', borderRadius: '4px',
                        background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)',
                        color: '#f97316', fontSize: '11px', fontWeight: 600,
                        cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
                      }}
                    >
                      Study this →
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '7px', lineHeight: 1.4 }}>
                    {item.question}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                      color: '#f87171', fontSize: '11px',
                    }}>
                      Your: {item.yourAnswer}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                      color: '#4ade80', fontSize: '11px',
                    }}>
                      Correct: {item.correctAnswer}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Suggested review */}
          {quizResults.wrongItems.length > 0 && (
            <div style={{
              marginBottom: '20px', padding: '14px',
              background: '#0d1626', borderRadius: '10px', border: '1px solid #1a2d47',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
                📚 Suggested next session:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {uniqueTopics.map((topic, i) => (
                  <span key={i} style={{
                    padding: '3px 10px', borderRadius: '999px',
                    background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)',
                    color: '#f97316', fontSize: '11px', fontWeight: 500,
                  }}>
                    {topic}
                  </span>
                ))}
              </div>
              <button
                onClick={() => {
                  const first = quizResults.wrongItems[0];
                  router.push(`/chat?chapter=${first.chapterSlug}&mode=quiz&topic=${first.topicSlug}`);
                }}
                style={{
                  width: '100%', padding: '9px', borderRadius: '8px',
                  background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)',
                  color: '#f97316', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Start Revision Session →
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { setShowResults(false); generateQuiz(); }}
              style={{ ...btnPrimary, flex: 1 }}
            >
              Retake Quiz
            </button>
            <button onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>
              Back to Chat
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={{ ...btnSecondary, flex: 1 }}
            >
              Dashboard
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── Quiz questions screen ──────────────────────────────────────────────────────

  if (questions.length === 0) return null;

  const q = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const selectedAnswer = answers[currentIndex];

  return (
    <div style={overlayStyle}>
      <div
        style={cardStyle}
        onContextMenu={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 500 }}>{chapterTitle}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}
            aria-label="Close quiz"
          >×</button>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '4px', height: '4px', marginBottom: '6px' }}>
          <div style={{
            background: '#19c37d', borderRadius: '4px', height: '100%',
            width: `${((currentIndex + 1) / questions.length) * 100}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{ color: '#475569', fontSize: '11px', textAlign: 'right', marginBottom: '18px' }}>
          {currentIndex + 1} / {questions.length}
        </div>

        {/* Topic badge */}
        {q.topic_name && (
          <div style={{
            display: 'inline-block', fontSize: '11px', color: '#19c37d',
            background: 'rgba(25,195,125,0.1)', borderRadius: '5px',
            padding: '3px 9px', marginBottom: '12px', letterSpacing: '0.04em',
          }}>
            {q.topic_name}
          </div>
        )}

        {/* Question */}
        <div className="quiz-protected" style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600, lineHeight: 1.55, marginBottom: '20px', userSelect: 'none', WebkitUserSelect: 'none' }}>
          {currentIndex + 1}. {q.question}
        </div>

        {/* Options */}
        <div className="quiz-protected" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', userSelect: 'none', WebkitUserSelect: 'none' }}>
          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
            const isSelected = selectedAnswer === opt;
            return (
              <button
                key={opt}
                onClick={() => selectAnswer(opt)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  padding: '12px 14px',
                  background: isSelected ? 'rgba(25,195,125,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? '#19c37d' : 'rgba(255,255,255,0.09)'}`,
                  borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                  color: isSelected ? '#19c37d' : '#f1f5f9',
                  transition: 'all 0.15s', width: '100%', fontFamily: 'inherit',
                }}
              >
                <span style={{
                  flexShrink: 0, width: '24px', height: '24px', borderRadius: '50%',
                  background: isSelected ? '#19c37d' : 'rgba(255,255,255,0.08)',
                  color: isSelected ? '#000' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700,
                }}>
                  {opt}
                </span>
                <span style={{ fontSize: '14px', lineHeight: 1.5, paddingTop: '4px' }}>
                  {q.options[opt]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {currentIndex > 0 && (
              <button onClick={() => setCurrentIndex((i) => i - 1)} style={btnSecondary}>
                ← Back
              </button>
            )}
          </div>
          <div>
            {!isLast ? (
              <button
                onClick={() => setCurrentIndex((i) => i + 1)}
                disabled={!selectedAnswer}
                style={{ ...btnPrimary, opacity: selectedAnswer ? 1 : 0.35, cursor: selectedAnswer ? 'pointer' : 'not-allowed' }}
              >
                Next →
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting || !selectedAnswer}
                style={{
                  ...btnPrimary,
                  opacity: submitting || !selectedAnswer ? 0.35 : 1,
                  cursor: submitting || !selectedAnswer ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Saving...' : 'Submit Quiz'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
