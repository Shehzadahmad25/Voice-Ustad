import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

const hasValidSupabaseUrl = Boolean(
  supabaseUrl && /^https?:\/\/.+/i.test(supabaseUrl)
)

let browserClient: SupabaseClient | null = null

export const isSupabaseConfigured =
  hasValidSupabaseUrl && Boolean(supabaseAnonKey)

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl!, supabaseAnonKey!)
  }

  return browserClient
}

export function getSupabaseConfigError() {
  if (!supabaseUrl) {
    return 'NEXT_PUBLIC_SUPABASE_URL is missing.'
  }

  if (!hasValidSupabaseUrl) {
    return 'NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP or HTTPS URL.'
  }

  if (!supabaseAnonKey) {
    return 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.'
  }

  return null
}

// Database types
export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  class: '9' | '10' | '11' | '12' | string | null
  board: 'KPK' | 'Federal' | 'Punjab' | 'Sindh' | string | null
  goal:
    | 'FSc Pre-Medical'
    | 'FSc Pre-Engineering'
    | 'MDCAT Preparation'
    | 'ECAT Preparation'
    | string
    | null
  referral_code: string | null
  subscription_status: 'trial' | 'active' | 'inactive' | string | null
  trial_ends_at: string | null
  created_at: string
}
