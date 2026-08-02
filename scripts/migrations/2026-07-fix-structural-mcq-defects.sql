-- ─────────────────────────────────────────────────────────────────────────────
-- Clear the remaining structural defects in the mcqs table.
--
-- Run AFTER 2026-07-fix-13-miskeyed-mcqs.sql, which already handled three of
-- the originally-flagged 20 rows (U17-MCQ-12, u23-mcq-08, u24-mcq-12).
-- scripts/audit-mcqs.js currently reports:
--
--     rows flagged      : 17
--     LETTER_REFERENCE  : 15
--     DUPLICATE_OPTION  : 2
--     DUPLICATE_QUESTION: 7 groups
--
-- This migration takes all four counters to zero. It does five things:
--
--   STEP 1  2 duplicate-option repairs        (CH8_MCQ06, CH9_MCQ10)
--   STEP 2  13 letter-reference option rewrites, keys unchanged
--   STEP 3  u23-mcq-15 — two option rewrites AND a key change (d -> a)
--   STEP 4  delete u23-mcq-07 (retired: giveaway item, near-duplicate of
--           u23-mcq-08 which the previous migration corrected)
--   STEP 5  delete 7 legacy Unit 1 duplicates
--
-- WHY OPTIONS THAT NAME OTHER OPTIONS ARE BANNED
-- QuizModal.shuffleOptions() and app/quiz/page.tsx both reorder A-D before
-- display, so "Both a and b" is already pointing at the wrong options by the
-- time a student reads it. Combined answers must be spelled out instead.
-- lib/quizValidation.ts enforces the same rule on newly generated questions.
--
-- ROW COUNT. mcqs goes from 367 to 359 (8 deletions).
--
-- CASE. The one key written here is lowercase. Guards use lower(trim(...)), so
-- this composes safely with 2026-07-normalize-mcq-answer-case.sql in either
-- order.
--
-- Run in the Supabase SQL editor. Idempotent — guards make a second run a
-- no-op, and both backup inserts skip rows already captured.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Backups ──────────────────────────────────────────────────────────────────

-- Edited rows: enough columns to restore every field this migration touches.
create table if not exists public._mcq_structural_fix_backup (
  id             uuid primary key,
  mcq_id         text,
  question       text,
  option_a       text,
  option_b       text,
  option_c       text,
  option_d       text,
  correct_answer text,
  backed_up_at   timestamptz not null default now()
);

insert into public._mcq_structural_fix_backup
  (id, mcq_id, question, option_a, option_b, option_c, option_d, correct_answer)
select id, mcq_id, question, option_a, option_b, option_c, option_d, correct_answer
from public.mcqs
where id in (
  'fd594cb7-b49d-4e21-9eee-8ab6ed9c6b3b',  -- CH8_MCQ06   duplicate option
  'a5536b52-b39b-4cd1-acc7-ccaff2a347c4',  -- CH9_MCQ10   duplicate option
  '8f27f04a-6cde-43fa-bb53-38d46155d317',  -- CH9_MCQ09
  'dca7f618-c71b-4255-9eea-6b2e0f3546ad',  -- CH10_MCQ11
  '914a0da0-cc28-4638-bd84-325f05252d53',  -- U16-MCQ-05  (+ Carbanion typo)
  'fff2ed55-8ee6-497a-9708-dd280d633bc4',  -- U16-MCQ-07
  '28007214-3f2f-4b6f-a7d7-27251a333d0a',  -- U17-MCQ-01
  '9d7c5e4e-1674-4e49-bf66-f71234c9391d',  -- U17-MCQ-04
  'fcc9441f-9a88-4e8b-9983-ea4fa122900a',  -- U17-MCQ-10
  '517b8626-e03c-4646-b9dc-c2920cdc5360',  -- U17-MCQ-15
  'f0912ff7-5c28-469e-95b7-31a003a7b3b1',  -- U21-MCQ-03
  'd3a99515-a10d-4096-a1be-248c36a5b06f',  -- U21-MCQ-12
  '5f5afbd4-93db-4ea6-8d8d-4110d3bd696b',  -- u22-mcq-10
  'ac459fd3-7aa2-436c-b02d-a379c622f62e',  -- u23-mcq-06
  'f0d41606-e588-42fd-beab-0784bff3eab0',  -- u23-mcq-15  (+ key change)
  'db2f5165-a66d-4137-a222-41957459b554'   -- u24-mcq-13
)
on conflict (id) do nothing;

-- Deleted rows: FULL row copy, so a rollback can re-insert them intact.
create table if not exists public._mcq_deleted_backup as
select *, now() as deleted_at from public.mcqs where false;

