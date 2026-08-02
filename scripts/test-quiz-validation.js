/**
 * Tests for lib/quizValidation.ts — the gate that stops bad MCQs reaching
 * students. Cases 1-4 are the exact defects reported from production.
 *
 * Usage: node scripts/test-quiz-validation.js
 */

require('ts-node/register/transpile-only');
const path = require('path');

let mod;
try {
  mod = require(path.join(__dirname, '..', 'lib', 'quizValidation.ts'));
} catch {
  console.error('Could not load lib/quizValidation.ts — is ts-node installed?');
  console.error('Run: npm i -D ts-node');
  process.exit(1);
}
const { validateQuestions, LETTER_REFERENCE, normOpt } = mod;

const chunk = (id, term, section, slug) => ({
  id, term, section, topic_slug: slug,
  book_definition: 'x', guide_explanation: null, formula: null,
  example_q: null, example_solution: null, example_answer: null,
});

const CHUNKS = new Map([
  ['c1', chunk('c1', "Rutherford's Model", '2.1.3', 'rutherford-model')],
  ['c2', chunk('c2', 'Percentage Composition', '1.4', 'percentage-composition')],
]);

const q = (over = {}) => ({
  source_id: 'c1',
  working: 'because',
  answer_text: 'Nine',
  question: 'How many atoms?',
  options: { A: 'Seven', B: 'Nine', C: 'Eight', D: 'Ten' },
  correct_answer: 'B',
  ...over,
});

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n1. Correct answer must be verbatim among the options');
{
  // The reported Stoichiometry bug: answer is 9, no option says 9.
  const { kept, rejected } = validateQuestions([
    q({ answer_text: '9', options: { A: '6', B: '7', C: '8', D: '10' } }),
  ], CHUNKS);
  check('answer absent from options is dropped', kept.length === 0 && rejected.answer_not_among_options === 1,
    JSON.stringify(rejected));
}
{
  const { kept } = validateQuestions([q()], CHUNKS);
  check('answer present is kept', kept.length === 1);
}
{
  // Model printed the right text but the wrong letter — repair, do not drop.
  const { kept } = validateQuestions([q({ correct_answer: 'D' })], CHUNKS);
  check('mis-stated letter is repaired from the text', kept.length === 1 && kept[0].correct_answer === 'B',
    kept[0] && kept[0].correct_answer);
}
{
  // Whitespace/trailing-punctuation differences should still match.
  const { kept } = validateQuestions([
    q({ answer_text: '  nine.', options: { A: 'Seven', B: 'Nine', C: 'Eight', D: 'Ten' } }),
  ], CHUNKS);
  check('normalisation tolerates case/space/trailing punctuation', kept.length === 1);
}

console.log('\n2. Letter-referencing options are banned');
{
  const variants = [
    'Both A and B', 'both a and b', 'Both (a) and (c)', 'All of the above',
    'all of these', 'None of these', 'none of the above', 'Options A and C',
    'A and B', 'a & c',
  ];
  let allCaught = true;
  for (const v of variants) {
    const { kept, rejected } = validateQuestions([
      q({ options: { A: 'Seven', B: 'Nine', C: 'Eight', D: v } }),
    ], CHUNKS);
    if (kept.length !== 0 || rejected.letter_reference !== 1) { allCaught = false; console.log(`        missed: "${v}"`); }
  }
  check('every letter-reference phrasing is rejected', allCaught);
}
{
  // The spelled-out combined answer we WANT must survive.
  const { kept } = validateQuestions([
    q({ answer_text: 'Molality and mole fraction',
        options: { A: 'Molarity', B: 'Normality', C: 'Molality and mole fraction', D: 'Molarity and normality' } }),
  ], CHUNKS);
  check('spelled-out combined answer is allowed', kept.length === 1 && kept[0].correct_answer === 'C');
}
{
  // Legitimate prose that merely contains "all of" must not trip the regex.
  const safe = ['Sum of all of the bond energies', 'Above the melting point', 'None remains after boiling'];
  const tripped = safe.filter(s => LETTER_REFERENCE.test(s));
  check('no false positives on ordinary prose', tripped.length === 0, tripped.join(' | '));
}

console.log('\n3. Structural integrity');
{
  const { kept, rejected } = validateQuestions([
    q({ options: { A: 'Nine', B: 'Nine', C: 'Eight', D: 'Ten' } }),
  ], CHUNKS);
  check('duplicate options rejected', kept.length === 0 && rejected.duplicate_option === 1);
}
{
  const { kept, rejected } = validateQuestions([
    q({ options: { A: 'Nine', B: '', C: 'Eight', D: 'Ten' } }),
  ], CHUNKS);
  check('empty option rejected', kept.length === 0 && rejected.empty_option === 1);
}
{
  const { kept, rejected } = validateQuestions([q({ options: undefined }), q({ question: undefined })], CHUNKS);
  check('malformed rows rejected', kept.length === 0 && rejected.malformed === 2);
}
{
  const { kept, rejected } = validateQuestions([q({ answer_text: undefined })], CHUNKS);
  check('missing answer_text rejected', kept.length === 0 && rejected.no_answer_text === 1);
}

console.log('\n4. Subtopic is stamped from our chunk, never the model');
{
  const { kept } = validateQuestions([
    q({ topic_name: 'Chemistry — General', topic_slug: 'garbage', topic_section: '99' }),
  ], CHUNKS);
  const k = kept[0];
  check('model-supplied topic fields are overwritten',
    k.topic_name === "Rutherford's Model" && k.topic_slug === 'rutherford-model' && k.topic_section === '2.1.3',
    JSON.stringify({ n: k && k.topic_name, s: k && k.topic_slug }));
}
{
  const { kept, rejected } = validateQuestions([q({ source_id: 'does-not-exist' })], CHUNKS);
  check('unknown source_id rejected', kept.length === 0 && rejected.unknown_source_id === 1);
}
{
  const { kept } = validateQuestions([q({ source_id: 'c2' })], CHUNKS);
  check('second chunk maps to its own subtopic',
    kept[0].topic_name === 'Percentage Composition' && kept[0].topic_section === '1.4');
}

console.log('\n5. Scratch fields never leak to the client');
{
  const { kept } = validateQuestions([q()], CHUNKS);
  const k = kept[0];
  check('working/answer_text/source_id stripped',
    !('working' in k) && !('answer_text' in k) && !('source_id' in k), Object.keys(k).join(','));
}

console.log('\n6. Mixed batch — good survive, bad are counted');
{
  const { kept, rejected } = validateQuestions([
    q(),                                                              // good
    q({ answer_text: 'Twelve' }),                                     // not among options
    q({ options: { A: 'x', B: 'y', C: 'z', D: 'Both A and B' } }),     // letter ref
    q({ source_id: 'c2', answer_text: 'Nine' }),                      // good, other chunk
    q({ source_id: 'nope' }),                                         // unknown chunk
  ], CHUNKS);
  check('2 kept of 5', kept.length === 2, `kept=${kept.length}`);
  check('rejection reasons tallied', rejected.answer_not_among_options === 1
    && rejected.letter_reference === 1 && rejected.unknown_source_id === 1, JSON.stringify(rejected));
}

console.log(`\n${'='.repeat(50)}\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
