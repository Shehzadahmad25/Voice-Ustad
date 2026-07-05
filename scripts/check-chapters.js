// check-chapters.js
// Shows which chapters are registered and how many content_chunks each has.
// Usage: node check-chapters.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars. Need SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Chapters table
  const { data: chapters, error: chErr } = await supabase
    .from('chapters')
    .select('id, unit_number, title, subject, class, board')
    .eq('class', 11)
    .eq('board', 'KPK')
    .order('unit_number');

  if (chErr) { console.error('chapters error:', chErr.message); process.exit(1); }

  console.log(`\n=== chapters table (class=11, board=KPK) ===`);
  if (!chapters || chapters.length === 0) {
    console.log('  (no rows found)');
  } else {
    chapters.forEach(ch => console.log(`  Ch${ch.unit_number}: ${ch.title}`));
  }

  // content_chunks count per chapter
  const { data: chunks, error: ckErr } = await supabase
    .from('content_chunks')
    .select('chapter')
    .eq('board', 'KPK');

  if (ckErr) { console.error('content_chunks error:', ckErr.message); process.exit(1); }

  const counts = {};
  (chunks || []).forEach(r => { counts[r.chapter] = (counts[r.chapter] || 0) + 1; });

  console.log(`\n=== content_chunks rows per chapter (board=KPK) ===`);
  const chNums = Object.keys(counts).map(Number).sort((a, b) => a - b);
  if (chNums.length === 0) {
    console.log('  (no rows found)');
  } else {
    chNums.forEach(n => console.log(`  Ch${n}: ${counts[n]} chunks`));
  }

  // Chapters registered but no chunks
  const registered = new Set((chapters || []).map(c => c.unit_number));
  const hasChunks  = new Set(chNums);
  const missing    = [...registered].filter(n => !hasChunks.has(n));
  const orphan     = [...hasChunks].filter(n => !registered.has(n));

  if (missing.length > 0) {
    console.log(`\n⚠️  Registered chapters with NO chunks: ${missing.map(n => 'Ch'+n).join(', ')}`);
  }
  if (orphan.length > 0) {
    console.log(`\n⚠️  Chunks exist but chapter NOT registered: ${orphan.map(n => 'Ch'+n).join(', ')}`);
  }
  if (missing.length === 0 && orphan.length === 0) {
    console.log('\n✅ All registered chapters have chunks, no orphaned chunks.');
  }

  console.log();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
