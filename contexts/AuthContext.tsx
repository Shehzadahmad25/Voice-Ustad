'use client'

// ── AUTH BYPASS — development mode ──────────────────────────────────────────
// When no real session exists, a mock user is injected so AuthGuard and all
// pages that read from AuthContext work without login.
// To re-enable: remove the MOCK_* constants and the bypass block in loadSession.
// ────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { authService } from '@/lib/authService'
import { UserProfile } from '@/lib/supabase'

const MOCK_USER = {
  id: 'dev-bypass-user',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as unknown as User

const MOCK_PROFILE: UserProfile = {
  id:                  'dev-bypass-user',
  email:               'test@example.com',
  full_name:           'Test User',
  phone:               '',
  class:               '11',
  board:               'KPK',
  goal:                'FSc Pre-Medical',
  referral_code:       null,
  subscription_status: 'trial',
  trial_ends_at:       null,
  created_at:          new Date().toISOString(),
}

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

  useEffect(() => {
    let active = true

    const loadSession = async () => {
      try {
        const currentSession = await authService.bootstrapSession()
        if (!active) return

        if (currentSession?.user) {
          // Real session — normal path
          setSession(currentSession)
          setUser(currentSession.user)
          await fetchProfile()
        } else {
          // ── AUTH BYPASS: no real session → use mock user ─────────────────
          // To re-enable auth guard: replace these three lines with:
          //   setSession(null); setUser(null); setProfile(null); setLoading(false)
          setSession(null)
          setUser(MOCK_USER)
          setProfile(MOCK_PROFILE)
          setLoading(false)
          // ──────────────────────────────────────────────────────────────────
        }
      } catch (error) {
        console.error('Auth bootstrap error:', error)
        if (active) {
          // On error also fall back to mock so pages don't break
          setSession(null)
          setUser(MOCK_USER)
          setProfile(MOCK_PROFILE)
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
        // Real session arrived — use it
        setSession(nextSession)
        setUser(nextSession.user)
        setLoading(true)
        await fetchProfile()
      } else {
        // No real session → keep / restore mock user so AuthGuard doesn't redirect
        setSession(null)
        setUser(MOCK_USER)
        setProfile(MOCK_PROFILE)
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
      setProfile(nextProfile)
    } catch (error) {
      console.error('Error fetching profile:', error)
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
