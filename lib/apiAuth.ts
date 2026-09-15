import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { evaluateAccess, type AccessRow } from '@/lib/subscription'

/**
 * lib/apiAuth.ts
 * --------------
 * Server-side identity + paywall checks for API routes.
 *
 * Same pattern as lib/teacherAuth.ts and app/api/chat-history: identity comes
 * ONLY from the Supabase access token in the Authorization header, verified
 * with auth.getUser(). Never from a body/query param, and never from the
 * `vu-auth` cookie the middleware reads (that cookie is set by client JS).
 *
 * Every route that uses the service-role client MUST call one of these first —
 * the service client bypasses RLS, so this is the only gate.
 *
 *   requireUser(req)    -> signed-in user (any plan)
 *   requireAccess(req)  -> signed-in user whose trial or subscription is
 *                          active (or a teacher). Reads profiles with the
 *                          service client, so it is trustworthy only because
 *                          2026-09-lock-profile-privileged-columns.sql makes
 *                          those columns read-only for end users.
 *
 * Both return { error, status, code } on failure; pass that to authError().
 */

export type AuthFailure = {
  error: string
  status: 401 | 403 | 503
  code: 'NO_TOKEN' | 'INVALID_TOKEN' | 'NO_PROFILE' | 'SUBSCRIPTION_REQUIRED' | 'PROFILE_UNAVAILABLE'
}

export type AuthedUser = {
  db: ReturnType<typeof getServiceClient>
  userId: string
  email: string | null
}

export type AccessUser = AuthedUser & {
  access: ReturnType<typeof evaluateAccess>
}

function bearerToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') ?? ''
  return authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
}

export async function requireUser(req: NextRequest): Promise<AuthedUser | AuthFailure> {
  const token = bearerToken(req)
  if (!token) {
    return { error: 'Missing bearer token', status: 401, code: 'NO_TOKEN' }
  }

  const db = getServiceClient()
  const { data: userData, error: authError } = await db.auth.getUser(token)
  const userId = userData?.user?.id

  if (authError || !userId) {
    return { error: 'Invalid or expired session', status: 401, code: 'INVALID_TOKEN' }
  }

  return { db, userId, email: userData.user.email ?? null }
}

export async function requireAccess(req: NextRequest): Promise<AccessUser | AuthFailure> {
  const auth = await requireUser(req)
  if ('error' in auth) return auth

  const { data: profile, error } = await auth.db
    .from('profiles')
    .select('is_subscribed, subscription_expires_at, trial_ends_at, subscription_status, role')
    .eq('id', auth.userId)
    .maybeSingle()

  if (error) {
    // Fail CLOSED. The client-side check in lib/subscription.ts fails open
    // because it only drives UI; this one guards paid API spend.
    console.error('[apiAuth] profile lookup failed for', auth.userId, '-', error.message)
    return { error: 'Could not verify subscription, try again shortly', status: 503, code: 'PROFILE_UNAVAILABLE' }
  }
  if (!profile) {
    return { error: 'No profile for this account', status: 403, code: 'NO_PROFILE' }
  }

  const access = evaluateAccess(profile as AccessRow)
  if (!access.hasAccess) {
    return {
      error: 'Your free trial has ended. Upgrade to VoiceUstad Pro at /pricing to continue.',
      status: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    }
  }

  return { ...auth, access }
}

/** Uniform JSON error body for the failures above. */
export function authError(failure: AuthFailure) {
  return NextResponse.json(
    { ok: false, error: failure.error, code: failure.code },
    { status: failure.status },
  )
}
