'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

/**
 * OAuth callback — runs in the BROWSER so the Supabase client can exchange the
 * PKCE code and store the resulting session in localStorage (where every other
 * page looks for it).  A server-side route handler cannot do this because it
 * has no access to the browser's localStorage.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [statusMsg, setStatusMsg] = useState('Signing you in…')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const error  = params.get('error')

    if (error) {
      console.error('[callback] provider error:', error)
      router.replace('/auth/signin?error=oauth_failed')
      return
    }

    if (!code) {
      console.error('[callback] missing code param')
      router.replace('/auth/signin?error=no_code')
      return
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      console.error('[callback] Supabase not configured')
      router.replace('/auth/signin?error=no_client')
      return
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(async ({ data, error: exchError }) => {
        if (exchError || !data.session) {
          console.error('[callback] exchange failed:', exchError?.message)
          router.replace('/auth/signin?error=oauth_failed')
          return
        }

        const userId = data.session.user.id

        // Route new users (no profile.class) to onboarding; returning users → dashboard
        const { data: profile } = await supabase
          .from('profiles')
          .select('class')
          .eq('id', userId)
          .maybeSingle()

        if (profile?.class) {
          router.replace('/dashboard')
        } else {
          router.replace('/auth/onboarding')
        }
      })
      .catch((err) => {
        console.error('[callback] unexpected error:', err)
        setStatusMsg('Something went wrong. Redirecting…')
        router.replace('/auth/signin?error=oauth_failed')
      })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
    }}>
      {/* Spinner */}
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        border: '3px solid rgba(245,158,11,0.25)',
        borderTop: '3px solid #f59e0b',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#64748b', fontSize: '14px', fontFamily: 'system-ui, sans-serif' }}>
        {statusMsg}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
