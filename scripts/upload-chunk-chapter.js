/**
 * VoiceUstad - Upload Chunk-Format Chapter to Supabase
 *
 * Handles flat-array JSON files (e.g. chapter1_chunks_final.json) where each
 * element is a self-contained learning chunk with fields:
 *   id, chapter, section, type, term, topic_slug, difficulty, keywords,
 *   definition, explanation, formula, example, example_q, example_solution,
 *   example_answer
 *
 * Usage:
 *   node scripts/upload-chunk-chapter.js content/chapters/chapter1_chunks_final.json
 *   node scripts/upload-chunk-chapter.js content/chapters/chapter1_chunks_final.json \
 *     --title "Stoichiometry" --unit 1 --class 11 --board KPK --subject Chemistry
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← preferred (bypasses RLS)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  ← fallback
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// ── Supabase client ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CLI argument parser ───────────────────────────────────────────────────────
// Parses flags like --title "Stoichiometry" --unit 1 --class 11

function parseArgs() {
  const args = process.argv.slice(3); // skip: node, script, file
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find an existing chapter row or insert a new one.
 * Stable key: subject + class + board + unit_number
 */
async function ensureChapter(unitNumber, opts) {
  const subject = opts.subject || 'Chemistry';
  const cls = parseInt(opts.class || '11', 10);
  const board = opts.board || 'KPK';
  const title = opts.title || `Chapter ${unitNumber}`;

  const { data: existing } = await supabase
    .from('chapters')
    .select('id')
    .eq('unit_number', unitNumber)
    .eq('subject', subject)
    .eq('class', cls)
    .eq('board', board)
    .single();

  if (existing) return { id: existing.id, created: false };

  const { data: ch, error } = await supabase
    .from('chapters')
    .insert({ unit_number: unitNumber, title, subject, class: cls, board })
    .select()
    .single();

  if (error) {
    console.error('Chapter insert error:', error.message);
    process.exit(1);
  }
  return { id: ch.id, created: true };
}

/**
 * Find a topic row matching chapter_id + section + title, or insert one.
 * Maps chunk fields: section → section, term → title, explanation → content
 */
async function ensureTopic(chapterId, chunk) {
  const { data: existing } = await supabase
    .from('topics')
    .select('id')
    .eq('chapter_id', chapterId)
    .eq('section', chunk.section)
    .eq('title', chunk.term)
    .single();

  if (existing) return { id: existing.id, created: false };

  const { data: td, error } = await supabase
    .from('topics')
    .insert({
      chapter_id: chapterId,
      section: chunk.section,
      title: chunk.term,
      content: chunk.explanation || null,
    })
    .select()
    .single();

  if (error) {
    console.error(`  Topic insert error [${chunk.term}]:`, error.message);
    return null;
  }
  return { id: td.id, created: true };
}

/**
 * Insert a concept row if one with the same chapter_id + term does not exist.
 * Maps: term → term, definition → definition
 */
async function ensureConcept(chapterId, topicId, chunk) {
  const { data: existing } = await supabase
    .from('concepts')
    .select('id')
    .eq('chapter_id', chapterId)
    .eq('term', chunk.term)
    .single();

  if (existing) return false;

  const { error } = await supabase.from('concepts').insert({
    chapter_id: chapterId,
    topic_id: topicId,
    term: chunk.term,
    definition: chunk.definition,
  });

  if (error) {
    console.error(`  Concept insert error [${chunk.term}]:`, error.message);
    return false;
  }
  return true;
}

/**
 * Insert formula rows for a chunk.
 * If chunk.formula is an array, each element becomes a separate row with a
 * stable formula_id: "<chunk.id>_f1", "<chunk.id>_f2", etc.
 * If chunk.formula is null, nothing is inserted.
 */
async function ensureFormulas(chapterId, topicId, chunk) {
  if (!chunk.formula) return 0;

  const formulaList = Array.isArray(chunk.formula)
    ? chunk.formula
    : [chunk.formula];

  let inserted = 0;

  for (let i = 0; i < formulaList.length; i++) {
    const formulaId = `${chunk.id}_f${i + 1}`;

    const { data: existing } = await supabase
      .from('formulas')
      .select('id')
      .eq('chapter_id', chapterId)
      .eq('formula_id', formulaId)
      .single();

    if (existing) continue;

    const { error } = await supabase.from('formulas').insert({
      chapter_id: chapterId,
      topic_id: topicId,
      formula_id: formulaId,
      name: chunk.term,
      formula: formulaList[i],
      description: chunk.definition || null,
    });

    if (error) {
      console.error(`  Formula insert error [${formulaId}]:`, error.message);
    } else {
      inserted++;
    }
  }
  return inserted;
}

