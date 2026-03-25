import { NextRequest, NextResponse } from 'next/server';
import { inferBoardRef } from './boardRefs';
import { classifyQuestionType } from '@/lib/classifyQuestionType';
import { retrieveBookContent }  from '@/lib/retrieveBookContent';
import { formatWithLLM }        from '@/lib/formatWithLLM';
import { validateAnswer, buildFallback } from '@/lib/validateAnswer';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

function checkDemoKey(request: NextRequest): boolean {
  const key = process.env.DEMO_ACCESS_KEY;
  if (!key) return true; // No key configured = open mode
  return request.nextUrl.searchParams.get('demo') === key
      || request.headers.get('x-demo-key') === key;
}

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
}

type ChatAnswer = {
  // New strict format fields
  definition: string;
  explanation: string;
  example: string;
  // Legacy fields kept for backward-compat with stored history
  text: string;
  points: string[];
  formula?: string;
  flabel?: string;
  dur?: number;
  tip?: string;
  refChapterNo?: string;
  refPageNo?: string;
  refLabel?: string;
  urduTtsText?: string;
  mcq?: {
    question: string;
    options: string[];
    correct: string;
  };
};

type ChatAnswerInput = Partial<ChatAnswer> & {
  definition?: unknown;
  explanation?: unknown;
  example?: unknown;
  mcq?: {
    question?: unknown;
    options?: unknown;
    correct?: unknown;
  };
};

type ChatHistoryEntry = {
  type?: 'user' | 'ai' | string;
  text?: unknown;
  response?: {
    definition?: unknown;
    explanation?: unknown;
    example?: unknown;
    text?: unknown;
    points?: unknown;
  };
};

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 25000);
const MAX_MESSAGE_CHARS = Number(process.env.CHAT_MAX_MESSAGE_CHARS || 400);
const MAX_TTS_CHARS = Number(process.env.TTS_MAX_TEXT_CHARS || 1200);
const MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 480);

function normalizeAnswer(data: ChatAnswerInput | null | undefined): ChatAnswer {
  const clean = (v: unknown) => typeof v === 'string' ? v.trim() : '';

  const definition = clean(data?.definition);
  const explanation = clean(data?.explanation);
  const example = clean(data?.example);

  // Legacy text/points kept for backward-compat with stored chat history
  const text = clean(data?.text) || definition || 'Here is your chemistry answer.';
  const points = Array.isArray(data?.points)
    ? data.points.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, 6)
    : [];

  const refPageNo = (() => {
    const p = clean(data?.refPageNo);
    if (!p || /^(tbd|n\/a|na|0|-|none|unknown)$/i.test(p) || p.includes('-')) return '';
    return p;
  })();

  return {
    definition,
    explanation,
    example,
    text,
    points,
    formula: clean(data?.formula),
    flabel: clean(data?.flabel) || 'FORMULA',
    dur: Number.isFinite(Number(data?.dur)) ? Number(data?.dur) : 30,
    tip: '',
    refChapterNo: clean(data?.refChapterNo),
    refPageNo,
    refLabel: clean(data?.refLabel) || 'Book Reference',
    urduTtsText: clean(data?.urduTtsText),
    mcq: data?.mcq && typeof data.mcq === 'object'
      ? {
          question: String(data.mcq?.question || '').trim(),
          options: Array.isArray(data.mcq?.options)
            ? data.mcq.options.map((o: unknown) => String(o || '').trim()).filter(Boolean).slice(0, 4)
            : [],
          correct: String(data.mcq?.correct || '').trim(),
        }
      : undefined,
  };
}


function sanitizeModelJsonCandidate(input: string): string {
  let candidate = input.trim();

  if (candidate.startsWith('```')) {
    candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  let out = '';
  let inString = false;
  let escaped = false;
  let objectDepth = 0;

  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }

      // Raw newlines inside JSON strings break parsing; escape them.
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }

      if (ch === '"') {
        inString = false;
      }
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '{') objectDepth += 1;
    if (ch === '}') objectDepth = Math.max(0, objectDepth - 1);
    out += ch;
  }

  if (inString) out += '"';
  if (objectDepth > 0) out += '}'.repeat(objectDepth);

  out = out.replace(/,\s*([}\]])/g, '$1');

  return out;
}

