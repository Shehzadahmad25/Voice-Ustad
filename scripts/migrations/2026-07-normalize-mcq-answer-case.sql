-- ─────────────────────────────────────────────────────────────────────────────
-- Normalise mcqs.correct_answer to lowercase a-d.
--
-- Audit finding: the column mixes cases — 277 rows lowercase (a-d) and 90 rows
-- uppercase (A-D, concentrated in units 13, 22, 23, 24). Any consumer doing a
-- case-sensitive comparison would mis-score those 90 rows.
--
-- Direction: LOWERCASE. The authoring source of truth is
-- content/chapters/*.json, whose `answer` fields are lowercase, and
-- scripts/upload-chapter.js copies them verbatim. Normalising to uppercase
-- would be silently undone by the next `node scripts/upload-chapter.js` run.
-- scripts/upload-chapter.js has been updated in the same change to force
-- lowercase on write, so the table cannot drift back.
--
-- Consumers verified before running (grep for `correct_answer`): NO application
-- code reads mcqs.correct_answer. Every correct_answer reference in app/,
-- components/ and lib/ operates on generated question objects, which use
-- uppercase A-D produced by lib/quizValidation.ts. Readers of this column, if
-- any are added later, must case-fold at the boundary.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Snapshot the affected rows so the change is reversible.
create table if not exists public._mcq_answer_case_backup (
  id            uuid primary key,
  mcq_id        text,
  old_answer    text,
  backed_up_at  timestamptz not null default now()
);

insert into public._mcq_answer_case_backup (id, mcq_id, old_answer)
select id, mcq_id, correct_answer
from public.mcqs
where correct_answer <> lower(correct_answer)
on conflict (id) do nothing;

-- Before: expect {a,b,c,d,A,B,C,D}
select correct_answer, count(*)
from public.mcqs
group by correct_answer
order by correct_answer;

update public.mcqs
set correct_answer = lower(trim(correct_answer))
where correct_answer <> lower(trim(correct_answer));

commit;

-- ── Verification ─────────────────────────────────────────────────────────────

-- Expect exactly four rows: a, b, c, d — and nothing else.
select correct_answer, count(*)
from public.mcqs
group by correct_answer
order by correct_answer;

-- Expect 0. Anything here is neither a, b, c nor d.
select count(*) as invalid_keys
from public.mcqs
where correct_answer not in ('a','b','c','d');

-- Expect 0. Guards against the update having pointed a key at a blank option.
select count(*) as key_points_at_empty_option
from public.mcqs
where trim(coalesce(
  case correct_answer
    when 'a' then option_a when 'b' then option_b
    when 'c' then option_c when 'd' then option_d
  end, '')) = '';

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- update public.mcqs m
-- set correct_answer = b.old_answer
-- from public._mcq_answer_case_backup b
-- where m.id = b.id;
--
-- drop table public._mcq_answer_case_backup;
