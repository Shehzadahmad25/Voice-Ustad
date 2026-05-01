/**
 * lib/agents/tools.ts
 * -------------------
 * Tool functions for the Tutor Agent.
 *
 * Each exported function has a single responsibility and is called by
 * tutorAgent.ts in sequence.  Helper utilities that were previously
 * inline in route.ts live here so they can be tested in isolation.
 *
 * Exports consumed by tutorAgent.ts:
 *   retrieveContent, generateAnswerFromDB, generateStructuredAnswer,
 *   generateUrduSummary, buildDbContentBlock
 *
 * Exports consumed by route.ts (audio mode):
 *   sanitizeUrduTtsText, MAX_TTS_CHARS
 *
 * Exports consumed by both:
 *   StructuredAnswer, normalizeStructuredAnswer, repairStructuredAnswer
 */

import { classifyQuestionType }                        from '@/lib/classifyQuestionType';
import { retrieveBookContent, type RetrievalResult }   from '@/lib/retrieveBookContent';
import { TEACHER_URDU_SYSTEM_PROMPT, buildTeacherStyleUrduTts, postProcessUrduTts } from '@/lib/tts/teacherUrdu';
import { TUTOR_SYSTEM_PROMPT, buildTutorUserPrompt }   from './prompts';

export type { RetrievalResult };

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StructuredAnswer {
  definition:    string;
  explanation:   string;
  example:       string;
  formula:       string;
  flabel:        string;
  dur:           number;
  tip?:          string;
  urduTtsText:   string;
  refChapterNo?: string;
  refPageNo?:    string;
  refLabel?:     string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const OPENAI_TIMEOUT_MS     = Number(process.env.OPENAI_TIMEOUT_MS           || 25_000);
const MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 650);

/** Exported so route.ts audio-mode handler can apply the same truncation limit. */
export const MAX_TTS_CHARS  = Number(process.env.TTS_MAX_TEXT_CHARS           || 1_200);

// ── Text utilities ─────────────────────────────────────────────────────────────

/**
 * Strips JSON artifacts and normalizes whitespace from raw TTS input text.
 * Exported for use in the audio-mode handler in route.ts.
 */
export function sanitizeUrduTtsText(input: string): string {
  let out = String(input || '')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  out = out
    .replace(/\b(text|points|formula|flabel|dur|tip|mcq|question|options|correct)\s*:/gi, ' ')
    .replace(/\b[A-D][.):\s]/g, ' ')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (out.length > MAX_TTS_CHARS) out = out.slice(0, MAX_TTS_CHARS);
  return out;
}

/**
 * Normalizes any AI or DB response shape into the StructuredAnswer schema.
 * Handles both the current JSON schema and legacy {text, points} format.
 */
export function normalizeStructuredAnswer(data: unknown): StructuredAnswer {
  const d   = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const legacyDef = str(d?.text);
  const legacyExp = Array.isArray(d?.points)
    ? (d.points as unknown[]).map((p) => String(p).trim()).filter(Boolean).join(' ')
    : '';

  return {
    definition:   str(d?.definition)  || legacyDef,
    explanation:  str(d?.explanation) || legacyExp,
    example:      str(d?.example)     || '',
    formula:      str(d?.formula)     || '',
    flabel:       str(d?.flabel)      || '',
    dur:          Number.isFinite(Number(d?.dur)) ? Number(d.dur) : 30,
    tip:          str(d?.tip),
    urduTtsText:  str(d?.urduTtsText),
    refChapterNo: str(d?.refChapterNo),
    refPageNo:    str(d?.refPageNo),
    refLabel:     str(d?.refLabel) || 'Board Reference',
  };
}

/** Ensures at least one required content field is populated. */
export function repairStructuredAnswer(ans: StructuredAnswer): StructuredAnswer {
  if (!ans.definition && !ans.explanation && !ans.example) {
    return { ...ans, definition: 'Answer not available for this topic.' };
  }
  return ans;
}

/** Formats retrieved DB blocks into a labeled string block for the AI prompt. */
export function buildDbContentBlock(db: RetrievalResult): string {
  const lines: string[] = [];
  if (db.blocks.definition)  lines.push(`Definition: ${db.blocks.definition}`);
  if (db.blocks.explanation) lines.push(`Explanation: ${db.blocks.explanation}`);
  if (db.blocks.formula)     lines.push(`Formula (${db.blocks.flabel || 'KEY'}): ${db.blocks.formula}`);
  if (db.blocks.example)     lines.push(`Example: ${db.blocks.example}`);
  return lines.join('\n');
}

// ── JSON repair helpers (private) ──────────────────────────────────────────────

