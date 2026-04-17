/**
 * lib/tts/index.ts
 * ----------------
 * Provider router for TTS generation.
 *
 * Current: OpenAI TTS primary (model=tts-1-hd, voice=onyx)
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

const OPENAI_TTS_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 25_000);

/**
 * Generates MP3 audio from text using OpenAI TTS.
 *
 * @param text      — TTS input text (Urdu or mixed)
 * @param voiceName — Reserved for future use (voice switching). Currently ignored;
 *                    all requests use onyx. Re-enable Azure block to activate.
 */
export async function generateSpeech(
  text:       string,
  voiceName?: string,
): Promise<SpeechResult> {

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
  const model = 'tts-1';
  const voice = 'nova';
  console.log(`[tts] using OpenAI TTS — model=${model} voice=${voice}`);

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
      body:    JSON.stringify({ model, voice, response_format: 'mp3', input: text }),
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

  const audioBuffer = Buffer.from(await res.arrayBuffer()).buffer as ArrayBuffer;
  return { audioBuffer, provider: 'openai', voice, model };
}
