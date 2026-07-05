import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10; // fast DB queries only

export async function GET() {
  const db = getServiceClient();

  const { data, error } = await db
    .from('chapters')
    .select('id, unit_number, title, class')
    .eq('subject', 'Chemistry')
    .eq('board', 'KPK')
    .order('class', { ascending: true })
    .order('unit_number', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chapters: data ?? [] });
}
