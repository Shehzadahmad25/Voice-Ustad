import { getSupabaseClient } from '@/lib/supabase'

export type SubscriptionStatus = {
  hasAccess: boolean
  isTrial: boolean
  isSubscribed: boolean
  daysLeft: number
  trialEndsAt: string | null
  subscriptionExpiresAt: string | null
}

/** The profile columns the access rule reads. Shared by client + server. */
export type AccessRow = {
  is_subscribed?: boolean | null
  subscription_expires_at?: string | null
  trial_ends_at?: string | null
  subscription_status?: string | null
  role?: string | null
}

/**
 * THE access rule — pure, no I/O. Used by the client-side gate below (UI
 * only) and by lib/apiAuth.ts requireAccess() (the real, server-side gate).
 *
 *   trial active    : trial_ends_at in the future
 *   subscribed      : is_subscribed OR subscription_status='active', and
 *                     subscription_expires_at either unset or in the future
 *   teacher         : role='teacher' — teachers are not on a student plan
 *
 * hasAccess = any of the three.
 */
export function evaluateAccess(row: AccessRow, now: Date = new Date()): SubscriptionStatus {
  const trialEndsAt: string | null = row.trial_ends_at ?? null
  const subExpiresAt: string | null = row.subscription_expires_at ?? null
  const isSubscribedFlag = Boolean(row.is_subscribed)
  const statusCol = String(row.subscription_status ?? '')
  const isTeacher = row.role === 'teacher'

  const trialActive = trialEndsAt ? new Date(trialEndsAt) > now : false
  const subActive =
    (isSubscribedFlag || statusCol === 'active') &&
    (subExpiresAt ? new Date(subExpiresAt) > now : true)

  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  return {
    hasAccess: trialActive || subActive || isTeacher,
    isTrial: trialActive && !subActive,
    isSubscribed: subActive,
    daysLeft,
    trialEndsAt,
    subscriptionExpiresAt: subExpiresAt,
  }
}

/**
 * Client-side status for UI (banners, redirects to /pricing). This fails OPEN
 * on a DB error because it only drives UI — the server-side requireAccess()
 * in lib/apiAuth.ts is what actually protects paid routes, and that one
 * fails closed.
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const fallback: SubscriptionStatus = {
    hasAccess: true, // fail-open: never block on a DB error
    isTrial: false,
    isSubscribed: false,
    daysLeft: 0,
    trialEndsAt: null,
    subscriptionExpiresAt: null,
  }

  try {
    const supabase = getSupabaseClient()
    if (!supabase) return fallback

    const { data, error } = await supabase
      .from('profiles')
      .select('is_subscribed, subscription_expires_at, trial_ends_at, subscription_status, role')
      .eq('id', userId)
      .single()

    if (error || !data) return fallback

    return evaluateAccess(data as AccessRow)
  } catch (e) {
    console.error('[subscription] getSubscriptionStatus error:', e)
    return fallback // fail-open
  }
}
