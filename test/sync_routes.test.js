const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadServer(strict, query) {
  const routes = new Map();
  const app = { use() {}, get(url, handler) { routes.set(`GET ${url}`, handler); },
    post(url, handler) { routes.set(`POST ${url}`, handler); }, listen() {} };
  const express = Object.assign(() => app, { json: () => () => {} });
  const client = { query, release() {} };
  const context = {
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === 'express') return express;
      if (name === 'cors') return () => () => {};
      if (name === 'pg') return { Pool: class { async connect() { return client; } async query(...args) { return query(...args); } } };
      return require(name.startsWith('.') ? path.join(__dirname, '..', name) : name);
    },
    process: { env: { DATABASE_URL: 'postgresql://test-only', COMMERCIAL_AUTH_STRICT: String(strict) } },
    console: { log() {}, error() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), context);
  return routes;
}

test('modo LAN transitorio también exige empresa antes de ejecutar un UPSERT', async () => {
  const writes = [];
  const routes = loadServer(false, async (sql, params) => {
    if (sql.startsWith('INSERT INTO productos')) {
      writes.push(params);
      return { rowCount: 1, rows: [{ id: params[0], empresa_id: params[1] }] };
    }
    if (sql.includes('FROM commercial_device_tokens')) return { rowCount: 0, rows: [] };
    if (sql.includes('FROM alepi_devices')) return { rowCount: 1, rows: [{ id: 'legacy-device' }] };
    if (sql.includes('MAX(seq)')) return { rowCount: 1, rows: [{ cursor: '1' }] };
    return { rowCount: 0, rows: [] };
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await routes.get('POST /api/sync/push')({ headers: {}, body: { deviceId: 'legacy-device', changes: [{
    id: 'change-1', entity: 'productos', entityId: 'product-B', payload: { id: 'product-B', empresa_id: 'empresa-B' },
  }] } }, response);
  assert.equal(response.body.ok, false);
  assert.match(response.body.detail, /indicar su empresa/);
  assert.equal(writes.length, 0);
});

test('los recibos se consultan después de bloquear el cambio y sus referencias', async () => {
  const statements = [];
  const routes = loadServer(false, async (sql, params = []) => {
    statements.push({ sql, params });
    if (sql.includes('FROM commercial_device_tokens')) return { rowCount: 0, rows: [] };
    if (sql.includes('FROM alepi_devices')) return { rowCount: 1, rows: [{ id: 'legacy-device' }] };
    if (sql.includes('FROM sync_inbox_receipts')) return { rowCount: 1, rows: [{}] };
    if (sql.includes('MAX(seq)')) return { rowCount: 1, rows: [{ cursor: '0' }] };
    return { rowCount: 0, rows: [] };
  });
  const response = { status() { return this; }, json(body) { this.body = body; return this; } };
  await routes.get('POST /api/sync/push')({ headers: {}, body: { deviceId: 'legacy-device', changes: [{
    id: 'change-1', companyId: 'empresa-A', entity: 'restaurant_comandas', entityId: 'command-1',
    payload: { id: 'command-1', empresa_id: 'empresa-A', venta_id: 'future-sale' },
  }] } }, response);
  const receipt = statements.findIndex((s) => s.sql.includes('FROM sync_inbox_receipts'));
  const locks = statements.map((s, i) => ({ ...s, index: i })).filter((s) => s.sql.includes('pg_advisory_xact_lock'));
  assert.ok(locks.some((s) => s.params[0] === 'change:change-1' && s.index < receipt));
  assert.ok(locks.some((s) => s.params[0] === 'row:ventas:future-sale' && s.index < receipt));
});

test('credencial de usuario compartido llega a todas sus empresas y un reintento no duplica eventos', async () => {
  const logs = [];
  const receipts = new Set();
  const routes = loadServer(false, async (sql, params = []) => {
    if (sql.includes('FROM commercial_device_tokens') || sql.includes('FROM commercial_licenses')) return { rowCount: 0, rows: [] };
    if (sql.includes('FROM alepi_devices') || sql.includes('FROM device_companies') || sql.includes('FROM empresas')) {
      return { rowCount: 1, rows: [{ id: 'legacy-device' }] };
    }
    if (sql.includes('FROM usuario_empresas')) return { rowCount: 2, rows: [{ empresa_id: 'empresa-A' }, { empresa_id: 'empresa-B' }] };
    if (sql.includes('FROM sync_inbox_receipts')) return { rowCount: receipts.has(params[0]) ? 1 : 0, rows: [] };
    if (sql.startsWith('INSERT INTO usuarios')) return { rowCount: 1, rows: [{ id: 'usr-1', credential_hash: 'hash-test' }] };
    if (sql.includes('INSERT INTO sync_change_log')) logs.push(params);
    if (sql.includes('INSERT INTO sync_inbox_receipts')) receipts.add(params[0]);
    if (sql.includes('MAX(seq)')) return { rowCount: 1, rows: [{ cursor: String(logs.length) }] };
    return { rowCount: 0, rows: [] };
  });
  const request = { headers: {}, body: { deviceId: 'legacy-device', changes: [{
    id: 'change-1', companyId: 'empresa-A', entity: 'usuarios', entityId: 'usr-1', payload: { id: 'usr-1', credential_hash: 'hash-test' },
  }] } };
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await routes.get('POST /api/sync/push')(request, response);
  assert.equal(response.body.ok, true);
  assert.deepEqual(logs.map((row) => row[1]).sort(), ['empresa-A', 'empresa-B']);
  await routes.get('POST /api/sync/push')(request, response);
  assert.equal(response.body.ok, true);
  assert.equal(logs.length, 2);
});
