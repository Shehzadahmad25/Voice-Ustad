/**
 * VoiceUstad — server-side paywall verification.
 *
 * Re-runs the exact probes from the 2026-09-15 audit that found production
 * open, so each fix can be confirmed against LIVE state rather than assumed.
 *
 *   node scripts/verify-paywall.js                       # API checks against production
 *   node scripts/verify-paywall.js --base http://localhost:3001   # against a local server
 *   node scripts/verify-paywall.js --db-only            # only the Supabase trigger/RPC checks
 *
 * What it does:
 *   A. Unauthenticated request to every previously-open route  -> expect 401
 *   B. Throwaway user with an EXPIRED trial                      -> 403 on paid routes,
 *                                                                   200 on signed-in-only routes
 *   C. Throwaway user with an ACTIVE trial                       -> gate opens (never a 401/403);
 *      bodies are chosen so no LLM/TTS call is made (no spend)
 *   D. save-quiz-result identity: body user_id of another user   -> 403
 *   E. DB: self-upgrade UPDATE from the anon client               -> rejected (42501)
 *         ordinary profile edit                                   -> allowed
 *         increment_xp(1001) / increment_xp(10) / update_streak() -> capped / +10 / streak 1
 *
 * Creates two users named rls-verify-*@example.invalid and deletes them (and
 * every row they wrote) at the end, even on failure. Needs .env.local with
 * the service-role key. Exit code 1 if any check fails.
 */

