/**
 * lib/tts/openaiTTS.ts
 * --------------------
 * OpenAI TTS fallback — mirrors callOpenAIUrduSpeech() in app/api/chat2/route.ts.
 * Extracted here so lib/tts/index.ts can fall back to it without importing
 * from the route layer. The original function in route.ts is intentionally kept.
 *
 * Required env vars: OPENAI_API_KEY
 * Optional env vars: OPENAI_TTS_MODEL, OPENAI_TTS_VOICE
 */

export const OPENAI_TTS_VOICE_DEFAULT = 'alloy';
export const OPENAI_TTS_MODEL_DEFAULT = 'gpt-4o-mini-tts';

const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 25_000);

export async function synthesizeWithOpenAI(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('[openaiTTS] OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_TTS_MODEL || OPENAI_TTS_MODEL_DEFAULT;
  const voice = process.env.OPENAI_TTS_VOICE || OPENAI_TTS_VOICE_DEFAULT;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort('OpenAI TTS timeout'), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ model, voice, response_format: 'mp3', input: text }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`[openaiTTS] Request timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(tid);
  }

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`[openaiTTS] API error ${res.status}: ${errText}`);
  }

  return res.arrayBuffer();
}

/** Returns the voice/model identifiers used (for accurate cache metadata). */
export function getOpenAITtsMeta(): { voice: string; model: string } {
  return {
    voice: process.env.OPENAI_TTS_VOICE || OPENAI_TTS_VOICE_DEFAULT,
    model: process.env.OPENAI_TTS_MODEL || OPENAI_TTS_MODEL_DEFAULT,
  };
}
