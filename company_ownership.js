// Verify the target row and its parent before an UPSERT. An authenticated
// tenant must never move another tenant's row by reusing its id.
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
const branchScopedTables = new Set(['cajas', 'restaurant_mesas', 'restaurant_comandas', 'ventas', 'cuentas_cobrar']);
const operationUsers = {
  cajas: ['usuario_apertura_id', 'usuario_cierre_id'], ventas: ['usuario_id'], compras: ['usuario_id'],
  movimientos_caja: ['usuario_id'], abonos_cliente: ['usuario_id'], movimientos_inventario: ['usuario_id'],
  restaurant_comandas: ['mozo_id'],
};
const documentParents = { venta_detalle: ['ventas', 'venta_id'], pagos: ['ventas', 'venta_id'],
  compra_detalle: ['compras', 'compra_id'] };

async function lockSyncChanges(client, changes) {
  const keys = new Set();
  for (const change of changes) {
    const entity = change.entity;
    const payload = change.payload || {};
    if (change.id) keys.add(`change:${change.id}`);
    if (change.entityId) keys.add(`row:${entity}:${change.entityId}`);
    const fields = { ...references[entity] };
    if (documentParents[entity]) {
      const [table, field] = documentParents[entity];
      fields[field] = table;
    }
    if (entity === 'usuario_empresas') fields.usuario_id = 'usuarios';
    for (const field of operationUsers[entity] || []) fields[field] = 'usuarios';
    for (const [field, table] of Object.entries(fields)) {
      if (payload[field]) keys.add(`row:${table}:${payload[field]}`);
    }
  }
  // Acquire the entire batch in stable order. The same target lock protects
  // nonexistent rows too, so circular links and retries serialize correctly.
  for (const key of [...keys].sort()) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [key]);
  }
}

async function assertReferences(client, entity, companyId, payload) {
  for (const [field, table] of Object.entries(references[entity] || {})) {
    const id = payload[field];
    if (id == null) continue;
    if (typeof id !== 'string' || !id.trim()) throw new Error(`Referencia ${field} inválida.`);
    const columns = branchScopedTables.has(table) ? 'empresa_id,sucursal_id' : 'empresa_id';
    const result = await client.query(`SELECT ${columns} FROM ${table} WHERE id=$1`, [id]);
    const row = result.rows[0];
    // These two links have no FK and form a cycle. Their target may arrive
    // later; every existing target must still belong to this company/branch.
    const deferred = (entity === 'restaurant_comandas' && field === 'venta_id') ||
      (entity === 'ventas' && field === 'comanda_id');
    if (!row && deferred) continue;
    if (!row) throw new Error(`La referencia ${field} no existe.`);
    if (row.empresa_id !== companyId) throw new Error(`La referencia ${field} pertenece a otra empresa.`);
    if (branchScopedTables.has(table) && payload.sucursal_id && row.sucursal_id !== payload.sucursal_id) {
      throw new Error(`La referencia ${field} pertenece a otra sucursal.`);
    }
  }
  for (const field of operationUsers[entity] || []) {
    const userId = payload[field];
    if (userId == null) continue;
    const memberships = await client.query('SELECT empresa_id FROM usuario_empresas WHERE usuario_id=$1', [userId]);
    if (!memberships.rows.some((row) => row.empresa_id === companyId)) {
      throw new Error(`El usuario de ${field} no pertenece a esta empresa o pertenece a otra empresa.`);
    }
  }
  const incoming = { ventas: ['restaurant_comandas', 'venta_id'], restaurant_comandas: ['ventas', 'comanda_id'] }[entity];
  if (incoming) {
    const [table, field] = incoming;
    const sources = await client.query(`SELECT empresa_id,sucursal_id FROM ${table} WHERE ${field}=$1`, [payload.id]);
    for (const row of sources.rows) {
      if (row.empresa_id !== companyId) throw new Error('Una referencia existente pertenece a otra empresa.');
      if (row.sucursal_id !== payload.sucursal_id) throw new Error('Una referencia existente pertenece a otra sucursal.');
    }
  }
}

async function hasUserCompanyAccess(memberships, companyId, canAccessCompany) {
  if (memberships.some((row) => row.empresa_id === companyId)) return true;
  if (!canAccessCompany) return false;
  for (const sourceId of new Set(memberships.map((row) => row.empresa_id))) {
    if (await canAccessCompany(sourceId)) return true;
  }
  return false;
}

async function assertChangeOwnership(client, entity, entityId, companyId, payload, { canAccessCompany } = {}) {
  if (!companyId || payload.id !== entityId) throw new Error('Identificador de cambio o empresa inválido.');
  if (entity === 'empresas') {
    if (entityId !== companyId) throw new Error('La empresa del cambio no coincide con la licencia.');
    return;
  }
  if (entity === 'usuarios') {
    const memberships = await client.query(
      'SELECT empresa_id FROM usuario_empresas WHERE usuario_id=$1', [entityId],
    );
    if (memberships.rowCount && !(await hasUserCompanyAccess(memberships.rows, companyId, canAccessCompany))) {
      throw new Error('El usuario pertenece a otra empresa.');
    }
    return;
  }
  if (documentParents[entity]) {
    const [table, field] = documentParents[entity];
    const parentId = payload[field];
    if (!parentId) throw new Error('Falta el documento padre del detalle.');
    const parent = await client.query(`SELECT empresa_id FROM ${table} WHERE id=$1`, [parentId]);
    if (parent.rows[0]?.empresa_id !== companyId) throw new Error('El detalle pertenece a otra empresa.');
    const existing = await client.query(`SELECT ${field} FROM ${entity} WHERE id=$1`, [entityId]);
    if (existing.rowCount && existing.rows[0][field] !== parentId) throw new Error('El detalle ya pertenece a otro documento.');
    await assertReferences(client, entity, companyId, payload);
    return;
  }
  if (payload.empresa_id !== companyId) throw new Error('El registro pertenece a otra empresa.');
  if (entity === 'usuario_empresas') {
    const memberships = await client.query('SELECT empresa_id FROM usuario_empresas WHERE usuario_id=$1', [payload.usuario_id]);
    if (memberships.rowCount && !(await hasUserCompanyAccess(memberships.rows, companyId, canAccessCompany))) {
      throw new Error('El usuario no pertenece a esta empresa.');
    }
  }
  const existing = await client.query(`SELECT empresa_id FROM ${entity} WHERE id=$1`, [entityId]);
  if (existing.rowCount && existing.rows[0].empresa_id !== companyId) {
    throw new Error('El identificador ya pertenece a otra empresa.');
  }
  await assertReferences(client, entity, companyId, payload);
}


module.exports = { assertChangeOwnership, lockSyncChanges };
