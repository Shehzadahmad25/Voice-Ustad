'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { getFirstName } from '@/lib/utils'
import { getSubscriptionStatus } from '@/lib/subscription'

// ── Chapter metadata ─────────────────────────────────────────────────────────
const CHAPTER_NAMES: Record<number, string> = {
  1: 'Stoichiometry',
  2: 'Atomic Structure',
  3: 'Chemical Bonding',
  4: 'States of Matter',
  5: 'Thermochemistry',
  6: 'Chemical Equilibrium',
  7: 'Acids, Bases and Salts',
  8: 'Electrochemistry',
  9: 'Reaction Kinetics',
  10: 'Organic Chemistry',
  11: 'Hydrocarbons',
  12: 'Alkyl Halides',
  13: 'Alcohols and Phenols',
  14: 'Aldehydes and Ketones',
  15: 'Carboxylic Acids',
  16: 'Macromolecules',
  17: 'Common Chemical Industries',
  18: 'Environmental Chemistry',
  19: 'Analytical Chemistry',
  20: 'Transition Elements',
  21: 'Coordination Chemistry',
  22: 'Biochemistry',
  23: 'Nuclear Chemistry',
  24: 'Chemistry of s-block Elements',
}

const TOPIC_COUNTS: Record<number, number> = {
  1: 20,  2: 32,  3: 28,  4: 19,  5: 24,
  6: 28,  7: 24,  8: 23,  9: 26,  10: 28,
  11: 21, 12: 23, 13: 26, 14: 25, 15: 25,
  16: 33, 17: 17, 18: 14, 19: 12, 20: 10,
  21: 10, 22: 21, 23: 11, 24: 13,
}

const CLASS_11_CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const CLASS_12_CHAPTERS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
const TOTAL_TOPICS = 486 // 290 (class 11) + 196 (class 12)

// ── Types ────────────────────────────────────────────────────────────────────
type TabKey = 'plan' | 'weak' | 'history'

interface WeakTopic {
  topic_slug: string
  chapter_slug?: string
  accuracy: number
  total_attempts?: number
  strength_label?: string
}

interface QuizAttempt {
  id: string
  score: number
  total: number
  mode?: string
  chapter_slugs?: string | null
  accuracy?: number
  grade?: string
  xp_earned?: number
  completed_at: string
}

