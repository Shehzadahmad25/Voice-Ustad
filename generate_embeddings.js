// generate_embeddings.js
// Generates OpenAI embeddings for all content_chunks rows where embedding IS NULL.
// Usage: node generate_embeddings.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai   = new OpenAI.default({ apiKey: OPENAI_KEY });

const EMBED_MODEL = 'text-embedding-3-small';
const DIMENSIONS  = 1536;
const DELAY_MS    = 200;

function buildEmbedText(row) {
  const keywordsStr = Array.isArray(row.keywords) ? row.keywords.join(', ') : (row.keywords || '');
  return [
    row.term             || '',
    row.book_definition  || '',
    row.guide_explanation|| '',
    row.example_q        || '',
    row.example_solution || '',
    keywordsStr,
  ]
    .map(s => String(s).trim())
    .filter(Boolean)
    .join(' | ');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const { data: rows, error } = await supabase
    .from('content_chunks')
    .select('id, term, book_definition, guide_explanation, example_q, example_solution, keywords')
    .is('embedding', null)
    .eq('board', 'KPK')
    .eq('class', 11)
    .eq('subject', 'Chemistry');

  if (error) {
    console.error('Supabase fetch error:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('No rows with NULL embedding found for KPK class 11 Chemistry.');
    return;
  }

  const total = rows.length;
  console.log(`Found ${total} row(s) with NULL embedding. Processing one at a time...\n`);

  let success = 0;
  let failed  = 0;

  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i];
    const text = buildEmbedText(row);
    const idx  = i + 1;

    let embedding;
    try {
      const res = await openai.embeddings.create({
        model:      EMBED_MODEL,
        input:      text,
        dimensions: DIMENSIONS,
      });
      embedding = res.data[0].embedding;
    } catch (err) {
      console.error(`✗ [${idx}/${total}] ${row.term} — OpenAI error: ${err.message}`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    const { error: updateErr } = await supabase
      .from('content_chunks')
      .update({ embedding })
      .eq('id', row.id);

    if (updateErr) {
      console.error(`✗ [${idx}/${total}] ${row.term} — Supabase error: ${updateErr.message}`);
      failed++;
    } else {
      console.log(`✓ [${idx}/${total}] ${row.term}`);
      success++;
    }

    if (i < rows.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed (total ${total}).`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
