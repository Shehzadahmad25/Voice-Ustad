/**
 * GET /api/chapter-topics?chapter=1
 *
 * Returns topics from content_chunks for one chapter.
 * Uses the SERVICE ROLE KEY so RLS does not block the query.
 * The anon key (used by the browser client) would be silently blocked
 * by RLS if no public-read policy exists on content_chunks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient }          from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 10; // fast DB queries only
export const dynamic = 'force-dynamic';

function getSupabase() {
  return getServiceClient();
}

export async function GET(req: NextRequest) {
  const chapterParam  = req.nextUrl.searchParams.get('chapter');

  const chapterNumber = parseInt(chapterParam ?? '', 10);
  if (!chapterNumber || isNaN(chapterNumber)) {
    return NextResponse.json({ ok: false, error: 'chapter param required (integer)' }, { status: 400 });
  }

  console.log(`[chapter-topics] chapter=${chapterNumber}`);

  const { data, error } = await getSupabase()
    .from('content_chunks')
    .select('id, term, topic_slug, section, page_ref')
    .eq('chapter', chapterNumber)
    .order('section');

  console.log(`[chapter-topics] rows=${data?.length ?? 0} error=${error?.message ?? 'none'}`);

  if (error) {
    console.error('[chapter-topics] Supabase error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, topics: data ?? [] });
}
