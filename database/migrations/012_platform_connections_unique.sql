-- Add missing unique constraint so platform_connections upsert works correctly.
-- The onConflict: 'tenant_id,platform' in setCredentials route requires this.
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE platform_connections
  ADD CONSTRAINT platform_connections_tenant_platform_unique
  UNIQUE (tenant_id, platform);
