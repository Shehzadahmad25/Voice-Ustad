-- ─────────────────────────────────────────────────────────────────────────────
-- Correct 13 factually mis-keyed MCQs (reviewed and approved row by row).
--
-- Each row below had a well-formed answer key pointing at a wrong option, so
-- scripts/audit-mcqs.js could not detect it (KEY_NOT_AN_OPTION = 0 across the
-- whole table). These were found by manual review; the corrections were
-- approved individually.
--
-- ORDERING IS LOAD-BEARING. Three of these rows also appear on the structural
-- "20 flagged rows" list because an option references other options by letter.
-- For those, the option TEXT must be rewritten before the key is repointed, or
-- the row ends up half-fixed with a key aimed at a banned option:
--
--     U17-MCQ-12   option d  "none of these"     -> "leaving-group ability"
--     u23-mcq-08   option d  "d) all"            -> spelled-out list
--     u24-mcq-12   option d  "all of the above"  -> spelled-out list
--
-- Step 1 does all option-text rewrites, step 3 does all key changes, and both
-- run inside one transaction — so those three rows can never be observed in a
-- half-fixed state.
--
-- EXPLANATIONS. mcqs.explanation is shown to students on the quiz results
-- screen (app/quiz/page.tsx:1045). Seven explanations are rewritten in step 2:
-- two were explicitly approved, and five more are included because they argue
-- for the OLD key and would contradict the corrected answer in front of a
-- student. Those five are marked [ADDED] — strike any you disagree with.
-- The remaining six explanations already describe the corrected answer
-- correctly and are left untouched.
--
-- CASE. Keys are written lowercase a-d. Units 22-24 currently store uppercase,
-- so this migration also normalises the rows it touches. It is therefore safe
-- to run before OR after 2026-07-normalize-mcq-answer-case.sql; the guards use
-- lower() so neither ordering breaks the other.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run (guards make a
-- second run a no-op).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Backup ───────────────────────────────────────────────────────────────────
-- Full snapshot of every touched row, so the whole change is reversible.

create table if not exists public._mcq_factual_fix_backup (
  id             uuid primary key,
  mcq_id         text,
  question       text,
  option_a       text,
  option_b       text,
  option_c       text,
  option_d       text,
  correct_answer text,
  explanation    text,
  backed_up_at   timestamptz not null default now()
);

insert into public._mcq_factual_fix_backup
  (id, mcq_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation)
select id, mcq_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation
from public.mcqs
where id in (
  '58eecd6f-ba55-4c71-baf4-3f0f37919f8a',  -- CH5_MCQ01
  'e90a8539-382f-4286-aaee-38f544b7aee3',  -- CH8_MCQ12
  '5c08e3a7-878b-4e4b-b019-280fc7a10167',  -- CH12_MCQ08
  'e3e3db72-bb00-4b97-a5b1-0a8deedc416d',  -- U17-MCQ-12
  'f1a508ff-0239-4d3f-9997-28f4cdcfde04',  -- u23-mcq-01
  'a6ca2eee-b35e-427b-8ad2-25a37e2db1c9',  -- u23-mcq-03
  '7f3c8545-d93b-491b-92df-72ef07970c9b',  -- u23-mcq-04
  '93414344-1644-412b-a75b-482a63255949',  -- u23-mcq-08
  '7b5027aa-d94a-4d2e-ac9e-98558c029eb0',  -- u23-mcq-12
  'cfcedb57-8fc4-4ac4-a182-ad2c44b11817',  -- u23-mcq-13
  '128b675a-4681-430d-9da0-eb2913b7935a',  -- u24-mcq-07
  '79c13f3a-4070-428f-bf87-a61220b537c5',  -- u24-mcq-08
  'c3c23f1d-c659-4c7a-95d8-b1acc1700973'   -- u24-mcq-12
)
on conflict (id) do nothing;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — OPTION TEXT REWRITES  (must precede every key change in step 3)
-- ═════════════════════════════════════════════════════════════════════════════

