-- Cascades Luxury AI System — Supabase PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor

-- ── Tasks / Queue Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      TEXT,
  skill       TEXT NOT NULL,
  action      TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',   -- pending, completed, failed, escalated
  priority    INT DEFAULT 10,
  escalated   BOOLEAN DEFAULT FALSE,
  duration_ms INT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX ON task_log (skill, created_at DESC);
CREATE INDEX ON task_log (escalated) WHERE escalated = TRUE;

-- ── Brand Guidelines Version Control ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_guidelines_history (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version   TEXT NOT NULL,
  content   JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Escalations (requires human review) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,       -- brand_review, customer_service, api_failure
  skill           TEXT,
  job_id          TEXT,
  payload         JSONB,
  reason          TEXT,
  resolved        BOOLEAN DEFAULT FALSE,
  human_note      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX ON escalations (resolved, created_at DESC);

-- ── Scheduled Content Calendar ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_schedule (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  content       TEXT,
  status        TEXT DEFAULT 'scheduled',  -- scheduled, posted, failed, cancelled
  mongo_ref     TEXT,   -- reference to MongoDB content document
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  posted_at     TIMESTAMPTZ
);

CREATE INDEX ON content_schedule (platform, scheduled_at);
CREATE INDEX ON content_schedule (status, scheduled_at);

-- ── Email Campaign Tracking ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailchimp_id    TEXT,
  subject         TEXT,
  segment         TEXT,
  status          TEXT DEFAULT 'draft',
  send_at         TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  open_rate       NUMERIC(5,2),
  click_rate      NUMERIC(5,2),
  revenue_ngn     NUMERIC(12,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── FAQ Knowledge Base ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faq (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  category    TEXT,
  hit_count   INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── System Metrics (daily rollup — time-series) ───────────────────────────────
CREATE TABLE IF NOT EXISTS daily_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date   DATE NOT NULL,
  channel       TEXT NOT NULL,
  metric_key    TEXT NOT NULL,
  value         NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(metric_date, channel, metric_key)
);

CREATE INDEX ON daily_metrics (metric_date DESC, channel);
