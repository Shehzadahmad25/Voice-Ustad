/**
 * lib/agents/tutorAgent.ts
 * ------------------------
 * Tutor Agent — STRICT DATABASE MODE.
 *
 * The database is the ONLY source of truth.
 * If a topic is not found in the `topics` table → the agent returns
 * a "not found" response. There is NO AI fallback, NO general-knowledge
 * generation, and NO content mixing.
 *
 * Pipeline:
 *   Step 0 — Debug mode intercept (/debug command)
 *   Step 1 — Normalize input
 *   Step 2 — Cache lookup  [skipped when CACHE_ENABLED=false]
 *   Step 3 — Retrieve from DB (title/keyword match only)
 *   Step 4 — DB miss → return NOT FOUND (no AI fallback)
 *   Step 5 — Build structured answer from DB blocks (zero transformation)
 *   Step 6 — Attach Urdu TTS text (from DB field or generated from DB content)
 *   Step 7 — Attach board reference metadata
 *   Step 8 — Save to cache  [skipped when CACHE_ENABLED=false]
 *   Step 9 — Return TutorAgentResult
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
  generateUrduSummary,
  normalizeStructuredAnswer,
  repairStructuredAnswer,
  sanitizeUrduTtsText,
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
  recentContext: string;       // reserved — not used in strict DB mode
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
  responseSource:  'cache' | 'db' | 'not_found';
}

// ── Config ─────────────────────────────────────────────────────────────────────

/**
 * Cache kill-switch for development.
 * Default: OFF — set CACHE_ENABLED=true in .env.local to re-enable at launch.
 */
const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';

// Set TTS_FORCE_REFRESH=true in .env.local to suppress cached audio URLs
// so the frontend always calls mode=audio for fresh TTS during voice testing.
const FORCE_REFRESH_TTS = process.env.TTS_FORCE_REFRESH === 'true';

// ── Not-found answer ───────────────────────────────────────────────────────────

/**
 * Returned when no matching topic exists in the database.
 * No AI generation — this is the hard stop for out-of-scope queries.
 */
const NOT_FOUND_ANSWER: StructuredAnswer = {
  definition:  'This topic is not available in the database. Please ask about a topic covered in your textbook.',
  explanation: '',
  example:     '',
  formula:     '',
  flabel:      '',
  dur:         0,
  urduTtsText: '',
};

const NOT_FOUND_RESULT: TutorAgentResult = {
  answer:          NOT_FOUND_ANSWER,
  urduSummary:     null,
  audioBase64:     null,
  audioError:      null,
  audioUrl:        null,
  cacheId:         null,
  cacheHit:        false,
  cacheSimilarity: 0,
  responseSource:  'not_found',
};

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Runs the Tutor Agent pipeline for a single chat-mode request.
 * Never throws — catches all errors internally and surfaces them in the result.
 *
 * STRICT DATABASE MODE: returns NOT_FOUND_RESULT for any question whose
 * topic cannot be matched in the `topics` table by title or keyword.
 * No AI model is ever called to generate an answer.
 */
