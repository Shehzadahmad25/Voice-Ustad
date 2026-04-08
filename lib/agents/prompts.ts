/**
 * lib/agents/prompts.ts
 * ---------------------
 * System prompts and user-prompt builders for the Tutor Agent.
 *
 * Extracted from route.ts so prompts can be iterated on independently
 * without touching request-handling code.
 */

import type { RetrievalResult } from '@/lib/retrieveBookContent';

// ── System message ─────────────────────────────────────────────────────────────

/**
 * System message for the main structured-answer call.
 * Instructs the model to output strict JSON with no markdown or extra keys.
 */
export const TUTOR_SYSTEM_PROMPT =
  'You are VoiceUstad chemistry tutor. Respond as strict JSON only. No markdown. No extra keys.';

// ── User prompt builder ───────────────────────────────────────────────────────

export interface TutorPromptArgs {
  message:       string;
  chapter:       string;     // e.g. "Chapter 1: Stoichiometry"
  recentContext: string;     // last 3 conversation turns, or ""
  dbBlock:       string;     // pre-formatted DB content block, or ""
}

/**
 * Builds the full user-turn prompt for the structured-answer AI call.
 *
 * Rules baked into the prompt:
 *  - KPK FSc board alignment
 *  - ALWAYS prefer provided book content (never hallucinate over it)
 *  - Strict JSON schema: definition, explanation, example, formula, flabel, dur, urduTtsText
 *  - Out-of-scope detection: sets definition to a sentinel string
 *  - Urdu TTS rules: teacher-style, short sentences, minimal pauses
 */
export function buildTutorUserPrompt(args: TutorPromptArgs): string {
  const { message, chapter, recentContext, dbBlock } = args;
  const chapterLabel = chapter || 'General Chemistry';

  return [
    `You are VoiceUstad, an expert FSc Chemistry tutor.`,
    `You ONLY teach Chapter: ${chapterLabel} (FSc KPK Board).`,
    `If the question is outside this chapter, set definition to: "This topic is not included in the current lesson."`,
    ``,
    `Return ONLY valid JSON with EXACTLY these keys:`,
    `{`,
    `  "definition": "",`,
    `  "explanation": "",`,
    `  "example": "",`,
    `  "formula": "",`,
    `  "flabel": "",`,
    `  "dur": 30,`,
    `  "urduTtsText": ""`,
    `}`,
    ``,
    `FIELD RULES:`,
    `- definition: 1-2 sentences. What the concept IS. If book content has a definition, copy it exactly.`,
    `- explanation: 2-4 sentences. How/why it works. Plain prose only, no bullet points.`,
    `- example: 1-2 sentences. A concrete example with numbers if relevant.`,
    `- formula: The chemical/math formula if relevant. Else empty string "".`,
    `- flabel: Label for the formula (e.g. "MOLAR MASS FORMULA"). Else empty string "".`,
    `- dur: integer 25-55 (estimated Urdu audio seconds).`,
    `- urduTtsText: 5-7 short spoken Urdu sentences for a Pakistani chemistry teacher. Rules: ` +
      `one idea per sentence (max 12 words each), vary sentence openings ` +
      `(do NOT start multiple sentences with "یہ"), mix English science terms naturally, ` +
      `use "..." at most 3-4 times total (not after every sentence), avoid formal textbook Urdu, ` +
      `avoid repeating the same lead-in phrase twice, sound like a classroom teacher — clear and guided, not dramatic.`,
    ``,
    `STRICT RULES:`,
    `- definition, explanation, and example must ALL be non-empty (unless the question is out of scope).`,
    `- Never merge fields together. Never use bullet points. Never use markdown. Never add extra keys.`,
    `- Use simple FSc student-friendly language.`,
    `- ALWAYS prefer book content over your own knowledge when book content is provided.`,
    dbBlock       ? `\nBOOK CONTENT (primary source — do not add facts not present here):\n${dbBlock}` : '',
    recentContext ? `\nRecent context (use only if question is an explicit follow-up):\n${recentContext}` : '',
    `\nCurrent Question: ${message}`,
  ].filter(v => v !== undefined).join('\n');
}
