CREATE TABLE IF NOT EXISTS hotel_habitaciones (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'SIMPLE',
  precio_noche NUMERIC(12,2) NOT NULL DEFAULT 60.00,
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE',
  huesped_actual TEXT,
  huesped_documento TEXT,
  pin_estadia TEXT,
  token_estadia TEXT,
  noches INT DEFAULT 1,
  checkin_en TIMESTAMPTZ,
  checkout_estimado TIMESTAMPTZ,
  total_consumos NUMERIC(12,2) DEFAULT 0.00,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hotel_pedidos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  habitacion_numero TEXT NOT NULL,
  huesped_nombre TEXT,
  detalle TEXT NOT NULL,
  monto_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atendido_en TIMESTAMPTZ
);
