/**
 * VoiceUstad — RLS posture check.
 *
 * Run BEFORE and AFTER scripts/migrations/2026-07-lock-exercise-content-rls.sql
 * to confirm the lockdown landed and that service-role reads still work.
 *
 * Usage: node scripts/verify-rls.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Tables the migration locks down.
const SHOULD_BE_PRIVATE = [
  'mcqs', 'quiz_questions', 'practice_problems', 'short_questions',
  'numerical_questions', 'descriptive_questions', 'key_points', 'learning_objectives',
];
// Tables that must stay readable by logged-out visitors (landing page).
const SHOULD_STAY_PUBLIC = ['chapters', 'topics'];
// Already private before this migration — regression guard.
const ALREADY_PRIVATE = ['content_chunks', 'profiles', 'chat_sessions', 'chat_messages', 'quiz_attempts'];

async function counts(table) {
  const a = await anon.from(table).select('*', { count: 'exact', head: true });
  const s = await svc.from(table).select('*', { count: 'exact', head: true });
  return {
    anonVisible: a.error ? null : a.count,
    anonError: a.error?.code ?? null,
    total: s.error ? null : s.count,
    svcError: s.error?.message ?? null,
  };
}

(async () => {
  let failures = 0;
  const line = (ok, label, detail) => {
    if (!ok) failures++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(24)} ${detail}`);
  };

  console.log('\nMUST BE PRIVATE (authenticated-only reads)');
  for (const t of SHOULD_BE_PRIVATE) {
    const c = await counts(t);
    if (c.total === null) { console.log(`  SKIP  ${t.padEnd(24)} table missing`); continue; }
    const locked = c.anonVisible === 0 || c.anonError !== null;
    line(locked, t, `anon sees ${c.anonVisible ?? `error ${c.anonError}`} of ${c.total}`);
  }

  console.log('\nMUST STAY PUBLIC (landing page needs these)');
  for (const t of SHOULD_STAY_PUBLIC) {
    const c = await counts(t);
    line(c.anonVisible !== null && c.anonVisible > 0, t, `anon sees ${c.anonVisible ?? `error ${c.anonError}`} of ${c.total}`);
  }

  console.log('\nALREADY PRIVATE (regression guard)');
  for (const t of ALREADY_PRIVATE) {
    const c = await counts(t);
    if (c.total === null) { console.log(`  SKIP  ${t.padEnd(24)} table missing`); continue; }
    line(c.anonVisible === 0 || c.anonError !== null, t, `anon sees ${c.anonVisible ?? `error ${c.anonError}`} of ${c.total}`);
  }

  console.log('\nSERVICE ROLE still reads everything (server routes must be unaffected)');
  for (const t of [...SHOULD_BE_PRIVATE, ...SHOULD_STAY_PUBLIC, 'content_chunks']) {
    const c = await counts(t);
    if (c.total === null && c.svcError) { line(false, t, `service-role BLOCKED: ${c.svcError}`); continue; }
    line(c.total !== null, t, `service-role reads ${c.total} rows`);
  }

  console.log('\nANON WRITES still denied');
  const probes = [
    ['mcqs', { chapter_id: '00000000-0000-0000-0000-000000000000', mcq_id: 'RLS_PROBE', question: 'p', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_answer: 'a' }],
    ['chapters', { unit_number: 9999, title: 'RLS_PROBE' }],
  ];
  for (const [t, row] of probes) {
    const { error } = await anon.from(t).insert(row);
    line(Boolean(error), t, error ? `denied (${error.code})` : '*** INSERT ALLOWED ***');
    if (!error) await svc.from(t).delete().eq(t === 'chapters' ? 'unit_number' : 'mcq_id', t === 'chapters' ? 9999 : 'RLS_PROBE');
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
