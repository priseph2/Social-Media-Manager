-- 010: Per-tenant notification inbox

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL DEFAULT 'info',
  title      TEXT        NOT NULL,
  body       TEXT,
  link       TEXT,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_tenant_unread_idx
  ON notifications (tenant_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant sees own notifications"
  ON notifications USING (
    tenant_id = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );
