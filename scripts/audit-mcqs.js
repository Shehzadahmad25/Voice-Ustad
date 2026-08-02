/**
 * VoiceUstad — MCQ integrity scanner
 * Usage:
 *   node scripts/audit-mcqs.js              # scan mcqs + quiz_questions, print report
 *   node scripts/audit-mcqs.js --json       # machine-readable output
 *   node scripts/audit-mcqs.js --chapter 23 # single chapter (unit number)
 *
 * Read-only. Never writes to the database.
 *
 * Checks per row
 * ──────────────
 *  KEY_NOT_AN_OPTION  the stored correct answer does not resolve to one of the
 *                     four options. For `mcqs` (letter-keyed a/b/c/d) that means
 *                     the letter is out of range or points at an empty column;
 *                     for `quiz_questions` (options[] + correct_index) it means
 *                     the index is out of range. This is the check that catches
 *                     "the correct answer isn't among the 4 options".
 *  EMPTY_OPTION       one of the four options is null/blank.
 *  DUPLICATE_OPTION   two options are textually identical → item is unanswerable.
 *  LETTER_REFERENCE   an option references other options by letter
 *                     ("Both a and b", "All of the above", "none of these").
 *                     Banned: options must be self-contained and spelled out.
 *  LEAKED_LETTER      option text still carries its own letter prefix ("d) all").
 *  ANSWER_CASE        correct_answer letter case is inconsistent across the table
 *                     (a–d vs A–D) — a UI doing `selected === correct` breaks.
 *  DUPLICATE_QUESTION the same question text appears twice in one chapter.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const ONLY_CHAPTER = (() => {
  const i = args.indexOf('--chapter');
  return i >= 0 ? Number(args[i + 1]) : null;
})();

/** Options that point at other options instead of stating an answer. */
const LETTER_REFERENCE = new RegExp(
  [
    /both\s+\(?[a-d]\)?\s*(and|&|,)\s*\(?[a-d]\)?/.source,
    /\ball\s+of\s+(the\s+)?(above|these|them)\b/.source,
    /\bnone\s+of\s+(the\s+)?(above|these|them)\b/.source,
    /\boptions?\s+[a-d]\s+(and|&)\s+[a-d]\b/.source,
    /^\s*\(?[a-d]\)?\s*(and|&)\s*\(?[a-d]\)?\s*$/.source,
    /\bboth\s+of\s+(the\s+)?(above|these)\b/.source,
  ].join('|'),
  'i',
);

/** Option text that still carries its own answer-letter prefix, e.g. "d) all". */
const LEAKED_LETTER = /^\s*\(?[a-dA-D]\)?\s*[).:-]\s+\S/;

const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function scanRow(row) {
  const findings = [];
  const add = (code, detail) => findings.push({ code, detail });

  const options = row._options; // [{ label, text }, ...]
  const keyIdx = row._keyIndex; // resolved index into options, or -1

  if (keyIdx < 0) {
    add('KEY_NOT_AN_OPTION', `correct answer ${JSON.stringify(row._rawKey)} does not resolve to any of the ${options.length} options`);
  } else if (norm(options[keyIdx].text) === '') {
    add('KEY_NOT_AN_OPTION', `correct answer "${row._rawKey}" points at option ${options[keyIdx].label}, which is empty`);
  }

  options.forEach((o) => {
    if (norm(o.text) === '') add('EMPTY_OPTION', `option ${o.label} is blank`);
    if (LETTER_REFERENCE.test(o.text ?? '')) add('LETTER_REFERENCE', `option ${o.label}: "${o.text}"`);
    if (LEAKED_LETTER.test(o.text ?? '')) add('LEAKED_LETTER', `option ${o.label}: "${o.text}"`);
  });

  const seen = new Map();
  options.forEach((o) => {
    const n = norm(o.text);
    if (!n) return;
    if (seen.has(n)) add('DUPLICATE_OPTION', `options ${seen.get(n)} and ${o.label} are identical: "${o.text}"`);
    else seen.set(n, o.label);
  });

  return findings;
}

