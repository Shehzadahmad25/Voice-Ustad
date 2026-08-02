/**
 * lib/quizValidation.ts
 * ---------------------
 * Grounding + answer-integrity for generated MCQs.
 *
 * Every question the generator produces passes through validateQuestions()
 * before it can reach a student. The guarantees it enforces:
 *
 *   1. The answer the model worked out is VERBATIM one of the four options it
 *      printed. (The reported "correct answer is 9 but no option says 9" bug.)
 *   2. No option references another option by letter — QuizModal reorders A–D
 *      before display, so "Both A and B" is wrong by the time it is read.
 *   3. All four options are present and distinct.
 *   4. The subtopic label is stamped from OUR content_chunks row, never taken
 *      from the model. (The "[Chapter] — General" bug.)
 *
 * Lives in lib/ rather than inside the route so it is directly importable and
 * testable — Next.js route files may only export handlers.
 */

/** One content_chunks row — the only permitted source of fact for generation. */
export interface ContentChunk {
  id: string
  section: string | null
  term: string | null
  topic_slug: string | null
  book_definition: string | null
  guide_explanation: string | null
  formula: string | null
  example_q: string | null
  example_solution: string | null
  example_answer: string | null
}

/** A question as returned by the model, before validation. */
export interface RawQuestion {
  source_id?: string
  working?: string
  answer_text?: string
  question?: string
  options?: Record<string, string>
  correct_answer?: string
  explanation?: string
  topic_name?: string
  topic_section?: string | null
  topic_slug?: string | null
}

export interface ValidationResult {
  kept: RawQuestion[]
  rejected: Record<string, number>
}

/**
 * Options that reference other options instead of stating an answer.
 * Banned outright: QuizModal.shuffleOptions() reorders A–D before display, so
 * "Both A and B" is silently wrong by the time a student reads it.
 */
export const LETTER_REFERENCE =
  /both\s+\(?[a-d]\)?\s*(and|&|,)\s*\(?[a-d]\)?|\ball\s+of\s+(the\s+)?(above|these|them)\b|\bnone\s+of\s+(the\s+)?(above|these|them)\b|\boptions?\s+[a-d]\s+(and|&)\s+[a-d]\b|^\s*\(?[a-d]\)?\s*(and|&)\s*\(?[a-d]\)?\s*$/i

export const normOpt = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]+$/, '').trim()

/**
 * Drops every question that cannot be proven self-consistent against the chunk
 * it claims to come from. Nothing reaches the client without passing this.
 *
 * `chunkIndex` maps the model's echoed source_id back to our content_chunks
 * row, so topic_name/topic_section/topic_slug are stamped from the database
 * rather than trusted from the model.
 */
export function validateQuestions(
  raw: RawQuestion[],
  chunkIndex: Map<string, ContentChunk>,
): ValidationResult {
  const kept: RawQuestion[] = []
  const rejected: Record<string, number> = {}
  const drop = (why: string) => { rejected[why] = (rejected[why] ?? 0) + 1 }

  for (const q of raw) {
    if (!q?.question || !q?.options) { drop('malformed'); continue }

    const opts = ['A', 'B', 'C', 'D'].map(k => q.options![k])
    if (opts.some(o => normOpt(o) === '')) { drop('empty_option'); continue }

    if (new Set(opts.map(normOpt)).size !== 4) { drop('duplicate_option'); continue }

    if (opts.some(o => LETTER_REFERENCE.test(String(o)))) { drop('letter_reference'); continue }

    // The core check: the answer the model worked out must be VERBATIM one of
    // the four options it printed. If the letter disagrees with the text, trust
    // the text and repair the letter; if the text is absent, drop the question.
    const answerText = normOpt(q.answer_text)
    if (!answerText) { drop('no_answer_text'); continue }
    const idx = opts.findIndex(o => normOpt(o) === answerText)
    if (idx < 0) { drop('answer_not_among_options'); continue }
    q.correct_answer = 'ABCD'[idx]

    // Subtopic labels come from our own chunk row, never from the model.
    const chunk = chunkIndex.get(String(q.source_id))
    if (!chunk) { drop('unknown_source_id'); continue }
    q.topic_name = chunk.term ?? undefined
    q.topic_section = chunk.section
    q.topic_slug = chunk.topic_slug

    delete q.answer_text
    delete q.working
    delete q.source_id
    kept.push(q)
  }

  return { kept, rejected }
}

