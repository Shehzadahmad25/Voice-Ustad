/**
 * GET /api/chapter-content?chapter=2&board=KPK
 *
 * Returns chapter metadata + full topic content from content_chunks.
 * Uses SERVICE ROLE KEY — the anon key is blocked by RLS on both tables.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const chapterParam = req.nextUrl.searchParams.get('chapter');
  const board        = req.nextUrl.searchParams.get('board') || 'KPK';

  const chapterNumber = parseInt(chapterParam ?? '', 10);
  if (!chapterNumber || isNaN(chapterNumber)) {
    return NextResponse.json({ ok: false, error: 'chapter param required (integer)' }, { status: 400 });
  }

  const db = getSupabase();

  const [chapterRes, topicsRes] = await Promise.all([
    db.from('chapters')
      .select('id, unit_number, title')
      .eq('unit_number', chapterNumber)
      .eq('board', board)
      .single(),
    db.from('content_chunks')
      .select('id, term, topic_slug, section, type, difficulty, page_ref, book_definition, english_explanation, example_q, formula, keywords')
      .eq('chapter', chapterNumber)
      .eq('board', board)
      .neq('topic_slug', 'chapter2-formulas-summary')
      .neq('type', 'exercise')
      .order('section'),
  ]);

  console.log(`[chapter-content] chapter=${chapterNumber} board=${board}`);
  console.log(`[chapter-content] chapter title=${chapterRes.data?.title ?? 'NOT FOUND'} error=${chapterRes.error?.message ?? 'none'}`);
  console.log(`[chapter-content] topics=${topicsRes.data?.length ?? 0} error=${topicsRes.error?.message ?? 'none'}`);

  if (chapterRes.error) {
    return NextResponse.json({ ok: false, error: `chapters: ${chapterRes.error.message}` }, { status: 500 });
  }
  if (!chapterRes.data) {
    return NextResponse.json({ ok: false, error: `Chapter ${chapterNumber} not found` }, { status: 404 });
  }
  if (topicsRes.error) {
    return NextResponse.json({ ok: false, error: `content_chunks: ${topicsRes.error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok:     true,
    chapter: chapterRes.data,
    topics:  topicsRes.data ?? [],
  });
}
