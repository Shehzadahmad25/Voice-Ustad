'use client'
export const dynamic = 'force-dynamic'

// ── AUTH BYPASS — development mode ──────────────────────────────────────────
// Auth guard (router.push('/auth/signin')) is disabled.
// A mock user is used when no real session exists.
// To re-enable: restore `if (!u) { router.push('/auth/signin'); return }`
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { getFirstName } from '@/lib/utils'

// ── Mock data ────────────────────────────────────────────────────────────────
const MOCK_USER = {
  id: 'dev-user-bypass',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' },
}
const MOCK_PROFILE = {
  full_name: 'Test User',
  email: 'test@example.com',
  board: 'KPK',
  class: '11',
  goal: 'FSc Pre-Medical',
  subscription_status: 'trial',
  referral_code: null,
  exam_date: null,
  streak: 3,
  xp: 150,
}

// ── Types ────────────────────────────────────────────────────────────────────
type TabKey = 'coverage' | 'weak' | 'history'

interface Chapter {
  id: string
  unit_number: number
  title: string
  class: string
  board: string
}

interface WeakTopic {
  id: string
  topic_slug: string
  term?: string
  chapter_slug?: string
  accuracy: number
  attempt_count?: number
}

interface QuizAttempt {
  id: string
  score: number
  total: number
  mode?: string
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

function gradeFromAccuracy(acc: number): { label: string; color: string } {
  if (acc >= 95) return { label: 'A+', color: '#22c55e' }
  if (acc >= 85) return { label: 'A', color: '#22c55e' }
  if (acc >= 75) return { label: 'B+', color: '#84cc16' }
  if (acc >= 65) return { label: 'B', color: '#eab308' }
  if (acc >= 50) return { label: 'C', color: '#f97316' }
  return { label: 'F', color: '#ef4444' }
}

function accuracyBarColor(acc: number): string {
  if (acc < 50) return '#ef4444'
  if (acc < 70) return '#f97316'
  return '#eab308'
}

// ── SVG Progress Ring ────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct >= 100 ? '#22c55e' : pct > 0 ? '#f97316' : 'rgba(255,255,255,0.12)'}
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
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Stats
  const [coveredCount, setCoveredCount] = useState(0)
  const [totalTopics, setTotalTopics] = useState(0)
  const [weakCount, setWeakCount] = useState(0)

  // Chapter data
  const [chapters, setChapters] = useState<Chapter[]>([])
  // topic_slug → chapter_slug  for user's covered topics
  const [coveredSlugs, setCoveredSlugs] = useState<Set<string>>(new Set())
  // Map: chapter label (e.g. "1") → total topic count in content_chunks
  const [chunksByChapter, setChunksByChapter] = useState<Map<string, Set<string>>>(new Map())
  // covered topic_slugs per chapter: chapter_slug → Set<topic_slug>
  const [coveredByChapter, setCoveredByChapter] = useState<Map<string, Set<string>>>(new Map())

