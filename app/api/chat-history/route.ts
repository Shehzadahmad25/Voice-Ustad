import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10; // fast DB queries only

/**
 * GET /api/chat-history
 *
 * Returns the CALLER'S OWN chat sessions.
 *
 * Identity comes from verifying the Supabase access token in the Authorization
 * header — never from a `userId` query param. This route reads with the
 * service-role client (RLS bypassed), so trusting a caller-supplied id let
 * anyone enumerate another user's session titles by supplying their uuid.
 * A `userId` param is now ignored entirely.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing bearer token' }, { status: 401 });
  }

  const db = getServiceClient();

  // Verify the token against Supabase auth. This is the only source of identity.
  const { data: userData, error: authError } = await db.auth.getUser(token);
  const userId = userData?.user?.id;

  if (authError || !userId) {
    console.warn('[chat-history] token rejected:', authError?.message ?? 'no user on token');
    return NextResponse.json({ ok: false, error: 'Invalid or expired session' }, { status: 401 });
  }

  // The param is ignored, but a mismatch is worth surfacing in logs.
  const requested = req.nextUrl.searchParams.get('userId');
  if (requested && requested !== userId) {
    console.warn(`[chat-history] ignoring userId param ${requested} — token belongs to ${userId}`);
  }

  const { data, error } = await db
    .from('chat_sessions')
    .select('id, title, user_id, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sessions: data ?? [] });
}
