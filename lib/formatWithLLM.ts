/**
 * formatWithLLM
 * -------------
 * PIPELINE STEP 3: DB content → LLM (format + Urdu voice)
 *
 * Uses the OpenAI Responses API (client.responses.create).
 * The LLM is a PURE FORMATTING ENGINE — it only reshapes content
 * already retrieved from the DB. It never invents, never searches,
 * never says "not available".
 *
 * temperature : 0   (fully deterministic)
 * model       : gpt-4.1-mini
 */

import OpenAI from 'openai';
import type { RetrievalResult, RetrievedBlocks } from './retrieveBookContent';
import type { TopicViewResult } from './retrieveTopicContent';

// ── Output shape ──────────────────────────────────────────────────────────────

export interface FormattedAnswer {
  definition:  string;
  explanation: string;
  formula:     string;
  flabel:      string;
  example:     string;
  urduTtsText: string;
  refPageNo:   string;
  dur:         number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL        = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const MAX_TOKENS   = 600;
const TIMEOUT_MS   = Number(process.env.OPENAI_TIMEOUT_MS || 25_000);

// ── Singleton OpenAI client ───────────────────────────────────────────────────

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ── Prompt builders ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are a strict formatting engine for VoiceUstad, a Pakistani chemistry tutoring app.

ABSOLUTE RULES — never break these:
1. Use ONLY the text inside <book_content>. Copy it word for word where required.
2. NEVER add knowledge, context, or explanation that is not in <book_content>.
3. NEVER say "not available", "not found", "no information", or any similar phrase.
   If a field has no matching content, output an empty string "" for that field.
4. NEVER use bullet points (•, -, *) or numbered lists (1. 2. 3.) in any field.
5. NEVER output markdown headers (##) or bold (**text**) or italics.
6. ALL field values must be plain prose text only.
7. The "definition" field MUST be copied EXACTLY from <book_content> — word for word, no paraphrasing.
8. Return ONLY the JSON object — no preamble, no explanation, no trailing text.
9. Every field that has no content from <book_content> MUST be an empty string "".
10. urduTtsText: 5–7 natural spoken Urdu sentences. Science terms stay in English.
    Structure: intro → definition → formula (if any) → example (if any) → closing.
    No bullet points. No invented content. Based ONLY on <book_content>.
11. dur: integer 25–55 representing estimated Urdu audio seconds.`;

function buildUserMessage(question: string, retrieval: RetrievalResult): string {
  const { blocks, page } = retrieval;
  const lines: string[] = [];

  if (blocks.definition)  lines.push(`DEFINITION: ${blocks.definition}`);
  if (blocks.explanation) lines.push(`EXPLANATION: ${blocks.explanation}`);
  if (blocks.formula)     lines.push(`FORMULA: ${blocks.formula}`);
  if (blocks.flabel)      lines.push(`FORMULA_LABEL: ${blocks.flabel}`);
  if (blocks.example)     lines.push(`EXAMPLE${page ? ` [Page ${page}]` : ''}: ${blocks.example}`);

  const bookContent = lines.length > 0 ? lines.join('\n') : 'NONE';

  return [
    `<book_content>`,
    bookContent,
    `</book_content>`,
    '',
    `Output this JSON and nothing else:`,
    `{`,
    `  "definition": "",`,
    `  "explanation": "",`,
    `  "formula": "",`,
    `  "flabel": "",`,
    `  "example": "",`,
    `  "urduTtsText": "",`,
    `  "refPageNo": "${page ?? ''}",`,
    `  "dur": 30`,
    `}`,
    '',
    `Rules for this response:`,
    `- definition  → copy EXACTLY from DEFINITION line above (if present), else ""`,
    `- explanation → restate ONLY the EXPLANATION line above (if present), else ""`,
    `- formula     → copy EXACTLY from FORMULA line above (if present), else ""`,
    `- flabel      → copy EXACTLY from FORMULA_LABEL line above (if present), else ""`,
    `- example     → copy EXACTLY from EXAMPLE line above (if present), else ""`,
    `- refPageNo   → "${page ?? ''}" if an EXAMPLE with a page number exists above, else ""`,
    '',
    `Student question (for Urdu context only — do NOT answer it directly): ${question}`,
  ].join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Sends pre-fetched DB content to the OpenAI Responses API for clean JSON formatting.
 * The model acts purely as a formatter — not a knowledge source.
 *
 * @param question   - Original student question (Urdu TTS context only)
 * @param retrieval  - Output of retrieveBookContent()
 * @returns FormattedAnswer with strict JSON fields
 */
export async function formatWithLLM(
  question: string,
  retrieval: RetrievalResult,
): Promise<FormattedAnswer> {
  const client = getClient();
  const userMessage = buildUserMessage(question, retrieval);

  // AbortController for manual timeout (SDK doesn't expose per-call timeout)
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawText: string;
  try {
    const response = await client.responses.create(
      {
        model:      MODEL,
        temperature: 0,
        max_output_tokens: MAX_TOKENS,
        text: {
          format: { type: 'json_object' },
        },
        instructions: SYSTEM_PROMPT,
        input: userMessage,
      },
      { signal: controller.signal },
    );

    rawText = response.output_text ?? '';
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('LLM format request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!rawText) throw new Error('Empty response from LLM formatter');

  // Parse — model instructed to return JSON only
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('LLM formatter returned non-JSON output');
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  return {
    definition:  str(parsed.definition),
    explanation: str(parsed.explanation),
    formula:     str(parsed.formula),
    flabel:      str(parsed.flabel) || retrieval.blocks.flabel,
    example:     str(parsed.example),
    urduTtsText: str(parsed.urduTtsText),
    refPageNo:   str(parsed.refPageNo),
    dur:         Number.isFinite(Number(parsed.dur)) ? Number(parsed.dur) : 30,
  };
}

// ── Topic-View formatter ──────────────────────────────────────────────────────

const TOPIC_SYSTEM_PROMPT = `\
You are a strict formatting engine for VoiceUstad, a Pakistani chemistry tutoring app.
This is a FULL TOPIC VIEW request — not a quick question answer.

ABSOLUTE RULES:
1. Use ONLY the text inside <book_content>. Copy it word for word where required.
2. NEVER add knowledge, context, or explanation that is not in <book_content>.
3. NEVER say "not available", "not found", or any similar phrase. Use "" for missing fields.
4. NEVER use bullet points (•, -, *) or numbered lists.
5. NEVER output markdown (##, **, __, *italic*).
6. definition  → copy EXACTLY from DEFINITION line, word for word.
7. explanation → include the COMPLETE EXPLANATION text from <book_content>. Do NOT shorten it. Do NOT summarize. Copy fully.
8. formula     → copy EXACTLY from FORMULA line, else "".
9. flabel      → copy EXACTLY from FORMULA_LABEL line, else "".
10. example    → copy EXACTLY from EXAMPLE line, else "".
11. urduTtsText → 8-10 natural spoken Urdu sentences covering the full topic. Science terms in English script. No bullets. No invented content.
12. dur        → integer 35–65 (Urdu audio seconds estimate for full topic).
13. Return ONLY the JSON object — nothing else.`;

function buildTopicUserMessage(result: TopicViewResult): string {
  const { blocks, page_start, page_end, topic } = result;
  const lines: string[] = [];

  if (blocks.definition)  lines.push(`DEFINITION: ${blocks.definition}`);
  if (blocks.explanation) lines.push(`EXPLANATION: ${blocks.explanation}`);
  if (blocks.formula)     lines.push(`FORMULA: ${blocks.formula}`);
  if (blocks.flabel)      lines.push(`FORMULA_LABEL: ${blocks.flabel}`);
  if (blocks.example)     lines.push(`EXAMPLE: ${blocks.example}`);

  const pageStr =
    page_start && page_end && page_start !== page_end
      ? `${page_start}–${page_end}`
      : page_start
      ? String(page_start)
      : '';

  return [
    `<book_content>`,
    lines.length ? lines.join('\n') : 'NONE',
    `</book_content>`,
    '',
    `Topic: ${topic}`,
    pageStr ? `Pages: ${pageStr}` : '',
    '',
    `Output this JSON and nothing else:`,
    `{`,
    `  "definition": "",`,
    `  "explanation": "",`,
    `  "formula": "",`,
    `  "flabel": "",`,
    `  "example": "",`,
    `  "urduTtsText": "",`,
    `  "dur": 40`,
    `}`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}

/**
 * Formats a full topic view using ALL retrieved content blocks.
 * The explanation is preserved completely — not shortened.
 *
 * @param result - Output of retrieveTopicContent()
 */
export async function formatTopicWithLLM(
  result: TopicViewResult,
): Promise<FormattedAnswer> {
  const client      = getClient();
  const userMessage = buildTopicUserMessage(result);

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawText: string;
  try {
    const response = await client.responses.create(
      {
        model:             MODEL,
        temperature:       0,
        max_output_tokens: 800,         // more tokens for full topic content
        text: {
          format: { type: 'json_object' },
        },
        instructions: TOPIC_SYSTEM_PROMPT,
        input:        userMessage,
      },
      { signal: controller.signal },
    );
    rawText = response.output_text ?? '';
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('Topic LLM format request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!rawText) throw new Error('Empty response from topic LLM formatter');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Topic LLM formatter returned non-JSON output');
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  return {
    definition:  str(parsed.definition),
    explanation: str(parsed.explanation),
    formula:     str(parsed.formula),
    flabel:      str(parsed.flabel) || result.blocks.flabel,
    example:     str(parsed.example),
    urduTtsText: str(parsed.urduTtsText),
    refPageNo:   '',     // not needed for topic view (page range comes from retrieval)
    dur:         Number.isFinite(Number(parsed.dur)) ? Number(parsed.dur) : 40,
  };
}
