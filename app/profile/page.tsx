'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { getSubscriptionStatus, SubscriptionStatus } from '@/lib/subscription'
import TopNav from '@/components/TopNav'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = getSupabaseClient()

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [sub, setSub] = useState<SubscriptionStatus | null>(null)
  const [stats, setStats] = useState({ xp: 0, streak: 0, covered: 0, quizzes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data?.user
      if (!u) { router.push('/auth/signin'); return }
      setUser(u)

      const [profileRes, subStatus] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', u.id).single(),
        getSubscriptionStatus(u.id),
      ])
      if (profileRes.data) setProfile(profileRes.data)
      setSub(subStatus)

      try {
        const { data: summary } = await supabase.rpc('get_dashboard_summary', {
          p_user_id: u.id,
          p_board: 'KPK',
        })
        if (summary) {
          setStats({
            xp: summary.total_xp ?? 0,
            streak: summary.current_streak ?? 0,
            covered: summary.topics_covered ?? 0,
            quizzes: summary.quizzes_taken ?? 0,
          })
        }
      } catch { /* RPC may not exist — stats stay at 0 */ }

      setLoading(false)
    })
  }, [])

  const handleLogout = async () => {
    await supabase?.auth.signOut()
    router.push('/auth/signin')
  }

  const name = profile?.full_name || user?.email?.split('@')[0] || 'Student'
  const initial = name[0]?.toUpperCase() || 'S'
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'long' })
    : '—'

  const subBadge = sub?.isSubscribed
    ? { label: 'Active', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' }
    : sub?.isTrial
    ? { label: 'Trial', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' }
    : { label: 'Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' }

  const card = {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: '20px 20px',
    marginBottom: 16,
  }

  const statCard = {
    background: '#0a1628',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: '16px',
    textAlign: 'center' as const,
  }

  const label = { fontSize: 11, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 2 }
  const value = { fontSize: 15, fontWeight: 700, color: '#f1f5f9' }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#060d19', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060d19', color: '#f1f5f9', fontFamily: 'inherit' }}>
      <TopNav user={user} profile={profile} />

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '82px 16px 60px' }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#f59e0b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 700, color: '#000', flexShrink: 0,
          }}>
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
              {profile?.email || user?.email}
            </div>
          </div>
          <button
            onClick={() => router.push('/settings')}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', borderRadius: 8, padding: '6px 12px', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            Edit
          </button>
        </div>

        {/* ── Subscription ───────────────────────────────────────────────────── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Subscription
            </div>
            <span style={{
              background: subBadge.bg, border: `1px solid ${subBadge.border}`,
              color: subBadge.color, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700,
            }}>
              {subBadge.label}
            </span>
          </div>
          {sub?.isTrial && sub.daysLeft > 0 && (
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
              <strong style={{ color: '#f59e0b' }}>{sub.daysLeft}</strong> day{sub.daysLeft !== 1 ? 's' : ''} remaining in free trial
            </div>
          )}
          {(!sub?.hasAccess || sub?.isTrial) && (
            <button
              onClick={() => router.push('/pricing')}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                background: '#f97316', border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Upgrade — Rs. 499/month
            </button>
          )}
          {sub?.isSubscribed && (
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Full access · {sub.subscriptionExpiresAt
                ? `Renews ${new Date(sub.subscriptionExpiresAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : 'Active'}
            </div>
          )}
        </div>

        {/* ── Stats ──────────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { l: 'XP', v: `⚡ ${stats.xp}` },
            { l: 'Streak', v: `🔥 ${stats.streak} days` },
            { l: 'Topics Covered', v: stats.covered },
            { l: 'Quizzes Taken', v: stats.quizzes },
          ].map(({ l, v }) => (
            <div key={l} style={statCard}>
              <div style={label}>{l}</div>
              <div style={value}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── Account info ───────────────────────────────────────────────────── */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Account
          </div>
          {[
            { l: 'Board', v: profile?.board || '—' },
            { l: 'Class', v: profile?.class ? `Class ${profile.class}` : '—' },
            { l: 'Stream', v: profile?.goal || '—' },
            { l: 'Member since', v: memberSince },
          ].map(({ l, v }) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* ── Actions ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => router.push('/auth/forgot-password')}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            🔑 Change Password
          </button>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '12px', borderRadius: 10,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Logout
          </button>
        </div>

      </div>
    </div>
  )
}
