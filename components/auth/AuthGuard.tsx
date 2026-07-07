'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

type AuthGuardProps = {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading, initialized } = useAuth()

  useEffect(() => {
    if (!initialized || loading) {
      return
    }

    if (!user) {
      const redirect = pathname || '/dashboard'
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`)
    }
  }, [initialized, loading, pathname, router, user])

  // Once a user is present, keep children MOUNTED through loading flips —
  // unmounting on every auth refresh reset page state and replayed mount
  // effects (e.g. duplicate session loads in /chat).
  if (!initialized || (loading && !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm">
          Checking your session...
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
