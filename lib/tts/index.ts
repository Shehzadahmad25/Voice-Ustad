/**
 * lib/tts/index.ts
 * ----------------
 * Provider router for TTS generation.
 *
 * Current: OpenAI TTS primary (model=tts-1-hd, voice=onyx — male Pakistani ustad tone)
 *
 * AZURE TTS — disabled, keeping for reference.
 * Re-enable by un-commenting the Azure block below and removing the OpenAI block.
 */

// AZURE TTS — disabled, keeping for reference
// import { synthesizeUrduSpeech, AZURE_VOICE_NAME } from './azureTTS';
import { VOICE_MAP } from './azureTTS';

// Re-export VOICE_MAP so callers (route.ts) can resolve "asad"|"uzma"|"english"
// aliases without importing directly from azureTTS.
export { VOICE_MAP };

export type TtsProvider = 'azure' | 'openai';

export interface SpeechResult {
  audioBuffer: ArrayBuffer;
  provider:    TtsProvider;
  voice:       string;
  model:       string;
}

const OPENAI_TTS_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 30_000);
const URDU_TTS_ENABLED = process.env.URDU_TTS_ENABLED === 'true'; // default false

/**
 * Cleans Urdu text before passing to OpenAI TTS.
 * Removes markdown, normalises whitespace, trims to 250 words.
 */
export function cleanUrduForTTS(text: string): string {
  let cleaned = text
    .replace(/\*\*/g, '')
    .replace(/##?/g, '')
    .replace(/--+/g, '')
    .replace(/\(([^)]*)\)/g, '')
    .replace(/\[([^\]]*)\]/g, '$1')
    .replace(/\n{2,}/g, ' ۔۔۔ ')
    .replace(/\n/g, '، ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/);
  if (words.length > 250) cleaned = words.slice(0, 250).join(' ');

  return cleaned;
}

/**
 * Generates MP3 audio from text using OpenAI TTS.
 * Returns null when URDU_TTS_ENABLED=false.
 *
 * @param text      — TTS input text (Urdu or mixed)
 * @param voiceName — Reserved for future use. Currently ignored; all requests use onyx.
 */
export async function generateSpeech(
  text:       string,
  voiceName?: string,
): Promise<SpeechResult | null> {

  if (!URDU_TTS_ENABLED) {
    console.log('[tts] DISABLED — enable with URDU_TTS_ENABLED=true');
    return null;
  }

  // AZURE TTS — disabled, keeping for reference
  // console.log('[tts] provider=azure');
  // console.log('[tts] synthesizing urdu audio');
  // try {
  //   const audioBuffer = await synthesizeUrduSpeech(text, voiceName);
  //   const usedVoice   = voiceName || AZURE_VOICE_NAME;
  //   console.log('[tts] azure success — voice:', usedVoice);
  //   return { audioBuffer, provider: 'azure', voice: usedVoice, model: 'azure-neural-tts' };
  // } catch (azureErr) {
  //   console.warn(
  //     '[tts] azure failed, fallback=openai',
  //     azureErr instanceof Error ? azureErr.message : String(azureErr),
  //   );
  // }

  // ── OpenAI TTS — primary ───────────────────────────────────────────────────
  const model = 'gpt-4o-mini-tts';
  const voice = 'nova';
  const speed = 1.0;
  const instructions = 'Speak energetically and clearly like an enthusiastic Pakistani teacher. Mix Urdu and English naturally. Keep good pace — not too slow, not too fast.';

  console.log(`[tts] OpenAI ${model} ${voice} speed:${speed}`);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('[tts] OPENAI_API_KEY is not set');

  const controller = new AbortController();
  const tid        = setTimeout(() => controller.abort(), OPENAI_TTS_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal:  controller.signal,
      body:    JSON.stringify({ model, voice, speed, instructions, response_format: 'mp3', input: cleanUrduForTTS(text) }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError')
      throw new Error(`[tts] OpenAI TTS timed out after ${OPENAI_TTS_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(tid);
  }

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`[tts] OpenAI TTS error ${res.status}: ${errText}`);
  }

  const mp3Buffer     = Buffer.from(await res.arrayBuffer());
  // Append 2646 bytes of silent padding so the decoder finishes the last frame
  // before the buffer ends — prevents the final syllable being cut off.
  const silencePadding = Buffer.alloc(2646);
  const audioBuffer   = Buffer.concat([mp3Buffer, silencePadding]).buffer as ArrayBuffer;
  return { audioBuffer, provider: 'openai', voice, model };
}
