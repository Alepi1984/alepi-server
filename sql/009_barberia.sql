CREATE TABLE IF NOT EXISTS barberia_profesionales (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  alias TEXT,
  estado TEXT NOT NULL DEFAULT 'LIBRE',
  comision_pct NUMERIC(5,2) DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barberia_servicios (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  precio NUMERIC(12,2) NOT NULL DEFAULT 0,
  duracion_min INT NOT NULL DEFAULT 30,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barberia_turnos (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  sucursal_id TEXT REFERENCES sucursales(id),
  profesional_id TEXT REFERENCES barberia_profesionales(id),
  servicio_id TEXT REFERENCES barberia_servicios(id),
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT,
  numero_turno INT NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'EN_ESPERA',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inicio_atencion TIMESTAMPTZ,
  fin_atencion TIMESTAMPTZ
);
