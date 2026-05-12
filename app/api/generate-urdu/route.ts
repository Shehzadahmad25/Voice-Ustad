/**
 * app/api/generate-urdu/route.ts
 * ------------------------------
 * Generates Urdu TTS script for a topic card asynchronously.
 * Called by the chat page AFTER topic-view renders, so Vercel's 10s limit
 * on topic-view doesn't affect Urdu generation.
 *
 * maxDuration=60 gives Anthropic enough headroom to respond.
 *
 * POST { topicCode, topicTitle, definition, explanation, example, formula, flabel, chapterNumber }
 * Returns { ok: true, urduTtsText: string, duration: number }
 */

import { NextRequest, NextResponse }                from 'next/server';
import { generateDevUrduTts, sanitizeUrduTtsText,
         isEnglishResponse }                        from '@/lib/agents/tools';
import { saveToCache }                              from '@/lib/qaCache';
import { postProcessUrduTts }                       from '@/lib/tts/teacherUrdu';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const body         = await request.json();
    const topicCode    = String(body?.topicCode    ?? '').trim();
    const topicTitle   = String(body?.topicTitle   ?? '').trim();
    const definition   = String(body?.definition   ?? '').trim();
    const explanation  = String(body?.explanation  ?? '').trim();
    const example      = String(body?.example      ?? '').trim();
    const formula      = String(body?.formula      ?? '').trim();
    const flabel       = String(body?.flabel       ?? '').trim();
    const chapterNumber = Number(body?.chapterNumber ?? 0);

    if (!topicTitle && !topicCode) {
      return NextResponse.json({ ok: false, error: 'topicTitle or topicCode required' }, { status: 400 });
    }
    if (!definition && !explanation && !example) {
      return NextResponse.json({ ok: false, error: 'No content to generate Urdu from' }, { status: 400 });
    }

    const topic = topicTitle || topicCode;
    console.log('[generate-urdu] topic:', topic, '| chapterNumber:', chapterNumber);

    const raw = await generateDevUrduTts(topic, definition, explanation, example || undefined, formula || undefined);

    if (!raw || isEnglishResponse(raw)) {
      console.log('[generate-urdu] generation returned empty or English');
      return NextResponse.json({ ok: false, error: 'Urdu generation failed or returned English' }, { status: 500 });
    }

    const urduTtsText = postProcessUrduTts(sanitizeUrduTtsText(raw) || raw);
    const duration    = Date.now() - t0;
    console.log('[generate-urdu] done | chars:', urduTtsText.length, '| ms:', duration);

    // Fire-and-forget: persist to qa_cache so future topic-view requests find it cached
    if (CACHE_ENABLED && chapterNumber > 0) {
      saveToCache({
        originalQuestion: `[tv]:${topicCode || topicTitle}`,
        chapterNumber,
        topic,
        answerJson: {
          definition,
          explanation,
          example,
          formula,
          flabel,
          dur:         60,
          urduTtsText,
        },
        urduTtsText,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, urduTtsText, duration });

  } catch (err) {
    console.error('[generate-urdu] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
