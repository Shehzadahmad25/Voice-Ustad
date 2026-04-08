/**
 * lib/tts/index.ts
 * ----------------
 * Provider router for TTS generation.
 *
 * Strategy:
 *   1. Try Azure (default: ur-PK-AsadNeural, overridable via voiceName)
 *   2. If Azure fails, fall back to OpenAI
 *
 * Returns { audioBuffer, provider, voice, model } so the caller can record
 * exactly which provider/voice was used in Supabase audio cache metadata.
 *
 * Voice testing:
 *   Pass voiceName = VOICE_MAP['uzma'] or VOICE_MAP['english'] to confirm
 *   that voice switching works end-to-end.
 */

import { synthesizeUrduSpeech, AZURE_VOICE_NAME, VOICE_MAP } from './azureTTS';
import { synthesizeWithOpenAI, getOpenAITtsMeta             } from './openaiTTS';

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

/**
 * Generates MP3 audio from text.
 *
 * @param text      — TTS input text (Urdu or mixed)
 * @param voiceName — Optional full Azure voice name (e.g. "ur-PK-UzmaNeural").
 *                    If omitted, uses the default AZURE_VOICE_NAME.
 *                    Resolve aliases with VOICE_MAP before calling.
 */
export async function generateSpeech(
  text:       string,
  voiceName?: string,
): Promise<SpeechResult> {
  // ── Try Azure ──────────────────────────────────────────────────────────────
  console.log('[tts] provider=azure');
  console.log('[tts] synthesizing urdu audio');

  try {
    const audioBuffer = await synthesizeUrduSpeech(text, voiceName);
    const usedVoice   = voiceName || AZURE_VOICE_NAME;
    console.log('[tts] azure success — voice:', usedVoice);
    return {
      audioBuffer,
      provider: 'azure',
      voice:    usedVoice,
      model:    'azure-neural-tts',
    };
  } catch (azureErr) {
    console.warn(
      '[tts] azure failed, fallback=openai',
      azureErr instanceof Error ? azureErr.message : String(azureErr),
    );
  }

  // ── Fallback: OpenAI ───────────────────────────────────────────────────────
  const { voice, model } = getOpenAITtsMeta();
  const audioBuffer = await synthesizeWithOpenAI(text);
  return { audioBuffer, provider: 'openai', voice, model };
}
