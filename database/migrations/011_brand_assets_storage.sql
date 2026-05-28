-- Brand-assets Storage bucket + RLS policies
-- Run in Supabase Dashboard → SQL Editor

-- ── 1. Create buckets (idempotent) ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'brand-assets',
    'brand-assets',
    true,
    5242880,   -- 5 MB
    ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
  )
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'generated-images',
    'generated-images',
    true,
    10485760,  -- 10 MB
    ARRAY['image/png','image/jpeg','image/webp']
  )
  ON CONFLICT (id) DO NOTHING;

-- ── 2. brand-assets RLS policies ─────────────────────────────────────────────
-- Authenticated users may only read/write files under their own user-id folder.
-- Public (anon) may read any file in the bucket (logos are served in images).

DROP POLICY IF EXISTS "brand_assets_public_select"  ON storage.objects;
DROP POLICY IF EXISTS "brand_assets_owner_insert"   ON storage.objects;
DROP POLICY IF EXISTS "brand_assets_owner_update"   ON storage.objects;
DROP POLICY IF EXISTS "brand_assets_owner_delete"   ON storage.objects;

CREATE POLICY "brand_assets_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets');

CREATE POLICY "brand_assets_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "brand_assets_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "brand_assets_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. generated-images RLS policies ─────────────────────────────────────────
-- Backend uploads with the service-role key (bypasses RLS).
-- Dashboard reads images publicly.

DROP POLICY IF EXISTS "generated_images_public_select" ON storage.objects;

CREATE POLICY "generated_images_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-images');

-- ── 4. Allow gemini-image as an image provider ────────────────────────────────
ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_image_provider_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_image_provider_check
  CHECK (image_provider IN (
    'gemini-image',
    'imagen4-fast',
    'imagen4-standard',
    'dalle3-standard',
    'dalle3-hd',
    'canva'
  ));
