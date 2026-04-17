/**
 * retrieveTopicContent
 * --------------------
 * Topic-View mode retrieval — distinct from question-mode retrieval.
 *
 * Fetches ALL content blocks for a topic from the unified `topics` table
 * (new schema). No multi-table joins. No concepts / formulas / examples tables.
 *
 * Match strategy (tried in order):
 *   1. topic_title ILIKE '%full title%'
 *   2. topic_title ILIKE '%term%'        — per extracted term
 *   3. keywords array contains term
 *   4. definition ILIKE '%term%'         — full-text fallback
 *
 * Used ONLY when a user clicks a topic from the sidebar or scope modal.
 * Never used for typed questions.
 */

import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TopicViewBlocks {
  definition:  string;
  explanation: string;
  formula:     string;
  flabel:      string;
  example:     string;
}

export interface TopicViewResult {
  found:         boolean;
  chapter:       string;
  chapterNumber: number | null;
  topic:         string;
  section:       string;
  page_start:    number | null;
  page_end:      number | null;
  blocks:        TopicViewBlocks;
}

const EMPTY: TopicViewResult = {
  found:         false,
  chapter:       '',
  chapterNumber: null,
  topic:         '',
  section:       '',
  page_start:    null,
  page_end:      null,
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

// ── Search term extraction ────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','of','in','on','at','to','and','or','is','are','was','were',
  'be','been','by','for','with','this','that','from','have','has','had',
  'not','but','what','how','why','when','where','which','its','it',
]);

function extractTopicTerms(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 4);
}

// ── Topic row lookup ──────────────────────────────────────────────────────────

async function fetchTopicRow(
  chapterNumber: number,
  topicTitle:   string,
  terms:        string[],
): Promise<TopicRow | null> {
  const db = getClient();

  // Strategy 1: exact topic title match
  {
    const { data } = await db
      .from('topics')
      .select(SELECT_COLS)
      .eq('chapter_number', chapterNumber)
      .ilike('topic_title', `%${topicTitle}%`)
      .limit(1);
    if (data?.[0]) return data[0] as TopicRow;
  }

  // Strategy 2: per-term topic_title match
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select(SELECT_COLS)
      .eq('chapter_number', chapterNumber)
      .ilike('topic_title', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0] as TopicRow;
  }

  // Strategy 3: keywords array overlap
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select(SELECT_COLS)
      .eq('chapter_number', chapterNumber)
      .contains('keywords', [term])
      .limit(1);
    if (data?.[0]) return data[0] as TopicRow;
  }

  // Strategy 4: definition full-text fallback
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select(SELECT_COLS)
      .eq('chapter_number', chapterNumber)
      .ilike('definition', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0] as TopicRow;
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Retrieves ALL content for a topic (not question-targeted).
 * Used exclusively for topic_view_mode (sidebar/scope topic clicks).
 *
 * @param topicTitle    - Clean topic title (e.g. "Mole and Avogadro's Number")
 * @param chapterNumber - 1-based unit number
 */
export async function retrieveTopicContent(
  topicTitle:    string,
  chapterNumber: number,
): Promise<TopicViewResult> {
  if (!topicTitle || !chapterNumber || chapterNumber <= 0) return { ...EMPTY };

  const terms = extractTopicTerms(topicTitle);
  if (terms.length === 0) return { ...EMPTY };

  const row = await fetchTopicRow(chapterNumber, topicTitle, terms);
  if (!row) return { ...EMPTY };

  const formula = (row.formula ?? '').trim();

  const hasAny =
    (row.definition ?? '').trim() ||
    (row.explanation ?? '').trim() ||
    formula ||
    (row.example ?? '').trim();

  if (!hasAny) return { ...EMPTY };

  const chTitle = row.chapter_title
    ? `Unit ${row.chapter_number} — ${row.chapter_title}`
    : `Chapter ${row.chapter_number}`;

  const page = row.page ?? null;

  return {
    found:         true,
    chapter:       chTitle,
    chapterNumber: row.chapter_number,
    topic:         row.topic_title,
    section:       row.topic_code || '',
    page_start:    page,
    page_end:      page,
    blocks: {
      definition:  (row.definition  ?? '').trim(),
      explanation: (row.explanation ?? '').trim(),
      formula,
      flabel:      formula ? row.topic_title.toUpperCase() : '',
      example:     (row.example     ?? '').trim(),
    },
  };
}
