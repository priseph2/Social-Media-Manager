-- Image generation: provider config per tenant + image usage tracking
-- Run in Supabase Dashboard → SQL Editor after 004_analytics.sql

-- ── Tenant image provider setting ────────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS image_provider TEXT NOT NULL DEFAULT 'imagen4-fast'
  CHECK (image_provider IN ('imagen4-fast', 'imagen4-standard', 'dalle3-standard', 'dalle3-hd', 'canva'));

-- ── Image usage column on usage_records ───────────────────────────────────────
ALTER TABLE usage_records
  ADD COLUMN IF NOT EXISTS image_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usage_records
  ADD COLUMN IF NOT EXISTS image_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0;

-- Index for efficient image quota lookups
CREATE INDEX IF NOT EXISTS usage_records_image_idx
  ON usage_records (tenant_id, billing_period)
  WHERE image_count > 0;

-- ── Supabase Storage bucket (run via Supabase dashboard or API) ───────────────
-- Bucket name : generated-images
-- Public      : true  (images are served directly to the dashboard)
-- File size   : 10 MB max
-- MIME types  : image/png, image/jpeg, image/webp
--
-- SQL equivalent (if using storage schema):
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('generated-images', 'generated-images', true)
--   ON CONFLICT (id) DO NOTHING;
