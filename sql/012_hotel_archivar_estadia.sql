-- Migración 012: Archivar pedidos y mensajes al finalizar estadía
ALTER TABLE hotel_mensajes ADD COLUMN IF NOT EXISTS archivado BOOLEAN DEFAULT false;
ALTER TABLE hotel_mensajes ADD COLUMN IF NOT EXISTS token_estadia TEXT;

ALTER TABLE hotel_pedidos ADD COLUMN IF NOT EXISTS token_estadia TEXT;

CREATE INDEX IF NOT EXISTS idx_hotel_mensajes_activo ON hotel_mensajes(empresa_id, habitacion_numero, archivado);
CREATE INDEX IF NOT EXISTS idx_hotel_pedidos_estado ON hotel_pedidos(empresa_id, habitacion_numero, estado);
