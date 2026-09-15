-- ─────────────────────────────────────────────────────────────────────────────
-- increment_xp / update_streak: derive the target user from auth.uid().
--
-- Before: increment_xp(p_user_id uuid, p_amount int) and
--         update_streak(p_user_id uuid) took the target user as an argument.
--         Both are SECURITY INVOKER, so RLS on profiles kept them from
--         touching OTHER users' rows (verified live 2026-09-15: A calling
--         increment_xp(B, 100) left B.xp at 0). But the argument is still a
--         lie in the API surface, and a user can award THEMSELVES any amount
--         (increment_xp(me, 999999) worked).
--
-- After:
--   increment_xp(p_amount int)   -> adds to auth.uid()'s xp, 1..1000 per call
--   update_streak()              -> advances auth.uid()'s daily streak
--
--   Both are now SECURITY DEFINER. That is REQUIRED, not optional: the
--   profiles trigger from 2026-09-lock-profile-privileged-columns.sql makes
--   xp / streak / best_streak / last_study_date read-only for the
--   'authenticated' role, so an INVOKER function running as the student
--   would be blocked by it. As DEFINER (owner postgres) they pass the
--   trigger, and auth.uid() is the only user they can ever write to.
--
--   Per-call XP cap: the client sends score*10 (chapter quiz, max 33 q) or
--   score*20 (Sunday test, 45 q) — legit maximum is 900. The cap stops the
--   999999 case; moving scoring server-side is a separate change.
--
-- Compatibility shims: the currently deployed client still calls the old
-- (p_user_id, ...) signatures. Those are kept as thin wrappers that IGNORE
-- p_user_id and delegate to the new functions, so this migration is safe to
-- run before OR after the client deploy. Drop them once the deploy that
-- switches lib/streak.ts, app/quiz/page.tsx and components/QuizModal.tsx to
-- the new signatures is live (see "Cleanup" at the bottom).
--
-- BEFORE RUNNING: snapshot the current definitions for rollback —
--   select pg_get_functiondef('public.increment_xp(uuid,integer)'::regprocedure);
--   select pg_get_functiondef('public.update_streak(uuid)'::regprocedure);
-- and paste the output into the Rollback section below.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── increment_xp ─────────────────────────────────────────────────────────────

create or replace function public.increment_xp(p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'increment_xp: not signed in' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000 then
    raise exception 'increment_xp: amount must be between 1 and 1000 (got %)', p_amount
      using errcode = '22023';   -- invalid_parameter_value
  end if;

  update public.profiles
     set xp = coalesce(xp, 0) + p_amount
   where id = uid;
end;
$$;

-- ── update_streak ────────────────────────────────────────────────────────────
-- Same semantics as the old function (verified live): idempotent per UTC
-- day; consecutive day -> +1; any gap -> back to 1. One addition: best_streak
-- is now maintained (the old function left it at 0 forever).

create or replace function public.update_streak()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  last_day date;
  cur      integer;
begin
  if uid is null then
    raise exception 'update_streak: not signed in' using errcode = '42501';
  end if;

  select last_study_date, coalesce(streak, 0)
    into last_day, cur
    from public.profiles
   where id = uid
     for update;

  if not found then
    return;
  end if;

  if last_day = today then
    return;                                  -- already counted today
  elsif last_day = today - 1 then
    cur := cur + 1;                          -- consecutive day
  else
    cur := 1;                                -- first day, or gap
  end if;

  update public.profiles
     set streak          = cur,
         best_streak     = greatest(coalesce(best_streak, 0), cur),
         last_study_date = today
   where id = uid;
end;
$$;

-- ── Compatibility shims (old signatures; p_user_id is IGNORED) ───────────────
-- Dropped and re-created rather than CREATE OR REPLACE'd: if the originals
-- return anything other than void, OR REPLACE fails with "cannot change
-- return type". The pg_get_functiondef snapshot taken above is the rollback.

drop function if exists public.increment_xp(uuid, integer);
drop function if exists public.update_streak(uuid);

create function public.increment_xp(p_user_id uuid, p_amount integer)
returns void
language sql
security invoker
set search_path = public
as $$
  select public.increment_xp(p_amount);
$$;

create function public.update_streak(p_user_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  select public.update_streak();
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Only signed-in users may call these. anon has no auth.uid() anyway, but be
-- explicit so a future policy change cannot widen it by accident.

revoke all on function public.increment_xp(integer)             from public, anon;
revoke all on function public.update_streak()                   from public, anon;
revoke all on function public.increment_xp(uuid, integer)       from public, anon;
revoke all on function public.update_streak(uuid)               from public, anon;

grant execute on function public.increment_xp(integer)          to authenticated, service_role;
grant execute on function public.update_streak()                to authenticated, service_role;
grant execute on function public.increment_xp(uuid, integer)    to authenticated, service_role;
grant execute on function public.update_streak(uuid)            to authenticated, service_role;

commit;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Expect four rows; the two no-p_user_id ones must show prosecdef = true.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('increment_xp', 'update_streak')
order by 1, 2;

-- Then, from the repo: node scripts/verify-paywall.js
-- (expects: increment_xp(1001) rejected, increment_xp(10) adds exactly 10 to
--  the caller, and the shim with someone else's p_user_id still only touches
--  the caller.)

-- ── Cleanup (run AFTER the client deploy that uses the new signatures) ───────
-- drop function if exists public.increment_xp(uuid, integer);
-- drop function if exists public.update_streak(uuid);

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- drop function if exists public.increment_xp(integer);
-- drop function if exists public.update_streak();
-- drop function if exists public.increment_xp(uuid, integer);
-- drop function if exists public.update_streak(uuid);
-- -- then re-create the originals from the pg_get_functiondef snapshots taken
-- -- before running this file:
-- <paste original increment_xp(uuid, integer) definition here>
-- <paste original update_streak(uuid) definition here>
