import { getSupabaseClient } from '@/lib/supabase'

export type SubscriptionStatus = {
  hasAccess: boolean
  isTrial: boolean
  isSubscribed: boolean
  daysLeft: number
  trialEndsAt: string | null
  subscriptionExpiresAt: string | null
}

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
      .select('is_subscribed, subscription_expires_at, trial_ends_at, subscription_status')
      .eq('id', userId)
      .single()

    if (error || !data) return fallback

    const now = new Date()

    const trialEndsAt: string | null = (data as any).trial_ends_at ?? null
    const subExpiresAt: string | null = (data as any).subscription_expires_at ?? null
    const isSubscribedFlag: boolean = Boolean((data as any).is_subscribed)
    // Also honour the string-based status column as a fallback
    const statusCol: string = String((data as any).subscription_status ?? '')

    const trialActive = trialEndsAt ? new Date(trialEndsAt) > now : false
    const subActive =
      (isSubscribedFlag || statusCol === 'active') &&
      (subExpiresAt ? new Date(subExpiresAt) > now : isSubscribedFlag || statusCol === 'active')

    const daysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    return {
      hasAccess: trialActive || subActive,
      isTrial: trialActive && !subActive,
      isSubscribed: subActive,
      daysLeft,
      trialEndsAt,
      subscriptionExpiresAt: subExpiresAt,
    }
  } catch (e) {
    console.error('[subscription] getSubscriptionStatus error:', e)
    return fallback // fail-open
  }
}
