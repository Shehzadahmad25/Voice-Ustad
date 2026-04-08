export const dynamic = 'force-dynamic';
'use client'
// ── AUTH BYPASS — development mode ──────────────────────────────────────────
// Auth guard (router.push('/auth/signin')) is disabled.
// A mock user is used when no real session exists.
// To re-enable: restore `if (!u) { router.push('/auth/signin'); return }`
// and replace `createBrowserClient` import with `getSupabaseClient`.
// ────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import TopNav from '@/components/TopNav'
import { getFirstName } from '@/lib/utils'

// Mock user used when Supabase returns no session (auth bypass)
const MOCK_USER = {
  id:    'dev-user-bypass',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' },
}
const MOCK_PROFILE = {
  full_name:           'Test User',
  email:               'test@example.com',
  board:               'KPK',
  class:               '11',
  goal:                'FSc Pre-Medical',
  subscription_status: 'trial',
  referral_code:       null,
  exam_date:           null,
}

function Skeleton({ width = '100%', height = '20px', style = {} }: { width?: string; height?: string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} />
}

const cardStyle: React.CSSProperties = {
  background: '#141929',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  padding: '18px 20px',
  position: 'relative',
  overflow: 'hidden',
}

export default function DashboardPage() {
  const router   = useRouter()
  const supabase = getSupabaseClient()

  const [user,            setUser]            = useState<any>(null)
  const [profile,         setProfile]         = useState<any>(null)
  const [streakData,      setStreakData]       = useState<any>(null)
  const [questionsAsked,  setQuestionsAsked]  = useState(0)
  const [chaptersActive,  setChaptersActive]  = useState(0)
  const [studySessions,   setStudySessions]   = useState(0)
  const [chapterProgress, setChapterProgress] = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        // Try real session first; fall back to mock if auth is bypassed / unavailable
        let u: any = null
        if (supabase) {
          const { data } = await supabase.auth.getUser()
          u = data?.user ?? null
        }

        // ── AUTH BYPASS: use mock user when no real session exists ──────────
        // To re-enable auth guard: replace this block with:
        //   if (!u) { router.push('/auth/signin'); return }
        if (!u) {
          setUser(MOCK_USER)
          setProfile(MOCK_PROFILE)
          setLoading(false)
          return
        }
        // ───────────────────────────────────────────────────────────────────

        setUser(u)

        if (!supabase) { setLoading(false); return }

        const [profileRes, streakRes, sessionsRes, chaptersRes, progressRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', u.id).single(),
          supabase.from('study_streaks').select('*').eq('user_id', u.id).single(),
          supabase.from('study_sessions').select('id', { count: 'exact' }).eq('user_id', u.id),
          supabase.from('chapter_progress').select('*').eq('user_id', u.id),
          supabase.from('chapter_progress').select('chapter_id', { count: 'exact' }).eq('user_id', u.id).gt('progress_pct', 0),
        ])

        setProfile(profileRes.data)
        setStreakData(streakRes.data)
        setStudySessions(sessionsRes.count || 0)
        setChapterProgress(chaptersRes.data || [])
        setChaptersActive(progressRes.count || 0)

        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact' })
          .eq('user_id', u.id)
          .eq('role', 'user')
        setQuestionsAsked(count || 0)
      } catch (e) {
        console.error('Dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const firstName = getFirstName(profile, user)

  const subjects = [
    { name: 'Chemistry',    icon: '🧪', bg: 'rgba(34,197,94,0.1)',  chapterId: 'chemistry'   },
    { name: 'Biology',      icon: '🌿', bg: 'rgba(14,165,233,0.1)', chapterId: 'biology'     },
    { name: 'Physics',      icon: '⚡', bg: 'rgba(124,58,237,0.1)', chapterId: 'physics'     },
    { name: 'Mathematics',  icon: '📐', bg: 'rgba(245,158,11,0.1)', chapterId: 'mathematics' },
  ]

  const getProgress = (chapterId: string) => {
    const p = chapterProgress.find(c => c.chapter_id === chapterId)
    return p?.progress_pct || 0
  }

  const examDays = profile?.exam_date
    ? Math.max(0, Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000))
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
      <TopNav user={user} profile={profile} />

      <div style={{ paddingTop: '62px' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '36px 24px 100px' }}>

          {/* TOP BAR */}
          <div className="dash-topbar" style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap',
          }}>
            <div>
              {loading ? (
                <>
                  <Skeleton width="220px" height="28px" style={{ marginBottom: '8px' }} />
                  <Skeleton width="300px" height="16px" />
                </>
              ) : (
                <>
                  <h1 style={{ fontSize: '21px', fontWeight: '800', color: 'white', marginBottom: '4px' }}>
                    Welcome back, {firstName} 👋
                  </h1>
                  {profile?.board || profile?.class || profile?.goal ? (
                    <p style={{ fontSize: '13px', color: '#64748b' }}>
                      {[profile.board, profile.class, profile.goal].filter(Boolean).join(' · ')}
                    </p>
                  ) : (
                    <p style={{ fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
                      onClick={() => router.push('/settings')}>
                      Complete your profile to personalise your experience →
                    </p>
                  )}
                </>
              )}
            </div>
            <button onClick={() => router.push('/chat')} style={{
              padding: '9px 20px', borderRadius: '9px', background: '#22c55e',
              fontWeight: '700', color: '#000', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '14px', transition: 'all 0.15s',
              boxShadow: '0 3px 14px rgba(34,197,94,0.28)', whiteSpace: 'nowrap',
            }}>▶ Continue Studying</button>
          </div>

          {/* TRIAL ALERT */}
          {!loading && profile?.subscription_status === 'trial' && (
            <div className="upgrade-wrap" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '12px', padding: '12px 18px', marginBottom: '20px', gap: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px', color: '#f1f5f9' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b',
                  animation: 'blink 1.8s infinite', flexShrink: 0,
                }} />
                Free Trial Active — Upgrade to unlock all subjects and unlimited questions
              </div>
              <button style={{
                padding: '8px 18px', borderRadius: '8px', background: '#22c55e',
                color: '#000', fontWeight: '700', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '13px', flexShrink: 0, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}>⚡ Upgrade – Rs. 499/mo</button>
            </div>
          )}

          {/* STAT STRIP */}
          <div className="dash-stats" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
            gap: '14px', marginBottom: '20px',
          }}>
            {[
              { label: 'QUESTIONS ASKED', value: questionsAsked, color: '#22c55e', glow: 'rgba(34,197,94,0.2)',  note: 'Keep it up!'          },
              { label: 'CHAPTERS ACTIVE', value: chaptersActive, color: '#0ea5e9', glow: 'rgba(14,165,233,0.2)', note: 'Start your first chapter' },
              { label: 'STUDY SESSIONS',  value: studySessions,  color: '#f59e0b', glow: 'rgba(245,158,11,0.2)', note: 'Start your first →'    },
            ].map((stat, idx) => (
              <div key={idx} style={cardStyle}>
                <div style={{
                  position: 'absolute', top: '-15px', right: '-15px',
                  width: '70px', height: '70px', borderRadius: '50%',
                  background: stat.glow, opacity: 0.5, pointerEvents: 'none',
                }} />
                {loading ? (
                  <>
                    <Skeleton width="120px" height="12px" style={{ marginBottom: '12px' }} />
                    <Skeleton width="60px"  height="36px" style={{ marginBottom: '8px'  }} />
                    <Skeleton width="90px"  height="12px" />
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                      {stat.label}
                    </p>
                    <p style={{ fontSize: '32px', fontWeight: '900', color: stat.color, lineHeight: 1, marginBottom: '6px' }}>
                      {stat.value}
                    </p>
                    <p style={{ fontSize: '12px', color: '#64748b' }}>{stat.note}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* TWO COL */}
          <div className="dash-twocol" style={{
            display: 'grid', gridTemplateColumns: '1.15fr 0.85fr',
            gap: '16px', marginBottom: '20px',
          }}>
            {/* Subjects */}
            <div style={cardStyle}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
                <span style={{ fontSize:'14px', fontWeight:'700', color:'white' }}>Your Subjects</span>
                <button onClick={() => router.push('/chat')} style={{
                  fontSize:'12px', color:'#22c55e', background:'none', border:'none',
                  cursor:'pointer', fontFamily:'inherit', fontWeight:'500',
                }}>View all →</button>
              </div>
              {subjects.map((sub, i) => {
                const progress = getProgress(sub.chapterId)
                return (
                  <div key={sub.name} style={{
                    display:'flex', gap:'12px', padding:'10px 0', alignItems:'center',
                    borderBottom: i < subjects.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}>
                    <div style={{
                      width:'38px', height:'38px', borderRadius:'10px',
                      background: sub.bg, display:'flex', alignItems:'center',
                      justifyContent:'center', fontSize:'16px', flexShrink:0,
                    }}>{sub.icon}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                        <span style={{ fontSize:'13.5px', fontWeight:'600', color:'#f1f5f9' }}>{sub.name}</span>
                        <span style={{ fontSize:'12px', color: progress > 0 ? '#22c55e' : '#64748b', fontWeight:'600' }}>
                          {progress > 0 ? `${progress}%` : '—'}
                        </span>
                      </div>
                      <p style={{ fontSize:'11.5px', color:'#64748b', marginBottom:'6px' }}>
                        {progress > 0 ? 'Chapter progress' : 'Not started yet'}
                      </p>
                      <div style={{ height:'3px', background:'rgba(255,255,255,0.08)', borderRadius:'3px', overflow:'hidden' }}>
                        <div style={{
                          width:`${progress}%`, height:'100%',
                          background:'linear-gradient(90deg,#22c55e,#0ea5e9)',
                          borderRadius:'3px', transition:'width 0.4s ease',
                        }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Account */}
            <div style={{ ...cardStyle, display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
                <span style={{ fontSize:'14px', fontWeight:'700', color:'white' }}>Account</span>
                <button onClick={() => router.push('/settings')} style={{
                  fontSize:'12px', color:'#22c55e', background:'none', border:'none',
                  cursor:'pointer', fontFamily:'inherit', fontWeight:'500',
                }}>Edit →</button>
              </div>

              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height="16px" style={{ marginBottom: '12px' }} />
                ))
              ) : (
                <>
                  {[
                    { label:'Board', value: profile?.board || 'Not set' },
                    { label:'Class', value: profile?.class || 'Not set' },
                    { label:'Goal',  value: profile?.goal  || 'Not set' },
                  ].map(row => (
                    <div key={row.label} style={{
                      display:'flex', justifyContent:'space-between',
                      padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.06)',
                      fontSize:'13px',
                    }}>
                      <span style={{ color:'#64748b' }}>{row.label}</span>
                      <span style={{ color:'#f1f5f9', fontWeight:'500', textAlign:'right', maxWidth:'60%', wordBreak:'break-word' }}>
                        {row.value}
                      </span>
                    </div>
                  ))}

                  <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.06)', fontSize:'13px', alignItems:'center' }}>
                    <span style={{ color:'#64748b' }}>Plan</span>
                    <span style={{
                      padding:'2px 8px', borderRadius:'6px', fontSize:'11px', fontWeight:'700',
                      background:'rgba(34,197,94,0.12)', color:'#22c55e', border:'1px solid rgba(34,197,94,0.2)',
                    }}>Free Trial</span>
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:'13px', alignItems:'center' }}>
                    <span style={{ color:'#64748b' }}>Referral</span>
                    {profile?.referral_code ? (
                      <span style={{ color:'#f1f5f9', fontWeight:'600', letterSpacing:'0.08em', fontSize:'12px' }}>
                        {profile.referral_code}
                      </span>
                    ) : (
                      <span style={{
                        padding:'2px 8px', borderRadius:'6px', fontSize:'11px', fontWeight:'700',
                        background:'rgba(245,158,11,0.1)', color:'#f59e0b', border:'1px solid rgba(245,158,11,0.2)',
                      }}>Pending</span>
                    )}
                  </div>
                </>
              )}

              <div style={{ flex: 1 }} />
              <div style={{ display:'flex', gap:'10px', marginTop:'16px' }}>
                <button onClick={() => router.push('/settings')} style={{
                  flex:1, padding:'9px', borderRadius:'9px',
                  background:'#22c55e', color:'#000', fontWeight:'700',
                  border:'none', cursor:'pointer', fontFamily:'inherit',
                  fontSize:'13px', transition:'all 0.15s',
                }}>Edit Profile</button>
                <button onClick={() => router.push('/chat')} style={{
                  flex:1, padding:'9px', borderRadius:'9px',
                  background:'transparent', color:'#94a3b8',
                  border:'1px solid rgba(255,255,255,0.14)',
                  cursor:'pointer', fontFamily:'inherit', fontSize:'13px', transition:'all 0.15s',
                }}>Open Chat</button>
              </div>
            </div>
          </div>

          {/* UPGRADE BANNER */}
          <div className="upgrade-wrap" style={{
            borderRadius:'16px', padding:'26px 30px',
            background:'linear-gradient(135deg,#0d1a0d,#0a1220)',
            border:'1px solid rgba(34,197,94,0.2)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            gap:'20px', position:'relative', overflow:'hidden',
          }}>
            <div>
              <p style={{ fontSize:'10.5px', color:'#22c55e', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px', fontWeight:'700' }}>
                🔥 LIMITED LAUNCH OFFER
              </p>
              <h3 style={{ fontSize:'19px', fontWeight:'800', color:'white', marginBottom:'6px' }}>
                Unlock Full Access
              </h3>
              <p style={{ fontSize:'13px', color:'#94a3b8', lineHeight:'1.6' }}>
                All subjects · All boards · Unlimited voice answers<br />
                Rs. 499/month · EasyPaisa &amp; JazzCash accepted
              </p>
            </div>
            <button style={{
              background:'#22c55e', color:'#000', padding:'12px 26px',
              borderRadius:'10px', fontWeight:'700', border:'none', cursor:'pointer',
              fontFamily:'inherit', fontSize:'14px', flexShrink:0, whiteSpace:'nowrap',
              boxShadow:'0 3px 16px rgba(34,197,94,0.32)', transition:'all 0.15s',
            }}>Try 7 Days Free →</button>
          </div>

        </div>
      </div>
    </div>
  )
}