function cleanFieldValue(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^[,\s]+/, '')
    .replace(/[,\s]+$/, '')
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();
}

function parseLoosePoints(value: string): string[] {
  const v = cleanFieldValue(value);
  if (!v) return [];

  const bracketMatch = v.match(/^\[([\s\S]*)\]$/);
  const content = bracketMatch ? bracketMatch[1] : v;
  return content
    .split(/\s*,\s*/)
    .map((p) => cleanFieldValue(p))
    .filter(Boolean)
    .slice(0, 6);
}

function parseLabelledAnswer(raw: string): Partial<ChatAnswer> | null {
  const input = raw.trim();
  const keyRe = /\b(definition|explanation|example|text|points|formula|flabel|dur|tip|urduTtsText|refPageNo|refChapterNo|mcq)\s*:/gi;
  const hits: Array<{ key: string; index: number; valueStart: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(input)) !== null) {
    hits.push({ key: m[1], index: m.index, valueStart: keyRe.lastIndex });
  }

  const hasNewFormat = hits.some((h) => ['definition','explanation','example'].includes(h.key.toLowerCase()));
  const hasLegacyFormat = hits.some((h) => h.key.toLowerCase() === 'text');
  if (!hits.length || (!hasNewFormat && !hasLegacyFormat)) return null;

  const out: Partial<ChatAnswer> = {};
  for (let i = 0; i < hits.length; i += 1) {
    const cur = hits[i];
    const next = hits[i + 1];
    const rawValue = input.slice(cur.valueStart, next ? next.index : input.length);
    const value = cleanFieldValue(rawValue);
    const key = cur.key.toLowerCase();

    if (key === 'definition') out.definition = value;
    else if (key === 'explanation') out.explanation = value;
    else if (key === 'example') out.example = value;
    else if (key === 'text') out.text = value;
    else if (key === 'points') out.points = parseLoosePoints(value);
    else if (key === 'formula') out.formula = value;
    else if (key === 'flabel') out.flabel = value;
    else if (key === 'refpageno') out.refPageNo = value;
    else if (key === 'refchapterno') out.refChapterNo = value;
    else if (key === 'urduttstext') out.urduTtsText = value;
    else if (key === 'dur') {
      const n = Number(String(value).match(/\d+/)?.[0] || '');
      if (Number.isFinite(n)) out.dur = n;
    } else if (key === 'mcq') {
      const qMatch = value.match(/question\s*:\s*([\s\S]*?)(?=,\s*options\s*:|,\s*correct\s*:|$)/i);
      const oMatch = value.match(/options\s*:\s*([\s\S]*?)(?=,\s*correct\s*:|$)/i);
      const cMatch = value.match(/correct\s*:\s*([\s\S]*)$/i);
      const optionsRaw = cleanFieldValue(oMatch?.[1] || '');
      const options = optionsRaw
        ? optionsRaw
            .split(/\s*(?:,\s*|\n)\s*/)
            .map((o) => cleanFieldValue(o.replace(/^[A-D][\.\):]\s*/i, '')))
            .filter(Boolean)
            .slice(0, 4)
        : [];
      out.mcq = {
        question: cleanFieldValue(qMatch?.[1] || ''),
        options,
        correct: cleanFieldValue(cMatch?.[1] || ''),
      };
    }
  }

  return out;
}

