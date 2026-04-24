/**
 * retrieveBookContent
 * -------------------
 * PIPELINE STEP 2: User Question → DB (book content)
 *
 * STRICT DATABASE MODE — queries ONLY the unified `topics` table.
 * No AI generation. No fallback. No content mixing.
 *
 * Match strategy (tried in order):
 *   1. topic_title ILIKE '%term%'      — title must contain the search term
 *   2. keywords array contains term    — exact keyword array match
 *
 * Strategy 3 (definition ILIKE) is intentionally removed.
 * It caused false positives: a Stoichiometry row whose definition
 * mentions "mole" would match a query about "mole concept", returning
 * the wrong topic. Title/keyword matching is strict and correct.
 *
 * If no topic matches → returns EMPTY_RESULT (found: false).
 * The caller (tutorAgent) must NOT fall back to AI on a miss.
 */

import { createClient } from '@supabase/supabase-js';
import type { QuestionType } from './classifyQuestionType';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrievedBlocks {
  definition:   string;
  explanation:  string;
  formula:      string;
  flabel:       string;
  example:      string;
  urduTtsText?: string;   // pre-stored Urdu TTS text from topics table
}

export interface RetrievalResult {
  found:         boolean;
  chapter:       string;
  chapterNumber: number | null;
  topic:         string;
  page:          number | null;
  blocks:        RetrievedBlocks;
}

const EMPTY_RESULT: RetrievalResult = {
  found:         false,
  chapter:       '',
  chapterNumber: null,
  topic:         '',
  page:          null,
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

// ── Topic row type (new schema) ───────────────────────────────────────────────

interface TopicRow {
  id:             string;
  chapter_number: number;
  chapter_title:  string;
  topic_code:     string;
  topic_title:    string;
  page:           number | null;
  definition:     string | null;
  explanation:    string | null;
  example:        string | null;
  formula:        string | null;
  urdu_tts_text:  string | null;
  keywords:       string[] | null;
}

const SELECT_COLS = 'id,chapter_number,chapter_title,topic_code,topic_title,page,definition,explanation,example,formula,urdu_tts_text,keywords';

// ── Keyword extraction ────────────────────────────────────────────────────────

const CHEMISTRY_TERM_MAP: Record<string, string> = {
  // ── Multi-word mappings (checked before single-word) ──────────────────────
  'mole calculations':                        'mole calculations',
  'mole calculation':                         'mole calculations',
  'number of moles':                          'mole calculations',
  'moles from mass':                          'mole calculations',
  'mole and chemical equations':              'mole and chemical equations',
  'mole chemical equations':                  'mole and chemical equations',
  'stoichiometric calculations':              'mole and chemical equations',
  'mole mole conversion':                     'mole and chemical equations',
  'mole mass conversion':                     'mole and chemical equations',
  'mass mass conversion':                     'mole and chemical equations',
  'calculations involving gases':             'calculations involving gases',
  'gas calculations':                         'calculations involving gases',
  'stp calculations':                         'calculations involving gases',
  'percentage composition':                   'percentage composition',
  'percent composition':                      'percentage composition',
  'mass percent':                             'percentage composition',
  'excess and limiting reagents':             'excess and limiting reagents',
  'identification of limiting reagent':       'identification of limiting reagent',
  'identify limiting reagent':                'identification of limiting reagent',
  'theoretical yield, actual yield and percentage yield': 'theoretical yield, actual yield and percentage yield',
  'theoretical yield':                        'theoretical yield, actual yield and percentage yield',
  'actual yield':                             'theoretical yield, actual yield and percentage yield',
  'percentage yield':                         'theoretical yield, actual yield and percentage yield',
  'percent yield':                            'theoretical yield, actual yield and percentage yield',
  "avogadro's number":                        "avogadro's number",
  'avogadro number':                          "avogadro's number",
  'first 20 elements reference table':        'first 20 elements reference table',
  'first 20 elements':                        'first 20 elements reference table',
  'elements table':                           'first 20 elements reference table',
  'periodic table elements':                  'first 20 elements reference table',
  'limiting reagent':                         'excess and limiting reagents',
  'limiting reactant':                        'excess and limiting reagents',
  'excess reagent':                           'excess and limiting reagents',
  'excess reactant':                          'excess and limiting reagents',
  'atomic mass':                              'atomic mass',
  'atomic weight':                            'atomic mass',
  'molecular mass':                           'molecular mass',
  'molecular weight':                         'molecular mass',
  'formula mass':                             'formula mass',
  'molar mass':                               'mole calculations',
  'molar volume':                             'calculations involving gases',
  'gram atom':                                'gram atom',
  'gram-atom':                                'gram atom',
  // ── Single-word mappings ──────────────────────────────────────────────────
  'mole':          'mole',
  'mol':           'mole',
  'moles':         'mole',
  'avogadro':      "avogadro's number",
  'avagadro':      "avogadro's number",
  'stoichiometry': 'stoichiometry',
  'stoichiometric':'stoichiometry',
  'stp':           'calculations involving gases',
};

function extractSearchTerms(question: string): string[] {
  const lower = question.toLowerCase();

  // Strip question words to get the clean topic phrase
  const cleanQuery = lower
    .replace(/^(what is|what are|explain|define|tell me about|describe|how does|what do you mean by)\s+/i, '')
    .replace(/\?$/, '')
    .trim();

  const found: string[] = [];

  // 1. Try full cleanQuery against map first (exact multi-word lookup)
  const fullTerm = CHEMISTRY_TERM_MAP[cleanQuery];
  if (fullTerm) found.push(fullTerm);

  // 2. Match all map keys present in the question, longest first
  const sortedKeys = Object.keys(CHEMISTRY_TERM_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      const mapped = CHEMISTRY_TERM_MAP[key];
      if (!found.includes(mapped)) found.push(mapped);
    }
  }

  // 3. Raw token fallback — only if nothing matched
  if (found.length === 0) {
    lower
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .forEach((w) => { if (!found.includes(w)) found.push(w); });
  }

  return found;
}

