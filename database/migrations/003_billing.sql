-- Phase 8: Billing tables
-- Run in Supabase Dashboard → SQL Editor after 002_multi_tenant.sql

-- ── Subscriptions (one per tenant) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan                       TEXT NOT NULL DEFAULT 'starter',     -- starter | growth | agency
  status                     TEXT NOT NULL DEFAULT 'trialing',   -- trialing | active | past_due | cancelled
  paystack_customer_code     TEXT,
  paystack_subscription_code TEXT,
  paystack_plan_code         TEXT,
  authorization_code         TEXT,                               -- card auth for renewals
  current_period_start       TIMESTAMPTZ,
  current_period_end         TIMESTAMPTZ,
  trial_ends_at              TIMESTAMPTZ,
  cancel_at_period_end       BOOLEAN NOT NULL DEFAULT FALSE,
  pending_plan               TEXT,                               -- plan change queued for next cycle
  cancelled_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS subscriptions_tenant_idx  ON subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx  ON subscriptions (status);

-- ── Usage Records (per AI call, bucketed by billing period) ────────────────
CREATE TABLE IF NOT EXISTS usage_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recorded_at        TIMESTAMPTZ DEFAULT NOW(),
  billing_period     TEXT NOT NULL,          -- 'YYYY-MM'
  skill              TEXT,                   -- which skill made the call
  model              TEXT NOT NULL,
  input_tokens       INT NOT NULL DEFAULT 0,
  output_tokens      INT NOT NULL DEFAULT 0,
  cache_read_tokens  INT NOT NULL DEFAULT 0,
  cache_write_tokens INT NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(10,6) NOT NULL DEFAULT 0,
  ops_count          INT NOT NULL DEFAULT 1  -- always 1 per row; aggregate for monthly total
);

CREATE INDEX IF NOT EXISTS usage_tenant_period_idx ON usage_records (tenant_id, billing_period);
CREATE INDEX IF NOT EXISTS usage_tenant_recorded_idx ON usage_records (tenant_id, recorded_at DESC);

-- Monthly aggregate view (avoids full table scans on the billing dashboard)
CREATE OR REPLACE VIEW monthly_usage AS
SELECT
  tenant_id,
  billing_period,
  SUM(ops_count)          AS total_ops,
  SUM(input_tokens)       AS total_input_tokens,
  SUM(output_tokens)      AS total_output_tokens,
  SUM(cache_read_tokens)  AS total_cache_read_tokens,
  SUM(cache_write_tokens) AS total_cache_write_tokens,
  SUM(cost_usd)           AS total_cost_usd
FROM usage_records
GROUP BY tenant_id, billing_period;

-- ── Billing Events (immutable audit log) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  event_type  TEXT NOT NULL,   -- subscription.created | payment.succeeded | plan.changed | payment.failed | subscription.cancelled
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_events_tenant_idx ON billing_events (tenant_id, created_at DESC);

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_tenant" ON subscriptions
  FOR ALL TO authenticated
  USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "usage_records_tenant" ON usage_records
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY "billing_events_tenant" ON billing_events
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- ── Auto-provision trial subscription on tenant creation ──────────────────
-- Trigger: when a tenant is inserted (status='onboarding'), create a 14-day Growth trial
CREATE OR REPLACE FUNCTION provision_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO subscriptions (tenant_id, plan, status, trial_ends_at)
  VALUES (NEW.id, 'growth', 'trialing', NOW() + INTERVAL '14 days')
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created ON tenants;
CREATE TRIGGER on_tenant_created
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION provision_trial_subscription();
