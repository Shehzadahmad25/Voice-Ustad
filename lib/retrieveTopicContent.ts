/**
 * retrieveTopicContent
 * --------------------
 * Topic-View mode retrieval — distinct from question-mode retrieval.
 *
 * Fetches ALL content blocks for a topic:
 *   - Definition   → first matching concept
 *   - Explanation  → ALL matching key_points concatenated (full, not one line)
 *   - Formula      → first matching formula
 *   - Example      → first matching worked example
 *   - Page range   → derived from the topics table or examples
 *
 * Used ONLY when a user clicks a topic from the sidebar or scope modal.
 * Never used for typed questions.
 */

import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TopicViewBlocks {
  definition: string;
  explanation: string;  // all matching key_points joined into one body
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
    .slice(0, 4); // top 4 meaningful words
}

// ── Chapter lookup ────────────────────────────────────────────────────────────

async function getChapter(unitNumber: number) {
  const db = getClient();
  const { data } = await db
    .from('chapters')
    .select('id, unit_number, title')
    .eq('unit_number', unitNumber)
    .single();
  return data ?? null;
}

// ── Per-type fetchers ─────────────────────────────────────────────────────────

async function fetchDefinition(
  chapterId: string,
  terms: string[],
): Promise<{ term: string; definition: string } | null> {
  const db = getClient();
  for (const term of terms) {
    const { data } = await db
      .from('concepts')
      .select('term, definition')
      .eq('chapter_id', chapterId)
      .ilike('term', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
  }
  // fallback: search inside definition text
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

/**
 * Fetch ALL matching key_points (up to 6) and concatenate as one paragraph.
 * This is the key difference from question-mode, which only returns 1 line.
 */
async function fetchAllExplanations(
  chapterId: string,
  terms: string[],
): Promise<string> {
  const db = getClient();
  const seen = new Set<string>();
  const rows: string[] = [];

  for (const term of terms) {
    const { data } = await db
      .from('key_points')
      .select('text, point_number')
      .eq('chapter_id', chapterId)
      .ilike('text', `%${term}%`)
      .order('point_number', { ascending: true })
      .limit(6);

    for (const row of data ?? []) {
      const t = String(row.text ?? '').trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        rows.push(t);
      }
    }
  }

  return rows.join(' ');
}

async function fetchFormula(
  chapterId: string,
  terms: string[],
): Promise<{ name: string; formula: string } | null> {
  const db = getClient();
  for (const term of terms) {
    const { data } = await db
      .from('formulas')
      .select('name, formula')
      .eq('chapter_id', chapterId)
      .ilike('name', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
  }
  for (const term of terms) {
    const { data } = await db
      .from('formulas')
      .select('name, formula')
      .eq('chapter_id', chapterId)
      .ilike('formula', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
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
  return null;
}

/** Get page range from examples table for the topic terms. */
async function getPageRange(
  chapterId: string,
  terms: string[],
): Promise<{ page_start: number | null; page_end: number | null }> {
  const db = getClient();
  const pages: number[] = [];

  for (const term of terms) {
    const { data } = await db
      .from('examples')
      .select('page_number')
      .eq('chapter_id', chapterId)
      .ilike('question', `%${term}%`)
      .limit(10);
    for (const row of data ?? []) {
      if (Number.isFinite(Number(row.page_number))) pages.push(Number(row.page_number));
    }
  }

  if (pages.length === 0) return { page_start: null, page_end: null };
  return { page_start: Math.min(...pages), page_end: Math.max(...pages) };
}

/** Get topic row from the topics table (for section label and any stored page info). */
async function getTopicRow(
  chapterId: string,
  terms: string[],
): Promise<{ section: string; title: string; page_start?: number; page_end?: number } | null> {
  const db = getClient();
  for (const term of terms) {
    const { data } = await db
      .from('topics')
      .select('section, title, page_start, page_end')
      .eq('chapter_id', chapterId)
      .ilike('title', `%${term}%`)
      .limit(1);
    if (data?.[0]) return data[0];
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
  topicTitle: string,
  chapterNumber: number,
): Promise<TopicViewResult> {
  if (!topicTitle || !chapterNumber || chapterNumber <= 0) return { ...EMPTY };

  const chapter = await getChapter(chapterNumber);
  if (!chapter) return { ...EMPTY };

  const chId    = chapter.id;
  const chTitle = `Unit ${chapter.unit_number} — ${chapter.title}`;
  const terms   = extractTopicTerms(topicTitle);
  if (terms.length === 0) return { ...EMPTY };

  // Fetch everything concurrently
  const [def, exp, frm, ex, topicRow, pageRange] = await Promise.all([
    fetchDefinition(chId, terms),
    fetchAllExplanations(chId, terms),
    fetchFormula(chId, terms),
    fetchExample(chId, terms),
    getTopicRow(chId, terms),
    getPageRange(chId, terms),
  ]);

  const hasAny = def || exp || frm || ex;
  if (!hasAny) return { ...EMPTY };

  // Prefer page range from examples; fall back to topics table columns
  const page_start =
    pageRange.page_start ??
    (topicRow?.page_start ? Number(topicRow.page_start) : null);
  const page_end =
    pageRange.page_end ??
    (topicRow?.page_end ? Number(topicRow.page_end) : null) ??
    page_start;

  return {
    found:         true,
    chapter:       chTitle,
    chapterNumber: chapter.unit_number,
    topic:         def?.term || topicRow?.title || topicTitle,
    section:       topicRow?.section || '',
    page_start,
    page_end,
    blocks: {
      definition:  def?.definition  ?? '',
      explanation: exp              ?? '',
      formula:     frm?.formula     ?? '',
      flabel:      frm?.name        ? frm.name.toUpperCase() : '',
      example:     ex
        ? `${ex.question} → ${ex.answer}` + (ex.solution ? ` (${ex.solution})` : '')
        : '',
    },
  };
}
