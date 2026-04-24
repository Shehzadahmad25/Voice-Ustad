/**
 * app/api/chat2/route.ts
 * ----------------------
 * HTTP handler for the VoiceUstad chat API.
 *
 * Two modes (selected by request body field "mode"):
 *
 *   mode=chat  (default)
 *     Accepts: { message, chapter, chapterNumber, history }
 *     Delegates entirely to runTutorAgent() — all business logic lives there.
 *     Returns: structured answer + Urdu TTS text + optional cached audio URL.
 *
 *   mode=audio
 *     Accepts: { urduSummary, question, chapterNumber, cacheId, voice? }
 *     Generates MP3 audio from the Urdu text via Azure TTS (OpenAI fallback).
 *     Uploads audio to Supabase Storage and patches the qa_cache row.
 *     Returns: { ok: true, audioBase64 }
 *
 * This file is intentionally thin — it handles only HTTP concerns:
 *   auth, rate limiting, input validation, error formatting.
 * All answer logic lives in lib/agents/tutorAgent.ts.
 */

import { NextRequest, NextResponse }          from 'next/server';
import { checkRateLimit }                     from '@/lib/rateLimit';
import { saveAudioToCache, saveAudioToCacheById, logCacheEvent } from '@/lib/qaCache';
import { generateSpeech, VOICE_MAP }          from '@/lib/tts';
import { sanitizeUrduTtsText, MAX_TTS_CHARS } from '@/lib/agents/tools';
import { runTutorAgent }                      from '@/lib/agents/tutorAgent';
import { runDebugMode }                       from '@/lib/agents/debugMode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never serve stale cached responses for chat/audio

/**
 * Cache kill-switch for development.
 * Default: OFF — set CACHE_ENABLED=true in .env.local to re-enable at launch.
 */
const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';

const URDU_TTS_ENABLED = process.env.URDU_TTS_ENABLED === 'true'; // default false

// ── Request auth ───────────────────────────────────────────────────────────────

function checkDemoKey(request: NextRequest): boolean {
  const key = process.env.DEMO_ACCESS_KEY;
  if (!key) return true;
  return request.nextUrl.searchParams.get('demo') === key
      || request.headers.get('x-demo-key') === key;
}

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
}

// ── Conversation history formatter ────────────────────────────────────────────

