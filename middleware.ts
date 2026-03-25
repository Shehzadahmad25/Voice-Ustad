import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const DEMO_KEY = process.env.DEMO_ACCESS_KEY

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // If DEMO_ACCESS_KEY is set, require it on all API routes
  const protectedApiRoutes = ['/api/chat', '/api/chat2', '/api/topic-view']
  if (DEMO_KEY && protectedApiRoutes.some(r => path.startsWith(r))) {
    const paramKey = req.nextUrl.searchParams.get('demo')
    const headerKey = req.headers.get('x-demo-key')
    if (paramKey !== DEMO_KEY && headerKey !== DEMO_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/chat',
    '/api/chat/:path*',
    '/api/chat2',
    '/api/chat2/:path*',
    '/api/topic-view',
    '/api/topic-view/:path*',
  ],
}
