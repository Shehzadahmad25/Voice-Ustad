'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      router.push('/auth/signin?error=auth_failed')
      return
    }

    async function postLoginRedirect() {
      try {
        const { data: { user } } = await supabase!.auth.getUser()
        if (!user) { router.push('/auth/signin?error=auth_failed'); return }
        const { data: profile } = await supabase!
          .from('profiles')
          .select('class, board')
          .eq('id', user.id)
          .single()
        if (!profile?.class || !profile?.board) {
          router.push('/settings?onboarding=1')
        } else {
          router.push('/dashboard')
        }
      } catch {
        router.push('/dashboard')
      }
    }

    async function handleCallback() {
      const { data, error } = await supabase!.auth.getSession()

      if (error) {
        console.error('Callback error:', error)
        router.push('/auth/signin?error=auth_failed')
        return
      }

      if (data.session) {
        console.log('Session found, checking onboarding...')
        await postLoginRedirect()
        return
      }

      // No session yet — exchange the code from URL
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (code) {
        console.log('Exchanging code...')
        const { error: exchangeError } = await supabase!.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          console.error('Exchange error:', exchangeError)
          router.push('/auth/signin?error=auth_failed')
          return
        }
        await postLoginRedirect()
        return
      }

      // Check hash fragment (implicit flow)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')

      if (accessToken) {
        console.log('Token in hash, checking onboarding...')
        await postLoginRedirect()
        return
      }

      console.error('No code or token found')
      router.push('/auth/signin?error=no_token')
    }

    handleCallback()
  }, [router])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07101f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#f1f5f9',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🎙️</div>
        <div style={{ fontSize: 16, color: '#64748b' }}>Signing you in...</div>
      </div>
    </div>
  )
}
