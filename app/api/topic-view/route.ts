/**
 * /api/topic-view — database-driven topic overview, NO LLM
 * ---------------------------------------------------------
 * Reads from the unified `topics` table (new schema).
 * No multi-table joins. No concepts / formulas / examples tables.
 *
 * POST { topicTitle: string, chapterNumber: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { retrieveTopicContent }      from '@/lib/retrieveTopicContent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body          = await request.json();
    const topicTitle    = String(body?.topicTitle    ?? '').trim();
    const chapterNumber = Number(body?.chapterNumber ?? 0);

    if (!topicTitle) {
      return NextResponse.json({ ok: false, error: 'topicTitle is required' }, { status: 400 });
    }

    const result = await retrieveTopicContent(topicTitle, chapterNumber);

    if (!result.found) {
      return NextResponse.json(
        { ok: false, error: 'No content found for this topic' },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      result: {
        mode:        'topic_view',
        chapter:     result.chapter,
        topic:       result.topic,
        section:     result.section,
        page_start:  result.page_start,
        page_end:    result.page_end,
        definition:  result.blocks.definition,
        explanation: result.blocks.explanation,
        formula:     result.blocks.formula,
        flabel:      result.blocks.flabel,
        example:     result.blocks.example,
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
