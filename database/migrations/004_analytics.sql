-- Phase 9: Advanced Analytics tables
-- Run after 003_billing.sql

-- ── Monthly Reports (long-form AI narrative, stored per tenant) ────────────
CREATE TABLE IF NOT EXISTS monthly_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period         TEXT NOT NULL,          -- 'YYYY-MM'
  title          TEXT NOT NULL,
  markdown       TEXT NOT NULL,          -- full narrative document
  structured     JSONB,                  -- structured JSON from the report tool
  benchmark      JSONB,                  -- competitor benchmark snapshot
  overall_score  INT,                    -- 0-100 score at time of generation
  generated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, period)
);

CREATE INDEX IF NOT EXISTS monthly_reports_tenant_idx ON monthly_reports (tenant_id, period DESC);

-- ── Content Attributions (revenue tied to a content piece) ────────────────
CREATE TABLE IF NOT EXISTS content_attributions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content_id      TEXT NOT NULL,         -- MongoDB Content._id (string)
  order_id        TEXT NOT NULL,         -- e-commerce order id
  platform        TEXT,                  -- shopify | woocommerce | bigcommerce | wix
  order_amount    NUMERIC(12,2),
  currency        TEXT DEFAULT 'USD',
  confidence      TEXT,                  -- high | medium | low
  reasoning       TEXT,
  attributed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, order_id, content_id)
);

CREATE INDEX IF NOT EXISTS content_attributions_tenant_idx  ON content_attributions (tenant_id, attributed_at DESC);
CREATE INDEX IF NOT EXISTS content_attributions_content_idx ON content_attributions (content_id);

-- ── Performance Predictions (pre-publish forecasts) ────────────────────────
-- Light-weight log; the primary data lives on the MongoDB Content document.
CREATE TABLE IF NOT EXISTS content_predictions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content_id                TEXT,            -- MongoDB Content._id if already persisted
  platform                  TEXT,
  predicted_engagement_rate NUMERIC(6,2),
  predicted_reach           INT,
  viral_potential           TEXT,            -- low | medium | high
  confidence                TEXT,            -- low | medium | high
  payload                   JSONB,           -- full prediction object
  generated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_predictions_tenant_idx ON content_predictions (tenant_id, generated_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE monthly_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_predictions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_reports_tenant" ON monthly_reports
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "content_attributions_tenant" ON content_attributions
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "content_predictions_tenant" ON content_predictions
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
