// ingest-chapter2.js
// Reads chapter2_chunks_final.json, inserts into Supabase content_chunks,
// then generates OpenAI embeddings for all new rows.
// Usage: node ingest-chapter2.js

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');

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
  return [
    row.term             || '',
    row.book_definition  || '',
    row.guide_explanation|| '',
  ].filter(Boolean).join('. ');
}

async function main() {
  // ── 1. Load JSON ──────────────────────────────────────────
  const jsonPath = path.resolve(__dirname, 'chapter2_chunks_final.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('chapter2_chunks_final.json not found in scripts/.');
    process.exit(1);
  }
  const chunks = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${chunks.length} chunks from JSON.\n`);

  // ── 2. Get existing terms to avoid duplicates ─────────────
  const { data: existing } = await supabase
    .from('content_chunks')
    .select('term')
    .eq('chapter', 2);

  const existingTerms = new Set((existing || []).map(r => r.term));
  const toInsert = chunks.filter(c => !existingTerms.has(c.term));

  if (toInsert.length === 0) {
    console.log('All chunks already exist in content_chunks. Nothing to insert.');
    console.log('Running embedding generation for any NULL embeddings...\n');
  } else {
    console.log(`Inserting ${toInsert.length} new chunks (skipping ${chunks.length - toInsert.length} duplicates)...\n`);
  }

  // ── 3. Insert new rows ────────────────────────────────────
  const insertedIds = [];

  for (let i = 0; i < toInsert.length; i++) {
    const c = toInsert[i];
    const row = {
      board:             'KPK',
      class:             11,
      subject:           'Chemistry',
      chapter:           c.chapter,
      section:           c.section   || null,
      type:              c.type      || 'concept',
      term:              c.term,
      book_definition:   c.book_definition   || null,
      guide_explanation: c.guide_explanation || null,
      formula:           Array.isArray(c.formula) ? c.formula : (c.formula ? [c.formula] : null),
      example_q:         c.example_q         || null,
      example_solution:  c.example_solution  || null,
      example_answer:    c.example_answer    || null,
      keywords:          Array.isArray(c.keywords) ? c.keywords : null,
      difficulty:        c.difficulty        || 'intermediate',
      topic_slug:        c.topic_slug        || null,
      page_ref:          c.page_ref          || null,
      exam_tags:         Array.isArray(c.exam_tags) ? c.exam_tags : null,
    };

    const { data, error } = await supabase
      .from('content_chunks')
      .insert(row)
      .select('id, term')
      .single();

    if (error) {
      console.error(`  ✗ Insert failed [${c.term}]:`, error.message);
    } else {
      insertedIds.push(data.id);
      console.log(`  ✓ Inserted ${i + 1}/${toInsert.length}: ${data.term}`);
    }
  }

  // ── 4. Generate embeddings for all NULL rows in chapter 2 ─
  const { data: nullRows, error: fetchErr } = await supabase
    .from('content_chunks')
    .select('id, term, book_definition, guide_explanation')
    .eq('chapter', 2)
    .is('embedding', null);

  if (fetchErr) {
    console.error('Error fetching rows for embedding:', fetchErr.message);
    process.exit(1);
  }

  if (!nullRows || nullRows.length === 0) {
    console.log('\nAll Chapter 2 rows already have embeddings.');
    return;
  }

  console.log(`\nGenerating embeddings for ${nullRows.length} rows...\n`);

  let done = 0;
  const total = nullRows.length;

  for (let i = 0; i < nullRows.length; i += BATCH_SIZE) {
    const batch = nullRows.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildText);

    let embeddings;
    try {
      const res = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
      embeddings = res.data.map(d => d.embedding);
    } catch (err) {
      console.error(`OpenAI error on batch ${i}:`, err.message);
      process.exit(1);
    }

    for (let j = 0; j < batch.length; j++) {
      const { error: updateErr } = await supabase
        .from('content_chunks')
        .update({ embedding: embeddings[j] })
        .eq('id', batch[j].id);

      done++;
      if (updateErr) {
        console.error(`  ✗ Embed failed ${done}/${total}: ${batch[j].term}`);
      } else {
        console.log(`  Embedded ${done}/${total}: ${batch[j].term}`);
      }
    }

    if (i + BATCH_SIZE < nullRows.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n✅ Done. ${toInsert.length} chunks inserted, ${done}/${total} embeddings generated.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