// ── Core topic lookup — STRICT title/keyword matching only ────────────────────

/**
 * Finds the best matching topic row for the given search terms.
 *
 * STRICT MODE — only two strategies:
 *   1. topic_title ILIKE '%term%'   — the topic title must contain the term
 *   2. keywords @> [term]           — the term must be an exact keyword on the row
 *
 * Strategy 3 (definition ILIKE) is REMOVED because it caused false positives:
 * e.g. the Stoichiometry topic mentions "mole" in its definition, so querying
 * "mole concept" would match Stoichiometry — completely wrong behaviour.
 */
async function fetchTopicByTerms(
  chapterNumber: number,
  terms: string[],
): Promise<TopicRow | null> {
  const db = getClient();

  // Strategy 1: exact topic_title match (highest priority)
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select(SELECT_COLS)
      .eq('chapter_number', chapterNumber)
      .ilike('topic_title', term)
      .limit(1);

    if (data?.[0]) {
      console.log(`[retrieveBookContent] EXACT MATCH via topic_title — term="${term}" matched topic="${(data[0] as TopicRow).topic_title}"`);
      return data[0] as TopicRow;
    }
  }

  // Strategy 2: partial topic_title match — prefer longer (more specific) titles
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select(SELECT_COLS)
      .eq('chapter_number', chapterNumber)
      .ilike('topic_title', `%${term}%`)
      .order('topic_title', { ascending: false })
      .limit(1);

    if (data?.[0]) {
      console.log(`[retrieveBookContent] PARTIAL MATCH via topic_title — term="${term}" matched topic="${(data[0] as TopicRow).topic_title}"`);
      return data[0] as TopicRow;
    }
  }

  // Strategy 3: keywords array exact match
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select(SELECT_COLS)
      .eq('chapter_number', chapterNumber)
      .contains('keywords', [term])
      .limit(1);

    if (data?.[0]) {
      console.log(`[retrieveBookContent] MATCH via keywords — term="${term}" matched topic="${(data[0] as TopicRow).topic_title}"`);
      return data[0] as TopicRow;
    }
  }

  // No match in title or keywords — do NOT fall back to definition search
  console.log(`[retrieveBookContent] NO MATCH — terms=${JSON.stringify(terms)} chapter=${chapterNumber}`);
  return null;
}

