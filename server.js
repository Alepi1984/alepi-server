require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const {
  hashActivationCode, createDeviceToken, hashDeviceToken,
  bearerToken, eligibleForPairing, licenseAllowsSync,
} = require('./commercial_access');
const { assertChangeOwnership, lockSyncChanges } = require('./company_ownership');
const { publishSyncChange } = require('./sync_publication');
const { createLiveRouter } = require('./routes/api_live');
const { renderBarberiaPortal } = require('./routes/barberia_portal');
const { renderHotelPortal } = require('./routes/hotel_portal');

const PORT = Number(process.env.PORT || 3100);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL en server/.env');
  process.exit(1);
}

const useSsl = String(process.env.DB_SSL || 'false').toLowerCase() === 'true';
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: process.env.DB_SSL_INSECURE_DEV !== 'true' } : false,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));
const commercialStrict = process.env.COMMERCIAL_AUTH_STRICT === 'true';

async function authenticatedDevice(client, req, deviceId) {
  const token = bearerToken(req.headers.authorization);
  if (req.headers.authorization && !token) return false;
  if (token) {
    const credential = await client.query(
      'SELECT device_id FROM commercial_device_tokens WHERE token_hash=$1 AND revoked_at IS NULL',
      [hashDeviceToken(token)],
    );
    return credential.rows[0]?.device_id === deviceId;
  }
  const credential = await client.query(
    'SELECT 1 FROM commercial_device_tokens WHERE device_id=$1 AND revoked_at IS NULL', [deviceId],
  );
  if (credential.rowCount) return false;
  if (commercialStrict) return false;
  // Transitional LAN mode accepts only devices registered before this release.
  const existing = await client.query('SELECT 1 FROM alepi_devices WHERE id=$1', [deviceId]);
  return existing.rowCount > 0;
}

async function companyAccess(client, deviceId, companyId, authenticated, allowFirstPush = false) {
  const license = await client.query('SELECT * FROM commercial_licenses WHERE company_id=$1', [companyId]);
  const linked = await deviceHasCompany(client, deviceId, companyId);
  if (license.rowCount) {
    const first = allowFirstPush && license.rows[0].primary_device_id === deviceId;
    return licenseAllowsSync({ license: license.rows[0], authenticated, linked: linked || first });
  }
  return !commercialStrict && authenticated && (linked || allowFirstPush);
}

const CORE_ENTITIES = new Set([
  'empresas',
  'sucursales',
  'usuarios',
  'usuario_empresas',
  'configuracion_empresa',
  'modulos_empresa',
  'rol_permisos_empresa',
  'categorias_producto',
  'unidades_medida',
  'productos',
  'inventario_saldos',
  'lotes_producto',
  'restaurant_mesas',
  'restaurant_comandas',
  'restaurant_comanda_detalle',
  'cajas',
  'movimientos_caja',
  'clientes',
  'cuentas_cobrar',
  'abonos_cliente',
  'proveedores',
  'compras',
  'compra_detalle',
  'ventas',
  'venta_detalle',
  'pagos',
  'movimientos_inventario',
]);

function bool(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function cleanPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const out = { ...payload };
  delete out.sync_estado;
  delete out.version_local;
  return out;
}

async function deviceHasCompany(client, deviceId, companyId) {
  const result = await client.query(
    'SELECT 1 FROM device_companies WHERE device_id = $1 AND company_id = $2 LIMIT 1',
    [deviceId, companyId],
  );
  return result.rowCount > 0;
}

async function linkDeviceCompany(client, deviceId, companyId) {
  await client.query(
    `INSERT INTO device_companies(device_id, company_id, linked_at)
     VALUES ($1,$2,NOW())
     ON CONFLICT (device_id, company_id) DO NOTHING`,
    [deviceId, companyId],
  );
}

