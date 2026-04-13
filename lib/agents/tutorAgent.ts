/**
 * lib/agents/tutorAgent.ts
 * ------------------------
 * Tutor Agent — main orchestrator for the VoiceUstad chat-mode pipeline.
 *
 * Replaces the inline chat-mode logic in app/api/chat2/route.ts.
 * The route now calls runTutorAgent() and gets back a fully-formed result
 * that maps 1:1 to the existing JSON response shape (frontend unchanged).
 *
 * Pipeline:
 *   Step 1 — Normalize input
 *   Step 2 — Cache lookup (exact → semantic → miss)
 *   Step 3 — Retrieve from DB (if chapterNumber > 0)
 *   Step 4 — Build structured answer (DB blocks OR AI)
 *   Step 5 — Generate Urdu TTS text
 *   Step 6 — Attach board reference metadata
 *   Step 7 — Save to cache (fire-and-forget)
 *   Step 8 — Return TutorAgentResult
 */

import { inferBoardRef }               from '@/app/api/chat2/boardRefs';
import {
  lookupCache,
  saveToCache,
  logCacheEvent,
  type StructuredAnswerJson,
}                                       from '@/lib/qaCache';
import {
  retrieveContent,
  generateAnswerFromDB,
  generateStructuredAnswer,
  generateUrduSummary,
  normalizeStructuredAnswer,
  repairStructuredAnswer,
  sanitizeUrduTtsText,
  buildDbContentBlock,
  type StructuredAnswer,
  type RetrievalResult,
}                                       from './tools';
import { postProcessUrduTts }           from '@/lib/tts/teacherUrdu';
import { runDebugMode, parseDebugCommand } from './debugMode';

// ── Types ──────────────────────────────────────────────────────────────────────

export type { StructuredAnswer };

export interface TutorAgentInput {
  message:       string;
  chapter:       string;       // full chapter label (e.g. "Chapter 1: Stoichiometry")
  chapterNumber: number;       // 1-based chapter index; 0 = no chapter context
  recentContext: string;       // pre-built conversation context string
}

/**
 * Maps directly to the existing JSON response shape so the frontend is unchanged.
 * route.ts spreads this into { ok: true, ...result }.
 */
export interface TutorAgentResult {
  answer:          StructuredAnswer;
  urduSummary:     string | null;
  audioBase64:     null;            // audio generated separately via mode=audio
  audioError:      string | null;
  audioUrl:        string | null;   // populated from cache if available
  cacheId:         string | null;   // passed to mode=audio to patch the cache row
  cacheHit:        boolean;
  cacheSimilarity: number;
  responseSource:  'cache' | 'db' | 'ai';
}

// ── Config ─────────────────────────────────────────────────────────────────────

// Set TTS_FORCE_REFRESH=true in .env.local to suppress cached audio URLs
// so the frontend always calls mode=audio for fresh TTS during voice testing.
const FORCE_REFRESH_TTS = process.env.TTS_FORCE_REFRESH === 'true';

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Runs the full Tutor Agent pipeline for a single chat-mode request.
 * Never throws — catches all errors internally and surfaces them in the result.
 */
