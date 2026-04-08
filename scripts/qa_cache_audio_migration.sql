-- ============================================================
-- VoiceUstad — qa_cache audio fields + tts-audio storage bucket
-- Run this ONCE in Supabase SQL Editor (after qa_cache_migration.sql)
-- ============================================================

-- ============================================================
-- 1. Add audio columns to qa_cache
-- ============================================================
-- audio_url:         Supabase Storage CDN URL, "" when no audio cached yet
-- audio_duration:    Estimated seconds (copied from answer_json.dur on first TTS)
-- tts_voice:         Voice ID used (e.g. "alloy")
-- tts_model:         TTS model used (e.g. "gpt-4o-mini-tts")
-- audio_created_at:  Timestamp of first TTS generation for this entry

ALTER TABLE qa_cache
  ADD COLUMN IF NOT EXISTS audio_url         text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS audio_duration    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tts_voice         text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tts_model         text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS audio_created_at  timestamptz;

-- ============================================================
-- 2. Create tts-audio storage bucket (public, MP3 only, 5 MB max)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tts-audio',
  'tts-audio',
  true,
  5242880,              -- 5 MB per file
  ARRAY['audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. Storage RLS policies for tts-audio bucket
-- ============================================================

-- Allow anyone (anon) to read cached audio files
CREATE POLICY "tts_audio_public_read"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'tts-audio');

-- Allow service role to upload/upsert audio files
-- (service role bypasses RLS, so no explicit INSERT policy is needed)

-- ============================================================
-- 4. Verify setup (run these to confirm)
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'qa_cache' AND column_name LIKE 'audio%';
-- SELECT id, name, public FROM storage.buckets WHERE id = 'tts-audio';
