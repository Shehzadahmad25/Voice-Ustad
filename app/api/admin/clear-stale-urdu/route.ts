/**
 * POST /api/admin/clear-stale-urdu
 * ---------------------------------
 * One-time utility: clears stale English urdu_tts_text from the topics table
 * and wipes urdu_summary / audio_url from qa_cache so fresh Urdu is regenerated.
 *
 * Run once after upgrading the Urdu generation prompt.
 *
 * Auth: DEMO_ACCESS_KEY query param or x-admin-key header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkKey(request: NextRequest): boolean {
  const key = process.env.DEMO_ACCESS_KEY || process.env.ADMIN_KEY;
  if (!key) return true;
  return (
    request.nextUrl.searchParams.get('key') === key ||
    request.headers.get('x-admin-key') === key
  );
}

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(request: NextRequest) {
  if (!checkKey(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db    = getDb();
  const stats: Record<string, unknown> = {};

  // ── 1. Clear stale urdu_tts_text from topics table ─────────────────────────
  const { count: topicsCount, error: topicsErr } = await db
    .from('topics')
    .select('id', { count: 'exact', head: true })
    .not('urdu_tts_text', 'is', null)
    .neq('urdu_tts_text', '');

  if (topicsErr) {
    return NextResponse.json({ ok: false, error: topicsErr.message }, { status: 500 });
  }

  stats.topicsWithUrduText = topicsCount ?? 0;

  if ((topicsCount ?? 0) > 0) {
    const { error: clearTopicsErr } = await db
      .from('topics')
      .update({ urdu_tts_text: null })
      .not('urdu_tts_text', 'is', null)
      .neq('urdu_tts_text', '');

    if (clearTopicsErr) {
      stats.topicsError = clearTopicsErr.message;
    } else {
      stats.topicsCleared = topicsCount;
      console.log('[clear-stale-urdu] topics cleared:', topicsCount);
    }
  }

  // ── 2. Clear urdu_summary and audio_url from qa_cache ──────────────────────
  const { count: cacheCount, error: cacheCountErr } = await db
    .from('qa_cache')
    .select('id', { count: 'exact', head: true })
    .not('urdu_tts_text', 'is', null);

  if (!cacheCountErr) {
    stats.qaCacheWithUrdu = cacheCount ?? 0;

    if ((cacheCount ?? 0) > 0) {
      const { error: clearCacheErr } = await db
        .from('qa_cache')
        .update({ urdu_tts_text: null, audio_url: null })
        .not('urdu_tts_text', 'is', null);

      if (clearCacheErr) {
        stats.qaCacheError = clearCacheErr.message;
      } else {
        stats.qaCacheCleared = cacheCount;
        console.log('[clear-stale-urdu] qa_cache cleared:', cacheCount);
      }
    }
  }

  stats.note = 'Run topic-view again to regenerate fresh Urdu TTS for each topic.';
  console.log('[clear-stale-urdu]', JSON.stringify(stats));
  return NextResponse.json({ ok: true, ...stats });
}
