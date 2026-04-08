'use client'

import type { ReactNode } from 'react'

type FormSectionProps = {
  title: string
  description?: string
  children: ReactNode
}

export function FormSection({
  title,
  description,
  children,
}: FormSectionProps) {
  return (
    <section className="rounded-[24px] border border-white/8 bg-slate-950/60 p-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}