insert into public._mcq_deleted_backup
select m.*, now()
from public.mcqs m
where m.id in (
  'eaa6483d-c369-440d-9b0f-3cd2faa9885f',  -- u23-mcq-07  retired
  '338c3bc6-5991-4906-9e08-b52f52c2c6f3',  -- MCQ1   == CH1_MCQ01
  '9bb7790e-2146-4cbe-8dbf-544de5f8f764',  -- MCQ2   == CH1_MCQ02
  '253c8679-5f22-4fd3-b62f-aa9825c3c275',  -- MCQ4   == CH1_MCQ04
  'a191875f-fdc7-4490-a8b1-3a6fd09b16c5',  -- MCQ6   == CH1_MCQ06
  '0fc1bf28-27c2-48c6-9361-788b0ac2ed74',  -- MCQ8   == CH1_MCQ12
  'ee7a1869-c28a-4a57-b500-3ec092d3249e',  -- MCQ9   == CH1_MCQ08
  'ca66eb66-2add-4aa5-adb8-49f26245289c'   -- MCQ10  == CH1_MCQ09
)
and not exists (select 1 from public._mcq_deleted_backup b where b.id = m.id);


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — DUPLICATE OPTION REPAIRS
-- Two rows had two textually identical options, making them unanswerable.
-- ═════════════════════════════════════════════════════════════════════════════

-- CH8_MCQ06 · "The unit of Kw is:"   options b and c were both "mol2 dm-6".
-- Kw = [H+][OH-] so mol2 dm-6 (option c) is right; b becomes a wrong power.
update public.mcqs
set option_b = 'mol dm-6'
where id = 'fd594cb7-b49d-4e21-9eee-8ab6ed9c6b3b'
  and lower(trim(option_b)) = 'mol2 dm-6'
  and lower(trim(option_c)) = 'mol2 dm-6';

-- CH9_MCQ10 · "Which condition increases the rate of reaction?"
-- options b and d were identical; d is the key, so b becomes a real distractor.
update public.mcqs
set option_b = 'Decrease temperature and increase concentration'
where id = 'a5536b52-b39b-4cd1-acc7-ccaff2a347c4'
  and lower(trim(option_b)) = 'increase temperature and increase concentration';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — LETTER-REFERENCE OPTION REWRITES (13 rows, keys unchanged)
-- ═════════════════════════════════════════════════════════════════════════════

-- CH9_MCQ09 · key b "Increases". Old d "Both b and c" meant "increases AND
-- stays the same" — self-contradictory.
update public.mcqs set option_d = 'First increases, then decreases'
where id = '8f27f04a-6cde-43fa-bb53-38d46155d317'
  and lower(trim(option_d)) = 'both b and c';

-- CH10_MCQ11 · key c "Molality". Spelled-out combination; both molarity and
-- normality are volume-based and therefore temperature-dependent.
update public.mcqs set option_d = 'Molarity and normality'
where id = 'dca7f618-c71b-4255-9eea-6b2e0f3546ad'
  and lower(trim(option_d)) = 'both a and b';

-- U16-MCQ-05 · key c "Alkyl free radical". Carbanions and carbocations are the
-- HETEROLYTIC products, so they are wrong for homolytic fission.
update public.mcqs set option_d = 'Carbanion and carbocation'
where id = '914a0da0-cc28-4638-bd84-325f05252d53'
  and lower(trim(option_d)) = 'all of these';

-- U16-MCQ-05 · spelling: option a read "Carbonion".
update public.mcqs set option_a = 'Carbanion'
where id = '914a0da0-cc28-4638-bd84-325f05252d53'
  and lower(trim(option_a)) = 'carbonion';

-- U16-MCQ-07 · SPECIAL CASE. Here "none of these" was the CORRECT answer, so
-- it cannot simply be swapped for another wrong option or the item loses its
-- answer. but-1-ene is terminal, 2-methylbut-2-ene has one carbon bearing two
-- methyls, and 2-methylpropene is 1,1-disubstituted — none show cis/trans.
-- pent-2-ene (CH3-CH=CH-CH2CH3) does, so key d now points at real chemistry.
update public.mcqs set option_d = 'pent-2-ene'
where id = 'fff2ed55-8ee6-497a-9708-dd280d633bc4'
  and lower(trim(option_d)) = 'none of these';

-- U17-MCQ-01 · key a "tert-butyl alcohol". Plausible C4 alcohol, wrong skeleton.
update public.mcqs set option_d = 'isobutyl alcohol'
where id = '28007214-3f2f-4b6f-a7d7-27251a333d0a'
  and lower(trim(option_d)) = 'none of these';

