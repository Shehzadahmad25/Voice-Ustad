-- ============================================================
-- VoiceUstad — qa_cache table + pgvector semantic search
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- 0. Enable pgvector (already available in all Supabase projects)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. Main cache table
-- ============================================================

CREATE TABLE IF NOT EXISTS qa_cache (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Question fields
  original_question    text        NOT NULL,
  normalized_question  text        NOT NULL,
  question_embedding   vector(1536),            -- text-embedding-3-small

  -- Scoping
  subject              text        NOT NULL DEFAULT 'chemistry',
  chapter              text        NOT NULL DEFAULT '',
  chapter_number       integer     NOT NULL DEFAULT 0,
  topic                text        NOT NULL DEFAULT '',

  -- Answer content (structured JSON matching StructuredAnswer schema)
  answer_json          jsonb       NOT NULL,    -- {definition,explanation,example,formula,flabel,dur,urduTtsText}
  urdu_tts_text        text        NOT NULL DEFAULT '',

  -- Audio (for future Supabase Storage integration)
  audio_url            text        NOT NULL DEFAULT '',

  -- RAG provenance
  chunk_ids            text[]      NOT NULL DEFAULT '{}',

  -- Model metadata
  model_text           text        NOT NULL DEFAULT '',
  model_tts            text        NOT NULL DEFAULT '',

  -- Stats
  hit_count            integer     NOT NULL DEFAULT 0,

  -- Timestamps
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Indexes
-- ============================================================

-- Exact match index (used by Step 1 of lookup)
CREATE UNIQUE INDEX IF NOT EXISTS qa_cache_norm_chapter_idx
  ON qa_cache (normalized_question, chapter_number);

-- HNSW index for pgvector cosine similarity (used by Step 2 of lookup)
-- HNSW works well for variable-size datasets with no pre-training needed.
-- ef_construction = 64 is a safe default; increase for better recall at query time.
CREATE INDEX IF NOT EXISTS qa_cache_embedding_hnsw_idx
  ON qa_cache USING hnsw (question_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Fast lookup by chapter
CREATE INDEX IF NOT EXISTS qa_cache_chapter_idx
  ON qa_cache (chapter_number);

-- ============================================================
-- 3. RPC: semantic similarity search
-- ============================================================
-- Called by lookupCache() when exact match misses.
-- Returns rows where cosine similarity >= match_threshold,
-- optionally filtered to a specific chapter.

CREATE OR REPLACE FUNCTION match_qa_cache(
  query_embedding        vector(1536),
  match_threshold        float,
  match_count            int,
  filter_chapter_number  int DEFAULT 0
)
RETURNS TABLE (
  id                   uuid,
  original_question    text,
  normalized_question  text,
  subject              text,
  chapter              text,
  chapter_number       integer,
  topic                text,
  answer_json          jsonb,
  urdu_tts_text        text,
  audio_url            text,
  chunk_ids            text[],
  model_text           text,
  model_tts            text,
  hit_count            integer,
  created_at           timestamptz,
  updated_at           timestamptz,
  similarity           float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    original_question,
    normalized_question,
    subject,
    chapter,
    chapter_number,
    topic,
    answer_json,
    urdu_tts_text,
    audio_url,
    chunk_ids,
    model_text,
    model_tts,
    hit_count,
    created_at,
    updated_at,
    (1 - (question_embedding <=> query_embedding))::float AS similarity
  FROM qa_cache
  WHERE
    question_embedding IS NOT NULL
    AND (filter_chapter_number = 0 OR chapter_number = filter_chapter_number)
    AND (1 - (question_embedding <=> query_embedding)) >= match_threshold
  ORDER BY question_embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- 4. RPC: atomic hit count increment
-- ============================================================
-- Called by bumpHitCount() after every cache hit.
-- Atomic UPDATE avoids read-modify-write race conditions.

CREATE OR REPLACE FUNCTION increment_qa_cache_hit_count(cache_id uuid)
RETURNS void
LANGUAGE sql AS $$
  UPDATE qa_cache
  SET hit_count = hit_count + 1,
      updated_at = now()
  WHERE id = cache_id;
$$;

-- ============================================================
-- 5. Row Level Security
-- ============================================================
-- Service role key bypasses RLS entirely.
-- Anon key can only read (for possible future public cache reads).

ALTER TABLE qa_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role to do everything (no policy needed — bypasses RLS)
-- Allow anon to SELECT only
CREATE POLICY "anon_read_cache"
  ON qa_cache FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- 6. Verify setup (run these to confirm)
-- ============================================================
-- SELECT COUNT(*) FROM qa_cache;
-- SELECT proname FROM pg_proc WHERE proname IN ('match_qa_cache','increment_qa_cache_hit_count');
-- SELECT indexname FROM pg_indexes WHERE tablename = 'qa_cache';
