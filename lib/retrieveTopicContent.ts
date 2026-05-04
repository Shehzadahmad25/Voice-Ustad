/**
 * retrieveTopicContent
 * --------------------
 * Topic-View mode retrieval — used when a student clicks a topic in the sidebar.
 *
 * STRICT DATABASE MODE:
 *   Queries ONLY the `content_chunks` table.
 *   Matches via topic_slug exact match, then term ILIKE, then keywords.
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

// ── content_chunks row type ───────────────────────────────────────────────────

interface ChunkRow {
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

const SELECT_COLS =
  'id,chapter,section,term,topic_slug,page_ref,' +
  'book_definition,guide_explanation,example_q,formula,keywords';

// ── Core lookup ───────────────────────────────────────────────────────────────

/**
 * Queries content_chunks with strategies in priority order:
 *   0. topic_slug exact match (highest priority — bypasses title search entirely)
 *   1. term ILIKE exact match
 *   2. term ILIKE partial match
 *   3. keywords @> ARRAY[query]
 *
 * Returns null when no row matches.
 */
async function fetchChunkRow(
  chapterNumber: number,
  query:         string,
  topicSlug?:    string,
): Promise<ChunkRow | null> {
  const db = getClient();
  const q  = query.toLowerCase().trim();

  console.log('[retrieveTopicContent] query:', query, '| topicSlug:', topicSlug || '(none)');

  // Strategy 0: direct slug lookup — exact match, no ambiguity
  if (topicSlug) {
    const { data } = await db
      .from('content_chunks')
      .select(SELECT_COLS)
      .eq('topic_slug', topicSlug)
      .limit(1);
    if (data?.[0]) {
      console.log(`[retrieveTopicContent] SLUG MATCH — "${(data[0] as unknown as unknown as ChunkRow).term}"`);
      return data[0] as unknown as unknown as ChunkRow;
    }
  }

  if (!q) return null;

  // Strategy 1: exact term match
  const { data: exactData } = await db
    .from('content_chunks')
    .select(SELECT_COLS)
    .eq('chapter', chapterNumber)
    .ilike('term', q)
    .limit(1);

  if (exactData?.[0]) {
    console.log(`[retrieveTopicContent] EXACT MATCH — "${(exactData[0] as unknown as ChunkRow).term}"`);
    return exactData[0] as unknown as ChunkRow;
  }

  // Strategy 2: partial term match, prefer longer (more specific) terms
  const { data: partialData } = await db
    .from('content_chunks')
    .select(SELECT_COLS)
    .eq('chapter', chapterNumber)
    .ilike('term', `%${q}%`)
    .order('term', { ascending: false })
    .limit(1);

  if (partialData?.[0]) {
    console.log(`[retrieveTopicContent] PARTIAL MATCH — "${(partialData[0] as unknown as ChunkRow).term}"`);
    return partialData[0] as unknown as ChunkRow;
  }

  // Strategy 3: keywords @> ARRAY[query]
  const { data: kwData } = await db
    .from('content_chunks')
    .select(SELECT_COLS)
    .eq('chapter', chapterNumber)
    .contains('keywords', [q])
    .limit(1);

  if (kwData?.[0]) {
    console.log(`[retrieveTopicContent] KEYWORD MATCH — "${(kwData[0] as unknown as ChunkRow).term}"`);
    return kwData[0] as unknown as ChunkRow;
  }

  console.log(`[retrieveTopicContent] NO MATCH — query="${q}" chapter=${chapterNumber}`);
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Retrieves all content for a topic by slug, title, or keyword match.
 * Used exclusively for topic_view_mode (sidebar/scope topic clicks).
 *
 * Returns null when no matching topic exists in the database.
 * Caller must treat null as "not found" — no AI fallback permitted.
 */
export async function retrieveTopicContent(
  query:      string,
  chapterNumber: number,
  topicSlug?: string,
): Promise<TopicViewResult | null> {
  if (!query?.trim() && !topicSlug?.trim()) return null;
  if (!topicSlug && (!chapterNumber || chapterNumber <= 0)) return null;

  const row = await fetchChunkRow(chapterNumber, query.trim(), topicSlug?.trim());
  if (!row) return null;

  const formula = (row.formula ?? '').trim();

  return {
    found:         true,
    chapter:       `Chapter ${row.chapter}`,
    chapterNumber: row.chapter,
    topic:         row.term,
    section:       row.topic_slug ?? row.section ?? '',
    page_start:    row.page_ref,
    page_end:      row.page_ref,
    definition:    row.book_definition    ?? '',
    explanation:   row.guide_explanation  ?? '',
    formula,
    flabel:        formula ? row.term.toUpperCase() : '',
    example:       row.example_q          ?? '',
    urduTtsText:   '',  // generated on-demand; not stored in content_chunks
  };
}
