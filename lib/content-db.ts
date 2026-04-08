import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── Chapter queries ──────────────────────────────────────────────────────────

export async function getAllChapters() {
  const { data, error } = await getClient().from('chapters').select('*').order('unit_number');
  if (error) { console.error('getAllChapters:', error); return []; }
  return data;
}

export async function getChapter(unitNumber: number) {
  const { data, error } = await getClient().from('chapters').select('*').eq('unit_number', unitNumber).single();
  if (error) return null;
  return data;
}

// ── Concepts ─────────────────────────────────────────────────────────────────

export async function getChapterConcepts(unitNumber: number) {
  const chapter = await getChapter(unitNumber);
  if (!chapter) return [];
  const { data, error } = await getClient()
    .from('concepts')
    .select('term, definition')
    .eq('chapter_id', chapter.id);
  if (error) return [];
  return data;
}

export async function getConcept(searchTerm: string) {
  const { data, error } = await getClient()
    .from('concepts')
    .select('*, chapters!inner(unit_number, title)')
    .ilike('term', `%${searchTerm}%`)
    .limit(5);
  if (error) return [];
  return data;
}

// ── Formulas ─────────────────────────────────────────────────────────────────

export async function getChapterFormulas(unitNumber: number) {
  const chapter = await getChapter(unitNumber);
  if (!chapter) return [];
  const { data, error } = await getClient()
    .from('formulas')
    .select('name, formula, description')
    .eq('chapter_id', chapter.id);
  if (error) return [];
  return data;
}

export async function searchFormulas(searchTerm: string) {
  const { data, error } = await getClient()
    .from('formulas')
    .select('*, chapters!inner(unit_number, title)')
    .or(`name.ilike.%${searchTerm}%,formula.ilike.%${searchTerm}%`)
    .limit(5);
  if (error) return [];
  return data;
}

// ── Examples ─────────────────────────────────────────────────────────────────

export async function getChapterExamples(unitNumber: number) {
  const chapter = await getChapter(unitNumber);
  if (!chapter) return [];
  const { data, error } = await getClient()
    .from('examples')
    .select('example_id, page_number, question, solution, answer, chapter_id')
    .eq('chapter_id', chapter.id)
    .order('example_id');
  if (error) return [];
  return data;
}

export async function getExample(exampleId: string) {
  const { data, error } = await getClient()
    .from('examples')
    .select('*, chapters!inner(unit_number, title)')
    .eq('example_id', exampleId)
    .single();
  if (error) return null;
  return data;
}

export async function searchExamples(searchTerm: string, unitNumber: number | null = null) {
  let query = getClient()
    .from('examples')
    .select('example_id, page_number, question, solution, answer, chapter_id')
    .or(`question.ilike.%${searchTerm}%,solution.ilike.%${searchTerm}%`);
  if (unitNumber) {
    const chapter = await getChapter(unitNumber);
    if (chapter) query = (query as any).eq('chapter_id', chapter.id);
  }
  const { data, error } = await (query as any).limit(3);
  if (error) return [];
  return data;
}

// ── Key points ────────────────────────────────────────────────────────────────

export async function getKeyPoints(unitNumber: number) {
  const chapter = await getChapter(unitNumber);
  if (!chapter) return [];
  const { data, error } = await getClient()
    .from('key_points')
    .select('text')
    .eq('chapter_id', chapter.id)
    .order('point_number');
  if (error) return [];
  return data;
}

// ── MCQs ─────────────────────────────────────────────────────────────────────

export async function getMCQs(unitNumber: number, limit = 20) {
  const { data, error } = await getClient()
    .from('mcqs')
    .select('*, chapters!inner(unit_number, title)')
    .eq('chapters.unit_number', unitNumber)
    .limit(limit);
  if (error) return [];
  return data;
}

export async function getRandomMCQ(unitNumber: number | null = null) {
  let query = getClient().from('mcqs').select('*, chapters!inner(unit_number, title)');
  if (unitNumber) query = (query as any).eq('chapters.unit_number', unitNumber);
  const { data, error } = await (query as any);
  if (error || !data?.length) return null;
  return data[Math.floor(Math.random() * data.length)];
}

// ── AI tutor helper ───────────────────────────────────────────────────────────

/**
 * Maps Urdu Roman and shorthand chemistry terms to canonical English search terms.
 */
