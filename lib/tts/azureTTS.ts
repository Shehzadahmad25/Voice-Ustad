/**
 * lib/tts/azureTTS.ts
 * -------------------
 * Azure Cognitive Services Speech SDK wrapper for Urdu TTS.
 * Returns audio as ArrayBuffer — same type the existing cache pipeline expects.
 *
 * Required env vars:
 *   AZURE_SPEECH_KEY    — Azure Speech resource subscription key
 *   AZURE_SPEECH_REGION — Azure region slug (e.g. "eastus", "centralindia", "uaenorth")
 *
 * Optional env vars:
 *   AZURE_URDU_VOICE    — Override the default Urdu voice (default: ur-PK-UzmaNeural)
 *   TTS_CHUNK_MAX_LEN   — Max chars per TTS chunk (default 400)
 *
 * SSML prosody rates (per-line):
 *   normal lines    → -15%
 *   important lines → -20%
 *   formula/equation lines → -22%
 *
 * Long-answer handling:
 *   Text is split into sentence-aware chunks (≤400 chars each).
 *   Each chunk is a separate Azure request; one retry is attempted on failure.
 *   All MP3 buffers are concatenated into one final ArrayBuffer.
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

// ── Voice constants & map ─────────────────────────────────────────────────────

export const AZURE_VOICE_NAME = process.env.AZURE_URDU_VOICE || 'ur-PK-AsadNeural';

export const VOICE_MAP: Record<string, string> = {
  asad:    'ur-PK-AsadNeural',
  uzma:    'ur-PK-UzmaNeural',
  english: 'en-US-GuyNeural',
};

const OUTPUT_FORMAT = sdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3;

// Max characters per TTS chunk — stays well inside Azure Neural limits.
const CHUNK_MAX_LEN = Number(process.env.TTS_CHUNK_MAX_LEN ?? 400);

// ── Section label → Urdu spoken intro map ────────────────────────────────────

const SECTION_INTROS: Array<[RegExp, string]> = [
  [/\bDefinition\s*[:۔]?\s*/gi,     'تعریف یہ ہے کہ — '],
  [/\bExplanation\s*[:۔]?\s*/gi,    'وضاحت سنیں — '],
  [/\bExample\s*[:۔]?\s*/gi,        'مثال کے طور پر — '],
  [/\bFormula\s*[:۔]?\s*/gi,        'فارمولا یہ ہے — '],
  [/\bNote\s*[:۔]?\s*/gi,           'یاد رکھیں — '],
  [/\bYaad\s+rakhein\s*[:۔]?\s*/gi, 'یاد رکھیں — '],
];

