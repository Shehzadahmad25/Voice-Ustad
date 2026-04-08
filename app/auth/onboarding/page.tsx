'use client'
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import AuthLayout from '@/components/auth/AuthLayout'

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display:'flex', gap:'6px', marginBottom:'24px' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{
          height:'4px', borderRadius:'4px', transition:'all 0.25s',
          width: i === current ? '38px' : '28px',
          background: i < current ? '#22c55e' : i === current ? '#0ea5e9' : 'rgba(255,255,255,0.08)',
        }} />
      ))}
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width:'100%', padding:'11px 14px', borderRadius:'10px',
  background:'#1a2035', border:'1px solid rgba(255,255,255,0.14)',
  color:'#f1f5f9', fontSize:'14px', fontFamily:'inherit', outline:'none',
  appearance:'none' as any, cursor:'pointer',
  transition:'border-color 0.15s, box-shadow 0.15s',
}
const labelStyle: React.CSSProperties = { fontSize:'12px', color:'#94a3b8', marginBottom:'6px', display:'block' }

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [studentClass, setStudentClass] = useState('')
  const [board, setBoard] = useState('')
  const [goal, setGoal] = useState('')
  const [examDate, setExamDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError('Session expired. Please sign in again.')
        router.push('/auth/signin')
        return
      }
      const savedName = sessionStorage.getItem('signup_name') || ''
      const savedPhone = sessionStorage.getItem('signup_phone') || ''
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: savedName,
        phone: savedPhone,
        board: board || null,
        class: studentClass || null,
        goal: goal || null,
        exam_date: examDate || null,
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'id' })
      if (profileError) console.error('Profile save error:', profileError)
      sessionStorage.removeItem('signup_email')
      sessionStorage.removeItem('signup_name')
      sessionStorage.removeItem('signup_phone')
      router.push('/auth/success')
    } catch (err) {
      console.error('Onboarding error:', err)
      setError('Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const focusHandler = (e: React.FocusEvent<HTMLSelectElement | HTMLInputElement>) =>
    Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })
  const blurHandler = (e: React.FocusEvent<HTMLSelectElement | HTMLInputElement>) =>
    Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })

  return (
    <AuthLayout>
      <StepIndicator current={3} />
      <p style={{ fontSize:'11.5px', color:'#64748b', marginBottom:'8px' }}>Step 3 of 3 — Academic profile</p>
      <h2 style={{ fontSize:'22px', fontWeight:'800', color:'white', marginBottom:'4px' }}>Tell us about your studies</h2>
      <p style={{ fontSize:'13px', color:'#64748b', marginBottom:'24px' }}>Personalises your AI tutor and dashboard</p>

      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
          <div>
            <label style={labelStyle}>Class</label>
            <select value={studentClass} onChange={e => setStudentClass(e.target.value)}
              style={fieldStyle} onFocus={focusHandler} onBlur={blurHandler}>
              <option value="">Select class</option>
              <option value="Class 9">Class 9</option>
              <option value="Class 10">Class 10</option>
              <option value="Class 11 – FSc Part 1">Class 11 – FSc Part 1</option>
              <option value="Class 12 – FSc Part 2">Class 12 – FSc Part 2</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Board</label>
            <select value={board} onChange={e => setBoard(e.target.value)}
              style={fieldStyle} onFocus={focusHandler} onBlur={blurHandler}>
              <option value="">Select board</option>
              <option value="KPK Board">KPK Board</option>
              <option value="Federal Board">Federal Board</option>
              <option value="Punjab Board">Punjab Board</option>
              <option value="Sindh Board">Sindh Board</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Study Goal</label>
          <select value={goal} onChange={e => setGoal(e.target.value)}
            style={fieldStyle} onFocus={focusHandler} onBlur={blurHandler}>
            <option value="">Select goal</option>
            <option value="FSc Pre-Medical">FSc Pre-Medical</option>
            <option value="FSc Pre-Engineering">FSc Pre-Engineering</option>
            <option value="MDCAT Preparation">MDCAT Preparation</option>
            <option value="ECAT Preparation">ECAT Preparation</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Board Exam Date <span style={{ color:'#64748b' }}>(optional)</span></label>
          <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
            style={fieldStyle} onFocus={focusHandler} onBlur={blurHandler} />
          <p style={{ fontSize:'11.5px', color:'#64748b', marginTop:'5px' }}>Used for your exam countdown on dashboard</p>
        </div>

        {error && (
          <div style={{
            background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)',
            color:'#ef4444', borderRadius:'10px', padding:'11px 14px', fontSize:'13px',
            display:'flex', alignItems:'center', gap:'8px',
          }}>⚠️ {error}</div>
        )}

        <button type="button" onClick={handleSave} disabled={loading} style={{
          width:'100%', padding:'13px', borderRadius:'11px',
          background:'#22c55e', fontSize:'14px', fontWeight:'700',
          color:'#000', border:'none', cursor:'pointer', fontFamily:'inherit',
          transition:'all 0.15s', boxShadow:'0 3px 16px rgba(34,197,94,0.28)',
          opacity: loading ? 0.7 : 1,
          display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
        }}>
          {loading ? (
            <>
              <div style={{ width:'16px', height:'16px', borderRadius:'50%', border:'2px solid rgba(0,0,0,0.3)', borderTop:'2px solid #000', animation:'spin 0.8s linear infinite' }} />
              Saving...
            </>
          ) : 'Save & Go to Dashboard →'}
        </button>
      </div>

      <p style={{ textAlign:'center', marginTop:'16px' }}>
        <button onClick={() => router.push('/dashboard')} style={{
          background: 'transparent', border: 'none', color: '#64748b',
          fontSize: '13px', cursor: 'pointer', marginTop: '12px',
          textDecoration: 'underline', fontFamily: 'inherit',
        }}>Skip for now →</button>
      </p>
    </AuthLayout>
  )
}
