import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  // Google / Supabase passed back an error directly
  if (error) {
    console.error('[auth/callback] provider error:', error)
    return NextResponse.redirect(`${origin}/auth/signin?error=oauth_failed`)
  }

  if (!code) {
    console.error('[auth/callback] missing code param')
    return NextResponse.redirect(`${origin}/auth/signin?error=no_code`)
  }

  // Use service-role key for server-side code exchange so it is not
  // restricted by RLS and does not need cookie plumbing.
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase        = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError || !data.session) {
    console.error('[auth/callback] code exchange failed:', exchangeError?.message)
    return NextResponse.redirect(`${origin}/auth/signin?error=oauth_failed`)
  }

  const user = data.session.user
  if (!user) {
    return NextResponse.redirect(`${origin}/auth/signin?error=no_user`)
  }

  // Check if onboarding is complete (profile.class is the sentinel field)
  const { data: profile } = await supabase
    .from('profiles')
    .select('class')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.class) {
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  return NextResponse.redirect(`${origin}/auth/onboarding`)
}