  // Tab data
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([])
  const [quizHistory, setQuizHistory] = useState<QuizAttempt[]>([])
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDay[]>([])

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>('coverage')
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null)
  const [tooltipDay, setTooltipDay] = useState<{ idx: number; x: number; y: number } | null>(null)
  const heatRef = useRef<HTMLDivElement>(null)

  // Reset scroll on mount
  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
  }, [])

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        let u: any = null
        if (supabase) {
          const { data } = await supabase.auth.getUser()
          u = data?.user ?? null
        }

        // AUTH BYPASS: use mock when no real session
        if (!u) {
          setUser(MOCK_USER)
          setProfile(MOCK_PROFILE)

          if (supabase) {
            const { data: chData } = await supabase
              .from('chapters')
              .select('id, unit_number, title, class, board')
              .eq('board', 'KPK')
              .order('class', { ascending: true })
              .order('unit_number', { ascending: true })
            setChapters(chData || [])

            // Still load content_chunks for mock user so coverage tab shows totals
            const { data: chunksData } = await supabase
              .from('content_chunks')
              .select('chapter, topic_slug')
            if (chunksData) {
              const map = new Map<string, Set<string>>()
              let total = 0
              for (const row of chunksData) {
                const key = String(row.chapter ?? '')
                if (!map.has(key)) map.set(key, new Set())
                if (row.topic_slug) {
                  map.get(key)!.add(row.topic_slug)
                  total++
                }
              }
              setChunksByChapter(map)
              setTotalTopics(total)
            }
          }

          setLoading(false)
          return
        }

        setUser(u)
        if (!supabase) { setLoading(false); return }

        const userId = u.id

        const [
          profileRes,
          coveredRes,
          totalRes,
          weakCountRes,
          chaptersRes,
          coveredDetailRes,
          chunksRes,
          weakDetailRes,
          quizRes,
          heatmapRes,
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('user_topic_coverage').select('topic_slug', { count: 'exact' }).eq('user_id', userId),
          supabase.from('content_chunks').select('id', { count: 'exact' }),
          supabase.from('user_topic_performance').select('id', { count: 'exact' }).eq('user_id', userId).eq('strength_label', 'weak'),
          supabase.from('chapters').select('id, unit_number, title, class, board').eq('board', 'KPK').order('class', { ascending: true }).order('unit_number', { ascending: true }),
          supabase.from('user_topic_coverage').select('topic_slug, chapter_slug').eq('user_id', userId),
          supabase.from('content_chunks').select('chapter, topic_slug'),
          supabase.from('user_topic_performance').select('*').eq('user_id', userId).eq('strength_label', 'weak').order('accuracy', { ascending: true }).limit(10),
          supabase.from('quiz_attempts').select('*').eq('user_id', userId).order('completed_at', { ascending: false }).limit(10),
          supabase.from('chat_messages').select('created_at').eq('user_id', userId).gte('created_at', new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString()),
        ])

        setProfile(profileRes.data)
        setCoveredCount(coveredRes.count || 0)
        setTotalTopics(totalRes.count || 0)
        setWeakCount(weakCountRes.count || 0)
        setChapters(chaptersRes.data || [])
        setWeakTopics(weakDetailRes.data || [])
        setQuizHistory(quizRes.data || [])

        // Build covered slugs set
        if (coveredDetailRes.data) {
          const slugSet = new Set<string>(coveredDetailRes.data.map((r: any) => r.topic_slug).filter(Boolean))
          setCoveredSlugs(slugSet)

          // Build coveredByChapter map
          const cbcMap = new Map<string, Set<string>>()
          for (const row of coveredDetailRes.data) {
            if (!row.chapter_slug || !row.topic_slug) continue
            if (!cbcMap.has(row.chapter_slug)) cbcMap.set(row.chapter_slug, new Set())
            cbcMap.get(row.chapter_slug)!.add(row.topic_slug)
          }
          setCoveredByChapter(cbcMap)
        }

        // Build chunksByChapter map
        if (chunksRes.data) {
          const map = new Map<string, Set<string>>()
          for (const row of chunksRes.data) {
            const key = String(row.chapter ?? '')
            if (!map.has(key)) map.set(key, new Set())
            if (row.topic_slug) map.get(key)!.add(row.topic_slug)
          }
          setChunksByChapter(map)
        }

        // Build heatmap: count messages per calendar day
        if (heatmapRes.data) {
          const dayCounts = new Map<string, number>()
          const now = Date.now()
          for (let i = 69; i >= 0; i--) {
            const d = new Date(now - i * 86400000)
            const key = d.toISOString().slice(0, 10)
            dayCounts.set(key, 0)
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
    load()
  }, [])

  // Also build heatmap for mock user (empty)
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
  const coveragePct = totalTopics > 0 ? Math.round((coveredCount / totalTopics) * 100) : 0
  const streak = profile?.streak || 0
  const xp = profile?.xp || 0
  const board = profile?.board || 'KPK'
  const cls = profile?.class || '11'
  const goal = profile?.goal || ''
  const examDays = daysToExam()

  // Chapter topic counts from content_chunks
  function getChapterTopicCount(ch: Chapter): number {
    // Try matching by unit_number as string or chapter title
    const byNum = chunksByChapter.get(String(ch.unit_number))
    if (byNum) return byNum.size
    // Fallback: try title
    for (const [key, val] of chunksByChapter) {
      if (key.toLowerCase().includes(ch.title.toLowerCase().slice(0, 8))) return val.size
    }
    return 0
  }

  function getChapterCoveredCount(ch: Chapter): number {
    // First try by chapter_slug convention "chapter-N"
    const slug = `chapter-${ch.unit_number}`
    const covered = coveredByChapter.get(slug)
    if (covered) return covered.size
    // Fallback: count topics from chunks that appear in user's covered set
    const allTopics = chunksByChapter.get(String(ch.unit_number))
    if (!allTopics || allTopics.size === 0) return 0
    let cnt = 0
    for (const t of allTopics) {
      if (coveredSlugs.has(t)) cnt++
    }
    return cnt
  }

  function getChapterTopicList(ch: Chapter): string[] {
    const byNum = chunksByChapter.get(String(ch.unit_number))
    if (byNum) return Array.from(byNum)
    return []
  }

  // Weak topic slugs set for chip coloring
  const weakSlugs = new Set(weakTopics.map(w => w.topic_slug))

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
          {/* Streak pill */}
          <span style={{ ...pillStyle, background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
            🔥 {streak}
          </span>
          {/* XP pill */}
          <span style={{ ...pillStyle, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            ⚡ {xp} XP
          </span>
          {/* Avatar */}
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #f97316, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '800', fontSize: '14px', color: 'white', flexShrink: 0,
          }}>
            {avatarLetter()}
          </div>
          {/* Nav links */}
          <button onClick={() => router.push('/chat')} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: '600',
            cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
            transition: 'color 0.15s',
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
            transition: 'color 0.15s',
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
                  {[board, `Class ${cls}`, goal].filter(Boolean).join(' · ')}
                </p>
              </>
            )}
          </div>
          {/* Exam countdown badge */}
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
              sub: loading ? '' : `${coveredCount}/${totalTopics} topics`,
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
            {(['coverage', 'weak', 'history'] as TabKey[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={tabBtnStyle(activeTab === tab)}
              >
                {tab === 'coverage' ? '📊 Coverage' : tab === 'weak' ? '⚠️ Weak Topics' : '📝 Quiz History'}
              </button>
            ))}
          </div>

          {/* ── Coverage Tab ──────────────────────────────────────────────── */}
          {activeTab === 'coverage' && (
            <div>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Sk key={i} h="64px" r="12px" />
                  ))}
                </div>
              ) : chapters.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>
                  No chapters loaded yet.
                </p>
              ) : (
                <div>
                  {(['11', '12'] as const).map(clsGroup => {
                    const group = chapters.filter(ch => String(ch.class) === clsGroup)
                    if (!group.length) return null
                    return (
                      <div key={clsGroup} style={{ marginBottom: '20px' }}>
                        <p style={{
                          fontSize: '11px', fontWeight: '700', color: '#475569',
                          textTransform: 'uppercase', letterSpacing: '0.09em',
                          marginBottom: '10px',
                        }}>
                          Class {clsGroup}
                        </p>
                        {group.map(ch => {
                          const total = getChapterTopicCount(ch)
                          const done = getChapterCoveredCount(ch)
                          const pct = total > 0 ? Math.round((done / total) * 100) : 0
                          const isExpanded = expandedChapter === ch.unit_number
                          const statusLabel = pct >= 100 ? 'DONE' : pct > 0 ? 'IN PROG' : 'TODO'
                          const statusColor = pct >= 100 ? '#22c55e' : pct > 0 ? '#f97316' : '#475569'
                          const statusBg = pct >= 100 ? 'rgba(34,197,94,0.1)' : pct > 0 ? 'rgba(249,115,22,0.1)' : 'rgba(71,85,105,0.15)'
                          const topicList = getChapterTopicList(ch)

                          return (
                            <div key={ch.id}>
                              <div
                                className={`db-chapter-card${isExpanded ? ' expanded' : ''}`}
                                onClick={() => setExpandedChapter(isExpanded ? null : ch.unit_number)}
                              >
                                {/* Progress ring */}
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                  <ProgressRing pct={pct} size={44} />
                                  <span style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    transform: 'translate(-50%,-50%)',
                                    fontSize: '10px', fontWeight: '700', color: '#f1f5f9',
                                  }}>
                                    {pct}
                                  </span>
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{
                                    fontSize: '14px', fontWeight: '700', color: '#f1f5f9',
                                    margin: '0 0 4px', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    Chapter {ch.unit_number}: {ch.title}
                                  </p>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                                      {done}/{total} topics
                                    </span>
                                    {/* Progress bar */}
                                    <div style={{
                                      flex: 1, height: '4px',
                                      background: 'rgba(255,255,255,0.08)',
                                      borderRadius: '4px', overflow: 'hidden',
                                      maxWidth: '120px',
                                    }}>
                                      <div style={{
                                        width: `${pct}%`, height: '100%',
                                        background: statusColor,
                                        borderRadius: '4px',
                                        transition: 'width 0.4s ease',
                                      }} />
                                    </div>
                                  </div>
                                </div>

                                {/* Status badge */}
                                <span style={{
                                  padding: '3px 8px', borderRadius: '6px',
                                  fontSize: '10px', fontWeight: '700',
                                  background: statusBg, color: statusColor,
                                  border: `1px solid ${statusColor}33`,
                                  flexShrink: 0,
                                }}>
                                  {statusLabel}
                                </span>

                                {/* Chevron */}
                                <span style={{
                                  color: '#475569', fontSize: '14px', flexShrink: 0,
                                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                  display: 'inline-block',
                                }}>
                                  ▾
                                </span>
                              </div>

                              {/* Expanded topic chips */}
                              {isExpanded && (
                                <div style={{
                                  ...cardBase,
                                  marginTop: '-4px',
                                  marginBottom: '8px',
                                  borderTopLeftRadius: '4px',
                                  borderTopRightRadius: '4px',
                                  borderTop: 'none',
                                  background: 'rgba(13,22,38,0.8)',
                                }}>
                                  {topicList.length === 0 ? (
                                    <p style={{ color: '#475569', fontSize: '12px' }}>No topic data available.</p>
                                  ) : (
                                    <>
                                      <p style={{
                                        fontSize: '11px', color: '#475569',
                                        marginBottom: '10px', fontWeight: '600',
                                        textTransform: 'uppercase', letterSpacing: '0.08em',
                                      }}>
                                        Topics
                                      </p>
                                      <div className="db-chapter-chips">
                                        {topicList.map(slug => {
                                          const isCovered = coveredSlugs.has(slug)
                                          const isWeak = weakSlugs.has(slug)
                                          const bg = isCovered
                                            ? 'rgba(34,197,94,0.12)'
                                            : isWeak
                                              ? 'rgba(249,115,22,0.12)'
                                              : 'rgba(255,255,255,0.04)'
                                          const border = isCovered
                                            ? '1px solid rgba(34,197,94,0.3)'
                                            : isWeak
                                              ? '1px solid rgba(249,115,22,0.3)'
                                              : '1px solid rgba(255,255,255,0.08)'
                                          const color = isCovered ? '#22c55e' : isWeak ? '#f97316' : '#64748b'

                                          return (
                                            <span
                                              key={slug}
                                              style={{
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                fontSize: '11px',
                                                fontWeight: '500',
                                                background: bg,
                                                border,
                                                color,
                                                maxWidth: '200px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                display: 'inline-block',
                                              }}
                                              title={slug}
                                            >
                                              {isCovered ? '✓ ' : isWeak ? '⚠ ' : ''}{slug.replace(/-/g, ' ')}
                                            </span>
                                          )
                                        })}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
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
                    No weak topics found!
                  </p>
                  <p style={{ color: '#64748b', fontSize: '13px' }}>
                    Start practicing to build your topic performance profile.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {weakTopics.map(topic => {
                    const accuracy = topic.accuracy ?? 0
                    const barColor = accuracyBarColor(accuracy)
                    const attempts = topic.attempt_count ?? 0
                    const label = topic.term || topic.topic_slug?.replace(/-/g, ' ') || 'Unknown Topic'
                    const chapter = topic.chapter_slug?.replace(/-/g, ' ') || '—'

                    return (
                      <div key={topic.id} style={{
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
                            margin: '0 0 3px',
                          }}>
                            {label}
                          </p>
                          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px', textTransform: 'capitalize' }}>
                            {chapter}
                          </p>
                          {/* Accuracy bar */}
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

                        {/* Stats */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                          <span style={{ fontSize: '18px', fontWeight: '800', color: barColor }}>
                            {Math.round(accuracy)}%
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {attempts} attempt{attempts !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Practice button */}
                        <button
                          onClick={() => router.push('/chat')}
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
                          Practice →
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
                    No quizzes taken yet.
                  </p>
                  <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>
                    Head over to the quiz page to test your knowledge.
                  </p>
                  <button
                    onClick={() => router.push('/quiz')}
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
                    const acc = Math.round((score / total) * 100)
                    const grade = gradeFromAccuracy(acc)
                    const modeIcon = attempt.mode === 'sunday' ? '🏆' : '⚡'

                    return (
                      <div key={attempt.id} className="db-quiz-row">
                        {/* Mode icon */}
                        <span style={{ fontSize: '20px', flexShrink: 0 }}>{modeIcon}</span>

                        {/* Score */}
                        <span style={{
                          fontSize: '15px', fontWeight: '800', color: '#f1f5f9',
                          minWidth: '44px', flexShrink: 0,
                        }}>
                          {score}/{total}
                        </span>

                        {/* Grade badge */}
                        <span style={{
                          padding: '2px 8px', borderRadius: '6px',
                          fontSize: '11px', fontWeight: '800',
                          background: `${grade.color}20`,
                          color: grade.color,
                          border: `1px solid ${grade.color}40`,
                          flexShrink: 0,
                        }}>
                          {grade.label}
                        </span>

                        {/* Accuracy bar */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '80px' }}>
                          <div style={{
                            flex: 1, height: '5px',
                            background: 'rgba(255,255,255,0.08)',
                            borderRadius: '5px', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${acc}%`, height: '100%',
                              background: grade.color, borderRadius: '5px',
                            }} />
                          </div>
                          <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>
                            {acc}%
                          </span>
                        </div>

                        {/* Date */}
                        <span style={{ fontSize: '12px', color: '#475569', flexShrink: 0 }}>
                          {formatShortDate(attempt.completed_at)}
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
              {/* Tooltip */}
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
