/**
 * lib/rag/retrieve.ts
 * -------------------
 * RAG retrieval layer for the VoiceUstad agent system.
 *
 * Thin adapter over lib/retrieveBookContent.ts that:
 *  - Re-exports the existing retrieval function and its types
 *  - Adds a convenience object-argument form used by tutorAgent.ts
 *
 * The underlying lib/retrieveBookContent.ts is NOT modified — this file
 * exists purely to give the agents directory a clean import path and to
 * future-proof the RAG layer (embeddings, multi-source, etc. can be added
 * here without touching the existing retrieval implementation).
 */

export {
  retrieveBookContent,
  type RetrievalResult,
  type RetrievedBlocks,
} from '@/lib/retrieveBookContent';

export { classifyQuestionType, type QuestionType } from '@/lib/classifyQuestionType';

// ── Convenience wrapper ───────────────────────────────────────────────────────

import { classifyQuestionType }                      from '@/lib/classifyQuestionType';
import { retrieveBookContent, type RetrievalResult } from '@/lib/retrieveBookContent';

export interface RetrieveInput {
  question:      string;
  chapterNumber: number;
}

/**
 * Object-argument form of retrieveBookContent.
 * Classifies the question type internally so callers don't need to import
 * classifyQuestionType directly.
 *
 * Returns null when:
 *  - chapterNumber is 0 (no chapter context)
 *  - No matching content found in the database
 *  - A database error occurs (non-fatal — agent falls back to AI)
 */
export async function retrieve(input: RetrieveInput): Promise<RetrievalResult | null> {
  const { question, chapterNumber } = input;
  if (!chapterNumber || chapterNumber <= 0) return null;
  try {
    const qType  = classifyQuestionType(question);
    const result = await retrieveBookContent(question, qType, chapterNumber);
    return result.found ? result : null;
  } catch {
    return null;
  }
}
