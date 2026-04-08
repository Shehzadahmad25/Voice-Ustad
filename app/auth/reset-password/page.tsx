'use client'
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react'
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

function getStrength(pw: string): number {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const strength = getStrength(newPassword)
  const strengthLabel = ['', 'Weak', 'Fair', 'Strong', 'Strong'][strength]
  const strengthColor = ['', '#ef4444', '#f59e0b', '#22c55e', '#22c55e'][strength]
  const mismatch = confirmPassword && newPassword !== confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    if (strength < 2) { setError('Please choose a stronger password.'); return }
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword })
      if (err) { setError(err.message); return }
      setSuccess(true)
      setTimeout(() => router.push('/auth/signin'), 2000)
    } catch (e) {
      console.error('Reset password error:', e)
      setError('Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize:'22px', fontWeight:'800', color:'white', marginBottom:'6px' }}>Create new password</h2>
      <p style={{ fontSize:'13.5px', color:'#64748b', marginBottom:'24px' }}>
        Choose a strong password for your account
      </p>

      {success && (
        <div style={{
          background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)',
          color:'#22c55e', borderRadius:'10px', padding:'11px 14px',
          fontSize:'13px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'8px',
        }}>✅ Password updated! Redirecting...</div>
      )}

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
        <div>
          <label style={labelStyle}>New Password</label>
          <div style={{ position:'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={newPassword}
              onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters"
              style={{ ...inputStyle, paddingRight:'44px' }} required
              onFocus={e => Object.assign(e.target.style, { borderColor:'#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
              onBlur={e => Object.assign(e.target.style, { borderColor:'rgba(255,255,255,0.14)', boxShadow:'none' })} />
            <button type="button" onClick={() => setShowPw(!showPw)} style={{
              position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', fontSize:'16px',
            }}>{showPw ? '🙈' : '👁'}</button>
          </div>
          {newPassword && (
            <div style={{ marginTop:'8px' }}>
              <div style={{ display:'flex', gap:'4px', marginBottom:'4px' }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{
                    flex:1, height:'3px', borderRadius:'3px',
                    background: i <= strength ? strengthColor : 'rgba(255,255,255,0.08)',
                  }} />
                ))}
              </div>
              <span style={{ fontSize:'11px', color: strengthColor }}>{strengthLabel}</span>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Confirm Password</label>
          <div style={{ position:'relative' }}>
            <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password"
              style={{ ...inputStyle, paddingRight:'44px', borderColor: mismatch ? '#ef4444' : undefined }}
              required
              onFocus={e => Object.assign(e.target.style, { borderColor: mismatch ? '#ef4444' : '#22c55e', boxShadow:'0 0 0 3px rgba(34,197,94,0.1)' })}
              onBlur={e => Object.assign(e.target.style, { borderColor: mismatch ? '#ef4444' : 'rgba(255,255,255,0.14)', boxShadow:'none' })} />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{
              position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', fontSize:'16px',
            }}>{showConfirm ? '🙈' : '👁'}</button>
          </div>
          {mismatch && <p style={{ fontSize:'12px', color:'#ef4444', marginTop:'5px' }}>Passwords do not match</p>}
        </div>

        {error && (
          <div style={{
            background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)',
            color:'#ef4444', borderRadius:'10px', padding:'11px 14px',
            fontSize:'13px', display:'flex', alignItems:'center', gap:'8px',
          }}>⚠️ {error}</div>
        )}

        <button type="submit" disabled={loading || success} style={{
          width:'100%', padding:'13px', borderRadius:'11px',
          background:'#22c55e', fontSize:'14px', fontWeight:'700',
          color:'#000', border:'none', cursor:'pointer', fontFamily:'inherit',
          transition:'all 0.15s', boxShadow:'0 3px 16px rgba(34,197,94,0.28)',
          opacity: (loading || success) ? 0.7 : 1,
          display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
        }}>
          {loading ? (
            <>
              <div style={{ width:'16px', height:'16px', borderRadius:'50%', border:'2px solid rgba(0,0,0,0.3)', borderTop:'2px solid #000', animation:'spin 0.8s linear infinite' }} />
              Updating...
            </>
          ) : 'Reset Password →'}
        </button>
      </form>

      <p style={{ textAlign:'center', marginTop:'16px' }}>
        <button onClick={() => router.push('/auth/signin')} style={{
          fontSize:'13px', color:'#64748b', background:'none', border:'none',
          cursor:'pointer', fontFamily:'inherit',
        }}>← Back to Sign In</button>
      </p>
    </AuthLayout>
  )
}
