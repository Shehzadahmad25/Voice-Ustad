'use client'

import type { ReactNode } from 'react'

type StatCardProps = {
  label: string
  value: string
  meta?: string
  action?: ReactNode
}

export function StatCard({ label, value, meta, action }: StatCardProps) {
  return (
    <article className="rounded-[24px] border border-white/8 bg-slate-950/70 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-xl font-semibold tracking-[-0.02em] text-white">{value}</p>
      {meta ? <p className="mt-2 text-sm text-slate-400">{meta}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </article>
  )
}
