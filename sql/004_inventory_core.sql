BEGIN;

CREATE TABLE IF NOT EXISTS categorias_producto (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS unidades_medida (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  decimales INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sku TEXT,
  codigo_barras TEXT,
  nombre TEXT NOT NULL,
  categoria TEXT,
  categoria_id TEXT REFERENCES categorias_producto(id),
  unidad TEXT NOT NULL DEFAULT 'UND',
  unidad_id TEXT REFERENCES unidades_medida(id),
  precio_venta NUMERIC(16,4) NOT NULL DEFAULT 0,
  costo NUMERIC(16,4) NOT NULL DEFAULT 0,
  foto_base64 TEXT,
  controla_stock BOOLEAN NOT NULL DEFAULT TRUE,
  controla_vencimiento BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  eliminado_en TIMESTAMPTZ,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_productos_empresa_nombre ON productos(empresa_id, activo, nombre);
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_empresa_barcode
  ON productos(empresa_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL AND codigo_barras <> '';

CREATE TABLE IF NOT EXISTS inventario_saldos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cantidad NUMERIC(18,4) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(18,4) NOT NULL DEFAULT 0,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (sucursal_id, producto_id)
);

CREATE TABLE IF NOT EXISTS lotes_producto (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  numero_lote TEXT NOT NULL,
  fecha_vencimiento DATE,
  cantidad NUMERIC(18,4) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (sucursal_id, producto_id, numero_lote, fecha_vencimiento)
);
CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento ON lotes_producto(empresa_id, sucursal_id, fecha_vencimiento);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  cantidad NUMERIC(18,4) NOT NULL,
  referencia_tipo TEXT,
  referencia_id TEXT,
  observacion TEXT,
  usuario_id TEXT REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_fecha ON movimientos_inventario(empresa_id, sucursal_id, creado_en DESC);

INSERT INTO system_meta(key, value)
VALUES ('schema_version', '4')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;
