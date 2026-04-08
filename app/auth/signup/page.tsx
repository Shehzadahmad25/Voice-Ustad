'use client'
export const dynamic = 'force-dynamic';
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import AuthLayout from '@/components/auth/AuthLayout'

const inputStyle: React.CSSProperties = {
  background: '#1a2035', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '10px', padding: '12px 14px', fontSize: '14px',
  color: '#f1f5f9', width: '100%', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const labelStyle: React.CSSProperties = { fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }

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

function getStrength(pw: string): number {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

export default function SignUpPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const strength = getStrength(password)
  const strengthLabel = ['', 'Weak', 'Fair', 'Strong', 'Strong'][strength]
  const strengthColor = ['', '#ef4444', '#f59e0b', '#22c55e', '#22c55e'][strength]

  const handleGoogle = async () => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
      if (error) console.error('Google login error:', error.message)
    } catch (err) {
      console.error('Unexpected error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) return setError('Full name is required.')
    if (!/\S+@\S+\.\S+/.test(email)) return setError('Enter a valid email address.')
    if (strength < 2) return setError('Password must be at least Fair strength.')
    if (!agreed) return setError('You must agree to the Terms of Service.')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } },
      })
      if (err) { setError(err.message); return }
      sessionStorage.setItem('signup_email', email)
      sessionStorage.setItem('signup_name', fullName)
      sessionStorage.setItem('signup_phone', phone)
      router.push('/auth/onboarding')
    } catch (e) {
      console.error('Sign up error:', e)
      setError('Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <AuthLayout>
      <StepIndicator current={1} />
      <p style={{ fontSize:'11.5px', color:'#64748b', marginBottom:'8px' }}>Step 1 of 3 — Create your account</p>
      <h2 style={{ fontSize:'22px', fontWeight:'800', color:'white', marginBottom:'4px' }}>Start learning free</h2>
      <p style={{ fontSize:'13px', color:'#64748b', marginBottom:'24px' }}>
        First 7 days completely free · No card needed
      </p>

      <button onClick={handleGoogle} style={{
        width:'100%', padding:'12px', borderRadius:'11px',
        background:'#1a2035', border:'1px solid rgba(255,255,255,0.14)',
        fontSize:'13.5px', fontWeight:'600', color:'#f1f5f9',
        cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
        display:'flex', alignItems:'center', justifyContent:'center', gap:'10px',
      }}>
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continue with Google
      </button>

      <div style={{ display:'flex', alignItems:'center', gap:'12px', margin:'20px 0' }}>
        <div style={{ flex:1, height:'1px', background:'rgba(255,255,255,0.08)' }} />
        <span style={{ fontSize:'12px', color:'#64748b' }}>or sign up with email</span>
        <div style={{ flex:1, height:'1px', background:'rgba(255,255,255,0.08)' }} />
      </div>

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
        <div>
          <label style={labelStyle}>Full Name</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Ahmad Khan" style={inputStyle}
            onFocus={e => Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
            onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })} />
        </div>
        <div>
          <label style={labelStyle}>Email address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" style={inputStyle}
            onFocus={e => Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
            onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })} />
        </div>
        <div>
          <label style={labelStyle}>Phone Number <span style={{ color:'#64748b' }}>(optional)</span></label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="+92 300 0000000" style={inputStyle}
            onFocus={e => Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
            onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })} />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <div style={{ position:'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
              style={{ ...inputStyle, paddingRight:'44px' }}
              onFocus={e => Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
              onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })} />
            <button type="button" onClick={() => setShowPw(!showPw)} style={{
              position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', fontSize:'16px',
            }}>{showPw ? '🙈' : '👁'}</button>
          </div>
          {password && (
            <div style={{ marginTop:'8px' }}>
              <div style={{ display:'flex', gap:'4px', marginBottom:'4px' }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{
                    flex:1, height:'3px', borderRadius:'3px',
                    background: i <= strength ? strengthColor : 'rgba(255,255,255,0.08)',
                    transition:'background 0.2s',
                  }} />
                ))}
              </div>
              <span style={{ fontSize:'11px', color: strengthColor }}>{strengthLabel}</span>
            </div>
          )}
        </div>

        <label style={{ display:'flex', alignItems:'flex-start', gap:'10px', cursor:'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop:'2px', accentColor:'#22c55e', width:'15px', height:'15px', flexShrink:0 }} />
          <span style={{ fontSize:'12px', color:'#94a3b8', lineHeight:'1.5' }}>
            I agree to Terms of Service and Privacy Policy. I confirm I am a Pakistani FSc student.
          </span>
        </label>

        {error && (
          <div style={{
            background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)',
            color:'#ef4444', borderRadius:'10px', padding:'11px 14px',
            fontSize:'13px', display:'flex', alignItems:'center', gap:'8px',
          }}>⚠️ {error}</div>
        )}

        <button type="submit" disabled={loading} style={{
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
              Creating account...
            </>
          ) : 'Continue → (Step 1 of 3)'}
        </button>
      </form>

      <p style={{ textAlign:'center', marginTop:'20px', fontSize:'13px', color:'#64748b' }}>
        Already have an account?{' '}
        <button onClick={() => router.push('/auth/signin')} style={{
          color:'#22c55e', background:'none', border:'none', cursor:'pointer',
          fontFamily:'inherit', fontSize:'13px', fontWeight:'600',
        }}>Sign in</button>
      </p>
    </AuthLayout>
  )
}
