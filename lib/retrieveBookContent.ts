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

import { getServiceClient } from '@/lib/supabase';
import type { QuestionType } from './classifyQuestionType';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrievedBlocks {
  definition:   string;
  explanation:  string;
  formula:      string;
  flabel:       string;
  example:      string;
  urduTtsText?: string;
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
  return getServiceClient();
}

// ── content_chunks row type ───────────────────────────────────────────────────

interface TopicRow {
  id:                string;
  chapter:           number;
  section:           string;
  term:              string;
  topic_slug:        string;
  page_ref:          number | null;
  book_definition:   string | null;
  guide_explanation: string | null;
  example_q:         string | null;
  formula:           string | null;
  keywords:          string[] | null;
}

const SELECT_COLS = 'id,chapter,section,term,topic_slug,page_ref,book_definition,guide_explanation,example_q,formula,keywords';

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

  // Strategy 1: exact term match (highest priority)
  for (const term of terms) {
    const { data } = await db
      .from('content_chunks')
      .select(SELECT_COLS)
      .eq('chapter', chapterNumber)
      .ilike('term', term)
      .limit(1);

    if (data?.[0]) {
      console.log(`[retrieveBookContent] EXACT MATCH via term — term="${term}" matched topic="${(data[0] as unknown as TopicRow).term}"`);
      return data[0] as unknown as TopicRow;
    }
  }

  // Strategy 2: partial term match — prefer longer (more specific) terms
  for (const term of terms) {
    const { data } = await db
      .from('content_chunks')
      .select(SELECT_COLS)
      .eq('chapter', chapterNumber)
      .ilike('term', `%${term}%`)
      .order('term', { ascending: false })
      .limit(1);

    if (data?.[0]) {
      console.log(`[retrieveBookContent] PARTIAL MATCH via term — term="${term}" matched topic="${(data[0] as unknown as TopicRow).term}"`);
      return data[0] as unknown as TopicRow;
    }
  }

  // Strategy 3: keywords array exact match
  for (const term of terms) {
    const { data } = await db
      .from('content_chunks')
      .select(SELECT_COLS)
      .eq('chapter', chapterNumber)
      .contains('keywords', [term])
      .limit(1);

    if (data?.[0]) {
      console.log(`[retrieveBookContent] MATCH via keywords — term="${term}" matched topic="${(data[0] as unknown as TopicRow).term}"`);
      return data[0] as unknown as TopicRow;
    }
  }

  // Strategy 4: compound-word pattern — split each term into tokens and build
  // '%word1%word2%' ilike pattern.  Catches cases like "limiting reagent" → '%limiting%reagent%'
  // matching DB rows named "Excess and Limiting Reagents" or "Identification of Limiting Reagent".
  const seenPatterns = new Set<string>();
  for (const term of terms) {
    const words = term.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    if (words.length < 2) continue;
    const pattern = '%' + words.join('%') + '%';
    if (seenPatterns.has(pattern)) continue;
    seenPatterns.add(pattern);

    const { data } = await db
      .from('content_chunks')
      .select(SELECT_COLS)
      .eq('chapter', chapterNumber)
      .ilike('term', pattern)
      .order('term', { ascending: false })
      .limit(1);

    if (data?.[0]) {
      console.log(`[retrieveBookContent] COMPOUND MATCH — pattern="${pattern}" matched topic="${(data[0] as unknown as TopicRow).term}"`);
      return data[0] as unknown as TopicRow;
    }
  }

  console.log(`[retrieveBookContent] NO MATCH — terms=${JSON.stringify(terms)} chapter=${chapterNumber}`);
  return null;
}

/** Maps a raw content_chunks row to RetrievedBlocks. Zero transformation — DB values only. */
function topicToBlocks(row: TopicRow): RetrievedBlocks {
  const formula = Array.isArray(row.formula)
    ? row.formula.join('\n')
    : (typeof row.formula === 'string' ? row.formula.trim() : '');
  const flabel  = formula ? row.term.toUpperCase() : '';

  return {
    definition:  (row.book_definition    ?? '').trim(),
    explanation: (row.guide_explanation  ?? '').trim(),
    formula,
    flabel,
    example:     (row.example_q          ?? '').trim(),
    urduTtsText: undefined,  // generated on-demand; not stored in content_chunks
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
  // Always prepend cleanQuery so the stripped phrase is tried before mapped chemistry terms
  const terms = cleanQuery
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
    console.log(`[retrieveBookContent] EMPTY FIELDS — topic matched but all content fields are null: "${row.term}"`);
    return { ...EMPTY_RESULT };
  }

  const chTitle = `Chapter ${row.chapter}`;

  console.log(`[retrieveBookContent] FOUND — topic="${row.term}" chapter="${chTitle}" page=${row.page_ref}`);

  return {
    found:         true,
    chapter:       chTitle,
    chapterNumber: row.chapter,
    topic:         row.term,
    page:          row.page_ref ?? null,
    blocks,
  };
}
