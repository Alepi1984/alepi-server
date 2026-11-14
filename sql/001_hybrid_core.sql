BEGIN;

CREATE TABLE IF NOT EXISTS system_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alepi_devices (
  id TEXT PRIMARY KEY,
  device_code TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'ANDROID',
  app_version TEXT,
  label TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,
  nombre_comercial TEXT NOT NULL,
  razon_social TEXT,
  ruc TEXT,
  rubro TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  eliminado_en TIMESTAMPTZ,
  version_server BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sucursales (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  direccion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  eliminado_en TIMESTAMPTZ,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  credential_hash TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  eliminado_en TIMESTAMPTZ,
  version_server BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS usuario_empresas (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  sucursal_id TEXT REFERENCES sucursales(id),
  rol_codigo TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (usuario_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS configuracion_empresa (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  clave TEXT NOT NULL,
  valor TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, clave)
);

CREATE TABLE IF NOT EXISTS modulos_empresa (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  modulo TEXT NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, modulo)
);

CREATE TABLE IF NOT EXISTS rol_permisos_empresa (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  rol_codigo TEXT NOT NULL,
  permiso_codigo TEXT NOT NULL,
  permitido BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, rol_codigo, permiso_codigo)
);

CREATE TABLE IF NOT EXISTS sync_change_log (
  seq BIGSERIAL PRIMARY KEY,
  empresa_id TEXT,
  entidad TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  operacion TEXT NOT NULL,
  payload JSONB NOT NULL,
  origin_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_change_log_empresa_seq ON sync_change_log(empresa_id, seq);

INSERT INTO system_meta(key, value)
VALUES ('schema_version', '1'), ('architecture', 'OFFLINE_FIRST_HYBRID')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;
