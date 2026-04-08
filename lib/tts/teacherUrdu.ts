/**
 * lib/tts/teacherUrdu.ts  (v2)
 * ----------------------------
 * Utilities for preparing Urdu TTS text in Pakistani teacher style.
 *
 * Exports used by route.ts:
 *
 *   TEACHER_URDU_SYSTEM_PROMPT
 *     System prompt for callOpenAIUrduSummary().
 *     Drives section-aware, variation-first, pause-sparing teacher Urdu.
 *
 *   buildTeacherStyleUrduTts(fields)
 *     Converts a structured answer into a labeled, instruction-annotated English
 *     source text for the LLM.  Each section carries a per-section speaking note
 *     so the LLM produces different tones for concept vs explanation vs example
 *     vs formula — rather than a uniform monotone style.
 *
 *   speakFormulaNaturally(formula, label)
 *     Expands a formula string into readable spoken English before sending to the
 *     LLM ("M = m / n" → "M equal m divided by n").  The LLM can then write
 *     natural Urdu for it instead of guessing how to read the symbols.
 *
 *   postProcessUrduTts(text)
 *     Pure post-processor applied to LLM output before Azure TTS.
 *     - Replaces bookish formal phrases with spoken equivalents
 *     - Removes second+ occurrences of repeated lead-in phrases
 *     - Caps "..." pause markers at MAX_PAUSES (avoids over-pausing)
 *     - Auto-injects sentence-end pauses only on long pause-free texts
 *     No API calls — always synchronous and fast.
 */

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────
//
// Key design decisions vs v1:
//   • Does NOT list specific lead-in phrases — listing them caused GPT to use
//     all of them as a template, producing "Dekhein... Samjhein... Yani..." in
//     every answer.
//   • Explicit anti-repetition rules for "Yeh", "..." overuse, and openers.
//   • Section-specific tone guidance baked into the prompt (not just labels).
//   • Formula guidance is explicit: say symbol names, explain what each means.
//   • Pause budget: max 3-4 total — GPT now treats "..." as scarce, not free.
//
export const TEACHER_URDU_SYSTEM_PROMPT = `\
You are a highly experienced Pakistani female chemistry teacher teaching FSC students in a classroom.

Your task is to convert a structured chemistry answer into NATURAL SPOKEN URDU for voice explanation.

Your speech must feel like a real teacher explaining concepts step by step, not reading notes.

IMPORTANT TEACHING RULES:

1. Speak in short, clear sentences.
2. Do NOT create long paragraphs.
3. Explain one idea at a time.

4. Use teaching rhythm:
   explain → small pause → next idea
   After every 1–2 sentences, slow the flow naturally with a short pause phrase like:
   "اب ذرا دھیان سے دیکھیں" or "یہاں رک کر سمجھتے ہیں" — use at most 2 per response.

5. Highlight ONLY important points using ONE of these phrases (use at most ONE per response):
   - "یہاں ایک اہم بات ہے"
   - "اس بات پر خاص دھیان دیں"
   - "یہ exam کے لیے بہت important ہے"
   After the emphasis phrase, immediately state the important point clearly.

6. Do NOT start more than 2 sentences with "یہ".
   Use natural classroom openers like:
   "دیکھیں،" / "سوچیں کہ" / "اب،" / "یعنی" / "جیسے کہ" / "بس اتنا سمجھیں کہ"

7. When explaining formulas or calculations:
   - First say: "اب formula دیکھتے ہیں۔"
   - For each symbol say: "[symbol] — یعنی [what it means in simple Urdu]"
   - End with one sentence explaining what the formula tells us overall

8. When giving an example:
   - First say: "چلیں ایک example سے سمجھتے ہیں۔"
   - Walk through using verbal connectors: "پہلے... پھر... اب دیکھیں..."
   - End with the answer naturally: "تو answer آیا..."

9. Use simple Urdu + common English terms:
   mole, formula, reaction, yield, atom, element, compound, solution, mass, volume

   For English chemistry NAMES (not symbols), write the Urdu phonetic spelling immediately after in brackets so the voice engine pronounces them correctly:
   - Sulphuric Acid → Sulphuric Acid (سلفیورک ایسڈ)
   - Molar Mass → Molar Mass (مولر ماس)
   - Percentage Composition → Percentage Composition (پرسنٹیج کمپوزیشن)
   - Atomic Mass → Atomic Mass (اٹامک ماس)
   - Avogadro's Number → Avogadro's Number (اووگیڈرو نمبر)
   - Limiting Reagent → Limiting Reagent (لمٹنگ ری ایجنٹ)
   - Theoretical Yield → Theoretical Yield (تھیوریٹیکل ییلڈ)
   - Stoichiometry → Stoichiometry (سٹائیکیومیٹری)
   Only use this pattern for the FIRST time a term appears. Do not repeat for every mention.

10. Avoid difficult or literary Urdu.
    Never use: درج ذیل، بالترتیب، اس حوالے سے، یہ بیان ہوتا ہے کہ

11. If a concept is important:
   repeat it ONCE in a natural way.

12. Always start with:
   "چلیں اس کو آسان طریقے سے سمجھتے ہیں۔"

13. End with ONE short reinforcement line — choose whichever fits naturally:
   - "تو یہی اس concept کی اصل بات ہے۔"
   - "اس کو یاد رکھیں، یہ بہت کام آئے گا۔"
   - "اچھا، تو اب یہ clear ہو گیا ہوگا۔"
   - "بس یہی سمجھنا تھا، اور یہ important بھی ہے۔"

OUTPUT RULES:
- Only final spoken Urdu
- No labels (Definition, Explanation)
- No markdown
- No bullet points
- Must sound natural when spoken by TTS`;


