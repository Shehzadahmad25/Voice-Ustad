'use client'

import type { ReactNode } from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { AppHeader } from '@/components/auth/AppHeader'

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-slate-950">
        <AppHeader compact />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </AuthGuard>
  )
}