// ── Chemistry pronunciation table ─────────────────────────────────────────────
//
// Rules:
//  • Listed longest/most-specific FIRST so partial matches don't fire first.
//  • Units (g/mol, mol) at the end — after all formula substitutions.
//  • \bL\b NOT used globally (too aggressive) — only the quantity form "N L".
//  • All substitutions use word-boundaries (\b) to avoid partial replacements.
//
const CHEM_REPLACEMENTS: Array<[RegExp, string]> = [
  // ── Multi-atom units (must come before single-element replacements) ──────
  [/\bkJ\/mol\b/g,    'kilo joule per mole'],
  [/\bg\/mol\b/gi,    'gram per mole'],

  // ── Acids ────────────────────────────────────────────────────────────────
  [/\bH2SO4\b/g,      'H 2 S O 4'],
  [/\bHNO3\b/g,       'H N O 3'],
  [/\bHClO4\b/g,      'H C L O 4'],
  [/\bH3PO4\b/g,      'H 3 P O 4'],
  [/\bHCl\b/g,        'H C L'],
  [/\bH2O\b/g,        'H 2 O'],

  // ── Salts & carbonates ────────────────────────────────────────────────────
  [/\bCaCO3\b/g,      'C a C O 3'],
  [/\bMgSO4\b/g,      'M g S O 4'],
  [/\bCuSO4\b/g,      'C u S O 4'],
  [/\bZnSO4\b/g,      'Z n S O 4'],
  [/\bFeSO4\b/g,      'F e S O 4'],
  [/\bK2SO4\b/g,      'K 2 S O 4'],
  [/\bAgNO3\b/g,      'A g N O 3'],

  // ── Oxides ───────────────────────────────────────────────────────────────
  [/\bFe2O3\b/g,      'F e 2 O 3'],
  [/\bAl2O3\b/g,      'A l 2 O 3'],
  [/\bMgO\b/g,        'M G O'],
  [/\bCaO\b/g,        'C a O'],
  [/\bSO3\b/g,        'S O 3'],
  [/\bSO2\b/g,        'S O 2'],
  [/\bCO2\b/g,        'C O 2'],
  [/\bNO2\b/g,        'N O 2'],
  [/\bN2O\b/g,        'N 2 O'],
  [/\bNO\b/g,         'N O'],
  [/\bCO\b/g,         'C O'],

  // ── Bases ─────────────────────────────────────────────────────────────────
  [/\bNaOH\b/g,       'N a O H'],
  [/\bKOH\b/g,        'K O H'],

  // ── Common compounds ──────────────────────────────────────────────────────
  [/\bNaCl\b/g,       'N A C L'],
  [/\bNH3\b/g,        'N H 3'],
  [/\bCH4\b/g,        'C H 4'],

  // ── Diatomics ─────────────────────────────────────────────────────────────
  [/\bCl2\b/g,        'C L 2'],
  [/\bO2\b/g,         'O 2'],
  [/\bN2\b/g,         'N 2'],
  [/\bH2\b/g,         'H 2'],

  // ── Other symbols ─────────────────────────────────────────────────────────
  [/\bpH\b/g,         'p H'],

  // ── Units (after all formula substitutions) ───────────────────────────────
  [/\bkJ\b/g,         'kilo joule'],
  // "N L" form only — avoids replacing standalone L in other contexts
  [/\b(\d+(?:\.\d+)?)\s*L\b/g, '$1 litre'],
  [/\b(\d+)\s*mol\b/g, '$1 mole'],
  [/\bmol\b/gi,        'mole'],
];

// ── Text preprocessing ────────────────────────────────────────────────────────

/**
 * Cleans and normalises Urdu TTS text before chunking and SSML wrapping.
 * Run ONCE on the full text before splitIntoTtsChunks().
 */
