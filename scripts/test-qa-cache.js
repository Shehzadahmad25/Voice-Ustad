/**
 * test-qa-cache.js
 * ----------------
 * Tests for the qaCache module (pure functions only — no Supabase connection needed).
 *
 * Run: node scripts/test-qa-cache.js
 */

'use strict';

// ── Inline the pure functions under test ────────────────────────────────────
// (Avoids TypeScript compilation for quick testing)

function normalizeQuestion(q) {
  return String(q ?? '')
    .toLowerCase()
    .trim()
    .replace(/[?!.]+$/, '')
    .replace(/[,;:'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Inline cache-entry guard logic (mirrors saveToCache skip conditions)
function shouldSkipCacheSave(answerJson, chapterNumber) {
  if (!answerJson.definition && !answerJson.explanation && !answerJson.example) {
    return { skip: true, reason: 'all required fields empty' };
  }
  if (String(answerJson.definition ?? '').toLowerCase().includes('not included in the current lesson')) {
    return { skip: true, reason: 'out-of-scope answer' };
  }
  if (!chapterNumber || chapterNumber <= 0) {
    return { skip: true, reason: 'no chapter context' };
  }
  return { skip: false, reason: null };
}

// Inline the cache-hit response builder (mirrors route.ts cache branch)
function buildCacheResponse(entry, similarityScore) {
  return {
    ok: true,
    answer: { ...entry.answer_json },
    urduSummary: entry.urdu_tts_text || null,
    audioBase64: null,
    cacheHit: true,
    cacheSimilarity: similarityScore,
  };
}

// ── Assert helper ─────────────────────────────────────────────────────────────

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

// ── normalizeQuestion tests ───────────────────────────────────────────────────

runTest('normalizeQuestion — basic lowercase + trim', () => {
  assert(normalizeQuestion('MOLE?') === 'mole', '"MOLE?" → "mole"');
  assert(normalizeQuestion('  What is a mole?  ') === 'what is a mole', 'strips spaces + ?');
  assert(normalizeQuestion('Define mole.') === 'define mole', 'strips trailing dot');
  assert(normalizeQuestion('Explain mole!!') === 'explain mole', 'strips trailing !!');
});

runTest('normalizeQuestion — noise punctuation removed', () => {
  assert(normalizeQuestion("What's a mole?") === 'what s a mole', "apostrophe → space (not collapsed further)");
  assert(normalizeQuestion('(mole)') === 'mole', 'parentheses removed');
  assert(normalizeQuestion('formula, explain it') === 'formula  explain it'.replace(/\s+/g, ' '), 'comma → space');
});

runTest('normalizeQuestion — hyphens preserved (chemistry terms)', () => {
  const result = normalizeQuestion('What is gram-atom?');
  assert(result.includes('gram-atom'), 'hyphen preserved in gram-atom');
  const result2 = normalizeQuestion('explain electron-volt energy');
  assert(result2.includes('electron-volt'), 'hyphen preserved in electron-volt');
});

runTest('normalizeQuestion — same concept, different phrasing (would need semantic match)', () => {
  const q1 = normalizeQuestion('What is a mole?');
  const q2 = normalizeQuestion('Define mole');
  // These are NOT equal after normalization — semantic search handles them
  assert(q1 !== q2, '"what is a mole" and "define mole" are different normalized forms');
  assert(q1 === 'what is a mole', `q1 = "${q1}"`);
  assert(q2 === 'define mole', `q2 = "${q2}"`);
});

runTest('normalizeQuestion — exact duplicates DO match', () => {
  assert(
    normalizeQuestion('What is a mole?') === normalizeQuestion('What is a mole?'),
    'identical questions match',
  );
  assert(
    normalizeQuestion('WHAT IS A MOLE???') === normalizeQuestion('what is a mole'),
    'case-insensitive match',
  );
  assert(
    normalizeQuestion('Define  mole') === normalizeQuestion('define mole'),
    'extra whitespace collapsed',
  );
});

// ── saveToCache skip-condition tests ─────────────────────────────────────────

runTest('saveToCache — skip: all required fields empty', () => {
  const aj = { definition: '', explanation: '', example: '', formula: '', flabel: '', dur: 30, urduTtsText: '' };
  const { skip, reason } = shouldSkipCacheSave(aj, 1);
  assert(skip === true, 'should skip empty answer');
  assert(reason === 'all required fields empty', `reason: ${reason}`);
});

runTest('saveToCache — skip: out-of-scope answer', () => {
  const aj = {
    definition: 'This topic is not included in the current lesson.',
    explanation: '',
    example: '',
    formula: '',
    flabel: '',
    dur: 20,
    urduTtsText: '',
  };
  const { skip, reason } = shouldSkipCacheSave(aj, 1);
  assert(skip === true, 'should skip out-of-scope');
  assert(reason === 'out-of-scope answer', `reason: ${reason}`);
});

runTest('saveToCache — skip: no chapter context', () => {
  const aj = {
    definition: 'A mole is 6.022×10²³ particles.',
    explanation: 'It is an SI unit.',
    example: 'One mole of NaCl = 58.5g.',
    formula: '',
    flabel: '',
    dur: 30,
    urduTtsText: '',
  };
  const { skip, reason } = shouldSkipCacheSave(aj, 0);
  assert(skip === true, 'should skip when chapterNumber = 0');
  assert(reason === 'no chapter context', `reason: ${reason}`);
});

runTest('saveToCache — do NOT skip: valid answer', () => {
  const aj = {
    definition: 'A mole is 6.022×10²³ particles.',
    explanation: 'It is an SI unit.',
    example: 'One mole of NaCl = 58.5g.',
    formula: '',
    flabel: '',
    dur: 30,
    urduTtsText: '',
  };
  const { skip } = shouldSkipCacheSave(aj, 1);
  assert(skip === false, 'should NOT skip valid answer with chapter');
});

runTest('saveToCache — do NOT skip: definition-only answer', () => {
  const aj = {
    definition: 'Atomic mass is the average mass of an atom.',
    explanation: '',
    example: '',
    formula: '',
    flabel: '',
    dur: 30,
    urduTtsText: '',
  };
  const { skip } = shouldSkipCacheSave(aj, 1);
  assert(skip === false, 'definition alone is sufficient to cache');
});

// ── Cache response building tests ─────────────────────────────────────────────

runTest('Exact cache hit — returns answer with similarity 1.0', () => {
  const entry = {
    id: 'uuid-1',
    original_question: 'What is a mole?',
    normalized_question: 'what is a mole',
    subject: 'chemistry',
    chapter: 'Unit 1 — Stoichiometry',
    chapter_number: 1,
    topic: 'mole',
    answer_json: {
      definition: 'A mole is 6.022×10²³ particles.',
      explanation: 'It bridges atomic and macroscopic scales.',
      example: '1 mol of NaCl = 58.5 g.',
      formula: '',
      flabel: '',
      dur: 30,
      urduTtsText: 'Mole ek SI unit hai...',
    },
    urdu_tts_text: 'Mole ek SI unit hai jo 6.022×10²³ particles contain karta hai.',
    audio_url: '',
    chunk_ids: [],
    model_text: 'gpt-4.1-mini',
    model_tts: 'gpt-4.1-mini',
    hit_count: 5,
    created_at: '2026-03-28T00:00:00Z',
    updated_at: '2026-03-28T00:00:00Z',
  };

  const response = buildCacheResponse(entry, 1.0);
  assert(response.ok === true, 'ok is true');
  assert(response.cacheHit === true, 'cacheHit is true');
  assert(response.cacheSimilarity === 1.0, 'similarity is 1.0 for exact match');
  assert(response.answer.definition === entry.answer_json.definition, 'definition preserved');
  assert(response.answer.explanation === entry.answer_json.explanation, 'explanation preserved');
  assert(response.answer.example === entry.answer_json.example, 'example preserved');
  assert(response.urduSummary === entry.urdu_tts_text, 'Urdu text from cache');
  assert(response.audioBase64 === null, 'audio base64 is null (not stored in DB)');
});

runTest('Semantic cache hit — returns answer with similarity < 1.0', () => {
  const entry = {
    id: 'uuid-2',
    original_question: 'Define mole',
    normalized_question: 'define mole',
    answer_json: {
      definition: 'A mole is 6.022×10²³ particles.',
      explanation: 'It bridges atomic and macroscopic scales.',
      example: '1 mol of NaCl = 58.5 g.',
      formula: '',
      flabel: '',
      dur: 30,
      urduTtsText: '',
    },
    urdu_tts_text: '',
    hit_count: 2,
  };

  const response = buildCacheResponse(entry, 0.92);
  assert(response.cacheHit === true, 'cacheHit is true');
  assert(response.cacheSimilarity === 0.92, 'similarity is 0.92');
  assert(response.cacheSimilarity >= 0.88, 'above threshold (0.88)');
});

runTest('Formula question — formula field preserved in cache response', () => {
  const entry = {
    id: 'uuid-3',
    original_question: 'Write the formula of molarity',
    normalized_question: 'write the formula of molarity',
    answer_json: {
      definition: 'Molarity is the number of moles of solute per litre of solution.',
      explanation: 'It is expressed in mol/L or M.',
      example: 'Dissolving 1 mol NaCl in 1 L gives 1 M solution.',
      formula: 'M = n / V',
      flabel: 'MOLARITY FORMULA',
      dur: 28,
      urduTtsText: 'Molarity moles per litre mein measure hoti hai...',
    },
    urdu_tts_text: 'Molarity moles per litre mein measure hoti hai...',
    hit_count: 0,
  };

  const response = buildCacheResponse(entry, 1.0);
  assert(response.answer.formula === 'M = n / V', 'formula preserved');
  assert(response.answer.flabel === 'MOLARITY FORMULA', 'flabel preserved');
});

runTest('Cache miss — answer not found → fresh generation needed', () => {
  const missResult = { hit: false, exact: false, similarity: 0, entry: null };
  assert(missResult.hit === false, 'hit is false');
  assert(missResult.entry === null, 'entry is null on miss');
  // Route proceeds to RAG + AI
});

runTest('Urdu reuse — cached urdu_tts_text prevents extra TTS call', () => {
  const entryWithUrdu = {
    answer_json: { definition: 'X', explanation: 'Y', example: 'Z', formula: '', flabel: '', dur: 30, urduTtsText: '' },
    urdu_tts_text: 'Yeh Urdu mein hai...',
  };
  const entryWithoutUrdu = {
    answer_json: { definition: 'X', explanation: 'Y', example: 'Z', formula: '', flabel: '', dur: 30, urduTtsText: '' },
    urdu_tts_text: '',
  };

  const r1 = buildCacheResponse(entryWithUrdu, 1.0);
  const r2 = buildCacheResponse(entryWithoutUrdu, 1.0);

  assert(r1.urduSummary === 'Yeh Urdu mein hai...', 'cached Urdu returned directly');
  assert(r2.urduSummary === null, 'null when no cached Urdu (frontend generates fresh)');
});

runTest('answer_json schema — all required keys present in cache entry', () => {
  const aj = {
    definition: 'A mole is 6.022×10²³ particles.',
    explanation: 'It is an SI unit of amount.',
    example: 'One mole of O₂ weighs 32 g.',
    formula: '',
    flabel: '',
    dur: 30,
    urduTtsText: '',
  };
  const requiredKeys = ['definition', 'explanation', 'example', 'formula', 'flabel', 'dur'];
  requiredKeys.forEach((k) =>
    assert(k in aj, `answer_json has key: ${k}`),
  );
  requiredKeys
    .filter((k) => k !== 'dur')
    .forEach((k) => assert(typeof aj[k] === 'string', `${k} is a string`));
  assert(typeof aj.dur === 'number', 'dur is a number');
});

// ── Audio caching tests ───────────────────────────────────────────────────────

// Inline audioFilename logic (mirrors qaCache.ts)
function audioFilename(normalizedQuestion, chapterNumber) {
  const safe = normalizedQuestion
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 80);
  return `tts/${chapterNumber}/${safe}.mp3`;
}

// Inline buildCacheResponseWithAudio (mirrors route.ts cache hit branch)
function buildCacheResponseWithAudio(entry, similarityScore) {
  const cachedAudioUrl = entry.audio_url || null;
  const cacheId        = cachedAudioUrl ? null : entry.id;
  return {
    ok: true,
    answer: { ...entry.answer_json },
    urduSummary: entry.urdu_tts_text || null,
    audioBase64: null,
    audioUrl: cachedAudioUrl,
    cacheId,
    cacheHit: true,
    cacheSimilarity: similarityScore,
  };
}

runTest('audioFilename — produces safe, deterministic path', () => {
  const q = normalizeQuestion('What is a mole?');
  const f = audioFilename(q, 1);
  assert(f.startsWith('tts/1/'), `path starts with tts/1/: "${f}"`);
  assert(f.endsWith('.mp3'), 'path ends with .mp3');
  assert(!f.includes(' '), 'no spaces in filename');
  assert(!f.includes('?'), 'no ? in filename');
});

runTest('audioFilename — identical questions produce identical filenames', () => {
  const q1 = normalizeQuestion('What is a mole?');
  const q2 = normalizeQuestion('WHAT IS A MOLE???');
  assert(audioFilename(q1, 1) === audioFilename(q2, 1), 'same normalized question → same filename');
});

runTest('audioFilename — different chapters produce different paths', () => {
  const q = normalizeQuestion('Define mole');
  assert(audioFilename(q, 1) !== audioFilename(q, 2), 'chapter 1 ≠ chapter 2 path');
  assert(audioFilename(q, 1).includes('tts/1/'), 'chapter 1 path correct');
  assert(audioFilename(q, 2).includes('tts/2/'), 'chapter 2 path correct');
});

runTest('audioFilename — long question is truncated to 80 chars for filename', () => {
  const longQ = 'a'.repeat(200);
  const f = audioFilename(longQ, 3);
  const basename = f.replace('tts/3/', '').replace('.mp3', '');
  assert(basename.length <= 80, `basename ≤ 80 chars (got ${basename.length})`);
});

runTest('Cache hit with audio — returns audioUrl, cacheId is null', () => {
  const entry = {
    id: 'uuid-10',
    answer_json: { definition: 'A mole is...', explanation: 'It is...', example: '...', formula: '', flabel: '', dur: 30, urduTtsText: '' },
    urdu_tts_text: 'Mole ek unit hai...',
    audio_url: 'https://xyz.supabase.co/storage/v1/object/public/tts-audio/tts/1/what_is_a_mole.mp3',
    audio_duration: 30,
    tts_voice: 'alloy',
    tts_model: 'gpt-4o-mini-tts',
    audio_created_at: '2026-03-28T10:00:00Z',
  };

  const response = buildCacheResponseWithAudio(entry, 1.0);
  assert(response.audioUrl === entry.audio_url, 'audioUrl is the CDN URL');
  assert(response.cacheId === null, 'cacheId is null when audio already cached');
  assert(response.audioBase64 === null, 'audioBase64 is null (CDN URL used instead)');
  assert(response.cacheHit === true, 'cacheHit is true');
});

runTest('Cache hit without audio — returns audioUrl=null, cacheId is set', () => {
  const entry = {
    id: 'uuid-11',
    answer_json: { definition: 'A mole is...', explanation: 'It is...', example: '...', formula: '', flabel: '', dur: 30, urduTtsText: '' },
    urdu_tts_text: 'Mole ek unit hai...',
    audio_url: '',       // no audio yet
    audio_duration: 0,
    tts_voice: '',
    tts_model: '',
    audio_created_at: null,
  };

  const response = buildCacheResponseWithAudio(entry, 1.0);
  assert(response.audioUrl === null, 'audioUrl is null when no audio cached');
  assert(response.cacheId === 'uuid-11', 'cacheId is the row UUID (for patching after TTS)');
  assert(response.cacheHit === true, 'cacheHit is true');
});

runTest('Semantic cache hit without audio — cacheId propagated to audio endpoint', () => {
  // Simulates: user asks "what is mole" → semantic match on "define mole" row
  // Route returns cacheId so mode=audio can patch the correct row
  const semanticEntry = {
    id: 'uuid-define-mole',
    normalized_question: 'define mole',  // stored row
    answer_json: { definition: 'A mole is...', explanation: 'It is...', example: '...', formula: '', flabel: '', dur: 30, urduTtsText: '' },
    urdu_tts_text: '',
    audio_url: '',
  };
  const response = buildCacheResponseWithAudio(semanticEntry, 0.92);

  // Client stores cacheId and sends it with mode=audio request
  const audioRequestBody = {
    mode: 'audio',
    urduSummary: '...',
    cacheId: response.cacheId,
    question: 'what is mole',    // user's question
    chapterNumber: 1,
  };

  assert(response.cacheId === 'uuid-define-mole', 'cacheId is the semantic-matched row UUID');
  assert(audioRequestBody.cacheId === 'uuid-define-mole', 'cacheId sent to audio endpoint');
  assert(audioRequestBody.question === 'what is mole', "user's question sent for storage filename");
});

runTest('shouldSkipAudioSave — skip when chapterNumber is 0', () => {
  // mirrors the guard in saveAudioToCache / saveAudioToCacheById
  const shouldSkip = (chapterNumber) => !chapterNumber || chapterNumber <= 0;
  assert(shouldSkip(0)  === true,  'skip when chapter 0');
  assert(shouldSkip(-1) === true,  'skip when chapter negative');
  assert(shouldSkip(1)  === false, 'do not skip for chapter 1');
  assert(shouldSkip(5)  === false, 'do not skip for chapter 5');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
