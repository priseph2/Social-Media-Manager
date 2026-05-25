-- 009: Admin panel enhancements – audit log, tenant notes, IP blocklist

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    JSONB       DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx     ON admin_audit_log(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS tenant_notes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  note       TEXT        NOT NULL,
  created_by TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tenant_notes_tenant_id_idx ON tenant_notes(tenant_id);

CREATE TABLE IF NOT EXISTS ip_blocklist (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  value      TEXT        NOT NULL UNIQUE,
  type       TEXT        NOT NULL DEFAULT 'ip' CHECK (type IN ('ip','domain','email')),
  reason     TEXT,
  created_by TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only – audit"     ON admin_audit_log USING (false);
ALTER TABLE tenant_notes     ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only – notes"     ON tenant_notes     USING (false);
ALTER TABLE ip_blocklist     ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only – blocklist" ON ip_blocklist     USING (false);
