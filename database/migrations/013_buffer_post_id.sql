-- Track Buffer post IDs on scheduled content so the sync endpoint is idempotent
-- Run in Supabase SQL Editor

ALTER TABLE content_schedule
  ADD COLUMN IF NOT EXISTS buffer_post_id TEXT;

COMMENT ON COLUMN content_schedule.buffer_post_id IS
  'Buffer post ID after the post has been pushed to Buffer. NULL means not yet synced.';
