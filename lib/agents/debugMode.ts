/**
 * lib/agents/debugMode.ts
 * -----------------------
 * DEBUG MODE — content verification tool.
 *
 * Fetches raw stored chapter/topic content from the database WITHOUT
 * any AI generation, summarization, or modification.
 *
 * Triggered by:
 *   - POST /api/chat2 with { mode: "debug", chapterNumber, topic? }
 *   - Or a chat message starting with "/debug" (handled in tutorAgent.ts)
 *
 * Returns formatted plain text showing every field exactly as stored.
 * If a field is missing it explicitly writes "MISSING IN DATABASE".
 */

import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

const MISSING = 'MISSING IN DATABASE';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DebugResult {
  debugMode:  true;
  output:     string;   // full formatted plain-text debug dump
  topicCount: number;
  chapterName: string;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Fetches all raw content for a chapter and formats it for verification.
 *
 * @param chapterNumber  1-based chapter/unit number
 * @param topicFilter    optional keyword — if provided, only matching topics shown
 */
export async function runDebugMode(
  chapterNumber: number,
  topicFilter?: string,
): Promise<DebugResult> {
  const db = getClient();

  // ── 1. Get chapter ───────────────────────────────────────────────────────────
  const { data: chapter, error: chapErr } = await db
    .from('chapters')
    .select('id, title, unit_number')
    .eq('unit_number', chapterNumber)
    .single();

  if (chapErr || !chapter) {
    const msg = `[DEBUG] Chapter ${chapterNumber} not found in database. Error: ${chapErr?.message ?? 'no data'}`;
    return { debugMode: true, output: msg, topicCount: 0, chapterName: '' };
  }

  const chapId    = chapter.id as string;
  const chapTitle = `Chapter ${chapter.unit_number}: ${chapter.title}`;

  // ── 2. Get all topics for chapter ────────────────────────────────────────────
  const { data: topics, error: topicsErr } = await db
    .from('topics')
    .select('id, section, title, content, page_number')
    .eq('chapter_id', chapId)
    .order('section');

  if (topicsErr || !topics?.length) {
    return {
      debugMode:   true,
      output:      `[DEBUG] ${chapTitle}\n\nNo topics found. Error: ${topicsErr?.message ?? 'empty'}`,
      topicCount:  0,
      chapterName: chapTitle,
    };
  }

  // ── 3. Get concepts, formulas, examples for chapter ──────────────────────────
  const [{ data: concepts }, { data: formulas }, { data: examples }] = await Promise.all([
    db.from('concepts').select('term, definition').eq('chapter_id', chapId).order('term'),
    db.from('formulas').select('name, formula, description').eq('chapter_id', chapId).order('name'),
    db.from('examples').select('title, content, page_start, page_end').eq('chapter_id', chapId).order('title'),
  ]);

  // ── 4. Filter topics if a keyword was given ──────────────────────────────────
  const kw = topicFilter?.toLowerCase().trim();
  const filteredTopics = kw
    ? topics.filter(t =>
        t.title?.toLowerCase().includes(kw) ||
        t.content?.toLowerCase().includes(kw) ||
        t.section?.toLowerCase().includes(kw),
      )
    : topics;

  if (kw && filteredTopics.length === 0) {
    return {
      debugMode:   true,
      output:      `[DEBUG] ${chapTitle}\n\nNo topics matched filter: "${topicFilter}"`,
      topicCount:  0,
      chapterName: chapTitle,
    };
  }

  // ── 5. Format output ─────────────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push(`╔══════════════════════════════════════════╗`);
  lines.push(`  DEBUG MODE — CONTENT VERIFICATION`);
  lines.push(`╚══════════════════════════════════════════╝`);
  lines.push(``);
  lines.push(`Chapter: ${chapTitle}`);
  if (kw) lines.push(`Filter:  "${topicFilter}"`);
  lines.push(`Topics shown: ${filteredTopics.length} / ${topics.length}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Topics
  filteredTopics.forEach((topic, i) => {
    lines.push(``);
    lines.push(`Topic ${i + 1}: [${topic.section ?? MISSING}] ${topic.title ?? MISSING}`);
    lines.push(`Page: ${topic.page_number ?? MISSING}`);
    lines.push(``);
    lines.push(`Content (raw):`);
    lines.push(topic.content ?? MISSING);
    lines.push(`──────────────────────────────────────────`);
  });

  // Concepts
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`CONCEPTS (concepts table) — total: ${concepts?.length ?? 0}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (!concepts?.length) {
    lines.push(MISSING);
  } else {
    concepts.forEach((c, i) => {
      lines.push(``);
      lines.push(`Concept ${i + 1}: ${c.term ?? MISSING}`);
      lines.push(`Definition: ${c.definition ?? MISSING}`);
    });
  }

  // Formulas
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`FORMULAS (formulas table) — total: ${formulas?.length ?? 0}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (!formulas?.length) {
    lines.push(MISSING);
  } else {
    formulas.forEach((f, i) => {
      lines.push(``);
      lines.push(`Formula ${i + 1}: ${f.name ?? MISSING}`);
      lines.push(`Formula:     ${f.formula ?? MISSING}`);
      lines.push(`Description: ${f.description ?? MISSING}`);
    });
  }

  // Examples
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`EXAMPLES (examples table) — total: ${examples?.length ?? 0}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (!examples?.length) {
    lines.push(MISSING);
  } else {
    examples.forEach((ex, i) => {
      const pg = (ex.page_start && ex.page_end)
        ? `pp. ${ex.page_start}–${ex.page_end}`
        : (ex.page_start ?? MISSING);
      lines.push(``);
      lines.push(`Example ${i + 1}: ${ex.title ?? MISSING}  (${pg})`);
      lines.push(ex.content ?? MISSING);
    });
  }

  lines.push(``);
  lines.push(`╔══════════════════════════════════════════╗`);
  lines.push(`  END OF DEBUG OUTPUT`);
  lines.push(`╚══════════════════════════════════════════╝`);

  return {
    debugMode:   true,
    output:      lines.join('\n'),
    topicCount:  filteredTopics.length,
    chapterName: chapTitle,
  };
}

// ── Parse /debug command ───────────────────────────────────────────────────────

/**
 * Parses a "/debug ..." chat message into { chapterNumber, topicFilter }.
 * Handles forms like:
 *   /debug
 *   /debug chapter 1
 *   /debug ch1
 *   /debug 1 stoichiometry
 *   /debug mole
 */
export function parseDebugCommand(message: string): {
  chapterNumber: number;
  topicFilter:   string | undefined;
} {
  const raw = message.replace(/^\/debug\s*/i, '').trim();

  // Extract chapter number
  const chMatch = raw.match(/(?:chapter\s*|ch\s*)?(\d+)/i);
  const chapterNumber = chMatch ? parseInt(chMatch[1], 10) : 1;

  // Remainder after the number is the topic filter
  const afterNum = raw.replace(/(?:chapter\s*|ch\s*)?\d+\s*/i, '').trim();
  const topicFilter = afterNum.length > 0 ? afterNum : undefined;

  return { chapterNumber, topicFilter };
}
