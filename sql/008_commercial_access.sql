BEGIN;

CREATE TABLE IF NOT EXISTS commercial_licenses (
  company_id TEXT PRIMARY KEY,
  business_label TEXT NOT NULL,
  max_devices INTEGER NOT NULL CHECK (max_devices BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL,
  primary_device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commercial_activation_codes (
  code_hash TEXT PRIMARY KEY,
  business_label TEXT NOT NULL,
  max_devices INTEGER NOT NULL CHECK (max_devices BETWEEN 1 AND 100),
  license_expires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_device_id TEXT,
  company_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commercial_activation_unused
  ON commercial_activation_codes(expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS commercial_device_tokens (
  device_id TEXT PRIMARY KEY REFERENCES alepi_devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

INSERT INTO system_meta(key,value)
VALUES ('schema_version','8')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW();

COMMIT;
