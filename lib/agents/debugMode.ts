/**
 * lib/agents/debugMode.ts
 * -----------------------
 * DEBUG MODE — content verification tool.
 *
 * Fetches raw stored chapter/topic content from the unified `topics` table
 * (new schema) WITHOUT any AI generation, summarization, or modification.
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
  debugMode:   true;
  output:      string;   // full formatted plain-text debug dump
  topicCount:  number;
  chapterName: string;
}

// ── Topic row type (new schema) ────────────────────────────────────────────────

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

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Fetches all raw content for a chapter from the topics table and formats it
 * for verification.
 *
 * @param chapterNumber  1-based chapter/unit number
 * @param topicFilter    optional keyword — if provided, only matching topics shown
 */
export async function runDebugMode(
  chapterNumber: number,
  topicFilter?: string,
): Promise<DebugResult> {
  const db = getClient();

  // ── 1. Get all topics for the chapter ────────────────────────────────────────
  const { data: topics, error: topicsErr } = await db
    .from('topics')
    .select('id,chapter_number,chapter_title,topic_code,topic_title,page,definition,explanation,example,formula,urdu_tts_text,keywords')
    .eq('chapter_number', chapterNumber)
    .order('topic_code');

  if (topicsErr || !topics?.length) {
    const msg = `[DEBUG] Chapter ${chapterNumber} — no topics found in database.\nError: ${topicsErr?.message ?? 'empty result'}`;
    return { debugMode: true, output: msg, topicCount: 0, chapterName: '' };
  }

  const firstRow = topics[0] as TopicRow;
  const chapTitle = firstRow.chapter_title
    ? `Unit ${chapterNumber}: ${firstRow.chapter_title}`
    : `Chapter ${chapterNumber}`;

  // ── 2. Apply topic filter ─────────────────────────────────────────────────────
  const kw = topicFilter?.toLowerCase().trim();
  const filteredTopics = kw
    ? (topics as TopicRow[]).filter((t) =>
        t.topic_title?.toLowerCase().includes(kw) ||
        t.definition?.toLowerCase().includes(kw)  ||
        t.topic_code?.toLowerCase().includes(kw)  ||
        t.keywords?.some((k) => k.toLowerCase().includes(kw)),
      )
    : (topics as TopicRow[]);

  if (kw && filteredTopics.length === 0) {
    return {
      debugMode:   true,
      output:      `[DEBUG] ${chapTitle}\n\nNo topics matched filter: "${topicFilter}"`,
      topicCount:  0,
      chapterName: chapTitle,
    };
  }

  // ── 3. Format output ──────────────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push(`╔══════════════════════════════════════════╗`);
  lines.push(`  DEBUG MODE — CONTENT VERIFICATION`);
  lines.push(`╚══════════════════════════════════════════╝`);
  lines.push(``);
  lines.push(`Chapter: ${chapTitle}`);
  if (kw) lines.push(`Filter:  "${topicFilter}"`);
  lines.push(`Topics shown: ${filteredTopics.length} / ${topics.length}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  filteredTopics.forEach((t, i) => {
    lines.push(``);
    lines.push(`Topic ${i + 1}: [${t.topic_code ?? MISSING}] ${t.topic_title ?? MISSING}`);
    lines.push(`Page:        ${t.page ?? MISSING}`);
    lines.push(`Keywords:    ${t.keywords?.length ? t.keywords.join(', ') : MISSING}`);
    lines.push(``);
    lines.push(`Definition:`);
    lines.push(t.definition ?? MISSING);
    lines.push(``);
    lines.push(`Explanation:`);
    lines.push(t.explanation ?? MISSING);
    lines.push(``);
    lines.push(`Formula:`);
    lines.push(t.formula ?? MISSING);
    lines.push(``);
    lines.push(`Example:`);
    lines.push(t.example ?? MISSING);
    lines.push(``);
    lines.push(`Urdu TTS Text:`);
    lines.push(t.urdu_tts_text ?? MISSING);
    lines.push(`──────────────────────────────────────────`);
  });

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
