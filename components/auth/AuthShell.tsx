'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type AuthShellProps = {
  title: string
  subtitle: string
  footer?: ReactNode
  children: ReactNode
}

export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(160deg,_#020617_0%,_#0f172a_46%,_#111827_100%)] px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-slate-950/40 backdrop-blur sm:p-10">
          <div className="absolute -right-16 top-8 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative mb-10">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200"
            >
              VoiceUstad Auth
            </Link>
            <h1 className="mt-6 max-w-xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
              {subtitle}
            </p>
          </div>

          <div className="relative grid gap-4 sm:grid-cols-3">
            {[
              'Email login live now',
              'Protected student dashboard',
              'Ready for Google and WhatsApp later',
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>

          <div className="relative mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                Why this flow feels solid
              </p>
              <ul className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
                <li className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  Clean email-first onboarding without exposing unfinished providers.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  Session persistence, protected routes, password reset, and verification-ready flows.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-300" />
                  Future auth methods plug into the same service layer, not your page components.
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-emerald-400/15 bg-gradient-to-br from-emerald-400/10 to-cyan-400/10 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                Student promise
              </p>
              <blockquote className="mt-4 text-lg font-medium leading-8 text-white">
                “Fast login, clear recovery, no confusion. Just get into the app and start studying.”
              </blockquote>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-200">
                <div className="rounded-2xl bg-black/15 p-4">
                  <div className="text-2xl font-bold text-white">1 flow</div>
                  <div className="mt-1 text-slate-300">for signup to reset</div>
                </div>
                <div className="rounded-2xl bg-black/15 p-4">
                  <div className="text-2xl font-bold text-white">0 clutter</div>
                  <div className="mt-1 text-slate-300">only email auth visible</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200/70 bg-white/95 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
                Secure Access
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Email authentication for VoiceUstad students
              </p>
            </div>
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            </div>
          </div>

          {children}
          {footer ? <div className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-600">{footer}</div> : null}
        </section>
      </div>
    </div>
  )
}
