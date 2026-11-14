// Uso exclusivo del operador en la PC que tiene DATABASE_URL.
// node owner_license_cli.js emitir "Mi Bodega" 2 365
require('dotenv').config();
const { Pool } = require('pg');
const { createActivationCode, hashActivationCode } = require('./commercial_access');

const [action, business, devicesRaw, daysRaw] = process.argv.slice(2);
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en server/.env.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_INSECURE_DEV !== 'true' } : false });

async function main() {
  if (action === 'emitir') {
    const devices = Number(devicesRaw);
    const days = Number(daysRaw);
    if (!business?.trim() || !Number.isInteger(devices) || devices < 1 || devices > 100 ||
        !Number.isInteger(days) || days < 1 || days > 3650) {
      throw new Error('Uso: node owner_license_cli.js emitir "Nombre de negocio" NUM_DISPOSITIVOS DIAS');
    }
    const licenseEnd = new Date(Date.now() + days * 86400000);
    const codeEnd = new Date(Date.now() + 48 * 3600000);
    let code;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = createActivationCode();
      try {
        await pool.query(
          `INSERT INTO commercial_activation_codes
           (code_hash,business_label,max_devices,license_expires_at,expires_at)
           VALUES($1,$2,$3,$4,$5)`,
          [hashActivationCode(code), business.trim(), devices, licenseEnd, codeEnd],
        );
        console.log(`Empresa: ${business.trim()}\nCodigo de activacion: ${code}\nDispositivos: ${devices}\nCanjear antes de: ${codeEnd.toISOString()}\nLicencia hasta: ${licenseEnd.toISOString()}`);
        return;
      } catch (error) {
        if (error.code !== '23505') throw error;
      }
    }
    throw new Error('No se pudo generar un codigo unico.');
  }
  if (action === 'renovar') {
    const days = Number(devicesRaw);
    if (!business || !Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Uso: node owner_license_cli.js renovar ID_EMPRESA DIAS');
    const result = await pool.query(
      `UPDATE commercial_licenses SET status='ACTIVE',
       expires_at=GREATEST(NOW(),expires_at)+($2::int * INTERVAL '1 day'),updated_at=NOW()
       WHERE company_id=$1 RETURNING company_id,expires_at`, [business, days],
    );
    if (!result.rowCount) throw new Error('No se encontro la licencia de esa empresa.');
    console.log(`Renovada ${business} hasta ${result.rows[0].expires_at.toISOString()}`);
    return;
  }
  if (action === 'revocar') {
    if (!business) throw new Error('Uso: node owner_license_cli.js revocar ID_EMPRESA');
    const result = await pool.query(
      "UPDATE commercial_licenses SET status='REVOKED',updated_at=NOW() WHERE company_id=$1 RETURNING company_id", [business],
    );
    if (!result.rowCount) throw new Error('No se encontro la licencia de esa empresa.');
    console.log(`Licencia revocada para ${business}`);
    return;
  }
  if (action === 'listar') {
    const rows = await pool.query(
      `SELECT e.id,e.nombre_comercial,l.status,l.expires_at,l.max_devices,
       (SELECT COUNT(*)::int FROM device_companies dc WHERE dc.company_id=e.id) AS linked_devices
       FROM empresas e LEFT JOIN commercial_licenses l ON l.company_id=e.id ORDER BY e.nombre_comercial`,
    );
    for (const row of rows.rows) {
      console.log(`${row.id} | ${row.nombre_comercial} | ${row.status || 'SIN LICENCIA'} | ${row.linked_devices} dispositivo(s) | ${row.expires_at || ''}`);
    }
    return;
  }
  if (action === 'verificar') {
    const missing = await pool.query(
      `SELECT e.nombre_comercial,dc.device_id,
       CASE WHEN dc.device_id IS NULL THEN 'EMPRESA SIN DISPOSITIVO VINCULADO'
            WHEN l.company_id IS NULL THEN 'SIN LICENCIA'
            WHEN l.status <> 'ACTIVE' OR l.expires_at <= NOW() THEN 'LICENCIA VENCIDA/REVOCADA'
            WHEN dc_count.total > l.max_devices THEN 'EXCESO DE DISPOSITIVOS'
            WHEN t.device_id IS NULL THEN 'DISPOSITIVO SIN TOKEN'
            ELSE 'OK' END AS reason
       FROM empresas e
       LEFT JOIN device_companies dc ON dc.company_id=e.id
       LEFT JOIN commercial_licenses l ON l.company_id=e.id
       LEFT JOIN commercial_device_tokens t ON t.device_id=dc.device_id AND t.revoked_at IS NULL
       JOIN LATERAL (SELECT COUNT(*)::int AS total FROM device_companies x WHERE x.company_id=e.id) dc_count ON TRUE
       WHERE dc.device_id IS NULL OR l.company_id IS NULL OR l.status <> 'ACTIVE' OR l.expires_at <= NOW()
          OR dc_count.total > l.max_devices OR t.device_id IS NULL`,
    );
    if (missing.rowCount) {
      for (const row of missing.rows) console.error(`${row.nombre_comercial} / ${row.device_id}: ${row.reason}`);
      throw new Error('Aun quedan dispositivos o empresas sin activacion. No habilites COMMERCIAL_AUTH_STRICT.');
    }
    console.log('[OK] Todas las empresas vinculadas tienen licencia y todos sus dispositivos tienen token.');
    return;
  }
  throw new Error('Comandos: emitir, renovar, revocar, listar, verificar.');
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message}`);
  process.exitCode = 1;
}).finally(async () => pool.end());