function sanitizeModelJsonCandidate(input: string): string {
  let candidate = input.trim();
  if (candidate.startsWith('```')) {
    candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  let out = '';
  let inString    = false;
  let escaped     = false;
  let objectDepth = 0;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped)      { out += ch; escaped = false; continue; }
      if (ch === '\\')  { out += ch; escaped = true;  continue; }
      if (ch === '\n')  { out += '\\n'; continue; }
      if (ch === '\r')  { out += '\\r'; continue; }
      if (ch === '\t')  { out += '\\t'; continue; }
      if (ch === '"') inString = false;
      out += ch; continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '{') objectDepth++;
    if (ch === '}') objectDepth = Math.max(0, objectDepth - 1);
    out += ch;
  }
  if (inString)       out += '"';
  if (objectDepth > 0) out += '}'.repeat(objectDepth);
  return out.replace(/,\s*([}\]])/g, '$1');
}

function cleanFieldValue(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^[,\s]+/, '')
    .replace(/[,\s]+$/, '')
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();
}

function parseLabelledStructured(raw: string): Partial<StructuredAnswer> | null {
  const input = raw.trim();
  const keyRe = /\b(definition|explanation|example|formula|flabel|dur|urduTtsText)\s*:/gi;
  const hits: Array<{ key: string; index: number; valueStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(input)) !== null) {
    hits.push({ key: m[1].toLowerCase(), index: m.index, valueStart: keyRe.lastIndex });
  }
  if (!hits.length) return null;
  const out: Partial<StructuredAnswer> = {};
  for (let i = 0; i < hits.length; i++) {
    const cur   = hits[i];
    const next  = hits[i + 1];
    const value = cleanFieldValue(input.slice(cur.valueStart, next ? next.index : input.length));
    if      (cur.key === 'definition')   out.definition  = value;
    else if (cur.key === 'explanation')  out.explanation = value;
    else if (cur.key === 'example')      out.example     = value;
    else if (cur.key === 'formula')      out.formula     = value;
    else if (cur.key === 'flabel')       out.flabel      = value;
    else if (cur.key === 'urduttstext')  out.urduTtsText = value;
    else if (cur.key === 'dur') {
      const n = Number(String(value).match(/\d+/)?.[0] ?? '');
      if (Number.isFinite(n)) out.dur = n;
    }
  }
  return out;
}

function parseStructuredJson(rawContent: string): StructuredAnswer {
  const trimmed     = rawContent.trim();
  const candidates  = [trimmed];
  const first       = trimmed.indexOf('{');
  const last        = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  else if (first !== -1)            candidates.push(trimmed.slice(first));

  // Pass 1: direct parse
  for (const c of candidates) {
    try { return repairStructuredAnswer(normalizeStructuredAnswer(JSON.parse(c))); } catch {}
  }
  // Pass 2: repaired parse
  for (const c of candidates) {
    try { return repairStructuredAnswer(normalizeStructuredAnswer(JSON.parse(sanitizeModelJsonCandidate(c)))); } catch {}
  }
  // Pass 3: labelled key: value
  const labelled = parseLabelledStructured(trimmed);
  if (labelled) return repairStructuredAnswer(normalizeStructuredAnswer(labelled));
  // Pass 4: plain text fallback
  const plain = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').replace(/[{}[\]"]/g, '').trim();
  return repairStructuredAnswer(normalizeStructuredAnswer({ definition: plain || 'Could not parse model response.' }));
}

// ── Tool: retrieveContent ──────────────────────────────────────────────────────

/**
 * Retrieves relevant book content for the student question.
 * Returns null on cache miss or DB error — agent falls back to AI.
 */
export async function retrieveContent(
  question:      string,
  chapterNumber: number,
): Promise<RetrievalResult | null> {
  if (!chapterNumber || chapterNumber <= 0) return null;
  try {
    const qType  = classifyQuestionType(question);
    const result = await retrieveBookContent(question, qType, chapterNumber);
    return result.found ? result : null;
  } catch {
    return null;
  }
}

// ── Tool: generateAnswerFromDB ─────────────────────────────────────────────────

/**
 * Builds a StructuredAnswer directly from DB blocks.
 *
 * STRICT DATABASE MODE: returns ONLY values stored in the `topics` row.
 * No text is generated, modified, or supplemented. If a field is empty
 * in the DB it stays empty here — the frontend handles missing fields.
 */
export function generateAnswerFromDB(db: RetrievalResult): StructuredAnswer {
  return {
    definition:  db.blocks.definition   || '',
    explanation: db.blocks.explanation  || '',
    example:     db.blocks.example      || '',
    formula:     db.blocks.formula      || '',
    flabel:      db.blocks.flabel       || '',
    urduTtsText: db.blocks.urduTtsText  || '',
    dur:         30,
  };
}