async function fetchAll(table, select) {
  let out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data);
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  const chapters = await fetchAll('chapters', 'id, unit_number, title');
  const chById = Object.fromEntries(chapters.map((c) => [c.id, c]));
  const chByUnit = Object.fromEntries(chapters.map((c) => [String(c.unit_number), c]));

  const rows = [];

  // ── mcqs: letter-keyed (option_a..option_d + correct_answer 'a'|'b'|'c'|'d')
  for (const m of await fetchAll('mcqs', '*')) {
    const ch = chById[m.chapter_id];
    if (ONLY_CHAPTER && ch?.unit_number !== ONLY_CHAPTER) continue;
    const options = [
      { label: 'A', text: m.option_a },
      { label: 'B', text: m.option_b },
      { label: 'C', text: m.option_c },
      { label: 'D', text: m.option_d },
    ];
    const key = String(m.correct_answer ?? '').trim().toLowerCase();
    rows.push({
      table: 'mcqs',
      id: m.id,
      ref: m.mcq_id,
      question: m.question,
      chapterUnit: ch?.unit_number ?? null,
      chapterTitle: ch?.title ?? `(unknown chapter ${m.chapter_id})`,
      _options: options,
      _rawKey: m.correct_answer,
      _keyIndex: 'abcd'.indexOf(key),
      _keyCase: /^[A-D]$/.test(String(m.correct_answer ?? '')) ? 'upper' : 'lower',
    });
  }

  // ── quiz_questions: array-keyed (options[] + correct_index)
  for (const q of await fetchAll('quiz_questions', '*')) {
    const ch = chByUnit[String(q.chapter_slug)];
    if (ONLY_CHAPTER && ch?.unit_number !== ONLY_CHAPTER) continue;
    let opts = q.options;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = []; } }
    if (!Array.isArray(opts)) opts = [];
    rows.push({
      table: 'quiz_questions',
      id: q.id,
      ref: q.topic_slug ?? q.id,
      question: q.question,
      chapterUnit: ch?.unit_number ?? null,
      chapterTitle: ch?.title ?? `chapter_slug=${q.chapter_slug}`,
      _options: opts.map((t, i) => ({ label: 'ABCD'[i] ?? String(i), text: t })),
      _rawKey: q.correct_index,
      _keyIndex: Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < opts.length ? q.correct_index : -1,
      _keyCase: null,
    });
  }

  // Per-row checks
  const flagged = [];
  for (const r of rows) {
    const findings = scanRow(r);
    if (findings.length) flagged.push({ ...r, findings });
  }

  // Cross-row checks
  const caseCounts = { upper: 0, lower: 0 };
  for (const r of rows) if (r._keyCase) caseCounts[r._keyCase]++;
  const mixedCase = caseCounts.upper > 0 && caseCounts.lower > 0;

  const dupQuestions = [];
  const byQ = new Map();
  for (const r of rows) {
    if (r.table !== 'mcqs') continue;
    const k = `${r.chapterUnit}||${norm(r.question).replace(/[^a-z0-9 ]/g, '')}`;
    if (!byQ.has(k)) byQ.set(k, []);
    byQ.get(k).push(r);
  }
  for (const group of byQ.values()) if (group.length > 1) dupQuestions.push(group);

  if (AS_JSON) {
    console.log(JSON.stringify({ scanned: rows.length, flagged, dupQuestions, caseCounts }, null, 2));
    return;
  }

  // ── Report, grouped by chapter ──────────────────────────────────────────────
  console.log(`\nMCQ INTEGRITY SCAN — ${rows.length} rows (mcqs + quiz_questions)\n${'='.repeat(70)}`);

  const byChapter = new Map();
  for (const f of flagged) {
    const k = f.chapterUnit ?? 0;
    if (!byChapter.has(k)) byChapter.set(k, []);
    byChapter.get(k).push(f);
  }

  for (const unit of [...byChapter.keys()].sort((a, b) => a - b)) {
    const items = byChapter.get(unit);
    console.log(`\n── Unit ${unit}: ${items[0].chapterTitle}  (${items.length} flagged)`);
    for (const it of items) {
      console.log(`   ${it.ref}  [${it.table}] id=${it.id}`);
      console.log(`      Q: ${String(it.question).slice(0, 90)}`);
      for (const f of it.findings) console.log(`      ${f.code}: ${f.detail}`);
    }
  }

  if (dupQuestions.length) {
    console.log(`\n── DUPLICATE_QUESTION (${dupQuestions.length} groups)`);
    for (const g of dupQuestions) {
      console.log(`   Unit ${g[0].chapterUnit}: ${g.map((x) => x.ref).join(' == ')}`);
      console.log(`      ids: ${g.map((x) => x.id).join(', ')}`);
      console.log(`      Q: ${String(g[0].question).slice(0, 90)}`);
    }
  }

  if (mixedCase) {
    console.log(`\n── ANSWER_CASE: mcqs.correct_answer mixes cases — ${caseCounts.lower} lowercase, ${caseCounts.upper} uppercase.`);
    console.log('   Any comparison that is not case-folded will mis-score those rows.');
  }

  const counts = {};
  for (const f of flagged) for (const x of f.findings) counts[x.code] = (counts[x.code] || 0) + 1;
  console.log(`\n${'='.repeat(70)}\nSUMMARY`);
  console.log(`  rows scanned      : ${rows.length}`);
  console.log(`  rows flagged      : ${flagged.length}`);
  for (const [code, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(18)}: ${n}`);
  }
  console.log(`  DUPLICATE_QUESTION: ${dupQuestions.length} groups`);
  console.log('\nNOTE: this scanner proves structural integrity only. It cannot tell you');
  console.log('whether a well-formed answer key is factually right — that needs review.');

  // Non-zero exit so CI can gate on it.
  if (flagged.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
