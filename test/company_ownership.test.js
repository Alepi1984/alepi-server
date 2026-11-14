const test = require('node:test');
const assert = require('node:assert/strict');
const { assertChangeOwnership } = require('../company_ownership');

function clientFor(rows) {
  return { query: async (sql, [id]) => {
    const table = sql.match(/\bFROM\s+(\w+)/i)?.[1];
    const result = rows[`${table}:${id}`] || [];
    return { rows: result, rowCount: result.length };
  } };
}

test('acepta producto propio y rechaza empresa ajena en cuerpo o fila existente', async () => {
  const own = { id: 'prod-1', empresa_id: 'empresa-A' };
  await assertChangeOwnership(clientFor({}), 'productos', 'prod-1', 'empresa-A', own);
  await assert.rejects(assertChangeOwnership(clientFor({}), 'productos', 'prod-1', 'empresa-A',
    { ...own, empresa_id: 'empresa-B' }), /otra empresa/);
  await assert.rejects(assertChangeOwnership(clientFor({ 'productos:prod-1': [{ empresa_id: 'empresa-B' }] }),
    'productos', 'prod-1', 'empresa-A', own), /otra empresa/);
});

test('rechaza detalle que apunta a venta de otra empresa', async () => {
  const detail = { id: 'detalle-1', venta_id: 'venta-B' };
  await assert.rejects(assertChangeOwnership(clientFor({ 'ventas:venta-B': [{ empresa_id: 'empresa-B' }] }),
    'venta_detalle', 'detalle-1', 'empresa-A', detail), /otra empresa/);
  await assertChangeOwnership(clientFor({ 'ventas:venta-B': [{ empresa_id: 'empresa-A' }] }),
    'venta_detalle', 'detalle-1', 'empresa-A', detail);
});

test('evita apropiarse de usuarios y cambios con id inconsistente', async () => {
  const client = clientFor({ 'usuario_empresas:usr-1': [{ empresa_id: 'empresa-B' }] });
  await assert.rejects(assertChangeOwnership(client, 'usuarios', 'usr-1', 'empresa-A', { id: 'usr-1' }), /otra empresa/);
  await assert.rejects(assertChangeOwnership(client, 'empresas', 'empresa-A', 'empresa-A', { id: 'empresa-B' }), /inválido/);
});

const references = {
  usuario_empresas: { sucursal_id: 'sucursales' },
  productos: { categoria_id: 'categorias_producto', unidad_id: 'unidades_medida' },
  inventario_saldos: { sucursal_id: 'sucursales', producto_id: 'productos' },
  lotes_producto: { sucursal_id: 'sucursales', producto_id: 'productos' },
  movimientos_inventario: { sucursal_id: 'sucursales', producto_id: 'productos' },
  restaurant_mesas: { sucursal_id: 'sucursales' },
  restaurant_comandas: { sucursal_id: 'sucursales', mesa_id: 'restaurant_mesas', venta_id: 'ventas' },
  restaurant_comanda_detalle: { sucursal_id: 'sucursales', comanda_id: 'restaurant_comandas', producto_id: 'productos' },
  cajas: { sucursal_id: 'sucursales' },
  movimientos_caja: { sucursal_id: 'sucursales', caja_id: 'cajas' },
  cuentas_cobrar: { sucursal_id: 'sucursales', cliente_id: 'clientes', venta_id: 'ventas' },
  abonos_cliente: { sucursal_id: 'sucursales', cuenta_id: 'cuentas_cobrar', cliente_id: 'clientes', caja_id: 'cajas' },
  compras: { sucursal_id: 'sucursales', proveedor_id: 'proveedores', caja_id: 'cajas' },
  ventas: { sucursal_id: 'sucursales', caja_id: 'cajas', cliente_id: 'clientes', comanda_id: 'restaurant_comandas' },
  venta_detalle: { producto_id: 'productos' },
  compra_detalle: { producto_id: 'productos' },
};

function fixture(entity, fields) {
  const payload = { id: 'row-1', empresa_id: 'empresa-A' };
  const rows = {};
  if (entity === 'venta_detalle') {
    payload.venta_id = 'venta-1';
    rows['ventas:venta-1'] = [{ empresa_id: 'empresa-A' }];
  }
  if (entity === 'compra_detalle') {
    payload.compra_id = 'compra-1';
    rows['compras:compra-1'] = [{ empresa_id: 'empresa-A' }];
  }
  for (const [field, table] of Object.entries(fields)) {
    payload[field] = `${field}-1`;
    rows[`${table}:${payload[field]}`] = [{ empresa_id: 'empresa-A', sucursal_id: payload.sucursal_id }];
  }
  return { payload, rows };
}

for (const [entity, fields] of Object.entries(references)) {
  test(`${entity}: acepta referencias propias y rechaza referencias a otra empresa`, async () => {
    const { payload, rows } = fixture(entity, fields);
    await assertChangeOwnership(clientFor(rows), entity, payload.id, 'empresa-A', payload);
    for (const [field, table] of Object.entries(fields)) {
      const foreignRows = { ...rows, [`${table}:${payload[field]}`]: [{ empresa_id: 'empresa-B' }] };
      await assert.rejects(
        assertChangeOwnership(clientFor(foreignRows), entity, payload.id, 'empresa-A', payload),
        /otra empresa/, `Debe rechazar ${entity}.${field}`,
      );
    }
  });
}

