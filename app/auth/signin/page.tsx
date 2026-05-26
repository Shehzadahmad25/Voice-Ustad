'use client'
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AuthLayout from '@/components/auth/AuthLayout'
import { authService } from '@/lib/authService'

const inputStyle: React.CSSProperties = {
  background: '#1a2035', border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '10px', padding: '12px 14px', fontSize: '14px',
  color: '#f1f5f9', width: '100%', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block',
}

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // Show URL-level errors (e.g. ?error=oauth_failed from callback)
  useEffect(() => {
    const urlError = new URLSearchParams(window.location.search).get('error')
    if (urlError === 'oauth_failed') setError('Google sign-in failed. Please try again.')
    else if (urlError === 'no_code')    setError('OAuth flow incomplete. Please try again.')
    else if (urlError === 'auth_failed') setError('Authentication failed. Please try again.')
  }, [])

  const handleGoogle = async () => {
    try {
      setLoading(true)
      setError('')
      await authService.loginWithGoogle()
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.')
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim())    return setError('Email is required.')
    if (!password.trim()) return setError('Password is required.')
    setLoading(true)
    try {
      await authService.login({ email, password })
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'white', marginBottom: '4px' }}>
        Welcome back
      </h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>
        Sign in to continue your learning journey
      </p>

      {/* Google button */}
      <button onClick={handleGoogle} disabled={loading} style={{
        width: '100%', padding: '12px', borderRadius: '11px',
        background: '#1a2035', border: '1px solid rgba(255,255,255,0.14)',
        fontSize: '13.5px', fontWeight: '600', color: '#f1f5f9',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        opacity: loading ? 0.7 : 1,
      }}>
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Continue with Google
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        <span style={{ fontSize: '12px', color: '#64748b' }}>or sign in with email</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Email address</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" style={inputStyle} autoComplete="email"
            onFocus={e => Object.assign(e.target.style, { borderColor: '#f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,0.1)' })}
            onBlur={e => Object.assign(e.target.style, { borderColor: 'rgba(255,255,255,0.14)', boxShadow: 'none' })}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
            <button type="button" onClick={() => router.push('/auth/forgot-password')} style={{
              fontSize: '12px', color: '#f59e0b', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}>
              Forgot password?
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password" autoComplete="current-password"
              style={{ ...inputStyle, paddingRight: '44px' }}
              onFocus={e => Object.assign(e.target.style, { borderColor: '#f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,0.1)' })}
              onBlur={e => Object.assign(e.target.style, { borderColor: 'rgba(255,255,255,0.14)', boxShadow: 'none' })}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} style={{
              position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px',
            }}>{showPw ? '🙈' : '👁'}</button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444', borderRadius: '10px', padding: '11px 14px',
            fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>⚠️ {error}</div>
        )}

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '13px', borderRadius: '11px',
          background: '#f59e0b', fontSize: '14px', fontWeight: '700',
          color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.15s', boxShadow: '0 3px 16px rgba(245,158,11,0.28)',
          opacity: loading ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
          {loading ? (
            <>
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%',
                border: '2px solid rgba(0,0,0,0.3)', borderTop: '2px solid #000',
                animation: 'spin 0.8s linear infinite',
              }} />
              Signing in...
            </>
          ) : 'Sign In →'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: '#64748b' }}>
        Don&apos;t have an account?{' '}
        <button onClick={() => router.push('/auth/signup')} style={{
          color: '#f59e0b', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '13px', fontWeight: '600',
        }}>
          Create one free
        </button>
      </p>
    </AuthLayout>
  )
}
