BEGIN;

CREATE TABLE IF NOT EXISTS device_companies (
  device_id TEXT NOT NULL REFERENCES alepi_devices(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, company_id)
);

CREATE TABLE IF NOT EXISTS sync_inbox_receipts (
  change_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_pair_codes (
  code TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  created_by_device_id TEXT NOT NULL REFERENCES alepi_devices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_device_id TEXT REFERENCES alepi_devices(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_pair_codes_company ON device_pair_codes(company_id, status, expires_at);

ALTER TABLE sync_change_log ADD COLUMN IF NOT EXISTS change_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_change_log_change_id
  ON sync_change_log(change_id);

INSERT INTO system_meta(key, value)
VALUES ('schema_version', '2')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;
