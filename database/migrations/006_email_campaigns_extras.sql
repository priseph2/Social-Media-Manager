-- Migration 006: email_campaigns extras + canva credential support
-- Run in Supabase SQL editor

-- Add goal_type and html_body to email_campaigns
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS goal_type TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS html_body TEXT;

-- Allow canva credentials in tenant_credentials service allowlist
-- (No schema change needed — service column is free-text; this is a code-level allowlist)

-- Index for querying by status (useful for pending/sent filtering)
CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON email_campaigns (tenant_id, status, created_at DESC);
