// generate-embeddings.js
// Reads content_chunks rows where embedding IS NULL, generates
// text-embedding-3-small vectors via OpenAI, and writes them back to Supabase.
//
// Usage:
//   node generate-embeddings.js
//
// Requires in .env.local:
//   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
//   OPENAI_API_KEY

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });

const { createClient } = require('@supabase/supabase-js');
const OpenAI           = require('openai');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai   = new OpenAI.default({ apiKey: OPENAI_KEY });

const BATCH_SIZE  = 10;
const EMBED_MODEL = 'text-embedding-3-small';

function buildText(row) {
  const parts = [
    row.term              ? String(row.term).trim()              : '',
    row.book_definition   ? String(row.book_definition).trim()   : '',
    row.guide_explanation ? String(row.guide_explanation).trim() : '',
  ].filter(Boolean);
  return parts.join('. ');
}

async function embedBatch(texts) {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return res.data.map(d => d.embedding);
}

async function main() {
  const { data: rows, error } = await supabase
    .from('content_chunks')
    .select('id, term, book_definition, guide_explanation')
    .is('embedding', null);

  if (error) {
    console.error('Supabase fetch error:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('No rows with NULL embedding found.');
    return;
  }

  const total = rows.length;
  console.log(`Found ${total} row(s) with NULL embedding. Batching ${BATCH_SIZE} at a time...\n`);

  let done = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch  = rows.slice(i, i + BATCH_SIZE);
    const texts  = batch.map(buildText);

    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      console.error(`OpenAI error on batch starting at row ${i + 1}:`, err.message);
      process.exit(1);
    }

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const { error: updateErr } = await supabase
        .from('content_chunks')
        .update({ embedding: embeddings[j] })
        .eq('id', row.id);

      done++;
      if (updateErr) {
        console.error(`  ✗ ${done}/${total}: ${row.term || row.id} — ${updateErr.message}`);
      } else {
        console.log(`  Embedded ${done}/${total}: ${row.term || row.id}`);
      }
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\nDone. ${done}/${total} rows updated.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
