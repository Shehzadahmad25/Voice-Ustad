import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  const path = req.nextUrl.pathname

  // ── API routes: return 401 JSON (never redirect) ──────────────────────────
  const protectedApiRoutes = ['/api/chat', '/api/chat2', '/api/topic-view']
  if (!session && protectedApiRoutes.some(r => path.startsWith(r))) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  // ── Page routes: redirect to sign-in ─────────────────────────────────────
  const protectedRoutes = ['/dashboard', '/settings', '/chat']
  const authRoutes = ['/auth/signin', '/auth/signup']

  if (!session && protectedRoutes.some(r => path.startsWith(r))) {
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }
  if (session && authRoutes.some(r => path.startsWith(r))) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/settings/:path*',
    '/chat/:path*',
    '/auth/:path*',
    // Protect API routes (root + any sub-paths)
    '/api/chat',
    '/api/chat/:path*',
    '/api/chat2',
    '/api/chat2/:path*',
    '/api/topic-view',
    '/api/topic-view/:path*',
  ],
}
