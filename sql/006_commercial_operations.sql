BEGIN;

CREATE TABLE IF NOT EXISTS cajas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  usuario_apertura_id TEXT NOT NULL REFERENCES usuarios(id),
  usuario_cierre_id TEXT REFERENCES usuarios(id),
  apertura_en TIMESTAMPTZ NOT NULL,
  cierre_en TIMESTAMPTZ,
  saldo_inicial NUMERIC(16,4) NOT NULL DEFAULT 0,
  saldo_final NUMERIC(16,4),
  saldo_esperado NUMERIC(16,4),
  diferencia NUMERIC(16,4),
  observacion_apertura TEXT,
  observacion_cierre TEXT,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cajas_empresa_sucursal_estado
  ON cajas(empresa_id, sucursal_id, estado, apertura_en DESC);

ALTER TABLE cajas ADD COLUMN IF NOT EXISTS saldo_esperado NUMERIC(16,4);
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS diferencia NUMERIC(16,4);
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS observacion_apertura TEXT;
ALTER TABLE cajas ADD COLUMN IF NOT EXISTS observacion_cierre TEXT;

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo_documento TEXT,
  numero_documento TEXT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  limite_credito NUMERIC(16,4) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  eliminado_en TIMESTAMPTZ,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, numero_documento)
);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nombre ON clientes(empresa_id, activo, nombre);

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id TEXT REFERENCES clientes(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo_venta TEXT NOT NULL DEFAULT 'CONTADO';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS efectivo_recibido NUMERIC(16,4);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS vuelto NUMERIC(16,4);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS observacion TEXT;

ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(16,4) NOT NULL DEFAULT 0;
ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS descuento NUMERIC(16,4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  caja_id TEXT NOT NULL REFERENCES cajas(id) ON DELETE CASCADE,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  metodo TEXT NOT NULL DEFAULT 'EFECTIVO',
  monto NUMERIC(16,4) NOT NULL,
  concepto TEXT NOT NULL,
  referencia_tipo TEXT,
  referencia_id TEXT,
  creado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_fecha
  ON movimientos_caja(empresa_id, sucursal_id, caja_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS cuentas_cobrar (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  cliente_id TEXT NOT NULL REFERENCES clientes(id),
  venta_id TEXT NOT NULL UNIQUE REFERENCES ventas(id),
  monto_original NUMERIC(16,4) NOT NULL,
  saldo NUMERIC(16,4) NOT NULL,
  fecha_vencimiento DATE,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  observacion TEXT,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_cliente
  ON cuentas_cobrar(empresa_id, cliente_id, estado, creado_en DESC);

CREATE TABLE IF NOT EXISTS abonos_cliente (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  cuenta_id TEXT NOT NULL REFERENCES cuentas_cobrar(id) ON DELETE CASCADE,
  cliente_id TEXT NOT NULL REFERENCES clientes(id),
  caja_id TEXT NOT NULL REFERENCES cajas(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  metodo TEXT NOT NULL,
  monto NUMERIC(16,4) NOT NULL,
  referencia TEXT,
  creado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_abonos_cliente_fecha
  ON abonos_cliente(empresa_id, cliente_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS proveedores (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_documento TEXT,
  razon_social TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  direccion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  eliminado_en TIMESTAMPTZ,
  version_server BIGINT NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, numero_documento)
);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa_nombre ON proveedores(empresa_id, activo, razon_social);

CREATE TABLE IF NOT EXISTS compras (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sucursal_id TEXT NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  proveedor_id TEXT REFERENCES proveedores(id),
  caja_id TEXT REFERENCES cajas(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL,
  tipo_documento TEXT,
  numero_documento TEXT,
  tipo_pago TEXT NOT NULL DEFAULT 'CONTADO',
  metodo_pago TEXT,
  subtotal NUMERIC(16,4) NOT NULL DEFAULT 0,
  total NUMERIC(16,4) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'REGISTRADA',
  observacion TEXT,
  creado_en TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(empresa_id, sucursal_id, fecha DESC);

CREATE TABLE IF NOT EXISTS compra_detalle (
  id TEXT PRIMARY KEY,
  compra_id TEXT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id TEXT NOT NULL REFERENCES productos(id),
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(18,4) NOT NULL,
  costo_unitario NUMERIC(16,4) NOT NULL,
  total NUMERIC(16,4) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL,
  version_server BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_compra_detalle_compra ON compra_detalle(compra_id);

INSERT INTO system_meta(key, value)
VALUES ('schema_version', '6')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

COMMIT;