interface HeatmapDay {
  date: string
  count: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting(name: string): string {
  const h = new Date().getHours()
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Good ${time}, ${name}!`
}

function daysToExam(): number {
  const examDate = new Date('2027-05-15T00:00:00')
  return Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000))
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return formatShortDate(iso)
  } catch {
    return ''
  }
}

function gradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A') return '#22c55e'
  if (grade === 'B+') return '#84cc16'
  if (grade === 'B') return '#eab308'
  if (grade === 'C') return '#f97316'
  return '#ef4444'
}

function accuracyBarColor(acc: number): string {
  if (acc < 50) return '#ef4444'
  if (acc < 70) return '#f97316'
  return '#eab308'
}

function chapterSlugToNum(slug?: string | null): number | null {
  if (!slug) return null
  const n = Number(slug)
  if (!isNaN(n)) return n
  const m = slug.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

// ── SVG Progress Ring ────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const safePct = Math.max(0, Math.min(100, isFinite(pct) ? pct : 0))
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (safePct / 100) * circ
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={safePct >= 100 ? '#22c55e' : safePct > 0 ? '#f97316' : '#1e293b'}
        strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = '18px', r = '8px' }: { w?: string; h?: string; r?: string }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} />
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const supabase = getSupabaseClient()

  // Auth / profile
  const [user, setUser] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Stats
  const [coveredCount, setCoveredCount] = useState(0)
  const [weakCount, setWeakCount] = useState(0)

  // Study Plan tab
  const [studyWeakTopic, setStudyWeakTopic] = useState<WeakTopic | null>(null)
  const [studyLastChapter, setStudyLastChapter] = useState<number | null>(null)
  const [studyNextChapter, setStudyNextChapter] = useState<number>(1)

  // Tab data
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([])
  const [quizHistory, setQuizHistory] = useState<QuizAttempt[]>([])
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDay[]>([])

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>('plan')
  const [showAllChapters, setShowAllChapters] = useState(false)
  const [tooltipDay, setTooltipDay] = useState<{ idx: number; x: number; y: number } | null>(null)
  const heatRef = useRef<HTMLDivElement>(null)

  // Reset scroll on mount
  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
  }, [])

  // ── Data load — called on mount and whenever the tab becomes visible again ──
  const loadDashboardData = async () => {
    try {
      let u: any = null
      if (supabase) {
        const { data } = await supabase.auth.getUser()
        u = data?.user ?? null
      }

      if (!u) {
        router.push('/auth/signin')
        return
      }

      // ── Subscription gate ──────────────────────────────────────────────
      const subStatus = await getSubscriptionStatus(u.id)
      if (!subStatus.hasAccess) {
        router.push('/pricing?reason=expired')
        return
      }
      // ──────────────────────────────────────────────────────────────────

      setUser(u)
      setUserId(u.id)
      if (!supabase) { setLoading(false); return }

      const uid = u.id

      // Try dashboard summary RPC first
      let summaryData: any = null
      try {
        const { data: rpcData, error: rpcErr } = await supabase
          .rpc('get_dashboard_summary', { p_user_id: uid, p_board: 'KPK' })
        if (!rpcErr) summaryData = rpcData
      } catch {
        // RPC not available, will fall back to individual queries
      }

      const [
        profileRes,
        coveredCountRes,
        weakCountRes,
        weakDetailRes,
        quizRes,
        sqrRes,
        heatmapRes,
        lastCovRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('user_topic_coverage').select('topic_slug, chapter_slug', { count: 'exact' }).eq('user_id', uid),
        supabase.from('user_topic_performance').select('id', { count: 'exact' }).eq('user_id', uid).eq('strength_label', 'weak'),
        supabase
          .from('user_topic_performance')
          .select('topic_slug, chapter_slug, accuracy, total_attempts, strength_label')
          .eq('user_id', uid)
          .eq('strength_label', 'weak')
          .order('accuracy', { ascending: true })
          .limit(10),
        supabase
          .from('quiz_attempts')
          .select('id, mode, chapter_slugs, score, total, accuracy, grade, xp_earned, completed_at')
          .eq('user_id', uid)
          .order('completed_at', { ascending: false })
          .limit(15),
        supabase
          .from('student_quiz_results')
          .select('id, chapter_id, chapter_title, score, total_questions, percentage, taken_at')
          .eq('user_id', uid)
          .order('taken_at', { ascending: false })
          .limit(15),
        supabase
          .from('chat_sessions')
          .select('created_at')
          .eq('user_id', uid)
          .gte('created_at', new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('user_topic_coverage')
          .select('chapter_slug')
          .eq('user_id', uid)
          .order('covered_at', { ascending: false })
          .limit(1),
      ])

      setProfile(profileRes.data)

      if (summaryData) {
        setCoveredCount(summaryData.topics_covered ?? coveredCountRes.count ?? 0)
        setWeakCount(summaryData.weak_topics ?? weakCountRes.count ?? 0)
      } else {
        setCoveredCount(coveredCountRes.count || 0)
        setWeakCount(weakCountRes.count || 0)
      }

      const weakData: WeakTopic[] = weakDetailRes.data || []
      setWeakTopics(weakData)

      // ── Study Plan goals ─────────────────────────────────────────────────
      // Goal 1: top weak topic for Revise card
      setStudyWeakTopic(weakData[0] ?? null)

      // Goal 2: last studied chapter for Continue card
      const lastCovRow = (lastCovRes.data as any[])?.[0]
      if (lastCovRow?.chapter_slug) {
        const n = Number(lastCovRow.chapter_slug)
        setStudyLastChapter(isNaN(n) ? null : n)
      } else {
        setStudyLastChapter(null)
      }

      // Goal 3: first unstarted chapter for Start New card
      const coveredChapterNums = new Set<number>(
        ((coveredCountRes.data as any[]) || [])
          .map((r: any) => { const n = Number(r.chapter_slug); return isNaN(n) ? null : n })
          .filter((n): n is number => n !== null)
      )
      const nextCh = ([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24] as number[])
        .find(ch => !coveredChapterNums.has(ch)) ?? 1
      setStudyNextChapter(nextCh)

      // Merge quiz_attempts + student_quiz_results into unified history
      const attempts: QuizAttempt[] = quizRes.data || []
      const sqrItems: QuizAttempt[] = (sqrRes.data || []).map((r: any) => ({
        id: r.id,
        score: r.score,
        total: r.total_questions,
        mode: 'chat-quiz',
        chapter_slugs: JSON.stringify([String(r.chapter_id)]),
        accuracy: r.percentage,
        grade: undefined,
        xp_earned: undefined,
        completed_at: r.taken_at,
      }))
      // De-duplicate by preferring quiz_attempts (chat-quiz entries) which were added after QuizModal Task 6
      // Keep sqrRes entries only if their chapter+time doesn't overlap with an existing quiz_attempts row
      const attemptTimestamps = new Set(attempts.map(a => a.completed_at?.slice(0, 16)))
      const uniqueSqr = sqrItems.filter(s => !attemptTimestamps.has(s.completed_at?.slice(0, 16)))
      const merged = [...attempts, ...uniqueSqr]
        .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
        .slice(0, 15)
      setQuizHistory(merged)

      // Heatmap from chat_sessions
      if (heatmapRes.data) {
        const dayCounts = new Map<string, number>()
        const now = Date.now()
        for (let i = 69; i >= 0; i--) {
          const d = new Date(now - i * 86400000)
          dayCounts.set(d.toISOString().slice(0, 10), 0)
        }
        for (const row of heatmapRes.data) {
          const key = (row.created_at as string).slice(0, 10)
          if (dayCounts.has(key)) dayCounts.set(key, (dayCounts.get(key) || 0) + 1)
        }
        setHeatmapDays(Array.from(dayCounts.entries()).map(([date, count]) => ({ date, count })))
      }
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }

  // ── Mount ────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDashboardData() }, [])

  // ── Visibility refresh — re-fetches when user returns to this tab ────────────
  useEffect(() => {
    if (!userId) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadDashboardData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Empty heatmap fallback
  useEffect(() => {
    if (heatmapDays.length === 0 && !loading) {
      const days: HeatmapDay[] = []
      const now = Date.now()
      for (let i = 69; i >= 0; i--) {
        const d = new Date(now - i * 86400000)
        days.push({ date: d.toISOString().slice(0, 10), count: 0 })
      }
      setHeatmapDays(days)
    }
  }, [loading])

  // ── Derived values ────────────────────────────────────────────────────────
  const firstName = getFirstName(profile, user)
  const coveragePct = Math.round((coveredCount / TOTAL_TOPICS) * 100)
  const streak = profile?.streak || 0
  const xp = profile?.xp || 0
  const board = profile?.board || 'KPK'
  const cls = profile?.class || '11'
  const goal = profile?.goal || ''
  const examDays = daysToExam()

  // ── Render helpers ─────────────────────────────────────────────────────────
  function avatarLetter(): string {
    return firstName.charAt(0).toUpperCase()
  }

  function heatColor(count: number): string {
    if (count === 0) return '#1e293b'
    if (count === 1) return '#92400e'
    if (count === 2) return '#c2410c'
    return '#f97316'
  }

  const navStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    height: '60px',
    background: '#07101f',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    gap: '12px',
  }

  const pillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    background: 'rgba(255,255,255,0.07)',
    color: '#f1f5f9',
    border: '1px solid rgba(255,255,255,0.09)',
    cursor: 'default',
    userSelect: 'none',
  }

  const cardBase: React.CSSProperties = {
    background: '#0d1626',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    padding: '18px 20px',
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #f97316' : '2px solid transparent',
    color: active ? '#ffffff' : '#64748b',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: active ? '700' : '500',
    padding: '10px 16px',
    cursor: 'pointer',
    transition: 'color 0.15s',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#07101f', fontFamily: 'inherit' }}>

      {/* ── Responsive CSS ─────────────────────────────────────────────────── */}
      <style>{`
        .db-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .db-nav-center { display: flex; }
        @media (max-width: 900px) {
          .db-stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .db-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .db-nav-center { display: none !important; }
        }
        .db-chapter-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 14px 0 4px;
        }
        .db-heat-grid {
          display: grid;
          grid-template-rows: repeat(7, 14px);
          grid-auto-flow: column;
          gap: 3px;
        }
        .db-heat-cell {
          width: 14px;
          height: 14px;
          border-radius: 3px;
          cursor: default;
          transition: opacity 0.1s;
        }
        .db-heat-cell:hover { opacity: 0.75; }
        .db-quiz-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .db-quiz-row:last-child { border-bottom: none; }
        .db-chapter-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          margin-bottom: 8px;
        }
        .db-chapter-card:hover {
          border-color: rgba(249,115,22,0.35);
          background: rgba(249,115,22,0.04);
        }
        .db-chapter-card.expanded {
          border-color: rgba(249,115,22,0.45);
          background: rgba(249,115,22,0.06);
        }
      `}</style>

      {/* ── Inline Navbar ────────────────────────────────────────────────────── */}
      <nav style={navStyle}>
        {/* Logo */}
        <img
          src="/logo.jpg"
          alt="VoiceUstad"
          height={36}
          style={{ height: '36px', cursor: 'pointer', objectFit: 'contain', borderRadius: '6px' }}
          onClick={() => router.push('/dashboard')}
        />

        {/* Center: board + class */}
        <div className="db-nav-center" style={{ alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
            {board} Board · Class {cls}
          </span>
        </div>

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ ...pillStyle, background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
            🔥 {streak}
          </span>
          <span style={{ ...pillStyle, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            ⚡ {xp} XP
          </span>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #f97316, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '800', fontSize: '14px', color: 'white', flexShrink: 0,
          }}>
            {avatarLetter()}
          </div>
          <button onClick={() => router.push('/chat')} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: '600',
            cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
          >
            Chat
          </button>
          <button onClick={() => router.push('/quiz')} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: '600',
            cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
          >
            Quiz
          </button>
        </div>
      </nav>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* ── Greeting Banner ─────────────────────────────────────────────── */}
        <div style={{
          ...cardBase,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '20px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}>
          <div>
            {loading ? (
              <>
                <Sk w="260px" h="32px" r="8px" />
                <div style={{ marginTop: '10px' }}>
                  <Sk w="300px" h="16px" />
                </div>
              </>
            ) : (
              <>
                <h1 style={{
                  fontFamily: 'var(--font-sora, inherit)',
                  fontSize: 'clamp(20px, 4vw, 28px)',
                  fontWeight: '800',
                  color: '#f1f5f9',
                  margin: '0 0 8px',
                  lineHeight: 1.2,
                }}>
                  {getGreeting(firstName)}
                </h1>
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                  {profile?.board ?? 'KPK'} Board · Class {profile?.class ?? '11'}
                </p>
              </>
            )}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            background: 'rgba(249,115,22,0.1)',
            border: '1px solid rgba(249,115,22,0.25)',
            color: '#f97316',
            fontWeight: '700',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            📅 {examDays} days to KPK Board Exam
          </div>
        </div>

        {/* ── Stats Row ───────────────────────────────────────────────────── */}
        <div className="db-stats-grid" style={{ marginBottom: '28px' }}>
          {[
            {
              icon: '📚',
              value: loading ? null : `${coveragePct}%`,
              label: 'Topics Covered',
              sub: loading ? '' : `${coveredCount}/${TOTAL_TOPICS} topics`,
              accent: '#a855f7',
            },
            {
              icon: '🔥',
              value: loading ? null : streak,
              label: 'Day Streak',
              sub: 'Keep it up!',
              accent: '#f97316',
            },
            {
              icon: '⚡',
              value: loading ? null : xp,
              label: 'Total XP',
              sub: '⚡ earned',
              accent: '#f59e0b',
            },
            {
              icon: '⚠️',
              value: loading ? null : weakCount,
              label: 'Weak Topics',
              sub: 'Need review',
              accent: '#ef4444',
            },
          ].map((stat, i) => (
            <div key={i} style={cardBase}>
              {loading ? (
                <>
                  <Sk w="32px" h="32px" r="8px" />
                  <div style={{ marginTop: '12px', marginBottom: '6px' }}><Sk w="60px" h="28px" r="6px" /></div>
                  <Sk w="80%" h="13px" />
                  <div style={{ marginTop: '6px' }}><Sk w="60%" h="11px" /></div>
                </>
              ) : (
                <>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: `${stat.accent}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', marginBottom: '12px',
                  }}>
                    {stat.icon}
                  </div>
                  <div style={{
                    fontSize: '28px', fontWeight: '900', color: stat.accent,
                    lineHeight: 1, marginBottom: '4px',
                    fontFamily: 'var(--font-sora, inherit)',
                  }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9', marginBottom: '3px' }}>
                    {stat.label}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {stat.sub}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div style={{ ...cardBase, marginBottom: '24px' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex',
            gap: '0',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            marginBottom: '20px',
            overflowX: 'auto',
          }}>
            {(['plan', 'weak', 'history'] as TabKey[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={tabBtnStyle(activeTab === tab)}
              >
                {tab === 'plan' ? '📅 Study Plan' : tab === 'weak' ? '⚠️ Weak Topics' : '📝 Quiz History'}
              </button>
            ))}
          </div>

          {/* ── Study Plan Tab ─────────────────────────────────────────────── */}
          {activeTab === 'plan' && (
            <div>
              {/* Header */}
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{
                  fontSize: '17px', fontWeight: '800', color: '#f1f5f9',
                  margin: '0 0 4px', fontFamily: 'var(--font-sora, inherit)',
                }}>
                  📅 Today&apos;s Study Plan
                </h2>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  {' · '}{examDays} days to exam
                </p>
              </div>

              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Array.from({ length: 3 }).map((_, i) => <Sk key={i} h="88px" r="12px" />)}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>

                  {/* Goal 1: Revise weak topic */}
                  {studyWeakTopic ? (
                    <div style={{
                      background: '#111d30',
                      border: '1px solid #1a2d47',
                      borderLeft: '4px solid #ef4444',
                      borderRadius: '12px',
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '11px', fontWeight: '700', color: '#fca5a5',
                          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px',
                        }}>
                          ⚠️ Revise
                        </div>
                        <div style={{
                          fontSize: '15px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {studyWeakTopic.topic_slug
                            .split('-')
                            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Accuracy: {Math.round(studyWeakTopic.accuracy ?? 0)}% · Needs review
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/chat?chapter=${studyWeakTopic.chapter_slug}&topic=${studyWeakTopic.topic_slug}`)}
                        style={{
                          padding: '8px 16px', borderRadius: '9px',
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          color: '#ef4444', fontFamily: 'inherit',
                          fontWeight: '700', fontSize: '13px',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                      >
                        Study →
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      background: '#111d30',
                      border: '1px solid #1a2d47',
                      borderLeft: '4px solid #475569',
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        ⚠️ Revise
                      </div>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>
                        No weak topics yet — keep practicing!
                      </div>
                    </div>
                  )}

                  {/* Goal 2: Continue last studied chapter */}
                  <div style={{
                    background: '#111d30',
                    border: '1px solid #1a2d47',
                    borderLeft: '4px solid #3b82f6',
                    borderRadius: '12px',
                    padding: '16px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '11px', fontWeight: '700', color: '#93c5fd',
                        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px',
                      }}>
                        📖 Continue
                      </div>
                      <div style={{
                        fontSize: '15px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {studyLastChapter !== null
                          ? `Ch ${studyLastChapter}: ${CHAPTER_NAMES[studyLastChapter] ?? `Chapter ${studyLastChapter}`}`
                          : 'Ch 1: Stoichiometry'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {studyLastChapter !== null ? 'Pick up where you left off' : 'Start your first chapter'}
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(`/chat?chapter=${studyLastChapter ?? 1}`)}
                      style={{
                        padding: '8px 16px', borderRadius: '9px',
                        background: 'rgba(59,130,246,0.1)',
                        border: '1px solid rgba(59,130,246,0.25)',
                        color: '#60a5fa', fontFamily: 'inherit',
                        fontWeight: '700', fontSize: '13px',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)' }}
                    >
                      {studyLastChapter !== null ? 'Continue →' : 'Start →'}
                    </button>
                  </div>

                  {/* Goal 3: Start next unstarted chapter */}
                  <div style={{
                    background: '#111d30',
                    border: '1px solid #1a2d47',
                    borderLeft: '4px solid #22c55e',
                    borderRadius: '12px',
                    padding: '16px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '11px', fontWeight: '700', color: '#86efac',
                        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px',
                      }}>
                        🚀 Start New
                      </div>
                      <div style={{
                        fontSize: '15px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        Ch {studyNextChapter}: {CHAPTER_NAMES[studyNextChapter] ?? `Chapter ${studyNextChapter}`}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Next unstarted chapter
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(`/chat?chapter=${studyNextChapter}`)}
                      style={{
                        padding: '8px 16px', borderRadius: '9px',
                        background: 'rgba(34,197,94,0.1)',
                        border: '1px solid rgba(34,197,94,0.25)',
                        color: '#22c55e', fontFamily: 'inherit',
                        fontWeight: '700', fontSize: '13px',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.1)' }}
                    >
                      Start →
                    </button>
                  </div>
                </div>
              )}

              {/* ── Quick Chapter Quiz ─────────────────────────────────────── */}
              <div style={{ marginTop: '8px', marginBottom: '24px' }}>
                {/* Section header */}
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{
                    fontSize: '15px', fontWeight: '800', color: '#f1f5f9',
                    margin: '0 0 2px', fontFamily: 'var(--font-sora, inherit)',
                  }}>
                    🧪 Practice by chapter
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    Take a focused quiz on any chapter
                  </p>
                </div>

                {/* Chapter cards 2-col grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {(showAllChapters ? CLASS_11_CHAPTERS : CLASS_11_CHAPTERS.slice(0, 4)).map(ch => (
                    <button
                      key={ch}
                      onClick={() => router.push(`/chat?chapter=${ch}&mode=quiz`)}
                      style={{
                        background: '#111d30',
                        border: '1px solid #1a2d47',
                        borderRadius: '12px',
                        padding: '14px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)'
                        e.currentTarget.style.background = 'rgba(249,115,22,0.05)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = '#1a2d47'
                        e.currentTarget.style.background = '#111d30'
                      }}
                    >
                      {/* Chapter number badge */}
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        background: 'rgba(249,115,22,0.15)',
                        border: '1px solid rgba(249,115,22,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '800', color: '#f97316',
                        flexShrink: 0,
                      }}>
                        {ch}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px', fontWeight: '700', color: '#f1f5f9',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          marginBottom: '1px',
                        }}>
                          {CHAPTER_NAMES[ch]}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {TOPIC_COUNTS[ch]} topics
                        </div>
                      </div>
                      {/* Arrow */}
                      <span style={{ fontSize: '11px', color: '#f97316', fontWeight: '700', flexShrink: 0 }}>
                        Quiz →
                      </span>
                    </button>
                  ))}
                </div>

                {/* See all / show less */}
                <button
                  onClick={() => setShowAllChapters(prev => !prev)}
                  style={{
                    marginTop: '10px',
                    background: 'none', border: 'none',
                    color: '#f97316', fontSize: '13px', fontWeight: '700',
                    cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0',
                  }}
                >
                  {showAllChapters ? '▲ Show less' : 'See all chapters →'}
                </button>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { value: 3, label: 'Goals today', color: '#f97316' },
                  { value: 0, label: 'Completed', color: '#22c55e' },
                  { value: examDays, label: 'Days to exam', color: '#60a5fa' },
                ].map((stat, i) => (
                  <div key={i} style={{
                    background: '#111d30',
                    border: '1px solid #1a2d47',
                    borderRadius: '10px',
                    padding: '14px 12px',
                    textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: '26px', fontWeight: '900', color: stat.color,
                      lineHeight: 1, fontFamily: 'var(--font-sora, inherit)',
                    }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Weak Topics Tab ───────────────────────────────────────────── */}
          {activeTab === 'weak' && (
            <div>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Sk key={i} h="80px" r="12px" />
                  ))}
                </div>
              ) : weakTopics.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎉</div>
                  <p style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>
                    No weak topics yet — keep practicing!
                  </p>
                  <p style={{ color: '#64748b', fontSize: '13px' }}>
                    Your topic performance will appear here after quizzes.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {weakTopics.map((topic, idx) => {
                    const accuracy = topic.accuracy ?? 0
                    const barColor = accuracyBarColor(accuracy)
                    const attempts = topic.total_attempts ?? 0
                    const label = topic.topic_slug?.replace(/-/g, ' ') || 'Unknown Topic'
                    const chNum = chapterSlugToNum(topic.chapter_slug)
                    const chapterName = chNum !== null
                      ? (CHAPTER_NAMES[chNum] ?? `Chapter ${topic.chapter_slug}`)
                      : (topic.chapter_slug?.replace(/-/g, ' ') || '—')

                    return (
                      <div key={idx} style={{
                        ...cardBase,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                      }}>
                        {/* Left: topic info */}
                        <div style={{ flex: 1, minWidth: '160px' }}>
                          <p style={{
                            fontSize: '14px', fontWeight: '700', color: '#f1f5f9',
                            margin: '0 0 3px', textTransform: 'capitalize',
                          }}>
                            {label}
                          </p>
                          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>
                            {chapterName}
                          </p>
                          <div style={{
                            height: '5px', background: 'rgba(255,255,255,0.08)',
                            borderRadius: '5px', overflow: 'hidden', maxWidth: '200px',
                          }}>
                            <div style={{
                              width: `${accuracy}%`, height: '100%',
                              background: barColor, borderRadius: '5px',
                              transition: 'width 0.4s ease',
                            }} />
                          </div>
                        </div>

                        {/* Accuracy */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                          <span style={{ fontSize: '18px', fontWeight: '800', color: barColor }}>
                            {Math.round(accuracy)}%
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {attempts} attempt{attempts !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Quiz it button */}
                        <button
                          onClick={() => router.push(`/chat?chapter=${topic.chapter_slug}&mode=quiz&topic=${topic.topic_slug}`)}
                          style={{
                            padding: '7px 14px', borderRadius: '8px',
                            background: 'rgba(249,115,22,0.1)',
                            border: '1px solid rgba(249,115,22,0.25)',
                            color: '#f97316', fontFamily: 'inherit',
                            fontWeight: '700', fontSize: '12px',
                            cursor: 'pointer', flexShrink: 0,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.2)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.1)' }}
                        >
                          Quiz it →
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Quiz History Tab ──────────────────────────────────────────── */}
          {activeTab === 'history' && (
            <div>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Sk key={i} h="52px" r="8px" />
                  ))}
                </div>
              ) : quizHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>📝</div>
                  <p style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: '700', marginBottom: '6px' }}>
                    No quizzes taken yet — start your first quiz!
                  </p>
                  <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>
                    Head over to the quiz page to test your knowledge.
                  </p>
                  <button
                    onClick={() => router.push('/chat?mode=quiz')}
                    style={{
                      padding: '9px 22px', borderRadius: '9px',
                      background: '#f97316', color: '#000',
                      fontFamily: 'inherit', fontWeight: '700', fontSize: '14px',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    Start a Quiz →
                  </button>
                </div>
              ) : (
                <div>
                  {quizHistory.map(attempt => {
                    const total = attempt.total || 1
                    const score = attempt.score || 0
                    const acc = attempt.accuracy != null
                      ? Math.round(attempt.accuracy)
                      : Math.round((score / total) * 100)
                    const gradeLbl = attempt.grade || (() => {
                      if (acc >= 95) return 'A+'
                      if (acc >= 85) return 'A'
                      if (acc >= 75) return 'B+'
                      if (acc >= 65) return 'B'
                      if (acc >= 50) return 'C'
                      return 'F'
                    })()
                    const gColor = gradeColor(gradeLbl)
                    const modeIcon = attempt.mode === 'sunday' ? '🗓' : '⚡'

                    // Parse chapter names
                    let chapterNames = ''
                    try {
                      const slugs: string[] = attempt.chapter_slugs
                        ? JSON.parse(attempt.chapter_slugs)
                        : []
                      chapterNames = slugs
                        .map(s => {
                          const n = chapterSlugToNum(s)
                          return n !== null ? (CHAPTER_NAMES[n] ?? s) : s
                        })
                        .join(', ')
                    } catch {
                      chapterNames = ''
                    }

                    return (
                      <div key={attempt.id} className="db-quiz-row">
                        {/* Mode icon */}
                        <span style={{ fontSize: '18px', flexShrink: 0 }}>{modeIcon}</span>

                        {/* Chapter / score info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {chapterNames ? (
                            <p style={{
                              fontSize: '12px', color: '#94a3b8', margin: '0 0 2px',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {chapterNames}
                            </p>
                          ) : null}
                          <span style={{ fontSize: '15px', fontWeight: '800', color: '#f1f5f9' }}>
                            {score}/{total}
                          </span>
                          {attempt.xp_earned ? (
                            <span style={{
                              marginLeft: '8px', fontSize: '11px',
                              color: '#f59e0b', fontWeight: '600',
                            }}>
                              +{attempt.xp_earned} XP
                            </span>
                          ) : null}
                        </div>

                        {/* Grade badge */}
                        <span style={{
                          padding: '2px 8px', borderRadius: '6px',
                          fontSize: '11px', fontWeight: '800',
                          background: `${gColor}20`,
                          color: gColor,
                          border: `1px solid ${gColor}40`,
                          flexShrink: 0,
                        }}>
                          {gradeLbl}
                        </span>

                        {/* Accuracy bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px', maxWidth: '120px', flex: '0 1 120px' }}>
                          <div style={{
                            flex: 1, height: '5px',
                            background: 'rgba(255,255,255,0.08)',
                            borderRadius: '5px', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${acc}%`, height: '100%',
                              background: gColor, borderRadius: '5px',
                            }} />
                          </div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                            {acc}%
                          </span>
                        </div>

                        {/* Relative date */}
                        <span style={{ fontSize: '11px', color: '#475569', flexShrink: 0 }}>
                          {formatRelativeTime(attempt.completed_at)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Activity Heatmap ─────────────────────────────────────────────── */}
        <div style={{ ...cardBase, position: 'relative' }}>
          <p style={{
            fontSize: '13px', fontWeight: '700', color: '#64748b',
            textTransform: 'uppercase', letterSpacing: '0.09em',
            marginBottom: '16px',
          }}>
            70-Day Activity
          </p>

          {loading ? (
            <Sk h="80px" r="8px" />
          ) : (
            <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
              <div
                ref={heatRef}
                className="db-heat-grid"
                style={{ display: 'inline-grid', gridTemplateRows: 'repeat(7, 14px)', gridAutoFlow: 'column', gap: '3px' }}
              >
                {heatmapDays.map((day, idx) => (
                  <div
                    key={day.date}
                    className="db-heat-cell"
                    style={{ background: heatColor(day.count) }}
                    onMouseEnter={e => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const parent = heatRef.current?.getBoundingClientRect()
                      setTooltipDay({
                        idx,
                        x: rect.left - (parent?.left || 0) + 7,
                        y: rect.top - (parent?.top || 0) - 36,
                      })
                    }}
                    onMouseLeave={() => setTooltipDay(null)}
                  />
                ))}
              </div>
              {tooltipDay !== null && (
                <div style={{
                  position: 'absolute',
                  left: tooltipDay.x,
                  top: tooltipDay.y + 16 + 36,
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  color: '#f1f5f9',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 20,
                  transform: 'translateX(-50%)',
                }}>
                  {heatmapDays[tooltipDay.idx]?.date} · {heatmapDays[tooltipDay.idx]?.count} session{heatmapDays[tooltipDay.idx]?.count !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
            <span style={{ fontSize: '11px', color: '#475569' }}>Less</span>
            {[0, 1, 2, 3].map(level => (
              <div key={level} style={{
                width: '12px', height: '12px', borderRadius: '3px',
                background: heatColor(level),
              }} />
            ))}
            <span style={{ fontSize: '11px', color: '#475569' }}>More</span>
          </div>
        </div>

      </div>
    </div>
  )
}