export async function runTutorAgent(input: TutorAgentInput): Promise<TutorAgentResult> {
  const { message, chapter, chapterNumber } = input;

  // ── Step 0: Debug mode intercept ────────────────────────────────────────────
  if (/^\/debug(\s|$)/i.test(message.trim())) {
    console.log('[agent] DEBUG MODE triggered');
    const { chapterNumber: debugCh, topicFilter } = parseDebugCommand(message.trim());
    const ch  = debugCh || chapterNumber || 1;
    const dbg = await runDebugMode(ch, topicFilter);
    return {
      answer: {
        definition:   dbg.output,
        explanation:  '',
        example:      '',
        formula:      '',
        flabel:       '',
        dur:          0,
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
  console.log(`[agent] START — query="${question.slice(0, 80)}" chapter=${chapterNumber}`);

  if (!CACHE_ENABLED) {
    console.log('[cache] DISABLED — development mode');
  }

  // ── Step 2: Cache lookup ────────────────────────────────────────────────────
  if (CACHE_ENABLED) {
    console.log('[agent] step=cache-lookup');
    const cacheResult = await lookupCache(question, chapterNumber);

    if (cacheResult.hit && cacheResult.entry) {
      const { entry } = cacheResult;

      const cachedAnswer = repairStructuredAnswer(normalizeStructuredAnswer(entry.answer_json));
      Object.assign(cachedAnswer, inferBoardRef(question, chapter));

      const cachedUrdu = entry.urdu_tts_text
        ? (postProcessUrduTts(sanitizeUrduTtsText(entry.urdu_tts_text)) || null)
        : null;

      const matchType = cacheResult.exact
        ? 'exact'
        : `semantic(${(cacheResult.similarity * 100).toFixed(0)}%)`;
      console.log(`[agent] cache-${matchType} hit — returning cached DB answer`);

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
  }

  // ── Step 3: Retrieve from DB ────────────────────────────────────────────────
  console.log('[agent] step=retrieve — strict title/keyword match only');
  let dbResult: RetrievalResult | null = null;
  try {
    dbResult = await retrieveContent(question, chapterNumber);
  } catch (err) {
    console.warn('[agent] retrieve error:', (err as Error).message);
  }

  // ── Step 4: DB miss → hard stop, no AI fallback ─────────────────────────────
  if (!dbResult) {
    console.log(`[agent] NO MATCH — query="${question.slice(0, 80)}" is not in the database. Returning not-found. No AI fallback.`);
    if (CACHE_ENABLED) {
      logCacheEvent({
        question:      question,
        chapterNumber,
        resultType:    'miss',
        similarity:    0,
        hadAudio:      false,
      }).catch(() => {});
    }
    return { ...NOT_FOUND_RESULT };
  }

  // ── Step 5: Build structured answer from DB blocks ──────────────────────────
  console.log(`[agent] FOUND — topic="${dbResult.topic}" page=${dbResult.page}`);
  console.log('[agent] step=answer-from-db — zero AI transformation');
  const answer = generateAnswerFromDB(dbResult);

  // ── Step 6: Urdu TTS text ────────────────────────────────────────────────────
  console.log('[agent] step=urdu-tts');
  let urduSummary: string | null = null;
  let audioError:  string | null = null;

  // Priority 1: use pre-stored urdu_tts_text from DB (zero AI calls)
  if (answer.urduTtsText) {
    urduSummary = postProcessUrduTts(sanitizeUrduTtsText(answer.urduTtsText)) || null;
    console.log(`[agent] urdu-tts: using DB field (${urduSummary?.length ?? 0} chars)`);
  }

  // Priority 2: generate from DB content fields (only if DB field is empty)
  if (!urduSummary) {
    try {
      const generated = await Promise.race([
        generateUrduSummary({
          definition:  dbResult.blocks.definition  || '',
          explanation: dbResult.blocks.explanation || '',
          example:     dbResult.blocks.example     || '',
          formula:     dbResult.blocks.formula     || undefined,
          flabel:      dbResult.blocks.flabel      || undefined,
        }),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 1_200)),
      ]);
      urduSummary = generated || null;
      console.log(`[agent] urdu-tts: generated (${urduSummary?.length ?? 0} chars)`);
    } catch (err) {
      audioError = err instanceof Error ? err.message : 'Urdu TTS generation failed';
      console.warn('[agent] urdu-tts error (non-fatal):', audioError);
    }
  }

  // ── Step 7: Attach board reference metadata ──────────────────────────────────
  Object.assign(answer, inferBoardRef(question, chapter));
  if (dbResult.page != null) answer.refPageNo = String(dbResult.page);

  // ── Step 8: Persist to cache (fire-and-forget) ───────────────────────────────
  if (CACHE_ENABLED) {
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
      topic:       dbResult.topic,
      answerJson:  answer as unknown as StructuredAnswerJson,
      urduTtsText: urduSummary ?? '',
      modelText:   'db',
      modelTts:    process.env.OPENAI_TTS_TEXT_MODEL || model,
    }).catch(() => {});
  }

  // ── Step 9: Return result ────────────────────────────────────────────────────
  console.log(`[agent] DONE — source=db topic="${dbResult.topic}"`);
  return {
    answer,
    urduSummary,
    audioBase64:     null,
    audioError,
    audioUrl:        null,
    cacheId:         null,
    cacheHit:        false,
    cacheSimilarity: 0,
    responseSource:  'db',
  };
}
