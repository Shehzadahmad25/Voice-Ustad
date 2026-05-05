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
import { createClient }              from '@supabase/supabase-js';
import { retrieveTopicContent }      from '@/lib/retrieveTopicContent';
import { sanitizeUrduTtsText } from '@/lib/agents/tools';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('[topic-view] OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY,
      process.env.OPENAI_API_KEY?.slice(0, 8));

    const body          = await request.json();
    const topicTitle    = String(body?.topicTitle    ?? '').trim();
    const topicCode     = String(body?.topicCode     ?? '').trim();
    const chapterNumber = Number(body?.chapterNumber ?? 0);

    if (!topicTitle && !topicCode) {
      return NextResponse.json({ ok: false, error: 'topicTitle or topicCode is required' }, { status: 400 });
    }

    console.log('[topic-view] request — title:', topicTitle, '| code:', topicCode, '| chapter:', chapterNumber);

    const result = await retrieveTopicContent(topicTitle, chapterNumber, topicCode);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'Topic not found in database' },
        { status: 200 },
      );
    }

    // guide_explanation (Roman Urdu) is used directly for TTS — no GPT-4o generation needed.
    // It is NEVER rendered as visible text; only sent to TTS API when play is tapped.
    const urduTtsText = sanitizeUrduTtsText(result.explanation) || '';
    console.log('[topic-view] urduTtsText from guide_explanation:', urduTtsText?.length ?? 0, 'chars');

    const responseResult = {
      mode:           'topic_view',
      chapter:        result.chapter,
      topic:          result.topic,
      section:        result.section,
      page_start:     result.page_start,
      page_end:       result.page_end,
      definition:     result.definition,
      formula:        result.formula,
      flabel:         result.flabel,
      example:        result.example,
      example_answer: result.example_answer,
      keywords:       result.keywords,
      urduTtsText,
      // explanation (guide_explanation) intentionally excluded — TTS only via urduTtsText
    };
    console.log('[topic-view] FINAL RESPONSE urduTtsText chars:', responseResult.urduTtsText?.length ?? 0);
    console.log('[topic-view] FINAL RESPONSE keys:', Object.keys(responseResult).join(', '));

    return NextResponse.json({ ok: true, result: responseResult });

  } catch (err) {
    console.error('[topic-view] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