-- U17-MCQ-12 · "Which of the following will not affect the SN1 mechanism?"
-- Replace the banned "none of these". Leaving-group ability DOES affect SN1,
-- so it is a valid distractor and leaves c as the single correct answer.
update public.mcqs
set option_d = 'Leaving-group ability'
where id = 'e3e3db72-bb00-4b97-a5b1-0a8deedc416d'
  and lower(trim(option_d)) = 'none of these';

-- u23-mcq-08 · "Catalytic converter reduces the emission of:"
-- Option d was the malformed string "d) all" with its answer letter leaked in.
update public.mcqs
set option_d = 'Unburnt hydrocarbons, carbon monoxide and nitrogen oxides'
where id = '93414344-1644-412b-a75b-482a63255949'
  and lower(trim(option_d)) = 'd) all';

-- u24-mcq-12 · "Modern methods of analysis are superior to classical methods"
-- Replace the banned "all of the above" with the spelled-out combination.
update public.mcqs
set option_d = 'Greater accuracy, smaller sample size and shorter analysis time'
where id = 'c3c23f1d-c659-4c7a-95d8-b1acc1700973'
  and lower(trim(option_d)) = 'all of the above';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — EXPLANATION REWRITES
-- Shown to students on the results screen, so these must agree with the new key.
-- ═════════════════════════════════════════════════════════════════════════════

-- CH5_MCQ01 [APPROVED] — old text defended the intra-molecular reading.
update public.mcqs
set explanation = 'London dispersion forces, a type of van der Waals force, arise from instantaneous dipoles and act between every atom and molecule, including the monatomic noble gases. Intra-molecular forces are the bonds inside a molecule, not attractions between separate species, and do not exist for single atoms.'
where id = '58eecd6f-ba55-4c71-baf4-3f0f37919f8a';

-- u23-mcq-12 [APPROVED] — old text wrongly asserted that NO is coloured.
update public.mcqs
set explanation = 'Nitrogen dioxide (NO2) is a reddish-brown gas with a strong absorption band in the visible region, and it is what gives photochemical smog its brown tint. Nitric oxide (NO) is a colourless gas and does not absorb visible light.'
where id = '7b5027aa-d94a-4d2e-ac9e-98558c029eb0';

-- CH8_MCQ12 [ADDED] — old text argued for "strong base".
update public.mcqs
set explanation = 'pKa = -log(Ka), so a pKa of 9 means Ka = 10^-9. The substance donates a proton only very slightly, which makes it a weak acid. For comparison, a strong acid such as HCl has a pKa well below zero.'
where id = 'e90a8539-382f-4286-aaee-38f544b7aee3';

-- U17-MCQ-12 [ADDED] — old text described the right answer, then deferred to
-- the wrong key with "Based on the answer key: d."
update public.mcqs
set explanation = 'SN1 is first order: rate = k[RX]. The nucleophile attacks the carbocation only after the rate-determining ionisation step, so neither its nature nor its concentration changes the rate. Solvent polarity, carbocation stability and leaving-group ability all do affect it.'
where id = 'e3e3db72-bb00-4b97-a5b1-0a8deedc416d';

-- u23-mcq-04 [ADDED] — old text argued for ozonation.
update public.mcqs
set explanation = 'Chlorination is by far the most widely used method of disinfecting public water supplies, because it is cheap, simple and leaves a residual that keeps the water protected through the distribution network. Ozonation and UV are effective but far less common, and boiling is not practical at municipal scale.'
where id = '7f3c8545-d93b-491b-92df-72ef07970c9b';

-- u23-mcq-08 [ADDED] — old text conceded all three, then concluded
-- "Primary answer: unburnt hydrocarbons."
update public.mcqs
set explanation = 'A three-way catalytic converter performs three jobs at once: it oxidises unburnt hydrocarbons to CO2 and water, oxidises carbon monoxide to CO2, and reduces nitrogen oxides back to nitrogen. That is what the word three-way refers to.'
where id = '93414344-1644-412b-a75b-482a63255949';

