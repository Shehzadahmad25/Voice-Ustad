'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient } from '@/lib/supabase'
import { getQuizQuestions } from '@/lib/getQuizQuestions'
import { generateAIQuestions } from '@/lib/generateAIQuestions'
import { saveQuizAttempt } from '@/lib/saveQuizAttempt'
import { addXP } from '@/lib/updateXP'

// ── Types ────────────────────────────────────────────────────────────────────

interface QuizQuestion {
  id: string
  topic_slug: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct_answer: 'A' | 'B' | 'C' | 'D'
  explanation?: string
}

type QuizMode = 'quick' | 'sunday'
type Screen = 'select' | 'quiz' | 'results'

// ── Constants ─────────────────────────────────────────────────────────────────

const QUICK_COUNT = 10
const SUNDAY_COUNT = 35
const QUICK_SECS = 15 * 60
const SUNDAY_SECS = 45 * 60

const FALLBACK_CHAPTERS = [
  'stoichiometry',
  'atomic-structure',
  'chemical-bonding',
  'gases',
  'thermochemistry',
  'solutions',
  'electrochemistry',
  'reaction-kinetics',
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getGrade(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: 'A+', color: '#22c55e' }
  if (pct >= 80) return { label: 'A', color: '#22c55e' }
  if (pct >= 70) return { label: 'B+', color: '#eab308' }
  if (pct >= 60) return { label: 'B', color: '#eab308' }
  if (pct >= 50) return { label: 'C', color: '#f97316' }
  return { label: 'F', color: '#ef4444' }
}

