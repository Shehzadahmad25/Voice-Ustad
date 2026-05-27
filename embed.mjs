import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data: chunks } = await supabase
  .from("content_chunks")
  .select("id, term, book_definition, guide_explanation")
  .eq("class", 12)
  .is("embedding", null);

console.log(`Found ${chunks.length} chunks without embeddings`);

for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  const text = `${chunk.term}. ${chunk.book_definition || ""} ${chunk.guide_explanation || ""}`.trim();
  
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  
  await supabase
    .from("content_chunks")
    .update({ embedding: response.data[0].embedding })
    .eq("id", chunk.id);

  console.log(`[${i + 1}/${chunks.length}] ${chunk.term}`);
}

console.log("Done!");
