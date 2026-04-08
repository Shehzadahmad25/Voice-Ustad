/**
 * lib/tts/urduTTS.ts
 * ------------------
 * Urdu TTS generation façade for the VoiceUstad agent system.
 *
 * Re-exports the existing TTS pipeline so agent code has a single, named
 * import point.  No logic lives here — all synthesis is in:
 *   lib/tts/azureTTS.ts    — Azure Speech SDK (primary)
 *   lib/tts/openaiTTS.ts   — OpenAI TTS (fallback)
 *   lib/tts/index.ts       — Provider router (generateSpeech)
 *   lib/tts/teacherUrdu.ts — Urdu text preparation utilities
 */

// Provider router — the main entry point for audio synthesis
export { generateSpeech, VOICE_MAP, type SpeechResult, type TtsProvider } from './index';

// Azure-specific exports
export { synthesizeUrduSpeech, AZURE_VOICE_NAME } from './azureTTS';

// Text preparation utilities
export {
  TEACHER_URDU_SYSTEM_PROMPT,
  buildTeacherStyleUrduTts,
  speakFormulaNaturally,
  postProcessUrduTts,
  type TeacherUrduFields,
} from './teacherUrdu';
