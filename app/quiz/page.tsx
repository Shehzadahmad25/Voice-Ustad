'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSubscriptionStatus } from '@/lib/subscription'
import { useScrollFix } from '@/lib/useScrollFix'
import SundayBanner from '@/components/SundayBanner'
// Single source of truth — SundayBanner and all labels read the same values
import { SUNDAY_COUNT, SUNDAY_SECS, SUNDAY_MINS } from '@/lib/sundayTest'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOptions(q: any): string[] {
  if (Array.isArray(q.options)) return q.options
  if (q.options && typeof q.options === 'object') {
    return [q.options.A ?? '', q.options.B ?? '', q.options.C ?? '', q.options.D ?? '']
  }
  return ['', '', '', '']
}

function getCorrectIndex(q: any): number {
  if (typeof q.correct_index === 'number') return q.correct_index
  if (typeof q.correct === 'number') return q.correct
  if (typeof q.correct_answer === 'string') {
    return ['A', 'B', 'C', 'D'].indexOf(q.correct_answer)
  }
  return 0
}

function getGrade(pct: number): string {
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B+'
  if (pct >= 60) return 'B'
  if (pct >= 50) return 'C'
  return 'F'
}

function gradeColor(g: string): string {
  if (g === 'A+' || g === 'A') return '#22c55e'
  if (g === 'B+') return '#84cc16'
  if (g === 'B') return '#eab308'
  if (g === 'C') return '#f97316'
  return '#ef4444'
}

