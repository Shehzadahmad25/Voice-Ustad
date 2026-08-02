-- ─────────────────────────────────────────────────────────────────────────────
-- Restrict exercise content + answer keys to authenticated users.
--
-- Audit finding: with the public anon key, a logged-out visitor could read the
-- ENTIRE exercise bank including correct answers:
--
--     mcqs                    367 / 367 rows
--     quiz_questions           15 / 15
--     practice_problems        11 / 11
--     short_questions           5 / 5
--     numerical_questions       5 / 5
--     descriptive_questions     5 / 5
--     key_points               13 / 13
--     learning_objectives       7 / 7
--
-- Meanwhile content_chunks (the teaching content) was correctly locked. This
-- migration makes the exercise bank match: readable by signed-in users only.
--
-- chapters and topics stay PUBLIC on purpose — the marketing landing page
-- lists chapter titles to logged-out visitors.
--
-- Server routes are unaffected: they use SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS entirely.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $$
declare
  t text;
  p record;
  targets text[] := array[
    'mcqs',
    'quiz_questions',
    'practice_problems',
    'short_questions',
    'numerical_questions',
    'descriptive_questions',
    'key_points',
    'learning_objectives'
  ];
begin
  foreach t in array targets loop
    -- Skip anything not present in this environment rather than aborting.
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skipping %: table does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Drop every existing SELECT policy that reaches anon/public. Policy names
    -- were created ad hoc over time, so discover them instead of guessing.
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename  = t
        and cmd in ('SELECT', 'ALL')
        and (roles::text[] && array['anon', 'public'])
    loop
      raise notice 'dropping permissive policy %.% -> %', t, p.policyname, 'anon/public SELECT';
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    -- Single explicit read policy for signed-in users.
    execute format('drop policy if exists "authenticated read" on public.%I', t);
    execute format(
      'create policy "authenticated read" on public.%I for select to authenticated using (true)',
      t
    );
  end loop;
end $$;

commit;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Expect exactly one 'authenticated read' SELECT policy per table, and no
-- remaining policy granting anon.

select
  tablename,
  policyname,
  cmd,
  roles::text as granted_to
from pg_policies
where schemaname = 'public'
  and tablename in (
    'mcqs','quiz_questions','practice_problems','short_questions',
    'numerical_questions','descriptive_questions','key_points',
    'learning_objectives','chapters','topics','content_chunks'
  )
order by tablename, policyname;

-- Anything returned here is still readable by logged-out visitors.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and cmd in ('SELECT','ALL')
  and (roles::text[] && array['anon','public'])
order by tablename;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Restores public read on the eight tables (i.e. the pre-migration behaviour).
--
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['mcqs','quiz_questions','practice_problems',
--                            'short_questions','numerical_questions',
--                            'descriptive_questions','key_points',
--                            'learning_objectives']
--   loop
--     execute format('drop policy if exists "authenticated read" on public.%I', t);
--     execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
--   end loop;
-- end $$;