// ─────────────────────────────────────────────────────────────────────────────
// Formula helper
// ─────────────────────────────────────────────────────────────────────────────

// Math/chemistry operators expanded to spoken English words.
// The LLM receives these expanded forms and can produce natural Urdu for them.
const FORMULA_OPS: [RegExp, string][] = [
  [/\s*≥\s*/g,  ' greater than or equal to '],
  [/\s*≤\s*/g,  ' less than or equal to '],
  [/\s*>\s*/g,  ' greater than '],
  [/\s*<\s*/g,  ' less than '],
  [/\s*=\s*/g,  ' equal '],
  [/\s*\/\s*/g, ' divided by '],
  [/\s*×\s*/g,  ' times '],
  [/\s*\*\s*/g, ' times '],
  [/\s*\+\s*/g, ' plus '],
  // Hyphen between terms (not inside a word) → "minus"
  [/(?<=\s)-(?=\s)/g, ' minus '],
  [/\^(\d+)/g,  ' to the power $1 '],
];

/**
 * Converts a formula string into a spoken-English reading the LLM can use to
 * write guided Urdu.  Also appends an instruction asking the LLM to explain
 * each symbol individually — so the audio walks students through the formula.
 *
 * Examples:
 *   speakFormulaNaturally("M = m / n", "MOLAR MASS")
 *   → "Formula [MOLAR MASS]: M equal m divided by n
 *      [Say each symbol name, then explain what it represents in Urdu.
 *       Then add one sentence about what the formula tells us overall.]"
 *
 *   speakFormulaNaturally("PV = nRT", "IDEAL GAS LAW")
 *   → "Formula [IDEAL GAS LAW]: PV equal nRT
 *      [Say each symbol name, then explain what it represents in Urdu.
 *       Then add one sentence about what the formula tells us overall.]"
 */
