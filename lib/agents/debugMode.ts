import { createClient } from '@supabase/supabase-js';

export async function runDebugMode(chapterNumber: number): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: chunks, error } = await supabase
    .from('content_chunks')
    .select('section, term, page_ref, book_definition, guide_explanation, example_q, formula, keywords')
    .eq('chapter', chapterNumber)
    .order('section', { ascending: true });

  if (error) return `Error: ${error.message}`;
  if (!chunks?.length) return `No topics found for chapter ${chapterNumber}`;

  let output = `DEBUG MODE — CONTENT VERIFICATION\n`;
  output += `Chapter ${chapterNumber} — Topics: ${chunks.length}\n`;
  output += `${'─'.repeat(40)}\n\n`;

  for (const c of chunks) {
    output += `[${c.section}] ${c.term} — p.${c.page_ref ?? 'MISSING'}\n`;
    output += `Definition: ${c.book_definition   ? '✓' : 'MISSING'}\n`;
    output += `Explanation: ${c.guide_explanation ? '✓' : 'MISSING'}\n`;
    output += `Example: ${c.example_q             ? '✓' : 'MISSING'}\n`;
    output += `Formula: ${c.formula               ? '✓' : 'MISSING'}\n`;
    output += `Keywords: ${c.keywords?.length ? c.keywords.join(', ') : 'MISSING'}\n`;
    output += `${'─'.repeat(40)}\n\n`;
  }

  return output;
}

export function parseDebugCommand(message: string): { chapterNumber: number; topic?: string } | null {
  const msg = message.toLowerCase().trim();
  if (!msg.startsWith('/debug')) return null;
  const parts = msg.replace('/debug', '').trim().split(' ');
  const chapterNumber = parseInt(parts[0]) || 1;
  const topic = parts.slice(1).join(' ') || undefined;
  return { chapterNumber, topic };
}
