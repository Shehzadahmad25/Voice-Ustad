import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pages that require a logged-in user
const PROTECTED_PREFIXES = ['/dashboard', '/chat', '/quiz', '/settings']

// Auth pages — logged-in users shouldn't land here
const AUTH_PREFIXES = ['/auth/signin', '/auth/signup', '/auth/login', '/login']

const DEMO_KEY = process.env.DEMO_ACCESS_KEY

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // ── Demo API key guard (existing logic) ────────────────────────────────────
  const protectedApiRoutes = ['/api/chat', '/api/chat2', '/api/topic-view']
  if (DEMO_KEY && protectedApiRoutes.some(r => path.startsWith(r))) {
    const paramKey  = req.nextUrl.searchParams.get('demo')
    const headerKey = req.headers.get('x-demo-key')
    if (paramKey !== DEMO_KEY && headerKey !== DEMO_KEY) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Auth-based routing ─────────────────────────────────────────────────────
  // We use the lightweight `vu-auth` marker cookie that authService sets on
  // every login and clears on logout.  This gives us a server-readable signal
  // without needing cookie-based Supabase storage (the app uses localStorage).
  const isLoggedIn = Boolean(req.cookies.get('vu-auth')?.value)

  // Redirect authenticated users away from auth pages / homepage
  if (isLoggedIn && (path === '/' || AUTH_PREFIXES.some(p => path.startsWith(p)))) {
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
    '/api/topic-view',
    '/api/topic-view/:path*',
    // Pages (auth routing)
    '/',
    '/dashboard/:path*',
    '/chat/:path*',
    '/quiz/:path*',
    '/settings/:path*',
    '/auth/signin',
    '/auth/signup',
    '/auth/login',
    '/login',
  ],
}
