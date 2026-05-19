import { getSupabaseClient } from '@/lib/supabase'

export async function addXP(userId: string, amount: number) {
  const sb = getSupabaseClient()
  if (!sb) return null

  // Try RPC first (atomic increment), fall back to read-modify-write
  const { error: rpcError } = await sb.rpc('increment_xp', {
    p_user_id: userId,
    p_amount: amount,
  })

  if (!rpcError) return { success: true }

  // Fallback: read current XP and update
  const { data: profile, error: readError } = await sb
    .from('profiles')
    .select('xp')
    .eq('id', userId)
    .single()

  if (readError) {
    console.error('[addXP] read error:', readError.message)
    return null
  }

  const currentXP: number = (profile as any)?.xp ?? 0

  const { error: updateError } = await sb
    .from('profiles')
    .update({ xp: currentXP + amount })
    .eq('id', userId)

  if (updateError) {
    console.error('[addXP] update error:', updateError.message)
    return null
  }

  return { success: true, newXP: currentXP + amount }
}
