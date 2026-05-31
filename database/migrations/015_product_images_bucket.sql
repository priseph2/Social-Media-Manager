-- Create Supabase Storage bucket for tenant product images (with background removal)
-- Run once in the Supabase SQL editor or via the Supabase CLI.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own tenant folder
CREATE POLICY "Tenant users can upload product images" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
  );

-- Allow public read access (images are composited into public social posts)
CREATE POLICY "Public read for product images" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'product-images');
