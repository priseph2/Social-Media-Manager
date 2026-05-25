-- Migration 007: per-tenant settings, content approval gate, rate limit tracking
-- Run in Supabase SQL Editor after 006

-- ── Tenant settings column ────────────────────────────────────────────────────
-- Stores feature flags per tenant, e.g. { "require_content_approval": true }
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- ── Content approvals queue ───────────────────────────────────────────────────
-- Holds brand-approved content waiting for a human to approve/reject
-- before it is published. Only used when tenant.settings->>'require_content_approval' = 'true'.
CREATE TABLE IF NOT EXISTS content_approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_data         JSONB NOT NULL,        -- full original job payload (replayed on approval)
  content_preview  TEXT,                  -- first 500 chars for display
  platform         TEXT,
  content_type     TEXT,
  brand_score      INTEGER,
  review_summary   TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at       TIMESTAMPTZ,
  decided_by       TEXT,                  -- email of the approver
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_approvals_tenant_status_idx
  ON content_approvals (tenant_id, status, created_at DESC);
