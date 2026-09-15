'use client'

import { getSupabaseClient } from '@/lib/supabase'

/**
 * lib/authHeaders.ts
 * ------------------
 * Bearer header for calls to our own /api/* routes, which verify the Supabase
 * access token server-side (lib/apiAuth.ts). Spread into fetch() headers:
 *
 *   fetch('/api/chat2', { headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) } })
 *
 * Returns {} when there is no session, so the request still goes out and the
 * route answers 401 — callers surface that as "please sign in" rather than a
 * network error. lib/teacherClient.ts does the same thing for teacher routes.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) return {}
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}
