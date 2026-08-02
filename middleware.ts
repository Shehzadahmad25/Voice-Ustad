import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Route lists ───────────────────────────────────────────────────────────────

// Always allow through — no auth check, no redirect
const PUBLIC_ROUTES = [
  '/',
  '/auth/signin',
  '/auth/signup',
  '/auth/callback',   // ← MUST be public: OAuth lands here before session exists
  '/auth/confirm',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify',
  '/auth/success',
  '/auth/onboarding',
]

// Require a logged-in user
const PROTECTED_PREFIXES = ['/dashboard', '/chat', '/quiz', '/settings']

// Auth pages — logged-in users get bounced to /dashboard
const AUTH_PREFIXES = ['/auth/signin', '/auth/signup', '/auth/login', '/login']

const DEMO_KEY = process.env.DEMO_ACCESS_KEY

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // ── Demo API key guard ─────────────────────────────────────────────────────
  // NOTE: /api/chat-history must ALSO appear in `config.matcher` below or this
  // guard never runs for it — '/api/chat' and '/api/chat/:path*' do not match
  // '/api/chat-history'. That gap left the route unguarded.
  const protectedApiRoutes = ['/api/chat2', '/api/chat-history', '/api/topic-view']
  if (DEMO_KEY && protectedApiRoutes.some(r => path.startsWith(r))) {
    const paramKey  = req.nextUrl.searchParams.get('demo')
    const headerKey = req.headers.get('x-demo-key')
    if (paramKey !== DEMO_KEY && headerKey !== DEMO_KEY) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Public routes — always allow through, no auth check ───────────────────
  if (PUBLIC_ROUTES.some(r => path === r || path.startsWith(r + '/'))) {
    return NextResponse.next()
  }

  // ── Auth-based routing ─────────────────────────────────────────────────────
  // Uses the vu-auth marker cookie set by authService on login/logout.
  const isLoggedIn = Boolean(req.cookies.get('vu-auth')?.value)

  // Redirect authenticated users away from auth pages
  if (isLoggedIn && AUTH_PREFIXES.some(p => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Redirect unauthenticated users away from protected pages
  if (!isLoggedIn && PROTECTED_PREFIXES.some(p => path.startsWith(p))) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('next', path)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // API routes (demo key guard)
    '/api/chat',
    '/api/chat/:path*',
    '/api/chat2',
    '/api/chat2/:path*',
    '/api/chat-history',
    '/api/chat-history/:path*',
    '/api/topic-view',
    '/api/topic-view/:path*',
    // Pages (auth routing)
    '/',
    '/auth/:path*',       // covers /auth/callback, /auth/signin, /auth/signup, etc.
    '/login',
    '/dashboard/:path*',
    '/chat/:path*',
    '/quiz/:path*',
    '/settings/:path*',
  ],
}