function parseModelJson(rawContent: string): ChatAnswer {
  const candidates: string[] = [];
  const trimmed = rawContent.trim();
  candidates.push(trimmed);

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  } else if (first !== -1) {
    candidates.push(trimmed.slice(first));
  }

  for (const candidate of candidates) {
    try {
      return normalizeAnswer(JSON.parse(candidate));
    } catch {}
  }

  for (const candidate of candidates) {
    const repaired = sanitizeModelJsonCandidate(candidate);
    try {
      return normalizeAnswer(JSON.parse(repaired));
    } catch {}
  }

  for (const candidate of candidates) {
    const labelled = parseLabelledAnswer(candidate);
    if (labelled) {
      return normalizeAnswer(labelled);
    }
  }

  const plainText = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .replace(/[{}[\]"]/g, '')
    .trim();

  return normalizeAnswer({
    text: plainText || 'I could not fully parse the model response, but here is a concise answer.',
    points: ['Key idea', 'Important detail', 'Example'],
  });
}

// callOpenAIChat removed — replaced by formatWithLLM in lib/formatWithLLM.ts
// All content retrieval is now handled by retrieveBookContent in lib/retrieveBookContent.ts

async function _unused_callOpenAIChat(
  message: string,
  chapter: string,
  recentContext: string,
  textbookContext: string
): Promise<ChatAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = [
    'You are a STRICT formatting engine for VoiceUstad.',
    'You are NOT allowed to think, guess, or add knowledge.',
    'You MUST use ONLY the PROVIDED_BOOK_CONTENT below.',
    '',
    '## RULES (VERY STRICT)',
    '1. Use ONLY PROVIDED_BOOK_CONTENT.',
    '2. Do NOT add any new information.',
    '3. Do NOT create bullet points or numbering inside field values.',
    '4. Output must be clean plain text inside each field (no lists).',
    '5. Definition must be EXACT same wording as provided.',
    '6. Explanation must be based ONLY on provided content — do not invent it.',
    '7. If definition is missing from book content → leave "definition" as "".',
    '8. If formula is missing → leave "formula" as "".',
    '9. If no worked example exists → leave "example" as "".',
    '10. NEVER repeat the same sentence across multiple fields.',
    '',
    '## OUTPUT FORMAT',
    'Return ONLY valid JSON with exactly these keys:',
    '{ "definition": "", "explanation": "", "formula": "", "flabel": "", "example": "", "refPageNo": "", "refChapterNo": "", "dur": 30, "urduTtsText": "", "mcq": null }',
    '',
    '## FIELD RULES',
    '- definition: Copy word-for-word from BOOK DEFINITIONS section. Plain text, no lists.',
    '- explanation: If the book provides elaboration text beyond the definition, include it here in plain text. Otherwise leave "".',
    '- formula: The exact formula from BOOK FORMULAS section if relevant. Leave "" if none.',
    '- flabel: Short uppercase label for the formula (e.g. "MOLE FORMULA"). Leave "" if no formula.',
    '- example: If a BOOK WORKED EXAMPLE matches, write: "Page [X]: [question] → [answer]". Leave "" if none.',
    '- refPageNo: The page number digit(s) from the matched worked example only (e.g. "8"). Leave "" if none.',
    '- refChapterNo: Unit number from the CHAPTER line.',
    '- dur: Estimated Urdu audio duration in seconds (integer, 25–60).',
    '- urduTtsText: 7-9 natural spoken Urdu sentences, teacher tone, based ONLY on provided content.',
    '  Structure: opening → definition in Urdu → what it means → example/formula if present → closing.',
    '  Science terms stay in English script. No bullet points. No invented content.',
    '- mcq: One MCQ object {question, options:[A,B,C,D], correct} from the book content. null if not applicable.',
    '',
    ...(textbookContext.trim()
      ? [
          '## PROVIDED_BOOK_CONTENT',
          textbookContext,
          '## END OF PROVIDED_BOOK_CONTENT',
        ]
      : [
          '## PROVIDED_BOOK_CONTENT',
          'NONE',
          '## END OF PROVIDED_BOOK_CONTENT',
        ]),
    '',
    `Chapter: ${chapter || 'General Chemistry'}`,
    recentContext ? `Recent conversation:\n${recentContext}` : '',
    `Student Question: ${message}`,
  ].filter(Boolean).join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('OpenAI request timeout'), OPENAI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a STRICT formatting engine. You are NOT allowed to think, guess, or add knowledge. Use ONLY the PROVIDED_BOOK_CONTENT given in the user message. Return strict JSON only — no markdown, no text outside the JSON object. Fields: definition, explanation, formula, flabel, example, refPageNo, refChapterNo, dur, urduTtsText, mcq. All field values must be plain text with no bullet points or numbering. Never invent content.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${OPENAI_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const rawContent = json?.choices?.[0]?.message?.content;
  if (rawContent == null) {
    throw new Error('OpenAI returned empty content');
  }
  if (typeof rawContent !== 'string') {
    return normalizeAnswer(rawContent);
  }
  return parseModelJson(rawContent);
}

async function callOpenAIUrduSummary(inputText: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_TTS_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('OpenAI request timeout'), OPENAI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_completion_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'Write a short Urdu summary (30-80 words) in proper Urdu script. Student-friendly and clear. Do not write English paragraphs, but naturally include at least 3 English science terms in English script (atom, proton, electron, nucleus, energy level, shell, orbit, formula, example).',
          },
          { role: 'user', content: inputText },
        ],
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`OpenAI Urdu summary timed out after ${OPENAI_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI Urdu summary error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content = String(json?.choices?.[0]?.message?.content ?? '').trim();
  if (!content) throw new Error('Empty Urdu summary');
  return content;
}

async function callOpenAIUrduSpeech(inputText: string): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = process.env.OPENAI_TTS_VOICE || 'alloy';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('OpenAI request timeout'), OPENAI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        voice,
        response_format: 'mp3',
        input: inputText,
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`OpenAI speech timed out after ${OPENAI_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI speech error ${res.status}: ${errText}`);
  }

  return res.arrayBuffer();
}

function bufferToBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString('base64');
}

function sanitizeUrduTtsText(input: string): string {
  let out = String(input || '')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  out = out
    .replace(/\b(definition|explanation|example|text|points|formula|flabel|dur|tip|refPageNo|refChapterNo|mcq|question|options|correct)\s*:/gi, ' ')
    .replace(/\b[A-D][\.\):]\s*/g, ' ')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (out.length > MAX_TTS_CHARS) out = out.slice(0, MAX_TTS_CHARS);
  return out;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth: block requests when DEMO_ACCESS_KEY is set ─────────────────────
    if (!checkDemoKey(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rate limit: 20 req/min chat, 30 req/min TTS per IP ───────────────────
    const body = await request.json();
    const mode = String(body?.mode ?? 'chat').trim().toLowerCase();
    const ip   = getIp(request);

    const rlKey = mode === 'audio' ? `tts:${ip}` : `chat2:${ip}`;
    const rl = checkRateLimit(rlKey, mode === 'audio' ? 30 : 20);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests', retryAfterMs: rl.retryAfterMs },
        { status: 429 },
      );
    }

    console.log(`[chat2] ip=${ip} mode=${mode}`);
    if (mode === 'audio') {
      const urduSummary = sanitizeUrduTtsText(String(body?.urduSummary ?? '').trim());
      if (!urduSummary) {
        return NextResponse.json({ ok: false, error: 'urduSummary is required.' }, { status: 400 });
      }
      if (urduSummary.length > MAX_TTS_CHARS) {
        return NextResponse.json(
          { ok: false, error: `TTS text too long. Max ${MAX_TTS_CHARS} characters.` },
          { status: 400 },
        );
      }
      console.log(`[chat2/tts] OpenAI TTS call | ip=${ip} | chars=${urduSummary.length}`);
      try {
        const audioBuffer = await callOpenAIUrduSpeech(urduSummary);
        const audioBase64 = bufferToBase64(audioBuffer);
        return NextResponse.json({ ok: true, audioBase64 }, { status: 200 });
      } catch (err) {
        return NextResponse.json(
          { ok: false, error: err instanceof Error ? err.message : 'TTS generation failed' },
          { status: 500 },
        );
      }
    }

    const message = String(body?.message ?? '').trim();
    const chapter = String(body?.chapter ?? '').trim();
    const chapterNumber = Number(body?.chapterNumber ?? 0);

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message is required.' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Message too long. Max ${MAX_MESSAGE_CHARS} characters.` },
        { status: 400 },
      );
    }

    // ── Step 1: Classify question intent ──────────────────────────────────────
    const questionType = classifyQuestionType(message);

    // ── Step 2: Retrieve matching book content from DB ────────────────────────
    const retrieval = chapterNumber > 0
      ? await retrieveBookContent(message, questionType, chapterNumber).catch((e) => {
          console.error('retrieveBookContent error:', e);
          return null;
        })
      : null;

    // ── Step 3: Not found → return immediately, no AI call ────────────────────
    if (chapterNumber > 0 && (!retrieval || !retrieval.found)) {
      const notFound = normalizeAnswer({
        definition: '',
        explanation: '',
        example: '',
        text: 'Not available in book',
        points: [],
        formula: '',
        flabel: '',
        dur: 20,
        refPageNo: '',
        refChapterNo: String(chapterNumber),
        urduTtsText: 'Maafi chahta hoon, yeh topic is chapter ki book mein available nahi hai.',
      });
      return NextResponse.json(
        { ok: true, answer: notFound, questionType, answerEnglish: notFound.text, urduSummary: notFound.urduTtsText, audioBase64: null, audioError: null },
        { status: 200 },
      );
    }

    // ── Step 4: Format retrieved content with LLM (temp=0, JSON only) ─────────
    console.log(`[chat2] OpenAI LLM call | user=${session.user.id} | chapter=${chapterNumber} | q=${message.slice(0, 80)}`);
    let formatted;
    if (retrieval && retrieval.found) {
      try {
        formatted = await formatWithLLM(message, retrieval);
        // Validate and auto-clean; retry once on failure
        let validation = validateAnswer(formatted);
        if (!validation.valid) {
          console.warn('chat2: validation failed, retrying:', validation.errors);
          try {
            formatted = await formatWithLLM(message, retrieval);
            validation = validateAnswer(formatted);
          } catch { /* ignore retry error */ }
          if (!validation.valid) {
            formatted = buildFallback({}, retrieval.blocks, retrieval.page);
          } else {
            formatted = validation.answer;
          }
        } else {
          formatted = validation.answer;
        }
      } catch (e) {
        console.error('chat2: formatWithLLM error:', e);
        formatted = buildFallback({}, retrieval?.blocks, retrieval?.page);
      }
    } else {
      // No chapterNumber provided — use legacy path for general questions
      formatted = { definition: '', explanation: '', example: '', formula: '', flabel: '', urduTtsText: '', refPageNo: '', dur: 30 };
    }

    // ── Step 5: Build final answer shape ──────────────────────────────────────
    const answer = normalizeAnswer({
      definition:  formatted.definition,
      explanation: formatted.explanation,
      example:     formatted.example,
      text:        formatted.definition || formatted.explanation || 'Here is your chemistry answer.',
      points:      [],
      formula:     formatted.formula,
      flabel:      formatted.flabel,
      dur:         formatted.dur,
      refPageNo:   formatted.refPageNo || String(retrieval?.page ?? ''),
      refChapterNo: String(chapterNumber),
      urduTtsText: formatted.urduTtsText,
    });

    Object.assign(answer, inferBoardRef(message, chapter));

    const urduSummary: string | null = sanitizeUrduTtsText(String(answer.urduTtsText || '').trim()) || null;
    const audioBase64: string | null = null;
    const audioError: string | null = null;

    return NextResponse.json(
      {
        ok: true,
        questionType,
        answer,
        answerEnglish: answer.text,
        urduSummary,
        audioBase64,
        audioError,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    );
  }
}