-- u24-mcq-08 [ADDED] — old text was self-contradictory about cyclobutane.
update public.mcqs
set explanation = 'Butane, CH3-CH2-CH2-CH3, has two distinct proton environments (six methyl protons and four methylene protons) and so gives two signals. Methane, ethane and cyclobutane each have all their protons in one equivalent environment by symmetry, giving a single peak.'
where id = '79c13f3a-4070-428f-bf87-a61220b537c5';

-- u24-mcq-12 [ADDED] — old text referred to "all of the above", which step 1
-- has just rewritten.
update public.mcqs
set explanation = 'Modern instrumental methods such as UV-Vis, IR, NMR and mass spectrometry are superior on all three counts at once: they are more accurate, they need only a very small sample, and they are much faster than classical wet-chemical analysis.'
where id = 'c3c23f1d-c659-4c7a-95d8-b1acc1700973';

-- Not rewritten (already describe the corrected answer correctly):
--   CH12_MCQ08, u23-mcq-01, u23-mcq-03, u23-mcq-13, u24-mcq-07


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — ANSWER KEY CORRECTIONS
-- Each guarded on the expected old value, so a re-run is a no-op and a row that
-- someone else already changed is skipped rather than silently overwritten.
-- ═════════════════════════════════════════════════════════════════════════════

-- CH5_MCQ01 · forces between all kinds of atoms and molecules
-- a) Intra-molecular  ->  c) Van der Waals
update public.mcqs set correct_answer = 'c'
where id = '58eecd6f-ba55-4c71-baf4-3f0f37919f8a' and lower(trim(correct_answer)) = 'a';

-- CH8_MCQ12 · a solution with a pKa value of 9
-- d) Strong base  ->  b) Weak acid          (Ka = 10^-9)
update public.mcqs set correct_answer = 'b'
where id = 'e90a8539-382f-4286-aaee-38f544b7aee3' and lower(trim(correct_answer)) = 'd';

-- CH12_MCQ08 · Zn anode vs Cu, cathode vs Al
-- b) Zn < Al  ->  a) Zn > Al                (E red: Zn -0.76 V, Al -1.66 V)
update public.mcqs set correct_answer = 'a'
where id = '5c08e3a7-878b-4e4b-b019-280fc7a10167' and lower(trim(correct_answer)) = 'b';

-- U17-MCQ-12 · what will NOT affect the SN1 mechanism
-- d) none of these  ->  c) nature of nucleophile      [option d rewritten above]
update public.mcqs set correct_answer = 'c'
where id = 'e3e3db72-bb00-4b97-a5b1-0a8deedc416d' and lower(trim(correct_answer)) = 'd';

-- u23-mcq-01 · rain water becomes acidic below which pH
-- d) less than 5  ->  c) less than 5.6
update public.mcqs set correct_answer = 'c'
where id = 'f1a508ff-0239-4d3f-9997-28f4cdcfde04' and lower(trim(correct_answer)) = 'd';

-- u23-mcq-03 · commonly used coagulant for water purification
-- a) Ca(NO3)2  ->  c) Al2(SO4)3             (alum)
update public.mcqs set correct_answer = 'c'
where id = 'a6ca2eee-b35e-427b-8ad2-25a37e2db1c9' and lower(trim(correct_answer)) = 'a';

-- u23-mcq-04 · treatment MOSTLY used to kill pathogens in water
-- a) ozonation  ->  c) chlorination         ("mostly used" = most common)
update public.mcqs set correct_answer = 'c'
where id = '7f3c8545-d93b-491b-92df-72ef07970c9b' and lower(trim(correct_answer)) = 'a';

-- u23-mcq-08 · catalytic converter reduces the emission of
-- a) unburnt hydrocarbons  ->  d) all three  [option d rewritten above]
update public.mcqs set correct_answer = 'd'
where id = '93414344-1644-412b-a75b-482a63255949' and lower(trim(correct_answer)) = 'a';

-- u23-mcq-12 · which compound gives smoggy air its brown tint
-- a) NO  ->  d) NO2                          (NO is colourless)
update public.mcqs set correct_answer = 'd'
where id = '7b5027aa-d94a-4d2e-ac9e-98558c029eb0' and lower(trim(correct_answer)) = 'a';

