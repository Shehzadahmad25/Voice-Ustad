/**
 * app/api/generate-urdu/route.ts
 * ------------------------------
 * Generates Urdu TTS script (Anthropic) + MP3 audio (OpenAI) in one call.
 * Called by the chat page AFTER topic-view renders, so Vercel's 10s limit
 * on topic-view doesn't affect generation.
 *
 * maxDuration=60 covers ~5s Anthropic + ~8s OpenAI comfortably.
 *
 * POST { topicCode, topicTitle, definition, explanation, example, formula, flabel, chapterNumber }
 * Returns { ok: true, urduTtsText, audioBase64, duration }
 * If TTS fails: { ok: true, urduTtsText, audioBase64: null, duration }
 */

import { NextRequest, NextResponse }                from 'next/server';
import { generateDevUrduTts, sanitizeUrduTtsText } from '@/lib/agents/tools';
import { saveToCache }                              from '@/lib/qaCache';
import { postProcessUrduTts }                       from '@/lib/tts/teacherUrdu';
import { generateSpeech }                           from '@/lib/tts';

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

    const hasUrduChars = (raw.match(/[؀-ۿ]/g) || []).length >= 5;
    if (!raw || !hasUrduChars) {
      console.log('[generate-urdu] no Urdu content in response | preview:', raw?.slice(0, 80));
      return NextResponse.json({ ok: false, error: 'No Urdu content generated' }, { status: 500 });
    }

    const urduTtsText = postProcessUrduTts(sanitizeUrduTtsText(raw) || raw);
    console.log('[generate-urdu] step1 urdu script done, chars:', urduTtsText.length);

    // Step 2 — OpenAI TTS audio
    let audioBase64: string | null = null;
    try {
      const speechResult = await generateSpeech(urduTtsText);
      if (speechResult?.audioBuffer) {
        audioBase64 = Buffer.from(speechResult.audioBuffer).toString('base64');
        console.log('[generate-urdu] step2 audio done, bytes:', audioBase64.length);
      } else {
        console.log('[generate-urdu] step2 TTS disabled or returned null');
      }
    } catch (ttsErr) {
      console.error('[generate-urdu] step2 TTS failed:', ttsErr instanceof Error ? ttsErr.message : ttsErr);
    }

    const duration = Date.now() - t0;
    console.log('[generate-urdu] total ms:', duration);

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

    return NextResponse.json({ ok: true, urduTtsText, audioBase64, duration });

  } catch (err) {
    console.error('[generate-urdu] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
