-- Multi-tenant SaaS schema additions
-- Run after 001_initial.sql in Supabase Dashboard → SQL Editor

-- ── Tenants ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'starter',   -- starter, growth, agency
  status      TEXT NOT NULL DEFAULT 'onboarding', -- onboarding, active, suspended
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Brand Configs (per-tenant, versioned) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version     INT NOT NULL DEFAULT 1,
  config      JSONB NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, version)
);

CREATE INDEX ON brand_configs (tenant_id) WHERE is_active = TRUE;

-- ── Tenant Credentials (API keys per tenant, per service) ─────────────────────
CREATE TABLE IF NOT EXISTS tenant_credentials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service       TEXT NOT NULL,          -- buffer, meta, mailchimp, shopify, ga4, tidio
  credentials   JSONB NOT NULL,         -- service-specific keys/tokens
  platform_type TEXT,                   -- for ecommerce: shopify, woocommerce, bigcommerce, wix
  connected_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, service)
);

-- ── Platform Connections (status tracking) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'connected',  -- connected, disconnected, error
  metadata      JSONB,
  connected_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Onboarding Progress ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step          TEXT NOT NULL,          -- company, brand_voice, audience, integrations, launch
  completed     BOOLEAN DEFAULT FALSE,
  data          JSONB,
  completed_at  TIMESTAMPTZ,
  UNIQUE(tenant_id, step)
);

-- ── Tenant API Keys (hashed, for direct API access) ──────────────────────────
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash    TEXT UNIQUE NOT NULL,     -- SHA-256 of the actual key
  label       TEXT,
  last_used   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Add tenant_id to all existing tables ──────────────────────────────────────
ALTER TABLE task_log               ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE brand_guidelines_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE escalations            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE content_schedule       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE email_campaigns        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE faq                    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE daily_metrics          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS task_log_tenant_idx ON task_log (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS escalations_tenant_idx ON escalations (tenant_id, resolved, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_schedule_tenant_idx ON content_schedule (tenant_id, scheduled_at) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS daily_metrics_tenant_idx ON daily_metrics (tenant_id, metric_date DESC) WHERE tenant_id IS NOT NULL;

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Note: service_role (used by the API server) bypasses RLS automatically in Supabase.
-- These policies are for authenticated dashboard users.

ALTER TABLE tenants               ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_credentials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys       ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_schedule      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics         ENABLE ROW LEVEL SECURITY;

-- Tenants: users can only see their own tenant
CREATE POLICY "tenant_self_read" ON tenants
  FOR SELECT TO authenticated
  USING (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Brand configs: tenant-scoped
CREATE POLICY "brand_config_tenant" ON brand_configs
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Credentials: tenant-scoped (no SELECT on credentials column — use API)
CREATE POLICY "credentials_tenant" ON tenant_credentials
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Platform connections
CREATE POLICY "platforms_tenant" ON platform_connections
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Onboarding
CREATE POLICY "onboarding_tenant" ON onboarding_progress
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Operational tables: tenant-scoped reads
CREATE POLICY "task_log_tenant" ON task_log
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "escalations_tenant" ON escalations
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "content_schedule_tenant" ON content_schedule
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "email_campaigns_tenant" ON email_campaigns
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "faq_tenant" ON faq
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "daily_metrics_tenant" ON daily_metrics
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
