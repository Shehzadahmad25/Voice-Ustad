/**
 * retrieveBookContent
 * -------------------
 * PIPELINE STEP 2: User Question → DB (book content)
 *
 * Retrieves ONLY the content block(s) that match the question type.
 * Never returns unrelated topic content.
 * Never fallbacks to full chapter dumps.
 *
 * Maps question types to real Supabase tables:
 *   definition  → concepts      (term, definition)
 *   explanation → key_points    (text)
 *   formula     → formulas      (name, formula, description)
 *   example     → examples      (question, solution, answer, page_number)
 *   numerical   → examples + numerical_questions
 *   general     → one block from each table for the same matched topic
 */

import { createClient } from '@supabase/supabase-js';
import type { QuestionType } from './classifyQuestionType';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrievedBlocks {
  definition: string;
  explanation: string;
  formula: string;
  flabel: string;
  example: string;
}

export interface RetrievalResult {
  found: boolean;
  chapter: string;
  chapterNumber: number | null;
  topic: string;
  page: number | null;
  blocks: RetrievedBlocks;
}

const EMPTY_RESULT: RetrievalResult = {
  found: false,
  chapter: '',
  chapterNumber: null,
  topic: '',
  page: null,
  blocks: { definition: '', explanation: '', formula: '', flabel: '', example: '' },
};

// ── Supabase client ───────────────────────────────────────────────────────────

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── Keyword extraction ────────────────────────────────────────────────────────

const CHEMISTRY_TERM_MAP: Record<string, string> = {
  'mole': 'mole',
  'mol': 'mole',
  'moles': 'mole',
  'avogadro': 'avogadro',
  'avagadro': 'avogadro',
  'atomic mass': 'atomic mass',
  'atomic weight': 'atomic mass',
  'molecular mass': 'molecular mass',
  'molecular weight': 'molecular mass',
  'formula mass': 'formula mass',
  'molar mass': 'molar mass',
  'gram atom': 'gram atom',
  'gram-atom': 'gram atom',
  'stoichiometry': 'stoichiometry',
  'stoichiometric': 'stoichiometry',
  'limiting reagent': 'limiting reagent',
  'limiting reactant': 'limiting reagent',
  'excess reagent': 'excess reagent',
  'excess reactant': 'excess reagent',
  'percentage composition': 'percentage composition',
  'percent composition': 'percentage composition',
  'theoretical yield': 'theoretical yield',
  'actual yield': 'actual yield',
  'percent yield': 'percent yield',
  'percentage yield': 'percent yield',
  'stp': 'STP',
  'molar volume': 'molar volume',
};

function extractSearchTerms(question: string): string[] {
  const lower = question.toLowerCase();
  const found: string[] = [];

  // 1. Match multi-word chemistry terms first (longest match wins)
  const sortedKeys = Object.keys(CHEMISTRY_TERM_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      found.push(CHEMISTRY_TERM_MAP[key]);
    }
  }

  // 2. Add raw tokens as fallback (only if no chemistry term matched)
  if (found.length === 0) {
    lower
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .forEach((w) => found.push(w));
  }

  return [...new Set(found)];
}

// ── Chapter lookup ────────────────────────────────────────────────────────────

async function getChapterById(unitNumber: number) {
  const db = getClient();
  const { data } = await db
    .from('chapters')
    .select('id, unit_number, title, book_pages')
    .eq('unit_number', unitNumber)
    .single();
  return data ?? null;
}

// ── Per-type retrieval helpers ────────────────────────────────────────────────

