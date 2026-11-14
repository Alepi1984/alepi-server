const express = require('express');
const crypto = require('crypto');

function hashPin(pin) {
  return crypto.createHash('sha256').update('ALEPI_BUSINESS_CORE_V1::' + String(pin).trim()).digest('hex');
}

function newId() {
  return crypto.randomUUID();
}

function createLiveRouter(pool) {
  const router = express.Router();

  // 1. Registro inicial de negocio (Dueño + Empresa + Sucursal Principal)
  router.post('/auth/register-company', async (req, res) => {
    const { companyName, businessType, branchName, adminName, username, pin } = req.body || {};

    if (!companyName?.trim() || !businessType?.trim() || !adminName?.trim() ||
        !username?.trim() || String(pin || '').trim().length < 4) {
      return res.status(400).json({
        ok: false,
        error: 'VALIDATION_ERROR',
        message: 'Todos los campos son obligatorios y el PIN debe tener al menos 4 dígitos.',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pinHash = hashPin(pin);

      // Verificar si el usuario ya existe
      const existingUser = await client.query(
        'SELECT id, nombre, credential_hash FROM usuarios WHERE LOWER(usuario) = LOWER($1)',
        [username.trim()]
      );

      let userId;
      let finalAdminName = adminName.trim();

      if (existingUser.rowCount > 0) {
        const u = existingUser.rows[0];
        if (u.credential_hash && u.credential_hash !== pinHash) {
          await client.query('ROLLBACK');
          return res.status(401).json({
            ok: false,
            error: 'INVALID_CREDENTIALS',
            message: 'El usuario ya existe. Para agregar este nuevo negocio a tu cuenta, ingresa el PIN correcto de tu usuario.',
          });
        }
        // Usuario existente con PIN correcto: se asocia la nueva empresa a su cuenta existente
        userId = u.id;
        if (u.nombre) finalAdminName = u.nombre;
      } else {
        userId = newId();
        const nowUser = new Date().toISOString();
        await client.query(
          `INSERT INTO usuarios (id, usuario, nombre, credential_hash, activo, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, true, $5, $5)`,
          [userId, username.trim(), finalAdminName, pinHash, nowUser]
        );
      }

      const now = new Date().toISOString();
      const companyId = newId();
      const branchId = newId();
      const userCompanyId = newId();

      // Crear empresa
      await client.query(
        `INSERT INTO empresas (id, nombre_comercial, rubro, activo, creado_en, actualizado_en)
         VALUES ($1, $2, $3, true, $4, $4)`,
        [companyId, companyName.trim(), businessType.trim().toUpperCase(), now]
      );

      // Crear sucursal principal
      await client.query(
        `INSERT INTO sucursales (id, empresa_id, codigo, nombre, activo, creado_en, actualizado_en)
         VALUES ($1, $2, '001', $3, true, $4, $4)`,
        [branchId, companyId, branchName?.trim() || 'Principal', now]
      );

      // Vincular usuario como ADMIN de la empresa
      await client.query(
        `INSERT INTO usuario_empresas (id, usuario_id, empresa_id, sucursal_id, rol_codigo, activo, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, 'ADMIN', true, $5, $5)`,
        [userCompanyId, userId, companyId, branchId, now]
      );

      // Dar 30 días de prueba comercial automática
      const licenseExpires = new Date(Date.now() + 30 * 86400000).toISOString();
      await client.query(
        `INSERT INTO commercial_licenses (company_id, business_label, status, max_devices, expires_at, primary_device_id, created_at, updated_at)
         VALUES ($1, $2, 'ACTIVE', 5, $3, 'CLOUD_PRIMARY', $4, $4)
         ON CONFLICT (company_id) DO NOTHING`,
        [companyId, companyName.trim(), licenseExpires, now]
      );

      // Si es Barbería, inicializar catálogo de servicios y profesional principal
      if (businessType.trim().toUpperCase() === 'BARBERIA') {
        const profId = newId();
        await client.query(
          `INSERT INTO barberia_profesionales (id, empresa_id, nombre, alias, estado, comision_pct, activo)
           VALUES ($1, $2, $3, 'Principal', 'LIBRE', 50, true)`,
          [profId, companyId, finalAdminName]
        );

        const serviciosIniciales = [
          ['Corte Clásico / Escolar', 20.00, 30],
          ['Corte Fade / Degradado', 25.00, 35],
          ['Arreglo y Perfilado de Barba', 15.00, 20],
          ['Combo VIP: Corte + Barba + Lavado', 35.00, 45],
        ];
        for (const [sNom, sPre, sDur] of serviciosIniciales) {
          await client.query(
            `INSERT INTO barberia_servicios (id, empresa_id, nombre, precio, duracion_min, activo)
             VALUES ($1, $2, $3, $4, $5, true)`,
            [newId(), companyId, sNom, sPre, sDur]
          );
        }
      }

      await client.query('COMMIT');

      res.status(201).json({
        ok: true,
        message: 'Negocio registrado exitosamente.',
        session: {
          userId,
          userName: username.trim(),
          displayName: adminName.trim(),
          companyId,
          companyName: companyName.trim(),
          branchId,
          branchName: branchName?.trim() || 'Principal',
          businessType: businessType.trim().toUpperCase(),
          roleCode: 'ADMIN',
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error en register-company:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    } finally {
      client.release();
    }
  });

  // 2. Login directo (Usuario + PIN)
  router.post('/auth/login', async (req, res) => {
    const { username, pin } = req.body || {};
    if (!username?.trim() || !pin?.trim()) {
      return res.status(400).json({ ok: false, error: 'MISSING_CREDENTIALS', message: 'Ingresa usuario y PIN.' });
    }

    try {
      const pinHash = hashPin(pin);
      const userRes = await pool.query(
        'SELECT id, usuario, nombre, credential_hash FROM usuarios WHERE LOWER(usuario) = LOWER($1) AND activo = true',
        [username.trim()]
      );

      if (userRes.rowCount === 0 || userRes.rows[0].credential_hash !== pinHash) {
        return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS', message: 'Usuario o PIN incorrecto.' });
      }

      const user = userRes.rows[0];

      // Buscar las empresas a las que este usuario tiene acceso
      const memberships = await pool.query(
        `SELECT e.id AS company_id, e.nombre_comercial, e.rubro,
                s.id AS branch_id, COALESCE(s.nombre, 'Principal') AS branch_nombre,
                r.codigo AS rol_codigo
         FROM usuario_empresas ue
         JOIN empresas e ON e.id = ue.empresa_id AND e.activo = true
         JOIN roles r ON r.id = ue.rol_id
         LEFT JOIN sucursales s ON s.id = ue.sucursal_id AND s.activo = true
         WHERE ue.usuario_id = $1 AND ue.activo = true
         ORDER BY e.nombre_comercial`,
        [user.id]
      );

      if (memberships.rowCount === 0) {
        return res.status(403).json({ ok: false, error: 'NO_ACTIVE_COMPANIES', message: 'No tienes negocios asignados activos.' });
      }

      const sessions = memberships.rows.map((row) => ({
        userId: user.id,
        userName: user.usuario,
        displayName: user.nombre,
        companyId: row.company_id,
        companyName: row.nombre_comercial,
        branchId: row.branch_id || '',
        branchName: row.branch_nombre || 'Principal',
        businessType: row.rubro,
        roleCode: row.rol_codigo,
      }));

      res.json({
        ok: true,
        user: { id: user.id, username: user.usuario, name: user.nombre },
        sessions,
      });
    } catch (err) {
      console.error('Error en login:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 3. Obtener productos de una empresa en vivo
  router.get('/products', async (req, res) => {
    const { companyId, branchId } = req.query;
    if (!companyId) {
      return res.status(400).json({ ok: false, error: 'MISSING_COMPANY_ID' });
    }

    try {
      const rows = await pool.query(
        `SELECT p.id, p.empresa_id, p.codigo_barras, p.nombre, p.precio_venta, p.costo,
                p.unidad, p.foto_base64, p.controla_stock, p.categoria,
                c.nombre AS categoria_nombre,
                COALESCE(s.cantidad, 0)::float AS stock_actual
         FROM productos p
         LEFT JOIN categorias_producto c ON c.id = p.categoria_id
         LEFT JOIN inventario_saldos s ON s.producto_id = p.id AND ($2::text IS NULL OR s.sucursal_id = $2::text)
         WHERE p.empresa_id = $1 AND p.activo = true
         ORDER BY p.nombre ASC`,
        [companyId, branchId || null]
      );

      res.json({ ok: true, products: rows.rows });
    } catch (err) {
      console.error('Error al listar productos:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 4. Guardar / Actualizar producto en vivo
  router.post('/products', async (req, res) => {
    const {
      id, companyId, branchId, name, barcode, price, cost, unit, category, trackStock, initialStock
    } = req.body || {};

    if (!companyId || !name?.trim() || price === undefined) {
      return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', message: 'Empresa, nombre y precio son obligatorios.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = new Date().toISOString();
      const productId = id || newId();
      const numPrice = Number(price) || 0;
      const numCost = Number(cost) || 0;

      await client.query(
        `INSERT INTO productos (id, empresa_id, nombre, codigo_barras, precio_venta, costo, unidad, categoria, controla_stock, activo, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $10)
         ON CONFLICT (id) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           codigo_barras = EXCLUDED.codigo_barras,
           precio_venta = EXCLUDED.precio_venta,
           costo = EXCLUDED.costo,
           unidad = EXCLUDED.unidad,
           categoria = EXCLUDED.categoria,
           controla_stock = EXCLUDED.controla_stock,
           actualizado_en = EXCLUDED.actualizado_en`,
        [productId, companyId, name.trim(), barcode?.trim() || null, numPrice, numCost, unit || 'UND', category || 'General', trackStock !== false, now]
      );

      if (branchId && initialStock !== undefined) {
        const saldoId = newId();
        await client.query(
          `INSERT INTO inventario_saldos (id, empresa_id, sucursal_id, producto_id, cantidad, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (empresa_id, sucursal_id, producto_id) DO UPDATE SET
             cantidad = EXCLUDED.cantidad,
             actualizado_en = EXCLUDED.actualizado_en`,
          [saldoId, companyId, branchId, productId, Number(initialStock) || 0, now]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true, message: 'Producto guardado en vivo.', productId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error al guardar producto:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    } finally {
      client.release();
    }
  });

  // 5. Registrar una Venta completa en vivo (Venta + Detalles + Pagos + Descuento de Stock)
  router.post('/sales', async (req, res) => {
    const {
      companyId, branchId, userId, items, subtotal, discount, total, paymentMethod, amountReceived, change, customerName
    } = req.body || {};

    if (!companyId || !branchId || !userId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'INVALID_SALE_DATA', message: 'Datos de venta incompletos o sin productos.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = new Date().toISOString();
      const saleId = newId();
      const numSubtotal = Number(subtotal) || 0;
      const numDiscount = Number(discount) || 0;
      const numTotal = Number(total) || 0;

      // Auto-asegurar empresa, sucursal y usuario para evitar inconsistencias de FK
      await client.query(
        `INSERT INTO empresas (id, nombre_comercial, rubro, creado_en, actualizado_en)
         VALUES ($1, 'Mi Empresa', 'BARBERIA', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [companyId]
      );
      await client.query(
        `INSERT INTO sucursales (id, empresa_id, nombre, creado_en, actualizado_en)
         VALUES ($1, $2, 'Principal', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [branchId, companyId]
      );
      await client.query(
        `INSERT INTO usuarios (id, username, password_hash, rol, activo, creado_en, actualizado_en)
         VALUES ($1, 'usuario_pos', 'x', 'ADMIN', true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [userId]
      );

      // 1. Insertar cabecera de venta
      await client.query(
        `INSERT INTO ventas (id, empresa_id, sucursal_id, usuario_id, fecha, subtotal, descuento, total, estado, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETADA', $9, $9)`,
        [saleId, companyId, branchId, userId, now, numSubtotal, numDiscount, numTotal, now]
      );

      // 2. Insertar detalles y descontar inventario
      for (const item of items) {
        const detailId = newId();
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const itemTotal = Number(item.total) || (qty * unitPrice);

        await client.query(
          `INSERT INTO venta_detalle (id, venta_id, producto_id, descripcion, cantidad, precio_unitario, total, creado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [detailId, saleId, item.productId || null, item.description || 'Producto', qty, unitPrice, itemTotal, now]
        );

        if (item.productId) {
          // Descontar del saldo de stock en vivo
          await client.query(
            `UPDATE inventario_saldos
             SET cantidad = cantidad - $1, actualizado_en = $2
             WHERE empresa_id = $3 AND sucursal_id = $4 AND producto_id = $5`,
            [qty, now, companyId, branchId, item.productId]
          );
        }
      }

      // 3. Registrar pago
      const paymentId = newId();
      await client.query(
        `INSERT INTO pagos (id, venta_id, metodo, monto, creado_en)
         VALUES ($1, $2, $3, $4, $5)`,
        [paymentId, saleId, paymentMethod || 'EFECTIVO', numTotal, now]
      );

      await client.query('COMMIT');

      res.status(201).json({
        ok: true,
        message: 'Venta registrada en vivo.',
        saleId,
        documentNumber: `V-${saleId.substring(0, 8).toUpperCase()}`,
        date: now,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error al registrar venta:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    } finally {
      client.release();
    }
  });

  // ==========================================
  // RUTAS VERTICAL BARBERÍA / SALÓN
  // ==========================================

  // 1. Resumen de Barbería (Profesionales, Servicios y Turnos del día)
  router.get('/barberia/overview', async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ ok: false, error: 'Falta companyId' });

    try {
      // Auto-asegurar que la empresa exista y tenga servicios configurados
      const empRes = await pool.query('SELECT id FROM empresas WHERE id = $1', [companyId]);
      if (empRes.rowCount === 0) {
        await pool.query(
          `INSERT INTO empresas (id, nombre_comercial, rubro, creado_en, actualizado_en)
           VALUES ($1, 'Mi Barbería', 'BARBERIA', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [companyId]
        );
      }

      const servCount = await pool.query('SELECT COUNT(*)::int as count FROM barberia_servicios WHERE empresa_id = $1', [companyId]);
      if (servCount.rows[0].count === 0) {
        const profId = newId();
        await pool.query(
          `INSERT INTO barberia_profesionales (id, empresa_id, nombre, alias, estado, comision_pct, activo)
           VALUES ($1, $2, 'Barbero Principal', 'Master', 'LIBRE', 50, true)`,
          [profId, companyId]
        );
        const serviciosIniciales = [
          ['Corte Clásico / Escolar', 20.00, 30],
          ['Corte Fade / Degradado', 25.00, 35],
          ['Arreglo y Perfilado de Barba', 15.00, 20],
          ['Combo VIP: Corte + Barba + Lavado', 35.00, 45],
        ];
        for (const [sNom, sPre, sDur] of serviciosIniciales) {
          await pool.query(
            `INSERT INTO barberia_servicios (id, empresa_id, nombre, precio, duracion_min, activo)
             VALUES ($1, $2, $3, $4, $5, true)`,
            [newId(), companyId, sNom, sPre, sDur]
          );
        }
      }

      const [profs, servs, turnos] = await Promise.all([
        pool.query('SELECT * FROM barberia_profesionales WHERE empresa_id = $1 AND activo = true ORDER BY creado_en ASC', [companyId]),
        pool.query('SELECT * FROM barberia_servicios WHERE empresa_id = $1 AND activo = true ORDER BY precio ASC', [companyId]),
        pool.query(
          `SELECT t.*, p.nombre as profesional_nombre, s.nombre as servicio_nombre, s.precio as servicio_precio, s.duracion_min
           FROM barberia_turnos t
           LEFT JOIN barberia_profesionales p ON p.id = t.profesional_id
           LEFT JOIN barberia_servicios s ON s.id = t.servicio_id
           WHERE t.empresa_id = $1 AND t.creado_en >= CURRENT_DATE
           ORDER BY t.numero_turno ASC`,
          [companyId]
        ),
      ]);

      res.json({
        ok: true,
        profesionales: profs.rows,
        servicios: servs.rows,
        turnos: turnos.rows,
      });
    } catch (err) {
      console.error('Error en barberia/overview:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 2. Registrar turno en cola
  router.post('/barberia/turnos', async (req, res) => {
    const { companyId, branchId, clienteNombre, clienteTelefono, servicioId, profesionalId } = req.body || {};
    if (!companyId || !clienteNombre?.trim()) {
      return res.status(400).json({ ok: false, error: 'companyId y clienteNombre son obligatorios' });
    }

    try {
      // Auto-asegurar existencia de la empresa en PostgreSQL para evitar errores de llave foránea
      const empRes = await pool.query('SELECT id FROM empresas WHERE id = $1', [companyId]);
      if (empRes.rowCount === 0) {
        await pool.query(
          `INSERT INTO empresas (id, nombre_comercial, rubro, creado_en, actualizado_en)
           VALUES ($1, 'Mi Barbería', 'BARBERIA', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [companyId]
        );
      }

      // Validar llaves foráneas opcionales
      let validBranchId = null;
      if (branchId) {
        const bCheck = await pool.query('SELECT 1 FROM sucursales WHERE id = $1', [branchId]);
        if (bCheck.rowCount > 0) validBranchId = branchId;
      }

      let validProfId = null;
      if (profesionalId) {
        const pCheck = await pool.query('SELECT 1 FROM barberia_profesionales WHERE id = $1', [profesionalId]);
        if (pCheck.rowCount > 0) validProfId = profesionalId;
      }

      let validServId = null;
      if (servicioId) {
        const sCheck = await pool.query('SELECT 1 FROM barberia_servicios WHERE id = $1', [servicioId]);
        if (sCheck.rowCount > 0) validServId = servicioId;
      }

      // Calcular siguiente número de turno del día
      const countRes = await pool.query(
        'SELECT COALESCE(MAX(numero_turno), 0) + 1 AS siguiente FROM barberia_turnos WHERE empresa_id = $1 AND creado_en >= CURRENT_DATE',
        [companyId]
      );
      const siguienteTurno = Number(countRes.rows[0].siguiente) || 1;
      const turnoId = newId();
      const now = new Date().toISOString();

      await pool.query(
        `INSERT INTO barberia_turnos (id, empresa_id, sucursal_id, profesional_id, servicio_id, cliente_nombre, cliente_telefono, numero_turno, estado, creado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'EN_ESPERA', $9)`,
        [turnoId, companyId, validBranchId, validProfId, validServId, clienteNombre.trim(), clienteTelefono?.trim() || null, siguienteTurno, now]
      );

      res.status(201).json({
        ok: true,
        message: 'Turno registrado en cola.',
        turno: {
          id: turnoId,
          numeroTurno: siguienteTurno,
          clienteNombre: clienteNombre.trim(),
          estado: 'EN_ESPERA',
          creadoEn: now,
        },
      });
    } catch (err) {
      console.error('Error al registrar turno:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 3. Comenzar a atender turno (asigna barbero)
  router.post('/barberia/turnos/atender', async (req, res) => {
    const { turnoId, profesionalId } = req.body || {};
    if (!turnoId) return res.status(400).json({ ok: false, error: 'Falta turnoId' });

    try {
      const now = new Date().toISOString();
      await pool.query(
        `UPDATE barberia_turnos
         SET estado = 'EN_ATENCION', profesional_id = COALESCE($1, profesional_id), inicio_atencion = $2
         WHERE id = $3`,
        [profesionalId || null, now, turnoId]
      );

      if (profesionalId) {
        await pool.query(
          "UPDATE barberia_profesionales SET estado = 'ATENDIENDO' WHERE id = $1",
          [profesionalId]
        );
      }

      res.json({ ok: true, message: 'Turno en atención.' });
    } catch (err) {
      console.error('Error al atender turno:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 4. Finalizar atención del turno
  router.post('/barberia/turnos/finalizar', async (req, res) => {
    const { turnoId, profesionalId } = req.body || {};
    if (!turnoId) return res.status(400).json({ ok: false, error: 'Falta turnoId' });

    try {
      const now = new Date().toISOString();
      await pool.query(
        "UPDATE barberia_turnos SET estado = 'FINALIZADO', fin_atencion = $1 WHERE id = $2",
        [now, turnoId]
      );

      if (profesionalId) {
        await pool.query(
          "UPDATE barberia_profesionales SET estado = 'LIBRE' WHERE id = $1",
          [profesionalId]
        );
      }

      res.json({ ok: true, message: 'Turno completado.' });
    } catch (err) {
      console.error('Error al finalizar turno:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 5. Estado público para portal Web QR del cliente
  router.get('/barberia/public/:companyId/status', async (req, res) => {
    const { companyId } = req.params;
    try {
      const [empRes, profs, enEspera, enAtencion, servs] = await Promise.all([
        pool.query('SELECT nombre_comercial FROM empresas WHERE id = $1', [companyId]),
        pool.query('SELECT id, nombre, alias, estado FROM barberia_profesionales WHERE empresa_id = $1 AND activo = true ORDER BY nombre ASC', [companyId]),
        pool.query(
          `SELECT t.numero_turno, t.cliente_nombre, s.nombre as servicio, s.duracion_min
           FROM barberia_turnos t
           LEFT JOIN barberia_servicios s ON s.id = t.servicio_id
           WHERE t.empresa_id = $1 AND t.creado_en >= CURRENT_DATE AND t.estado = 'EN_ESPERA'
           ORDER BY t.numero_turno ASC`,
          [companyId]
        ),
        pool.query(
          `SELECT t.numero_turno, t.cliente_nombre, p.nombre as barbero, s.nombre as servicio
           FROM barberia_turnos t
           LEFT JOIN barberia_profesionales p ON p.id = t.profesional_id
           LEFT JOIN barberia_servicios s ON s.id = t.servicio_id
           WHERE t.empresa_id = $1 AND t.creado_en >= CURRENT_DATE AND t.estado = 'EN_ATENCION'
           ORDER BY t.inicio_atencion ASC`,
          [companyId]
        ),
        pool.query('SELECT id, nombre, precio, duracion_min FROM barberia_servicios WHERE empresa_id = $1 AND activo = true ORDER BY precio ASC', [companyId]),
      ]);

      if (empRes.rowCount === 0) {
        return res.status(404).json({ ok: false, error: 'Negocio no encontrado' });
      }

      // Cálculo de tiempo de espera estimado: aprox 20 min por persona en espera divido entre barberos activos
      const barberosActivos = Math.max(1, profs.rows.filter(p => p.estado !== 'DESCANSO').length);
      const tiempoAproxMin = Math.round((enEspera.rows.length * 20) / barberosActivos);

      res.json({
        ok: true,
        empresa: empRes.rows[0].nombre_comercial,
        barberos: profs.rows,
        enAtencion: enAtencion.rows,
        enEspera: enEspera.rows,
        totalEnEspera: enEspera.rows.length,
        tiempoEstimadoMinutos: tiempoAproxMin,
        servicios: servs.rows,
      });
    } catch (err) {
      console.error('Error en barberia status public:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 6. Cancelar turno
  router.post('/barberia/turnos/cancelar', async (req, res) => {
    const { turnoId } = req.body || {};
    if (!turnoId) return res.status(400).json({ ok: false, error: 'Falta turnoId' });

    try {
      const t = await pool.query('SELECT profesional_id, estado FROM barberia_turnos WHERE id = $1', [turnoId]);
      if (t.rowCount === 0) return res.status(404).json({ ok: false, error: 'Turno no encontrado' });

      await pool.query("UPDATE barberia_turnos SET estado = 'CANCELADO', fin_atencion = NOW() WHERE id = $1", [turnoId]);

      if (t.rows[0].estado === 'EN_ATENCION' && t.rows[0].profesional_id) {
        await pool.query("UPDATE barberia_profesionales SET estado = 'LIBRE' WHERE id = $1", [t.rows[0].profesional_id]);
      }

      res.json({ ok: true, message: 'Turno cancelado exitosamente.' });
    } catch (err) {
      console.error('Error al cancelar turno:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 7. Reporte diario de comisiones por barbero
  router.get('/barberia/comisiones', async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ ok: false, error: 'Falta companyId' });

    try {
      const q = `
        SELECT p.id, p.nombre, p.alias, p.comision_pct, p.estado,
               COUNT(t.id)::int as turnos_realizados,
               COALESCE(SUM(s.precio), 0)::numeric(12,2) as total_ventas,
               COALESCE(SUM(s.precio * (p.comision_pct / 100.0)), 0)::numeric(12,2) as total_comision,
               COALESCE(SUM(s.precio * (1.0 - (p.comision_pct / 100.0))), 0)::numeric(12,2) as ganancia_negocio
        FROM barberia_profesionales p
        LEFT JOIN barberia_turnos t ON t.profesional_id = p.id AND t.estado = 'FINALIZADO' AND t.creado_en >= CURRENT_DATE
        LEFT JOIN barberia_servicios s ON s.id = t.servicio_id
        WHERE p.empresa_id = $1 AND p.activo = true
        GROUP BY p.id, p.nombre, p.alias, p.comision_pct, p.estado
        ORDER BY total_ventas DESC, p.nombre ASC
      `;
      const result = await pool.query(q, [companyId]);
      res.json({ ok: true, comisiones: result.rows });
    } catch (err) {
      console.error('Error al obtener comisiones:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 8. Crear barbero
  router.post('/barberia/profesionales', async (req, res) => {
    const { companyId, nombre, alias, comisionPct } = req.body || {};
    if (!companyId || !nombre?.trim()) return res.status(400).json({ ok: false, error: 'Nombre es requerido' });

    try {
      const id = newId();
      const pct = Number(comisionPct) || 50;
      await pool.query(
        `INSERT INTO barberia_profesionales (id, empresa_id, nombre, alias, estado, comision_pct, activo)
         VALUES ($1, $2, $3, $4, 'LIBRE', $5, true)`,
        [id, companyId, nombre.trim(), alias?.trim() || null, pct]
      );
      res.status(201).json({ ok: true, id, message: 'Barbero registrado.' });
    } catch (err) {
      console.error('Error al registrar barbero:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 9. Actualizar barbero
  router.put('/barberia/profesionales/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, alias, estado, comisionPct, activo } = req.body || {};

    try {
      await pool.query(
        `UPDATE barberia_profesionales
         SET nombre = COALESCE($1, nombre),
             alias = COALESCE($2, alias),
             estado = COALESCE($3, estado),
             comision_pct = COALESCE($4, comision_pct),
             activo = COALESCE($5, activo)
         WHERE id = $6`,
        [nombre?.trim(), alias?.trim(), estado, comisionPct !== undefined ? Number(comisionPct) : null, activo, id]
      );
      res.json({ ok: true, message: 'Barbero actualizado.' });
    } catch (err) {
      console.error('Error al actualizar barbero:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 10. Crear servicio
  router.post('/barberia/servicios', async (req, res) => {
    const { companyId, nombre, precio, duracionMin } = req.body || {};
    if (!companyId || !nombre?.trim()) return res.status(400).json({ ok: false, error: 'Nombre es requerido' });

    try {
      const id = newId();
      const p = Number(precio) || 20;
      const d = Number(duracionMin) || 30;
      await pool.query(
        `INSERT INTO barberia_servicios (id, empresa_id, nombre, precio, duracion_min, activo)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [id, companyId, nombre.trim(), p, d]
      );
      res.status(201).json({ ok: true, id, message: 'Servicio registrado.' });
    } catch (err) {
      console.error('Error al registrar servicio:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 11. Actualizar servicio
  router.put('/barberia/servicios/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, precio, duracionMin, activo } = req.body || {};

    try {
      await pool.query(
        `UPDATE barberia_servicios
         SET nombre = COALESCE($1, nombre),
             precio = COALESCE($2, precio),
             duracion_min = COALESCE($3, duracion_min),
             activo = COALESCE($4, activo)
         WHERE id = $5`,
        [nombre?.trim(), precio !== undefined ? Number(precio) : null, duracionMin !== undefined ? Number(duracionMin) : null, activo, id]
      );
      res.json({ ok: true, message: 'Servicio actualizado.' });
    } catch (err) {
      console.error('Error al actualizar servicio:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // ==========================================
  // RUTAS VERTICAL HOTEL / HOSPEDAJE
  // ==========================================

  // 1. Resumen de Hotel (Habitaciones y Pedidos de Room Service activos)
  router.get('/hotel/overview', async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ ok: false, error: 'Falta companyId' });

    try {
      // Auto-asegurar que la empresa exista
      const empRes = await pool.query('SELECT id FROM empresas WHERE id = $1', [companyId]);
      if (empRes.rowCount === 0) {
        await pool.query(
          `INSERT INTO empresas (id, nombre_comercial, rubro, creado_en, actualizado_en)
           VALUES ($1, 'Mi Hotel / Hospedaje', 'HOTEL', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [companyId]
        );
      }

      // Auto-inicializar habitaciones por defecto si está vacío
      const roomCount = await pool.query('SELECT COUNT(*)::int as count FROM hotel_habitaciones WHERE empresa_id = $1', [companyId]);
      if (roomCount.rows[0].count === 0) {
        const habitacionesDefecto = [
          ['101', 'SIMPLE', 50.00],
          ['102', 'DOBLE', 80.00],
          ['103', 'SIMPLE', 50.00],
          ['201', 'MATRIMONIAL', 90.00],
          ['202', 'SUITE', 150.00],
          ['203', 'FAMILIAR', 120.00],
        ];
        for (const [num, tipo, precio] of habitacionesDefecto) {
          await pool.query(
            `INSERT INTO hotel_habitaciones (id, empresa_id, numero, tipo, precio_noche, estado, activo)
             VALUES ($1, $2, $3, $4, $5, 'DISPONIBLE', true)`,
            [newId(), companyId, num, tipo, precio]
          );
        }
      }

      const [rooms, pedidos, mensajes] = await Promise.all([
        pool.query('SELECT * FROM hotel_habitaciones WHERE empresa_id = $1 AND activo = true ORDER BY numero ASC', [companyId]),
        pool.query(
          `SELECT * FROM hotel_pedidos
           WHERE empresa_id = $1 AND estado != 'ARCHIVADO'
           ORDER BY creado_en DESC LIMIT 40`,
          [companyId]
        ),
        pool.query(
          `SELECT * FROM hotel_mensajes
           WHERE empresa_id = $1 AND archivado = false
           ORDER BY creado_en ASC`,
          [companyId]
        ),
      ]);

      res.json({
        ok: true,
        habitaciones: rooms.rows,
        pedidos: pedidos.rows,
        mensajes: mensajes.rows,
      });
    } catch (err) {
      console.error('Error en hotel/overview:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 2. Check-in de Huésped
  router.post('/hotel/habitaciones/checkin', async (req, res) => {
    const {
      habitacionId,
      huespedActual,
      huespedDocumento,
      noches,
      precioNoche,
      montoAdelanto,
      metodoAdelanto,
      modalidad,
      horas,
      nacionalidad,
      ciudadOrigen,
    } = req.body || {};
    if (!habitacionId || !huespedActual?.trim()) {
      return res.status(400).json({ ok: false, error: 'habitacionId y huespedActual son obligatorios' });
    }

    try {
      const now = new Date();
      const numNoches = Number(noches) || 1;
      const numPrecio = Number(precioNoche) || 60.00;
      const numAdelanto = Number(montoAdelanto) || 0.00;
      const mod = modalidad === 'HORAS' ? 'HORAS' : 'NOCHE';
      const numHoras = Number(horas) || 4;
      const pinEstadia = String(Math.floor(1000 + Math.random() * 9000));
      const tokenEstadia = crypto.randomUUID();

      let dCheckout = new Date(now);
      if (mod === 'HORAS') {
        dCheckout.setHours(dCheckout.getHours() + numHoras);
      } else {
        dCheckout.setDate(dCheckout.getDate() + numNoches);
        dCheckout.setHours(12, 0, 0, 0);
      }

      await pool.query(
        `UPDATE hotel_habitaciones
         SET estado = 'OCUPADA',
             huesped_actual = $1,
             huesped_documento = $2,
             noches = $3,
             precio_noche = $4,
             checkin_en = $5,
             checkout_estimado = $6,
             total_consumos = 0,
             pin_estadia = $7,
             token_estadia = $8,
             monto_adelanto = $9,
             metodo_adelanto = $10,
             modalidad = $11,
             horas = $12,
             nacionalidad = $13,
             ciudad_origen = $14
         WHERE id = $15`,
        [
          huespedActual.trim(),
          huespedDocumento?.trim() || null,
          numNoches,
          numPrecio,
          now.toISOString(),
          dCheckout.toISOString(),
          pinEstadia,
          tokenEstadia,
          numAdelanto,
          metodoAdelanto || 'EFECTIVO',
          mod,
          numHoras,
          nacionalidad?.trim() || null,
          ciudadOrigen?.trim() || null,
          habitacionId,
        ]
      );

      res.json({
        ok: true,
        message: 'Check-in registrado exitosamente.',
        pinEstadia,
        tokenEstadia,
        checkoutEstimado: dCheckout.toISOString(),
      });
    } catch (err) {
      console.error('Error en hotel checkin:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 3. Check-out de Huésped (archiva pedidos y chat, guarda en historial de estadías, pasa a Limpieza)
  router.post('/hotel/habitaciones/checkout', async (req, res) => {
    const { habitacionId, metodoPago } = req.body || {};
    if (!habitacionId) return res.status(400).json({ ok: false, error: 'Falta habitacionId' });

    try {
      // 1. Obtener datos completos de la habitación antes de limpiar
      const roomRes = await pool.query(
        'SELECT * FROM hotel_habitaciones WHERE id = $1',
        [habitacionId]
      );
      if (roomRes.rowCount > 0) {
        const room = roomRes.rows[0];

        // Guardar en Libro de Registro de Huéspedes (Historial de Estadías)
        if (room.huesped_actual) {
          const totalEstadia = Number(room.precio_noche || 0);
          const totalCons = Number(room.total_consumos || 0);
          const adelanto = Number(room.monto_adelanto || 0);
          const totalGeneral = totalEstadia + totalCons;

          await pool.query(
            `INSERT INTO hotel_historial_estadias (
               id, empresa_id, habitacion_numero, huesped_nombre, huesped_documento,
               nacionalidad, ciudad_origen, modalidad, noches, horas,
               precio_hospedaje, total_consumos, monto_adelanto, monto_total, metodo_pago,
               checkin_en, checkout_en
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())`,
            [
              newId(),
              room.empresa_id,
              room.numero,
              room.huesped_actual,
              room.huesped_documento || null,
              room.nacionalidad || null,
              room.ciudad_origen || null,
              room.modalidad || 'NOCHE',
              room.noches || 1,
              room.horas || 0,
              totalEstadia,
              totalCons,
              adelanto,
              totalGeneral,
              metodoPago || 'EFECTIVO',
              room.checkin_en || new Date(),
            ]
          );
        }

        // Archivar pedidos de la estadía finalizada
        await pool.query(
          `UPDATE hotel_pedidos
           SET estado = 'ARCHIVADO', atendido_en = COALESCE(atendido_en, NOW())
           WHERE empresa_id = $1 AND habitacion_numero = $2 AND estado != 'ARCHIVADO'`,
          [room.empresa_id, room.numero]
        );

        // Archivar mensajes de chat de la estadía finalizada
        await pool.query(
          `UPDATE hotel_mensajes
           SET archivado = true
           WHERE empresa_id = $1 AND habitacion_numero = $2 AND archivado = false`,
          [room.empresa_id, room.numero]
        );
      }

      await pool.query(
        `UPDATE hotel_habitaciones
         SET estado = 'LIMPIEZA',
             huesped_actual = null,
             huesped_documento = null,
             noches = 1,
             checkin_en = null,
             checkout_estimado = null,
             total_consumos = 0,
             pin_estadia = null,
             token_estadia = null,
             monto_adelanto = 0,
             metodo_adelanto = 'EFECTIVO',
             modalidad = 'NOCHE',
             horas = 0,
             nacionalidad = null,
             ciudad_origen = null
         WHERE id = $1`,
        [habitacionId]
      );

      res.json({ ok: true, message: 'Check-out completado. Guardado en libro de huéspedes y habitación en limpieza.' });
    } catch (err) {
      console.error('Error en hotel checkout:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 4. Marcar habitación lista tras limpieza
  router.post('/hotel/habitaciones/limpieza-lista', async (req, res) => {
    const { habitacionId } = req.body || {};
    if (!habitacionId) return res.status(400).json({ ok: false, error: 'Falta habitacionId' });

    try {
      await pool.query(
        "UPDATE hotel_habitaciones SET estado = 'DISPONIBLE' WHERE id = $1",
        [habitacionId]
      );

      res.json({ ok: true, message: 'Habitación lista y disponible.' });
    } catch (err) {
      console.error('Error en limpieza lista:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 5. Registrar pedido de Room Service (desde el portal QR del huésped con token/pin)
  router.post('/hotel/pedidos', async (req, res) => {
    const { companyId, habitacionNumero, detalle, montoTotal, huespedNombre, tokenEstadia, pinEstadia } = req.body || {};
    if (!companyId || !habitacionNumero || !detalle?.trim()) {
      return res.status(400).json({ ok: false, error: 'Faltan datos para el pedido' });
    }

    try {
      // 1. Validar que la habitación esté realmente ocupada
      const roomCheck = await pool.query(
        'SELECT id, estado, token_estadia, pin_estadia, huesped_actual FROM hotel_habitaciones WHERE empresa_id = $1 AND numero = $2',
        [companyId, String(habitacionNumero)]
      );
      if (roomCheck.rowCount === 0 || roomCheck.rows[0].estado !== 'OCUPADA') {
        return res.status(403).json({
          ok: false,
          error: 'ROOM_NOT_OCCUPIED',
          message: 'Esta habitación no tiene una estadía activa en recepción. La sesión está cerrada.',
        });
      }

      const room = roomCheck.rows[0];
      // Si se envió token o pin, verificar que corresponda a la estadía actual
      if (tokenEstadia && room.token_estadia && tokenEstadia !== room.token_estadia) {
        return res.status(401).json({
          ok: false,
          error: 'SESSION_EXPIRED',
          message: 'Tu sesión ha expirado porque la estadía anterior fue finalizada por recepción.',
        });
      }
      if (pinEstadia && room.pin_estadia && pinEstadia !== room.pin_estadia) {
        return res.status(401).json({
          ok: false,
          error: 'INVALID_PIN',
          message: 'El PIN de estadía ingresado es incorrecto.',
        });
      }

      const pedidoId = newId();
      const numMonto = Number(montoTotal) || 0.00;
      const huespedFinal = huespedNombre || room.huesped_actual || 'Huésped';

      await pool.query(
        `INSERT INTO hotel_pedidos (id, empresa_id, habitacion_numero, huesped_nombre, detalle, monto_total, estado, token_estadia)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE', $7)`,
        [pedidoId, companyId, String(habitacionNumero), huespedFinal, detalle.trim(), numMonto, room.token_estadia]
      );

      // Si tiene costo, sumarlo a consumos de la habitación
      if (numMonto > 0) {
        await pool.query(
          `UPDATE hotel_habitaciones
           SET total_consumos = total_consumos + $1
           WHERE empresa_id = $2 AND numero = $3`,
          [numMonto, companyId, String(habitacionNumero)]
        );
      }

      res.status(201).json({ ok: true, message: 'Pedido enviado a recepción.', pedidoId });
    } catch (err) {
      console.error('Error al registrar pedido hotel:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 6. Atender pedido de Room Service
  router.post('/hotel/pedidos/atender', async (req, res) => {
    const { pedidoId } = req.body || {};
    if (!pedidoId) return res.status(400).json({ ok: false, error: 'Falta pedidoId' });

    try {
      await pool.query(
        "UPDATE hotel_pedidos SET estado = 'ENTREGADO', atendido_en = NOW() WHERE id = $1",
        [pedidoId]
      );

      res.json({ ok: true, message: 'Pedido entregado.' });
    } catch (err) {
      console.error('Error al atender pedido:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 7. Enviar Mensaje de Chat (Huésped <-> Recepción)
  router.post('/hotel/mensajes', async (req, res) => {
    const { companyId, habitacionNumero, remitente, mensaje, huespedNombre, tokenEstadia } = req.body || {};
    if (!companyId || !habitacionNumero || !mensaje?.trim()) {
      return res.status(400).json({ ok: false, error: 'Faltan datos para el mensaje' });
    }

    try {
      const roomCheck = await pool.query(
        'SELECT id, estado, token_estadia, pin_estadia, huesped_actual FROM hotel_habitaciones WHERE empresa_id = $1 AND numero = $2',
        [companyId, String(habitacionNumero)]
      );

      if (remitente !== 'RECEPCION') {
        if (roomCheck.rowCount === 0 || roomCheck.rows[0].estado !== 'OCUPADA') {
          return res.status(403).json({
            ok: false,
            error: 'ROOM_NOT_OCCUPIED',
            message: 'Esta habitación no tiene una estadía activa.',
          });
        }
        if (tokenEstadia && roomCheck.rows[0].token_estadia && tokenEstadia !== roomCheck.rows[0].token_estadia) {
          return res.status(401).json({
            ok: false,
            error: 'SESSION_EXPIRED',
            message: 'Tu sesión ha expirado porque la estadía finalizó.',
          });
        }
      }

      const activeToken = roomCheck.rows[0]?.token_estadia || null;
      const mensajeId = newId();
      await pool.query(
        `INSERT INTO hotel_mensajes (id, empresa_id, habitacion_numero, remitente, huesped_nombre, mensaje, leido, token_estadia, archivado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
        [
          mensajeId,
          companyId,
          String(habitacionNumero),
          remitente || 'HUESPED',
          huespedNombre || null,
          mensaje.trim(),
          remitente === 'RECEPCION',
          activeToken,
        ]
      );

      res.status(201).json({ ok: true, mensajeId, message: 'Mensaje enviado.' });
    } catch (err) {
      console.error('Error al enviar mensaje hotel:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 8. Marcar mensajes de una habitación como leídos por recepción
  router.post('/hotel/mensajes/marcar-leidos', async (req, res) => {
    const { companyId, habitacionNumero } = req.body || {};
    if (!companyId || !habitacionNumero) return res.status(400).json({ ok: false });

    try {
      await pool.query(
        `UPDATE hotel_mensajes
         SET leido = true
         WHERE empresa_id = $1 AND habitacion_numero = $2 AND remitente = 'HUESPED' AND archivado = false`,
        [companyId, String(habitacionNumero)]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('Error al marcar leídos:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  // 9. Estado público para el portal QR del huésped (solo estadía activa)
  router.get('/hotel/public/:companyId/habitacion/:numero', async (req, res) => {
    const { companyId, numero } = req.params;

    try {
      const [empRes, roomRes, prodRes] = await Promise.all([
        pool.query('SELECT nombre_comercial FROM empresas WHERE id = $1', [companyId]),
        pool.query('SELECT numero, estado, tipo, huesped_actual, pin_estadia, token_estadia, total_consumos, checkout_estimado FROM hotel_habitaciones WHERE empresa_id = $1 AND numero = $2', [companyId, String(numero)]),
        pool.query('SELECT id, nombre, precio_venta, categoria FROM productos WHERE empresa_id = $1 AND activo = true ORDER BY categoria ASC, nombre ASC LIMIT 30', [companyId]),
      ]);

      const room = roomRes.rows[0] || null;
      let pedidos = [];
      let mensajes = [];

      // Solo si la habitación está actualmente OCUPADA cargamos los pedidos y chat de ESTA estadía
      if (room && room.estado === 'OCUPADA') {
        const [pedidosRes, msgsRes] = await Promise.all([
          pool.query(
            `SELECT * FROM hotel_pedidos
             WHERE empresa_id = $1 AND habitacion_numero = $2 AND estado != 'ARCHIVADO'
             ORDER BY creado_en DESC LIMIT 15`,
            [companyId, String(numero)]
          ),
          pool.query(
            `SELECT * FROM hotel_mensajes
             WHERE empresa_id = $1 AND habitacion_numero = $2 AND archivado = false
             ORDER BY creado_en ASC LIMIT 40`,
            [companyId, String(numero)]
          ),
        ]);
        pedidos = pedidosRes.rows;
        mensajes = msgsRes.rows;
      }

      res.json({
        ok: true,
        empresa: empRes.rows[0]?.nombre_comercial || 'Hotel',
        habitacion: room ? {
          numero: room.numero,
          estado: room.estado,
          tipo: room.tipo,
          huesped: room.huesped_actual,
          tokenEstadia: room.token_estadia,
          pinEstadia: room.pin_estadia,
          totalConsumos: room.total_consumos,
          checkoutEstimado: room.checkout_estimado,
        } : { numero, estado: 'NO_CONFIGURADA' },
        productos: prodRes.rows || [],
        pedidos,
        mensajes,
      });
    } catch (err) {
      console.error('Error en hotel public status:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  // 10. Libro de Registro de Huéspedes (Historial de Estadías)
  router.get('/hotel/historial/:companyId', async (req, res) => {
    const { companyId } = req.params;
    try {
      const result = await pool.query(
        `SELECT * FROM hotel_historial_estadias
         WHERE empresa_id = $1
         ORDER BY checkout_en DESC
         LIMIT 100`,
        [companyId]
      );
      res.json({ ok: true, historial: result.rows });
    } catch (err) {
      console.error('Error al obtener historial hotel:', err);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: err.message });
    }
  });

  return router;
}

module.exports = { createLiveRouter };
