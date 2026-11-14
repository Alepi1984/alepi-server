function renderHotelPortal(companyId, habitacionNumero) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Room Service & Concierge | ALEPI Hotel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0B1320;
      --card: #152238;
      --card-border: #233554;
      --gold: #D4AF37;
      --gold-light: #F3E5AB;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --green: #10B981;
      --red: #EF4444;
      --accent: #38BDF8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Montserrat', sans-serif;
      padding: 16px;
      max-width: 480px;
      margin: 0 auto;
      line-height: 1.5;
    }
    header {
      text-align: center;
      padding: 20px 0 14px;
    }
    .hotel-icon {
      font-size: 34px;
      margin-bottom: 4px;
    }
    h1 {
      font-family: 'Cinzel', serif;
      font-size: 20px;
      color: var(--gold-light);
      letter-spacing: 1px;
    }
    .room-badge {
      display: inline-block;
      background: rgba(212, 175, 55, 0.15);
      border: 1px solid var(--gold);
      color: var(--gold);
      padding: 5px 14px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 13px;
      margin-top: 6px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 14px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--gold-light);
    }
    .menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 12px;
      margin-bottom: 8px;
    }
    .btn {
      background: linear-gradient(135deg, #D4AF37, #AA771C);
      color: #000;
      font-weight: 700;
      border: none;
      border-radius: 12px;
      padding: 14px;
      font-size: 15px;
      cursor: pointer;
      width: 100%;
      text-align: center;
      transition: transform 0.1s;
    }
    .btn:active { transform: scale(0.98); }
    .btn-sm {
      background: var(--gold);
      color: #000;
      border: none;
      padding: 6px 12px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
    }
    textarea, input {
      width: 100%;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
      margin-bottom: 12px;
    }
    textarea { resize: vertical; min-height: 60px; }
    .orders-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .order-badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 700;
    }
    .badge-pending { background: rgba(245, 158, 11, 0.2); color: #F59E0B; }
    .badge-done { background: rgba(16, 185, 129, 0.2); color: #10B981; }
    .status-alert {
      text-align: center;
      padding: 24px 16px;
    }
    .status-alert-icon { font-size: 48px; margin-bottom: 12px; }
    /* Chat en vivo */
    .chat-box {
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 10px;
    }
    .chat-bubble-huesped {
      align-self: flex-end;
      background: var(--gold);
      color: #0B1320;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 12px 12px 2px 12px;
      max-width: 82%;
      font-size: 13px;
      word-break: break-word;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .chat-bubble-recepcion {
      align-self: flex-start;
      background: #1E293B;
      color: #F8FAFC;
      border: 1px solid #334155;
      padding: 8px 12px;
      border-radius: 12px 12px 12px 2px;
      max-width: 82%;
      font-size: 13px;
      word-break: break-word;
    }
    .chat-time {
      font-size: 9px;
      opacity: 0.65;
      margin-top: 3px;
      text-align: right;
    }
    /* Notificaciones elegantes (Toasts con timer) */
    .toast-popup {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-40px);
      background: rgba(15, 23, 42, 0.96);
      border: 1px solid var(--gold);
      box-shadow: 0 12px 30px rgba(0,0,0,0.6), 0 0 20px rgba(212, 175, 55, 0.25);
      color: #fff;
      padding: 12px 18px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 99999;
      opacity: 0;
      pointer-events: none;
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 90%;
      width: 360px;
      backdrop-filter: blur(10px);
    }
    .toast-popup.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    /* Modal Emergente de Pedido interactivo (Overlay centrado con temporizador) */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
      padding: 20px;
    }
    .modal-backdrop.show {
      opacity: 1;
      pointer-events: auto;
    }
    .modal-card {
      background: #111C2E;
      border: 1.5px solid var(--gold);
      box-shadow: 0 20px 50px rgba(0,0,0,0.85), 0 0 30px rgba(212, 175, 55, 0.25);
      border-radius: 20px;
      padding: 24px 20px;
      width: 100%;
      max-width: 360px;
      text-align: center;
      transform: scale(0.9);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .modal-backdrop.show .modal-card {
      transform: scale(1);
    }
    .modal-icon {
      font-size: 46px;
      margin-bottom: 8px;
    }
    .modal-title {
      font-family: 'Cinzel', serif;
      font-size: 18px;
      color: var(--gold-light);
      margin-bottom: 12px;
      font-weight: 700;
    }
    .modal-progress-container {
      background: rgba(255,255,255,0.12);
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
      margin: 16px 0;
    }
    .modal-progress-bar {
      background: linear-gradient(90deg, var(--gold), #F59E0B);
      height: 100%;
      width: 100%;
      transition: width 0.1s linear;
    }
    .modal-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 14px;
    }
    .btn-cancel {
      flex: 1;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #EF4444;
      color: #FCA5A5;
      font-weight: 700;
      font-size: 13px;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
    }
    .btn-confirm-now {
      flex: 1;
      background: var(--gold);
      border: none;
      color: #000;
      font-weight: 700;
      font-size: 13px;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <!-- Notificación Toast general -->
  <div id="toastNotification" class="toast-popup">
    <div id="toastIcon" style="font-size: 24px;">🛎️</div>
    <div id="toastMessage" style="font-size: 13px; font-weight: 500; line-height: 1.4;"></div>
  </div>

  <!-- Modal Emergente Interactivo de Pedidos (Centrado en pantalla con temporizador y cancelar) -->
  <div id="orderModalBackdrop" class="modal-backdrop">
    <div class="modal-card">
      <div id="modalOrderIcon" class="modal-icon">🛎️</div>
      <div id="modalOrderTitle" class="modal-title">Confirmar Pedido</div>
      <div id="modalOrderDesc">
        <div id="modalOrderItem" style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;"></div>
        <div id="modalOrderPrice" style="font-size: 14px; color: var(--gold); font-weight: 600; margin-bottom: 12px;"></div>
        <div id="modalOrderTimerText" style="font-size: 12px; color: var(--text-muted);">
          Confirmando automáticamente en <b id="modalOrderSeconds" style="color: var(--gold-light); font-size: 15px;">5</b>s...
        </div>
      </div>
      
      <!-- Barra de progreso regresiva -->
      <div id="modalProgressBarContainer" class="modal-progress-container">
        <div id="modalProgressBar" class="modal-progress-bar"></div>
      </div>

      <!-- Botones de acción -->
      <div id="modalActionButtons" class="modal-actions">
        <button class="btn-cancel" onclick="cancelarPedidoModal()">✕ Cancelar</button>
        <button class="btn-confirm-now" onclick="confirmarPedidoInmediato()">✓ Pedir Ahora</button>
      </div>
    </div>
  </div>

  <header>
    <div class="hotel-icon">🛎️</div>
    <h1 id="hotelName">Cargando Hotel...</h1>
    <div class="room-badge">Habitación ${habitacionNumero}</div>
  </header>

  <!-- VISTA 1: HABITACIÓN NO OCUPADA -->
  <div id="viewNoOcupada" style="display: none;" class="card status-alert">
    <div class="status-alert-icon">🚪</div>
    <div class="section-title" style="justify-content: center; font-size: 16px;">Habitación No Ocupada</div>
    <p style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">
      Esta habitación no tiene una estadía activa en este momento.
    </p>
    <p style="font-size: 12px; color: var(--gold); margin-top: 10px;">
      El portal de pedidos y mensajería se activará automáticamente al registrar tu ingreso (Check-in) en recepción.
    </p>
  </div>

  <!-- VISTA 2: SESIÓN EXPIRADA / CHECKOUT REALIZADO -->
  <div id="viewExpirada" style="display: none;" class="card status-alert">
    <div class="status-alert-icon">👋</div>
    <div class="section-title" style="justify-content: center; font-size: 16px; color: var(--green);">¡Estadía Finalizada!</div>
    <p style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">
      El Check-out de esta habitación ha sido completado y la sesión ha sido cerrada por seguridad.
    </p>
    <p style="font-size: 12px; color: var(--gold-light); margin-top: 10px;">
      Muchas gracias por tu preferencia. ¡Esperamos verte pronto!
    </p>
  </div>

  <!-- VISTA 3: BLOQUEADO POR PIN (PIDE PIN ENTREGADO EN CHECK-IN) -->
  <div id="viewPinLock" style="display: none;" class="card">
    <div class="section-title">🔒 Activar Sesión de Huésped</div>
    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
      Para tu privacidad y seguridad, ingresa el <b>PIN de 4 dígitos</b> que te entregaron en recepción al registrar tu ingreso:
    </p>
    <input type="number" id="inputPin" placeholder="Ej: 4821" style="font-size: 20px; text-align: center; letter-spacing: 4px;" maxlength="4" />
    <button class="btn" onclick="validarPin()">Ingresar a mi Habitación</button>
  </div>

  <!-- VISTA 4: SESIÓN ACTIVA DEL HUÉSPED -->
  <div id="viewSesionActiva" style="display: none;">
    <!-- Estado de la estadía -->
    <div class="card">
      <div class="section-title">✨ Tu Estadía Activa</div>
      <p style="font-size: 13px; color: #E2E8F0;" id="huespedMensaje">
        Bienvenido a tu habitación.
      </p>
      <div style="font-size: 12px; color: var(--gold); margin-top: 4px;" id="consumosBadge">
        Consumos cargados a la cuenta: S/ 0.00
      </div>
    </div>

    <!-- Menú Servicio a la Habitación & Bebidas (Cargado en tiempo real desde tu Inventario) -->
    <div class="card">
      <div class="section-title">🍽️ Servicio a la Habitación & Bebidas</div>
      <div id="dynamicMenuContainer">
        <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 10px;">Cargando catálogo...</div>
      </div>
    </div>

    <!-- Chat en vivo con Recepción -->
    <div class="card">
      <div class="section-title">💬 Chat en Vivo con Recepción</div>
      <div id="chatMessages" class="chat-box" style="height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; padding: 10px;">
        <div style="color: var(--text-muted); font-size: 12px; text-align: center; margin: auto;">Escribe a recepción. Te responderemos en tiempo real.</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <input type="text" id="mensajeInput" placeholder="Escribe un mensaje aquí..." style="margin-bottom: 0;" onkeydown="if(event.key==='Enter') enviarMensajeChat()" />
        <button class="btn-sm" onclick="enviarMensajeChat()" style="white-space: nowrap; padding: 0 16px;">Enviar</button>
      </div>
    </div>

    <!-- Pedidos realizados -->
    <div class="card">
      <div class="section-title">📋 Tus Pedidos en Curso</div>
      <div id="pedidosList" class="orders-list">
        <div style="color: var(--text-muted); font-size: 13px;">No tienes pedidos activos.</div>
      </div>
    </div>
  </div>

  <script>
    const companyId = "${companyId}";
    const habitacionNumero = "${habitacionNumero}";
    const storageKey = 'hotel_token_' + companyId + '_' + habitacionNumero;

    let serverData = null;

    async function cargarEstado() {
      try {
        const res = await fetch('/api/live/hotel/public/' + companyId + '/habitacion/' + habitacionNumero);
        const data = await res.json();
        if (!data.ok) return;

        serverData = data;
        document.getElementById('hotelName').innerText = data.empresa || 'Hotel';

        const hab = data.habitacion;
        const savedToken = localStorage.getItem(storageKey);

        // Si la habitación no está ocupada
        if (!hab || hab.estado !== 'OCUPADA') {
          if (savedToken) {
            // El cliente tenía sesión pero ya se hizo checkout
            localStorage.removeItem(storageKey);
            showView('viewExpirada');
          } else {
            showView('viewNoOcupada');
          }
          return;
        }

        // La habitación está ocupada: verificar si la sesión coincide
        const queryToken = new URLSearchParams(window.location.search).get('token');
        if (queryToken && queryToken === hab.tokenEstadia) {
          localStorage.setItem(storageKey, queryToken);
        }

        const currentActiveToken = localStorage.getItem(storageKey);

        if (currentActiveToken && currentActiveToken === hab.tokenEstadia) {
          // Sesión activa y válida
          document.getElementById('huespedMensaje').innerText =
            'Huésped: ' + (hab.huesped || 'Registrado') + ' · Habitación ' + hab.numero + ' (' + (hab.tipo || 'Habitación') + ')';
          document.getElementById('consumosBadge').innerText =
            'Consumos cargados a la cuenta: S/ ' + Number(hab.totalConsumos || 0).toFixed(2);

          renderPedidos(data.pedidos);
          renderProductos(data.productos);
          renderMensajes(data.mensajes);
          showView('viewSesionActiva');
        } else {
          // Requiere PIN de estadía
          showView('viewPinLock');
        }
      } catch (err) {
        console.error('Error al cargar estado del hotel:', err);
      }
    }

    function showView(viewId) {
      ['viewNoOcupada', 'viewExpirada', 'viewPinLock', 'viewSesionActiva'].forEach(id => {
        document.getElementById(id).style.display = (id === viewId) ? 'block' : 'none';
      });
    }

    let toastTimeout = null;
    function mostrarToast(mensaje, icono = '🛎️', ms = 3500) {
      const toast = document.getElementById('toastNotification');
      const iconEl = document.getElementById('toastIcon');
      const msgEl = document.getElementById('toastMessage');
      if (!toast) return;
      iconEl.innerText = icono;
      msgEl.innerText = mensaje;
      toast.classList.add('show');
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, ms);
    }

    function validarPin() {
      const pin = document.getElementById('inputPin').value.trim();
      if (!serverData || !serverData.habitacion) return;

      if (serverData.habitacion.pinEstadia && pin === serverData.habitacion.pinEstadia) {
        localStorage.setItem(storageKey, serverData.habitacion.tokenEstadia);
        mostrarToast('¡Sesión activada con éxito!', '✨', 2500);
        cargarEstado();
      } else {
        mostrarToast('PIN incorrecto. Revisa el código en tu comprobante de check-in.', '🔒', 3500);
      }
    }

    function renderPedidos(pedidos) {
      const pedidosEl = document.getElementById('pedidosList');
      if (pedidos && pedidos.length > 0) {
        pedidosEl.innerHTML = pedidos.map(p => {
          const isDone = p.estado === 'ENTREGADO';
          const badgeClass = isDone ? 'badge-done' : 'badge-pending';
          const badgeText = isDone ? '✓ Entregado' : '⏳ En camino';
          return '<div class="menu-item">' +
            '<div>' +
              '<b style="font-size: 13px;">' + p.detalle + '</b>' +
              '<div style="font-size: 11px; color: var(--text-muted);">Monto: S/ ' + Number(p.monto_total).toFixed(2) + '</div>' +
            '</div>' +
            '<span class="order-badge ' + badgeClass + '">' + badgeText + '</span>' +
          '</div>';
        }).join('');
      } else {
        pedidosEl.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No tienes pedidos activos.</div>';
      }
    }

    function renderProductos(prods) {
      const container = document.getElementById('dynamicMenuContainer');
      if (!container) return;
      const items = (prods && prods.length > 0) ? prods : [
        { nombre: 'Agua Mineral 650ml', precio_venta: 4.00 },
        { nombre: 'Gaseosa Coca-Cola 500ml', precio_venta: 5.00 },
        { nombre: 'Cerveza Cusqueña 330ml', precio_venta: 10.00 },
      ];

      let html = items.map(p => {
        const precio = Number(p.precio_venta || 0);
        const precioTxt = precio > 0 ? 'S/ ' + precio.toFixed(2) : 'Cortesía';
        const nombreClean = (p.nombre || '').replace(/'/g, "\\'");
        return '<div class="menu-item">' +
          '<div>' +
            '<b>' + p.nombre + '</b>' +
            '<div style="font-size: 12px; color: var(--gold);">' + precioTxt + '</div>' +
          '</div>' +
          '<button class="btn-sm" onclick="solicitarPedido(\'' + nombreClean + '\', ' + precio + ')">+ Pedir</button>' +
        '</div>';
      }).join('');

      // Opción fija de cortesía
      html += '<div class="menu-item">' +
        '<div>' +
          '<b>Toallas Extras / Amenities</b>' +
          '<div style="font-size: 12px; color: #10B981;">Cortesía (S/ 0.00)</div>' +
        '</div>' +
        '<button class="btn-sm" onclick="solicitarPedido(\'Toallas Extras & Amenities\', 0.00)">+ Pedir</button>' +
      '</div>';

      container.innerHTML = html;
    }

    let modalCountdownInterval = null;
    let modalAutoCloseTimeout = null;
    let currentPendingItem = null;
    let currentPendingPrice = 0;

    function solicitarPedido(item, precio) {
      if (modalCountdownInterval) clearInterval(modalCountdownInterval);
      if (modalAutoCloseTimeout) clearTimeout(modalAutoCloseTimeout);

      currentPendingItem = item;
      currentPendingPrice = precio;

      const backdrop = document.getElementById('orderModalBackdrop');
      const icon = document.getElementById('modalOrderIcon');
      const title = document.getElementById('modalOrderTitle');
      const itemEl = document.getElementById('modalOrderItem');
      const priceEl = document.getElementById('modalOrderPrice');
      const timerText = document.getElementById('modalOrderTimerText');
      const progressBar = document.getElementById('modalProgressBar');
      const actions = document.getElementById('modalActionButtons');
      const progressContainer = document.getElementById('modalProgressBarContainer');

      icon.innerText = '🛎️';
      title.innerText = 'Confirmar Pedido';
      itemEl.innerText = item;
      priceEl.innerText = precio > 0 ? 'Monto a cuenta: S/ ' + precio.toFixed(2) : 'Cortesía de la casa';
      progressContainer.style.display = 'block';
      actions.style.display = 'flex';
      progressBar.style.background = 'linear-gradient(90deg, var(--gold), #F59E0B)';
      progressBar.style.width = '100%';

      const totalTenths = 50; // 5 segundos
      let remaining = totalTenths;

      timerText.innerHTML = 'Confirmando automáticamente en <b id="modalOrderSeconds" style="color: var(--gold-light); font-size: 15px;">5</b>s...';

      backdrop.classList.add('show');

      modalCountdownInterval = setInterval(() => {
        remaining--;
        const pct = Math.max(0, (remaining / totalTenths) * 100);
        progressBar.style.width = pct + '%';
        const secondsLeft = Math.ceil(remaining / 10);
        const secSpan = document.getElementById('modalOrderSeconds');
        if (secSpan) secSpan.innerText = secondsLeft;

        if (remaining <= 0) {
          clearInterval(modalCountdownInterval);
          modalCountdownInterval = null;
          ejecutarEnvioPedido(item, precio);
        }
      }, 100);
    }

    function confirmarPedidoInmediato() {
      if (modalCountdownInterval) {
        clearInterval(modalCountdownInterval);
        modalCountdownInterval = null;
      }
      ejecutarEnvioPedido(currentPendingItem, currentPendingPrice);
    }

    function cancelarPedidoModal() {
      if (modalCountdownInterval) {
        clearInterval(modalCountdownInterval);
        modalCountdownInterval = null;
      }
      const backdrop = document.getElementById('orderModalBackdrop');
      const icon = document.getElementById('modalOrderIcon');
      const title = document.getElementById('modalOrderTitle');
      const itemEl = document.getElementById('modalOrderItem');
      const priceEl = document.getElementById('modalOrderPrice');
      const timerText = document.getElementById('modalOrderTimerText');
      const actions = document.getElementById('modalActionButtons');
      const progressContainer = document.getElementById('modalProgressBarContainer');

      icon.innerText = '❌';
      title.innerText = 'Pedido Cancelado';
      itemEl.innerText = currentPendingItem || 'Producto';
      priceEl.innerText = 'No se realizó ningún cobro.';
      timerText.innerText = 'Volviendo a tu habitación...';
      progressContainer.style.display = 'none';
      actions.style.display = 'none';

      modalAutoCloseTimeout = setTimeout(() => {
        backdrop.classList.remove('show');
      }, 1400);
    }

    async function ejecutarEnvioPedido(item, precio) {
      const backdrop = document.getElementById('orderModalBackdrop');
      const icon = document.getElementById('modalOrderIcon');
      const title = document.getElementById('modalOrderTitle');
      const itemEl = document.getElementById('modalOrderItem');
      const priceEl = document.getElementById('modalOrderPrice');
      const timerText = document.getElementById('modalOrderTimerText');
      const actions = document.getElementById('modalActionButtons');
      const progressContainer = document.getElementById('modalProgressBarContainer');

      actions.style.display = 'none';
      progressContainer.style.display = 'none';
      icon.innerText = '⏳';
      title.innerText = 'Registrando Pedido...';
      itemEl.innerText = item;
      priceEl.innerText = 'Conectando con recepción del hotel';
      timerText.innerText = 'Un momento por favor...';

      const token = localStorage.getItem(storageKey);
      try {
        const res = await fetch('/api/live/hotel/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            habitacionNumero,
            detalle: item,
            montoTotal: precio,
            tokenEstadia: token,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          // SEGUNDO MENSAJE EMERGENTE: CONFIRMA CON TIMER QUE SE CIERRA SOLO
          icon.innerText = '✅';
          title.innerText = '¡Pedido Confirmado!';
          itemEl.innerText = item;
          priceEl.innerHTML = '<span style="color: var(--green);">✓ Recibido por recepción</span>';
          
          let closeSeconds = 4;
          timerText.innerHTML = 'Te lo llevamos a tu habitación en unos minutos.<br><span style="font-size: 11px; opacity: 0.8;">Cerrando en ' + closeSeconds + 's...</span>';

          const closeTimer = setInterval(() => {
            closeSeconds--;
            if (closeSeconds > 0) {
              timerText.innerHTML = 'Te lo llevamos a tu habitación en unos minutos.<br><span style="font-size: 11px; opacity: 0.8;">Cerrando en ' + closeSeconds + 's...</span>';
            } else {
              clearInterval(closeTimer);
            }
          }, 1000);

          modalAutoCloseTimeout = setTimeout(() => {
            clearInterval(closeTimer);
            backdrop.classList.remove('show');
          }, 4000);

          cargarEstado();
        } else {
          icon.innerText = '⚠️';
          title.innerText = 'No se pudo registrar';
          itemEl.innerText = data.message || 'Error del servidor';
          priceEl.innerText = '';
          timerText.innerText = 'Intenta nuevamente.';
          modalAutoCloseTimeout = setTimeout(() => {
            backdrop.classList.remove('show');
          }, 3500);
          cargarEstado();
        }
      } catch (e) {
        icon.innerText = '⚠️';
        title.innerText = 'Error de Conexión';
        itemEl.innerText = 'No se pudo conectar con el servidor';
        priceEl.innerText = '';
        timerText.innerText = 'Revisa tu red WiFi o datos.';
        modalAutoCloseTimeout = setTimeout(() => {
          backdrop.classList.remove('show');
        }, 3500);
      }
    }

    function renderMensajes(mensajes) {
      const box = document.getElementById('chatMessages');
      if (!box) return;
      if (!mensajes || mensajes.length === 0) {
        box.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; margin: auto;">Escribe a recepción. Te responderemos en tiempo real.</div>';
        return;
      }
      box.innerHTML = mensajes.map(m => {
        const esHuesped = m.remitente === 'HUESPED';
        const cls = esHuesped ? 'chat-bubble-huesped' : 'chat-bubble-recepcion';
        const remitenteNombre = esHuesped ? 'Tú' : '🏨 Recepción';
        const hora = m.creado_en ? new Date(m.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return '<div class="' + cls + '">' +
          '<div style="font-size: 10px; opacity: 0.8; margin-bottom: 2px;">' + remitenteNombre + '</div>' +
          '<div>' + m.mensaje + '</div>' +
          '<div class="chat-time">' + hora + '</div>' +
        '</div>';
      }).join('');
      box.scrollTop = box.scrollHeight;
    }

    async function enviarMensajeChat() {
      const input = document.getElementById('mensajeInput');
      const msg = input.value.trim();
      if (!msg) return;

      const token = localStorage.getItem(storageKey);
      try {
        input.value = '';
        const res = await fetch('/api/live/hotel/mensajes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            habitacionNumero,
            remitente: 'HUESPED',
            mensaje: msg,
            tokenEstadia: token,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          cargarEstado();
        } else {
          mostrarToast(data.message || 'Error al enviar mensaje', '⚠️', 3500);
          cargarEstado();
        }
      } catch (e) {
        mostrarToast('Error de conexión al enviar mensaje.', '⚠️', 3500);
      }
    }

    cargarEstado();
    setInterval(cargarEstado, 5000);
  </script>
</body>
</html>`;
}

module.exports = { renderHotelPortal };
