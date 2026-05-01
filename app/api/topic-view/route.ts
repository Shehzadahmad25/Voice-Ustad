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
import { generateDevUrduTts, sanitizeUrduTtsText } from '@/lib/agents/tools';

const OPUS_MODEL = 'claude-opus-4-5-20251101';

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
    console.log('[topic-view] ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_API_KEY?.slice(0, 10));

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

    // Generate Urdu TTS text on-the-fly if the topics table doesn't have it yet.
    // 25-second window — Claude Sonnet typically takes 5–12 s for Urdu.
    let urduTtsText = result.urduTtsText;

    console.log('[topic-view] guard check —',
      'urduTtsText chars:', urduTtsText?.length ?? 0,
      '| definition chars:', result.definition?.length ?? 0,
      '| explanation chars:', result.explanation?.length ?? 0,
    );

    if (urduTtsText) {
      console.log('[topic-view] urduTtsText already cached — skipping generation | preview:', urduTtsText.slice(0, 80));
    } else if (result.definition || result.explanation) {
      console.log('[topic-view] urdu_tts_text empty — generating via Claude Opus');
      const englishAnswerText = [result.definition, result.explanation, result.example]
        .filter(Boolean).join(' ');
      try {
        const generated = await Promise.race([
          generateDevUrduTts(result.topic, result.definition, result.explanation, result.example || '', englishAnswerText, OPUS_MODEL),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 25_000)),
        ]);
        console.log('[topic-view] Claude Opus result length:', generated?.length,
          '| preview:', generated?.slice(0, 80));
        if (generated) {
          urduTtsText = sanitizeUrduTtsText(generated) || '';
          // Save to topics table so future requests skip generation
          getSupabase()
            .from('topics')
            .update({ urdu_tts_text: urduTtsText })
            .eq('topic_title', result.topic)
            .eq('chapter_number', chapterNumber)
            .then(({ error }) => {
              if (error) console.error('[topic-view] failed to save urduTtsText to topics:', error.message);
              else console.log('[topic-view] urduTtsText saved to topics table for:', result.topic);
            });
        }
      } catch (e) {
        console.error('[topic-view] Claude Opus generation failed:', e);
      }
    } else {
      console.log('[topic-view] SKIPPED — urduTtsText empty and no definition/explanation in DB');
    }

    console.log('[topic-view] urduTtsText in response:', urduTtsText?.length ?? 0, 'chars');

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
        urduTtsText,
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
