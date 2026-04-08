/**
 * POST /api/admin/clear-cache
 * ---------------------------
 * Dev utility: clears all TTS audio cache without touching Q&A content.
 *
 * What it clears:
 *   1. Audio fields on qa_cache rows (audio_url, audio_duration, tts_voice,
 *      tts_model, audio_created_at) — Q&A answers and Urdu TTS text are preserved.
 *   2. MP3 files in the tts-audio Supabase Storage bucket.
 *
 * Auth: DEMO_ACCESS_KEY query param or x-admin-key header.
 * If no key is configured in env, the route is open (dev-only usage).
 *
 * Usage:
 *   curl -X POST "http://localhost:3001/api/admin/clear-cache?key=YOUR_KEY"
 *   Or via the Clear Cache button in the sidebar (dev mode only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkKey(request: NextRequest): boolean {
  const key = process.env.DEMO_ACCESS_KEY || process.env.ADMIN_KEY;
  if (!key) return true; // no key configured → open (dev)
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

  // ── 1. Clear audio fields on qa_cache rows ──────────────────────────────────
  // Only touches rows that already have audio_url set — skips clean rows.
  // Q&A answers, Urdu TTS text, and embeddings are NOT touched.
  const { data: audioRows, error: countErr } = await db
    .from('qa_cache')
    .select('id')
    .neq('audio_url', '');

  if (countErr) {
    return NextResponse.json({ ok: false, error: countErr.message }, { status: 500 });
  }

  const audioRowCount = audioRows?.length ?? 0;
  stats.qaCacheRowsWithAudio = audioRowCount;

  if (audioRowCount > 0) {
    const { error: clearErr } = await db
      .from('qa_cache')
      .update({
        audio_url:        '',
        audio_duration:   null,
        tts_voice:        '',
        tts_model:        '',
        audio_created_at: null,
        updated_at:       new Date().toISOString(),
      })
      .neq('audio_url', '');

    stats.qaCacheAudioFieldsCleared = clearErr ? 0 : audioRowCount;
    if (clearErr) stats.qaCacheError = clearErr.message;
  }

  // ── 2. Delete MP3 files from tts-audio Storage ─────────────────────────────
  let storageDeleted = 0;
  const storageErrors: string[] = [];

  try {
    // List chapter subdirectories under tts/
    const { data: chapterDirs, error: listErr } = await db.storage
      .from('tts-audio')
      .list('tts', { limit: 200 });

    if (listErr) {
      storageErrors.push(`list error: ${listErr.message}`);
    } else {
      for (const dir of (chapterDirs ?? [])) {
        const { data: files } = await db.storage
          .from('tts-audio')
          .list(`tts/${dir.name}`, { limit: 500 });

        if (files?.length) {
          const paths = files.map((f) => `tts/${dir.name}/${f.name}`);
          const { error: delErr } = await db.storage.from('tts-audio').remove(paths);
          if (delErr) storageErrors.push(`${dir.name}: ${delErr.message}`);
          else storageDeleted += paths.length;
        }
      }
    }
  } catch (err) {
    storageErrors.push((err as Error).message);
  }

  stats.storageFilesDeleted = storageDeleted;
  if (storageErrors.length) stats.storageErrors = storageErrors;

  // ── 3. Summary ──────────────────────────────────────────────────────────────
  const { count: totalRows } = await db
    .from('qa_cache')
    .select('*', { count: 'exact', head: true });

  stats.qaCacheTotalRows = totalRows ?? 0;
  stats.note = 'Q&A answers and Urdu TTS text preserved. Only audio fields cleared.';

  console.log('[clear-cache]', JSON.stringify(stats));
  return NextResponse.json({ ok: true, ...stats });
}