/**
 * Insert one example row per chunk (using chunk.id as the stable example_id).
 * Only runs when example_q is present.
 */
async function ensureExample(chapterId, chunk) {
  if (!chunk.example_q) return false;

  const { data: existing } = await supabase
    .from('examples')
    .select('id')
    .eq('chapter_id', chapterId)
    .eq('example_id', chunk.id)
    .single();

  if (existing) return false;

  const { error } = await supabase.from('examples').insert({
    chapter_id: chapterId,
    example_id: chunk.id,
    page_number: null,
    question: chunk.example_q,
    solution: chunk.example_solution || null,
    answer: chunk.example_answer || null,
  });

  if (error) {
    console.error(`  Example insert error [${chunk.id}]:`, error.message);
    return false;
  }
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function upload(jsonFile) {
  if (!fs.existsSync(jsonFile)) {
    console.error('File not found:', jsonFile);
    process.exit(1);
  }

  const chunks = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));

  if (!Array.isArray(chunks) || chunks.length === 0) {
    console.error(
      'Expected a non-empty JSON array of chunks.\n' +
      'This script only handles the flat-array format (chapter1_chunks_final.json).\n' +
      'For the wrapper-object format, use: node scripts/upload-chapter.js'
    );
    process.exit(1);
  }

  const opts = parseArgs();
  const unitNumber = parseInt(opts.unit || String(chunks[0].chapter) || '1', 10);
  const title = opts.title || `Chapter ${unitNumber}`;

  console.log('\n────────────────────────────────────────');
  console.log(` VoiceUstad  |  upload-chunk-chapter`);
  console.log('────────────────────────────────────────');
  console.log(` File   : ${jsonFile}`);
  console.log(` Title  : ${title}  (Unit ${unitNumber})`);
  console.log(` Chunks : ${chunks.length}`);
  console.log('────────────────────────────────────────\n');

  // ── 1. Ensure chapter row ────────────────────────────────────────────────
  const { id: chapterId, created: chapterCreated } = await ensureChapter(
    unitNumber,
    { ...opts, title }
  );
  console.log(
    `chapters  : ${chapterCreated ? '1 inserted' : '1 already existed'}  (id: ${chapterId})`
  );

  // ── 2. Process chunks ────────────────────────────────────────────────────
  const counts  = { topics: 0, concepts: 0, formulas: 0, examples: 0 };
  const skipped = { topics: 0, concepts: 0, examples: 0 };

  for (const chunk of chunks) {
    // Topic row (one per chunk — section + term is the unique key)
    const topicResult = await ensureTopic(chapterId, chunk);
    if (!topicResult) continue; // insert failed, skip this chunk
    topicResult.created ? counts.topics++ : skipped.topics++;
    const topicId = topicResult.id;

    // Concept row — only for "concept" type chunks
    if (chunk.type === 'concept') {
      const ok = await ensureConcept(chapterId, topicId, chunk);
      ok ? counts.concepts++ : skipped.concepts++;
    }

    // Formula rows — for any chunk that has a formula field (concept or formula type)
    if (chunk.formula) {
      counts.formulas += await ensureFormulas(chapterId, topicId, chunk);
    }

    // Example row — for any chunk with a worked example
    if (chunk.example_q) {
      const ok = await ensureExample(chapterId, chunk);
      ok ? counts.examples++ : skipped.examples++;
    }
  }

  // ── 3. Summary ───────────────────────────────────────────────────────────
  console.log('\n── Results ─────────────────────────────');
  console.log(
    `  chapters : ${chapterCreated ? 1 : 0} inserted,  ${chapterCreated ? 0 : 1} already existed`
  );
  console.log(
    `  topics   : ${counts.topics} inserted,  ${skipped.topics} already existed`
  );
  console.log(
    `  concepts : ${counts.concepts} inserted,  ${skipped.concepts} already existed`
  );
  console.log(`  formulas : ${counts.formulas} inserted`);
  console.log(
    `  examples : ${counts.examples} inserted,  ${skipped.examples} already existed`
  );
  console.log('\nDone!\n');
}

const file = process.argv[2];
if (!file) {
  console.log(
    'Usage:\n' +
    '  node scripts/upload-chunk-chapter.js <file.json>\n' +
    '  node scripts/upload-chunk-chapter.js <file.json> \\\n' +
    '    --title "Stoichiometry" --unit 1 --class 11 --board KPK --subject Chemistry\n'
  );
  process.exit(1);
}

upload(file).catch((e) => {
  console.error(e);
  process.exit(1);
});
