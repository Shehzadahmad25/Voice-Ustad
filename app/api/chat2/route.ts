import { NextRequest, NextResponse } from 'next/server';
import { inferBoardRef } from './boardRefs';

export const runtime = 'nodejs';

type ChatAnswer = {
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

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 25000);
const MAX_MESSAGE_CHARS = Number(process.env.CHAT_MAX_MESSAGE_CHARS || 400);
const MAX_TTS_CHARS = Number(process.env.TTS_MAX_TEXT_CHARS || 1200);
const MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 280);

function normalizeAnswer(data: any): ChatAnswer {
  const text = typeof data?.text === 'string' && data.text.trim()
    ? data.text.trim()
    : 'Here is your chemistry answer.';

  const points = Array.isArray(data?.points)
    ? data.points.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, 6)
    : [];

  return {
    text,
    points: points.length ? points : ['Definition', 'Key point', 'Example'],
    formula: typeof data?.formula === 'string' ? data.formula : '',
    flabel: typeof data?.flabel === 'string' ? data.flabel : 'KEY IDEA',
    dur: Number.isFinite(Number(data?.dur)) ? Number(data.dur) : 30,
    tip: typeof data?.tip === 'string' ? data.tip : '',
    refChapterNo: typeof data?.refChapterNo === 'string' ? data.refChapterNo : '',
    refPageNo: typeof data?.refPageNo === 'string' ? data.refPageNo : '',
    refLabel: typeof data?.refLabel === 'string' ? data.refLabel : 'Board Reference',
    urduTtsText: typeof data?.urduTtsText === 'string' ? data.urduTtsText : '',
    mcq: data?.mcq && typeof data.mcq === 'object'
      ? {
          question: String(data.mcq.question || '').trim(),
          options: Array.isArray(data.mcq.options)
            ? data.mcq.options.map((o: any) => String(o || '').trim()).filter(Boolean).slice(0, 4)
            : [],
          correct: String(data.mcq.correct || '').trim(),
        }
      : undefined,
  };
}

function buildRecentContext(history: any): string {
  if (!Array.isArray(history)) return '';
  const recent = history
    .filter((m) => m && (m.type === 'user' || m.type === 'ai'))
    .slice(-6)
    .map((m) => {
      if (m.type === 'user') return `User: ${String(m.text || '').trim()}`;
      const aiText = m.response?.text ? String(m.response.text).trim() : '';
      const aiPoints = Array.isArray(m.response?.points) ? m.response.points.slice(0, 2).join(' | ') : '';
      const combined = [aiText, aiPoints].filter(Boolean).join(' | ');
      return combined ? `Assistant: ${combined}` : '';
    })
    .filter(Boolean);
  return recent.join('\n');
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

async function callOpenAIChat(message: string, chapter: string, recentContext: string): Promise<ChatAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = [
    'You are VoiceUstad, an expert FSc Chemistry tutor.',
    'You ONLY teach Chapter: Atomic Structure (FSc KPK Board).',
    'If a question is outside Atomic Structure, respond with:',
    '"This topic is not included in the current lesson."',
    '',
    'Return ONLY valid JSON with keys: text, points, formula, flabel, dur, tip, urduTtsText, mcq.',
    'Rules:',
    '- Stay strictly on the user’s asked topic/question within Atomic Structure',
    '- Use recent context ONLY if the current question is an explicit follow-up (e.g. "explain again", "more", "difference", "continue").',
    '- Otherwise, answer the current question directly.',
    '- If the question is ambiguous, infer from recent context first, then chapter',
    '- No long paragraphs; keep sentences short',
    '- No repetition; avoid unnecessary words',
    '- No advanced university-level detail',
    '',
    'MODE DETECTION:',
    '1) New concept -> FULL TEACHING MODE',
    '2) Confusion / why / explain again -> FOLLOW-UP MODE',
    '3) MCQ / short question / difference / marks-based -> EXAM MODE',
    '',
    'FULL TEACHING MODE OUTPUT:',
    '- text: 1-2 sentence definition',
    '- points: 3-5 short exam-relevant bullets (concept explanation + key points)',
    '- formula/flabel: only if needed (otherwise empty)',
    '- tip: one short HTML exam tip (e.g. <strong>Exam Tip:</strong> ...)',
    '- urduTtsText: 6-8 short spoken Urdu sentences in a natural Pakistani teacher tone.',
    '- urduTtsText MUST naturally include at least 3 common English science terms exactly in English script (for example: atom, proton, electron, nucleus, energy level, shell, orbit).',
    '- Keep Urdu dominant, but do not translate those science terms into Urdu script.',
    '- End with a clear Urdu explanation of the MCQ answer.',
    '- mcq: include ONE related MCQ with {question, options: [A,B,C,D], correct}',
    '',
    'FOLLOW-UP MODE OUTPUT:',
    '- text: 1 short clarification sentence',
    '- points: 2-3 short bullets',
    '- tip: optional short HTML line or empty',
    '- urduTtsText: 3-5 short simple Urdu sentences with at least 2 English science terms in English script',
    '',
    'EXAM MODE OUTPUT:',
    '- For MCQ: text should include "Correct Option: __. Reason: __" (1-2 lines)',
    '- For short question: text should be concise board-style',
    '- For difference: points should be a compact list of contrasts',
    '- urduTtsText: 3-5 short Urdu summary sentences with at least 2 English science terms in English script',
    '',
    '- dur: integer seconds between 20 and 60',
    `Chapter: ${chapter || 'General Chemistry'}`,
    recentContext ? `Recent conversation context:\n${recentContext}` : 'Recent conversation context: none',
    `Current Question: ${message}`,
  ].join('\n');

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
              'You are VoiceUstad chemistry tutor focused only on Atomic Structure. Respond as strict JSON only. No markdown.',
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

export async function POST(request: NextRequest) {
  try {
    console.log('Has key?', Boolean(process.env.OPENAI_API_KEY));
    const body = await request.json();
    const mode = String(body?.mode ?? 'chat').trim().toLowerCase();

    if (mode === 'audio') {
      const urduSummary = String(body?.urduSummary ?? '').trim();
      if (!urduSummary) {
        return NextResponse.json({ ok: false, error: 'urduSummary is required.' }, { status: 400 });
      }
      if (urduSummary.length > MAX_TTS_CHARS) {
        return NextResponse.json(
          { ok: false, error: `TTS text too long. Max ${MAX_TTS_CHARS} characters.` },
          { status: 400 },
        );
      }
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
    const recentContext = buildRecentContext(body?.history);

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message is required.' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Message too long. Max ${MAX_MESSAGE_CHARS} characters.` },
        { status: 400 },
      );
    }

    const answer = { ...(await callOpenAIChat(message, chapter, recentContext)) };
    Object.assign(answer, inferBoardRef(message, chapter));

    let urduSummary: string | null = null;
    let audioBase64: string | null = null;
    let audioError: string | null = null;

    urduSummary = String(answer.urduTtsText || '').trim() || null;

    if (!urduSummary) {
      try {
        const summarySource = [
          answer.text,
          ...(answer.points || []),
          answer.formula ? `Formula: ${answer.formula}` : '',
        ]
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .join('. ');

        urduSummary = await Promise.race([
          callOpenAIUrduSummary(summarySource),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 1200)),
        ]);
        urduSummary = String(urduSummary || '').trim() || null;
        console.log('Urdu summary length:', urduSummary?.length || 0);
      } catch (err) {
        urduSummary = null;
        audioBase64 = null;
        audioError = err instanceof Error ? err.message : 'Urdu summary generation failed';
      }
    }

    return NextResponse.json(
      {
        ok: true,
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

