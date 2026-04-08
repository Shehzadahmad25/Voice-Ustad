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

export default function ForgotPasswordPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/reset-password',
      })
      if (err) { setError(err.message); return }
      setSent(true)
    } catch (e) {
      console.error('Forgot password error:', e)
      setError('Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/reset-password',
      })
    } catch (e) { console.error('Resend error:', e) }
  }

  if (sent) {
    return (
      <AuthLayout>
        <div style={{ textAlign:'center' }}>
          <div style={{
            width:'64px', height:'64px', borderRadius:'50%',
            background:'rgba(14,165,233,0.1)', border:'2px solid rgba(14,165,233,0.3)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'28px', margin:'0 auto 20px',
          }}>📧</div>
          <h2 style={{ fontSize:'21px', fontWeight:'800', color:'white', marginBottom:'6px' }}>Check your email</h2>
          <p style={{ fontSize:'13px', color:'#64748b', marginBottom:'20px' }}>
            Reset link sent to <strong style={{ color:'#f1f5f9' }}>{email}</strong>. Expires in 15 minutes.
          </p>
          <div style={{
            background:'rgba(14,165,233,0.08)', border:'1px solid rgba(14,165,233,0.2)',
            borderRadius:'10px', padding:'11px 14px', marginBottom:'24px',
            fontSize:'13px', color:'#0ea5e9', display:'flex', alignItems:'center',
            justifyContent:'center', gap:'8px',
          }}>💡 Check your spam folder</div>
          <button onClick={() => router.push('/auth/signin')} style={{
            width:'100%', padding:'13px', borderRadius:'11px',
            background:'#22c55e', fontSize:'14px', fontWeight:'700',
            color:'#000', border:'none', cursor:'pointer', fontFamily:'inherit',
            transition:'all 0.15s', marginBottom:'14px',
          }}>Back to Sign In</button>
          <p style={{ fontSize:'13px', color:'#64748b' }}>
            Didn&apos;t get it?{' '}
            <button onClick={handleResend} style={{
              color:'#22c55e', background:'none', border:'none', cursor:'pointer',
              fontFamily:'inherit', fontSize:'13px', fontWeight:'600',
            }}>Resend link</button>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize:'22px', fontWeight:'800', color:'white', marginBottom:'6px' }}>Reset your password</h2>
      <p style={{ fontSize:'13.5px', color:'#64748b', marginBottom:'24px' }}>
        Enter your email and we&apos;ll send a reset link
      </p>

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
        <div>
          <label style={{ fontSize:'12px', color:'#94a3b8', marginBottom:'6px', display:'block' }}>Email address</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" required style={inputStyle}
            onFocus={e => Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
            onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })} />
        </div>

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
              Sending...
            </>
          ) : 'Send Reset Link →'}
        </button>
      </form>

      <p style={{ textAlign:'center', marginTop:'20px' }}>
        <button onClick={() => router.push('/auth/signin')} style={{
          fontSize:'13px', color:'#64748b', background:'none', border:'none',
          cursor:'pointer', fontFamily:'inherit',
        }}>← Back to Sign In</button>
      </p>
    </AuthLayout>
  )
}