function daysUntilSunday(): number {
  const day = new Date().getDay() // 0=Sun
  return day === 0 ? 0 : 7 - day
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh',
    background: '#07101f',
    color: '#e2e8f0',
    fontFamily: 'var(--font-dm, DM Sans, sans-serif)',
    padding: '0 0 60px',
  } as React.CSSProperties,

  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '18px 24px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: '#07101f',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  } as React.CSSProperties,

  backBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: 1,
    padding: '6px 10px',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  pageTitle: {
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '18px',
    fontWeight: 700,
    color: '#f1f5f9',
    margin: 0,
  } as React.CSSProperties,

  inner: {
    maxWidth: '680px',
    margin: '0 auto',
    padding: '28px 20px',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#64748b',
    marginBottom: '10px',
  } as React.CSSProperties,

  modeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '28px',
  } as React.CSSProperties,

  card: (active: boolean, accent: string): React.CSSProperties => ({
    background: active
      ? `linear-gradient(135deg, ${accent}22, ${accent}11)`
      : '#111d30',
    border: `1.5px solid ${active ? accent : 'rgba(255,255,255,0.07)'}`,
    borderRadius: '14px',
    padding: '18px 16px',
    cursor: 'pointer',
    transition: 'all .15s',
    textAlign: 'left',
  }),

  cardTitle: {
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '15px',
    fontWeight: 700,
    marginBottom: '4px',
  } as React.CSSProperties,

  cardMeta: {
    fontSize: '12px',
    color: '#94a3b8',
    lineHeight: 1.5,
  } as React.CSSProperties,

  chipWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '28px',
  } as React.CSSProperties,

  chip: (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    borderRadius: '999px',
    border: `1px solid ${active ? '#f97316' : 'rgba(255,255,255,0.1)'}`,
    background: active ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.04)',
    color: active ? '#f97316' : '#94a3b8',
    fontSize: '12.5px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all .12s',
    fontFamily: 'inherit',
  }),

  startBtn: (disabled: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    background: disabled
      ? 'rgba(249,115,22,0.3)'
      : 'linear-gradient(135deg, #f97316, #f59e0b)',
    color: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '15px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s',
    marginTop: '4px',
  }),

  quizCard: {
    background: '#111d30',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px',
    padding: '24px 22px',
    marginBottom: '16px',
  } as React.CSSProperties,

  progressBar: (pct: number): React.CSSProperties => ({
    height: '4px',
    background: 'rgba(255,255,255,0.07)',
    borderRadius: '99px',
    overflow: 'hidden',
    marginBottom: '20px',
  }),

  progressFill: (pct: number): React.CSSProperties => ({
    height: '100%',
    width: `${pct}%`,
    background: 'linear-gradient(90deg, #f97316, #f59e0b)',
    borderRadius: '99px',
    transition: 'width .3s ease',
  }),

  timer: (warn: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '13px',
    fontWeight: 700,
    color: warn ? '#ef4444' : '#94a3b8',
    animation: warn ? 'vuPulse 1s ease-in-out infinite' : 'none',
    minWidth: '52px',
    textAlign: 'right' as const,
  }),

  topicLabel: {
    fontSize: '10.5px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: '#f97316',
    marginBottom: '8px',
  } as React.CSSProperties,

  questionText: {
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '16px',
    fontWeight: 600,
    color: '#f1f5f9',
    lineHeight: 1.55,
    marginBottom: '20px',
  } as React.CSSProperties,

  optionBtn: (
    state: 'idle' | 'correct' | 'wrong' | 'dim',
  ): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '11px 14px',
    marginBottom: '8px',
    borderRadius: '10px',
    border: `1px solid ${
      state === 'correct'
        ? '#22c55e'
        : state === 'wrong'
          ? '#ef4444'
          : 'rgba(255,255,255,0.08)'
    }`,
    background:
      state === 'correct'
        ? 'rgba(34,197,94,0.12)'
        : state === 'wrong'
          ? 'rgba(239,68,68,0.10)'
          : state === 'dim'
            ? 'rgba(255,255,255,0.02)'
            : 'rgba(255,255,255,0.04)',
    color:
      state === 'correct'
        ? '#4ade80'
        : state === 'wrong'
          ? '#f87171'
          : state === 'dim'
            ? '#475569'
            : '#cbd5e1',
    fontSize: '14px',
    cursor: state === 'idle' ? 'pointer' : 'default',
    transition: 'all .12s',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  }),

  letterBadge: (
    state: 'idle' | 'correct' | 'wrong' | 'dim',
  ): React.CSSProperties => ({
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    background:
      state === 'correct'
        ? '#22c55e'
        : state === 'wrong'
          ? '#ef4444'
          : 'rgba(255,255,255,0.1)',
    color:
      state === 'correct' || state === 'wrong'
        ? '#fff'
        : '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11.5px',
    fontWeight: 700,
    flexShrink: 0,
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
  }),

  explanationBox: {
    background: 'rgba(249,115,22,0.08)',
    border: '1px solid rgba(249,115,22,0.2)',
    borderRadius: '10px',
    padding: '12px 14px',
    marginTop: '14px',
    fontSize: '13px',
    color: '#fdba74',
    lineHeight: 1.55,
  } as React.CSSProperties,

  nextBtn: {
    width: '100%',
    padding: '13px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #f97316, #f59e0b)',
    color: '#fff',
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '8px',
  } as React.CSSProperties,

  xpFloat: {
    position: 'fixed' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '28px',
    fontWeight: 800,
    color: '#f59e0b',
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    pointerEvents: 'none' as const,
    animation: 'vuXpFloat 1.2s ease-out forwards',
    zIndex: 100,
  } as React.CSSProperties,

  resultsCard: {
    background: '#111d30',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px',
    padding: '28px 22px',
    marginBottom: '16px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  gradeCircle: (color: string): React.CSSProperties => ({
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    border: `3px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    background: `${color}18`,
  }),

  gradeLabel: (color: string): React.CSSProperties => ({
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '36px',
    fontWeight: 800,
    color,
  }),

  statRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginTop: '18px',
    marginBottom: '6px',
  } as React.CSSProperties,

  statBox: {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '10px',
    padding: '12px 8px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  statVal: {
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '22px',
    fontWeight: 700,
    color: '#f1f5f9',
  } as React.CSSProperties,

  statLbl: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '2px',
  } as React.CSSProperties,

  xpBadge: {
    display: 'inline-block',
    padding: '6px 18px',
    borderRadius: '999px',
    background: 'rgba(245,158,11,0.15)',
    border: '1px solid rgba(245,158,11,0.3)',
    color: '#f59e0b',
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '14px',
    fontWeight: 700,
    marginTop: '14px',
  } as React.CSSProperties,

  actionRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '6px',
  } as React.CSSProperties,

  outlineBtn: {
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: '#cbd5e1',
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .12s',
  } as React.CSSProperties,

  filledBtn: {
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #f97316, #f59e0b)',
    color: '#fff',
    fontFamily: 'var(--font-sora, Sora, sans-serif)',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all .12s',
  } as React.CSSProperties,

  missedItem: {
    background: 'rgba(239,68,68,0.06)',
    border: '1px solid rgba(239,68,68,0.15)',
    borderRadius: '10px',
    padding: '12px 14px',
    marginBottom: '8px',
    fontSize: '13.5px',
    color: '#f1f5f9',
    lineHeight: 1.5,
  } as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuizPage() {
  const router = useRouter()
  const { user } = useAuth()

  // Screen
  const [screen, setScreen] = useState<Screen>('select')

  // Select screen
  const [mode, setMode] = useState<QuizMode>('quick')
  const [availableChapters, setAvailableChapters] = useState<string[]>([])
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [loadingStart, setLoadingStart] = useState(false)
  const [loadError, setLoadError] = useState('')

  // Quiz screen
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [answered, setAnswered] = useState(false)
  const [timeLeft, setTimeLeft] = useState(QUICK_SECS)
  const [showXP, setShowXP] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Results
  const [resultsSaved, setResultsSaved] = useState(false)

  const isSunday = new Date().getDay() === 0
  const totalSecs = mode === 'quick' ? QUICK_SECS : SUNDAY_SECS
  const quizCount = mode === 'quick' ? QUICK_COUNT : SUNDAY_COUNT

  // ── Load available chapters ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const sb = getSupabaseClient()
      if (!sb) {
        setAvailableChapters(FALLBACK_CHAPTERS)
        setSelectedChapters(FALLBACK_CHAPTERS.slice(0, 3))
        return
      }
      try {
        const { data } = await sb
          .from('quiz_questions')
          .select('chapter_slug')
          .limit(200)

        if (data && data.length > 0) {
          const unique = Array.from(
            new Set(data.map((r: any) => r.chapter_slug as string).filter(Boolean)),
          )
          setAvailableChapters(unique.length > 0 ? unique : FALLBACK_CHAPTERS)
          setSelectedChapters(
            (unique.length > 0 ? unique : FALLBACK_CHAPTERS).slice(0, 3),
          )
        } else {
          setAvailableChapters(FALLBACK_CHAPTERS)
          setSelectedChapters(FALLBACK_CHAPTERS.slice(0, 3))
        }
      } catch {
        setAvailableChapters(FALLBACK_CHAPTERS)
        setSelectedChapters(FALLBACK_CHAPTERS.slice(0, 3))
      }
    }
    load()
  }, [])

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'quiz') return
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          finishQuiz()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  // ── Save results on screen=results ────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'results' || resultsSaved) return
    setResultsSaved(true)

    const correctCount = questions.filter(
      (q, i) => answers[i] === q.correct_answer,
    ).length
    const wrongCount = questions.length - correctCount
    const accuracy =
      questions.length > 0
        ? Math.round((correctCount / questions.length) * 100)
        : 0
    const xpEarned =
      correctCount * 10 * (mode === 'sunday' ? 2 : 1)

    if (user?.id) {
      saveQuizAttempt({
        userId: user.id,
        mode,
        totalQuestions: questions.length,
        correctCount,
        wrongCount,
        accuracy,
        xpEarned,
        chapterSlugs: selectedChapters,
      }).catch(console.error)

      addXP(user.id, xpEarned).catch(console.error)
    }
  }, [screen, resultsSaved, questions, answers, mode, user, selectedChapters])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleChapter(slug: string) {
    setSelectedChapters((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  async function startQuiz() {
    if (selectedChapters.length === 0) {
      setLoadError('Select at least one chapter.')
      return
    }
    setLoadError('')
    setLoadingStart(true)

    try {
      let qs: QuizQuestion[] = []

      if (mode === 'quick') {
        try {
          const dbQs = await getQuizQuestions({
            chapterSlugs: selectedChapters,
            limit: QUICK_COUNT,
          })
          if (dbQs.length >= 5) {
            qs = shuffle(dbQs).slice(0, QUICK_COUNT) as QuizQuestion[]
          }
        } catch {
          // fall through to AI
        }

        if (qs.length < 5) {
          qs = await generateAIQuestions({
            chapterSlugs: selectedChapters,
            count: QUICK_COUNT,
          })
        }
      } else {
        // Sunday test — try DB first
        try {
          const dbQs = await getQuizQuestions({
            chapterSlugs: selectedChapters,
            limit: SUNDAY_COUNT,
          })
          if (dbQs.length >= 10) {
            qs = shuffle(dbQs).slice(0, SUNDAY_COUNT) as QuizQuestion[]
          }
        } catch {
          // fall through to AI
        }

        if (qs.length < 10) {
          qs = await generateAIQuestions({
            chapterSlugs: selectedChapters,
            count: SUNDAY_COUNT,
          })
        }
      }

      if (!qs || qs.length === 0) {
        setLoadError('Could not load questions. Please try again.')
        return
      }

      setQuestions(qs)
      setCurrentQ(0)
      setAnswers({})
      setAnswered(false)
      setTimeLeft(mode === 'quick' ? QUICK_SECS : SUNDAY_SECS)
      setResultsSaved(false)
      setScreen('quiz')
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load questions.')
    } finally {
      setLoadingStart(false)
    }
  }

  function selectAnswer(letter: string) {
    if (answered) return
    setAnswers((prev) => ({ ...prev, [currentQ]: letter }))
    setAnswered(true)

    const q = questions[currentQ]
    if (letter === q.correct_answer) {
      setShowXP(true)
      setTimeout(() => setShowXP(false), 1200)
    }
  }

  function nextQuestion() {
    if (currentQ + 1 >= questions.length) {
      finishQuiz()
    } else {
      setCurrentQ((n) => n + 1)
      setAnswered(false)
    }
  }

  const finishQuiz = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setScreen('results')
  }, [])

  function resetAll() {
    setScreen('select')
    setQuestions([])
    setCurrentQ(0)
    setAnswers({})
    setAnswered(false)
    setResultsSaved(false)
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const correctCount = questions.filter(
    (q, i) => answers[i] === q.correct_answer,
  ).length
  const wrongCount = questions.length - correctCount
  const accuracy =
    questions.length > 0
      ? Math.round((correctCount / questions.length) * 100)
      : 0
  const xpEarned = correctCount * 10 * (mode === 'sunday' ? 2 : 1)
  const grade = getGrade(accuracy)
  const progressPct =
    questions.length > 0 ? ((currentQ + 1) / questions.length) * 100 : 0
  const missedQuestions = questions.filter(
    (q, i) => answers[i] !== q.correct_answer,
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes vuPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @keyframes vuXpFloat {
          0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          60%  { opacity: 1; transform: translate(-50%, -110%) scale(1.15); }
          100% { opacity: 0; transform: translate(-50%, -160%) scale(0.9); }
        }
      `}</style>

      <div style={S.page}>
        {/* ── Top bar ── */}
        <div style={S.topBar}>
          <button
            type="button"
            style={S.backBtn}
            onClick={() =>
              screen === 'select' ? router.back() : resetAll()
            }
          >
            ←
          </button>
          <h1 style={S.pageTitle}>
            {screen === 'select'
              ? 'Quiz & Tests'
              : screen === 'quiz'
                ? `Question ${currentQ + 1} / ${questions.length}`
                : 'Results'}
          </h1>
          {screen === 'quiz' && (
            <span
              style={{
                marginLeft: 'auto',
                ...S.timer(timeLeft < 120),
              }}
            >
              {formatTime(timeLeft)}
            </span>
          )}
        </div>

        {showXP && <div style={S.xpFloat}>+10 XP</div>}

        <div style={S.inner}>
          {/* ════════════════════════════════════════════════════════════
              SCREEN 1 — Mode Select
          ════════════════════════════════════════════════════════════ */}
          {screen === 'select' && (
            <>
              <p style={S.sectionLabel}>Select Mode</p>
              <div style={S.modeGrid}>
                {/* Quick Quiz */}
                <div
                  role="button"
                  tabIndex={0}
                  style={S.card(mode === 'quick', '#f97316')}
                  onClick={() => setMode('quick')}
                  onKeyDown={(e) => e.key === 'Enter' && setMode('quick')}
                >
                  <div
                    style={{ fontSize: '22px', marginBottom: '8px' }}
                  >
                    ⚡
                  </div>
                  <div
                    style={{ ...S.cardTitle, color: '#f97316' }}
                  >
                    Quick Quiz
                  </div>
                  <div style={S.cardMeta}>
                    {QUICK_COUNT} questions
                    <br />
                    15 minutes
                  </div>
                </div>

                {/* Sunday Test */}
                <div
                  role="button"
                  tabIndex={0}
                  style={{
                    ...S.card(mode === 'sunday', '#a855f7'),
                    opacity: isSunday ? 1 : 0.65,
                  }}
                  onClick={() => isSunday && setMode('sunday')}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && isSunday && setMode('sunday')
                  }
                >
                  <div
                    style={{ fontSize: '22px', marginBottom: '8px' }}
                  >
                    📋
                  </div>
                  <div
                    style={{ ...S.cardTitle, color: '#a855f7' }}
                  >
                    Sunday Test
                  </div>
                  <div style={S.cardMeta}>
                    {SUNDAY_COUNT} questions
                    <br />
                    45 minutes
                  </div>
                  {!isSunday && (
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '11px',
                        color: '#a855f7',
                        fontWeight: 600,
                      }}
                    >
                      Available Sunday · {daysUntilSunday()}d away
                    </div>
                  )}
                </div>
              </div>

              <p style={S.sectionLabel}>Select Chapters</p>
              <div style={S.chipWrap}>
                {availableChapters.map((slug) => (
                  <button
                    key={slug}
                    type="button"
                    style={S.chip(selectedChapters.includes(slug))}
                    onClick={() => toggleChapter(slug)}
                  >
                    {slug
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </button>
                ))}
              </div>

              {loadError && (
                <p
                  style={{
                    color: '#f87171',
                    fontSize: '13px',
                    marginBottom: '10px',
                    textAlign: 'center',
                  }}
                >
                  {loadError}
                </p>
              )}

              <button
                type="button"
                style={S.startBtn(
                  loadingStart ||
                    selectedChapters.length === 0 ||
                    (mode === 'sunday' && !isSunday),
                )}
                disabled={
                  loadingStart ||
                  selectedChapters.length === 0 ||
                  (mode === 'sunday' && !isSunday)
                }
                onClick={startQuiz}
              >
                {loadingStart ? 'Loading…' : 'Start Quiz'}
              </button>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              SCREEN 2 — Quiz
          ════════════════════════════════════════════════════════════ */}
          {screen === 'quiz' && questions.length > 0 && (
            <>
              {/* Progress bar */}
              <div style={S.progressBar(progressPct)}>
                <div style={S.progressFill(progressPct)} />
              </div>

              <div style={S.quizCard}>
                {/* Topic label */}
                {questions[currentQ]?.topic_slug && (
                  <div style={S.topicLabel}>
                    {questions[currentQ].topic_slug
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </div>
                )}

                {/* Question */}
                <div style={S.questionText}>
                  {questions[currentQ]?.question}
                </div>

                {/* Options */}
                {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                  const optionText =
                    questions[currentQ]?.options?.[letter] ?? ''
                  const chosen = answers[currentQ]
                  const correct = questions[currentQ]?.correct_answer

                  let state: 'idle' | 'correct' | 'wrong' | 'dim' = 'idle'
                  if (answered) {
                    if (letter === correct) state = 'correct'
                    else if (letter === chosen) state = 'wrong'
                    else state = 'dim'
                  }

                  return (
                    <button
                      key={letter}
                      type="button"
                      style={S.optionBtn(state)}
                      onClick={() => selectAnswer(letter)}
                      disabled={answered}
                    >
                      <span style={S.letterBadge(state)}>{letter}</span>
                      <span>{optionText}</span>
                    </button>
                  )
                })}

                {/* Explanation */}
                {answered && questions[currentQ]?.explanation && (
                  <div style={S.explanationBox}>
                    <strong>Explanation: </strong>
                    {questions[currentQ].explanation}
                  </div>
                )}
              </div>

              {answered && (
                <button
                  type="button"
                  style={S.nextBtn}
                  onClick={nextQuestion}
                >
                  {currentQ + 1 >= questions.length
                    ? 'View Results'
                    : 'Next Question →'}
                </button>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              SCREEN 3 — Results
          ════════════════════════════════════════════════════════════ */}
          {screen === 'results' && (
            <>
              <div style={S.resultsCard}>
                <div style={S.gradeCircle(grade.color)}>
                  <span style={S.gradeLabel(grade.color)}>
                    {grade.label}
                  </span>
                </div>

                <p
                  style={{
                    fontFamily: 'var(--font-sora, Sora, sans-serif)',
                    fontSize: '20px',
                    fontWeight: 700,
                    margin: '0 0 4px',
                    color: '#f1f5f9',
                  }}
                >
                  {accuracy >= 80
                    ? 'Excellent work!'
                    : accuracy >= 60
                      ? 'Good effort!'
                      : accuracy >= 40
                        ? 'Keep practising!'
                        : 'Study harder!'}
                </p>

                <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
                  {mode === 'quick' ? 'Quick Quiz' : 'Sunday Test'} ·{' '}
                  {questions.length} questions
                </p>

                <div style={S.statRow}>
                  <div style={S.statBox}>
                    <div style={{ ...S.statVal, color: '#4ade80' }}>
                      {correctCount}
                    </div>
                    <div style={S.statLbl}>Correct</div>
                  </div>
                  <div style={S.statBox}>
                    <div style={{ ...S.statVal, color: '#f87171' }}>
                      {wrongCount}
                    </div>
                    <div style={S.statLbl}>Wrong</div>
                  </div>
                  <div style={S.statBox}>
                    <div style={{ ...S.statVal, color: '#f59e0b' }}>
                      {accuracy}%
                    </div>
                    <div style={S.statLbl}>Accuracy</div>
                  </div>
                </div>

                <div style={S.xpBadge}>
                  +{xpEarned} XP earned
                  {mode === 'sunday' && (
                    <span style={{ opacity: 0.7, fontWeight: 400 }}>
                      {' '}(2× Sunday bonus)
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={S.actionRow}>
                <button
                  type="button"
                  style={S.outlineBtn}
                  onClick={resetAll}
                >
                  Try Again
                </button>
                <button
                  type="button"
                  style={S.filledBtn}
                  onClick={() => router.push('/dashboard')}
                >
                  Dashboard
                </button>
              </div>

              {/* Missed questions */}
              {missedQuestions.length > 0 && (
                <div style={{ marginTop: '28px' }}>
                  <p
                    style={{
                      ...S.sectionLabel,
                      marginBottom: '12px',
                    }}
                  >
                    Missed Questions ({missedQuestions.length})
                  </p>
                  {missedQuestions.map((q, idx) => (
                    <div key={q.id ?? idx} style={S.missedItem}>
                      <div
                        style={{
                          fontWeight: 600,
                          marginBottom: '4px',
                          color: '#f1f5f9',
                        }}
                      >
                        {q.question}
                      </div>
                      <div
                        style={{
                          fontSize: '12.5px',
                          color: '#4ade80',
                        }}
                      >
                        Correct: {q.correct_answer} —{' '}
                        {q.options?.[q.correct_answer]}
                      </div>
                      {q.explanation && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: '#94a3b8',
                            marginTop: '4px',
                          }}
                        >
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