/** Maps a raw topic row to RetrievedBlocks. Zero transformation — DB values only. */
function topicToBlocks(row: TopicRow): RetrievedBlocks {
  const formula = (row.formula ?? '').trim();
  const flabel  = formula ? row.topic_title.toUpperCase() : '';

  return {
    definition:  (row.definition    ?? '').trim(),
    explanation: (row.explanation   ?? '').trim(),
    formula,
    flabel,
    example:     (row.example       ?? '').trim(),
    urduTtsText: (row.urdu_tts_text ?? '').trim() || undefined,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Retrieves the content block(s) for the given question.
 *
 * STRICT DATABASE MODE:
 * - Only queries `topics` table (title + keyword match)
 * - Returns EMPTY_RESULT (found: false) when no match — never returns partial data
 * - Caller must treat found=false as "no answer available" and NOT invoke AI
 *
 * @param question      - Raw student question string
 * @param questionType  - Output of classifyQuestionType()
 * @param chapterNumber - 1-based chapter number
 */
export async function retrieveBookContent(
  question:      string,
  questionType:  QuestionType,
  chapterNumber: number,
): Promise<RetrievalResult> {
  if (!chapterNumber || chapterNumber <= 0) {
    console.log(`[retrieveBookContent] SKIP — no chapter number`);
    return { ...EMPTY_RESULT };
  }

  // Strip question words to get the raw topic phrase (preserves multi-word names)
  const cleanQuery = question
    .toLowerCase()
    .replace(/^(what is|what are|explain|define|tell me about|describe|how does|what do you mean by)\s+/i, '')
    .replace(/\?$/, '')
    .trim();

  console.log('[retrieveBookContent] raw user question:', question);
  console.log('[retrieveBookContent] cleaned query:', cleanQuery);

  const baseTerms = extractSearchTerms(question);
  // Prepend cleanQuery so multi-word phrase is tried first before individual chemistry terms
  const terms = cleanQuery && cleanQuery !== question.toLowerCase().replace(/\?$/, '').trim()
    ? [cleanQuery, ...baseTerms.filter(t => t !== cleanQuery)]
    : baseTerms;

  if (terms.length === 0) {
    console.log(`[retrieveBookContent] SKIP — could not extract search terms from: "${question}"`);
    return { ...EMPTY_RESULT };
  }

  console.log(`[retrieveBookContent] extracted query term: "${cleanQuery}" — full terms=${JSON.stringify(terms)} type=${questionType} chapter=${chapterNumber}`);

  const row = await fetchTopicByTerms(chapterNumber, terms);
  if (!row) return { ...EMPTY_RESULT };

  const blocks = topicToBlocks(row);

  // For strict question types, only return if the relevant block is non-empty
  if (questionType === 'definition'  && !blocks.definition)  return { ...EMPTY_RESULT };
  if (questionType === 'explanation' && !blocks.explanation) return { ...EMPTY_RESULT };
  if (questionType === 'formula'     && !blocks.formula)     return { ...EMPTY_RESULT };
  if (questionType === 'example'     && !blocks.example)     return { ...EMPTY_RESULT };
  if (questionType === 'numerical'   && !blocks.example)     return { ...EMPTY_RESULT };

  const hasAnyContent =
    blocks.definition || blocks.explanation || blocks.formula || blocks.example;
  if (!hasAnyContent) {
    console.log(`[retrieveBookContent] EMPTY FIELDS — topic matched but all content fields are null: "${row.topic_title}"`);
    return { ...EMPTY_RESULT };
  }

  const chTitle = row.chapter_title
    ? `Unit ${row.chapter_number} — ${row.chapter_title}`
    : `Chapter ${row.chapter_number}`;

  console.log(`[retrieveBookContent] FOUND — topic="${row.topic_title}" chapter="${chTitle}" page=${row.page}`);

  return {
    found:         true,
    chapter:       chTitle,
    chapterNumber: row.chapter_number,
    topic:         row.topic_title,
    page:          row.page ?? null,
    blocks,
  };
}