function extractKeywords(msg: string): string {
  const map: Record<string, string> = {
    'mole': 'mole', 'mol': 'mole', 'moles': 'mole',
    'avogadro': 'avogadro',
    'atomic mass': 'atomic mass', 'atomic weight': 'atomic mass',
    'molecular mass': 'molecular mass', 'molecular weight': 'molecular mass',
    'formula mass': 'formula mass',
    'molar mass': 'molar mass',
    'stoichiometry': 'stoichiometry',
    'limiting': 'limiting reagent', 'limiting reagent': 'limiting reagent',
    'percent': 'percentage composition', 'percentage': 'percentage composition',
    'yield': 'yield',
    'empirical': 'empirical formula', 'empirical formula': 'empirical formula',
    'molecular formula': 'molecular formula',
    'kya hai': 'definition', 'kya hota': 'definition', 'define': 'definition',
    'formula': 'formula', 'calculate': 'calculate', 'calculation': 'calculate',
  };
  const lower = msg.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return msg;
}

/**
 * PIPELINE: User → DB (book content) → AI (format + voice)
 *
 * Fetches only the content directly relevant to the student's question.
 * Returns a clearly structured block the AI must use verbatim.
 * Returns empty string only when NO matching content exists in the DB.
 */
export async function buildTutorContext(
  studentQuestion: string,
  unitNumber: number | null = null
): Promise<string> {
  if (!unitNumber) return '';

  const chapter = await getChapter(unitNumber);
  if (!chapter) return '';

  const searchQuery = extractKeywords(studentQuestion);

  const tokens = searchQuery
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Fetch all DB content in parallel — no fallbacks that would pass irrelevant content
  const [allConcepts, allFormulas, allKeyPoints, matchedExamples] = await Promise.all([
    getChapterConcepts(unitNumber),
    getChapterFormulas(unitNumber),
    getKeyPoints(unitNumber),
    searchExamples(searchQuery, unitNumber),
  ]);

  // ── Strict matching only — no fallback to all chapter content ──
  const matchedConcepts = allConcepts.filter((c: any) => {
    const combined = (c.term + ' ' + c.definition).toLowerCase();
    return tokens.some((t) => combined.includes(t));
  });

  const matchedFormulas = allFormulas.filter((f: any) => {
    const combined = (f.name + ' ' + f.formula + ' ' + (f.description || '')).toLowerCase();
    return tokens.some((t) => combined.includes(t));
  });

  const matchedKeyPoints = allKeyPoints.filter((kp: any) => {
    return tokens.some((t) => String(kp.text).toLowerCase().includes(t));
  }).slice(0, 3);

  // Only use matched examples — never dump all chapter examples
  const examples = matchedExamples.slice(0, 2);

  // ── If nothing found in DB, signal "not available" — do not call AI with empty context ──
  const hasContent = matchedConcepts.length > 0 || matchedFormulas.length > 0
    || matchedKeyPoints.length > 0 || examples.length > 0;
  if (!hasContent) return '';

  // ── Build the strict context block ──
  let context = `CHAPTER: Unit ${chapter.unit_number} — ${chapter.title} (KPK Board FSc Chemistry, Pages ${chapter.book_pages})\n\n`;

  if (matchedConcepts.length > 0) {
    context += 'BOOK DEFINITIONS (copy word-for-word, do not paraphrase):\n';
    matchedConcepts.forEach((c: any) => {
      context += `• ${c.term}: ${c.definition}\n`;
    });
    context += '\n';
  }

  if (matchedFormulas.length > 0) {
    context += 'BOOK FORMULAS:\n';
    matchedFormulas.forEach((f: any) => {
      context += `• ${f.name}: ${f.formula}`;
      if (f.description) context += ` — ${f.description}`;
      context += '\n';
    });
    context += '\n';
  }

  if (matchedKeyPoints.length > 0) {
    context += 'BOOK KEY POINTS (use exact wording):\n';
    matchedKeyPoints.forEach((kp: any) => { context += `• ${kp.text}\n`; });
    context += '\n';
  }

  if (examples.length > 0) {
    context += 'BOOK WORKED EXAMPLES (with page numbers):\n';
    examples.forEach((ex: any) => {
      context += `[Page ${ex.page_number}] ${ex.example_id}: ${ex.question}\nSolution: ${ex.solution}\nAnswer: ${ex.answer}\n\n`;
    });
  }

  return context;
}