/**
 * Randomises option order and re-points correct_answer at the moved text.
 *
 * Because validateQuestions() derives the letter from `answer_text`, the letter
 * inherits whatever slot the model favoured — measured 19-of-23 "B" on one run.
 * Both current clients reshuffle before display, but the API should not hand
 * out a guessable key to anyone who consumes it directly.
 */
export function shuffleOptions(q: RawQuestion): RawQuestion {
  const keys = ['A', 'B', 'C', 'D']
  const opts = keys.map(k => q.options![k])
  const correctText = q.options![String(q.correct_answer)]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  const options: Record<string, string> = {}
  keys.forEach((k, i) => { options[k] = opts[i] })
  return { ...q, options, correct_answer: keys[opts.indexOf(correctText)] }
}

/**
 * Splits sources into roughly equal batches.
 *
 * A whole chapter (up to 33 chunks) in one prompt took ~160s against a 60s
 * route budget, because the model has to emit "working" for every question
 * serially. Batches are generated in parallel instead, so wall-clock is one
 * batch rather than the whole chapter.
 */
export function batchChunks(chunks: ContentChunk[], perBatch = 8): ContentChunk[][] {
  if (chunks.length === 0) return []
  const batchCount = Math.ceil(chunks.length / perBatch)
  const size = Math.ceil(chunks.length / batchCount)
  const out: ContentChunk[][] = []
  for (let i = 0; i < chunks.length; i += size) out.push(chunks.slice(i, i + size))
  return out
}

/** Renders content_chunks rows as the only factual source the model may use. */
export function buildSourceBlocks(chunks: ContentChunk[]): string {
  return chunks.map((c) => [
    `<source id="${c.id}" section="${c.section}" topic="${c.term}">`,
    c.book_definition,
    c.guide_explanation,
    c.formula ? `Formula: ${c.formula}` : '',
    c.example_q
      ? `Worked example: ${c.example_q}\n${c.example_solution ?? ''}\nAnswer: ${c.example_answer ?? ''}`
      : '',
    `</source>`,
  ].filter(Boolean).join('\n')).join('\n\n')
}

/** Shared rules block — identical constraints on both generation paths. */
export function groundingRules(count: number, perSourceMax: number): string {
  return `GROUNDING — this is absolute.
Every question, every option and every answer must be derivable from the SOURCES
below and nothing else. Do not use chemistry you know that is not written here.
If a source does not contain enough material for a sound question, skip it —
returning fewer questions is correct; inventing one is not.

PROCEDURE — follow in this order for each question.
1. Pick one <source>. Write the question from it.
2. Work out the answer FIRST, in the "working" field. For anything numeric
   (atom counts, molar masses, percentages, moles) show the arithmetic. For
   trends (radius, electronegativity, acidity) name the rule from the source.
3. Write the settled answer as plain text in "answer_text".
4. Only then write the four options — and make "answer_text" one of them,
   COPIED CHARACTER FOR CHARACTER. Same units, same spacing, same notation.
5. Set "correct_answer" to the letter holding that identical string.
6. Set "source_id" to the id of the <source> you used.

OPTION RULES
- Options must be self-contained statements. NEVER write an option that refers
  to other options: no "Both A and B", no "All of the above", no "None of these",
  no "A and C". Options get shuffled before display, so such text becomes wrong.
  If the true answer is a combination, SPELL IT OUT — write
  "Molality and mole fraction", not "Both A and B".
- All four options must answer the SAME question in the SAME form. If the
  question asks for a mass in kg, all four are masses in kg. Never mix in the
  value of a different quantity, and never label an option with the name of a
  quantity the question did not ask for.
- Keep all four roughly the same length. A correct option noticeably longer or
  more detailed than the distractors gives the answer away — if the true answer
  needs a long sentence, make the distractors equally long.
- Distractors must be plausible and wrong — typically the result of a specific
  mistake (wrong molar mass, forgotten subscript, inverted trend, off-by-one
  power of ten), not a fact about something else.
- Spread correct_answer evenly across A, B, C and D.
- Do not ask the same fact twice. Each question must test something a different
  question in this batch does not already test.

Produce up to ${count} questions, at most ${perSourceMax} per source, covering as
many different sources as the material supports.`
}
