'use client'

import type { ReactNode } from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>
}
