'use client'

import type { ReactNode } from 'react'
import TopNav from '@/components/TopNav'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="vu-app-shell">
      <TopNav />
      <main className="vu-app-main">{children}</main>
    </div>
  )
}
