/**
 * retrieveTopicContent
 * --------------------
 * Topic-View mode retrieval — used when a student clicks a topic in the sidebar.
 *
 * STRICT DATABASE MODE:
 *   Queries ONLY the `topics` table.
 *   Matches via topic_title ILIKE '%query%' OR keywords @> ARRAY[query].
 *   Returns null if no row is found — caller must NOT fall back to AI.
 *   Returns raw DB column values with no modification.
 */

import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TopicViewResult {
  found:         true;
  chapter:       string;
  chapterNumber: number;
  topic:         string;
  section:       string;
  page_start:    number | null;
  page_end:      number | null;
  definition:    string;
  explanation:   string;
  formula:       string;
  flabel:        string;
  example:       string;
  urduTtsText:   string;
}

// ── Supabase client ───────────────────────────────────────────────────────────

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── Topic row type ────────────────────────────────────────────────────────────

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

const SELECT_COLS =
  'id,chapter_number,chapter_title,topic_code,topic_title,page,' +
  'definition,explanation,example,formula,urdu_tts_text,keywords';

// ── Core lookup ───────────────────────────────────────────────────────────────

/**
 * Queries topics table with two strategies only:
 *   1. topic_title ILIKE '%query%'
 *   2. keywords @> ARRAY[query]  (exact keyword match)
 *
 * No definition/content text search — that causes false positives.
 * Returns null when no row matches.
 */
async function fetchTopicRow(
  chapterNumber: number,
  query:         string,
): Promise<TopicRow | null> {
  const db = getClient();
  const q  = query.toLowerCase().trim();

  // Strategy 1: topic_title ILIKE '%query%'
  const { data: titleData } = await db
    .from('topics')
    .select(SELECT_COLS)
    .eq('chapter_number', chapterNumber)
    .ilike('topic_title', `%${q}%`)
    .limit(1);

  if (titleData?.[0]) {
    console.log(`[retrieveTopicContent] MATCH via topic_title="${(titleData[0] as TopicRow).topic_title}" for query="${q}"`);
    return titleData[0] as TopicRow;
  }

  // Strategy 2: keywords @> ARRAY[query]
  const { data: kwData } = await db
    .from('topics')
    .select(SELECT_COLS)
    .eq('chapter_number', chapterNumber)
    .contains('keywords', [q])
    .limit(1);

  if (kwData?.[0]) {
    console.log(`[retrieveTopicContent] MATCH via keywords topic_title="${(kwData[0] as TopicRow).topic_title}" for query="${q}"`);
    return kwData[0] as TopicRow;
  }

  console.log(`[retrieveTopicContent] NO MATCH — query="${q}" chapter=${chapterNumber}`);
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Retrieves all content for a topic by title or keyword match.
 * Used exclusively for topic_view_mode (sidebar/scope topic clicks).
 *
 * Returns null when no matching topic exists in the database.
 * Caller must treat null as "not found" — no AI fallback permitted.
 *
 * All returned field values are exactly as stored in the database.
 * No reformatting, no AI enrichment, no text generation.
 *
 * @param query         - Topic title or search term from the user
 * @param chapterNumber - 1-based chapter number
 */
export async function retrieveTopicContent(
  query:         string,
  chapterNumber: number,
): Promise<TopicViewResult | null> {
  if (!query?.trim() || !chapterNumber || chapterNumber <= 0) return null;

  const row = await fetchTopicRow(chapterNumber, query.trim());
  if (!row) return null;

  const formula  = (row.formula      ?? '').trim();
  const chTitle  = row.chapter_title
    ? `Unit ${row.chapter_number} — ${row.chapter_title}`
    : `Chapter ${row.chapter_number}`;
  const page     = row.page ?? null;

  return {
    found:         true,
    chapter:       chTitle,
    chapterNumber: row.chapter_number,
    topic:         row.topic_title,
    section:       row.topic_code    ?? '',
    page_start:    page,
    page_end:      page,
    // Raw DB values — zero modification
    definition:    row.definition    ?? '',
    explanation:   row.explanation   ?? '',
    formula,
    flabel:        formula ? row.topic_title.toUpperCase() : '',
    example:       row.example       ?? '',
    urduTtsText:   row.urdu_tts_text ?? '',
  };
}
