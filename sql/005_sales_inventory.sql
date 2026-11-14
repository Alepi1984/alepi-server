BEGIN;

CREATE TABLE IF NOT EXISTS ventas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  caja_id TEXT,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(16,4) NOT NULL DEFAULT 0,
  descuento NUMERIC(16,4) NOT NULL DEFAULT 0,
  total NUMERIC(16,4) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'COMPLETADA',
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_sucursal_fecha
  ON ventas(empresa_id, sucursal_id, fecha DESC);

CREATE TABLE IF NOT EXISTS venta_detalle (
  id TEXT PRIMARY KEY,
  venta_id TEXT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id TEXT REFERENCES productos(id),
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(18,4) NOT NULL,
  precio_unitario NUMERIC(16,4) NOT NULL,
  total NUMERIC(16,4) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta ON venta_detalle(venta_id);

CREATE TABLE IF NOT EXISTS pagos (
  id TEXT PRIMARY KEY,
  venta_id TEXT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL,
  monto NUMERIC(16,4) NOT NULL,
  referencia TEXT,
  creado_en TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);

INSERT INTO system_meta(key, value)
VALUES ('schema_version', '5')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;
