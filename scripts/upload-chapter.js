/**
 * VoiceUstad - Upload Chapter to Supabase
 * Usage: node scripts/upload-chapter.js content/chapters/chapter1_stoichiometry.json
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Safe per-row upsert: finds existing row by matchCols, updates it if found,
 * inserts if not found.  No bulk delete — existing rows not in the JSON are left
 * untouched.  Used by --update mode.
 *
 * Returns 'updated' | 'inserted' | 'error'
 */
async function safeUpsertRow(table, row, matchCols) {
  let q = supabase.from(table).select('id').limit(1);
  for (const col of matchCols) q = q.eq(col, row[col]);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    const { error } = await supabase.from(table).update(row).eq('id', existing.id);
    return error ? 'error' : 'updated';
  } else {
    const { error } = await supabase.from(table).insert(row);
    return error ? 'error' : 'inserted';
  }
}

async function upload(jsonFile, updateMode = false) {
  if (!fs.existsSync(jsonFile)) { console.error('File not found:', jsonFile); process.exit(1); }

  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
  const modeLabel = updateMode ? '[UPDATE mode — no delete, per-row upsert]' : '[FULL mode — delete + reinsert]';
  console.log(`\n${modeLabel}`);
  console.log(`Uploading: ${data.chapter.title} (Unit ${data.chapter.unit_number})\n`);

  // 1. Upsert chapter
  const { data: ch, error: chErr } = await supabase.from('chapters').upsert({
    unit_number: data.chapter.unit_number,
    title: data.chapter.title,
    subject: data.chapter.subject || 'Chemistry',
    class: data.chapter.class || 11,
    board: data.chapter.board || 'KPK',
    book_pages: data.chapter.book_pages,
    pdf_pages: data.chapter.pdf_pages,
    teaching_periods: data.chapter.teaching_periods,
    assessment: data.chapter.assessment,
    weightage_percent: data.chapter.weightage_percent,
  }, { onConflict: 'subject,class,board,unit_number' }).select().single();
  if (chErr) { console.error('Chapter error:', chErr.message); process.exit(1); }
  const cid = ch.id;
  console.log('Chapter ID:', cid);

  if (updateMode) {
    // ── UPDATE MODE: per-row fetch → update/insert, no deletes ──────────────

    // 2u. Learning objectives
    let loUpdated = 0, loInserted = 0;
    for (const o of (data.learning_objectives || [])) {
      const row = { chapter_id: cid, objective_id: o.id, text: o.text, bloom_level: o.bloom_level };
      const r = await safeUpsertRow('learning_objectives', row, ['chapter_id', 'objective_id']);
      if (r === 'updated') loUpdated++; else if (r === 'inserted') loInserted++;
    }
    if (loUpdated + loInserted) console.log(`  learning_objectives: ${loUpdated} updated, ${loInserted} inserted`);

    // 3u. Key points — no stable ID, always replace
    await supabase.from('key_points').delete().eq('chapter_id', cid);
    if (data.key_points?.length) {
      const { error } = await supabase.from('key_points').insert(
        data.key_points.map((p, i) => ({ chapter_id: cid, point_number: i + 1, text: p }))
      );
      if (error) console.error('  key_points error:', error.message);
      else console.log('  key_points:', data.key_points.length, '(replaced)');
    }

    // 4u. Topics + concepts + formulas
    let tU=0, tI=0, cU=0, cI=0, fU=0, fI=0;
    for (const topic of (data.topics || [])) {
      const topicContent = topic.explanation || topic.content || null;
      const topicRow = { chapter_id: cid, section: topic.section, title: topic.title, content: topicContent };
      const tr = await safeUpsertRow('topics', topicRow, ['chapter_id', 'section']);
      if (tr === 'updated') tU++; else if (tr === 'inserted') tI++;

      // fetch topic id for child rows
      const { data: td } = await supabase.from('topics').select('id').eq('chapter_id', cid).eq('section', topic.section).single();
      const tid = td?.id;

      for (const c of (topic.concepts || [])) {
        const r = await safeUpsertRow('concepts', { chapter_id: cid, topic_id: tid, term: c.term, definition: c.definition }, ['chapter_id', 'term']);
        if (r === 'updated') cU++; else if (r === 'inserted') cI++;
      }
      for (const f of (topic.formulas || [])) {
        const r = await safeUpsertRow('formulas', { chapter_id: cid, topic_id: tid, formula_id: f.id, name: f.name, formula: f.formula, description: f.description || null }, ['chapter_id', 'formula_id']);
        if (r === 'updated') fU++; else if (r === 'inserted') fI++;
      }
      for (const sub of (topic.subsections || [])) {
        const subContent = sub.explanation || sub.content || sub.description || null;
        const sr = await safeUpsertRow('topics', { chapter_id: cid, section: sub.section, title: sub.title, content: subContent }, ['chapter_id', 'section']);
        if (sr === 'updated') tU++; else if (sr === 'inserted') tI++;
        const { data: sd } = await supabase.from('topics').select('id').eq('chapter_id', cid).eq('section', sub.section).single();
        for (const f of (sub.formulas || [])) {
          const r = await safeUpsertRow('formulas', { chapter_id: cid, topic_id: sd?.id, formula_id: f.id, name: f.name, formula: f.formula, description: f.description || null }, ['chapter_id', 'formula_id']);
          if (r === 'updated') fU++; else if (r === 'inserted') fI++;
        }
      }
    }
    console.log(`  topics: ${tU} updated, ${tI} inserted`);
    console.log(`  concepts: ${cU} updated, ${cI} inserted`);
    console.log(`  formulas: ${fU} updated, ${fI} inserted`);

    // 5u. Examples
    let eU=0, eI=0;
    for (const e of (data.examples || [])) {
      const r = await safeUpsertRow('examples', { chapter_id: cid, example_id: e.id, page_number: e.page, question: e.question, solution: e.solution, answer: e.answer || null }, ['chapter_id', 'example_id']);
      if (r === 'updated') eU++; else if (r === 'inserted') eI++;
    }
    if (eU + eI) console.log(`  examples: ${eU} updated, ${eI} inserted`);

    // 6u. Practice problems
    let ppU=0, ppI=0;
    for (const p of (data.practice_problems || [])) {
      const r = await safeUpsertRow('practice_problems', { chapter_id: cid, problem_id: p.id, page_number: p.page, question: p.question, answer: p.answer || null, topic_section: p.topic || null }, ['chapter_id', 'problem_id']);
      if (r === 'updated') ppU++; else if (r === 'inserted') ppI++;
    }
    if (ppU + ppI) console.log(`  practice_problems: ${ppU} updated, ${ppI} inserted`);

    // 7u. MCQs
    let mU=0, mI=0;
    for (const m of (data.exercise?.mcqs || [])) {
      const r = await safeUpsertRow('mcqs', { chapter_id: cid, mcq_id: m.id, question: m.question, option_a: m.options[0], option_b: m.options[1], option_c: m.options[2], option_d: m.options[3], correct_answer: m.answer }, ['chapter_id', 'mcq_id']);
      if (r === 'updated') mU++; else if (r === 'inserted') mI++;
    }
    if (mU + mI) console.log(`  mcqs: ${mU} updated, ${mI} inserted`);

    // 8u. Short / Numerical / Descriptive questions
    for (const [key, table] of [['short_questions','short_questions'],['numerical_questions','numerical_questions'],['descriptive_questions','descriptive_questions']]) {
      let qU=0, qI=0;
      for (const q of (data.exercise?.[key] || [])) {
        const r = await safeUpsertRow(table, { chapter_id: cid, question_id: q.id, question: q.question, answer: q.answer || null }, ['chapter_id', 'question_id']);
        if (r === 'updated') qU++; else if (r === 'inserted') qI++;
      }
      if (qU + qI) console.log(`  ${table}: ${qU} updated, ${qI} inserted`);
    }

  } else {
    // ── FULL MODE: delete chapter child rows, then reinsert ─────────────────

    // 2. Clear old data
    for (const t of ['learning_objectives','key_points','concepts','formulas','examples','practice_problems','mcqs','short_questions','numerical_questions','descriptive_questions','topics']) {
      await supabase.from(t).delete().eq('chapter_id', cid);
    }

    // 3. Learning objectives
    if (data.learning_objectives?.length) {
      const { error } = await supabase.from('learning_objectives').insert(
        data.learning_objectives.map(o => ({ chapter_id: cid, objective_id: o.id, text: o.text, bloom_level: o.bloom_level }))
      );
      if (error) console.error('  objectives error:', error.message);
      else console.log('  objectives:', data.learning_objectives.length);
    }

    // 4. Key points
    if (data.key_points?.length) {
      const { error } = await supabase.from('key_points').insert(
        data.key_points.map((p, i) => ({ chapter_id: cid, point_number: i + 1, text: p }))
      );
      if (error) console.error('  key_points error:', error.message);
      else console.log('  key_points:', data.key_points.length);
    }

    // 5. Topics + concepts + formulas
    let conceptCount = 0, formulaCount = 0;
    for (const topic of (data.topics || [])) {
      const topicContent = topic.explanation || topic.content || null;
      const { data: td, error: te } = await supabase.from('topics').insert({
        chapter_id: cid, section: topic.section, title: topic.title, content: topicContent
      }).select().single();
      if (te) { console.error('  topic error:', te.message); continue; }

      if (topic.concepts?.length) {
        const { error } = await supabase.from('concepts').insert(
          topic.concepts.map(c => ({ chapter_id: cid, topic_id: td.id, term: c.term, definition: c.definition }))
        );
        if (!error) conceptCount += topic.concepts.length;
      }
      if (topic.formulas?.length) {
        const { error } = await supabase.from('formulas').insert(
          topic.formulas.map(f => ({ chapter_id: cid, topic_id: td.id, formula_id: f.id, name: f.name, formula: f.formula, description: f.description || null }))
        );
        if (!error) formulaCount += topic.formulas.length;
      }
      for (const sub of (topic.subsections || [])) {
        const subContent = sub.explanation || sub.content || sub.description || null;
        const { data: sd } = await supabase.from('topics').insert({
          chapter_id: cid, section: sub.section, title: sub.title, content: subContent
        }).select().single();
        if (sd && sub.formulas?.length) {
          const { error } = await supabase.from('formulas').insert(
            sub.formulas.map(f => ({ chapter_id: cid, topic_id: sd.id, formula_id: f.id, name: f.name, formula: f.formula, description: f.description || null }))
          );
          if (!error) formulaCount += sub.formulas.length;
        }
      }
    }
    console.log('  concepts:', conceptCount, '  formulas:', formulaCount);

    // 6. Examples
    if (data.examples?.length) {
      const { error } = await supabase.from('examples').insert(
        data.examples.map(e => ({ chapter_id: cid, example_id: e.id, page_number: e.page, question: e.question, solution: e.solution, answer: e.answer || null }))
      );
      if (error) console.error('  examples error:', error.message);
      else console.log('  examples:', data.examples.length);
    }

    // 7. Practice problems
    if (data.practice_problems?.length) {
      const { error } = await supabase.from('practice_problems').insert(
        data.practice_problems.map(p => ({ chapter_id: cid, problem_id: p.id, page_number: p.page, question: p.question, answer: p.answer || null, topic_section: p.topic || null }))
      );
      if (error) console.error('  practice_problems error:', error.message);
      else console.log('  practice_problems:', data.practice_problems.length);
    }

    // 8. MCQs
    if (data.exercise?.mcqs?.length) {
      const { error } = await supabase.from('mcqs').insert(
        data.exercise.mcqs.map(m => ({ chapter_id: cid, mcq_id: m.id, question: m.question, option_a: m.options[0], option_b: m.options[1], option_c: m.options[2], option_d: m.options[3], correct_answer: m.answer }))
      );
      if (error) console.error('  mcqs error:', error.message);
      else console.log('  mcqs:', data.exercise.mcqs.length);
    }

    // 9. Short questions
    if (data.exercise?.short_questions?.length) {
      const { error } = await supabase.from('short_questions').insert(
        data.exercise.short_questions.map(q => ({ chapter_id: cid, question_id: q.id, question: q.question, answer: q.answer || null }))
      );
      if (error) console.error('  short_questions error:', error.message);
      else console.log('  short_questions:', data.exercise.short_questions.length);
    }

    // 10. Numerical questions
    if (data.exercise?.numerical_questions?.length) {
      const { error } = await supabase.from('numerical_questions').insert(
        data.exercise.numerical_questions.map(q => ({ chapter_id: cid, question_id: q.id, question: q.question, answer: q.answer || null }))
      );
      if (error) console.error('  numerical_questions error:', error.message);
      else console.log('  numerical_questions:', data.exercise.numerical_questions.length);
    }

    // 11. Descriptive questions
    if (data.exercise?.descriptive_questions?.length) {
      const { error } = await supabase.from('descriptive_questions').insert(
        data.exercise.descriptive_questions.map(q => ({ chapter_id: cid, question_id: q.id, question: q.question, answer: q.answer || null }))
      );
      if (error) console.error('  descriptive_questions error:', error.message);
      else console.log('  descriptive_questions:', data.exercise.descriptive_questions.length);
    }
  }

  console.log('\nDone! Chapter uploaded successfully.');
}

const file = process.argv[2];
const updateMode = process.argv.includes('--update');
if (!file) {
  console.log('Usage:');
  console.log('  Full replace : node scripts/upload-chapter.js content/chapters/chapter1_stoichiometry.json');
  console.log('  Safe update  : node scripts/upload-chapter.js content/chapters/chapter1_stoichiometry.json --update');
  process.exit(1);
}
upload(file, updateMode).catch(e => { console.error(e); process.exit(1); });