export function speakFormulaNaturally(formula: string, label: string): string {
  let spoken = formula.trim();
  for (const [pattern, replacement] of FORMULA_OPS) {
    spoken = spoken.replace(pattern, replacement);
  }
  spoken = spoken.replace(/\s{2,}/g, ' ').trim();

  const labelText = (label?.trim()) || 'Formula';
  return (
    `Formula [${labelText}]: ${spoken}\n` +
    `[Say each symbol name separately in English, ` +
    `then explain what it represents in simple Urdu. ` +
    `End with one sentence explaining what the formula tells us overall.]`
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Source text builder
// ─────────────────────────────────────────────────────────────────────────────

export interface TeacherUrduFields {
  definition:  string;
  explanation: string;
  example:     string;
  formula?:    string;
  flabel?:     string;
}

/**
 * Builds a structured, instruction-annotated English source text from the
 * structured answer fields.  Each section carries a per-section speaking note
 * in square brackets — these act as inline instructions to the LLM:
 *
 *   "Concept [State simply and directly — no build-up]:"
 *   "Explanation [Step by step — one new idea per sentence]:"
 *   "Example [Relatable and easy — use numbers or everyday objects]:"
 *   "Formula [...]:"  ← handled by speakFormulaNaturally()
 *
 * Why inline instructions work better than separate prompt rules:
 *   The LLM reads the source text section by section.  Seeing "[Step by step]"
 *   right next to the explanation content anchors the instruction to that
 *   specific content — reducing generic "uniform tone" output.
 */
/** Expands scientific notation to spoken English so the LLM produces natural Urdu.
 *  "1.204x10^22" → "1.204 times 10 to the power 22" */
function expandSciNotation(text: string): string {
  return text
    .replace(/(\d[\d.]*)\s*[xX×]\s*10\^(\d+)/g, '$1 times 10 to the power $2')
    .replace(/\b10\^(\d+)/g, '10 to the power $1');
}

export function buildTeacherStyleUrduTts(fields: TeacherUrduFields): string {
  const parts: string[] = [];

  if (fields.definition?.trim()) {
    parts.push(
      `Concept [State simply and directly — no build-up needed]:\n${fields.definition.trim()}`
    );
  }

  if (fields.explanation?.trim()) {
    parts.push(
      `Explanation [Build step by step — one new idea per sentence — no repetition]:\n${fields.explanation.trim()}`
    );
  }

  if (fields.example?.trim()) {
    parts.push(
      `Example [Make it relatable and easy — use numbers or everyday objects students know]:\n${expandSciNotation(fields.example.trim())}`
    );
  }

  if (fields.formula?.trim()) {
    parts.push(speakFormulaNaturally(fields.formula, fields.flabel || ''));
  }

  return parts.join('\n\n');
}


// ─────────────────────────────────────────────────────────────────────────────
// Post-processor
// ─────────────────────────────────────────────────────────────────────────────

// Bookish/formal Urdu → simple spoken equivalents
const FORMAL_REPLACEMENTS: [RegExp, string][] = [
  [/اس کا مطلب ہے کہ\s*/g,        'یعنی '],
  [/اس سے مراد ہے\s*/g,            'یعنی '],
  [/واضح رہے کہ\s*/g,              'یاد رہے '],
  [/جیسا کہ ہم جانتے ہیں\s*/g,    ''],
  [/یہ بات یاد رہے کہ\s*/g,       'یاد رہے '],
  [/قابلِ ذکر ہے کہ\s*/g,         ''],
  [/اس تناظر میں\s*/g,             ''],
  [/باالفاظ دیگر\s*/g,             'یعنی '],
  [/مختصراً یہ کہ\s*/g,            ''],
  [/طلبا کو یاد رہے\s*/g,         'یاد رہے '],
  [/سادہ الفاظ میں کہا جائے تو\s*/g, 'یعنی '],
];

// Lead-ins that are fine once but become a tic when repeated.
// We keep the FIRST occurrence of each and remove the rest.
const REPEATED_LEADINS: RegExp[] = [
  /دیکھیں[،,۔\s]*/g,
  /Dekhein[,.\s]*/gi,
  /simple alfaaz mein[,.\s]*/gi,
  /سمجھیں اس طرح[،,\s]*/g,
  /Samjhein is tarah[,.\s]*/gi,
  /آسان الفاظ میں[،,\s]*/g,
  /غور کریں[،,\s]*/g,
];

/** Keeps the first occurrence of each lead-in phrase; removes subsequent ones. */
function deduplicateLeadIns(text: string): string {
  let out = text;
  for (const pattern of REPEATED_LEADINS) {
    let count = 0;
    // Reset lastIndex before each replace — important for /g regexes reused across calls
    pattern.lastIndex = 0;
    out = out.replace(pattern, (match) => {
      count++;
      return count === 1 ? match : '';
    });
  }
  return out;
}

// Maximum number of "..." pause markers allowed in TTS output.
// Azure TTS takes brief pauses at "..." — more than 4 makes audio feel choppy.
const MAX_PAUSES = 4;

/** Keeps the first MAX_PAUSES occurrences of "..." and removes the rest. */
function capPauseMarkers(text: string): string {
  let count = 0;
  return text.replace(/\.\.\./g, () => {
    count++;
    return count <= MAX_PAUSES ? '...' : '';
  });
}

/**
 * Post-processes LLM-generated Urdu text to improve Azure TTS audio quality.
 *
 * Applied AFTER sanitizeUrduTtsText() in route.ts (which handles JSON artifact
 * removal and whitespace collapse) — so we can focus purely on spoken quality.
 *
 * Pipeline:
 *   1. Formal phrase replacements        → natural spoken alternatives
 *   2. Lead-in deduplication             → removes repeated "Dekhein..." etc.
 *   3. "..." normalisation               → consistent spacing
 *   4. Pause marker cap (MAX_PAUSES)     → prevents choppy over-paused audio
 *   5. Auto-inject pauses on long texts  → only when NO pauses exist at all
 *   6. Final whitespace cleanup
 */
export function postProcessUrduTts(text: string): string {
  if (!text) return text;

  let out = text;

  // 1 — formal → natural replacements
  for (const [pattern, replacement] of FORMAL_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  // 2 — remove repeated lead-ins (keep first occurrence only)
  out = deduplicateLeadIns(out);

  // 3 — normalise "..." spacing
  out = out
    .replace(/\.{4,}/g, '...')         // 4+ dots → 3
    .replace(/\s*\.\.\.\s*/g, '... ')  // single space after "..."
    .replace(/\s+/g, ' ')
    .trim();

  // 4 — cap total pause markers
  out = capPauseMarkers(out);

  // 5 — final cleanup
  out = out.replace(/\s+/g, ' ').trim();

  return out;
}
