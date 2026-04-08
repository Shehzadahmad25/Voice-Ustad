-- ============================================================
-- VoiceUstad — cache_analytics table + dashboard RPCs
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. Analytics table
-- ============================================================
-- One row per cache lookup (chat mode) or first-time TTS generation
-- on a cache-hit row (audio_generated events).
--
-- result_type values:
--   'exact'           — exact normalized-question match, no embedding used
--   'semantic'        — pgvector cosine similarity match
--   'miss'            — no match; fresh GPT + RAG generation triggered
--   'audio_generated' — TTS was called to fill a cache-hit row for the first time
--
-- had_audio:
--   true  → cache hit already had audio_url (CDN served, TTS cost zero)
--   false → no cached audio; client will call mode=audio (TTS cost incurred)

CREATE TABLE IF NOT EXISTS cache_analytics (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question            text        NOT NULL DEFAULT '',
  normalized_question text        NOT NULL DEFAULT '',
  chapter_number      integer     NOT NULL DEFAULT 0,
  result_type         text        NOT NULL CHECK (result_type IN ('exact','semantic','miss','audio_generated')),
  similarity_score    float       NOT NULL DEFAULT 0,
  had_audio           boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS ca_created_at_idx
  ON cache_analytics (created_at DESC);

CREATE INDEX IF NOT EXISTS ca_chapter_idx
  ON cache_analytics (chapter_number);

CREATE INDEX IF NOT EXISTS ca_result_type_idx
  ON cache_analytics (result_type);

CREATE INDEX IF NOT EXISTS ca_normalized_q_idx
  ON cache_analytics (normalized_question);

-- ============================================================
-- 3. RPC: overall cache stats with cost-saving estimate
-- ============================================================
-- Returns one summary row for a given time window.
--
-- Cost params (USD, configurable per call):
--   cost_gpt   — cost per GPT answer call (default $0.0002)
--   cost_tts   — cost per TTS call         (default $0.003)
--   cost_embed — cost per embedding call   (default $0.00002)
--
-- Savings logic (per event):
--   exact hit + had_audio     → saves cost_gpt + cost_tts  (full save)
--   exact hit + no audio      → saves cost_gpt             (TTS still needed)
--   semantic hit + had_audio  → saves cost_gpt + cost_tts - cost_embed
--   semantic hit + no audio   → saves cost_gpt - cost_embed
--   miss                      → saves nothing
--   audio_generated           → saves nothing (TTS was called)

CREATE OR REPLACE FUNCTION get_cache_stats(
  since_ts    timestamptz DEFAULT now() - interval '7 days',
  cost_gpt    float       DEFAULT 0.0002,
  cost_tts    float       DEFAULT 0.003,
  cost_embed  float       DEFAULT 0.00002
)
RETURNS TABLE (
  total_requests         bigint,
  exact_hits             bigint,
  semantic_hits          bigint,
  misses                 bigint,
  audio_cache_hits       bigint,   -- cache hits where audio was already cached (had_audio=true)
  audio_generated_events bigint,   -- first-time TTS generation on a cache-hit row
  fresh_generations      bigint,   -- alias for misses
  hit_rate_pct           float,    -- (exact + semantic) / total_requests × 100
  audio_hit_rate_pct     float,    -- audio_cache_hits / (exact + semantic) × 100
  avg_semantic_similarity float,   -- avg similarity_score on semantic hits
  estimated_savings_usd   float    -- cumulative cost saved by cache
)
LANGUAGE sql STABLE AS $$
  WITH answer_events AS (
    SELECT *
    FROM cache_analytics
    WHERE created_at >= since_ts
      AND result_type IN ('exact', 'semantic', 'miss')
  ),
  audio_events AS (
    SELECT *
    FROM cache_analytics
    WHERE created_at >= since_ts
      AND result_type = 'audio_generated'
  ),
  agg AS (
    SELECT
      COUNT(*)                                                                  AS total_requests,
      COUNT(*) FILTER (WHERE result_type = 'exact')                            AS exact_hits,
      COUNT(*) FILTER (WHERE result_type = 'semantic')                         AS semantic_hits,
      COUNT(*) FILTER (WHERE result_type = 'miss')                             AS misses,
      COUNT(*) FILTER (WHERE result_type IN ('exact','semantic') AND had_audio) AS audio_cache_hits,
      AVG(similarity_score) FILTER (WHERE result_type = 'semantic')            AS avg_semantic_sim,
      -- Cost savings per event type
      SUM(CASE
        WHEN result_type = 'exact'     AND     had_audio THEN cost_gpt + cost_tts
        WHEN result_type = 'exact'     AND NOT had_audio THEN cost_gpt
        WHEN result_type = 'semantic'  AND     had_audio THEN cost_gpt + cost_tts - cost_embed
        WHEN result_type = 'semantic'  AND NOT had_audio THEN cost_gpt - cost_embed
        ELSE 0
      END)                                                                      AS savings
    FROM answer_events
  ),
  audio_agg AS (
    SELECT COUNT(*) AS audio_generated_count FROM audio_events
  )
  SELECT
    agg.total_requests,
    agg.exact_hits,
    agg.semantic_hits,
    agg.misses,
    agg.audio_cache_hits,
    audio_agg.audio_generated_count           AS audio_generated_events,
    agg.misses                                 AS fresh_generations,
    CASE WHEN agg.total_requests > 0
      THEN ROUND(((agg.exact_hits + agg.semantic_hits)::float / agg.total_requests * 100)::numeric, 1)::float
      ELSE 0 END                               AS hit_rate_pct,
    CASE WHEN (agg.exact_hits + agg.semantic_hits) > 0
      THEN ROUND((agg.audio_cache_hits::float / (agg.exact_hits + agg.semantic_hits) * 100)::numeric, 1)::float
      ELSE 0 END                               AS audio_hit_rate_pct,
    COALESCE(ROUND(agg.avg_semantic_sim::numeric, 4)::float, 0) AS avg_semantic_similarity,
    COALESCE(ROUND(agg.savings::numeric, 4)::float, 0)          AS estimated_savings_usd
  FROM agg
  CROSS JOIN audio_agg;
$$;

-- ============================================================
-- 4. RPC: hit rate by chapter
-- ============================================================
-- Returns per-chapter breakdown of hits, misses, and hit rate.
-- Useful for identifying chapters that need more cached content.

CREATE OR REPLACE FUNCTION get_cache_hit_rate_by_chapter(
  since_ts timestamptz DEFAULT now() - interval '30 days'
)
RETURNS TABLE (
  chapter_number   integer,
  total_requests   bigint,
  exact_hits       bigint,
  semantic_hits    bigint,
  misses           bigint,
  hit_rate_pct     float,
  audio_cache_hits bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    chapter_number,
    COUNT(*)                                                                    AS total_requests,
    COUNT(*) FILTER (WHERE result_type = 'exact')                              AS exact_hits,
    COUNT(*) FILTER (WHERE result_type = 'semantic')                           AS semantic_hits,
    COUNT(*) FILTER (WHERE result_type = 'miss')                               AS misses,
    CASE WHEN COUNT(*) > 0
      THEN ROUND(
        (COUNT(*) FILTER (WHERE result_type IN ('exact','semantic'))::float / COUNT(*) * 100)::numeric, 1
      )::float
      ELSE 0 END                                                               AS hit_rate_pct,
    COUNT(*) FILTER (WHERE result_type IN ('exact','semantic') AND had_audio)  AS audio_cache_hits
  FROM cache_analytics
  WHERE created_at >= since_ts
    AND result_type IN ('exact', 'semantic', 'miss')
  GROUP BY chapter_number
  ORDER BY chapter_number;
$$;

-- ============================================================
-- 5. RPC: top repeated questions (most cache hits)
-- ============================================================
-- Returns the most-asked normalized questions that are already cached.
-- High hit_count = high-value cache entries.

CREATE OR REPLACE FUNCTION get_top_cached_questions(
  since_ts     timestamptz DEFAULT now() - interval '30 days',
  lim          int         DEFAULT 20,
  chapter_no   int         DEFAULT 0   -- 0 = all chapters
)
RETURNS TABLE (
  normalized_question text,
  total_hits          bigint,
  exact_hits          bigint,
  semantic_hits       bigint,
  has_audio           boolean,
  chapter_number      integer,
  last_seen           timestamptz
)
LANGUAGE sql STABLE AS $$
  SELECT
    normalized_question,
    COUNT(*)                                           AS total_hits,
    COUNT(*) FILTER (WHERE result_type = 'exact')      AS exact_hits,
    COUNT(*) FILTER (WHERE result_type = 'semantic')   AS semantic_hits,
    bool_or(had_audio)                                 AS has_audio,
    chapter_number,
    MAX(created_at)                                    AS last_seen
  FROM cache_analytics
  WHERE created_at >= since_ts
    AND result_type IN ('exact', 'semantic')
    AND (chapter_no = 0 OR chapter_number = chapter_no)
  GROUP BY normalized_question, chapter_number
  ORDER BY total_hits DESC
  LIMIT lim;
$$;

-- ============================================================
-- 6. RPC: top missed questions (cache misses — good candidates to pre-warm)
-- ============================================================
-- Returns the most-asked questions that are NOT yet in the cache.
-- High miss_count = questions worth manually reviewing or pre-loading.

CREATE OR REPLACE FUNCTION get_top_missed_questions(
  since_ts   timestamptz DEFAULT now() - interval '30 days',
  lim        int         DEFAULT 20,
  chapter_no int         DEFAULT 0
)
RETURNS TABLE (
  normalized_question text,
  miss_count          bigint,
  chapter_number      integer,
  last_seen           timestamptz
)
LANGUAGE sql STABLE AS $$
  SELECT
    a.normalized_question,
    COUNT(*)                    AS miss_count,
    a.chapter_number,
    MAX(a.created_at)           AS last_seen
  FROM cache_analytics a
  WHERE a.created_at >= since_ts
    AND a.result_type = 'miss'
    AND (chapter_no = 0 OR a.chapter_number = chapter_no)
    -- exclude questions that are now cached (only show true misses)
    AND NOT EXISTS (
      SELECT 1 FROM qa_cache c
      WHERE c.normalized_question = a.normalized_question
        AND c.chapter_number = a.chapter_number
    )
  GROUP BY a.normalized_question, a.chapter_number
  ORDER BY miss_count DESC
  LIMIT lim;
$$;

-- ============================================================
-- 7. Row Level Security
-- ============================================================

ALTER TABLE cache_analytics ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS entirely (no policy needed).
-- Deny all access from anon key — analytics data is internal only.

-- ============================================================
-- 8. Verify (run these to confirm)
-- ============================================================
-- SELECT COUNT(*) FROM cache_analytics;
-- SELECT * FROM get_cache_stats(now() - interval '7 days');
-- SELECT * FROM get_cache_hit_rate_by_chapter(now() - interval '30 days');
-- SELECT * FROM get_top_cached_questions(now() - interval '30 days', 10);
-- SELECT * FROM get_top_missed_questions(now() - interval '30 days', 10);