async function fetchDefinition(
  chapterId: string,
  terms: string[],
): Promise<{ term: string; definition: string } | null> {
  const db = getClient();
  // Try each keyword — return the first exact or partial match
  for (const term of terms) {
    const { data } = await db
      .from('concepts')
      .select('term, definition')
      .eq('chapter_id', chapterId)
      .ilike('term', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
  }
  // Fallback: search inside definition text
  for (const term of terms) {
    const { data } = await db
      .from('concepts')
      .select('term, definition')
      .eq('chapter_id', chapterId)
      .ilike('definition', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

async function fetchExplanation(
  chapterId: string,
  terms: string[],
): Promise<string | null> {
  const db = getClient();
  const seen = new Set<string>();
  const rows: string[] = [];

  // Primary: key_points table
  for (const term of terms) {
    const { data } = await db
      .from('key_points')
      .select('text')
      .eq('chapter_id', chapterId)
      .ilike('text', `%${term}%`)
      .order('point_number', { ascending: true })
      .limit(5);
    for (const row of data ?? []) {
      const t = String(row.text ?? '').trim();
      if (t && !seen.has(t)) { seen.add(t); rows.push(t); }
    }
  }
  if (rows.length) return rows.join('\n');

  // Fallback: topics.content — our chunk upload stores explanation here
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select('content')
      .eq('chapter_id', chapterId)
      .ilike('title', `%${term}%`)
      .not('content', 'is', null)
      .limit(1);
    const content = String(data?.[0]?.content ?? '').trim();
    if (content) return content;
  }

  return null;
}

async function fetchFormula(
  chapterId: string,
  terms: string[],
): Promise<{ name: string; formula: string; description: string } | null> {
  const db = getClient();
  for (const term of terms) {
    // Search formula name
    const { data: byName } = await db
      .from('formulas')
      .select('name, formula, description')
      .eq('chapter_id', chapterId)
      .ilike('name', `%${term}%`)
      .limit(1);
    if (byName?.[0]) return byName[0];

    // Search formula expression
    const { data: byFormula } = await db
      .from('formulas')
      .select('name, formula, description')
      .eq('chapter_id', chapterId)
      .ilike('formula', `%${term}%`)
      .limit(1);
    if (byFormula?.[0]) return byFormula[0];
  }
  return null;
}

async function fetchExample(
  chapterId: string,
  terms: string[],
): Promise<{ question: string; solution: string; answer: string; page_number: number } | null> {
  const db = getClient();
  for (const term of terms) {
    const { data } = await db
      .from('examples')
      .select('question, solution, answer, page_number')
      .eq('chapter_id', chapterId)
      .ilike('question', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
  }
  // Fallback: search solution text
  for (const term of terms) {
    const { data } = await db
      .from('examples')
      .select('question, solution, answer, page_number')
      .eq('chapter_id', chapterId)
      .ilike('solution', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

async function fetchNumerical(
  chapterId: string,
  terms: string[],
): Promise<{ question: string; answer: string; page_number: number | null } | null> {
  const db = getClient();
  // First try worked examples (they have page numbers)
  const ex = await fetchExample(chapterId, terms);
  if (ex) return { question: ex.question, answer: `${ex.solution} Answer: ${ex.answer}`, page_number: ex.page_number };

  // Then try numerical_questions table
  for (const term of terms) {
    const { data } = await db
      .from('numerical_questions')
      .select('question, answer')
      .eq('chapter_id', chapterId)
      .ilike('question', `%${term}%`)
      .limit(1);
    if (data?.[0]) return { question: data[0].question, answer: data[0].answer, page_number: null };
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Retrieves only the content block(s) relevant to the question type.
 *
 * @param question      - Raw student question string
 * @param questionType  - Output of classifyQuestionType()
 * @param chapterNumber - 1-based unit number (e.g. 1 for Stoichiometry)
 */
export async function retrieveBookContent(
  question: string,
  questionType: QuestionType,
  chapterNumber: number,
): Promise<RetrievalResult> {
  if (!chapterNumber || chapterNumber <= 0) return { ...EMPTY_RESULT };

  const chapter = await getChapterById(chapterNumber);
  if (!chapter) return { ...EMPTY_RESULT };

  const terms = extractSearchTerms(question);
  if (terms.length === 0) return { ...EMPTY_RESULT };

  const chId = chapter.id;
  const chTitle = `Unit ${chapter.unit_number} — ${chapter.title}`;

  const blocks: RetrievedBlocks = {
    definition: '',
    explanation: '',
    formula: '',
    flabel: '',
    example: '',
  };

  let topic = '';
  let page: number | null = null;

  // ── Retrieve by question type (strict — no cross-type mixing) ──────────────

  if (questionType === 'definition') {
    const def = await fetchDefinition(chId, terms);
    if (!def) return { ...EMPTY_RESULT };
    blocks.definition = def.definition;
    topic = def.term;
  }

  else if (questionType === 'explanation') {
    const exp = await fetchExplanation(chId, terms);
    if (!exp) return { ...EMPTY_RESULT };
    blocks.explanation = exp;
    topic = terms[0] ?? '';
  }

  else if (questionType === 'formula') {
    const frm = await fetchFormula(chId, terms);
    if (!frm) return { ...EMPTY_RESULT };
    blocks.formula = frm.formula;
    blocks.flabel = frm.name.toUpperCase();
    topic = frm.name;
  }

  else if (questionType === 'example') {
    const ex = await fetchExample(chId, terms);
    if (!ex) return { ...EMPTY_RESULT };
    blocks.example = `${ex.question} → ${ex.answer}`;
    page = ex.page_number ?? null;
    topic = terms[0] ?? '';
  }

  else if (questionType === 'numerical') {
    const num = await fetchNumerical(chId, terms);
    if (!num) return { ...EMPTY_RESULT };
    blocks.example = `${num.question} → ${num.answer}`;
    page = num.page_number ?? null;
    topic = terms[0] ?? '';
  }

  else {
    // general — retrieve one block of each type from the same topic
    const [def, exp, frm, ex] = await Promise.all([
      fetchDefinition(chId, terms),
      fetchExplanation(chId, terms),
      fetchFormula(chId, terms),
      fetchExample(chId, terms),
    ]);

    if (!def && !exp && !frm && !ex) return { ...EMPTY_RESULT };

    if (def) { blocks.definition = def.definition; topic = def.term; }
    if (exp) blocks.explanation = exp;
    if (frm) { blocks.formula = frm.formula; blocks.flabel = frm.name.toUpperCase(); }
    if (ex)  { blocks.example = `${ex.question} → ${ex.answer}`; page = ex.page_number ?? null; }

    if (!topic) topic = terms[0] ?? '';
  }

  const hasAnyContent =
    blocks.definition || blocks.explanation || blocks.formula || blocks.example;

  if (!hasAnyContent) return { ...EMPTY_RESULT };

  return {
    found: true,
    chapter: chTitle,
    chapterNumber: chapter.unit_number,
    topic,
    page,
    blocks,
  };
}
