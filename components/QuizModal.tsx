'use client';

import { useState, useEffect, useCallback } from 'react';

interface Question {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct_answer: string;
  topic_name: string;
}

interface QuizResult {
  score: number;
  total: number;
  percentage: number;
  weak_topics: string[];
  suggested_review: string[];
}

export interface ScopeTopic {
  topic_code: string;
  topic_title: string;
  page: number | null;
}

interface Props {
  chapterId: string;
  chapterTitle: string;
  topics: ScopeTopic[];
  userId: string;
  onClose: () => void;
}

// ── Shared button styles ───────────────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '9px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
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

// ── Overlay / card layout ─────────────────────────────────────────────────────

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
  background: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '18px',
  padding: '28px 24px',
  maxWidth: '580px',
  width: '100%',
  maxHeight: '88vh',
  overflowY: 'auto',
  boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
  position: 'relative',
};

// ── Component ─────────────────────────────────────────────────────────────────

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

export default function QuizModal({ chapterId, chapterTitle, topics, userId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [msgIndex, setMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const expectedCount = topics.length <= 5 ? 30 : topics.length <= 10 ? 40 : 50;

  const generateQuiz = useCallback(async () => {
    setLoading(true);
    setGenError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setResult(null);

    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, chapter_title: chapterTitle, topics }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to generate quiz');
      setQuestions(data.questions as Question[]);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate quiz');
    } finally {
      setLoading(false);
    }
  }, [chapterId, chapterTitle, topics]);

  useEffect(() => { generateQuiz(); }, [generateQuiz]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Loading progress bar (0→90% over 90 s) + rotating messages
  useEffect(() => {
    if (!loading) { setProgress(0); setMsgIndex(0); return; }

    // Progress: tick every 500 ms, asymptotically approach 90%
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        const remaining = 90 - p;
        return p + remaining * (0.5 / 90);   // slows as it nears 90
      });
    }, 500);

    // Message rotation every 5 s
    const msgInterval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % loadingMessages.length);
    }, 5000);

    return () => { clearInterval(progressInterval); clearInterval(msgInterval); };
  }, [loading]);

  const selectAnswer = (opt: string) => {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [currentIndex]: opt }));
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const answersArr = questions.map((_, i) => answers[i] ?? '');

    try {
      const res = await fetch('/api/save-quiz-result', {
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
      const data = await res.json();
      setResult({
        score: data.score,
        total: data.total,
        percentage: data.percentage,
        weak_topics: data.weak_topics ?? [],
        suggested_review: data.suggested_review ?? [],
      });
    } catch {
      // Calculate locally if API fails
      let score = 0;
      questions.forEach((q, i) => { if (answersArr[i] === q.correct_answer) score++; });
      const total = questions.length;
      setResult({ score, total, percentage: Math.round((score / total) * 100), weak_topics: [], suggested_review: [] });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading screen ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: '36px 20px 32px', textAlign: 'center' }}>

            {/* Icon */}
            <div style={{ fontSize: '34px', marginBottom: '20px' }}>⚡</div>

            {/* Title */}
            <div style={{ color: '#ececec', fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>
              Generating Your Quiz
            </div>

            {/* Topic count */}
            <div style={{ color: '#9a9a9a', fontSize: '13px', marginBottom: '24px' }}>
              Generating questions for{' '}
              <span style={{ color: '#19c37d', fontWeight: 600 }}>{topics.length} topics</span>
              {' '}in <span style={{ color: '#ececec' }}>{chapterTitle}</span>
            </div>

            {/* Progress bar */}
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '6px', height: '6px', marginBottom: '10px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #19c37d, #0ea86a)',
                borderRadius: '6px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ color: '#5f5f5f', fontSize: '11px', textAlign: 'right', marginBottom: '20px' }}>
              {Math.round(progress)}%
            </div>

            {/* Rotating message */}
            <div style={{
              color: '#9a9a9a', fontSize: '13px', minHeight: '20px',
              transition: 'opacity 0.4s',
              marginBottom: '20px',
            }}>
              {loadingMessages[msgIndex]}
            </div>

            {/* Pulsing dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '24px' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: '#19c37d',
                  animation: `quizPulse 1.2s ease-in-out ${i * 0.22}s infinite`,
                }} />
              ))}
            </div>
            <style>{`@keyframes quizPulse{0%,80%,100%{opacity:.2;transform:scale(.75)}40%{opacity:1;transform:scale(1)}}`}</style>

            {/* Estimated time hint */}
            <div style={{
              color: '#5f5f5f', fontSize: '12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '16px',
            }}>
              This usually takes 30–60 seconds
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error screen ─────────────────────────────────────────────────────────────

  if (genError) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
            <div style={{ color: '#ef4444', fontSize: '15px', marginBottom: '8px' }}>Failed to generate quiz</div>
            <div style={{ color: '#9a9a9a', fontSize: '13px', marginBottom: '24px' }}>{genError}</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={generateQuiz} style={btnPrimary}>Try Again</button>
              <button onClick={onClose} style={btnSecondary}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Results screen ───────────────────────────────────────────────────────────

  if (result) {
    const scoreColor =
      result.percentage >= 70 ? '#19c37d' :
      result.percentage >= 50 ? '#f59e0b' :
      '#ef4444';

    const verdict =
      result.percentage >= 70 ? '✓ Great job!' :
      result.percentage >= 50 ? 'Keep practicing' :
      'Needs more review';

    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...cardStyle, maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
          {/* Score */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ color: '#9a9a9a', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Quiz Complete — {chapterTitle}
            </div>
            <div style={{ fontSize: '56px', fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
              {result.score}/{result.total}
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: scoreColor, marginTop: '4px' }}>
              {result.percentage}%
            </div>
            <div style={{ color: '#9a9a9a', fontSize: '13px', marginTop: '8px' }}>
              {verdict}
            </div>
          </div>

          {/* Weak Topics */}
          {result.weak_topics.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                color: '#ef4444', fontSize: '11px', fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px',
              }}>
                Weak Topics
              </div>
              {result.weak_topics.map((t) => (
                <div
                  key={t}
                  style={{
                    color: '#ececec', fontSize: '13px',
                    padding: '7px 10px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    borderRadius: '7px', marginBottom: '5px',
                  }}
                >
                  • {t}
                </div>
              ))}
            </div>
          )}

          {/* Suggested Review */}
          {result.suggested_review.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{
                color: '#f59e0b', fontSize: '11px', fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px',
              }}>
                Suggested Review
              </div>
              {result.suggested_review.map((t) => (
                <div
                  key={t}
                  style={{
                    color: '#ececec', fontSize: '13px',
                    padding: '7px 10px',
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.15)',
                    borderRadius: '7px', marginBottom: '5px',
                  }}
                >
                  → {t}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={generateQuiz} style={{ ...btnPrimary, flex: 1 }}>Retake Quiz</button>
            <button onClick={onClose} style={{ ...btnSecondary, flex: 1 }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Quiz questions screen ────────────────────────────────────────────────────

  if (questions.length === 0) return null;

  const q = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const selectedAnswer = answers[currentIndex];

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ color: '#9a9a9a', fontSize: '12px', fontWeight: 500 }}>{chapterTitle}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 2px' }}
            aria-label="Close quiz"
          >
            ×
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '4px', height: '4px', marginBottom: '6px' }}>
          <div
            style={{
              background: '#19c37d',
              borderRadius: '4px',
              height: '100%',
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ color: '#5f5f5f', fontSize: '11px', textAlign: 'right', marginBottom: '18px' }}>
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

        {/* Question text */}
        <div style={{ color: '#ececec', fontSize: '16px', fontWeight: 600, lineHeight: 1.55, marginBottom: '20px' }}>
          {currentIndex + 1}. {q.question}
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
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
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: isSelected ? '#19c37d' : '#ececec',
                  transition: 'all 0.15s',
                  width: '100%',
                }}
              >
                <span style={{
                  flexShrink: 0,
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: isSelected ? '#19c37d' : 'rgba(255,255,255,0.08)',
                  color: isSelected ? '#000' : '#9a9a9a',
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
