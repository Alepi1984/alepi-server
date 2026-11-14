-- Migración 011: Tabla de mensajes / chat en vivo para Hotel
CREATE TABLE IF NOT EXISTS hotel_mensajes (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  habitacion_numero TEXT NOT NULL,
  remitente TEXT NOT NULL, -- 'HUESPED' o 'RECEPCION'
  huesped_nombre TEXT,
  mensaje TEXT NOT NULL,
  leido BOOLEAN DEFAULT false,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_mensajes_empresa_hab 
  ON hotel_mensajes(empresa_id, habitacion_numero, creado_en);
