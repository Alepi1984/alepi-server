const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { assertChangeOwnership, lockSyncChanges } = require('../company_ownership');
const { publishSyncChange } = require('../sync_publication');

// Opt-in only. Test fixtures always ROLLBACK; no real business rows are updated.
const enabled = process.env.ALEPI_TEST_POSTGRES === '1';
if (enabled) require('dotenv').config({ quiet: true });
function client() {
  return new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, query_timeout: 5000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_INSECURE_DEV !== 'true' } : false });
}

test('PostgreSQL real: referencias y publicación del usuario compartido en transacción reversible', { skip: !enabled }, async () => {
  const db = client();
  await db.connect();
  try {
    await db.query('BEGIN');
    const user = randomUUID();
    const companies = [randomUUID(), randomUUID()];
    const branches = [randomUUID(), randomUUID()];
    const products = [randomUUID(), randomUUID()];
    await db.query(`INSERT INTO usuarios(id,usuario,nombre,creado_en,actualizado_en)
      VALUES ($1,$2,'TEST MULTIEMPRESA',NOW(),NOW())`, [user, `test-${user}`]);
    for (let i = 0; i < 2; i++) {
      await db.query(`INSERT INTO empresas(id,nombre_comercial,rubro,creado_en,actualizado_en)
        VALUES ($1,'TEST MULTIEMPRESA','COMERCIO',NOW(),NOW())`, [companies[i]]);
      await db.query(`INSERT INTO sucursales(id,empresa_id,codigo,nombre,creado_en,actualizado_en)
        VALUES ($1,$2,'TEST','TEST',NOW(),NOW())`, [branches[i], companies[i]]);
      await db.query(`INSERT INTO usuario_empresas(id,usuario_id,empresa_id,sucursal_id,rol_codigo,creado_en,actualizado_en)
        VALUES ($1,$2,$3,$4,'ADMIN',NOW(),NOW())`, [randomUUID(), user, companies[i], branches[i]]);
      await db.query(`INSERT INTO productos(id,empresa_id,nombre,creado_en,actualizado_en)
        VALUES ($1,$2,'TEST',NOW(),NOW())`, [products[i], companies[i]]);
    }
    const payload = { id: randomUUID(), empresa_id: companies[0], sucursal_id: branches[0], producto_id: products[0] };
    await assertChangeOwnership(db, 'inventario_saldos', payload.id, companies[0], payload);
    await assert.rejects(assertChangeOwnership(db, 'inventario_saldos', payload.id, companies[0],
      { ...payload, producto_id: products[1] }), /otra empresa/);
    await assert.rejects(assertChangeOwnership(db, 'inventario_saldos', payload.id, companies[0],
      { ...payload, sucursal_id: branches[1] }), /otra empresa/);
    const futureSale = randomUUID();
    await db.query(`INSERT INTO restaurant_comandas(id,empresa_id,sucursal_id,mozo_id,numero,venta_id,abierta_en,creado_en,actualizado_en)
      VALUES ($1,$2,$3,$4,'TEST',$5,NOW(),NOW(),NOW())`, [randomUUID(), companies[0], branches[0], user, futureSale]);
    await assert.rejects(assertChangeOwnership(db, 'ventas', futureSale, companies[1],
      { id: futureSale, empresa_id: companies[1], sucursal_id: branches[1] }), /otra empresa/);
    await publishSyncChange(db, { changeId: randomUUID(), companyId: companies[0], entity: 'usuarios',
      entityId: user, operation: 'UPSERT', payload: { id: user, credential_hash: 'TEST_ONLY' }, deviceId: randomUUID() });
    const events = await db.query('SELECT empresa_id FROM sync_change_log WHERE entidad=$1 AND entidad_id=$2', ['usuarios', user]);
    assert.deepEqual(events.rows.map((r) => r.empresa_id).sort(), companies.slice().sort());
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});

for (const retry of [true, false]) {
  test(`PostgreSQL real: serializa ${retry ? 'reintentos del mismo cambio' : 'referencias circulares simultáneas'}`, { skip: !enabled }, async () => {
    const a = client();
    const b = client();
    await Promise.all([a.connect(), b.connect()]);
    try {
      await Promise.all([a.query('BEGIN'), b.query('BEGIN')]);
      const change = randomUUID();
      const future = randomUUID();
      await lockSyncChanges(a, [{ id: change, entity: 'restaurant_comandas', entityId: randomUUID(), payload: { venta_id: future } }]);
      let acquired = false;
      const waiting = lockSyncChanges(b, [{ id: retry ? change : randomUUID(), entity: 'ventas',
        entityId: retry ? randomUUID() : future, payload: {} }]).then(() => { acquired = true; });
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(acquired, false);
      await a.query('ROLLBACK');
      await waiting;
      assert.equal(acquired, true);
    } finally {
      await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
      await Promise.all([a.end(), b.end()]);
    }
  });
}