test('rechaza referencias inexistentes sin confundirlas con campos opcionales nulos', async () => {
  await assert.rejects(assertChangeOwnership(clientFor({}), 'productos', 'prod-1', 'empresa-A',
    { id: 'prod-1', empresa_id: 'empresa-A', categoria_id: 'no-existe' }), /no existe/);
  await assertChangeOwnership(clientFor({}), 'productos', 'prod-1', 'empresa-A',
    { id: 'prod-1', empresa_id: 'empresa-A', categoria_id: null, unidad_id: null });
});

test('rechaza una caja o mesa de otra sucursal de la misma empresa', async () => {
  for (const [entity, field, table] of [['ventas', 'caja_id', 'cajas'], ['restaurant_comandas', 'mesa_id', 'restaurant_mesas']]) {
    const payload = { id: 'row-1', empresa_id: 'empresa-A', sucursal_id: 'sucursal-1', [field]: 'ref-1' };
    await assert.rejects(assertChangeOwnership(clientFor({
      'sucursales:sucursal-1': [{ empresa_id: 'empresa-A' }],
      [`${table}:ref-1`]: [{ empresa_id: 'empresa-A', sucursal_id: 'sucursal-2' }],
    }), entity, payload.id, 'empresa-A', payload), /otra sucursal/);
  }
});

test('usuarios de operaciones deben pertenecer a la empresa aunque su id sea global', async () => {
  const fields = { cajas: ['usuario_apertura_id', 'usuario_cierre_id'], ventas: ['usuario_id'],
    compras: ['usuario_id'], movimientos_caja: ['usuario_id'], abonos_cliente: ['usuario_id'],
    movimientos_inventario: ['usuario_id'], restaurant_comandas: ['mozo_id'] };
  for (const [entity, users] of Object.entries(fields)) {
    for (const field of users) {
      const payload = { id: 'row-1', empresa_id: 'empresa-A', [field]: 'usr-1' };
      await assert.rejects(assertChangeOwnership(clientFor({
        'usuario_empresas:usr-1': [{ empresa_id: 'empresa-B' }],
      }), entity, payload.id, 'empresa-A', payload), /otra empresa/);
      await assertChangeOwnership(clientFor({
        'usuario_empresas:usr-1': [{ empresa_id: 'empresa-A' }],
      }), entity, payload.id, 'empresa-A', payload);
    }
  }
});

test('referencias circulares restaurante/venta permiten llegar por separado pero no cruzar empresas', async () => {
  await assertChangeOwnership(clientFor({}), 'restaurant_comandas', 'row-1', 'empresa-A',
    { id: 'row-1', empresa_id: 'empresa-A', venta_id: 'venta-futura' });
  await assertChangeOwnership(clientFor({}), 'ventas', 'row-1', 'empresa-A',
    { id: 'row-1', empresa_id: 'empresa-A', comanda_id: 'comanda-futura' });
});

test('vincular usuario compartido exige acceso comprobado a una empresa de origen', async () => {
  const client = clientFor({ 'usuario_empresas:usr-1': [{ empresa_id: 'empresa-B' }] });
  const payload = { id: 'membership-1', empresa_id: 'empresa-A', usuario_id: 'usr-1' };
  await assert.rejects(assertChangeOwnership(client, 'usuario_empresas', payload.id, 'empresa-A', payload), /no pertenece/);
  await assert.rejects(assertChangeOwnership(client, 'usuario_empresas', payload.id, 'empresa-A', payload,
    { canAccessCompany: async () => false }), /no pertenece/);
  const checked = [];
  await assertChangeOwnership(client, 'usuario_empresas', payload.id, 'empresa-A', payload,
    { canAccessCompany: async (id) => { checked.push(id); return id === 'empresa-B'; } });
  assert.deepEqual(checked, ['empresa-B']);
});

test('usuario compartido puede sincronizarse antes de su nueva membresía solo con acceso al origen', async () => {
  const client = clientFor({ 'usuario_empresas:usr-1': [{ empresa_id: 'empresa-B' }] });
  await assert.rejects(assertChangeOwnership(client, 'usuarios', 'usr-1', 'empresa-A', { id: 'usr-1' }), /otra empresa/);
  await assertChangeOwnership(client, 'usuarios', 'usr-1', 'empresa-A', { id: 'usr-1' },
    { canAccessCompany: async (id) => id === 'empresa-B' });
});

test('referencias circulares se revalidan al materializar el destino después de la comanda o venta', async () => {
  for (const [entity, source] of [['ventas', 'restaurant_comandas'], ['restaurant_comandas', 'ventas']]) {
    const payload = { id: 'future-1', empresa_id: 'empresa-A', sucursal_id: 'sucursal-1' };
    const rows = { 'sucursales:sucursal-1': [{ empresa_id: 'empresa-A' }] };
    await assert.rejects(assertChangeOwnership(clientFor({ ...rows,
      [`${source}:future-1`]: [{ empresa_id: 'empresa-B', sucursal_id: 'sucursal-1' }],
    }), entity, payload.id, 'empresa-A', payload), /otra empresa/);
    await assert.rejects(assertChangeOwnership(clientFor({ ...rows,
      [`${source}:future-1`]: [{ empresa_id: 'empresa-A', sucursal_id: 'sucursal-2' }],
    }), entity, payload.id, 'empresa-A', payload), /otra sucursal/);
    await assertChangeOwnership(clientFor({ ...rows,
      [`${source}:future-1`]: [{ empresa_id: 'empresa-A', sucursal_id: 'sucursal-1' }],
    }), entity, payload.id, 'empresa-A', payload);
  }
});
