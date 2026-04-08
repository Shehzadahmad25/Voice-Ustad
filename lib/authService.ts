'use client'

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase'
import type { UserProfile } from '@/lib/supabase'
import {
  normalizeEmail,
  validateEmail,
  validatePasswordConfirmation,
  validateStrongPassword,
} from '@/lib/authValidation'

const AUTH_MARKER_COOKIE         = 'vu-auth'
const AUTH_MARKER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

type Credentials = {
  email:    string
  password: string
}

type SignUpInput = Credentials & {
  fullName?: string
}

type ProfileInput = {
  full_name: string
  phone:     string
  class:     UserProfile['class']
  board:     UserProfile['board']
  goal:      UserProfile['goal']
}

// ── AUTH BYPASS HELPER ────────────────────────────────────────────────────────
// Returns the Supabase client, or null when auth is disabled / unconfigured.
// Every method below checks for null and returns a safe fallback instead of
// throwing, so pages can import authService safely in dev-bypass mode.
// To restore strict behaviour: revert to `getSupabaseOrThrow()` (see below).
function getClient() {
  return getSupabaseClient() ?? null
}

// Kept here so restoring strict mode is a one-line change per call site:
// function getSupabaseOrThrow() {
//   const sb = getSupabaseClient()
//   if (!sb) throw new Error('Supabase is not configured.')
//   return sb
// }

// ─────────────────────────────────────────────────────────────────────────────