-- u23-mcq-13 · photochemical smog is primarily caused by
-- d) CO2  ->  b) NO2                         (NO2 + hv -> NO + O)
update public.mcqs set correct_answer = 'b'
where id = 'cfcedb57-8fc4-4ac4-a182-ad2c44b11817' and lower(trim(correct_answer)) = 'd';

-- u24-mcq-07 · the wavelength of UV range
-- a) 400-800 nm  ->  d) 10-400 nm            (a is the VISIBLE range)
update public.mcqs set correct_answer = 'd'
where id = '128b675a-4681-430d-9da0-eb2913b7935a' and lower(trim(correct_answer)) = 'a';

-- u24-mcq-08 · hydrocarbon with more than one proton NMR peak
-- d) cyclobutane  ->  c) butane              (cyclobutane H are all equivalent)
update public.mcqs set correct_answer = 'c'
where id = '79c13f3a-4070-428f-bf87-a61220b537c5' and lower(trim(correct_answer)) = 'd';

-- u24-mcq-12 · why modern methods are superior
-- c) less time consuming  ->  d) all three   [option d rewritten above]
update public.mcqs set correct_answer = 'd'
where id = 'c3c23f1d-c659-4c7a-95d8-b1acc1700973' and lower(trim(correct_answer)) = 'c';

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Every touched row, with the option its key now points at.
--    Read the `keyed_option_text` column against the intended answer.
select
  m.mcq_id,
  m.correct_answer,
  case lower(m.correct_answer)
    when 'a' then m.option_a when 'b' then m.option_b
    when 'c' then m.option_c when 'd' then m.option_d
  end                                        as keyed_option_text,
  b.correct_answer                           as old_key,
  (m.explanation is distinct from b.explanation) as explanation_changed
from public.mcqs m
join public._mcq_factual_fix_backup b on b.id = m.id
order by m.mcq_id;

-- 2. Expect 13. Anything less means a guard did not match — inspect before
--    assuming success.
select count(*) as rows_changed
from public.mcqs m
join public._mcq_factual_fix_backup b on b.id = m.id
where m.correct_answer is distinct from b.correct_answer;

-- 3. Expect 0 rows. No touched row may still carry a letter-referencing option.
select mcq_id, option_a, option_b, option_c, option_d
from public.mcqs
where id in (select id from public._mcq_factual_fix_backup)
  and (
    lower(option_a) ~ 'all of (the )?(above|these)|none of (the )?(above|these)|both [a-d] and [a-d]' or
    lower(option_b) ~ 'all of (the )?(above|these)|none of (the )?(above|these)|both [a-d] and [a-d]' or
    lower(option_c) ~ 'all of (the )?(above|these)|none of (the )?(above|these)|both [a-d] and [a-d]' or
    lower(option_d) ~ 'all of (the )?(above|these)|none of (the )?(above|these)|both [a-d] and [a-d]'
  );

-- 4. Expect 0 rows. No key may point at a blank option.
select mcq_id
from public.mcqs
where id in (select id from public._mcq_factual_fix_backup)
  and trim(coalesce(
    case lower(correct_answer)
      when 'a' then option_a when 'b' then option_b
      when 'c' then option_c when 'd' then option_d
    end, '')) = '';

-- 5. Expect 0 rows. Every touched key must be a valid lowercase letter.
select mcq_id, correct_answer
from public.mcqs
where id in (select id from public._mcq_factual_fix_backup)
  and correct_answer not in ('a','b','c','d');

-- After this lands, re-run:  node scripts/audit-mcqs.js
-- LETTER_REFERENCE should drop from 17 to 14 (the three dual-listed rows fixed
-- here); the remaining 14 are handled by the separate fix-6 migration.


-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores all four columns on every touched row.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- update public.mcqs m
-- set correct_answer = b.correct_answer,
--     option_a       = b.option_a,
--     option_b       = b.option_b,
--     option_c       = b.option_c,
--     option_d       = b.option_d,
--     explanation    = b.explanation
-- from public._mcq_factual_fix_backup b
-- where m.id = b.id;
--
-- drop table public._mcq_factual_fix_backup;
