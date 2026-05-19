'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Maps ─────────────────────────────────────────────────────────────────────

const CHAPTER_NAMES: Record<number, string> = {
  1: 'Stoichiometry', 2: 'Atomic Structure', 3: 'Chemical Bonding',
  4: 'States of Matter', 5: 'Thermochemistry', 6: 'Chemical Equilibrium',
  7: 'Acids, Bases and Salts', 8: 'Electrochemistry', 9: 'Reaction Kinetics',
  10: 'Organic Chemistry', 11: 'Hydrocarbons', 12: 'Alkyl Halides',
  13: 'Alcohols and Phenols', 14: 'Aldehydes and Ketones', 15: 'Carboxylic Acids',
  16: 'Macromolecules', 17: 'Common Chemical Industries', 18: 'Environmental Chemistry',
  19: 'Analytical Chemistry', 20: 'Transition Elements', 21: 'Coordination Chemistry',
  22: 'Biochemistry', 23: 'Nuclear Chemistry', 24: 'Chemistry of s-block Elements',
}

const TOPIC_COUNTS: Record<number, number> = {
  1: 20, 2: 32, 3: 28, 4: 19, 5: 24, 6: 28, 7: 24, 8: 23, 9: 26, 10: 28,
  11: 21, 12: 23, 13: 26, 14: 25, 15: 25, 16: 33, 17: 17, 18: 14, 19: 12,
  20: 10, 21: 10, 22: 21, 23: 11, 24: 13,
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUICK_COUNT = 10
const SUNDAY_COUNT = 35
const QUICK_SECS = 900   // 15 min
const SUNDAY_SECS = 2700 // 45 min

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

function daysUntilSunday(): number {
  const day = new Date().getDay()
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

  optionBtn: (state: 'idle' | 'correct' | 'wrong' | 'dim'): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '11px 14px',
    marginBottom: '8px',
    borderRadius: '10px',
    border: `1px solid ${
      state === 'correct' ? '#22c55e'
      : state === 'wrong' ? '#ef4444'
      : 'rgba(255,255,255,0.08)'
    }`,
    background:
      state === 'correct' ? 'rgba(34,197,94,0.12)'
      : state === 'wrong' ? 'rgba(239,68,68,0.10)'
      : state === 'dim' ? 'rgba(255,255,255,0.02)'
      : 'rgba(255,255,255,0.04)',
    color:
      state === 'correct' ? '#4ade80'
      : state === 'wrong' ? '#f87171'
      : state === 'dim' ? '#475569'
      : '#cbd5e1',
    fontSize: '14px',
    cursor: state === 'idle' ? 'pointer' : 'default',
    transition: 'all .12s',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  }),

  letterBadge: (state: 'idle' | 'correct' | 'wrong' | 'dim'): React.CSSProperties => ({
    width: '26px',
    height: '26px',
    borderRadius: '6px',
    background:
      state === 'correct' ? '#22c55e'
      : state === 'wrong' ? '#ef4444'
      : 'rgba(255,255,255,0.1)',
    color: state === 'correct' || state === 'wrong' ? '#fff' : '#94a3b8',
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

  const [userId, setUserId] = useState<string | null>(null)
  const [quizState, setQuizState] = useState<'home' | 'loading' | 'active' | 'results'>('home')
  const [mode, setMode] = useState<'quick' | 'sunday'>('quick')
  const [availableChapters, setAvailableChapters] = useState<{ id: number; name: string; topics: number }[]>([])
  const [selectedChapters, setSelectedChapters] = useState<number[]>([1])
  const [questions, setQuestions] = useState<any[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<any[]>([])
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplain, setShowExplain] = useState(false)
  const [showXP, setShowXP] = useState(false)
  const [timeLeft, setTimeLeft] = useState(QUICK_SECS)
  const [result, setResult] = useState<any>(null)
  const [loadError, setLoadError] = useState('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sunday gate
  const isSunday = new Date().getDay() === 0
  const forceTest =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('forceTest') === 'true'
      : false
  const sundayUnlocked = isSunday || forceTest
  const daysAway = (7 - new Date().getDay()) % 7 || 7

  // ── Auth on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) { router.push('/auth/signin'); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth/signin'); return }
      setUserId(session.user.id)
    })
  }, [])

  // ── Load chapters from content_chunks ─────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!supabase) return
      try {
        const { data, error } = await supabase
          .from('content_chunks')
          .select('chapter')
          .eq('board', 'KPK')
          .eq('class', 11)
        if (error) { console.error('chapters error:', error); return }
        const unique = [...new Set(data?.map((r: any) => r.chapter) ?? [])]
          .sort((a: any, b: any) => a - b)
        setAvailableChapters(
          unique.map((ch: any) => ({
            id: ch,
            name: CHAPTER_NAMES[ch] ?? 'Chapter ' + ch,
            topics: TOPIC_COUNTS[ch] ?? 0,
          })),
        )
      } catch (e) {
        console.error('load chapters exception:', e)
      }
    }
    load()
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
    if (selectedChapters.length === 0) { setLoadError('Select at least one chapter.'); return }

    setLoadError('')
    setQuizState('loading')
    const requiredCount = mode === 'sunday' ? SUNDAY_COUNT : QUICK_COUNT

    try {
      const { data: dbQ, error: dbErr } = await supabase
        .from('quiz_questions')
        .select('*')
        .in('chapter_slug', selectedChapters.map(ch => String(ch)))
        .eq('board', 'KPK')
        .limit(requiredCount)

      if (dbErr) console.error('quiz_questions fetch error:', dbErr)

      let pool: any[] = dbQ ?? []
      console.log('DB questions:', pool.length)

      // Top up with AI if needed
      if (pool.length < requiredCount) {
        try {
          const res = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chapterSlugs: selectedChapters.map(ch => String(ch)),
              count: requiredCount - pool.length,
              board: 'KPK',
            }),
          })
          const aiData = await res.json()
          console.log('AI questions:', aiData.questions?.length)
          pool = [...pool, ...(aiData.questions ?? [])]
        } catch (e) {
          console.error('AI generation error:', e)
        }
      }

      // Shuffle and slice
      pool = pool.sort(() => Math.random() - 0.5).slice(0, requiredCount)
      console.log('Final pool:', pool.length, pool)

      if (pool.length === 0) {
        alert('No questions available for selected chapters. Please try different chapters.')
        setQuizState('home')
        return
      }

      setQuestions(pool)
      setCurrentQ(0)
      setAnswers([])
      setSelectedAnswer(null)
      setShowExplain(false)
      setTimeLeft(mode === 'sunday' ? SUNDAY_SECS : QUICK_SECS)
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
    setShowExplain(true)

    const q = questions[currentQ]
    const correctIdx = getCorrectIndex(q)
    const isCorrect = idx === correctIdx

    if (isCorrect) {
      setShowXP(true)
      setTimeout(() => setShowXP(false), 1200)
    }

    // Record topic attempt
    if (userId && q.topic_slug) {
      try {
        const { error } = await supabase.rpc('record_topic_attempt', {
          p_user_id: userId,
          p_topic_slug: q.topic_slug,
          p_chapter_slug: q.chapter_slug ?? String(selectedChapters[0]),
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
    setShowExplain(false)
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
    const xpEarned = score * 10 * (mode === 'sunday' ? 2 : 1)
    const timeTaken = (mode === 'sunday' ? SUNDAY_SECS : QUICK_SECS) - timeLeft

    setResult({ score, total, pct, grade, xpEarned, answers: finalAnswers })
    setQuizState('results')

    if (!userId) { console.error('No userId in finishQuiz'); return }

    try {
      const { error: attemptError } = await supabase
        .from('quiz_attempts')
        .insert({
          user_id: userId,
          mode,
          chapter_slugs: JSON.stringify(selectedChapters.map(ch => String(ch))),
          score,
          total,
          grade,
          xp_earned: xpEarned,
          time_taken_seconds: timeTaken,
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
    setShowExplain(false)
    setResult(null)
    setLoadError('')
  }

  function toggleChapter(id: number) {
    setSelectedChapters(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id],
    )
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const progressPct = questions.length > 0 ? ((currentQ + 1) / questions.length) * 100 : 0
  const resultGradeColor = result ? gradeColor(result.grade) : '#f97316'

  // Missed questions: join answer objects with question objects by index
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

      <div style={S.page}>

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
                : 'Quiz & Tests'}
          </h1>
          {quizState === 'active' && (
            <span style={{ marginLeft: 'auto', ...S.timer(timeLeft < 120) }}>
              {formatTime(timeLeft)}
            </span>
          )}
        </div>

        {showXP && <div style={S.xpFloat}>+10 XP ⚡</div>}

        <div style={S.inner}>

          {/* ══════════════════════════════════════════════════════════════
              LOADING
          ══════════════════════════════════════════════════════════════ */}
          {quizState === 'loading' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px' }}>⏳</div>
              <p style={{
                color: '#94a3b8', fontSize: '16px', fontWeight: 600, margin: 0,
              }}>
                Loading questions... please wait
              </p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              HOME — Mode Select + Chapter Picker
          ══════════════════════════════════════════════════════════════ */}
          {quizState === 'home' && (
            <>
              <p style={S.sectionLabel}>Select Mode</p>
              <div style={S.modeGrid}>
                {/* Quick Quiz */}
                <div
                  role="button"
                  tabIndex={0}
                  style={S.card(mode === 'quick', '#f97316')}
                  onClick={() => setMode('quick')}
                  onKeyDown={e => e.key === 'Enter' && setMode('quick')}
                >
                  <div style={{ fontSize: '22px', marginBottom: '8px' }}>⚡</div>
                  <div style={{ ...S.cardTitle, color: '#f97316' }}>Quick Quiz</div>
                  <div style={S.cardMeta}>
                    {QUICK_COUNT} questions<br />15 minutes
                  </div>
                </div>

                {/* Sunday Test */}
                <div
                  role="button"
                  tabIndex={0}
                  style={{
                    ...S.card(mode === 'sunday', '#a855f7'),
                    opacity: sundayUnlocked ? 1 : 0.65,
                  }}
                  onClick={() => sundayUnlocked && setMode('sunday')}
                  onKeyDown={e => e.key === 'Enter' && sundayUnlocked && setMode('sunday')}
                >
                  <div style={{ fontSize: '22px', marginBottom: '8px' }}>📋</div>
                  <div style={{ ...S.cardTitle, color: '#a855f7' }}>Sunday Test</div>
                  <div style={S.cardMeta}>
                    {SUNDAY_COUNT} questions<br />45 minutes
                  </div>
                  {!sundayUnlocked && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#a855f7', fontWeight: 600 }}>
                      Available Sunday · {daysAway}d away
                    </div>
                  )}
                </div>
              </div>

              <p style={S.sectionLabel}>Select Chapters</p>
              <div style={S.chipWrap}>
                {availableChapters.map(ch => (
                  <button
                    key={ch.id}
                    type="button"
                    style={S.chip(selectedChapters.includes(ch.id))}
                    onClick={() => toggleChapter(ch.id)}
                  >
                    Ch {ch.id}: {ch.name}
                  </button>
                ))}
              </div>

              {loadError && (
                <p style={{
                  color: '#f87171', fontSize: '13px',
                  marginBottom: '10px', textAlign: 'center',
                }}>
                  {loadError}
                </p>
              )}

              <button
                type="button"
                style={S.startBtn(
                  !userId ||
                  selectedChapters.length === 0 ||
                  (mode === 'sunday' && !sundayUnlocked),
                )}
                disabled={
                  !userId ||
                  selectedChapters.length === 0 ||
                  (mode === 'sunday' && !sundayUnlocked)
                }
                onClick={startQuiz}
              >
                Start Quiz
              </button>
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

              <div style={S.quizCard}>
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
                  const correctIdx = getCorrectIndex(questions[currentQ])

                  let state: 'idle' | 'correct' | 'wrong' | 'dim' = 'idle'
                  if (selectedAnswer !== null) {
                    if (idx === correctIdx) state = 'correct'
                    else if (idx === selectedAnswer) state = 'wrong'
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

                {/* Explanation */}
                {showExplain && questions[currentQ]?.explanation && (
                  <div style={S.explanationBox}>
                    <strong>Explanation: </strong>
                    {questions[currentQ].explanation}
                  </div>
                )}
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
          {quizState === 'results' && result && (
            <>
              <div style={S.resultsCard}>
                {/* Grade circle */}
                <div style={S.gradeCircle(resultGradeColor)}>
                  <span style={S.gradeLabel(resultGradeColor)}>{result.grade}</span>
                </div>

                <p style={{
                  fontFamily: 'var(--font-sora, Sora, sans-serif)',
                  fontSize: '20px', fontWeight: 700,
                  margin: '0 0 4px', color: '#f1f5f9',
                }}>
                  {result.pct >= 80 ? 'Excellent work!'
                    : result.pct >= 60 ? 'Good effort!'
                    : result.pct >= 40 ? 'Keep practising!'
                    : 'Study harder!'}
                </p>

                <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
                  {mode === 'quick' ? 'Quick Quiz' : 'Sunday Test'} · {result.total} questions
                </p>

                <div style={S.statRow}>
                  <div style={S.statBox}>
                    <div style={{ ...S.statVal, color: '#4ade80' }}>{result.score}</div>
                    <div style={S.statLbl}>Correct</div>
                  </div>
                  <div style={S.statBox}>
                    <div style={{ ...S.statVal, color: '#f87171' }}>{result.total - result.score}</div>
                    <div style={S.statLbl}>Wrong</div>
                  </div>
                  <div style={S.statBox}>
                    <div style={{ ...S.statVal, color: '#f59e0b' }}>{result.pct}%</div>
                    <div style={S.statLbl}>Accuracy</div>
                  </div>
                </div>

                <div style={S.xpBadge}>
                  ⚡ +{result.xpEarned} XP earned
                  {mode === 'sunday' && (
                    <span style={{ opacity: 0.7, fontWeight: 400 }}> (2× Sunday bonus)</span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={S.actionRow}>
                <button type="button" style={S.outlineBtn} onClick={() => startQuiz()}>
                  Retry
                </button>
                <button type="button" style={S.filledBtn} onClick={() => router.push('/dashboard')}>
                  Dashboard
                </button>
              </div>

              {/* Missed questions */}
              {missedQs.length > 0 && (
                <div style={{ marginTop: '28px' }}>
                  <p style={{ ...S.sectionLabel, marginBottom: '12px' }}>
                    Missed Questions ({missedQs.length})
                  </p>
                  {missedQs.map((a: any, idx: number) => {
                    const opts = getOptions(a.q)
                    const correctText = opts[a.correct] ?? ''
                    const selectedText = opts[a.selected] ?? ''
                    const correctLetter = 'ABCD'[a.correct] ?? '?'
                    const selectedLetter = 'ABCD'[a.selected] ?? '?'

                    return (
                      <div key={a.qid ?? idx} style={S.missedItem}>
                        <div style={{ fontWeight: 600, marginBottom: '6px', color: '#f1f5f9' }}>
                          {a.q?.question}
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#f87171', marginBottom: '2px' }}>
                          Your answer: {selectedLetter} — {selectedText}
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#4ade80' }}>
                          Correct: {correctLetter} — {correctText}
                        </div>
                        {a.q?.explanation && (
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                            {a.q.explanation}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  )
}