// ── Tool: generateStructuredAnswer ────────────────────────────────────────────

/**
 * Calls OpenAI to produce a structured answer.
 * Used when DB retrieval misses or returns incomplete content.
 * Accepts optional DB content to ground the response in book facts.
 */
export async function generateStructuredAnswer(
  message:       string,
  chapter:       string,
  recentContext: string,
  dbContent?:    RetrievalResult | null,
): Promise<StructuredAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model   = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const dbBlock = dbContent?.found ? buildDbContentBlock(dbContent) : '';

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal:  controller.signal,
      body: JSON.stringify({
        model,
        temperature:            0.2,
        max_completion_tokens:  MAX_COMPLETION_TOKENS,
        response_format:        { type: 'json_object' },
        messages: [
          { role: 'system', content: TUTOR_SYSTEM_PROMPT },
          { role: 'user',   content: buildTutorUserPrompt({ message, chapter, recentContext, dbBlock }) },
        ],
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError')
      throw new Error(`OpenAI timed out after ${OPENAI_TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const json       = await res.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const rawContent = json?.choices?.[0]?.message?.content;
  if (rawContent == null) throw new Error('OpenAI returned empty content');
  if (typeof rawContent !== 'string') return repairStructuredAnswer(normalizeStructuredAnswer(rawContent));
  return parseStructuredJson(rawContent);
}

// ── Tool: generateUrduSummary ─────────────────────────────────────────────────

export interface UrduSummaryFields {
  definition:  string;
  explanation: string;
  example:     string;
  formula?:    string;
  flabel?:     string;
}

/**
 * Generates teacher-style Urdu TTS text from the structured answer fields.
 *
 * Pipeline:
 *   1. buildTeacherStyleUrduTts   — assembles labeled English source text
 *   2. OpenAI (TEACHER_URDU_SYSTEM_PROMPT) — converts to spoken Urdu
 *   3. sanitizeUrduTtsText + postProcessUrduTts — cleans and paces the output
 *
 * Returns post-processed Urdu text ready to pass to Azure TTS.
 * Returns empty string if the generation fails (Urdu is optional).
 */
/** Returns true when the Urdu text ends with a proper closing sentence. */
function isUrduScriptComplete(text: string): boolean {
  const t = text.trimEnd();
  // Must end with Urdu full-stop, !, ?, or one of the known closing phrases
  if (/[۔!؟]$/.test(t)) return true;
  if (/\.\s*$/.test(t))  return true;
  return false;
}

async function callUrduLlm(
  apiKey: string,
  model: string,
  sourceText: string,
  maxTokens: number,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal:  controller.signal,
      body: JSON.stringify({
        model,
        temperature:           0.4,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: TEACHER_URDU_SYSTEM_PROMPT },
          { role: 'user',   content: sourceText },
        ],
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return String(json?.choices?.[0]?.message?.content ?? '').trim();
}

export async function generateUrduSummary(fields: UrduSummaryFields): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return '';

  const model      = process.env.OPENAI_TTS_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const sourceText = buildTeacherStyleUrduTts(fields);

  let content = '';
  try {
    content = await callUrduLlm(apiKey, model, sourceText, 750);
  } catch {
    return '';
  }

  if (!content) return '';

  // Completeness check: if script is cut mid-sentence, retry once with more tokens
  if (!isUrduScriptComplete(content)) {
    try {
      const retry = await callUrduLlm(apiKey, model, sourceText, 900);
      if (retry && isUrduScriptComplete(retry)) content = retry;
    } catch {
      // keep first attempt
    }
  }

  return postProcessUrduTts(sanitizeUrduTtsText(content));
}

// ── Tool: generateDevUrduTts ──────────────────────────────────────────────────

/**
 * DEV MODE: generates fresh Roman Urdu TTS text for every request.
 *
 * Uses a strict Urdu prompt — Definition→Explanation→Example structure,
 * 100% faithful to textbook content, Pakistani ustad tone.
 *
 * Input: topic title + definition + explanation + example (optional).
 * Output: Raw Urdu script string. Caller applies sanitizeUrduTtsText.
 * Never throws — returns '' on any failure.
 *
 * Controlled by SAVE_URDU_TTS env var in tutorAgent.ts.
 */

const DEV_URDU_SYSTEM_PROMPT =
  'You are VoiceUstad, a friendly Pakistani tutor for FSc students.\n' +
  'Powered by Claude Opus — the most intelligent AI model.\n' +
  '\n' +
  'YOUR JOB:\n' +
  'You will receive English textbook content for a topic.\n' +
  'Explain THAT SAME content in spoken Urdu — do not add new\n' +
  'information, do not change the meaning, do not skip anything\n' +
  'important from the English text.\n' +
  'You are a Pakistani ustad reading the textbook out loud in Urdu.\n' +
  '\n' +
  'LANGUAGE RULES:\n' +
  '- Always reply in Urdu script only\n' +
  '- Use natural Pakistani spoken Urdu\n' +
  '- Keep English scientific terms as-is:\n' +
  '  "Limiting Reagent", "Stoichiometry", "Mitosis", "Newton\'s Law",\n' +
  '  "definition", "equation", "reaction", "coefficient"\n' +
  '- Never translate scientific terms into Urdu\n' +
  '- Never use Roman Urdu\n' +
  '- Never reply in full English\n' +
  '\n' +
  'TONE:\n' +
  '- Warm, encouraging Pakistani ustad tone\n' +
  '- Speak directly to student: "دیکھو، یہاں textbook کہتی ہے..."\n' +
  '- Use "آپ" — always respectful to the student\n' +
  '- Sound like a real classroom teacher, not a robot\n' +
  '\n' +
  'STRUCTURE — respond in exactly this order:\n' +
  '1. Definition — translate the textbook definition into simple Urdu\n' +
  '   keep the English term, explain meaning in Urdu\n' +
  '   End with ۔\n' +
  '2. Explanation — explain the textbook explanation sentence by\n' +
  '   sentence in Urdu, same order as English text\n' +
  '   Use ، for pauses between points\n' +
  '   End with ۔\n' +
  '3. Example — if textbook has example explain it in Urdu\n' +
  '   If no textbook example, give one Pakistani everyday example\n' +
  '   that matches the same concept exactly\n' +
  '   End with ۔\n' +
  '\n' +
  'STRICT CONTENT RULES:\n' +
  '- Stay 100% faithful to textbook content\n' +
  '- Do not add extra facts not in the textbook\n' +
  '- Do not skip any point from the textbook\n' +
  '- If textbook has formula mention it: "formula yeh hai: [formula]"\n' +
  '- Max 250 words — complete but concise\n' +
  '\n' +
  'TTS FORMATTING RULES:\n' +
  '- Short sentences only — max 15 words per sentence\n' +
  '- No bullets, no markdown, no ** ## or ---\n' +
  '- No English parentheses or brackets\n' +
  '- Use ۔ at end of every sentence\n' +
  '- Use ، where a speaker would naturally pause\n' +
  '- Leave a natural gap between Definition, Explanation\n' +
  '  and Example sections using ۔۔۔\n' +
  '\n' +
  'INPUT YOU WILL RECEIVE:\n' +
  'English textbook content:\n' +
  '[definition, explanation and example will be here]\n' +
  '\n' +
  'OUTPUT:\n' +
  'Urdu spoken explanation of the above content only.\n' +
  'Nothing else.';

const ANTHROPIC_TIMEOUT_MS = 25_000;

export async function generateDevUrduTts(
  topicTitle:  string,
  definition:  string,
  explanation: string,
  example?:    string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('[urdu-tts] ANTHROPIC_API_KEY exists:', !!apiKey, apiKey?.slice(0, 10));
  if (!apiKey) {
    console.warn('[urdu-tts] ANTHROPIC_API_KEY not set — skipping Urdu text generation');
    return '';
  }

  const def  = definition.trim();
  const exp  = explanation.trim();
  const ex   = (example ?? '').trim();

  console.log('[urdu-tts] inputs —',
    'topic:', topicTitle,
    '| definition chars:', def.length,
    '| explanation chars:', exp.length,
    '| example chars:', ex.length,
  );

  const parts = [
    `Topic: ${topicTitle.trim()}`,
    def  ? `Definition: ${def}`   : '',
    exp  ? `Explanation: ${exp}`  : '',
    ex   ? `Example: ${ex}`       : '',
  ].filter(Boolean).join('\n\n');

  const userContent = parts ? 'English textbook content:\n' + parts : '';
  if (!userContent.trim()) return '';

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'content-type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model:      'claude-opus-4-5',
        max_tokens: 1024,
        system:     DEV_URDU_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });
    if (!res.ok) {
      console.error('[urdu-tts] Anthropic API error', res.status, await res.text().catch(() => ''));
      return '';
    }
    const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
    const result = String(json?.content?.[0]?.text ?? '').trim();
    console.log('[urdu-tts] Claude Opus response length:', result.length, '| preview:', result.slice(0, 80));
    return result;
  } catch (err) {
    console.error('[urdu-tts] fetch failed:', err instanceof Error ? err.message : err);
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}
