import { NextRequest, NextResponse } from 'next/server';
import { inferBoardRef } from './boardRefs';

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
};

const FALLBACK_ANSWER: ChatAnswer = {
  text: 'I could not reach the AI provider, so here is a local chemistry-style answer template.',
  points: [
    'Start with a one-line definition.',
    'List only exam-relevant key points or rules.',
    'Add one example from the chapter.',
    'Include a formula or trend if relevant.',
  ],
  formula: 'Answer = Definition + Key points + Example',
  flabel: 'FALLBACK TEMPLATE',
  dur: 24,
  tip: '<strong>Exam tip:</strong> Use exact scientific terms and one example for better marks.',
};

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);
const MAX_MESSAGE_CHARS = Number(process.env.CHAT_MAX_MESSAGE_CHARS || 400);
const MAX_TTS_CHARS = Number(process.env.TTS_MAX_TEXT_CHARS || 1200);
const MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 280);
const RATE_LIMIT_WINDOW_MS = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.CHAT_RATE_LIMIT_MAX_REQUESTS || 12);
const CACHE_TTL_MS = Number(process.env.CHAT_CACHE_TTL_MS || 10 * 60_000);

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const answerCache = new Map<string, { answer: ChatAnswer; expiresAt: number }>();
const ttsAudioCache = new Map<string, { audio: ArrayBuffer; expiresAt: number }>();

function getClientKey(request: NextRequest) {
  const xff = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = xff?.split(',')[0]?.trim() || realIp || 'local';
  return ip;
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || now >= current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true as const, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false as const,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }
  current.count += 1;
  return { allowed: true as const, remaining: RATE_LIMIT_MAX_REQUESTS - current.count };
}

function makeCacheKey(message: string, chapter: string) {
  return `${chapter.toLowerCase()}::${message.toLowerCase()}`;
}

function getCachedAnswer(key: string) {
  const hit = answerCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    answerCache.delete(key);
    return null;
  }
  return hit.answer;
}

