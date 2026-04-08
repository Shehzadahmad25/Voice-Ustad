/**
 * test-analytics.js
 * -----------------
 * Tests for the cache analytics system:
 *   - logCacheEvent input construction (all 4 result types)
 *   - cost-saving estimation logic (mirrors get_cache_stats RPC)
 *   - hit-rate arithmetic
 *   - audio cache hit detection
 *   - top-question aggregation logic
 *
 * Run: node scripts/test-analytics.js
 * No Supabase connection required — pure logic only.
 */

'use strict';

// ── Inline helpers ────────────────────────────────────────────────────────────

function normalizeQuestion(q) {
  return String(q ?? '')
    .toLowerCase()
    .trim()
    .replace(/[?!.]+$/, '')
    .replace(/[,;:'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mirrors the get_cache_stats RPC cost-savings logic.
 * Computes estimated USD savings from an array of analytics events.
 */
function estimateSavings(events, {
  costGpt   = 0.0002,
  costTts   = 0.003,
  costEmbed = 0.00002,
} = {}) {
  return events.reduce((sum, e) => {
    if (e.result_type === 'exact'    &&  e.had_audio) return sum + costGpt + costTts;
    if (e.result_type === 'exact'    && !e.had_audio) return sum + costGpt;
    if (e.result_type === 'semantic' &&  e.had_audio) return sum + costGpt + costTts - costEmbed;
    if (e.result_type === 'semantic' && !e.had_audio) return sum + costGpt - costEmbed;
    return sum;  // miss / audio_generated → no savings
  }, 0);
}

/** Mirrors the hit_rate_pct column in get_cache_stats. */
function hitRatePct(events) {
  const answerEvents = events.filter(e => ['exact','semantic','miss'].includes(e.result_type));
  if (!answerEvents.length) return 0;
  const hits = answerEvents.filter(e => e.result_type === 'exact' || e.result_type === 'semantic').length;
  return Math.round((hits / answerEvents.length) * 1000) / 10;  // 1 decimal
}

/** Mirrors the audio_hit_rate_pct column in get_cache_stats. */
function audioHitRatePct(events) {
  const hits = events.filter(e => e.result_type === 'exact' || e.result_type === 'semantic');
  if (!hits.length) return 0;
  const withAudio = hits.filter(e => e.had_audio).length;
  return Math.round((withAudio / hits.length) * 1000) / 10;
}

/** Mirrors avg_semantic_similarity in get_cache_stats. */
function avgSemanticSimilarity(events) {
  const semantic = events.filter(e => e.result_type === 'semantic');
  if (!semantic.length) return 0;
  const sum = semantic.reduce((s, e) => s + e.similarity_score, 0);
  return Math.round((sum / semantic.length) * 10000) / 10000;
}

/**
 * Constructs the analytics event object that logCacheEvent() inserts.
 * Mirrors the route.ts call sites.
 */
function buildEvent(question, chapterNumber, resultType, similarity, hadAudio) {
  return {
    question,
    normalized_question: normalizeQuestion(question),
    chapter_number:      chapterNumber,
    result_type:         resultType,
    similarity_score:    similarity,
    had_audio:           hadAudio,
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

// ── Event construction tests ──────────────────────────────────────────────────

runTest('Exact cache hit — event shape', () => {
  const e = buildEvent('What is a mole?', 1, 'exact', 1.0, false);
  assert(e.result_type === 'exact', 'result_type is exact');
  assert(e.similarity_score === 1.0, 'similarity is 1.0');
  assert(e.chapter_number === 1, 'chapter_number is 1');
  assert(e.had_audio === false, 'had_audio is false (no audio cached yet)');
  assert(e.normalized_question === 'what is a mole', 'normalized_question correct');
});

runTest('Exact cache hit with audio — had_audio=true', () => {
  const e = buildEvent('What is a mole?', 1, 'exact', 1.0, true);
  assert(e.had_audio === true, 'had_audio is true (audio served from CDN)');
  assert(e.result_type === 'exact', 'result_type is still exact');
});

runTest('Semantic cache hit — event shape', () => {
  const e = buildEvent('Define mole', 1, 'semantic', 0.92, false);
  assert(e.result_type === 'semantic', 'result_type is semantic');
  assert(e.similarity_score === 0.92, 'similarity stored correctly');
  assert(e.similarity_score >= 0.88, 'above similarity threshold');
  assert(e.had_audio === false, 'had_audio false');
});

runTest('Cache miss — event shape', () => {
  const e = buildEvent('Explain Le Chatelier principle', 1, 'miss', 0, false);
  assert(e.result_type === 'miss', 'result_type is miss');
  assert(e.similarity_score === 0, 'similarity is 0 for miss');
  assert(e.had_audio === false, 'had_audio is always false for miss');
});

runTest('Audio generated event — event shape', () => {
  const e = buildEvent('What is a mole?', 1, 'audio_generated', 0, false);
  assert(e.result_type === 'audio_generated', 'result_type is audio_generated');
  assert(e.similarity_score === 0, 'similarity is 0 for audio_generated');
  assert(e.had_audio === false, 'had_audio is false (TTS was just generated)');
});

runTest('Normalized question is stored (not raw)', () => {
  const e = buildEvent('WHAT IS MOLE???', 3, 'exact', 1.0, false);
  assert(e.normalized_question === 'what is mole', `normalized: "${e.normalized_question}"`);
  assert(e.question === 'WHAT IS MOLE???', 'raw question preserved in question field');
});

// ── Hit rate tests ────────────────────────────────────────────────────────────

runTest('hit_rate_pct — 8 hits / 10 requests = 80%', () => {
  const events = [
    buildEvent('q1', 1, 'exact',    1.0, false),
    buildEvent('q2', 1, 'exact',    1.0, true),
    buildEvent('q3', 1, 'semantic', 0.91, false),
    buildEvent('q4', 1, 'semantic', 0.89, true),
    buildEvent('q5', 1, 'exact',    1.0, false),
    buildEvent('q6', 1, 'exact',    1.0, true),
    buildEvent('q7', 1, 'semantic', 0.93, false),
    buildEvent('q8', 1, 'exact',    1.0, false),
    buildEvent('q9', 1, 'miss',     0,   false),
    buildEvent('q10',1, 'miss',     0,   false),
  ];
  assert(hitRatePct(events) === 80, `hit rate = ${hitRatePct(events)}% (expected 80)`);
});

runTest('hit_rate_pct — 0 requests = 0%', () => {
  assert(hitRatePct([]) === 0, '0 events → 0% hit rate');
});

runTest('hit_rate_pct — all misses = 0%', () => {
  const events = [1,2,3].map(i => buildEvent(`q${i}`, 1, 'miss', 0, false));
  assert(hitRatePct(events) === 0, 'all misses → 0% hit rate');
});

runTest('hit_rate_pct — all exact hits = 100%', () => {
  const events = [1,2,3].map(i => buildEvent(`q${i}`, 1, 'exact', 1.0, true));
  assert(hitRatePct(events) === 100, 'all hits → 100% hit rate');
});

runTest('audio_hit_rate_pct — 3 with audio / 5 hits = 60%', () => {
  const events = [
    buildEvent('q1', 1, 'exact',    1.0, true),
    buildEvent('q2', 1, 'exact',    1.0, true),
    buildEvent('q3', 1, 'semantic', 0.9, true),
    buildEvent('q4', 1, 'exact',    1.0, false),
    buildEvent('q5', 1, 'semantic', 0.9, false),
  ];
  assert(audioHitRatePct(events) === 60, `audio hit rate = ${audioHitRatePct(events)}% (expected 60)`);
});

// ── Average semantic similarity tests ────────────────────────────────────────

runTest('avgSemanticSimilarity — correct average', () => {
  const events = [
    buildEvent('q1', 1, 'semantic', 0.92, false),
    buildEvent('q2', 1, 'semantic', 0.88, false),
    buildEvent('q3', 1, 'exact',    1.0,  false),  // excluded from avg
    buildEvent('q4', 1, 'miss',     0,    false),   // excluded from avg
  ];
  const avg = avgSemanticSimilarity(events);
  assert(Math.abs(avg - 0.9) < 0.0001, `avg semantic similarity = ${avg} (expected 0.9)`);
});

runTest('avgSemanticSimilarity — no semantic events = 0', () => {
  const events = [buildEvent('q1', 1, 'exact', 1.0, false)];
  assert(avgSemanticSimilarity(events) === 0, 'no semantic events → 0');
});

// ── Cost estimation tests ─────────────────────────────────────────────────────

const DEFAULT_COSTS = { costGpt: 0.0002, costTts: 0.003, costEmbed: 0.00002 };

runTest('Cost savings — exact hit with audio (max savings)', () => {
  const events = [buildEvent('q', 1, 'exact', 1.0, true)];
  const savings = estimateSavings(events, DEFAULT_COSTS);
  const expected = 0.0002 + 0.003;  // GPT + TTS
  assert(Math.abs(savings - expected) < 0.000001, `exact+audio saves $${savings.toFixed(6)} (expected $${expected})`);
});

runTest('Cost savings — exact hit without audio (GPT only)', () => {
  const events = [buildEvent('q', 1, 'exact', 1.0, false)];
  const savings = estimateSavings(events, DEFAULT_COSTS);
  assert(Math.abs(savings - 0.0002) < 0.000001, `exact-no-audio saves $${savings.toFixed(6)} (GPT only)`);
});

runTest('Cost savings — semantic hit with audio (GPT + TTS - embedding)', () => {
  const events = [buildEvent('q', 1, 'semantic', 0.92, true)];
  const savings = estimateSavings(events, DEFAULT_COSTS);
  const expected = 0.0002 + 0.003 - 0.00002;
  assert(Math.abs(savings - expected) < 0.000001, `semantic+audio saves $${savings.toFixed(6)}`);
});

runTest('Cost savings — semantic hit without audio (GPT - embedding)', () => {
  const events = [buildEvent('q', 1, 'semantic', 0.92, false)];
  const savings = estimateSavings(events, DEFAULT_COSTS);
  const expected = 0.0002 - 0.00002;
  assert(Math.abs(savings - expected) < 0.000001, `semantic-no-audio saves $${savings.toFixed(6)}`);
});

runTest('Cost savings — miss saves nothing', () => {
  const events = [buildEvent('q', 1, 'miss', 0, false)];
  assert(estimateSavings(events, DEFAULT_COSTS) === 0, 'miss saves $0');
});

runTest('Cost savings — audio_generated saves nothing', () => {
  const events = [buildEvent('q', 1, 'audio_generated', 0, false)];
  assert(estimateSavings(events, DEFAULT_COSTS) === 0, 'audio_generated saves $0');
});

runTest('Cost savings — mixed batch of 10 events', () => {
  const events = [
    buildEvent('q1',  1, 'exact',    1.0, true),   // +0.0032
    buildEvent('q2',  1, 'exact',    1.0, true),   // +0.0032
    buildEvent('q3',  1, 'exact',    1.0, false),  // +0.0002
    buildEvent('q4',  1, 'semantic', 0.9, true),   // +0.00318  (costGpt + costTts - costEmbed)
    buildEvent('q5',  1, 'semantic', 0.9, false),  // +0.00018  (costGpt - costEmbed)
    buildEvent('q6',  1, 'miss',     0,   false),  // +0
    buildEvent('q7',  1, 'miss',     0,   false),  // +0
    buildEvent('q8',  1, 'miss',     0,   false),  // +0
    buildEvent('q9',  1, 'audio_generated', 0, false),  // +0
    buildEvent('q10', 1, 'exact',    1.0, true),   // +0.0032
  ];
  const savings = estimateSavings(events, DEFAULT_COSTS);
  assert(savings > 0, `total savings > $0 (got $${savings.toFixed(6)})`);
  assert(savings < 0.02, `total savings < $0.02 (got $${savings.toFixed(6)})`);
  // exact: 3×0.0032 + 1×0.0002 = 0.0098; semantic: 1×0.00318 + 1×0.00018 = 0.00336
  const expected = 3 * 0.0032 + 0.0002 + 0.00318 + 0.00018;
  assert(Math.abs(savings - expected) < 0.000001, `exact batch savings $${savings.toFixed(6)}`);
});

runTest('Cost savings — configurable cost params respected', () => {
  const events = [buildEvent('q', 1, 'exact', 1.0, true)];
  const lowCost  = estimateSavings(events, { costGpt: 0.0001, costTts: 0.001, costEmbed: 0.00001 });
  const highCost = estimateSavings(events, { costGpt: 0.001,  costTts: 0.01,  costEmbed: 0.0001  });
  assert(lowCost < highCost, 'lower cost params → lower savings');
  assert(Math.abs(lowCost  - 0.0011) < 0.000001, `low cost: $${lowCost}`);
  assert(Math.abs(highCost - 0.011)  < 0.000001, `high cost: $${highCost}`);
});

// ── Metrics definitions (doc-test style) ────────────────────────────────────

runTest('Metric definitions — all 7 metrics derivable from event data', () => {
  const events = [
    buildEvent('q1', 1, 'exact',    1.0, true),
    buildEvent('q2', 1, 'exact',    1.0, false),
    buildEvent('q3', 1, 'semantic', 0.91, true),
    buildEvent('q4', 1, 'semantic', 0.89, false),
    buildEvent('q5', 1, 'miss',     0,   false),
    buildEvent('q6', 1, 'audio_generated', 0, false),
  ];

  const exactHits      = events.filter(e => e.result_type === 'exact').length;
  const semanticHits   = events.filter(e => e.result_type === 'semantic').length;
  const misses         = events.filter(e => e.result_type === 'miss').length;
  const audioCacheHits = events.filter(e => ['exact','semantic'].includes(e.result_type) && e.had_audio).length;
  const audioGenerated = events.filter(e => e.result_type === 'audio_generated').length;
  const freshGens      = misses;  // alias
  const avgSemSim      = avgSemanticSimilarity(events);

  assert(exactHits      === 2, `exact_cache_hits = ${exactHits}`);
  assert(semanticHits   === 2, `semantic_cache_hits = ${semanticHits}`);
  assert(misses         === 1, `cache_misses = ${misses}`);
  assert(audioCacheHits === 2, `audio_cache_hits = ${audioCacheHits}`);
  assert(audioGenerated === 1, `audio_generated_on_hit = ${audioGenerated}`);
  assert(freshGens      === 1, `fresh_generations = ${freshGens}`);
  assert(avgSemSim > 0,        `avg_semantic_similarity = ${avgSemSim}`);
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
