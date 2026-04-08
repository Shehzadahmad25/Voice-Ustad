/**
 * test-answer-format.js
 * ─────────────────────
 * Validates that normalizeStructuredAnswer and repairStructuredAnswer
 * always produce the correct output order:
 *   definition → explanation → example → formula (optional)
 *
 * Run: node scripts/test-answer-format.js
 */

'use strict';

// ── Inline copies of the backend helpers (no TypeScript compilation needed) ──

function normalizeStructuredAnswer(data) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const legacyDef = str(data?.text);
  const legacyExp = Array.isArray(data?.points)
    ? data.points.map((p) => String(p).trim()).filter(Boolean).join(' ')
    : '';
  return {
    definition:  str(data?.definition)  || legacyDef,
    explanation: str(data?.explanation) || legacyExp,
    example:     str(data?.example)     || '',
    formula:     str(data?.formula)     || '',
    flabel:      str(data?.flabel)      || '',
    dur:         Number.isFinite(Number(data?.dur)) ? Number(data.dur) : 30,
    urduTtsText: str(data?.urduTtsText),
  };
}

function repairStructuredAnswer(ans) {
  if (!ans.definition && !ans.explanation && !ans.example) {
    return { ...ans, definition: 'Answer not available for this topic.' };
  }
  return ans;
}

// ── Assert helper ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function runTest(name, fn) {
  console.log(`\n[TEST] ${name}`);
  fn();
}

// ── Tests ────────────────────────────────────────────────────────────────────

runTest('Output always has required keys in correct order', () => {
  const result = normalizeStructuredAnswer({
    definition: 'A mole is 6.022×10²³ particles.',
    explanation: 'It is the SI unit for amount of substance.',
    example: 'One mole of water contains 6.022×10²³ molecules.',
    formula: 'n = m / M',
    flabel: 'MOLE CALCULATION',
  });

  const keys = Object.keys(result);
  const contentKeys = ['definition', 'explanation', 'example', 'formula', 'flabel'];
  contentKeys.forEach(k => assert(keys.includes(k), `Has key: ${k}`));

  // Verify order: definition before explanation before example
  assert(keys.indexOf('definition') < keys.indexOf('explanation'), 'definition comes before explanation');
  assert(keys.indexOf('explanation') < keys.indexOf('example'), 'explanation comes before example');
  assert(keys.indexOf('example') < keys.indexOf('formula'), 'example comes before formula');
});

runTest('Question: "What is mole?" — definition must not be empty', () => {
  const aiResponse = {
    definition: 'A mole is the amount of substance containing 6.022×10²³ particles.',
    explanation: 'It allows chemists to count atoms by weighing them.',
    example: 'One mole of NaCl weighs 58.5 grams.',
    formula: '',
    flabel: '',
    dur: 30,
  };
  const result = repairStructuredAnswer(normalizeStructuredAnswer(aiResponse));
  assert(result.definition !== '', 'definition is non-empty');
  assert(result.explanation !== '', 'explanation is non-empty');
  assert(result.example !== '', 'example is non-empty');
  assert(result.formula === '', 'formula is empty (not relevant)');
});

runTest('Question: "Define atomic mass." — definition filled', () => {
  const aiResponse = {
    definition: 'Atomic mass is the average mass of an atom measured in atomic mass units (amu).',
    explanation: 'It accounts for the natural isotopic distribution of an element.',
    example: 'The atomic mass of carbon is 12.011 amu.',
  };
  const result = repairStructuredAnswer(normalizeStructuredAnswer(aiResponse));
  assert(result.definition.length > 0, 'definition is present');
  assert(result.explanation.length > 0, 'explanation is present');
  assert(result.example.length > 0, 'example is present');
});

runTest('Question: "Explain empirical formula with example." — example filled', () => {
  const aiResponse = {
    definition: 'An empirical formula shows the simplest whole-number ratio of atoms in a compound.',
    explanation: 'It is derived by dividing the subscripts of the molecular formula by their GCD.',
    example: 'Glucose (C₆H₁₂O₆) has the empirical formula CH₂O.',
  };
  const result = repairStructuredAnswer(normalizeStructuredAnswer(aiResponse));
  assert(result.example.includes('CH₂O') || result.example.length > 0, 'example is present');
  assert(result.definition !== '', 'definition is present');
});

runTest("Question: \"What is Avogadro's number?\" — all three fields filled", () => {
  const aiResponse = {
    definition: "Avogadro's number (Nₐ) is 6.022×10²³, the number of entities in one mole.",
    explanation: 'It links the microscopic world of atoms to macroscopic laboratory measurements.',
    example: "One mole of CO₂ contains 6.022×10²³ molecules.",
    formula: 'Nₐ = 6.022×10²³ mol⁻¹',
    flabel: "AVOGADRO'S NUMBER",
  };
  const result = repairStructuredAnswer(normalizeStructuredAnswer(aiResponse));
  assert(result.definition !== '', 'definition present');
  assert(result.explanation !== '', 'explanation present');
  assert(result.example !== '', 'example present');
  assert(result.formula !== '', 'formula present for Avogadro question');
  assert(result.flabel !== '', 'flabel present');
});

runTest('Question: "Write the formula of molarity." — formula field filled', () => {
  const aiResponse = {
    definition: 'Molarity is the number of moles of solute per litre of solution.',
    explanation: 'It is the most common unit of concentration used in chemistry.',
    example: 'Dissolving 1 mole of NaCl in 1 L of water gives 1 M solution.',
    formula: 'M = n / V',
    flabel: 'MOLARITY FORMULA',
  };
  const result = repairStructuredAnswer(normalizeStructuredAnswer(aiResponse));
  assert(result.formula === 'M = n / V', 'formula is correct');
  assert(result.flabel === 'MOLARITY FORMULA', 'flabel is correct');
});

runTest('Legacy format (text/points) is mapped to structured fields', () => {
  const legacyResponse = {
    text: 'A mole is a counting unit used in chemistry.',
    points: ['Contains 6.022×10²³ entities', 'Used to relate mass to number of particles'],
    formula: '',
  };
  const result = normalizeStructuredAnswer(legacyResponse);
  assert(result.definition === 'A mole is a counting unit used in chemistry.', 'text → definition');
  assert(result.explanation.includes('6.022'), 'points → explanation');
  assert(result.example === '', 'example is empty (no example in legacy)');
});

runTest('repairStructuredAnswer fills empty-all-fields case', () => {
  const empty = normalizeStructuredAnswer({ formula: 'H₂O' });
  const repaired = repairStructuredAnswer(empty);
  assert(repaired.definition !== '', 'definition filled after repair');
});

runTest('Formula hidden when not relevant', () => {
  const noFormula = repairStructuredAnswer(normalizeStructuredAnswer({
    definition: 'The mole is a base SI unit.',
    explanation: 'It represents amount of substance.',
    example: '1 mole of O₂ = 32g.',
  }));
  assert(noFormula.formula === '', 'formula is empty string (not undefined, not null)');
  // Frontend hides formula block when formula === ''
  const frontendHides = !noFormula.formula;
  assert(frontendHides, 'frontend would hide formula section');
});

runTest('Fields must be strings, not arrays or objects', () => {
  const result = normalizeStructuredAnswer({
    definition: 'A mole represents 6.022×10²³ particles.',
    explanation: 'It bridges atomic and macroscopic scales.',
    example: '1 mol of He = 4 g.',
  });
  ['definition', 'explanation', 'example', 'formula', 'flabel', 'urduTtsText'].forEach(k => {
    assert(typeof result[k] === 'string', `${k} is a string`);
  });
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
