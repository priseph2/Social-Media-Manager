-- Global configuration store for runtime-editable admin settings
CREATE TABLE IF NOT EXISTS global_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT 'null',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT
);

-- RLS: only service-role bypass (admin API uses service key)
ALTER TABLE global_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON global_config USING (false);

-- Seed defaults (safe to re-run)
INSERT INTO global_config (key, value) VALUES
  ('maintenance_mode',              'false'),
  ('maintenance_message',           '"Platform is under scheduled maintenance. We''ll be back shortly."'),
  ('rate_limit_free',               '5'),
  ('rate_limit_starter',            '50'),
  ('rate_limit_growth',             '200'),
  ('rate_limit_agency',             '1000'),
  ('brand_min_quality_score',       '75'),
  ('brand_auto_approve_threshold',  '90'),
  ('brand_high_risk_threshold',     '50')
ON CONFLICT (key) DO NOTHING;
