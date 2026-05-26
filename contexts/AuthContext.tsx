'use client'

import { createContext, useContext, useEffect, useState } from 'react'
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

  useEffect(() => {
    let active = true

    const loadSession = async () => {
      try {
        const currentSession = await authService.bootstrapSession()
        if (!active) return

        if (currentSession?.user) {
          setSession(currentSession)
          setUser(currentSession.user)
          await fetchProfile()
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
        setSession(nextSession)
        setUser(nextSession.user)
        setLoading(true)
        await fetchProfile()
      } else {
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
