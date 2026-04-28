'use client'
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import AuthLayout from '@/components/auth/AuthLayout'
import { getFirstName } from '@/lib/utils'

export default function SuccessPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [profile, setProfile] = useState<any>(null)
  const [firstName, setFirstName] = useState('Student')

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/signin'); return }
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
        setFirstName(getFirstName(data, user))
      } catch (e) { console.error('Success page load error:', e) }
    }
    load()
  }, [])

  const examDays = profile?.exam_date
    ? Math.max(0, Math.ceil((new Date(profile.exam_date).getTime() - Date.now()) / 86400000))
    : null
  const trialDays = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 7

  const rowStyle: React.CSSProperties = {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'9px 0', borderBottom:'1px solid rgba(255,255,255,0.06)',
    fontSize:'13px',
  }

  return (
    <AuthLayout>
      <div style={{ textAlign:'center' }}>
        <div style={{
          width:'74px', height:'74px', borderRadius:'50%',
          background:'rgba(34,197,94,0.1)', border:'2px solid rgba(34,197,94,0.3)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'32px', margin:'0 auto 20px',
        }}>✅</div>

        <h2 style={{ fontSize:'22px', fontWeight:'800', color:'white', marginBottom:'6px' }}>
          You&apos;re all set, {firstName}! 🎉
        </h2>
        <p style={{ fontSize:'13px', color:'#64748b', marginBottom:'20px' }}>
          Account verified. 7-day free trial is now active.
        </p>

        <div style={{
          background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
          borderRadius:'10px', padding:'11px 14px', marginBottom:'24px',
          fontSize:'13px', color:'#22c55e', display:'flex', alignItems:'center',
          justifyContent:'center', gap:'8px',
        }}>🔥 Your streak starts today!</div>

        {profile && (
          <div style={{
            background:'#1a2035', border:'1px solid rgba(255,255,255,0.14)',
            borderRadius:'12px', padding:'16px 18px', marginBottom:'24px', textAlign:'left',
          }}>
            {profile.board && (
              <div style={rowStyle}>
                <span style={{ color:'#64748b' }}>Board</span>
                <span style={{ color:'#f1f5f9', fontWeight:'600' }}>{profile.board}</span>
              </div>
            )}
            {profile.class && (
              <div style={rowStyle}>
                <span style={{ color:'#64748b' }}>Class</span>
                <span style={{ color:'#f1f5f9', fontWeight:'600' }}>{profile.class}</span>
              </div>
            )}
            {profile.goal && (
              <div style={rowStyle}>
                <span style={{ color:'#64748b' }}>Goal</span>
                <span style={{ color:'#f1f5f9', fontWeight:'600' }}>{profile.goal}</span>
              </div>
            )}
            {examDays !== null && (
              <div style={rowStyle}>
                <span style={{ color:'#64748b' }}>Exam in</span>
                <span style={{ color:'#f59e0b', fontWeight:'700' }}>{examDays} days</span>
              </div>
            )}
            <div style={{ ...rowStyle, borderBottom:'none' }}>
              <span style={{ color:'#64748b' }}>Trial ends</span>
              <span style={{ color:'#22c55e', fontWeight:'700' }}>{trialDays} days</span>
            </div>
          </div>
        )}

        <button onClick={() => router.push('/dashboard')} style={{
          width:'100%', padding:'13px', borderRadius:'11px',
          background:'#f59e0b', fontSize:'14px', fontWeight:'700',
          color:'#000', border:'none', cursor:'pointer', fontFamily:'inherit',
          transition:'all 0.15s', boxShadow:'0 3px 16px rgba(245,158,11,0.28)',
        }}>🚀 Go to My Dashboard</button>
      </div>
    </AuthLayout>
  )
}
