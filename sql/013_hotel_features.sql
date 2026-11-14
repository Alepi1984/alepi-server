-- Migración 013: Mejoras integrales de hotelería
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS monto_adelanto NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS metodo_adelanto TEXT DEFAULT 'EFECTIVO';
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS modalidad TEXT DEFAULT 'NOCHE';
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS horas INT DEFAULT 0;
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS nacionalidad TEXT;
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS ciudad_origen TEXT;

CREATE TABLE IF NOT EXISTS hotel_historial_estadias (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  habitacion_numero TEXT NOT NULL,
  huesped_nombre TEXT NOT NULL,
  huesped_documento TEXT,
  nacionalidad TEXT,
  ciudad_origen TEXT,
  modalidad TEXT DEFAULT 'NOCHE',
  noches INT DEFAULT 1,
  horas INT DEFAULT 0,
  precio_hospedaje NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_consumos NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  monto_adelanto NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  monto_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  metodo_pago TEXT,
  checkin_en TIMESTAMPTZ NOT NULL,
  checkout_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