function getBrowserOrigin() {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function setAuthMarkerCookie(active: boolean) {
  if (typeof document === 'undefined') return
  if (!active) {
    document.cookie = `${AUTH_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
    return
  }
  document.cookie = `${AUTH_MARKER_COOKIE}=1; Path=/; Max-Age=${AUTH_MARKER_COOKIE_MAX_AGE}; SameSite=Lax`
}

function mapAuthError(error: unknown, fallback: string) {
  console.error('[authService] raw error:', error)
  if (error && typeof error === 'object') {
    // Cast through unknown first to satisfy TypeScript — PostgrestError does not
    // have an index signature so a direct cast to Record<string,unknown> is rejected.
    const e      = error as unknown as Record<string, unknown>
    const msg    = String(e['message']  ?? '')
    const code   = String(e['code']     ?? '')
    const details = String(e['details'] ?? '')
    const hint   = String(e['hint']     ?? '')
    console.error('[authService] Supabase error detail:', { code, message: msg, details, hint })
    if (msg  && msg  !== 'undefined') return msg
    if (code && code !== 'undefined') return `DB error code: ${code}`
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i += 1) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

function getDefaultTrialEnd() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString()
}

function normalizeProfileRecord(record: Partial<UserProfile>, user: User): UserProfile {
  return {
    id:                  user.id,
    email:               record.email               || user.email                         || '',
    full_name:           record.full_name           || user.user_metadata?.full_name      || user.email?.split('@')[0] || '',
    phone:               record.phone               || user.user_metadata?.phone          || '',
    class:               (record.class as UserProfile['class']) || '11',
    board:               (record.board as UserProfile['board']) || 'KPK',
    goal:                (record.goal  as UserProfile['goal'])  || 'MDCAT Preparation',
    referral_code:       record.referral_code       || generateReferralCode(),
    subscription_status: record.subscription_status || 'trial',
    trial_ends_at:       record.trial_ends_at       || getDefaultTrialEnd(),
    created_at:          record.created_at          || user.created_at,
  }
}

async function syncAuthMarkerFromSession(session: Session | null) {
  setAuthMarkerCookie(Boolean(session))
}

export const authService = {
  async bootstrapSession() {
    const supabase = getClient()
    // ── AUTH BYPASS: no Supabase client → no session, no cookie
    if (!supabase) return null

    const { data, error } = await supabase.auth.getSession()
    if (error) throw new Error(mapAuthError(error, 'Could not read session.'))
    await syncAuthMarkerFromSession(data.session)
    return data.session
  },

  async login({ email, password }: Credentials) {
    const emailError = validateEmail(email)
    if (emailError) throw new Error(emailError)
    if (!password)  throw new Error('Password is required.')

    const supabase = getClient()
    if (!supabase)  throw new Error('Auth is currently disabled.')

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password })
    if (error) throw new Error(mapAuthError(error, 'Login failed.'))
    await syncAuthMarkerFromSession(data.session)
    return data
  },

  async signup({ email, password, fullName }: SignUpInput) {
    const emailError    = validateEmail(email)
    if (emailError) throw new Error(emailError)
    const passwordError = validateStrongPassword(password)
    if (passwordError)  throw new Error(passwordError)

    const supabase = getClient()
    if (!supabase)  throw new Error('Auth is currently disabled.')

    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        emailRedirectTo: `${getBrowserOrigin()}/dashboard`,
        data: { full_name: fullName?.trim() || null },
      },
    })
    if (error) throw new Error(mapAuthError(error, 'Sign up failed.'))
    await syncAuthMarkerFromSession(data.session)
    return data
  },

  async logout() {
    setAuthMarkerCookie(false)
    const supabase = getClient()
    if (!supabase) return  // nothing to sign out of during bypass

    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(mapAuthError(error, 'Logout failed.'))
  },

  async requestPasswordReset(email: string) {
    const emailError = validateEmail(email)
    if (emailError) throw new Error(emailError)

    const supabase = getClient()
    if (!supabase)  throw new Error('Auth is currently disabled.')

    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${getBrowserOrigin()}/reset-password`,
    })
    if (error) throw new Error(mapAuthError(error, 'Could not send reset email.'))
  },

  async updatePassword(password: string, confirmPassword: string) {
    const passwordError     = validateStrongPassword(password)
    if (passwordError) throw new Error(passwordError)
    const confirmationError = validatePasswordConfirmation(password, confirmPassword)
    if (confirmationError)  throw new Error(confirmationError)

    const supabase = getClient()
    if (!supabase)  throw new Error('Auth is currently disabled.')

    const { data, error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(mapAuthError(error, 'Could not update password.'))
    const session = await this.getCurrentSession()
    await syncAuthMarkerFromSession(session)
    return data
  },

  async getCurrentUser(): Promise<User | null> {
    const supabase = getClient()
    // ── AUTH BYPASS: return null instead of throwing
    if (!supabase) return null

    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(mapAuthError(error, 'Could not load user.'))
    return data.user
  },

  async getProfile(userId?: string): Promise<UserProfile | null> {
    const supabase = getClient()
    if (!supabase) return null

    const currentUser    = userId ? null : await this.getCurrentUser()
    const targetUserId   = userId || currentUser?.id
    if (!targetUserId)   return null

    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', targetUserId).maybeSingle()
    if (error) throw new Error(mapAuthError(error, 'Could not load profile.'))
    return data as UserProfile | null
  },

  async getOrCreateProfile(): Promise<UserProfile | null> {
    const supabase = getClient()
    if (!supabase) return null

    const user = await this.getCurrentUser()
    if (!user)    return null

    const existingProfile = await this.getProfile(user.id)
    if (existingProfile) return normalizeProfileRecord(existingProfile, user)

    const profile = normalizeProfileRecord({}, user)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { email: _email, ...profileWithoutEmail } = profile

    // Try with email first; fall back without it if the column doesn't exist yet
    let data: unknown  = null
    let error: unknown = null

    const withEmail = await supabase
      .from('profiles')
      .upsert(profile, { onConflict: 'id', ignoreDuplicates: false })
      .select('*').single()

    // Cast through unknown before indexing — PostgrestError lacks an index signature
    const withEmailMsg = String(
      (withEmail.error as unknown as Record<string, unknown>)?.['message'] ?? ''
    )
    if (withEmail.error && withEmailMsg.includes('email')) {
      console.warn('[authService] email column missing, retrying without it')
      const withoutEmail = await supabase
        .from('profiles')
        .upsert(profileWithoutEmail, { onConflict: 'id', ignoreDuplicates: false })
        .select('*').single()
      data  = withoutEmail.data
      error = withoutEmail.error
    } else {
      data  = withEmail.data
      error = withEmail.error
    }

    if (error) throw new Error(mapAuthError(error, 'Could not create profile.'))
    return normalizeProfileRecord(data as UserProfile, user)
  },

  async saveProfile(input: ProfileInput): Promise<UserProfile | null> {
    const supabase = getClient()
    if (!supabase) return null

    const user = await this.getCurrentUser()
    if (!user)    return null

    const baseProfile = await this.getOrCreateProfile()
    if (!baseProfile) return null

    const nextProfile = { ...baseProfile, ...input, email: user.email || baseProfile.email }

    const { data, error } = await supabase
      .from('profiles').upsert(nextProfile, { onConflict: 'id' }).select('*').single()
    if (error) throw new Error(mapAuthError(error, 'Could not save profile.'))
    return normalizeProfileRecord(data as UserProfile, user)
  },

  async getCurrentSession(): Promise<Session | null> {
    const supabase = getClient()
    if (!supabase) return null

    const { data, error } = await supabase.auth.getSession()
    if (error) throw new Error(mapAuthError(error, 'Could not load session.'))
    return data.session
  },

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ) {
    const supabase = getClient()
    if (!supabase) {
      // Return a no-op subscription object so callers don't need to null-check
      return { unsubscribe: () => {} }
    }
    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      syncAuthMarkerFromSession(session).catch(() => {})
      callback(event, session)
    })
    return subscription.data.subscription
  },

  async loginWithGoogle() {
    const supabase = getClient()
    if (!supabase) throw new Error('Auth is currently disabled.')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: `${getBrowserOrigin()}/auth/callback` },
    })
    if (error) throw new Error(mapAuthError(error, 'Google login failed.'))
  },

  async loginWithWhatsAppOtp() {
    throw new Error('WhatsApp OTP login is not enabled yet.')
  },
}

export type AuthUser    = User
export type AuthSession = Session
