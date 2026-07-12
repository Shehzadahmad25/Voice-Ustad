// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  ✅ COMPLETED MIGRATION — ALREADY EXECUTED AGAINST PRODUCTION          ║
// ║  Ran: 2026-07 (PR 6). Result: 12/12 base64 rows migrated to Storage   ║
// ║  URLs, verified in DB and via live playback. Kept for audit/reference ║
// ║  only — do NOT run unless base64 rows somehow reappear (the query     ║
// ║  filter + per-row guards make a re-run a no-op on migrated rows, but  ║
// ║  it should never be needed: the write path stores URLs only, PR 6+).  ║
// ╚═══════════════════════════════════════════════════════════════════════╝
//
// One-time migration: moved base64 MP3 payloads out of chat_messages.urdu_audio_url
// into the tts-audio Storage bucket, replacing the column value with the public URL.
//
// Usage (from repo root):
//   node scripts/migrations/completed/2026-07-migrate-chat-audio-to-storage.js --dry-run
//   node scripts/migrations/completed/2026-07-migrate-chat-audio-to-storage.js
//
// Safe to re-run: rows already holding an http(s) URL are excluded by the query
// AND re-checked per row. Storage uploads use a deterministic path per message id
// with upsert:true, so an interrupted run converges on retry.
//
// Requires in repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');
const BUCKET = 'tts-audio';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(supabaseUrl, serviceKey);

function looksLikeMp3(buf) {
  if (buf.length < 3) return false;
  // ID3 tag or raw MPEG frame sync (0xFF 0xEx/0xFx)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

(async () => {
  console.log(DRY_RUN ? '=== DRY RUN — no uploads, no updates ===' : '=== MIGRATING ===');

  const { data: rows, error } = await db
    .from('chat_messages')
    .select('id, session_id, urdu_audio_url, created_at')
    .not('urdu_audio_url', 'is', null)
    .neq('urdu_audio_url', '')
    .not('urdu_audio_url', 'like', 'http%')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Fetch failed:', error.message);
    process.exit(1);
  }
  console.log(`Found ${rows.length} base64 rows to migrate\n`);

  let migrated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const tag = `[${row.id}]`;
    try {
      const val = String(row.urdu_audio_url || '');
      // Per-row re-check (paranoia beyond the query filter — re-run safety)
      if (/^https?:\/\//i.test(val)) {
        console.log(`${tag} SKIP — already a URL`);
        skipped++;
        continue;
      }

      const buf = Buffer.from(val, 'base64');
      if (buf.length < 1000 || !looksLikeMp3(buf)) {
        console.warn(`${tag} FAIL — decoded ${buf.length} bytes, not valid MP3; leaving row untouched`);
        failed++;
        continue;
      }

      const storagePath = `chat/${row.id}.mp3`;
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
      console.log(`${tag} ${val.length.toLocaleString()} b64 chars -> ${(buf.length / 1024).toFixed(0)} KB MP3 -> ${storagePath}${DRY_RUN ? ' (dry run)' : ''}`);

      if (DRY_RUN) { migrated++; continue; }

      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: true });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      const { error: dbErr } = await db
        .from('chat_messages')
        .update({ urdu_audio_url: publicUrl })
        .eq('id', row.id)
        // Guard: only replace if the column still holds the base64 we read
        // (a concurrent writer can't be clobbered, and re-runs can't double-apply)
        .not('urdu_audio_url', 'like', 'http%');
      if (dbErr) throw new Error(`db update: ${dbErr.message}`);

      console.log(`${tag} OK -> ${publicUrl}`);
      migrated++;
    } catch (e) {
      console.error(`${tag} FAIL — ${e.message}`);
      failed++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`migrated: ${migrated}${DRY_RUN ? ' (dry run — nothing written)' : ''}`);
  console.log(`skipped (already URL): ${skipped}`);
  console.log(`failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
})();