function setCachedAnswer(key: string, answer: ChatAnswer) {
  answerCache.set(key, { answer, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCachedTtsAudio(key: string) {
  const hit = ttsAudioCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    ttsAudioCache.delete(key);
    return null;
  }
  return hit.audio.slice(0);
}

function setCachedTtsAudio(key: string, audio: ArrayBuffer) {
  ttsAudioCache.set(key, {
    audio: audio.slice(0),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

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
  };
}

async function callOpenAI(message: string, chapter: string): Promise<ChatAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = [
    'You are a chemistry tutor for FSc students.',
    'Return ONLY valid JSON with keys: text, points, formula, flabel, dur, tip.',
    'Rules:',
    '- Focus on exam-relevant content only',
    '- Avoid long theoretical paragraphs',
    '- text: 1-2 short sentences only',
    '- points: array of 3-5 short bullet-style strings (exam points/rules/definitions)',
    '- formula/flabel can be empty strings if not applicable',
    '- dur: integer seconds between 20 and 60',
    '- tip: short HTML string for important exam statement, e.g. <strong>Important:</strong> ...',
    `Chapter: ${chapter || 'General Chemistry'}`,
    `Question: ${message}`,
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
        temperature: 0.4,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are VoiceUstad chemistry tutor. Respond as strict JSON only. No markdown.',
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
  const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
  return normalizeAnswer(parsed);
}

async function callOpenAIUrduText(inputText: string): Promise<string> {
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
        temperature: 0.2,
        max_completion_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'Convert the user text into clear, natural Pakistani Urdu for spoken audio in a male teacher classroom style. Use native Urdu with common English words like concept, formula, example, point, exam, important. Keep it explanatory, student-friendly, and to the point. Return plain Urdu text only. No markdown, no labels.',
          },
          { role: 'user', content: inputText },
        ],
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`OpenAI translation timed out after ${OPENAI_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI translation error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content = String(json?.choices?.[0]?.message?.content ?? '').trim();
  if (!content) throw new Error('Empty Urdu translation');
  return content;
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

async function callOpenAIWithContext(message: string, chapter: string, recentContext: string): Promise<ChatAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = [
    'You are a chemistry tutor for FSc students.',
    'Return ONLY valid JSON with keys: text, points, formula, flabel, dur, tip.',
    'Rules:',
    '- Focus on exam-relevant content only',
    '- Stay strictly on the user’s asked topic/question',
    '- If the user asks a follow-up (e.g. "more", "explain", "difference", "formula"), continue the SAME topic using recent context',
    '- Do not switch to another chapter/topic unless the user explicitly asks',
    '- If the question is ambiguous, infer from recent context first, then chapter',
    '- Avoid long theoretical paragraphs',
    '- text: 1-2 short sentences only',
    '- points: array of 3-5 short bullet-style strings (exam points/rules/definitions)',
    '- formula/flabel can be empty strings if not applicable',
    '- dur: integer seconds between 20 and 60',
    '- tip: short HTML string for important exam statement, e.g. <strong>Important:</strong> ...',
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
              'You are VoiceUstad chemistry tutor. Stay on-topic using recent context for follow-ups. Respond as strict JSON only. No markdown.',
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
  const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
  return normalizeAnswer(parsed);
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

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/chat2',
    usesOpenAI: Boolean(process.env.OPENAI_API_KEY),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = String(body?.mode ?? 'chat').trim().toLowerCase();

    if (mode === 'tts') {
      const text = String(body?.text ?? '').trim();
      const urduTextInput = String(body?.urduText ?? '').trim();
      if (!text && !urduTextInput) {
        return NextResponse.json(
          { ok: false, error: 'Text or urduText is required for TTS.' },
          { status: 400 },
        );
      }
      if (text.length > MAX_TTS_CHARS || urduTextInput.length > MAX_TTS_CHARS) {
        return NextResponse.json(
          { ok: false, error: `TTS text too long. Max ${MAX_TTS_CHARS} characters.` },
          { status: 400 },
        );
      }

      try {
        const urduText = urduTextInput || (await callOpenAIUrduText(text));
        const ttsKey = `ur::${urduText}`;
        const cachedAudio = getCachedTtsAudio(ttsKey);
        if (cachedAudio) {
          return new Response(cachedAudio, {
            status: 200,
            headers: {
              'Content-Type': 'audio/mpeg',
              'Cache-Control': 'no-store',
              'X-TTS-Language': 'ur-PK',
              'X-TTS-Cache': 'hit',
            },
          });
        }

        const audio = await callOpenAIUrduSpeech(urduText);
        setCachedTtsAudio(ttsKey, audio);
        return new Response(audio, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-store',
            'X-TTS-Language': 'ur-PK',
            'X-TTS-Cache': 'miss',
          },
        });
      } catch (err) {
        return NextResponse.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'TTS generation failed',
          },
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
        {
          ok: false,
          error: `Message too long. Max ${MAX_MESSAGE_CHARS} characters.`,
        },
        { status: 400 },
      );
    }

    const clientKey = getClientKey(request);
    const rl = checkRateLimit(clientKey);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Rate limit exceeded. Please wait and try again.',
          retryAfterMs: rl.retryAfterMs,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 0) / 1000)),
          },
        },
      );
    }

    const cacheKey = makeCacheKey(message, chapter);
    const cached = getCachedAnswer(cacheKey);
    if (cached) {
      return NextResponse.json({
        ok: true,
        answer: cached,
        meta: { source: 'cache', chapter: chapter || null, ttlMs: CACHE_TTL_MS },
      });
    }

    try {
      const answer = { ...(await callOpenAIWithContext(message, chapter, recentContext)) };
      Object.assign(answer, inferBoardRef(message, chapter));
      try {
        const ttsSourceText = [answer.text, ...(answer.points || [])]
          .map((v) => String(v || '').trim())
          .filter(Boolean)
          .join('. ');
        if (ttsSourceText) {
          answer.urduTtsText = await callOpenAIUrduText(ttsSourceText);
        }
      } catch {
        // Best-effort optimization for playback; chat answer should still return.
      }
      setCachedAnswer(cacheKey, answer);
      return NextResponse.json({
        ok: true,
        answer,
        meta: {
          source: 'openai',
          chapter: chapter || null,
          maxCompletionTokens: MAX_COMPLETION_TOKENS,
          cacheTtlMs: CACHE_TTL_MS,
        },
      });
    } catch (err) {
      return NextResponse.json({
        ok: true,
        answer: { ...FALLBACK_ANSWER, ...inferBoardRef(message, chapter) },
        meta: {
          source: 'fallback',
          chapter: chapter || null,
          timeoutMs: OPENAI_TIMEOUT_MS,
          error: err instanceof Error ? err.message : 'Unknown provider error',
        },
      });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }
}