export function preprocessUrduText(text: string): string {
  let out = text;

  // 1. Section labels → Urdu spoken intros
  for (const [pattern, intro] of SECTION_INTROS) {
    out = out.replace(pattern, intro);
  }

  // 2. Strip markdown artifacts
  out = out
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g,   '$1')
    .replace(/`([^`]+)`/g,             '$1')
    .replace(/^#+\s*/gm,               '')
    .replace(/^\s*[-*•]\s*/gm,         '');

  // 3. Normalise repeated punctuation
  out = out
    .replace(/([!؟،,;:]){2,}/g, '$1')
    .replace(/\.{4,}/g,         '...')
    .replace(/۔{2,}/g,          '۔')
    .replace(/\s*—\s*/g,        ' — ');

  // 4a. English chemistry name → Urdu phonetic (for bare English terms in Urdu text)
  //     Only replaces when the term appears WITHOUT a following Urdu bracket already.
  //     This is a safety net for when the LLM didn't add phonetics itself.
  const CHEM_NAME_PHONETICS: Array<[RegExp, string]> = [
    [/\bSulphuric Acid\b(?!\s*[\(\（])/g,          'Sulphuric Acid (سلفیورک ایسڈ)'],
    [/\bMolar Mass\b(?!\s*[\(\（])/g,               'Molar Mass (مولر ماس)'],
    [/\bPercentage Composition\b(?!\s*[\(\（])/g,   'Percentage Composition (پرسنٹیج کمپوزیشن)'],
    [/\bAtomic Mass\b(?!\s*[\(\（])/g,              'Atomic Mass (اٹامک ماس)'],
    [/\bAvogadro'?s? Number\b(?!\s*[\(\（])/g,      "Avogadro's Number (اووگیڈرو نمبر)"],
    [/\bLimiting Reagent\b(?!\s*[\(\（])/g,         'Limiting Reagent (لمٹنگ ری ایجنٹ)'],
    [/\bExcess Reagent\b(?!\s*[\(\（])/g,           'Excess Reagent (ایکسیس ری ایجنٹ)'],
    [/\bTheoretical Yield\b(?!\s*[\(\（])/g,        'Theoretical Yield (تھیوریٹیکل ییلڈ)'],
    [/\bActual Yield\b(?!\s*[\(\（])/g,             'Actual Yield (ایکچوئل ییلڈ)'],
    [/\bPercent Yield\b(?!\s*[\(\（])/g,            'Percent Yield (پرسنٹ ییلڈ)'],
    [/\bStoichiometry\b(?!\s*[\(\（])/g,            'Stoichiometry (سٹائیکیومیٹری)'],
    [/\bMole Calculation\b(?!\s*[\(\（])/g,         'Mole Calculation (مول کیلکولیشن)'],
  ];
  for (const [pattern, replacement] of CHEM_NAME_PHONETICS) {
    out = out.replace(pattern, replacement);
  }

  // 4. Chemistry substitutions (table-driven, longest-match-first order)
  for (const [pattern, replacement] of CHEM_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  // 5. Collapse whitespace
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g,    '\n\n')
    .trim();

  return out;
}

// ── Sentence-aware chunker ────────────────────────────────────────────────────

/**
 * Splits pre-processed Urdu text into TTS-safe chunks.
 *
 * Rules:
 *   - Split at sentence endings: ۔ ? ! ؟ and paragraph breaks
 *   - Accumulate sentences up to maxLen characters
 *   - Never cut mid-sentence; if one sentence > maxLen, split at comma boundaries
 *   - Each chunk is trimmed and non-empty
 */
export function splitIntoTtsChunks(text: string, maxLen = CHUNK_MAX_LEN): string[] {
  const sentences = text
    .split(/(?<=[۔?!؟])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      flush();
      // Split oversized sentence at comma boundaries
      const parts = sentence
        .split(/(?<=[،,])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      let sub = '';
      for (const part of parts) {
        if (sub.length + 1 + part.length > maxLen) {
          if (sub) chunks.push(sub.trim());
          sub = part;
        } else {
          sub = sub ? sub + ' ' + part : part;
        }
      }
      if (sub.trim()) chunks.push(sub.trim());
      continue;
    }

    const joined = current ? current + ' ' + sentence : sentence;
    if (joined.length > maxLen) {
      flush();
      current = sentence;
    } else {
      current = joined;
    }
  }
  flush();

  return chunks;
}

// ── XML helper ────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

// ── Language tag ──────────────────────────────────────────────────────────────

function langFromVoice(voiceName: string): string {
  const m = voiceName.match(/^([a-z]{2}-[A-Z]{2})/);
  return m ? m[1] : 'ur-PK';
}

// ── Per-line classifiers ──────────────────────────────────────────────────────

/**
 * True when the line contains a teaching-emphasis phrase.
 * These get prosody -20% with 250ms/300ms surrounding breaks.
 */
function isImportantLine(line: string): boolean {
  return /اہم بات|خاص دھیان|important|امتحان|یاد رکھیں|اچھی طرح سمجھ|اصل بات|ضروری ہے/i.test(line);
}

/**
 * True when the line contains a chemical equation, operator, or formula keyword.
 * Deliberately NOT triggered by bare numbers — "Step 1" must not slow down to -22%.
 *
 * Triggers on:
 *   - keyword: formula, equation, gram per mole, kilo joule
 *   - reaction operator: -> → =
 *   - chemistry symbol pattern after preprocessing: "H 2 O", "C O 2", "N A C L"
 *   - quantity with a unit: "0.08 mole", "1.92 gram"
 */
function isFormulaLine(line: string): boolean {
  if (/\bformula\b|\bمساوات\b|\bequation\b|\bgram per mole\b|\bkilo joule\b/i.test(line)) return true;
  if (/->|→/.test(line)) return true;
  // Equals sign — but not inside words; guard with surrounding space or start/end
  if (/\s=\s|^=/.test(line)) return true;
  // Chemical symbol followed by space + capital or digit — matches "H 2", "C O", "N A"
  if (/\b[A-Z]{1,2}\s[A-Z0-9]/.test(line)) return true;
  // Number + chemistry unit
  if (/\b\d+(?:\.\d+)?\s+(?:mole|gram per mole|kilo joule|litre)\b/i.test(line)) return true;
  return false;
}

// ── Per-line SSML builder ─────────────────────────────────────────────────────

/**
 * Wraps a single line in SSML prosody and surrounding breaks.
 *
 *   formula/equation  → rate -22%, 350ms before / 400ms after
 *   emphasis phrase   → rate -20%, 250ms before / 300ms after
 *   normal line       → rate -15%, 180ms before
 */
function lineToSsml(line: string): string {
  const safe = escapeXml(line.trim())
    .replace(/\.\.\./g, '<break time="400ms"/>')
    .replace(/ — /g,    ' <break time="500ms"/> ')
    .replace(/،\s*/g,   '، <break time="120ms"/>');

  if (!safe.trim()) return '';

  if (isFormulaLine(line)) {
    return (
      '\n      <break time="350ms"/>' +
      '\n      <prosody rate="-22%">' + safe + '</prosody>' +
      '\n      <break time="400ms"/>'
    );
  }
  if (isImportantLine(line)) {
    return (
      '\n      <break time="250ms"/>' +
      '\n      <prosody rate="-20%">' + safe + '</prosody>' +
      '\n      <break time="300ms"/>'
    );
  }
  return (
    '\n      <break time="180ms"/>' +
    '\n      <prosody rate="-15%">' + safe + '</prosody>'
  );
}

// ── SSML builder (per chunk) ──────────────────────────────────────────────────

/**
 * Builds a per-line adaptive SSML document for one text chunk.
 *
 * A trailing <break time="300ms"/> is appended so that when multiple chunks
 * are concatenated, there is a natural breathing gap at each join boundary.
 */
function buildSsml(chunk: string, voiceName: string): string {
  const lang = langFromVoice(voiceName);

  const lines = chunk
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((line) => line.split(/(?<=[۔!?؟])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);

  const body = lines.map(lineToSsml).join('');

  return (
    `<speak version="1.0" xml:lang="${lang}" ` +
    `xmlns="http://www.w3.org/2001/10/synthesis">` +
    `<voice name="${escapeXml(voiceName)}">` +
    body +
    // Trailing break creates a natural gap at the chunk boundary in the
    // concatenated MP3 — prevents abrupt audio cuts between chunks.
    '\n      <break time="300ms"/>' +
    `\n    </voice>` +
    `</speak>`
  );
}

// ── Buffer concatenation ──────────────────────────────────────────────────────

/**
 * Concatenates multiple MP3 ArrayBuffers into one.
 * Azure Neural TTS produces valid MP3 frame sequences; byte-level concatenation
 * is playable by all HTML5 Audio implementations (players sync to frame headers).
 */
function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total  = buffers.reduce((n, b) => n + b.byteLength, 0);
  const out    = new Uint8Array(total);
  let   offset = 0;
  for (const buf of buffers) {
    out.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return out.buffer;
}

// ── Single-chunk synthesis ────────────────────────────────────────────────────

/**
 * Synthesises one SSML string using the provided synthesizer.
 * The synthesizer instance is reused across chunks — closed by the caller.
 */
function synthesizeChunk(
  synthesizer: sdk.SpeechSynthesizer,
  ssml:        string,
): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          if (!result.audioData || result.audioData.byteLength < 500) {
            reject(new Error(
              `[azureTTS] chunk audio too small: ${result.audioData?.byteLength ?? 0} bytes`,
            ));
            return;
          }
          resolve(result.audioData);
        } else {
          reject(new Error(
            `[azureTTS] chunk synthesis failed (reason=${result.reason}): ` +
            (result.errorDetails ?? 'unknown'),
          ));
        }
      },
      (err) => reject(new Error(`[azureTTS] chunk SDK error: ${String(err)}`)),
    );
  });
}

/** Creates a fresh SpeechSynthesizer — used for first attempt and retry. */
function makeSynthesizer(key: string, region: string, voice: string): sdk.SpeechSynthesizer {
  const cfg = sdk.SpeechConfig.fromSubscription(key, region);
  cfg.speechSynthesisVoiceName    = voice;
  cfg.speechSynthesisOutputFormat = OUTPUT_FORMAT;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new sdk.SpeechSynthesizer(cfg, undefined as any);
}

// ── Main synthesis function ───────────────────────────────────────────────────

/**
 * Synthesizes Urdu text to a complete MP3 ArrayBuffer using Azure Neural TTS.
 *
 * Flow:
 *   1. preprocessUrduText()       — clean + chemistry replacements
 *   2. splitIntoTtsChunks()       — sentence-aware ≤400-char chunks
 *   3. buildSsml(chunk)           — per-line adaptive prosody SSML
 *   4. synthesizeChunk() × N      — one Azure request per chunk (sequential)
 *      └─ 1 automatic retry with a fresh synthesizer on transient failure
 *   5. concatBuffers()            — single complete MP3 returned
 *
 * Throws a descriptive error if NO chunk succeeds.
 * Partial failures are logged but do not stop remaining chunks.
 */
export async function synthesizeUrduSpeech(
  text:       string,
  voiceName?: string,
): Promise<ArrayBuffer> {
  const key    = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key)    throw new Error('[azureTTS] AZURE_SPEECH_KEY is not set');
  if (!region) throw new Error('[azureTTS] AZURE_SPEECH_REGION is not set');

  const voice = voiceName || AZURE_VOICE_NAME;

  // ── Step 1: preprocess ──────────────────────────────────────────────────────
  const cleanText = preprocessUrduText(text);

  // ── Step 2: chunk ───────────────────────────────────────────────────────────
  const chunks = splitIntoTtsChunks(cleanText);

  console.log(`[azureTTS] voice: ${voice} | region: ${region}`);
  console.log(`[azureTTS] chunks: ${chunks.length} | total chars: ${cleanText.length}`);

  // ── Step 3: synthesizer (primary — reused across chunks) ──────────────────
  let synthesizer = makeSynthesizer(key, region, voice);

  // ── Step 4: synthesize each chunk sequentially ──────────────────────────────
  const successBuffers: ArrayBuffer[] = [];
  const failedChunks:   number[]      = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk   = chunks[i];
    const ssml    = buildSsml(chunk, voice);
    const preview = chunk.slice(0, 55).replace(/\n/g, ' ');

    console.log(`[azureTTS] chunk ${i + 1}/${chunks.length} — ${chunk.length} chars | "${preview}…"`);

    let succeeded = false;

    // ── First attempt ──────────────────────────────────────────────────────
    try {
      const buf = await synthesizeChunk(synthesizer, ssml);
      console.log(`[azureTTS] chunk ${i + 1} OK — ${buf.byteLength} bytes`);
      successBuffers.push(buf);
      succeeded = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[azureTTS] chunk ${i + 1} attempt 1 failed: ${msg} — retrying`);
    }

    // ── One retry with a fresh synthesizer (handles transient SDK errors) ──
    if (!succeeded) {
      synthesizer.close();
      synthesizer = makeSynthesizer(key, region, voice);
      await new Promise((r) => setTimeout(r, 700)); // brief back-off

      try {
        const buf = await synthesizeChunk(synthesizer, ssml);
        console.log(`[azureTTS] chunk ${i + 1} retry OK — ${buf.byteLength} bytes`);
        successBuffers.push(buf);
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.error(`[azureTTS] chunk ${i + 1} FAILED after retry: ${msg}`);
        failedChunks.push(i + 1);
      }
    }
  }

  synthesizer.close();

  // ── Step 5: validate ────────────────────────────────────────────────────────
  if (successBuffers.length === 0) {
    throw new Error(
      `[azureTTS] All ${chunks.length} chunk(s) failed. ` +
      `Voice: ${voice} | Region: ${region}. Check credentials and quota.`,
    );
  }

  if (failedChunks.length > 0) {
    console.warn(
      `[azureTTS] ${failedChunks.length}/${chunks.length} chunk(s) failed ` +
      `(indices: ${failedChunks.join(', ')}) — returning partial audio`,
    );
  }

  // ── Step 6: concatenate ─────────────────────────────────────────────────────
  const final = concatBuffers(successBuffers);
  console.log(
    `[azureTTS] complete — ${successBuffers.length}/${chunks.length} chunks` +
    ` | ${final.byteLength} bytes total`,
  );
  return final;
}