function shuffleOptions(q: any): any {
  const opts = getOptions(q)
  const correctIdx = getCorrectIndex(q)
  const correctText = opts[correctIdx]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  const newCorrectIndex = opts.indexOf(correctText)
  return { ...q, options: opts, correct_index: newCorrectIndex, correct: newCorrectIndex }
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

  progressBar: {
    height: '4px',
    background: 'rgba(255,255,255,0.07)',
    borderRadius: '99px',
    overflow: 'hidden',
    marginBottom: '20px',
  } as React.CSSProperties,

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

  quizCard: {
    background: '#111d30',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px',
    padding: '24px 22px',
    marginBottom: '16px',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  } as React.CSSProperties,

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

  optionBtn: (state: 'idle' | 'correct' | 'wrong' | 'dim' | 'selected'): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '13px 14px',
    minHeight: '48px',
    marginBottom: '8px',
    borderRadius: '10px',
    border: state === 'selected'
      ? '1.5px solid #f97316'
      : `1px solid ${
          state === 'correct' ? '#22c55e'
          : state === 'wrong' ? '#ef4444'
          : 'rgba(255,255,255,0.08)'
        }`,
    background:
      state === 'correct' ? 'rgba(34,197,94,0.12)'
      : state === 'wrong' ? 'rgba(239,68,68,0.10)'
      : state === 'selected' ? 'rgba(249,115,22,0.15)'
      : state === 'dim' ? 'rgba(255,255,255,0.02)'
      : 'rgba(255,255,255,0.04)',
    color:
      state === 'correct' ? '#4ade80'
      : state === 'wrong' ? '#f87171'
      : state === 'selected' ? '#f97316'
      : state === 'dim' ? '#475569'
      : '#cbd5e1',
    fontSize: '14px',
    cursor: state === 'idle' ? 'pointer' : 'default',
    transition: 'all .12s',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  }),

  letterBadge: (state: 'idle' | 'correct' | 'wrong' | 'dim' | 'selected'): React.CSSProperties => ({
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    background:
      state === 'correct' ? '#22c55e'
      : state === 'wrong' ? '#ef4444'
      : state === 'selected' ? '#f97316'
      : 'rgba(255,255,255,0.1)',
    color: (state === 'correct' || state === 'wrong' || state === 'selected') ? '#fff' : '#94a3b8',
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
  useScrollFix()

  const [userId, setUserId] = useState<string | null>(null)
  const [quizState, setQuizState] = useState<'home' | 'loading' | 'active' | 'results'>('home')
  const [questions, setQuestions] = useState<any[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<any[]>([])
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(SUNDAY_SECS)
  const [result, setResult] = useState<any>(null)
  const [loadError, setLoadError] = useState('')
  const [alreadyTook, setAlreadyTook] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sunday gate
  const isSunday = new Date().getDay() === 0
  const forceTest =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('forceTest') === 'true'
      : false
  const sundayUnlocked = isSunday || forceTest
  const daysAway = (7 - new Date().getDay()) % 7 || 7

  // ── Auth + subscription gate on mount ─────────────────────────────────────
  useEffect(() => {
    if (!supabase) { router.push('/auth/signin'); return }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/auth/signin'); return }
      const uid = session.user.id
      // ── Subscription gate ────────────────────────────────────────────────
      const status = await getSubscriptionStatus(uid)
      if (!status.hasAccess) {
        router.push('/pricing?reason=expired')
        return
      }
      // ────────────────────────────────────────────────────────────────────
      setUserId(uid)

      // Check if already took Sunday Test this week
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      const { data: existing } = await supabase!
        .from('quiz_attempts')
        .select('id')
        .eq('user_id', uid)
        .eq('mode', 'sunday')
        .gte('completed_at', startOfWeek.toISOString())
        .limit(1)
      if (existing && existing.length > 0) setAlreadyTook(true)
    })
  }, [])

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (quizState !== 'active') return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
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
  }, [quizState])

  // ── startQuiz ─────────────────────────────────────────────────────────────
  async function startQuiz() {
    if (!supabase) return
    if (!userId) { console.error('No userId'); return }
    if (!sundayUnlocked) return
    if (alreadyTook) return

    setLoadError('')
    setQuizState('loading')

    try {
      // Fetch questions from all chapters, no chapter filter
      const { data: dbQ, error: dbErr } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('board', 'KPK')
        .limit(SUNDAY_COUNT * 3) // fetch more to have shuffling headroom

      if (dbErr) console.error('quiz_questions fetch error:', dbErr)

      let pool: any[] = dbQ ?? []
      console.log('DB questions:', pool.length)

      // Top up with AI — two calls of ≤20 each, 25s timeout per call, DB-only fallback
      const aiCall = async (n: number): Promise<any[]> => {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 58000)
        try {
          const res = await fetch('/api/generate-quiz', {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: n, board: 'KPK' }),
          })
          clearTimeout(t)
          const d = await res.json()
          console.log('AI questions returned:', d.questions?.length)
          return d.questions ?? []
        } catch {
          clearTimeout(t)
          console.log('AI call skipped (timeout or error) — using DB questions only')
          return []
        }
      }

      if (pool.length < SUNDAY_COUNT) {
        const batch1 = await aiCall(Math.min(SUNDAY_COUNT - pool.length, 20))
        pool = [...pool, ...batch1]
        if (pool.length < SUNDAY_COUNT) {
          const batch2 = await aiCall(SUNDAY_COUNT - pool.length)
          pool = [...pool, ...batch2]
        }
      }

      // Shuffle and slice
      pool = pool.sort(() => Math.random() - 0.5).slice(0, SUNDAY_COUNT)
      console.log('Final pool:', pool.length)

      if (pool.length === 0) {
        setLoadError('No questions available. Please try again later.')
        setQuizState('home')
        return
      }

      setQuestions(pool.map(q => shuffleOptions(q)))
      setCurrentQ(0)
      setAnswers([])
      setSelectedAnswer(null)
      setTimeLeft(SUNDAY_SECS)
      setQuizState('active')
    } catch (e) {
      console.error('startQuiz error:', e)
      setLoadError('Failed to load questions. Please try again.')
      setQuizState('home')
    }
  }

  // ── selectAnswer ──────────────────────────────────────────────────────────
  async function selectAnswer(idx: number) {
    if (selectedAnswer !== null) return
    if (!supabase) return

    setSelectedAnswer(idx)

    const q = questions[currentQ]
    const correctIdx = getCorrectIndex(q)
    const isCorrect = idx === correctIdx

    // Record topic attempt — ensure p_chapter_slug is a chapter number ('1'–'24'), never a UUID
    if (userId && q.topic_slug) {
      try {
        const rawSlug = q.chapter_slug ?? q.chapter ?? ''
        const parsed = parseInt(String(rawSlug), 10)
        const safeChapterSlug = !isNaN(parsed) && parsed >= 1 && parsed <= 24 ? String(parsed) : ''
        console.log('Saving topic attempt:', {
          topic_slug: q.topic_slug,
          chapter_slug: safeChapterSlug,
          was_correct: isCorrect,
        })
        const { error } = await supabase.rpc('record_topic_attempt', {
          p_user_id: userId,
          p_topic_slug: q.topic_slug,
          p_chapter_slug: safeChapterSlug,
          p_subject: 'Chemistry',
          p_board: 'KPK',
          p_was_correct: isCorrect,
        })
        if (error) console.error('record_topic_attempt error:', error)
      } catch (e) {
        console.error('record_topic_attempt exception:', e)
      }
    }

    setAnswers(prev => [
      ...prev,
      {
        qid: q.id,
        topic_slug: q.topic_slug,
        chapter_slug: q.chapter_slug,
        selected: idx,
        correct: correctIdx,
        isCorrect,
      },
    ])
  }

  // ── nextQuestion ──────────────────────────────────────────────────────────
  function nextQuestion() {
    if (currentQ + 1 >= questions.length) {
      finishQuiz()
      return
    }
    setCurrentQ(c => c + 1)
    setSelectedAnswer(null)
  }

  // ── finishQuiz ────────────────────────────────────────────────────────────
  async function finishQuiz() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!supabase) return

    const finalAnswers = answers
    const score = finalAnswers.filter((a: any) => a.isCorrect).length
    const total = questions.length
    const pct = total > 0 ? Math.round((score / total) * 100) : 0
    const grade = getGrade(pct)
    const xpEarned = score * 20 // 2× multiplier (Sunday bonus)
    const timeTaken = SUNDAY_SECS - timeLeft

    setResult({ score, total, pct, grade, xpEarned, answers: finalAnswers })
    setQuizState('results')

    if (!userId) { console.error('No userId in finishQuiz'); return }

    try {
      const { error: attemptError } = await supabase
        .from('quiz_attempts')
        .insert({
          user_id: userId,
          mode: 'sunday',
          chapter_slugs: JSON.stringify(['all']),
          score,
          total,
          grade,
          xp_earned: xpEarned,
          time_taken_seconds: timeTaken,
          completed_at: new Date().toISOString(),
          answers: JSON.stringify(finalAnswers),
        })
      if (attemptError) console.error('quiz_attempts insert error:', attemptError)
      else console.log('quiz_attempts saved successfully')
    } catch (e) {
      console.error('quiz_attempts insert exception:', e)
    }

    try {
      const { error: xpError } = await supabase.rpc('increment_xp', {
        p_user_id: userId,
        p_amount: xpEarned,
      })
      if (xpError) console.error('increment_xp error:', xpError)
      else console.log('XP added:', xpEarned)
    } catch (e) {
      console.error('increment_xp exception:', e)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function resetAll() {
    setQuizState('home')
    setQuestions([])
    setCurrentQ(0)
    setAnswers([])
    setSelectedAnswer(null)
    setResult(null)
    setLoadError('')
    setTimeLeft(SUNDAY_SECS)
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const progressPct = questions.length > 0 ? ((currentQ + 1) / questions.length) * 100 : 0
  const resultGradeColor = result ? gradeColor(result.grade) : '#a855f7'

  const missedQs = (result?.answers ?? [])
    .map((a: any, i: number) => ({ ...a, q: questions[i] }))
    .filter((a: any) => !a.isCorrect && a.q)

  // ── Render ────────────────────────────────────────────────────────────────

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

      <div
        style={S.page}
        onContextMenu={(e) => { if (quizState === 'active') e.preventDefault() }}
        onCopy={(e) => { if (quizState === 'active') e.preventDefault() }}
        onCut={(e) => { if (quizState === 'active') e.preventDefault() }}
        onKeyDown={(e) => {
          if (quizState === 'active' && e.ctrlKey && ['c', 'a', 'x', 'C', 'A', 'X'].includes(e.key)) {
            e.preventDefault()
          }
        }}
      >

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div style={S.topBar}>
          <button
            type="button"
            style={S.backBtn}
            onClick={() => quizState === 'home' ? router.back() : resetAll()}
          >
            ←
          </button>
          <h1 style={S.pageTitle}>
            {quizState === 'active'
              ? `Question ${currentQ + 1} / ${questions.length}`
              : quizState === 'results'
                ? 'Results'
                : 'Sunday Test'}
          </h1>
          {quizState === 'active' && (
            <span style={{ marginLeft: 'auto', ...S.timer(timeLeft < 120) }}>
              {formatTime(timeLeft)}
            </span>
          )}
        </div>

        <div style={S.inner}>

          {/* ══════════════════════════════════════════════════════════════
              LOADING
          ══════════════════════════════════════════════════════════════ */}
          {quizState === 'loading' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px' }}>⏳</div>
              <p style={{ color: '#94a3b8', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                Loading questions... please wait
              </p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              HOME — Sunday Test card
          ══════════════════════════════════════════════════════════════ */}
          {quizState === 'home' && (
            <>
              <SundayBanner />
              {/* Hero card */}
              <div style={{
                background: sundayUnlocked
                  ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.08))'
                  : '#111d30',
                border: `1.5px solid ${sundayUnlocked ? '#a855f7' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: '18px',
                padding: '32px 24px',
                textAlign: 'center',
                marginBottom: '24px',
              }}>
                <div style={{ fontSize: '42px', marginBottom: '14px' }}>📋</div>
                <h2 style={{
                  fontFamily: 'var(--font-sora, Sora, sans-serif)',
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#a855f7',
                  margin: '0 0 8px',
                }}>
                  Sunday Test
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 6px' }}>
                  {SUNDAY_COUNT} questions &nbsp;·&nbsp; {SUNDAY_MINS} minutes &nbsp;·&nbsp; All Chapters
                </p>
                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 24px' }}>
                  KPK Board · FSc Chemistry · 2× XP bonus
                </p>

                {sundayUnlocked ? (
                  <>
                    {loadError && (
                      <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>
                        {loadError}
                      </p>
                    )}
                    {alreadyTook ? (
                      <button
                        type="button"
                        disabled
                        style={{
                          padding: '14px 40px',
                          borderRadius: '12px',
                          border: 'none',
                          background: '#334155',
                          color: 'rgba(255,255,255,0.5)',
                          fontFamily: 'var(--font-sora, Sora, sans-serif)',
                          fontSize: '15px',
                          fontWeight: 700,
                          cursor: 'not-allowed',
                          width: '100%',
                          maxWidth: '280px',
                        }}
                      >
                        ✅ Already taken this week
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!userId}
                        onClick={startQuiz}
                        style={{
                          padding: '14px 40px',
                          borderRadius: '12px',
                          border: 'none',
                          background: userId
                            ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
                            : 'rgba(168,85,247,0.3)',
                          color: userId ? '#fff' : 'rgba(255,255,255,0.4)',
                          fontFamily: 'var(--font-sora, Sora, sans-serif)',
                          fontSize: '15px',
                          fontWeight: 700,
                          cursor: userId ? 'pointer' : 'not-allowed',
                          transition: 'all .15s',
                          width: '100%',
                          maxWidth: '280px',
                        }}
                      >
                        {userId ? 'Begin Sunday Test' : 'Loading...'}
                      </button>
                    )}
                  </>
                ) : (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '999px',
                    background: 'rgba(100,116,139,0.12)',
                    border: '1px solid rgba(100,116,139,0.25)',
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}>
                    🔒 Available Sundays only &nbsp;·&nbsp; {daysAway} day{daysAway !== 1 ? 's' : ''} away
                  </div>
                )}
              </div>

              {/* Info cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { icon: '🎯', title: 'Full syllabus', desc: 'Questions from all 24 chapters' },
                  { icon: '⏱', title: `${SUNDAY_MINS} minutes`, desc: 'Timed test with live countdown' },
                  { icon: '⚡', title: '2× XP bonus', desc: 'Double XP for Sunday tests' },
                  { icon: '📊', title: 'Detailed results', desc: 'Review every missed question' },
                ].map((item, i) => (
                  <div key={i} style={{
                    background: '#111d30',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px',
                    padding: '14px',
                  }}>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{item.icon}</div>
                    <div style={{
                      fontFamily: 'var(--font-sora, Sora, sans-serif)',
                      fontSize: '13px', fontWeight: 700, color: '#f1f5f9',
                      marginBottom: '3px',
                    }}>{item.title}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              ACTIVE — Quiz screen
          ══════════════════════════════════════════════════════════════ */}
          {quizState === 'active' && questions.length > 0 && (
            <>
              {/* Progress bar */}
              <div style={S.progressBar}>
                <div style={S.progressFill(progressPct)} />
              </div>

              <div className="quiz-protected" style={S.quizCard}>
                {/* Topic label */}
                {questions[currentQ]?.topic_slug && (
                  <div style={S.topicLabel}>
                    {String(questions[currentQ].topic_slug)
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                )}

                {/* Question text */}
                <div style={S.questionText}>
                  {questions[currentQ]?.question}
                </div>

                {/* Options */}
                {[0, 1, 2, 3].map(idx => {
                  const letter = 'ABCD'[idx]
                  const opts = getOptions(questions[currentQ])
                  const optionText = opts[idx] ?? ''
                  let state: 'idle' | 'correct' | 'wrong' | 'dim' | 'selected' = 'idle'
                  if (selectedAnswer !== null) {
                    if (idx === selectedAnswer) state = 'selected'
                    else state = 'dim'
                  }

                  return (
                    <button
                      key={letter}
                      type="button"
                      style={S.optionBtn(state)}
                      onClick={() => selectAnswer(idx)}
                      disabled={selectedAnswer !== null}
                    >
                      <span style={S.letterBadge(state)}>{letter}</span>
                      <span>{optionText}</span>
                    </button>
                  )
                })}

              </div>

              {selectedAnswer !== null && (
                <button type="button" style={S.nextBtn} onClick={nextQuestion}>
                  {currentQ + 1 >= questions.length ? 'View Results' : 'Next Question →'}
                </button>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════
              RESULTS
          ══════════════════════════════════════════════════════════════ */}
          {quizState === 'results' && result && (() => {
            const gc = resultGradeColor
            const uniqueWeakTopics: string[] = [...new Set<string>(missedQs.map((a: any) => a.q?.topic_slug).filter(Boolean))]
            const timeFmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
            const timeTaken = SUNDAY_SECS - timeLeft

            return (
              <>
                {/* ── Score card ───────────────────────────────────────────── */}
                <div style={{ ...S.resultsCard, marginBottom: '12px' }}>
                  {/* Grade circle */}
                  <div style={S.gradeCircle(gc)}>
                    <span style={S.gradeLabel(gc)}>{result.grade}</span>
                  </div>

                  <div style={{ fontSize: '30px', fontWeight: 800, color: '#f1f5f9', lineHeight: 1, marginBottom: '4px', fontFamily: 'var(--font-sora, Sora, sans-serif)' }}>
                    {result.score}/{result.total}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: gc, marginBottom: '10px' }}>
                    {result.pct}%
                  </div>

                  <div style={S.xpBadge}>
                    ⚡ +{result.xpEarned} XP earned
                    <span style={{ opacity: 0.7, fontWeight: 400 }}> (2× Sunday bonus)</span>
                  </div>

                  <p style={{ color: '#94a3b8', fontSize: '14px', margin: '12px 0 0' }}>
                    {result.pct >= 80 ? "Excellent! You're well prepared 🎉"
                      : result.pct >= 60 ? 'Good effort! Review weak topics 👍'
                      : result.pct >= 40 ? 'Keep practicing! Focus on weak areas 📚'
                      : 'Needs work. Revise these topics seriously ⚠️'}
                  </p>
                </div>

                {/* ── Stat row ─────────────────────────────────────────────── */}
                <div className="quiz-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' }}>
                    <div style={{ ...S.statVal, color: '#22c55e' }}>{result.score}</div>
                    <div style={S.statLbl}>✅ Correct</div>
                  </div>
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' }}>
                    <div style={{ ...S.statVal, color: '#ef4444' }}>{result.total - result.score}</div>
                    <div style={S.statLbl}>✗ Wrong</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' }}>
                    <div style={{ ...S.statVal, color: '#94a3b8' }}>{timeFmt(timeTaken)}</div>
                    <div style={S.statLbl}>⏱ Time</div>
                  </div>
                </div>

                {/* ── Weak topics ──────────────────────────────────────────── */}
                {missedQs.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{
                      fontSize: '12px', fontWeight: 700, color: '#ef4444',
                      textTransform: 'uppercase' as const, letterSpacing: '0.08em',
                      marginBottom: '10px',
                    }}>
                      ⚠️ Topics to Revise ({missedQs.length})
                    </p>
                    {missedQs.map((a: any, idx: number) => {
                      const opts = getOptions(a.q)
                      const selectedText = opts[a.selected] ?? ''
                      const correctText = opts[a.correct] ?? ''
                      const topicSlug = a.q?.topic_slug ?? ''
                      const chapterSlug = a.q?.chapter_slug ?? ''
                      const raw = a.q?.question ?? ''
                      const qPreview = raw.length > 80 ? raw.slice(0, 80) + '…' : raw

                      return (
                        <div key={a.qid ?? idx} style={{
                          background: 'rgba(239,68,68,0.06)',
                          border: '1px solid rgba(239,68,68,0.15)',
                          borderLeft: '3px solid #ef4444',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          marginBottom: '8px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '5px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>
                              {topicSlug ? topicSlug.replace(/-/g, ' ') : 'Unknown Topic'}
                            </span>
                            {topicSlug && (
                              <button
                                type="button"
                                onClick={() => {
                                  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                                    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
                                  }
                                  window.location.href = `/chat?topic=${topicSlug}&chapter=${chapterSlug}&t=${Date.now()}`
                                }}
                                style={{
                                  padding: '2px 8px', borderRadius: '4px',
                                  background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)',
                                  color: '#f97316', fontSize: '11px', fontWeight: 600,
                                  cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
                                }}
                              >
                                Study this →
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '7px', lineHeight: 1.4 }}>
                            {qPreview}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '4px',
                              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                              color: '#f87171', fontSize: '11px',
                            }}>
                              Your: {selectedText || '—'}
                            </span>
                            <span style={{
                              padding: '2px 8px', borderRadius: '4px',
                              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                              color: '#4ade80', fontSize: '11px',
                            }}>
                              Correct: {correctText}
                            </span>
                          </div>
                          {a.q?.explanation && (
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px', lineHeight: 1.4 }}>
                              {a.q.explanation}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── Suggested review ─────────────────────────────────────── */}
                {uniqueWeakTopics.length > 0 && (
                  <div style={{
                    marginBottom: '16px', padding: '14px',
                    background: '#111d30', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
                      📚 Suggested next session:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                      {uniqueWeakTopics.map((slug: string, i: number) => (
                        <span key={i} style={{
                          padding: '3px 10px', borderRadius: '999px',
                          background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)',
                          color: '#f97316', fontSize: '11px', fontWeight: 500,
                        }}>
                          {slug.replace(/-/g, ' ')}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                          navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
                        }
                        const first = missedQs[0] as any
                        const chSlug = first?.q?.chapter_slug ?? ''
                        const tSlug = first?.q?.topic_slug ?? ''
                        window.location.href = `/chat?chapter=${chSlug}&mode=quiz&topic=${tSlug}&t=${Date.now()}`
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

                {/* ── Action buttons ───────────────────────────────────────── */}
                <div style={S.actionRow}>
                  <button
                    type="button"
                    style={{ ...S.filledBtn, gridColumn: '1 / -1' }}
                    onClick={() => router.push('/dashboard')}
                  >
                    Dashboard
                  </button>
                </div>
              </>
            )
          })()}

        </div>
      </div>
    </>
  )
}