-- U17-MCQ-04 · key a "Primary alkyl halide". Different halide class.
update public.mcqs set option_d = 'Vinyl halide'
where id = '9d7c5e4e-1674-4e49-bf66-f71234c9391d'
  and lower(trim(option_d)) = 'both a and b';

-- U17-MCQ-10 · key c "partial racemization". SN1 gives PARTIAL racemization
-- because of ion-pair shielding, so "complete" is the classic distractor.
update public.mcqs set option_d = 'Complete racemization'
where id = 'fcc9441f-9a88-4e8b-9983-ea4fa122900a'
  and lower(trim(option_d)) = 'none of these';

-- U17-MCQ-15 · key a "Elimination reaction". Real mechanism, wrong here.
update public.mcqs set option_d = 'Rearrangement reaction'
where id = '517b8626-e03c-4646-b9dc-c2920cdc5360'
  and lower(trim(option_d)) = 'all of these';

-- U21-MCQ-03 · key a "Glucose". Nucleotides join by phosphodiester bonds.
update public.mcqs set option_d = 'Nucleotides'
where id = 'f0912ff7-5c28-469e-95b7-31a003a7b3b1'
  and lower(trim(option_d)) = 'none of these';

-- U21-MCQ-12 · key a "Maltose". NOTE: deliberately NOT "cellobiose" — that is
-- also glucose + glucose and would create a second correct answer.
update public.mcqs set option_d = 'Sucrose and lactose'
where id = 'd3a99515-a10d-4096-a1be-248c36a5b06f'
  and lower(trim(option_d)) = 'all of these';

-- u22-mcq-10 · key c "nylon". Polystyrene is an addition polymer.
update public.mcqs set option_d = 'polystyrene'
where id = '5f5afbd4-93db-4ea6-8d8d-4110d3bd696b'
  and lower(trim(option_d)) = 'none of these';

-- u23-mcq-06 · key d. All three sources are genuine, so the key stays on d —
-- the text is simply spelled out instead of referring to a, b and c.
update public.mcqs set option_d = 'Fertilizers, biological decay and fossil fuel combustion'
where id = 'ac459fd3-7aa2-436c-b02d-a379c622f62e'
  and lower(trim(option_d)) = 'all of these';

-- u24-mcq-13 · key b "scissoring". NOTE: deliberately NOT "rocking" — rocking
-- IS an in-plane bend and would create a second correct answer. A stretching
-- mode is not a bending mode at all.
update public.mcqs set option_d = 'Symmetric stretching'
where id = 'db2f5165-a66d-4137-a222-41957459b554'
  and lower(trim(option_d)) = 'none of these';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — u23-mcq-15: TWO OPTION REWRITES + KEY CHANGE
--
-- "Ozone layer in upper atmosphere is being destroyed by:"
--   a) chlorofluorocarbons   b) freon   c) smog   d) "both a and b"  <- old key
--
-- Freon is a trade name FOR chlorofluorocarbons, so a and b named the same
-- substance and the old key was the only way to select both. Replacing b and d
-- with genuinely different pollutants leaves CFCs (a) as the single answer.
-- ═════════════════════════════════════════════════════════════════════════════

update public.mcqs set option_b = 'Carbon dioxide'
where id = 'f0d41606-e588-42fd-beab-0784bff3eab0'
  and lower(trim(option_b)) = 'freon';

update public.mcqs set option_d = 'Sulphur dioxide'
where id = 'f0d41606-e588-42fd-beab-0784bff3eab0'
  and lower(trim(option_d)) = 'both a and b';

update public.mcqs set correct_answer = 'a'
where id = 'f0d41606-e588-42fd-beab-0784bff3eab0'
  and lower(trim(correct_answer)) = 'd';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 4 — RETIRE u23-mcq-07
--
-- "Which statement is correct for a three-way catalytic converter?"
--   a) Reduces emission of unburnt HCs   b) Reduces pollutants
--   c) Oxidizes pollutant like CO        d) All of the above
--
-- Options a, b and c are each individually TRUE, so "all of the above" is the
-- only defensible key — which makes the item a giveaway. It is also a near
-- duplicate of u23-mcq-08, corrected in the previous migration. Retired rather
-- than patched.
-- ═════════════════════════════════════════════════════════════════════════════

