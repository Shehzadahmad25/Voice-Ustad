/**
 * scripts/clearCache.js
 * ---------------------
 * Dev utility: clears all TTS audio cache from Supabase.
 *
 * What is cleared:
 *   1. Audio fields on qa_cache rows (audio_url, audio_duration, tts_voice,
 *      tts_model, audio_created_at) — Q&A answers and Urdu TTS text are preserved.
 *   2. MP3 files in the tts-audio Supabase Storage bucket.
 *
 * What is NOT cleared:
 *   - qa_cache rows (Q&A answers kept intact)
 *   - chapters, topics, concepts, formulas, examples (learning content)
 *
 * Usage:
 *   node scripts/clearCache.js
 *   node scripts/clearCache.js --dry-run   (preview only, no changes)
 *
 * Note: scripts/clearCache.ts is not used because ts-node is not installed
 * and the project tsconfig uses moduleResolution:bundler (Next.js 15).
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\nERROR: Missing required env vars.');
  console.error('  NEXT_PUBLIC_SUPABASE_URL   :', SUPABASE_URL ? '✓' : '✗ MISSING');
  console.error('  SUPABASE_SERVICE_ROLE_KEY  :', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗ MISSING (falling back to anon key)');
  console.error('\nEnsure these are set in .env.local\n');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('\n=== VoiceUstad Cache Cleaner ===');
  if (isDryRun) console.log('DRY RUN — no changes will be made\n');
  else console.log('');

  // ── 1. Find qa_cache rows with audio ────────────────────────────────────────
  const { data: audioRows, error: findErr } = await db
    .from('qa_cache')
    .select('id, normalized_question, chapter_number, audio_url, tts_voice')
    .neq('audio_url', '');

  if (findErr) { console.error('ERROR querying qa_cache:', findErr.message); process.exit(1); }

  console.log(`qa_cache rows with cached audio: ${audioRows?.length ?? 0}`);

  if (audioRows?.length) {
    audioRows.forEach((r, i) => {
      console.log(`  [${i + 1}] ch${r.chapter_number} | ${String(r.normalized_question).slice(0, 60)} | voice:${r.tts_voice}`);
    });
    console.log('');

    if (!isDryRun) {
      const { error: clearErr } = await db
        .from('qa_cache')
        .update({
          audio_url:        '',
          audio_duration:   0,
          tts_voice:        '',
          tts_model:        '',
          audio_created_at: null,
          updated_at:       new Date().toISOString(),
        })
        .neq('audio_url', '');

      if (clearErr) console.error('ERROR clearing audio fields:', clearErr.message);
      else console.log(`✓ Cleared audio fields on ${audioRows.length} qa_cache rows`);
    } else {
      console.log(`  → DRY RUN: would clear audio fields on ${audioRows.length} rows`);
    }
  }

  // ── 2. List and delete tts-audio Storage files ──────────────────────────────
  console.log('\ntts-audio Storage:');
  let totalFiles = 0;
  let totalDeleted = 0;

  const { data: chapterDirs, error: listErr } = await db.storage
    .from('tts-audio')
    .list('tts', { limit: 200 });

  if (listErr) {
    console.warn('  Could not list storage (bucket may be empty or missing):', listErr.message);
  } else if (!chapterDirs?.length) {
    console.log('  No files found in tts-audio bucket');
  } else {
    for (const dir of chapterDirs) {
      const { data: files } = await db.storage
        .from('tts-audio')
        .list(`tts/${dir.name}`, { limit: 500 });

      if (!files?.length) continue;
      totalFiles += files.length;

      console.log(`  tts/${dir.name}/ → ${files.length} file(s)`);
      files.forEach((f) => console.log(`    - ${f.name}`));

      if (!isDryRun) {
        const paths = files.map((f) => `tts/${dir.name}/${f.name}`);
        const { error: delErr } = await db.storage.from('tts-audio').remove(paths);
        if (delErr) console.error(`    ERROR deleting:`, delErr.message);
        else totalDeleted += files.length;
      }
    }

    if (!isDryRun) console.log(`\n✓ Deleted ${totalDeleted}/${totalFiles} audio files from tts-audio`);
    else console.log(`\n  → DRY RUN: would delete ${totalFiles} audio file(s)`);
  }

  // ── 3. Summary ──────────────────────────────────────────────────────────────
  const { count } = await db.from('qa_cache').select('*', { count: 'exact', head: true });
  console.log(`\nqa_cache total rows: ${count} (Q&A answers preserved)`);

  console.log('\nNext steps:');
  console.log('  1. Hard-refresh the browser (Ctrl+Shift+R)');
  console.log('  2. Or run clearBrowserAudioCache() in the browser console');
  console.log('     to also clear the localStorage audio blob cache.');
  console.log('  3. Re-ask your question to generate fresh TTS audio.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
