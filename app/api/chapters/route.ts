import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const db = createClient(url, key);

  const { data, error } = await db
    .from('chapters')
    .select('id, unit_number, title')
    .eq('subject', 'Chemistry')
    .eq('class', 11)
    .eq('board', 'KPK')
    .order('unit_number', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chapters: data ?? [] });
}
