'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { authService } from '@/lib/authService'
import { UserProfile } from '@/lib/supabase'

type AuthContextType = {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  initialized: boolean
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  initialized: false,
  signOut: async () => {},
  refreshSession: async () => {},
  refreshProfile: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  // Tracks the authenticated user id so auth re-emits (TOKEN_REFRESHED,
  // SIGNED_IN on tab focus) for the SAME user don't flip loading — that
  // unmounted every AuthGuard page and replayed mount effects.
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    const loadSession = async () => {
      try {
        const currentSession = await authService.bootstrapSession()
        if (!active) return

        if (currentSession?.user) {
          lastUserIdRef.current = currentSession.user.id
          setSession(currentSession)
          setUser(currentSession.user)
          // Unblock AuthGuard immediately — the session alone decides access.
          // The profile hydrates in the background (pages render fallbacks
          // until it lands). Awaiting it here kept every protected page on
          // the 'Checking your session...' spinner for the full profile
          // round trip (~2s measured).
          setLoading(false)
          fetchProfile().catch(() => {})
        } else {
          setSession(null)
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
      } catch (error) {
        console.error('Auth bootstrap error:', error)
        if (active) {
          setSession(null)
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
      } finally {
        if (active) setInitialized(true)
      }
    }

    loadSession()

    const subscription = authService.onAuthStateChange(async (_event, nextSession) => {
      if (!active) {
        return
      }

      if (nextSession?.user) {
        const identityChanged = nextSession.user.id !== lastUserIdRef.current
        lastUserIdRef.current = nextSession.user.id
        setSession(nextSession)
        setUser(nextSession.user)
        // Only fetch the profile when a DIFFERENT user signs in. Same-user
        // re-emits (INITIAL_SESSION right after bootstrap, TOKEN_REFRESHED,
        // tab focus) previously duplicated the profile fetch + auth round
        // trips on every first load; bootstrap already hydrates the profile.
        if (identityChanged) {
          setLoading(true)
          await fetchProfile()
        }
      } else {
        lastUserIdRef.current = null
        setSession(null)
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const fetchProfile = async () => {
    try {
      const nextProfile = await authService.getOrCreateProfile()
      if (nextProfile === null) {
        console.warn('[AuthProvider] getOrCreateProfile returned null — no active session or user not found')
      }
      setProfile(nextProfile)
    } catch (error) {
      console.error('[AuthProvider] fetchProfile error —',
        'message:', (error as Error)?.message ?? '(none)',
        '| name:',  (error as Error)?.name    ?? '(none)',
        error,
      )
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await authService.logout()
    setSession(null)
    setUser(null)
    setProfile(null)
  }

  const refreshSession = async () => {
    setLoading(true)
    try {
      const currentSession = await authService.bootstrapSession()
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession?.user) {
        await fetchProfile()
      } else {
        setProfile(null)
      }
    } finally {
      setLoading(false)
      setInitialized(true)
    }
  }

  const refreshProfile = async () => {
    setLoading(true)
    try {
      if (!user) {
        setProfile(null)
        return
      }

      await fetchProfile()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        initialized,
        signOut,
        refreshSession,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