require('dotenv').config({ path: '.env.local', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf('--base', 'https://www.voiceustad.pk').replace(/\/$/, '');
const DB_ONLY = args.includes('--db-only');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !svcKey) { console.error('Missing Supabase env in .env.local'); process.exit(1); }
const svc = createClient(url, svcKey, { auth: { persistSession: false } });

let failures = 0;
const line = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${detail}`);
};

async function mkUser(tag) {
  const email = `rls-verify-${tag}-${Date.now()}@example.invalid`;
  const password = 'Verify!' + Math.random().toString(36).slice(2, 12) + 'Zz9';
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: si, error: se } = await client.auth.signInWithPassword({ email, password });
  if (se) throw new Error('signIn: ' + se.message);
  return { id: data.user.id, client, token: si.session.access_token };
}

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'follow' });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// Requests that reach the handler but never trigger an LLM/TTS call.
const ROUTES = [
  { path: '/api/chat2', method: 'POST', body: { mode: 'chat', message: 'what is love', chapterNumber: 0 }, paid: true, openOk: (r) => r.status === 200 && r.json.responseSource === 'not_found' },
  { path: '/api/generate-urdu', method: 'POST', body: { topicTitle: 'x' }, paid: true, openOk: (r) => r.status === 400 },
  { path: '/api/generate-quiz', method: 'POST', body: { chapterSlugs: ['99'], count: 1 }, paid: true, openOk: (r) => r.status === 503 },
  { path: '/api/chapter-content?chapter=1&board=KPK', method: 'GET', paid: true, openOk: (r) => r.status === 200 && Array.isArray(r.json.topics) },
  { path: '/api/topic-view', method: 'POST', body: { topicTitle: 'zzz-no-such-topic', chapterNumber: 1 }, paid: true, openOk: (r) => r.status === 200 && r.json.ok === false },
  { path: '/api/chapter-topics?chapter=1', method: 'GET', paid: false, openOk: (r) => r.status === 200 && Array.isArray(r.json.topics) },
  { path: '/api/save-quiz-result', method: 'POST', body: { chapter_id: '1', chapter_title: 'x', answers: ['A'], questions: [{ question: 'q', options: { A: '1', B: '2', C: '3', D: '4' }, correct_answer: 'A', topic_name: 't' }] }, paid: false, openOk: (r) => r.status === 422 },
];

(async () => {
  let A = null, B = null;
  try {
    console.log(`\nTarget: ${BASE}   Supabase: ${url}\n`);

    if (!DB_ONLY) {
      console.log('A. UNAUTHENTICATED — every route must answer 401');
      for (const r of ROUTES) {
        const res = await call(r.path, { method: r.method, body: r.body });
        line(res.status === 401, `${r.method} ${r.path.split('?')[0]}`, `-> ${res.status}${res.status !== 401 ? '  *** OPEN ***' : ''}`);
      }
    }

    A = await mkUser('expired');
    B = await mkUser('active');
    // A: trial ended yesterday (service role, so this write is legitimate)
    const { error: expErr } = await svc.from('profiles').update({ trial_ends_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', A.id);
    if (expErr) throw new Error('could not expire test user: ' + expErr.message);

    if (!DB_ONLY) {
      console.log('\nB. EXPIRED TRIAL — paid routes 403 SUBSCRIPTION_REQUIRED, signed-in-only routes open');
      for (const r of ROUTES) {
        const res = await call(r.path, { method: r.method, token: A.token, body: r.body });
        if (r.paid) line(res.status === 403 && res.json.code === 'SUBSCRIPTION_REQUIRED', `${r.method} ${r.path.split('?')[0]}`, `-> ${res.status} ${res.json.code ?? ''}`);
        else line(res.status !== 401 && res.status !== 403, `${r.method} ${r.path.split('?')[0]}`, `-> ${res.status}`);
      }

      console.log('\nC. ACTIVE TRIAL — gate opens (no 401/403); bodies avoid any LLM/TTS spend');
      for (const r of ROUTES) {
        const res = await call(r.path, { method: r.method, token: B.token, body: r.body });
        line(r.openOk(res), `${r.method} ${r.path.split('?')[0]}`, `-> ${res.status} ${JSON.stringify(res.json).slice(0, 60)}`);
      }

      console.log('\nD. save-quiz-result identity');
      // chapter_id is a uuid column — use a real chapter so the insert itself is valid
      const { data: ch } = await svc.from('chapters').select('id').eq('unit_number', 1).single();
      const chapterUuid = ch?.id;
      const q15 = Array.from({ length: 15 }, (_, i) => ({ question: 'q' + i, options: { A: '1', B: '2', C: '3', D: '4' }, correct_answer: 'A', topic_name: 't' }));
      let res = await call('/api/save-quiz-result', { method: 'POST', token: B.token, body: { user_id: A.id, chapter_id: chapterUuid, chapter_title: 'VERIFY', answers: q15.map(() => 'A'), questions: q15 } });
      line(res.status === 403, `body user_id = another user -> 403`, `-> ${res.status} ${res.json.error ?? ''}`);
      const { count: forged } = await svc.from('student_quiz_results').select('*', { count: 'exact', head: true }).eq('user_id', A.id).eq('chapter_title', 'VERIFY');
      line(forged === 0, `no row written for the other user`, `rows=${forged}`);
      res = await call('/api/save-quiz-result', { method: 'POST', token: B.token, body: { chapter_id: chapterUuid, chapter_title: 'VERIFY', answers: q15.map(() => 'A'), questions: q15 } });
      const { data: own } = await svc.from('student_quiz_results').select('user_id').eq('chapter_title', 'VERIFY');
      line(res.status === 200 && own?.length === 1 && own[0].user_id === B.id, `no body user_id -> saved under the TOKEN user`, `-> ${res.status}, row user_id ${own?.[0]?.user_id === B.id ? 'matches token' : 'WRONG'}`);
    }

    console.log('\nE. DATABASE — profiles guard trigger + RPCs (independent of the app deploy)');
    let r = await B.client.from('profiles').update({
      subscription_status: 'active', is_subscribed: true, subscription_expires_at: '2099-01-01T00:00:00Z',
      trial_ends_at: '2099-01-01T00:00:00Z', role: 'teacher', xp: 999999, streak: 999,
    }).eq('id', B.id).select('id');
    const { data: after } = await svc.from('profiles').select('subscription_status, is_subscribed, role, xp, trial_ends_at').eq('id', B.id).single();
    const escalated = after.is_subscribed || after.role === 'teacher' || after.xp === 999999 || after.subscription_status === 'active';
    line(Boolean(r.error) && !escalated, `self-upgrade UPDATE rejected`, r.error ? `-> ${r.error.code} ${r.error.message.slice(0, 50)}` : `-> ALLOWED, row now ${JSON.stringify(after)}  *** EXPLOITABLE ***`);
    r = await B.client.from('profiles').update({ full_name: 'Verify Name', phone: '0300' }).eq('id', B.id).select('full_name');
    line(!r.error && r.data?.[0]?.full_name === 'Verify Name', `ordinary profile edit (full_name, phone) still allowed`, r.error ? `-> ${r.error.code} ${r.error.message.slice(0, 60)}` : '-> ok');
    r = await B.client.from('profiles').update({ full_name: 'Verify Name 2', subscription_status: 'trial' }).eq('id', B.id).select('full_name');
    line(!r.error, `edit that resends an UNCHANGED privileged value is allowed`, r.error ? `-> ${r.error.code} (onboarding/authService would break)` : '-> ok');

    const { data: x0 } = await svc.from('profiles').select('xp').eq('id', B.id).single();
    r = await B.client.rpc('increment_xp', { p_amount: 1001 });
    line(Boolean(r.error), `increment_xp(1001) rejected by cap`, r.error ? `-> ${r.error.code}` : '-> ACCEPTED');
    r = await B.client.rpc('increment_xp', { p_amount: 10 });
    const { data: x1 } = await svc.from('profiles').select('xp').eq('id', B.id).single();
    line(!r.error && x1.xp === (x0.xp ?? 0) + 10, `increment_xp({p_amount:10}) adds exactly 10 to caller`, r.error ? `-> ${r.error.code} ${r.error.message.slice(0, 50)}` : `-> xp ${x0.xp}->${x1.xp}`);
    r = await B.client.rpc('increment_xp', { p_user_id: A.id, p_amount: 10 });
    const { data: x2 } = await svc.from('profiles').select('xp').eq('id', B.id).single();
    const { data: ax } = await svc.from('profiles').select('xp').eq('id', A.id).single();
    line(!r.error && x2.xp === x1.xp + 10 && (ax.xp ?? 0) === 0, `legacy shim increment_xp(p_user_id=OTHER) ignores the id`, r.error ? `-> ${r.error.code} (shim missing?)` : `-> caller ${x1.xp}->${x2.xp}, other=${ax.xp}`);
    r = await B.client.rpc('update_streak');
    const { data: st } = await svc.from('profiles').select('streak, best_streak, last_study_date').eq('id', B.id).single();
    line(!r.error && st.streak === 1 && st.best_streak === 1, `update_streak() -> streak 1, best_streak 1, today`, r.error ? `-> ${r.error.code} ${r.error.message.slice(0, 50)}` : `-> ${JSON.stringify(st)}`);
    r = await B.client.rpc('update_streak', { p_user_id: A.id });
    const { data: st2 } = await svc.from('profiles').select('streak').eq('id', A.id).single();
    line(!r.error && (st2.streak ?? 0) === 0, `legacy shim update_streak(p_user_id=OTHER) ignores the id`, r.error ? `-> ${r.error.code}` : `-> other streak=${st2.streak}`);
  } catch (e) {
    failures += 1;
    console.error('\nABORTED:', e.message);
  } finally {
    for (const u of [A, B]) {
      if (!u) continue;
      await svc.from('student_quiz_results').delete().eq('user_id', u.id);
      await svc.from('profiles').delete().eq('id', u.id);
      await svc.auth.admin.deleteUser(u.id);
    }
    if (A || B) console.log('\ncleanup: test users and their rows removed');
  }
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