async function applyCoreChange(client, entity, payload) {
  const p = cleanPayload(payload);
  let result;

  switch (entity) {
    case 'empresas':
      result = await client.query(
        `INSERT INTO empresas
          (id,nombre_comercial,razon_social,ruc,rubro,activo,creado_en,actualizado_en,eliminado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)
         ON CONFLICT (id) DO UPDATE SET
           nombre_comercial=EXCLUDED.nombre_comercial,
           razon_social=EXCLUDED.razon_social,
           ruc=EXCLUDED.ruc,
           rubro=EXCLUDED.rubro,
           activo=EXCLUDED.activo,
           actualizado_en=EXCLUDED.actualizado_en,
           eliminado_en=EXCLUDED.eliminado_en,
           version_server=empresas.version_server+1
         WHERE EXCLUDED.actualizado_en >= empresas.actualizado_en
         RETURNING *`,
        [p.id, p.nombre_comercial, p.razon_social || null, p.ruc || null, p.rubro, bool(p.activo), p.creado_en, p.actualizado_en, p.eliminado_en || null],
      );
      break;

    case 'sucursales':
      result = await client.query(
        `INSERT INTO sucursales
          (id,empresa_id,codigo,nombre,direccion,activo,creado_en,actualizado_en,eliminado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,
           codigo=EXCLUDED.codigo,
           nombre=EXCLUDED.nombre,
           direccion=EXCLUDED.direccion,
           activo=EXCLUDED.activo,
           actualizado_en=EXCLUDED.actualizado_en,
           eliminado_en=EXCLUDED.eliminado_en,
           version_server=sucursales.version_server+1
         WHERE EXCLUDED.actualizado_en >= sucursales.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.codigo, p.nombre, p.direccion || null, bool(p.activo), p.creado_en, p.actualizado_en, p.eliminado_en || null],
      );
      break;

    case 'usuarios':
      result = await client.query(
        `INSERT INTO usuarios
          (id,usuario,nombre,credential_hash,activo,creado_en,actualizado_en,eliminado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
         ON CONFLICT (id) DO UPDATE SET
           usuario=EXCLUDED.usuario,
           nombre=EXCLUDED.nombre,
           credential_hash=COALESCE(EXCLUDED.credential_hash, usuarios.credential_hash),
           activo=EXCLUDED.activo,
           actualizado_en=EXCLUDED.actualizado_en,
           eliminado_en=EXCLUDED.eliminado_en,
           version_server=usuarios.version_server+1
         WHERE EXCLUDED.actualizado_en >= usuarios.actualizado_en
         RETURNING *`,
        [p.id, p.usuario, p.nombre, p.credential_hash || null, bool(p.activo), p.creado_en, p.actualizado_en, p.eliminado_en || null],
      );
      break;

    case 'usuario_empresas':
      result = await client.query(
        `INSERT INTO usuario_empresas
          (id,usuario_id,empresa_id,sucursal_id,rol_codigo,activo,creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
         ON CONFLICT (id) DO UPDATE SET
           usuario_id=EXCLUDED.usuario_id,
           empresa_id=EXCLUDED.empresa_id,
           sucursal_id=EXCLUDED.sucursal_id,
           rol_codigo=EXCLUDED.rol_codigo,
           activo=EXCLUDED.activo,
           actualizado_en=EXCLUDED.actualizado_en,
           version_server=usuario_empresas.version_server+1
         WHERE EXCLUDED.actualizado_en >= usuario_empresas.actualizado_en
         RETURNING *`,
        [p.id, p.usuario_id, p.empresa_id, p.sucursal_id || null, p.rol_codigo, bool(p.activo), p.creado_en, p.actualizado_en],
      );
      break;

    case 'configuracion_empresa':
      result = await client.query(
        `INSERT INTO configuracion_empresa(id,empresa_id,clave,valor,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,
           clave=EXCLUDED.clave,
           valor=EXCLUDED.valor,
           actualizado_en=EXCLUDED.actualizado_en,
           version_server=configuracion_empresa.version_server+1
         WHERE EXCLUDED.actualizado_en >= configuracion_empresa.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.clave, p.valor == null ? null : String(p.valor), p.actualizado_en],
      );
      break;

    case 'modulos_empresa':
      result = await client.query(
        `INSERT INTO modulos_empresa(id,empresa_id,modulo,habilitado,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,1)
         ON CONFLICT (empresa_id,modulo) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,
           modulo=EXCLUDED.modulo,
           habilitado=EXCLUDED.habilitado,
           actualizado_en=EXCLUDED.actualizado_en,
           version_server=modulos_empresa.version_server+1
         WHERE EXCLUDED.actualizado_en >= modulos_empresa.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.modulo, bool(p.habilitado), p.actualizado_en],
      );
      break;

    case 'rol_permisos_empresa':
      result = await client.query(
        `INSERT INTO rol_permisos_empresa(id,empresa_id,rol_codigo,permiso_codigo,permitido,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,1)
         ON CONFLICT (empresa_id,rol_codigo,permiso_codigo) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,
           rol_codigo=EXCLUDED.rol_codigo,
           permiso_codigo=EXCLUDED.permiso_codigo,
           permitido=EXCLUDED.permitido,
           actualizado_en=EXCLUDED.actualizado_en,
           version_server=rol_permisos_empresa.version_server+1
         WHERE EXCLUDED.actualizado_en >= rol_permisos_empresa.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.rol_codigo, p.permiso_codigo, bool(p.permitido), p.actualizado_en],
      );
      break;

    case 'categorias_producto':
      result = await client.query(
        `INSERT INTO categorias_producto(id,empresa_id,nombre,activo,creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,nombre=EXCLUDED.nombre,activo=EXCLUDED.activo,
           actualizado_en=EXCLUDED.actualizado_en,version_server=categorias_producto.version_server+1
         WHERE EXCLUDED.actualizado_en >= categorias_producto.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.nombre, bool(p.activo), p.creado_en, p.actualizado_en],
      );
      break;

    case 'unidades_medida':
      result = await client.query(
        `INSERT INTO unidades_medida(id,empresa_id,codigo,nombre,decimales,activo,creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,codigo=EXCLUDED.codigo,nombre=EXCLUDED.nombre,
           decimales=EXCLUDED.decimales,activo=EXCLUDED.activo,actualizado_en=EXCLUDED.actualizado_en,
           version_server=unidades_medida.version_server+1
         WHERE EXCLUDED.actualizado_en >= unidades_medida.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.codigo, p.nombre, Number(p.decimales || 0), bool(p.activo), p.creado_en, p.actualizado_en],
      );
      break;

    case 'productos':
      result = await client.query(
        `INSERT INTO productos
          (id,empresa_id,sku,codigo_barras,nombre,categoria,categoria_id,unidad,unidad_id,
           precio_venta,costo,foto_base64,controla_stock,controla_vencimiento,activo,
           creado_en,actualizado_en,eliminado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,sku=EXCLUDED.sku,codigo_barras=EXCLUDED.codigo_barras,
           nombre=EXCLUDED.nombre,categoria=EXCLUDED.categoria,categoria_id=EXCLUDED.categoria_id,
           unidad=EXCLUDED.unidad,unidad_id=EXCLUDED.unidad_id,precio_venta=EXCLUDED.precio_venta,
           costo=EXCLUDED.costo,foto_base64=EXCLUDED.foto_base64,controla_stock=EXCLUDED.controla_stock,
           controla_vencimiento=EXCLUDED.controla_vencimiento,activo=EXCLUDED.activo,
           actualizado_en=EXCLUDED.actualizado_en,eliminado_en=EXCLUDED.eliminado_en,
           version_server=productos.version_server+1
         WHERE EXCLUDED.actualizado_en >= productos.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sku || null, p.codigo_barras || null, p.nombre, p.categoria || null,
         p.categoria_id || null, p.unidad || 'UND', p.unidad_id || null, Number(p.precio_venta || 0),
         Number(p.costo || 0), p.foto_base64 || null, bool(p.controla_stock), bool(p.controla_vencimiento),
         bool(p.activo), p.creado_en, p.actualizado_en, p.eliminado_en || null],
      );
      break;

    case 'inventario_saldos':
      result = await client.query(
        `INSERT INTO inventario_saldos
          (id,empresa_id,sucursal_id,producto_id,cantidad,stock_minimo,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,sucursal_id=EXCLUDED.sucursal_id,producto_id=EXCLUDED.producto_id,
           cantidad=EXCLUDED.cantidad,stock_minimo=EXCLUDED.stock_minimo,actualizado_en=EXCLUDED.actualizado_en,
           version_server=inventario_saldos.version_server+1
         WHERE EXCLUDED.actualizado_en >= inventario_saldos.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.producto_id, Number(p.cantidad || 0), Number(p.stock_minimo || 0), p.actualizado_en],
      );
      break;

    case 'lotes_producto':
      result = await client.query(
        `INSERT INTO lotes_producto
          (id,empresa_id,sucursal_id,producto_id,numero_lote,fecha_vencimiento,cantidad,activo,creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,sucursal_id=EXCLUDED.sucursal_id,producto_id=EXCLUDED.producto_id,
           numero_lote=EXCLUDED.numero_lote,fecha_vencimiento=EXCLUDED.fecha_vencimiento,cantidad=EXCLUDED.cantidad,
           activo=EXCLUDED.activo,actualizado_en=EXCLUDED.actualizado_en,
           version_server=lotes_producto.version_server+1
         WHERE EXCLUDED.actualizado_en >= lotes_producto.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.producto_id, p.numero_lote, p.fecha_vencimiento || null,
         Number(p.cantidad || 0), bool(p.activo), p.creado_en, p.actualizado_en],
      );
      break;

    case 'restaurant_mesas':
      result = await client.query(
        `INSERT INTO restaurant_mesas
          (id,empresa_id,sucursal_id,codigo,nombre,zona,capacidad,estado,activo,creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,sucursal_id=EXCLUDED.sucursal_id,codigo=EXCLUDED.codigo,
           nombre=EXCLUDED.nombre,zona=EXCLUDED.zona,capacidad=EXCLUDED.capacidad,
           estado=EXCLUDED.estado,activo=EXCLUDED.activo,actualizado_en=EXCLUDED.actualizado_en,
           version_server=restaurant_mesas.version_server+1
         WHERE EXCLUDED.actualizado_en >= restaurant_mesas.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.codigo, p.nombre, p.zona || null,
         Number(p.capacidad || 4), p.estado || 'LIBRE', bool(p.activo), p.creado_en, p.actualizado_en],
      );
      break;

    case 'restaurant_comandas':
      result = await client.query(
        `INSERT INTO restaurant_comandas
          (id,empresa_id,sucursal_id,mesa_id,mozo_id,numero,tipo_servicio,cliente_nombre,personas,
           estado,subtotal,descuento,total,observacion,venta_id,abierta_en,cerrada_en,creado_en,
           actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,1)
         ON CONFLICT (id) DO UPDATE SET
           mesa_id=EXCLUDED.mesa_id,mozo_id=EXCLUDED.mozo_id,numero=EXCLUDED.numero,
           tipo_servicio=EXCLUDED.tipo_servicio,cliente_nombre=EXCLUDED.cliente_nombre,
           personas=EXCLUDED.personas,estado=EXCLUDED.estado,subtotal=EXCLUDED.subtotal,
           descuento=EXCLUDED.descuento,total=EXCLUDED.total,observacion=EXCLUDED.observacion,
           venta_id=EXCLUDED.venta_id,abierta_en=EXCLUDED.abierta_en,cerrada_en=EXCLUDED.cerrada_en,
           actualizado_en=EXCLUDED.actualizado_en,version_server=restaurant_comandas.version_server+1
         WHERE EXCLUDED.actualizado_en >= restaurant_comandas.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.mesa_id || null, p.mozo_id, p.numero,
         p.tipo_servicio || 'MESA', p.cliente_nombre || null, Number(p.personas || 1),
         p.estado || 'ABIERTA', Number(p.subtotal || 0), Number(p.descuento || 0),
         Number(p.total || 0), p.observacion || null, p.venta_id || null, p.abierta_en,
         p.cerrada_en || null, p.creado_en, p.actualizado_en],
      );
      break;

    case 'restaurant_comanda_detalle':
      result = await client.query(
        `INSERT INTO restaurant_comanda_detalle
          (id,empresa_id,sucursal_id,comanda_id,producto_id,descripcion,cantidad,precio_unitario,
           costo_unitario,total,area_preparacion,nota,estado,enviado_en,preparado_en,entregado_en,
           creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1)
         ON CONFLICT (id) DO UPDATE SET
           descripcion=EXCLUDED.descripcion,cantidad=EXCLUDED.cantidad,
           precio_unitario=EXCLUDED.precio_unitario,costo_unitario=EXCLUDED.costo_unitario,
           total=EXCLUDED.total,area_preparacion=EXCLUDED.area_preparacion,nota=EXCLUDED.nota,
           estado=EXCLUDED.estado,enviado_en=EXCLUDED.enviado_en,preparado_en=EXCLUDED.preparado_en,
           entregado_en=EXCLUDED.entregado_en,actualizado_en=EXCLUDED.actualizado_en,
           version_server=restaurant_comanda_detalle.version_server+1
         WHERE EXCLUDED.actualizado_en >= restaurant_comanda_detalle.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.comanda_id, p.producto_id, p.descripcion,
         Number(p.cantidad || 0), Number(p.precio_unitario || 0), Number(p.costo_unitario || 0),
         Number(p.total || 0), p.area_preparacion || 'COCINA', p.nota || null,
         p.estado || 'BORRADOR', p.enviado_en || null, p.preparado_en || null,
         p.entregado_en || null, p.creado_en, p.actualizado_en],
      );
      break;

    case 'cajas':
      result = await client.query(
        `INSERT INTO cajas
          (id,empresa_id,sucursal_id,usuario_apertura_id,usuario_cierre_id,apertura_en,cierre_en,
           saldo_inicial,saldo_final,saldo_esperado,diferencia,observacion_apertura,observacion_cierre,
           estado,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,sucursal_id=EXCLUDED.sucursal_id,
           usuario_apertura_id=EXCLUDED.usuario_apertura_id,usuario_cierre_id=EXCLUDED.usuario_cierre_id,
           apertura_en=EXCLUDED.apertura_en,cierre_en=EXCLUDED.cierre_en,saldo_inicial=EXCLUDED.saldo_inicial,
           saldo_final=EXCLUDED.saldo_final,saldo_esperado=EXCLUDED.saldo_esperado,diferencia=EXCLUDED.diferencia,
           observacion_apertura=EXCLUDED.observacion_apertura,observacion_cierre=EXCLUDED.observacion_cierre,
           estado=EXCLUDED.estado,actualizado_en=EXCLUDED.actualizado_en,version_server=cajas.version_server+1
         WHERE EXCLUDED.actualizado_en >= cajas.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.usuario_apertura_id, p.usuario_cierre_id || null,
         p.apertura_en, p.cierre_en || null, Number(p.saldo_inicial || 0), p.saldo_final == null ? null : Number(p.saldo_final),
         p.saldo_esperado == null ? null : Number(p.saldo_esperado), p.diferencia == null ? null : Number(p.diferencia),
         p.observacion_apertura || null, p.observacion_cierre || null, p.estado || 'ABIERTA', p.actualizado_en],
      );
      break;

    case 'movimientos_caja':
      result = await client.query(
        `INSERT INTO movimientos_caja
          (id,empresa_id,sucursal_id,caja_id,usuario_id,tipo,metodo,monto,concepto,
           referencia_tipo,referencia_id,creado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)
         ON CONFLICT (id) DO UPDATE SET
           tipo=EXCLUDED.tipo,metodo=EXCLUDED.metodo,monto=EXCLUDED.monto,concepto=EXCLUDED.concepto,
           referencia_tipo=EXCLUDED.referencia_tipo,referencia_id=EXCLUDED.referencia_id,
           version_server=movimientos_caja.version_server+1
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.caja_id, p.usuario_id, p.tipo, p.metodo || 'EFECTIVO',
         Number(p.monto || 0), p.concepto, p.referencia_tipo || null, p.referencia_id || null, p.creado_en],
      );
      break;

    case 'clientes':
      result = await client.query(
        `INSERT INTO clientes
          (id,empresa_id,tipo_documento,numero_documento,nombre,telefono,direccion,limite_credito,
           activo,creado_en,actualizado_en,eliminado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,tipo_documento=EXCLUDED.tipo_documento,
           numero_documento=EXCLUDED.numero_documento,nombre=EXCLUDED.nombre,telefono=EXCLUDED.telefono,
           direccion=EXCLUDED.direccion,limite_credito=EXCLUDED.limite_credito,activo=EXCLUDED.activo,
           actualizado_en=EXCLUDED.actualizado_en,eliminado_en=EXCLUDED.eliminado_en,
           version_server=clientes.version_server+1
         WHERE EXCLUDED.actualizado_en >= clientes.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.tipo_documento || null, p.numero_documento || null, p.nombre,
         p.telefono || null, p.direccion || null, Number(p.limite_credito || 0), bool(p.activo),
         p.creado_en, p.actualizado_en, p.eliminado_en || null],
      );
      break;

    case 'cuentas_cobrar':
      result = await client.query(
        `INSERT INTO cuentas_cobrar
          (id,empresa_id,sucursal_id,cliente_id,venta_id,monto_original,saldo,fecha_vencimiento,
           estado,observacion,creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)
         ON CONFLICT (id) DO UPDATE SET
           monto_original=EXCLUDED.monto_original,saldo=EXCLUDED.saldo,
           fecha_vencimiento=EXCLUDED.fecha_vencimiento,estado=EXCLUDED.estado,
           observacion=EXCLUDED.observacion,actualizado_en=EXCLUDED.actualizado_en,
           version_server=cuentas_cobrar.version_server+1
         WHERE EXCLUDED.actualizado_en >= cuentas_cobrar.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.cliente_id, p.venta_id, Number(p.monto_original || 0),
         Number(p.saldo || 0), p.fecha_vencimiento || null, p.estado || 'PENDIENTE', p.observacion || null,
         p.creado_en, p.actualizado_en],
      );
      break;

    case 'abonos_cliente':
      result = await client.query(
        `INSERT INTO abonos_cliente
          (id,empresa_id,sucursal_id,cuenta_id,cliente_id,caja_id,usuario_id,metodo,monto,referencia,creado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)
         ON CONFLICT (id) DO UPDATE SET
           metodo=EXCLUDED.metodo,monto=EXCLUDED.monto,referencia=EXCLUDED.referencia,
           version_server=abonos_cliente.version_server+1
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.cuenta_id, p.cliente_id, p.caja_id, p.usuario_id,
         p.metodo, Number(p.monto || 0), p.referencia || null, p.creado_en],
      );
      break;

    case 'proveedores':
      result = await client.query(
        `INSERT INTO proveedores
          (id,empresa_id,numero_documento,razon_social,contacto,telefono,direccion,activo,
           creado_en,actualizado_en,eliminado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)
         ON CONFLICT (id) DO UPDATE SET
           empresa_id=EXCLUDED.empresa_id,numero_documento=EXCLUDED.numero_documento,
           razon_social=EXCLUDED.razon_social,contacto=EXCLUDED.contacto,telefono=EXCLUDED.telefono,
           direccion=EXCLUDED.direccion,activo=EXCLUDED.activo,actualizado_en=EXCLUDED.actualizado_en,
           eliminado_en=EXCLUDED.eliminado_en,version_server=proveedores.version_server+1
         WHERE EXCLUDED.actualizado_en >= proveedores.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.numero_documento || null, p.razon_social, p.contacto || null,
         p.telefono || null, p.direccion || null, bool(p.activo), p.creado_en, p.actualizado_en, p.eliminado_en || null],
      );
      break;

    case 'compras':
      result = await client.query(
        `INSERT INTO compras
          (id,empresa_id,sucursal_id,proveedor_id,caja_id,usuario_id,fecha,tipo_documento,
           numero_documento,tipo_pago,metodo_pago,subtotal,total,estado,observacion,
           creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,1)
         ON CONFLICT (id) DO UPDATE SET
           proveedor_id=EXCLUDED.proveedor_id,caja_id=EXCLUDED.caja_id,usuario_id=EXCLUDED.usuario_id,
           fecha=EXCLUDED.fecha,tipo_documento=EXCLUDED.tipo_documento,numero_documento=EXCLUDED.numero_documento,
           tipo_pago=EXCLUDED.tipo_pago,metodo_pago=EXCLUDED.metodo_pago,subtotal=EXCLUDED.subtotal,
           total=EXCLUDED.total,estado=EXCLUDED.estado,observacion=EXCLUDED.observacion,
           actualizado_en=EXCLUDED.actualizado_en,version_server=compras.version_server+1
         WHERE EXCLUDED.actualizado_en >= compras.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.proveedor_id || null, p.caja_id || null, p.usuario_id,
         p.fecha, p.tipo_documento || null, p.numero_documento || null, p.tipo_pago || 'CONTADO',
         p.metodo_pago || null, Number(p.subtotal || 0), Number(p.total || 0), p.estado || 'REGISTRADA',
         p.observacion || null, p.creado_en, p.actualizado_en],
      );
      break;

    case 'compra_detalle':
      result = await client.query(
        `INSERT INTO compra_detalle
          (id,compra_id,producto_id,descripcion,cantidad,costo_unitario,total,creado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
         ON CONFLICT (id) DO UPDATE SET
           descripcion=EXCLUDED.descripcion,cantidad=EXCLUDED.cantidad,costo_unitario=EXCLUDED.costo_unitario,
           total=EXCLUDED.total,version_server=compra_detalle.version_server+1
         RETURNING *`,
        [p.id, p.compra_id, p.producto_id, p.descripcion, Number(p.cantidad || 0),
         Number(p.costo_unitario || 0), Number(p.total || 0), p.creado_en],
      );
      break;

    case 'movimientos_inventario':
      result = await client.query(
        `INSERT INTO movimientos_inventario
          (id,empresa_id,sucursal_id,producto_id,tipo,cantidad,referencia_tipo,referencia_id,observacion,usuario_id,creado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)
         ON CONFLICT (id) DO UPDATE SET
           tipo=EXCLUDED.tipo,cantidad=EXCLUDED.cantidad,referencia_tipo=EXCLUDED.referencia_tipo,
           referencia_id=EXCLUDED.referencia_id,observacion=EXCLUDED.observacion,
           version_server=movimientos_inventario.version_server+1
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.producto_id, p.tipo, Number(p.cantidad || 0),
         p.referencia_tipo || null, p.referencia_id || null, p.observacion || null, p.usuario_id || null, p.creado_en],
      );
      break;

    case 'ventas':
      result = await client.query(
        `INSERT INTO ventas
          (id,empresa_id,sucursal_id,caja_id,usuario_id,fecha,subtotal,descuento,total,cliente_id,
           tipo_venta,efectivo_recibido,vuelto,observacion,comanda_id,estado,creado_en,actualizado_en,version_server)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1)
         ON CONFLICT (id) DO UPDATE SET
           caja_id=EXCLUDED.caja_id,usuario_id=EXCLUDED.usuario_id,fecha=EXCLUDED.fecha,
           subtotal=EXCLUDED.subtotal,descuento=EXCLUDED.descuento,total=EXCLUDED.total,
           cliente_id=EXCLUDED.cliente_id,tipo_venta=EXCLUDED.tipo_venta,
           efectivo_recibido=EXCLUDED.efectivo_recibido,vuelto=EXCLUDED.vuelto,
           observacion=EXCLUDED.observacion,comanda_id=EXCLUDED.comanda_id,
           estado=EXCLUDED.estado,actualizado_en=EXCLUDED.actualizado_en,
           version_server=ventas.version_server+1
         WHERE EXCLUDED.actualizado_en >= ventas.actualizado_en
         RETURNING *`,
        [p.id, p.empresa_id, p.sucursal_id, p.caja_id || null, p.usuario_id, p.fecha,
         Number(p.subtotal || 0), Number(p.descuento || 0), Number(p.total || 0),
         p.cliente_id || null, p.tipo_venta || 'CONTADO',
         p.efectivo_recibido == null ? null : Number(p.efectivo_recibido),
         p.vuelto == null ? null : Number(p.vuelto), p.observacion || null,
         p.comanda_id || null, p.estado || 'COMPLETADA', p.creado_en, p.actualizado_en],
      );
      break;

    case 'venta_detalle':
      result = await client.query(
        `INSERT INTO venta_detalle
          (id,venta_id,producto_id,descripcion,cantidad,precio_unitario,costo_unitario,descuento,total,creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           descripcion=EXCLUDED.descripcion,cantidad=EXCLUDED.cantidad,
           precio_unitario=EXCLUDED.precio_unitario,costo_unitario=EXCLUDED.costo_unitario,
           descuento=EXCLUDED.descuento,total=EXCLUDED.total
         RETURNING *`,
        [p.id, p.venta_id, p.producto_id || null, p.descripcion, Number(p.cantidad || 0),
         Number(p.precio_unitario || 0), Number(p.costo_unitario || 0), Number(p.descuento || 0),
         Number(p.total || 0), p.creado_en],
      );
      break;

    case 'pagos':
      result = await client.query(
        `INSERT INTO pagos(id,venta_id,metodo,monto,referencia,creado_en)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET
           metodo=EXCLUDED.metodo,monto=EXCLUDED.monto,referencia=EXCLUDED.referencia
         RETURNING *`,
        [p.id, p.venta_id, p.metodo, Number(p.monto || 0), p.referencia || null, p.creado_en],
      );
      break;

    default:
      throw new Error(`Entidad no soportada: ${entity}`);
  }

  return result.rows[0] || null;
}

