/**
 * /api/topic-view — database-driven topic overview, NO LLM
 * ---------------------------------------------------------
 * STRICT DATABASE MODE: queries ONLY the `topics` table.
 * Returns { ok: false, error: "Topic not found in database" } on miss.
 * Never calls any AI model.
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

    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'Topic not found in database' },
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
        definition:  result.definition,
        explanation: result.explanation,
        formula:     result.formula,
        flabel:      result.flabel,
        example:     result.example,
        urduTtsText: result.urduTtsText,
      },
    });

  } catch (err) {
    console.error('[topic-view] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