export async function runTutorAgent(input: TutorAgentInput): Promise<TutorAgentResult> {
  const { message, chapter, chapterNumber, recentContext } = input;

  // ── Step 0: Debug mode intercept ────────────────────────────────────────────
  if (/^\/debug(\s|$)/i.test(message.trim())) {
    console.log('[agent] DEBUG MODE triggered');
    const { chapterNumber: debugCh, topicFilter } = parseDebugCommand(message.trim());
    const ch = debugCh || chapterNumber || 1;
    const dbg = await runDebugMode(ch, topicFilter);
    // Return debug output as a structured answer so the frontend renders it
    return {
      answer: {
        definition:   dbg.output,
        explanation:  '',
        example:      '',
        formula:      '',
        flabel:       '',
        refPageNo:    '',
        refChapterNo: '',
        urduTtsText:  '',
      },
      urduSummary:     null,
      audioBase64:     null,
      audioError:      null,
      audioUrl:        null,
      cacheId:         null,
      cacheHit:        false,
      cacheSimilarity: 0,
      responseSource:  'db' as const,
    };
  }

  // ── Step 1: Normalize ───────────────────────────────────────────────────────
  const question = message.trim();
  console.log(`[agent] start — question="${question.slice(0, 80)}" chapter=${chapterNumber}`);

  // ── Step 2: Cache lookup ────────────────────────────────────────────────────
  console.log('[agent] step=cache-lookup');
  const cacheResult = await lookupCache(question, chapterNumber);

  if (cacheResult.hit && cacheResult.entry) {
    const { entry } = cacheResult;

    // Normalize cached answer (handles legacy {text,points} format)
    const cachedAnswer = repairStructuredAnswer(normalizeStructuredAnswer(entry.answer_json));
    Object.assign(cachedAnswer, inferBoardRef(question, chapter));

    const cachedUrdu = entry.urdu_tts_text
      ? (postProcessUrduTts(sanitizeUrduTtsText(entry.urdu_tts_text)) || null)
      : null;

    const matchType = cacheResult.exact
      ? 'exact'
      : `semantic(${(cacheResult.similarity * 100).toFixed(0)}%)`;
    console.log(`[agent] cache-${matchType} hit — skipping RAG+AI`);

    if (FORCE_REFRESH_TTS && entry.audio_url) {
      console.log('[agent] FORCE_REFRESH_TTS — suppressing cached audio_url');
    }
    const cachedAudioUrl = (FORCE_REFRESH_TTS ? null : entry.audio_url) || null;
    const cacheId        = cachedAudioUrl ? null : entry.id;

    logCacheEvent({
      question:      question,
      chapterNumber,
      resultType:    cacheResult.exact ? 'exact' : 'semantic',
      similarity:    cacheResult.similarity,
      hadAudio:      !!cachedAudioUrl,
    }).catch(() => {});

    return {
      answer:          cachedAnswer,
      urduSummary:     cachedUrdu,
      audioBase64:     null,
      audioError:      null,
      audioUrl:        cachedAudioUrl,
      cacheId,
      cacheHit:        true,
      cacheSimilarity: cacheResult.similarity,
      responseSource:  'cache',
    };
  }

  console.log('[agent] cache-miss — proceeding to RAG+AI');

  // ── Step 3: Retrieve from DB ────────────────────────────────────────────────
  console.log('[agent] step=retrieve');
  let dbResult: RetrievalResult | null = null;
  try {
    dbResult = await retrieveContent(question, chapterNumber);
  } catch (err) {
    console.warn('[agent] retrieve error (non-fatal):', (err as Error).message);
  }

  // ── Step 4: Build structured answer ────────────────────────────────────────
  let answer: StructuredAnswer;
  let responseSource: 'db' | 'ai';

  if (dbResult) {
    console.log('[agent] step=answer-from-db');
    answer = generateAnswerFromDB(dbResult);
    responseSource = 'db';

    // Enrich with Urdu TTS text from DB content
    try {
      const urduText = await generateUrduSummary({
        definition:  dbResult.blocks.definition  || '',
        explanation: dbResult.blocks.explanation || '',
        example:     dbResult.blocks.example     || '',
        formula:     dbResult.blocks.formula,
        flabel:      dbResult.blocks.flabel,
      });
      if (urduText) answer.urduTtsText = urduText;
    } catch { /* Urdu is optional — non-fatal */ }

  } else {
    console.log('[agent] step=answer-from-ai');
    try {
      answer = await generateStructuredAnswer(question, chapter, recentContext);
    } catch (err) {
      console.error('[agent] generateStructuredAnswer failed:', (err as Error).message);
      throw err; // re-throw — route.ts will return 500
    }

    // Retry once if all required fields came back empty
    if (!answer.definition && !answer.explanation && !answer.example) {
      console.warn('[agent] AI returned empty fields — retrying once');
      try {
        answer = await generateStructuredAnswer(question, chapter, recentContext);
      } catch { /* keep whatever we have */ }
    }

    responseSource = 'ai';
  }

  // ── Step 5: Build Urdu TTS summary ─────────────────────────────────────────
  console.log('[agent] step=urdu-summary');
  let urduSummary: string | null = null;
  let audioError:  string | null = null;

  // First try: urduTtsText embedded in the AI answer
  if (answer.urduTtsText) {
    urduSummary = postProcessUrduTts(sanitizeUrduTtsText(answer.urduTtsText)) || null;
  }

  // Second try: generate independently from the answer fields
  if (!urduSummary) {
    try {
      const generated = await Promise.race([
        generateUrduSummary({
          definition:  answer.definition,
          explanation: answer.explanation,
          example:     answer.example,
          formula:     answer.formula || undefined,
          flabel:      answer.flabel  || undefined,
        }),
        // 1.2s soft timeout — Urdu is optional, don't hold the response
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 1_200)),
      ]);
      urduSummary = generated || null;
      console.log('[agent] urdu-summary length:', urduSummary?.length ?? 0);
    } catch (err) {
      audioError = err instanceof Error ? err.message : 'Urdu summary generation failed';
      console.warn('[agent] urdu-summary error (non-fatal):', audioError);
    }
  }

  // ── Step 6: Attach board reference metadata ─────────────────────────────────
  Object.assign(answer, inferBoardRef(question, chapter));
  if (dbResult?.page != null) answer.refPageNo = String(dbResult.page);

  // ── Step 7: Persist to cache (fire-and-forget) ──────────────────────────────
  console.log('[agent] step=save-cache');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  logCacheEvent({
    question:      question,
    chapterNumber,
    resultType:    'miss',
    similarity:    0,
    hadAudio:      false,
  }).catch(() => {});

  saveToCache({
    originalQuestion: question,
    chapter,
    chapterNumber,
    topic:       dbResult?.topic      ?? '',
    answerJson:  answer               as unknown as StructuredAnswerJson,
    urduTtsText: urduSummary          ?? '',
    modelText:   dbResult ? 'db' : model,
    modelTts:    process.env.OPENAI_TTS_TEXT_MODEL || model,
  }).catch(() => {});

  // ── Step 8: Return result ───────────────────────────────────────────────────
  console.log(`[agent] done — source=${responseSource}`);
  return {
    answer,
    urduSummary,
    audioBase64:     null,
    audioError,
    audioUrl:        null,   // fresh answers never have a cached audio URL yet
    cacheId:         null,   // no UUID yet (row just saved — mode=audio will look it up by question)
    cacheHit:        false,
    cacheSimilarity: 0,
    responseSource,
  };
}