function canonicalServerPayload(entity, row) {
  if (!row) return null;
  const p = { ...row };
  if (entity === 'usuarios') {
    p.credential_hash = p.credential_hash || null;
  }
  return p;
}

async function companySnapshot(client, companyId) {
  const company = await client.query('SELECT * FROM empresas WHERE id=$1', [companyId]);
  const branches = await client.query('SELECT * FROM sucursales WHERE empresa_id=$1 ORDER BY nombre', [companyId]);
  const memberships = await client.query('SELECT * FROM usuario_empresas WHERE empresa_id=$1', [companyId]);
  const userIds = memberships.rows.map((r) => r.usuario_id);
  const users = userIds.length
    ? await client.query('SELECT * FROM usuarios WHERE id = ANY($1::text[])', [userIds])
    : { rows: [] };
  const config = await client.query('SELECT * FROM configuracion_empresa WHERE empresa_id=$1', [companyId]);
  const modules = await client.query('SELECT * FROM modulos_empresa WHERE empresa_id=$1', [companyId]);
  const permissions = await client.query('SELECT * FROM rol_permisos_empresa WHERE empresa_id=$1', [companyId]);
  const categories = await client.query('SELECT * FROM categorias_producto WHERE empresa_id=$1', [companyId]);
  const units = await client.query('SELECT * FROM unidades_medida WHERE empresa_id=$1', [companyId]);
  const products = await client.query('SELECT * FROM productos WHERE empresa_id=$1', [companyId]);
  const balances = await client.query('SELECT * FROM inventario_saldos WHERE empresa_id=$1', [companyId]);
  const lots = await client.query('SELECT * FROM lotes_producto WHERE empresa_id=$1', [companyId]);
  const restaurantTables = await client.query('SELECT * FROM restaurant_mesas WHERE empresa_id=$1 ORDER BY codigo', [companyId]);
  const restaurantOrders = await client.query('SELECT * FROM restaurant_comandas WHERE empresa_id=$1 ORDER BY abierta_en', [companyId]);
  const restaurantDetails = await client.query('SELECT * FROM restaurant_comanda_detalle WHERE empresa_id=$1 ORDER BY creado_en', [companyId]);
  const cashRegisters = await client.query('SELECT * FROM cajas WHERE empresa_id=$1 ORDER BY apertura_en', [companyId]);
  const cashMovements = await client.query('SELECT * FROM movimientos_caja WHERE empresa_id=$1 ORDER BY creado_en', [companyId]);
  const customers = await client.query('SELECT * FROM clientes WHERE empresa_id=$1 ORDER BY nombre', [companyId]);
  const sales = await client.query('SELECT * FROM ventas WHERE empresa_id=$1 ORDER BY creado_en', [companyId]);
  const saleIds = sales.rows.map((r) => r.id);
  const saleDetails = saleIds.length
    ? await client.query('SELECT * FROM venta_detalle WHERE venta_id = ANY($1::text[]) ORDER BY creado_en', [saleIds])
    : { rows: [] };
  const payments = saleIds.length
    ? await client.query('SELECT * FROM pagos WHERE venta_id = ANY($1::text[]) ORDER BY creado_en', [saleIds])
    : { rows: [] };
  const receivables = await client.query('SELECT * FROM cuentas_cobrar WHERE empresa_id=$1 ORDER BY creado_en', [companyId]);
  const customerPayments = await client.query('SELECT * FROM abonos_cliente WHERE empresa_id=$1 ORDER BY creado_en', [companyId]);
  const suppliers = await client.query('SELECT * FROM proveedores WHERE empresa_id=$1 ORDER BY razon_social', [companyId]);
  const purchases = await client.query('SELECT * FROM compras WHERE empresa_id=$1 ORDER BY creado_en', [companyId]);
  const purchaseIds = purchases.rows.map((r) => r.id);
  const purchaseDetails = purchaseIds.length
    ? await client.query('SELECT * FROM compra_detalle WHERE compra_id = ANY($1::text[]) ORDER BY creado_en', [purchaseIds])
    : { rows: [] };
  const inventoryMovements = await client.query('SELECT * FROM movimientos_inventario WHERE empresa_id=$1 ORDER BY creado_en', [companyId]);
  return {
    empresas: company.rows,
    sucursales: branches.rows,
    usuarios: users.rows,
    usuario_empresas: memberships.rows,
    configuracion_empresa: config.rows,
    modulos_empresa: modules.rows,
    rol_permisos_empresa: permissions.rows,
    categorias_producto: categories.rows,
    unidades_medida: units.rows,
    productos: products.rows,
    inventario_saldos: balances.rows,
    lotes_producto: lots.rows,
    restaurant_mesas: restaurantTables.rows,
    restaurant_comandas: restaurantOrders.rows,
    restaurant_comanda_detalle: restaurantDetails.rows,
    cajas: cashRegisters.rows,
    movimientos_caja: cashMovements.rows,
    clientes: customers.rows,
    ventas: sales.rows,
    venta_detalle: saleDetails.rows,
    pagos: payments.rows,
    cuentas_cobrar: receivables.rows,
    abonos_cliente: customerPayments.rows,
    proveedores: suppliers.rows,
    compras: purchases.rows,
    compra_detalle: purchaseDetails.rows,
    movimientos_inventario: inventoryMovements.rows,
  };
}

function pairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT current_database() AS database,
             NOW() AS server_time,
             current_setting('server_version') AS postgres_version
    `);
    res.json({
      ok: true,
      servicio: 'ALEPI Business API',
      version: '0.9.0',
      postgres: result.rows[0],
      arquitectura: 'OFFLINE_FIRST_HYBRID',
      commercialAuth: commercialStrict ? 'STRICT' : 'TRANSITION',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'DATABASE_UNAVAILABLE', detail: error.message });
  }
});

app.post('/api/license/activate', async (req, res) => {
  const { code, companyId, deviceId, deviceCode, platform, appVersion, label } = req.body || {};
  if (!/^ALP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/i.test(String(code || '').trim()) ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(String(companyId || '')) ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(String(deviceId || '')) || !deviceCode) {
    return res.status(400).json({ ok: false, error: 'Código, empresa y dispositivo válidos obligatorios.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query('SELECT * FROM commercial_activation_codes WHERE code_hash=$1 FOR UPDATE', [hashActivationCode(code)]);
    const activation = rows.rows[0];
    if (!activation || activation.used_at || new Date(activation.expires_at) <= new Date()) throw new Error('El código de activación no existe, venció o fue utilizado.');
    if (new Date(activation.license_expires_at) <= new Date()) throw new Error('La licencia indicada ya venció.');
    const alreadyLicensed = await client.query('SELECT 1 FROM commercial_licenses WHERE company_id=$1', [companyId]);
    if (alreadyLicensed.rowCount) throw new Error('La empresa ya tiene una licencia; solicita renovación al administrador ALEPI.');
    const previousCredential = await client.query('SELECT 1 FROM commercial_device_tokens WHERE device_id=$1 AND revoked_at IS NULL', [deviceId]);
    if (previousCredential.rowCount && (!bearerToken(req.headers.authorization) || !(await authenticatedDevice(client, req, deviceId)))) {
      throw new Error('El dispositivo ya tiene credencial: autoriza la activación desde ese mismo celular.');
    }
    await client.query(
      `INSERT INTO alepi_devices(id,device_code,platform,app_version,label,first_seen_at,last_seen_at)
       VALUES($1,$2,$3,$4,$5,NOW(),NOW())
       ON CONFLICT(id) DO UPDATE SET last_seen_at=NOW(),app_version=EXCLUDED.app_version`,
      [deviceId, deviceCode, platform || 'ANDROID', appVersion || null, label || null],
    );
    await client.query(
      `INSERT INTO commercial_licenses(company_id,business_label,max_devices,expires_at,primary_device_id)
       VALUES($1,$2,$3,$4,$5)`,
      [companyId, activation.business_label, activation.max_devices, activation.license_expires_at, deviceId],
    );
    // Existing businesses are already in PostgreSQL; register the activated
    // phone as a member even if it has never pushed its company row itself.
    const existingCompany = await client.query('SELECT 1 FROM empresas WHERE id=$1', [companyId]);
    if (existingCompany.rowCount) await linkDeviceCompany(client, deviceId, companyId);
    const token = createDeviceToken();
    await client.query(
      `INSERT INTO commercial_device_tokens(device_id,token_hash)
       VALUES($1,$2) ON CONFLICT(device_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,issued_at=NOW(),revoked_at=NULL`,
      [deviceId, hashDeviceToken(token)],
    );
    await client.query(
      'UPDATE commercial_activation_codes SET used_at=NOW(),used_by_device_id=$1,company_id=$2 WHERE code_hash=$3',
      [deviceId, companyId, activation.code_hash],
    );
    await client.query('COMMIT');
    res.json({ ok: true, apiToken: token, companyId, expiresAt: activation.license_expires_at, maxDevices: activation.max_devices });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ ok: false, error: 'ACTIVATION_FAILED', detail: error.message });
  } finally { client.release(); }
});

app.get('/api/license/status', async (req, res) => {
  const deviceId = String(req.query.deviceId || '');
  const companyId = String(req.query.companyId || '');
  if (!deviceId || !companyId) return res.status(400).json({ ok: false, error: 'deviceId y companyId obligatorios' });
  const client = await pool.connect();
  try {
    if (!(await authenticatedDevice(client, req, deviceId))) {
      return res.status(401).json({ ok: false, error: 'ACTIVATION_REQUIRED' });
    }
    const licenseRows = await client.query('SELECT * FROM commercial_licenses WHERE company_id=$1', [companyId]);
    const license = licenseRows.rows[0];
    const linked = await deviceHasCompany(client, deviceId, companyId);
    if (!license || (!linked && license.primary_device_id !== deviceId)) {
      return res.status(403).json({ ok: false, error: 'COMPANY_NOT_LINKED' });
    }
    res.json({ ok: true, active: licenseAllowsSync({ license, authenticated: true, linked: true }),
      status: license.status, expiresAt: license.expires_at, maxDevices: license.max_devices });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'LICENSE_STATUS_FAILED' });
  } finally { client.release(); }
});

app.post('/api/devices/register', async (req, res) => {
  const { deviceId, deviceCode, platform, appVersion, label } = req.body || {};
  if (!deviceId || !deviceCode) {
    return res.status(400).json({ ok: false, error: 'deviceId y deviceCode son obligatorios' });
  }
  const client = await pool.connect();
  try {
    if (!(await authenticatedDevice(client, req, deviceId))) {
      return res.status(401).json({ ok: false, error: 'ACTIVATION_REQUIRED' });
    }
    const result = await client.query(
      `INSERT INTO alepi_devices
        (id, device_code, platform, app_version, label, first_seen_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET
         device_code = EXCLUDED.device_code,
         platform = EXCLUDED.platform,
         app_version = EXCLUDED.app_version,
         label = COALESCE(EXCLUDED.label, alepi_devices.label),
         last_seen_at = NOW()
       RETURNING id, device_code, platform, app_version, label, first_seen_at, last_seen_at`,
      [deviceId, deviceCode, platform || 'ANDROID', appVersion || null, label || null],
    );
    res.json({ ok: true, device: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'DEVICE_REGISTER_FAILED', detail: error.message });
  } finally { client.release(); }
});

app.post('/api/sync/push', async (req, res) => {
  const { deviceId, changes } = req.body || {};
  if (!deviceId || !Array.isArray(changes)) {
    return res.status(400).json({ ok: false, error: 'deviceId y changes son obligatorios' });
  }
  if (changes.length > 200) return res.status(400).json({ ok: false, error: 'Máximo 200 cambios por lote' });
  const client = await pool.connect();
  const ackedIds = [];
  let applied = 0;
  try {
    await client.query('BEGIN');
    const device = await client.query('SELECT id FROM alepi_devices WHERE id=$1', [deviceId]);
    if (!device.rowCount) throw new Error('Dispositivo no registrado.');
    const authenticated = await authenticatedDevice(client, req, deviceId);
    if (!authenticated) throw new Error('Dispositivo sin activación. Ingresa tu código comercial en Configuración LAN / Cloud.');

    await lockSyncChanges(client, changes);

    for (const change of changes) {
      const changeId = String(change.id || '');
      const entity = String(change.entity || '');
      const entityId = String(change.entityId || '');
      const companyId = change.companyId ? String(change.companyId) : null;
      if (!changeId || !entityId || !CORE_ENTITIES.has(entity)) throw new Error(`Cambio inválido: ${changeId || '(sin id)'}`);

      const seen = await client.query('SELECT 1 FROM sync_inbox_receipts WHERE change_id=$1', [changeId]);
      if (seen.rowCount) {
        ackedIds.push(changeId);
        continue;
      }

      if (!companyId) throw new Error('El cambio debe indicar su empresa.');
      if (companyId) {
        const companyExists = await client.query('SELECT 1 FROM empresas WHERE id=$1', [companyId]);
        const firstCompanyPush = entity === 'empresas' && !companyExists.rowCount;
        if (!(await companyAccess(client, deviceId, companyId, authenticated, firstCompanyPush))) {
          throw new Error(`Sin licencia o vínculo válido para la empresa ${companyId}.`);
        }
      }

      if (companyId) {
        await assertChangeOwnership(client, entity, entityId, companyId, change.payload || {}, {
          canAccessCompany: (sourceId) => companyAccess(client, deviceId, sourceId, authenticated),
        });
      }
      const row = await applyCoreChange(client, entity, change.payload || {});
      if (row) {
        if (companyId) await linkDeviceCompany(client, deviceId, companyId);
        await publishSyncChange(client, { changeId, companyId, entity, entityId,
          operation: change.operation || 'UPSERT', payload: canonicalServerPayload(entity, row), deviceId });
        applied++;
      }
      await client.query(
        'INSERT INTO sync_inbox_receipts(change_id,device_id,received_at) VALUES ($1,$2,NOW()) ON CONFLICT (change_id) DO NOTHING',
        [changeId, deviceId],
      );
      ackedIds.push(changeId);
    }
    await client.query('UPDATE alepi_devices SET last_seen_at=NOW() WHERE id=$1', [deviceId]);
    await client.query('COMMIT');
    const cursor = await pool.query('SELECT COALESCE(MAX(seq),0)::text AS cursor FROM sync_change_log');
    res.json({ ok: true, ackedIds, applied, cursor: cursor.rows[0].cursor });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(400).json({ ok: false, error: 'SYNC_PUSH_FAILED', detail: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/sync/pull', async (req, res) => {
  const deviceId = String(req.query.deviceId || '');
  const cursor = Math.max(0, Number(req.query.cursor || 0));
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 250)));
  if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId obligatorio' });
  const client = await pool.connect();
  try {
    if (!(await authenticatedDevice(client, req, deviceId))) {
      return res.status(401).json({ ok: false, error: 'ACTIVATION_REQUIRED' });
    }
    const links = await client.query('SELECT company_id FROM device_companies WHERE device_id=$1', [deviceId]);
    const companyIds = [];
    for (const row of links.rows) {
      if (await companyAccess(client, deviceId, row.company_id, true)) companyIds.push(row.company_id);
    }
    if (!companyIds.length) return res.json({ ok: true, cursor: String(cursor), hasMore: false, changes: [] });
    const result = await client.query(
      `SELECT seq,empresa_id,entidad,entidad_id,operacion,payload,origin_device_id,created_at
       FROM sync_change_log
       WHERE seq > $1 AND empresa_id = ANY($2::text[])
       ORDER BY seq ASC
       LIMIT $3`,
      [cursor, companyIds, limit],
    );
    const nextCursor = result.rows.length ? String(result.rows[result.rows.length - 1].seq) : String(cursor);
    res.json({
      ok: true,
      cursor: nextCursor,
      hasMore: result.rows.length === limit,
      changes: result.rows.map((r) => ({
        seq: String(r.seq),
        companyId: r.empresa_id,
        entity: r.entidad,
        entityId: r.entidad_id,
        operation: r.operacion,
        payload: r.payload,
        originDeviceId: r.origin_device_id,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'SYNC_PULL_FAILED', detail: error.message });
  } finally { client.release(); }
});

app.post('/api/pairing/create', async (req, res) => {
  const { deviceId, companyId } = req.body || {};
  if (!deviceId || !companyId) return res.status(400).json({ ok: false, error: 'deviceId y companyId obligatorios' });
  const client = await pool.connect();
  try {
    const authenticated = await authenticatedDevice(client, req, deviceId);
    if (!authenticated) return res.status(401).json({ ok: false, error: 'ACTIVATION_REQUIRED' });
    const authorized = await companyAccess(client, deviceId, companyId, authenticated);
    if (!authorized) return res.status(403).json({ ok: false, error: 'DEVICE_NOT_LINKED_TO_COMPANY' });
    let code;
    for (let i = 0; i < 10; i++) {
      code = pairingCode();
      const existing = await client.query('SELECT 1 FROM device_pair_codes WHERE code=$1', [code]);
      if (!existing.rowCount) break;
    }
    const result = await client.query(
      `INSERT INTO device_pair_codes(code,company_id,created_by_device_id,created_at,expires_at,status)
       VALUES ($1,$2,$3,NOW(),NOW()+INTERVAL '15 minutes','ACTIVE')
       RETURNING code, expires_at`,
      [code, companyId, deviceId],
    );
    res.json({ ok: true, code: result.rows[0].code, expiresAt: result.rows[0].expires_at });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'PAIRING_CREATE_FAILED', detail: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/pairing/consume', async (req, res) => {
  const { code, deviceId, deviceCode, platform, appVersion, label } = req.body || {};
  if (!code || !deviceId || !deviceCode) return res.status(400).json({ ok: false, error: 'code, deviceId y deviceCode obligatorios' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pair = await client.query('SELECT * FROM device_pair_codes WHERE UPPER(code)=UPPER($1) FOR UPDATE', [String(code).trim()]);
    if (!pair.rowCount) throw new Error('Código de vinculación no encontrado.');
    const row = pair.rows[0];
    if (row.status !== 'ACTIVE' || row.used_at) throw new Error('El código ya fue utilizado.');
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('El código de vinculación venció. Genera uno nuevo.');

    const licenseRows = await client.query('SELECT * FROM commercial_licenses WHERE company_id=$1 FOR UPDATE', [row.company_id]);
    const sourceAuthorized = await deviceHasCompany(client, row.created_by_device_id, row.company_id);
    const countRows = await client.query('SELECT COUNT(*)::int AS total FROM device_companies WHERE company_id=$1', [row.company_id]);
    const alreadyLinked = await deviceHasCompany(client, deviceId, row.company_id);
    if (licenseRows.rowCount && !eligibleForPairing({
      license: licenseRows.rows[0], sourceAuthorized, existingDevices: countRows.rows[0].total, alreadyLinked,
    })) throw new Error('La licencia venció o alcanzó su límite de dispositivos.');
    if (!licenseRows.rowCount && commercialStrict) throw new Error('Esta empresa aún no tiene licencia comercial.');

    const existingToken = bearerToken(req.headers.authorization);
    const previousCredential = await client.query('SELECT 1 FROM commercial_device_tokens WHERE device_id=$1 AND revoked_at IS NULL', [deviceId]);
    if (previousCredential.rowCount && (!existingToken || !(await authenticatedDevice(client, req, deviceId)))) {
      throw new Error('El dispositivo ya tiene una credencial diferente.');
    }

    await client.query(
      `INSERT INTO alepi_devices(id,device_code,platform,app_version,label,first_seen_at,last_seen_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET device_code=EXCLUDED.device_code,platform=EXCLUDED.platform,
         app_version=EXCLUDED.app_version,label=COALESCE(EXCLUDED.label,alepi_devices.label),last_seen_at=NOW()`,
      [deviceId, deviceCode, platform || 'ANDROID', appVersion || null, label || null],
    );
    await linkDeviceCompany(client, deviceId, row.company_id);
    let token = null;
    if (!existingToken) {
      token = createDeviceToken();
      await client.query(
        `INSERT INTO commercial_device_tokens(device_id,token_hash)
         VALUES($1,$2) ON CONFLICT(device_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,issued_at=NOW(),revoked_at=NULL`,
        [deviceId, hashDeviceToken(token)],
      );
    }
    await client.query(
      `UPDATE device_pair_codes SET status='USED',used_at=NOW(),used_by_device_id=$1 WHERE code=$2`,
      [deviceId, row.code],
    );
    const snapshot = await companySnapshot(client, row.company_id);
    const cursorResult = await client.query('SELECT COALESCE(MAX(seq),0)::text AS cursor FROM sync_change_log WHERE empresa_id=$1', [row.company_id]);
    await client.query('COMMIT');
    res.json({ ok: true, companyId: row.company_id, cursor: cursorResult.rows[0].cursor,
      snapshot, apiToken: token, expiresAt: licenseRows.rows[0]?.expires_at || null });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(400).json({ ok: false, error: 'PAIRING_CONSUME_FAILED', detail: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/sync/status', async (_req, res) => {
  try {
    const devices = await pool.query('SELECT COUNT(*)::int AS total FROM alepi_devices');
    const changes = await pool.query('SELECT COALESCE(MAX(seq),0)::bigint AS cursor FROM sync_change_log');
    const links = await pool.query('SELECT COUNT(*)::int AS total FROM device_companies');
    res.json({ ok: true, devices: devices.rows[0].total, linkedCompanies: links.rows[0].total, cursor: String(changes.rows[0].cursor) });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'SYNC_STATUS_FAILED', detail: error.message });
  }
});

app.get('/p/barberia/:companyId', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(renderBarberiaPortal(req.params.companyId));
});

app.get('/p/hotel/:companyId/h/:numero', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(renderHotelPortal(req.params.companyId, req.params.numero));
});

app.use('/api/live', createLiveRouter(pool));

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'NOT_FOUND', path: req.path });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ALEPI Business API v0.9.0 escuchando en http://0.0.0.0:${PORT}`);
  console.log('SQLite sigue siendo operativo si esta API no está disponible.');
});