function buildRecentContext(history: unknown): string {
  if (!Array.isArray(history)) return '';
  return history
    .filter((m) => m && (m.type === 'user' || m.type === 'ai'))
    .slice(-6)
    .map((m) => {
      if (m.type === 'user') return `User: ${String(m.text || '').trim()}`;
      const r       = m.response;
      const aiText  = r?.definition || r?.text || '';
      const aiExtra = r?.explanation
        || (Array.isArray(r?.points) ? r.points.slice(0, 2).join(' | ') : '');
      const combined = [aiText, aiExtra].filter(Boolean).join(' | ');
      return combined ? `Assistant: ${combined}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

// ── Audio helpers (audio mode only) ──────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

/**
 * Original OpenAI TTS function — kept as reference and preserved per project rules.
 * Audio generation now routes through generateSpeech() (Azure primary, OpenAI fallback).
 */
async function callOpenAIUrduSpeech(inputText: string): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const model       = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice       = process.env.OPENAI_TTS_VOICE || 'alloy';
  const timeoutMs   = Number(process.env.OPENAI_TIMEOUT_MS || 25_000);
  const controller  = new AbortController();
  const tid         = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal:  controller.signal,
      body:    JSON.stringify({ model, voice, response_format: 'mp3', input: inputText }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new Error(`OpenAI speech timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(tid);
  }
  if (!res.ok) throw new Error(`OpenAI speech error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.arrayBuffer();
}

// ── Config ─────────────────────────────────────────────────────────────────────

const MAX_MESSAGE_CHARS = Number(process.env.CHAT_MAX_MESSAGE_CHARS || 400);

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    if (!checkDemoKey(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const mode = String(body?.mode ?? 'chat').trim().toLowerCase();
    const ip   = getIp(request);

    const rlKey = mode === 'audio' ? `tts:${ip}` : `chat2:${ip}`;
    const rl    = checkRateLimit(rlKey, mode === 'audio' ? 30 : 20);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests', retryAfterMs: rl.retryAfterMs },
        { status: 429 },
      );
    }

    console.log(`[chat2] ip=${ip} mode=${mode}`);

    // ── Audio mode ─────────────────────────────────────────────────────────────
    if (mode === 'audio') {
      const urduSummary    = sanitizeUrduTtsText(String(body?.urduSummary ?? '').trim());
      const audioCacheId   = String(body?.cacheId   ?? '').trim() || null;
      const audioQuestion  = String(body?.question  ?? '').trim();
      const audioChapterNo = Number(body?.chapterNumber ?? 0);

      if (!urduSummary) {
        return NextResponse.json({ ok: false, error: 'urduSummary is required.' }, { status: 400 });
      }
      if (urduSummary.length > MAX_TTS_CHARS) {
        return NextResponse.json(
          { ok: false, error: `TTS text too long. Max ${MAX_TTS_CHARS} characters.` },
          { status: 400 },
        );
      }

      if (!URDU_TTS_ENABLED) {
        console.log('[tts] DISABLED — enable with URDU_TTS_ENABLED=true');
        return NextResponse.json({ ok: true, audioBase64: null }, { status: 200 });
      }

      try {
        // Optional voice override for testing: voice="asad"|"uzma"|"english"
        const voiceKey      = String(body?.voice ?? '').trim().toLowerCase();
        const voiceOverride = VOICE_MAP[voiceKey];
        if (voiceOverride) {
          console.log('[tts] voice override:', voiceKey, '→', voiceOverride);
        }

        const speechResult = await generateSpeech(urduSummary, voiceOverride);
        if (!speechResult) {
          return NextResponse.json({ ok: true, audioBase64: null }, { status: 200 });
        }
        const { audioBuffer, voice: ttsVoice, model: ttsModel } = speechResult;
        const audioBase64 = bufferToBase64(audioBuffer);

        // Fire-and-forget: upload to Supabase Storage + patch cache row
        if (CACHE_ENABLED) {
          if (audioCacheId && audioQuestion && audioChapterNo > 0) {
            saveAudioToCacheById(audioCacheId, audioQuestion, audioChapterNo, audioBuffer, ttsVoice, ttsModel)
              .catch(() => {});
            logCacheEvent({
              question: audioQuestion, chapterNumber: audioChapterNo,
              resultType: 'audio_generated', similarity: 0, hadAudio: false,
            }).catch(() => {});
          } else if (audioQuestion && audioChapterNo > 0) {
            saveAudioToCache(audioQuestion, audioChapterNo, audioBuffer, ttsVoice, ttsModel)
              .catch(() => {});
          }
        }

        return NextResponse.json({ ok: true, audioBase64 }, { status: 200 });
      } catch (err) {
        return NextResponse.json(
          { ok: false, error: err instanceof Error ? err.message : 'TTS generation failed' },
          { status: 500 },
        );
      }
    }

    // ── Debug mode ─────────────────────────────────────────────────────────────
    if (mode === 'debug') {
      const chapterNumber = Number(body?.chapterNumber ?? 1);
      const debugOutput   = await runDebugMode(chapterNumber);
      return NextResponse.json({ ok: true, output: debugOutput, debugMode: true }, { status: 200 });
    }

    // ── Chat mode ──────────────────────────────────────────────────────────────
    const message       = String(body?.message ?? '').trim();
    const chapter       = String(body?.chapter ?? '').trim();
    const chapterNumber = Number(body?.chapterNumber ?? 0);

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message is required.' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Message too long. Max ${MAX_MESSAGE_CHARS} characters.` },
        { status: 400 },
      );
    }

    const recentContext = buildRecentContext(body?.history);

    const result = await runTutorAgent({ message, chapter, chapterNumber, recentContext });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}
