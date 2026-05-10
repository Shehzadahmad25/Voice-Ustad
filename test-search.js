import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testSearch(query) {
  console.log('Searching:', query);
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
  const embedding = res.data[0].embedding;
  const { data, error } = await supabase.rpc('search_chunks', {
    query_embedding: embedding,
    filter_board: 'KPK',
    filter_class: 11,
    filter_subject: 'Chemistry',
    match_threshold: 0.3,
    match_count: 3
  });
  if (error) { console.error(error); return; }
  data.forEach((r, i) => console.log(i+1, 'Ch'+r.chapter, r.term, r.similarity.toFixed(3)));
}

testSearch('what is enthalpy');
testSearch('Hess law');
testSearch('oxidation number');
