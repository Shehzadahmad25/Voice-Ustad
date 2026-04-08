/**
 * qaCache.ts
 * ----------
 * Supabase + pgvector cache for structured VoiceUstad answers.
 *
 * Lookup order (cheapest to most expensive):
 *   1. Exact match on normalized_question  — 1 DB query, no embedding
 *   2. Semantic similarity via pgvector     — 1 embedding call + 1 DB RPC
 *   3. MISS                                 — caller runs normal RAG + GPT flow
 *
 * Save is always fire-and-forget — it never adds latency to the HTTP response.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   OPENAI_API_KEY
 *
 * Optional env vars (have safe defaults):
 *   CACHE_SIMILARITY_THRESHOLD   — cosine similarity floor (default 0.88)
 *   CACHE_LOOKUP_TIMEOUT_MS      — total lookup deadline  (default 3000)
 *   CACHE_EMBEDDING_TIMEOUT_MS   — embedding call timeout (default 8000)
 */

import { createClient } from '@supabase/supabase-js';

// ── Analytics types ───────────────────────────────────────────────────────────

export type CacheResultType = 'exact' | 'semantic' | 'miss' | 'audio_generated';

export interface CacheEventInput {
  question:      string;
  chapterNumber: number;
  resultType:    CacheResultType;
  similarity:    number;   // 1.0 for exact, 0–1 for semantic, 0 for miss/audio
  hadAudio:      boolean;  // true when cache hit already had audio_url set
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StructuredAnswerJson {
  definition:  string;
  explanation: string;
  example:     string;
  formula:     string;
  flabel:      string;
  dur:         number;
  urduTtsText: string;
  [key: string]: unknown;
}

export interface CacheEntry {
  id:                  string;
  original_question:   string;
  normalized_question: string;
  subject:             string;
  chapter:             string;
  chapter_number:      number;
  topic:               string;
  answer_json:         StructuredAnswerJson;
  urdu_tts_text:       string;
  // ── Audio fields (populated after first TTS generation) ──────────────────
  audio_url:           string;    // Supabase Storage public URL, "" if not cached yet
  audio_duration:      number;    // seconds (from answer_json.dur)
  tts_voice:           string;    // e.g. "alloy"
  tts_model:           string;    // e.g. "gpt-4o-mini-tts"
  audio_created_at:    string;    // ISO timestamp, "" if no audio yet
  // ─────────────────────────────────────────────────────────────────────────
  chunk_ids:           string[];
  model_text:          string;
  model_tts:           string;
  hit_count:           number;
  created_at:          string;
  updated_at:          string;
}

export interface CacheLookupResult {
  hit:        boolean;
  exact:      boolean;   // true = exact normalized match (no embedding used)
  similarity: number;    // 1.0 for exact, 0–1 for semantic
  entry:      CacheEntry | null;
}

export interface CacheSaveInput {
  originalQuestion: string;
  subject?:         string;
  chapter?:         string;
  chapterNumber?:   number;
  topic?:           string;
  answerJson:       StructuredAnswerJson;
  urduTtsText?:     string;
  audioUrl?:        string;
  chunkIds?:        string[];
  modelText?:       string;
  modelTts?:        string;
}

// ── Config ────────────────────────────────────────────────────────────────────

// Cosine similarity threshold for semantic match.
// 0.92 means the embedded questions must be at least 92% similar before reusing a cached answer.
// This is intentionally stricter than the 0.88 legacy default:
//   - Prevents "define mole" from matching "explain Avogadro's number" (conceptually adjacent
//     but genuinely different questions that deserve different answers).
//   - "What is mole?" / "Define a mole." still match at ~0.96 — same concept, same wording.
// Tune via CACHE_SIMILARITY_THRESHOLD env var:
//   0.95+ = very strict (near-identical phrasings only)
//   0.90  = moderate (recommended floor)
//   0.85  = lenient (legacy behaviour — increases same-answer reuse)
const SIMILARITY_THRESHOLD    = Number(process.env.CACHE_SIMILARITY_THRESHOLD    ?? 0.92);
const CACHE_LOOKUP_TIMEOUT_MS = Number(process.env.CACHE_LOOKUP_TIMEOUT_MS       ?? 3_000);
const EMBEDDING_TIMEOUT_MS    = Number(process.env.CACHE_EMBEDDING_TIMEOUT_MS    ?? 8_000);
const EMBEDDING_MODEL         = 'text-embedding-3-small';  // 1536 dims, cheap

// ── Supabase client (server-side only — uses service role key) ────────────────

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── Question normalization ────────────────────────────────────────────────────

/**
 * Produces a stable canonical form of a question for exact-match caching.
 *
 * Rules:
 *  - Lowercase + trim
 *  - Strip trailing ? ! .
 *  - Remove noise punctuation (, ; : ' " ( ) [ ] { })
 *  - Preserve hyphens (gram-atom, electron-volt)
 *  - Collapse whitespace
 *
 * Intentionally does NOT strip question verbs ("what is", "define", "explain").
 * Semantic search via pgvector handles that similarity automatically.
 * This keeps exact-match predictable and free of false-positive collapses.
 *
 * Examples:
 *   "What is a mole?"  → "what is a mole"
 *   "Define mole."     → "define mole"
 *   "MOLE??"           → "mole"
 */
export function normalizeQuestion(q: string): string {
  return String(q ?? '')
    .toLowerCase()
    .trim()
    .replace(/[?!.]+$/, '')           // trailing punctuation
    .replace(/[,;:'"()[\]{}]/g, ' ')  // noise punctuation (keep hyphens)
    .replace(/\s+/g, ' ')             // collapse spaces
    .trim();
}

// ── Embedding generation ──────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data?.[0]?.embedding as number[]) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

// ── Atomic hit-count increment ────────────────────────────────────────────────

async function bumpHitCount(id: string): Promise<void> {
  try {
    const db = getDb();
    await db.rpc('increment_qa_cache_hit_count', { cache_id: id });
  } catch { /* non-critical */ }
}

// ── Core lookup (internal — no timeout guard) ─────────────────────────────────

async function _lookupInner(
  question:      string,
  chapterNumber: number,
): Promise<CacheLookupResult> {
  const MISS: CacheLookupResult = { hit: false, exact: false, similarity: 0, entry: null };
  const db         = getDb();
  const normalized = normalizeQuestion(question);

  // ── 1. Exact match ─ one indexed query, zero embedding cost ──────────────
  const { data: exactRows } = await db
    .from('qa_cache')
    .select('*')
    .eq('normalized_question', normalized)
    .eq('chapter_number', chapterNumber)
    .order('hit_count', { ascending: false })
    .limit(1);

  if (exactRows?.[0]) {
    const entry = exactRows[0] as CacheEntry;
    bumpHitCount(entry.id).catch(() => {});
    return { hit: true, exact: true, similarity: 1.0, entry };
  }

  // ── 2. Semantic similarity ─ one embedding + pgvector RPC ──────────────
  const embedding = await getEmbedding(normalized);
  if (!embedding) return MISS;

  const { data: semanticRows, error } = await db.rpc('match_qa_cache', {
    query_embedding:       embedding,
    match_threshold:       SIMILARITY_THRESHOLD,
    match_count:           1,
    filter_chapter_number: chapterNumber,
  });

  if (error) {
    console.warn('[qaCache] semantic search error:', error.message);
    return MISS;
  }

  type SemanticRow = CacheEntry & { similarity: number };
  const row = semanticRows?.[0] as SemanticRow | undefined;
  if (row) {
    const { similarity, ...entryFields } = row;
    bumpHitCount(row.id).catch(() => {});
    return { hit: true, exact: false, similarity, entry: entryFields as CacheEntry };
  }

  return MISS;
}

// ── Public lookup (with timeout guard) ───────────────────────────────────────

/**
 * Looks up the cache for a given question + chapter.
 * Always returns MISS on timeout or any error — never throws.
 *
 * @param question      - Raw student question
 * @param chapterNumber - 1-based chapter number (use 0 to disable cache)
 */
export async function lookupCache(
  question:      string,
  chapterNumber: number,
): Promise<CacheLookupResult> {
  const MISS: CacheLookupResult = { hit: false, exact: false, similarity: 0, entry: null };
  if (!chapterNumber || chapterNumber <= 0) return MISS;

  try {
    return await Promise.race([
      _lookupInner(question, chapterNumber),
      new Promise<CacheLookupResult>((resolve) =>
        setTimeout(() => resolve(MISS), CACHE_LOOKUP_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    console.warn('[qaCache] lookup error:', (err as Error).message);
    return MISS;
  }
}

// ── Cache save ────────────────────────────────────────────────────────────────

/**
 * Saves a fresh structured answer to the cache.
 * Must be called without await (fire-and-forget) to avoid adding latency.
 *
 * Automatically skips:
 *  - Out-of-scope answers ("not included in the current lesson")
 *  - Answers with all three required fields empty
 *  - Rows where chapterNumber is 0 (no chapter context)
 */
export async function saveToCache(input: CacheSaveInput): Promise<void> {
  try {
    const aj = input.answerJson;

    // Skip: completely empty answers
    if (!aj.definition && !aj.explanation && !aj.example) return;

    // Skip: out-of-scope answers
    if (
      String(aj.definition ?? '').toLowerCase().includes('not included in the current lesson')
    ) return;

    // Skip: no chapter context (prevents cross-chapter pollution)
    const chapterNumber = input.chapterNumber ?? 0;
    if (!chapterNumber) return;

    const db         = getDb();
    const normalized = normalizeQuestion(input.originalQuestion);
    const embedding  = await getEmbedding(normalized);   // null if OpenAI fails

    const row = {
      original_question:   input.originalQuestion.trim(),
      normalized_question: normalized,
      question_embedding:  embedding,         // null → exact match still works
      subject:             input.subject   ?? 'chemistry',
      chapter:             input.chapter   ?? '',
      chapter_number:      chapterNumber,
      topic:               input.topic     ?? '',
      answer_json:         aj,
      urdu_tts_text:       input.urduTtsText ?? '',
      audio_url:           input.audioUrl    ?? '',
      chunk_ids:           input.chunkIds    ?? [],
      model_text:          input.modelText   ?? '',
      model_tts:           input.modelTts    ?? '',
      hit_count:           0,
      updated_at:          new Date().toISOString(),
    };

    // Upsert: update if same (normalized_question, chapter_number) already exists
    const { error } = await db
      .from('qa_cache')
      .upsert(row, { onConflict: 'normalized_question,chapter_number' });

    if (error) {
      console.warn('[qaCache] save failed:', error.message);
    } else {
      console.log('[qaCache] cached:', normalized.slice(0, 70));
    }
  } catch (err) {
    console.warn('[qaCache] save error:', (err as Error).message);
  }
}

// ── Audio filename (deterministic, safe for Supabase Storage) ─────────────────

function audioFilename(normalizedQuestion: string, chapterNumber: number): string {
  const safe = normalizedQuestion
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 80);
  return `tts/${chapterNumber}/${safe}.mp3`;
}

// ── Patch audio fields on an existing cache row ───────────────────────────────

/**
 * Updates the audio fields of an existing cache row by its UUID.
 * Called after the first TTS generation so the next cache hit serves audio directly.
 * Fire-and-forget safe — never throws.
 */
export async function patchCacheAudio(
  id:            string,
  audioUrl:      string,
  ttsVoice:      string,
  ttsModel:      string,
  audioDuration: number,
): Promise<void> {
  try {
    const db = getDb();
    const { error } = await db
      .from('qa_cache')
      .update({
        audio_url:        audioUrl,
        audio_duration:   audioDuration,
        tts_voice:        ttsVoice,
        tts_model:        ttsModel,
        audio_created_at: new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      console.warn('[qaCache] patchCacheAudio failed:', error.message);
    } else {
      console.log('[qaCache] audio patched for id:', id.slice(0, 8));
    }
  } catch (err) {
    console.warn('[qaCache] patchCacheAudio error:', (err as Error).message);
  }
}

// ── Upload audio + save URL (for fresh-generation path) ──────────────────────

/**
 * Uploads an MP3 buffer to Supabase Storage and patches the matching cache row.
 * Uses a deterministic filename so concurrent uploads safely overwrite each other (upsert).
 * Fire-and-forget safe — never throws.
 *
 * @param question      - Raw student question (normalized internally to find the cache row)
 * @param chapterNumber - Chapter context
 * @param audioBuffer   - MP3 binary data from TTS API
 * @param ttsVoice      - Voice used (e.g. "alloy")
 * @param ttsModel      - TTS model used (e.g. "gpt-4o-mini-tts")
 */
export async function saveAudioToCache(
  question:      string,
  chapterNumber: number,
  audioBuffer:   ArrayBuffer,
  ttsVoice:      string,
  ttsModel:      string,
): Promise<void> {
  if (!chapterNumber || chapterNumber <= 0) return;

  try {
    const db          = getDb();
    const normalized  = normalizeQuestion(question);
    const filename    = audioFilename(normalized, chapterNumber);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    // ── Upload to Supabase Storage ──────────────────────────────────────────
    const { error: uploadError } = await db.storage
      .from('tts-audio')
      .upload(filename, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,   // deterministic filename — safe overwrite on concurrent uploads
      });

    if (uploadError) {
      console.warn('[qaCache] audio upload failed:', uploadError.message);
      return;
    }

    const audioUrl = `${supabaseUrl}/storage/v1/object/public/tts-audio/${filename}`;

    // ── Find the cache row by (normalized_question, chapter_number) ─────────
    const { data: rows } = await db
      .from('qa_cache')
      .select('id, answer_json')
      .eq('normalized_question', normalized)
      .eq('chapter_number', chapterNumber)
      .limit(1);

    if (!rows?.[0]) {
      console.warn('[qaCache] saveAudioToCache: no cache row for', normalized.slice(0, 50));
      return;
    }

    const row = rows[0] as { id: string; answer_json: { dur?: number } };
    await patchCacheAudio(row.id, audioUrl, ttsVoice, ttsModel, Number(row.answer_json?.dur ?? 30));
  } catch (err) {
    console.warn('[qaCache] saveAudioToCache error:', (err as Error).message);
  }
}

/**
 * Same as saveAudioToCache but patches a specific row by UUID instead of looking it up.
 * Use this for semantic-match cache hits where the cached row's normalized_question
 * differs from the user's question.
 *
 * @param id            - UUID of the qa_cache row to patch
 * @param question      - Student question (used only for the storage filename)
 * @param chapterNumber - Chapter context (used for the storage path)
 * @param audioBuffer   - MP3 binary data
 * @param ttsVoice      - Voice ID used
 * @param ttsModel      - TTS model used
 */
export async function saveAudioToCacheById(
  id:            string,
  question:      string,
  chapterNumber: number,
  audioBuffer:   ArrayBuffer,
  ttsVoice:      string,
  ttsModel:      string,
): Promise<void> {
  if (!chapterNumber || chapterNumber <= 0 || !id) return;

  try {
    const db          = getDb();
    const normalized  = normalizeQuestion(question);
    const filename    = audioFilename(normalized, chapterNumber);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    const { error: uploadError } = await db.storage
      .from('tts-audio')
      .upload(filename, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

    if (uploadError) {
      console.warn('[qaCache] saveAudioToCacheById upload failed:', uploadError.message);
      return;
    }

    const audioUrl = `${supabaseUrl}/storage/v1/object/public/tts-audio/${filename}`;

    // Look up dur from the row itself
    const { data: rows } = await db
      .from('qa_cache')
      .select('answer_json')
      .eq('id', id)
      .limit(1);
    const dur = Number((rows?.[0] as any)?.answer_json?.dur ?? 30);

    await patchCacheAudio(id, audioUrl, ttsVoice, ttsModel, dur);
  } catch (err) {
    console.warn('[qaCache] saveAudioToCacheById error:', (err as Error).message);
  }
}

// ── Analytics — cache event logging ──────────────────────────────────────────

/**
 * Logs a single cache lookup event to `cache_analytics`.
 * Always fire-and-forget — never throws, never adds latency.
 *
 * result_type values:
 *   'exact'           — normalized question matched exactly (no embedding used)
 *   'semantic'        — pgvector cosine similarity match
 *   'miss'            — no match; fresh GPT + RAG generation triggered
 *   'audio_generated' — TTS was called to generate audio for a cache-hit row
 *
 * had_audio:
 *   true  → the cache hit already had audio_url set (CDN served, zero TTS cost)
 *   false → client will call mode=audio (TTS cost still incurred)
 */
export async function logCacheEvent(input: CacheEventInput): Promise<void> {
  try {
    const db         = getDb();
    const normalized = normalizeQuestion(input.question);
    const { error }  = await db.from('cache_analytics').insert({
      question:            input.question.trim().slice(0, 500),
      normalized_question: normalized.slice(0, 500),
      chapter_number:      input.chapterNumber,
      result_type:         input.resultType,
      similarity_score:    input.similarity,
      had_audio:           input.hadAudio,
    });
    if (error) console.warn('[analytics] insert failed:', error.message);
  } catch (err) {
    console.warn('[analytics] logCacheEvent error:', (err as Error).message);
  }
}
