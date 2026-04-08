/**
 * validateAnswer
 * --------------
 * PIPELINE STEP 4: Validate LLM output before returning to client.
 *
 * Rules enforced:
 * - Must be a plain object (not array, not null)
 * - Only allowed keys: definition, explanation, formula, flabel, example, urduTtsText, refPageNo, dur
 * - All content fields must be strings (no arrays, no objects)
 * - No bullet characters at the start of any line
 * - No markdown headers (##, **bold**, etc.)
 * - No numbered list starts (1. 2. 3.)
 *
 * On failure:
 * - Returns { valid: false, errors: [...] }
 * - Caller should retry once, then fallback to raw DB blocks
 */

import type { FormattedAnswer } from './formatWithLLM';
import type { RetrievedBlocks } from './retrieveBookContent';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  answer: FormattedAnswer;
}

// ── Rules ─────────────────────────────────────────────────────────────────────

const ALLOWED_KEYS = new Set([
  'definition',
  'explanation',
  'formula',
  'flabel',
  'example',
  'urduTtsText',
  'refPageNo',
  'dur',
]);

const CONTENT_KEYS: Array<keyof FormattedAnswer> = [
  'definition',
  'explanation',
  'formula',
  'example',
  'urduTtsText',
];

// Matches bullet-like starts: "• ", "- ", "* ", or "1. " / "2. " at line start
const BULLET_RE = /^(\s*[-•*]\s+|\s*\d+\.\s+)/m;

// Matches markdown headers or bold
const MARKDOWN_RE = /^#{1,6}\s|(\*\*|__)/m;

// Phrases the model sometimes emits when a field is empty — strip them to ""
const NOT_AVAILABLE_RE =
  /^\s*(not available|not found|no information|information not available|not available in (the )?book|n\/a|none)\s*\.?\s*$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripBullets(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s+/, '').replace(/^\s*\d+\.\s+/, ''))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .trim();
}

function cleanField(value: string): string {
  let v = String(value || '').trim();
  v = stripMarkdown(v);
  v = stripBullets(v);
  // Silence any "not available" leak — return empty string instead
  if (NOT_AVAILABLE_RE.test(v)) v = '';
  return v;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Validates a FormattedAnswer object.
 * Auto-cleans bullet/markdown issues rather than failing hard on them.
 * Only returns valid=false for structural errors (wrong types, etc.)
 */
export function validateAnswer(answer: unknown): ValidationResult {
  const errors: string[] = [];

  // 1. Must be a plain object
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      valid: false,
      errors: ['Answer is not a plain object'],
      answer: buildFallback({}),
    };
  }

  const obj = answer as Record<string, unknown>;

  // 2. Check for disallowed keys
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`Disallowed key: "${key}"`);
    }
  }

  // 3. All content fields must be strings
  for (const key of CONTENT_KEYS) {
    if (obj[key] !== undefined && typeof obj[key] !== 'string') {
      errors.push(`Field "${key}" must be a string, got ${typeof obj[key]}`);
    }
  }

  // If structural errors exist, cannot recover
  if (errors.length > 0) {
    return { valid: false, errors, answer: buildFallback(obj) };
  }

  // 4. Auto-clean: strip bullets and markdown from all content fields
  const cleaned: FormattedAnswer = {
    definition:  cleanField(String(obj.definition  ?? '')),
    explanation: cleanField(String(obj.explanation ?? '')),
    formula:     String(obj.formula     ?? '').trim(),  // formulas need exact text
    flabel:      String(obj.flabel      ?? '').trim(),
    example:     cleanField(String(obj.example     ?? '')),
    urduTtsText: cleanField(String(obj.urduTtsText ?? '')),
    refPageNo:   String(obj.refPageNo   ?? '').trim(),
    dur:         Number.isFinite(Number(obj.dur)) ? Number(obj.dur) : 30,
  };

  // 5. Warn (but don't fail) if bullets/markdown were detected before cleaning
  for (const key of CONTENT_KEYS) {
    const raw = String(obj[key] ?? '');
    if (BULLET_RE.test(raw))   errors.push(`Field "${key}" contained bullet chars (auto-cleaned)`);
    if (MARKDOWN_RE.test(raw)) errors.push(`Field "${key}" contained markdown (auto-cleaned)`);
  }

  return { valid: true, errors, answer: cleaned };
}

/**
 * Build a safe fallback FormattedAnswer from raw DB blocks.
 * Used when LLM output is structurally invalid.
 */
export function buildFallback(
  raw: Record<string, unknown>,
  dbBlocks?: Partial<RetrievedBlocks>,
  page?: number | null,
): FormattedAnswer {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    definition:  str(dbBlocks?.definition)  || str(raw.definition),
    explanation: str(dbBlocks?.explanation) || str(raw.explanation),
    formula:     str(dbBlocks?.formula)     || str(raw.formula),
    flabel:      str(dbBlocks?.flabel)      || str(raw.flabel),
    example:     str(dbBlocks?.example)     || str(raw.example),
    urduTtsText: '',   // skip Urdu on fallback — better silent than wrong
    refPageNo:   page ? String(page) : '',
    dur:         25,
  };
}