delete from public.mcqs
where id = 'eaa6483d-c369-440d-9b0f-3cd2faa9885f';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 5 — DELETE 7 LEGACY UNIT 1 DUPLICATES
--
-- Each has identical question text AND an identical answer key to its
-- CH1_MCQ* twin, so no content is lost. The surviving copy additionally
-- carries a populated `explanation` (rendered to students at
-- app/quiz/page.tsx:1045) and states atomic masses in the stem; every legacy
-- MCQ* row has explanation = NULL.
--
-- Deliberately NOT deleted: MCQ3, MCQ5, MCQ7, MCQ11, MCQ12. MCQ5 and MCQ12
-- have no twin at all; MCQ3, MCQ7 and MCQ11 were matched only by inference
-- from added clauses, not by an exact scanner match. Left for a later pass.
-- ═════════════════════════════════════════════════════════════════════════════

delete from public.mcqs
where id in (
  '338c3bc6-5991-4906-9e08-b52f52c2c6f3',  -- MCQ1   == CH1_MCQ01  (both key d)
  '9bb7790e-2146-4cbe-8dbf-544de5f8f764',  -- MCQ2   == CH1_MCQ02  (both key d)
  '253c8679-5f22-4fd3-b62f-aa9825c3c275',  -- MCQ4   == CH1_MCQ04  (both key b)
  'a191875f-fdc7-4490-a8b1-3a6fd09b16c5',  -- MCQ6   == CH1_MCQ06  (both key c)
  '0fc1bf28-27c2-48c6-9361-788b0ac2ed74',  -- MCQ8   == CH1_MCQ12  (both key c)
  'ee7a1869-c28a-4a57-b500-3ec092d3249e',  -- MCQ9   == CH1_MCQ08  (both key b)
  'ca66eb66-2add-4aa5-adb8-49f26245289c'   -- MCQ10  == CH1_MCQ09  (both key c)
);

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Expect 359 (was 367; 8 rows deleted).
select count(*) as total_mcqs from public.mcqs;

-- 2. Expect 8 rows in the delete backup, and 0 of them still live.
select
  (select count(*) from public._mcq_deleted_backup)                                  as backed_up,
  (select count(*) from public.mcqs m join public._mcq_deleted_backup b on b.id = m.id) as still_present;

-- 3. Every edited row with its new option set. Eyeball option_d.
select
  m.mcq_id,
  m.correct_answer,
  case lower(m.correct_answer)
    when 'a' then m.option_a when 'b' then m.option_b
    when 'c' then m.option_c when 'd' then m.option_d
  end                                as keyed_option_text,
  m.option_d                         as new_option_d,
  b.option_d                         as old_option_d
from public.mcqs m
join public._mcq_structural_fix_backup b on b.id = m.id
order by m.mcq_id;

-- 4. Expect 0 rows. No option anywhere in the table may reference another
--    option by letter. This is the check that should now come back empty.
select mcq_id, option_a, option_b, option_c, option_d
from public.mcqs
where lower(option_a || ' | ' || option_b || ' | ' || option_c || ' | ' || option_d)
      ~ 'all of (the )?(above|these|them)|none of (the )?(above|these|them)|both [a-d] (and|&) [a-d]';

-- 5. Expect 0 rows. No row may have two identical options.
select mcq_id
from public.mcqs
where cardinality(array(
        select distinct lower(trim(x))
        from unnest(array[option_a, option_b, option_c, option_d]) as x
      )) <> 4;

-- 6. Expect 0 rows. No duplicate question text within a chapter.
select chapter_id, count(*) as copies, min(question) as question
from public.mcqs
group by chapter_id, lower(regexp_replace(question, '[^a-zA-Z0-9]+', ' ', 'g'))
having count(*) > 1;

-- 7. Expect 0 rows. Every key must still point at a non-blank option.
select mcq_id, correct_answer
from public.mcqs
where trim(coalesce(
  case lower(correct_answer)
    when 'a' then option_a when 'b' then option_b
    when 'c' then option_c when 'd' then option_d
  end, '')) = '';

-- After this lands, re-run:  node scripts/audit-mcqs.js
-- Expected: rows flagged 0, LETTER_REFERENCE 0, DUPLICATE_OPTION 0,
--           DUPLICATE_QUESTION 0 groups, rows scanned 374.


-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--
-- -- restore edited rows
-- update public.mcqs m
-- set option_a       = b.option_a,
--     option_b       = b.option_b,
--     option_c       = b.option_c,
--     option_d       = b.option_d,
--     correct_answer = b.correct_answer
-- from public._mcq_structural_fix_backup b
-- where m.id = b.id;
--
-- -- re-insert deleted rows
-- insert into public.mcqs
-- select id, chapter_id, mcq_id, question, option_a, option_b, option_c,
--        option_d, correct_answer, explanation, created_at
-- from public._mcq_deleted_backup
-- on conflict (id) do nothing;
--
-- drop table public._mcq_structural_fix_backup;
-- drop table public._mcq_deleted_backup;
