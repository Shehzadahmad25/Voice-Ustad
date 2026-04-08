'use client'

import type { ReactNode } from 'react'

type SectionCardProps = {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className = '',
}: SectionCardProps) {
  return (
    <section
      className={`rounded-[28px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_10px_40px_rgba(2,6,23,0.22)] backdrop-blur-sm sm:p-6 ${className}`.trim()}
    >
      {title || description || action ? (
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h2 className="text-lg font-semibold text-white">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
            ) : null}
          </div>

          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      {children}
    </section>
  )
}
