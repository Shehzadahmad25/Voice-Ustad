-- ─────────────────────────────────────────────────────────────────────────────
-- Lock the privileged columns on public.profiles against end-user writes.
--
-- Incident (2026-09-15 audit, confirmed live with a throwaway user):
--   The only UPDATE policy on profiles is `auth.uid() = id` with no column
--   restriction. A signed-in student could therefore run, from the browser:
--
--     update profiles set subscription_status = 'active', is_subscribed = true,
--       subscription_expires_at = '2099-01-01', trial_ends_at = '2099-01-01',
--       role = 'teacher', xp = 999999, streak = 999 where id = auth.uid();
--
--   and it persisted. That is free Pro for anyone, plus escalation to the
--   teacher role.
--
-- Fix: a BEFORE INSERT OR UPDATE trigger that runs as the *request* role.
--   * anon / authenticated (PostgREST end users)  -> privileged columns are
--     read-only. UPDATE raises 42501; INSERT has them forced to the same
--     defaults the auth-signup trigger seeds (so a user can never create a
--     pre-upgraded row either).
--   * service_role (server routes), postgres (SQL editor / Table editor),
--     and SECURITY DEFINER helpers owned by postgres -> untouched. This is
--     how subscriptions keep being activated by hand from the dashboard.
--
-- Non-privileged columns (full_name, phone, class, board, goal, exam_date,
-- notification toggles, response_language, voice_speed, email, avatar...)
-- are NOT affected; students still edit their own profile normally.
--
-- Protected columns:
--   subscription_status, is_subscribed, subscription_expires_at,
--   trial_ends_at, role, xp, streak, best_streak, last_study_date,
--   last_sunday_test_at
--
-- DEPLOY ORDER: ship the client change that stops sending
-- subscription_status / trial_ends_at from onboarding + authService FIRST,
-- then run this. (If this runs first, onboarding upserts fail with 42501
-- until the client deploy lands — nothing is corrupted, just blocked.)
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER (the default) on purpose: current_user must be the role
-- PostgREST switched to for this request ('anon' / 'authenticated'), not the
-- function owner. A SECURITY DEFINER caller (e.g. increment_xp, owned by
-- postgres) sees current_user = 'postgres' here and is allowed through.
set search_path = public
as $$
begin
  -- Trusted callers: service_role key, dashboard/SQL editor, definer helpers.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- End users never choose these. Force the signup defaults regardless of
    -- what the client sent.
    new.subscription_status     := 'trial';
    new.is_subscribed           := false;
    new.subscription_expires_at := null;
    new.trial_ends_at           := now() + interval '7 days';
    new.role                    := 'student';
    new.xp                      := 0;
    new.streak                  := 0;
    new.best_streak             := 0;
    new.last_study_date         := null;
    new.last_sunday_test_at     := null;
    return new;
  end if;

  -- UPDATE: any change to a privileged column from an end-user role is an
  -- error, not a silent revert — we want attempts to be visible in logs.
  if new.subscription_status     is distinct from old.subscription_status
  or new.is_subscribed           is distinct from old.is_subscribed
  or new.subscription_expires_at is distinct from old.subscription_expires_at
  or new.trial_ends_at           is distinct from old.trial_ends_at
  or new.role                    is distinct from old.role
  or new.xp                      is distinct from old.xp
  or new.streak                  is distinct from old.streak
  or new.best_streak             is distinct from old.best_streak
  or new.last_study_date         is distinct from old.last_study_date
  or new.last_sunday_test_at     is distinct from old.last_sunday_test_at
  then
    raise exception
      'profiles: subscription/role/xp/streak columns are read-only for end users (role=%, id=%)',
      current_user, old.id
      using errcode = '42501';   -- insufficient_privilege, same code RLS uses
  end if;

  return new;
end;
$$;

-- The trigger function must not be callable/replaceable by end users.
revoke all on function public.profiles_guard_privileged_columns() from public, anon, authenticated;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_privileged_columns();

commit;

-- ── Verification (run as yourself in the SQL editor) ─────────────────────────
-- Expect one row: the trigger, enabled ('O'), on INSERT and UPDATE.
select tgname, tgenabled,
       (tgtype::int & 4) > 0  as on_insert,
       (tgtype::int & 16) > 0 as on_update
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and tgname = 'profiles_guard_privileged_columns';

-- Then, from the repo: node scripts/verify-paywall.js
-- It signs in as a throwaway user and expects the self-upgrade UPDATE to be
-- rejected with 42501 while a full_name update still succeeds.

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- drop trigger if exists profiles_guard_privileged_columns on public.profiles;
-- drop function if exists public.profiles_guard_privileged_columns();
