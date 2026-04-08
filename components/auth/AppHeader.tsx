'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

type AppHeaderProps = {
  compact?: boolean
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' },
  { href: '/chat', label: 'Chat' },
]

export function AppHeader({ compact = false }: AppHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, signOut } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState('')

  const handleLogout = async () => {
    setLoggingOut(true)
    setError('')

    try {
      await signOut()
      router.replace('/login?message=You have been logged out.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log out.')
    } finally {
      setLoggingOut(false)
    }
  }

  const displayName =
    profile?.full_name?.trim() || user?.email?.split('@')[0] || 'Student'

  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-slate-950/75 text-white backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white"
            >
              VoiceUstad
            </Link>
            <div className="hidden text-sm text-slate-400 sm:block">
              {displayName}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-sky-500 text-slate-950'
                      : 'border border-white/10 text-slate-300 hover:border-sky-400/30 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>
        </div>

        {compact ? (
          <div className="text-sm text-slate-400">
            {profile?.email || user?.email || 'No email available'}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </header>
  )
}
