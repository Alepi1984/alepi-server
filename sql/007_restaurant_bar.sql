BEGIN;

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comanda_id TEXT;

CREATE TABLE IF NOT EXISTS restaurant_mesas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  zona TEXT,
  capacidad INTEGER NOT NULL DEFAULT 4,
  estado TEXT NOT NULL DEFAULT 'LIBRE',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (sucursal_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_mesas_estado
  ON restaurant_mesas(empresa_id, sucursal_id, activo, estado);

CREATE TABLE IF NOT EXISTS restaurant_comandas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  mesa_id TEXT REFERENCES restaurant_mesas(id),
  mozo_id TEXT NOT NULL REFERENCES usuarios(id),
  numero TEXT NOT NULL,
  tipo_servicio TEXT NOT NULL DEFAULT 'MESA',
  cliente_nombre TEXT,
  personas INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  subtotal NUMERIC(16,4) NOT NULL DEFAULT 0,
  descuento NUMERIC(16,4) NOT NULL DEFAULT 0,
  total NUMERIC(16,4) NOT NULL DEFAULT 0,
  observacion TEXT,
  venta_id TEXT,
  abierta_en TIMESTAMPTZ NOT NULL,
  cerrada_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_restaurant_comandas_estado
  ON restaurant_comandas(empresa_id, sucursal_id, estado, abierta_en DESC);

CREATE TABLE IF NOT EXISTS restaurant_comanda_detalle (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  comanda_id TEXT NOT NULL REFERENCES restaurant_comandas(id) ON DELETE CASCADE,
  producto_id TEXT NOT NULL REFERENCES productos(id),
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(18,4) NOT NULL,
  precio_unitario NUMERIC(16,4) NOT NULL,
  costo_unitario NUMERIC(16,4) NOT NULL DEFAULT 0,
  total NUMERIC(16,4) NOT NULL,
  area_preparacion TEXT NOT NULL DEFAULT 'COCINA',
  nota TEXT,
  estado TEXT NOT NULL DEFAULT 'BORRADOR',
  enviado_en TIMESTAMPTZ,
  preparado_en TIMESTAMPTZ,
  entregado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_restaurant_comanda_detalle_estado
  ON restaurant_comanda_detalle(empresa_id, sucursal_id, area_preparacion, estado, enviado_en);
CREATE INDEX IF NOT EXISTS idx_restaurant_comanda_detalle_comanda
  ON restaurant_comanda_detalle(comanda_id, creado_en);

INSERT INTO system_meta(key, value)
VALUES ('schema_version', '7')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;
