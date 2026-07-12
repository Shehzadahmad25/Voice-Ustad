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
 * Returns { ok: true, urduTtsText, audioBase64, audioUrl, duration }
 *   - audioBase64: inline MP3 for instant playback + browser cache
 *   - audioUrl: public tts-audio Storage URL — the ONLY value the client may
 *     persist to chat_messages.urdu_audio_url (base64 is never stored in DB)
 * If TTS fails: { ok: true, urduTtsText, audioBase64: null, audioUrl: null, duration }
 */

import { createHash }                               from 'crypto';
import { NextRequest, NextResponse }                from 'next/server';
import { generateDevUrduTts, sanitizeUrduTtsText } from '@/lib/agents/tools';
import { saveToCache }                              from '@/lib/qaCache';
import { getServiceClient }                         from '@/lib/supabase';
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

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[generate-urdu] ANTHROPIC_API_KEY is not set');
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured: ANTHROPIC_API_KEY is not set' },
        { status: 500 },
      );
    }

    // Throws with the Anthropic status on API errors — surfaced via the outer catch.
    const raw = await generateDevUrduTts(topic, definition, explanation, example || undefined, formula || undefined);

    const hasUrduChars = (raw.match(/[؀-ۿ]/g) || []).length >= 5;
    if (!raw || !hasUrduChars) {
      console.log('[generate-urdu] model returned non-Urdu content | preview:', raw?.slice(0, 80));
      return NextResponse.json(
        { ok: false, error: 'Model returned non-Urdu content (retry may help)' },
        { status: 500 },
      );
    }

    const urduTtsText = postProcessUrduTts(sanitizeUrduTtsText(raw) || raw);
    console.log('[generate-urdu] step1 urdu script done, chars:', urduTtsText.length);

    // Step 2 — OpenAI TTS audio
    let audioBase64: string | null = null;
    let audioUrl:    string | null = null;
    try {
      const speechResult = await generateSpeech(urduTtsText);
      if (speechResult?.audioBuffer) {
        audioBase64 = Buffer.from(speechResult.audioBuffer).toString('base64');
        console.log('[generate-urdu] step2 audio done, bytes:', audioBase64.length);

        // Step 3 — upload MP3 to Storage so the client persists a URL in
        // chat_messages.urdu_audio_url instead of the base64 payload.
        // Path is content-hashed: regenerating the same script overwrites the
        // same object (upsert), and identical scripts share one file.
        //
        // Concurrency note: Supabase Storage (S3-backed) object writes are
        // atomic per object — readers never see partial content, and two
        // simultaneous upserts to the same path are last-write-wins. Since the
        // path is derived from the script text, concurrent writers are by
        // construction uploading valid MP3 renders of the SAME script, so
        // whichever lands last is fine. Known low-risk edge case, no guard needed.
        const hash        = createHash('sha256').update(urduTtsText).digest('hex').slice(0, 16);
        const storagePath = `chat/gen-${hash}.mp3`;
        try {
          const { error: upErr } = await getServiceClient().storage
            .from('tts-audio')
            .upload(storagePath, Buffer.from(speechResult.audioBuffer), {
              contentType: 'audio/mpeg',
              upsert: true,
            });
          if (upErr) {
            // console.error so this is loud in Vercel runtime logs — audio still
            // plays inline this session, but the message row won't persist a URL.
            console.error(
              '[generate-urdu] step3 STORAGE UPLOAD FAILED (audio served inline, no URL persisted)',
              '| path:', storagePath,
              '| script chars:', urduTtsText.length,
              '| audio bytes:', speechResult.audioBuffer.byteLength,
              '| error:', upErr.message,
            );
          } else {
            audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tts-audio/${storagePath}`;
            console.log('[generate-urdu] step3 uploaded:', storagePath);
          }
        } catch (upEx) {
          console.error(
            '[generate-urdu] step3 STORAGE UPLOAD THREW (audio served inline, no URL persisted)',
            '| path:', storagePath,
            '| error:', upEx instanceof Error ? upEx.message : upEx,
          );
        }
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

    // audioBase64 kept in the response for instant playback + localStorage cache;
    // audioUrl is what the client persists to chat_messages (never base64).
    return NextResponse.json({ ok: true, urduTtsText, audioBase64, audioUrl, duration });

  } catch (err) {
    console.error('[generate-urdu] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
