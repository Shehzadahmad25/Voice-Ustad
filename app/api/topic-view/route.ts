/**
 * /api/topic-view — database-driven topic overview, NO LLM
 * ---------------------------------------------------------
 * Reads from the same tables as retrieveBookContent:
 *   concepts, key_points, topics, formulas, examples
 *
 * POST { topicTitle: string, chapterNumber: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never serve stale cached responses for topic content

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getChapter(db: ReturnType<typeof getDb>, unitNumber: number) {
  const { data } = await db
    .from('chapters')
    .select('id, unit_number, title')
    .eq('unit_number', unitNumber)
    .single();
  return data ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body        = await request.json();
    const topicTitle  = String(body?.topicTitle  ?? '').trim();
    const chapterNumber = Number(body?.chapterNumber ?? 0);

    if (!topicTitle) {
      return NextResponse.json({ ok: false, error: 'topicTitle is required' }, { status: 400 });
    }

    const db = getDb();

    // ── Resolve chapter ───────────────────────────────────────────────────────
    let chapterId: string | null = null;
    let chapterTitle = '';

    if (chapterNumber > 0) {
      const ch = await getChapter(db, chapterNumber);
      if (ch) { chapterId = ch.id; chapterTitle = `Unit ${ch.unit_number} — ${ch.title}`; }
    }

    // Build search terms from the topic title
    const terms = topicTitle
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Helper: full-title match first, then individual-term fallback.
    // noTermFallback=true skips the per-word fallback — used for formulas so
    // "Excess Reagent" cannot accidentally pull in "Limiting Reagent" rows.
    async function firstMatch<T>(
      table: string,
      select: string,
      col: string,
      limit = 3,
      noTermFallback = false,
    ): Promise<T[]> {
      // Try exact topic title first
      let q = db.from(table).select(select).ilike(col, `%${topicTitle}%`).limit(limit);
      if (chapterId) q = q.eq('chapter_id', chapterId);
      const { data } = await q;
      if (data?.length) return data as T[];

      // Skip term fallback when caller opts out (formulas)
      if (noTermFallback) return [];

      // Fall back to individual terms (concepts, key_points, examples only)
      for (const term of terms) {
        let q2 = db.from(table).select(select).ilike(col, `%${term}%`).limit(limit);
        if (chapterId) q2 = q2.eq('chapter_id', chapterId);
        const { data: d2 } = await q2;
        if (d2?.length) return d2 as T[];
      }
      return [];
    }

    // ── Fetch all content types in parallel ───────────────────────────────────
    const [concepts, keyPoints, topicRows, formulaRows, exampleRows] = await Promise.all([
      firstMatch<{ term: string; definition: string }>('concepts', 'term,definition', 'term'),
      firstMatch<{ text: string }>('key_points', 'text', 'text', 6),
      firstMatch<{ title: string; content: string }>('topics', 'title,content', 'title'),
      // noTermFallback=true: formula must match the topic title directly
      firstMatch<{ name: string; formula: string; description: string }>('formulas', 'name,formula,description', 'name', 3, true),
      // limit=1: one worked example is enough for a topic card
      firstMatch<{ question: string; solution: string; answer: string; page_number: number }>('examples', 'question,solution,answer,page_number', 'question', 1),
    ]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Strip markdown bold/italic so the display layer sees plain text. */
    function stripMd(s: string): string {
      return s
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
        .trim();
    }

    // ── Assemble blocks ───────────────────────────────────────────────────────
    // Term shown in bold via CSS (.tv-sec-lbl), not markdown — strip ** wrappers.
    const definition = concepts
      .map((r) => `${stripMd(r.term)}: ${stripMd(r.definition)}`)
      .join('\n\n');

    const explanation = keyPoints.length
      ? keyPoints.map((r) => stripMd(r.text)).join('\n')
      : stripMd(topicRows[0]?.content ?? '');

    // Deduplicate formula descriptions: skip any description that is basically
    // a repeat of the concept definition (common in this DB — description often
    // mirrors the concept row).  A description longer than 120 chars or that
    // shares >60% of its words with the definition is suppressed.
    const defWords = new Set(
      definition.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3),
    );
    function isRedundantDesc(desc: string): boolean {
      if (!desc || desc.length < 20) return false;
      if (desc.length > 120) return true;   // suspiciously long descriptions repeat the definition
      const words = desc.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
      if (!words.length) return false;
      const overlap = words.filter((w) => defWords.has(w)).length;
      return overlap / words.length > 0.6;
    }

    const formulaParts = formulaRows.map((r) => {
      let s = r.formula;
      if (r.name) s = `${r.name}: ${s}`;
      if (r.description && !isRedundantDesc(r.description)) s += `\n${r.description}`;
      return s;
    });
    const formula = formulaParts.join('\n\n');

    const exampleParts = exampleRows.map((r) =>
      `Q: ${stripMd(r.question)}\nSolution: ${stripMd(r.solution)}\nAnswer: ${stripMd(r.answer)}`,
    );
    const example = exampleParts.join('\n\n');

    const hasContent = definition || explanation || formula || example;
    if (!hasContent) {
      return NextResponse.json(
        { ok: false, error: 'No content found for this topic' },
        { status: 200 },
      );
    }

    // ── Page range ────────────────────────────────────────────────────────────
    const pages = exampleRows
      .map((r) => Number(r.page_number))
      .filter((n) => Number.isFinite(n) && n > 0);
    const page_start = pages.length ? Math.min(...pages) : null;
    const page_end   = pages.length ? Math.max(...pages) : null;

    const resolvedTopic = concepts[0]?.term || topicRows[0]?.title || topicTitle;

    return NextResponse.json({
      ok: true,
      result: {
        mode:        'topic_view',
        chapter:     chapterTitle,
        topic:       resolvedTopic,
        page_start,
        page_end,
        definition,
        explanation,
        formula,
        example,
      },
    });

  } catch (err) {
    console.error('[topic-view] unhandled error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
