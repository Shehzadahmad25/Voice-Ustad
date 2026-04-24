import { createClient } from '@supabase/supabase-js';

export async function runDebugMode(chapterNumber: number): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: topics, error } = await supabase
    .from('topics')
    .select('*')
    .eq('chapter_number', chapterNumber)
    .order('topic_code', { ascending: true });

  if (error) return `Error: ${error.message}`;
  if (!topics?.length) return `No topics found for chapter ${chapterNumber}`;

  let output = `DEBUG MODE — CONTENT VERIFICATION\n`;
  output += `Chapter ${chapterNumber} — Topics: ${topics.length}\n`;
  output += `${'─'.repeat(40)}\n\n`;

  for (const topic of topics) {
    output += `[${topic.topic_code}] ${topic.topic_title} — p.${topic.page ?? 'MISSING'}\n`;
    output += `Definition: ${topic.definition ? '✓' : 'MISSING'}\n`;
    output += `Explanation: ${topic.explanation ? '✓' : 'MISSING'}\n`;
    output += `Example: ${topic.example ? '✓' : 'MISSING'}\n`;
    output += `Formula: ${topic.formula ? '✓' : 'MISSING'}\n`;
    output += `Keywords: ${topic.keywords?.length ? topic.keywords.join(', ') : 'MISSING'}\n`;
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
