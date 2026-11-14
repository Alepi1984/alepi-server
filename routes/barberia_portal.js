function renderBarberiaPortal(companyId) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal de Barbería | ALEPI Live</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0F172A;
      --card: #1E293B;
      --card-border: #334155;
      --gold: #F59E0B;
      --gold-glow: rgba(245, 158, 11, 0.2);
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --accent: #38BDF8;
      --green: #10B981;
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
      padding: 24px 0 16px;
    }
    .badge-icon {
      font-size: 40px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: var(--gold);
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-top: 4px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .status-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-left: 4px solid var(--gold);
    }
    .status-number {
      font-size: 36px;
      font-weight: 800;
      color: var(--gold);
      line-height: 1;
    }
    .status-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .queue-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .queue-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255,255,255,0.03);
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .queue-turn {
      background: var(--gold-glow);
      color: var(--gold);
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 13px;
    }
    .btn {
      width: 100%;
      background: linear-gradient(135deg, #F59E0B, #D97706);
      color: #000;
      font-weight: 800;
      border: none;
      border-radius: 12px;
      padding: 14px;
      font-size: 15px;
      cursor: pointer;
      display: block;
      text-align: center;
      transition: transform 0.1s;
    }
    .btn:active { transform: scale(0.98); }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--gold);
      color: var(--gold);
      margin-top: 8px;
    }
    input, select {
      width: 100%;
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
      margin-bottom: 12px;
    }
    .tab-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .tab-btn {
      flex: 1;
      background: var(--card);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 10px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      text-align: center;
    }
    .tab-btn.active {
      background: var(--gold);
      color: #000;
      border-color: var(--gold);
    }
    .style-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 10px;
    }
    .style-name {
      font-weight: 700;
      color: var(--accent);
      font-size: 14px;
    }
    .style-face {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .pulse {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--green);
      border-radius: 50%;
      margin-right: 6px;
      box-shadow: 0 0 8px var(--green);
    }
  </style>
</head>
<body>
  <header>
    <div class="badge-icon">💈</div>
    <h1 id="companyName">Cargando Barbería...</h1>
    <div class="subtitle">Atención & Cola en Tiempo Real</div>
  </header>

  <div class="tab-bar">
    <div class="tab-btn active" id="tabTurnoBtn" onclick="switchTab('turno')">⏱️ Mi Turno & Espera</div>
    <div class="tab-btn" id="tabEstilosBtn" onclick="switchTab('estilos')">✂️ Probador de Cortes</div>
  </div>

  <!-- PESTAÑA 1: COLA & ESTADO -->
  <div id="tabTurno">
    <div class="card status-banner">
      <div>
        <div class="status-label"><span class="pulse"></span>Tiempo estimado</div>
        <div class="status-number" id="tiempoEstimado">-- min</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;" id="personasFrente">Calculando cola...</div>
      </div>
      <div style="text-align: right;">
        <div class="status-label">En Espera</div>
        <div style="font-size: 28px; font-weight: 800; color: #fff;" id="totalEnEspera">0</div>
        <div style="font-size: 11px; color: var(--text-muted);">clientes</div>
      </div>
    </div>

    <!-- Atendiendo ahora -->
    <div class="card">
      <div class="section-title">🪑 Atendiendo en el sillón</div>
      <div id="atendiendoList" class="queue-list">
        <div style="color: var(--text-muted); font-size: 13px;">No hay clientes en atención en este momento.</div>
      </div>
    </div>

    <!-- Próximos en cola -->
    <div class="card">
      <div class="section-title">👥 Próximos turnos</div>
      <div id="enEsperaList" class="queue-list">
        <div style="color: var(--text-muted); font-size: 13px;">La cola está libre. ¡Sé el primero!</div>
      </div>
    </div>

    <!-- Solicitar turno -->
    <div class="card" id="formTurnoCard">
      <div class="section-title">✨ Pide tu turno online</div>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
        Reserva tu lugar antes de llegar o desde la sala de espera.
      </p>
      <form id="turnoForm" onsubmit="solicitarTurno(event)">
        <input type="text" id="clienteNombre" placeholder="Tu nombre y apellido" required />
        <input type="tel" id="clienteTelefono" placeholder="Tu WhatsApp (opcional)" />
        <select id="servicioSelect" required>
          <option value="">Selecciona el servicio...</option>
        </select>
        <select id="barberoSelect">
          <option value="">Cualquier barbero disponible</option>
        </select>
        <button type="submit" class="btn" id="btnPedir">¡Sacar mi turno!</button>
      </form>
      <div id="confirmacionTurno" style="display: none; text-align: center; padding: 16px; background: rgba(245, 158, 11, 0.15); border: 1px solid var(--gold); border-radius: 14px; margin-top: 10px;">
        <div style="font-size: 13px; color: var(--gold); font-weight: 700;">¡Turno registrado con éxito!</div>
        <div style="font-size: 32px; font-weight: 800; color: #fff; margin: 6px 0;" id="miNumeroTurno">Turno #1</div>
        <div style="font-size: 13px; color: #CBD5E1;" id="miClienteDetalle"></div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">Te llamaremos cuando sea tu momento en el sillón. ¡Mantén esta pantalla abierta!</div>
        <button type="button" class="btn btn-secondary" style="margin-top: 14px; padding: 10px;" onclick="resetearFormularioTurno()">Pedir otro turno</button>
      </div>
    </div>
  </div>

  <!-- PESTAÑA 2: PROBADOR DE ESTILOS -->
  <div id="tabEstilos" style="display: none;">
    <div class="card">
      <div class="section-title">🎨 Guía de Estilos según tu Rostro</div>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
        Descubre qué corte resalta mejor tus facciones mientras esperas tu turno:
      </p>

      <div class="style-card">
        <div class="style-name">💈 Fade Clásico con Volumen Alto</div>
        <div class="style-face">💡 Ideal para: <b>Rostro Redondo u Ovalado</b></div>
        <p style="font-size: 12px; margin-top: 6px; color: #CBD5E1;">
          Alarga visualmente la cara reduciendo el volumen a los lados y estilizando la parte superior.
        </p>
      </div>

      <div class="style-card">
        <div class="style-name">💈 French Crop Texturizado</div>
        <div class="style-face">💡 Ideal para: <b>Rostro Cuadrado o Diamante</b></div>
        <p style="font-size: 12px; margin-top: 6px; color: #CBD5E1;">
          Flequillo recto o despuntado con degradado bajo. Muy fácil de peinar y resalta la mandíbula.
        </p>
      </div>

      <div class="style-card">
        <div class="style-name">💈 Pompadour Moderno & Barba Esculpida</div>
        <div class="style-face">💡 Ideal para: <b>Rostro Triangular o Alargado</b></div>
        <p style="font-size: 12px; margin-top: 6px; color: #CBD5E1;">
          Acentúa la elegancia y da balance al mentón con una barba alineada y degradada en patillas.
        </p>
      </div>

      <div class="style-card">
        <div class="style-name">💈 Buzz Cut con Desvanecido Limpio</div>
        <div class="style-face">💡 Ideal para: <b>Rostro Ovalado o Fuerte</b></div>
        <p style="font-size: 12px; margin-top: 6px; color: #CBD5E1;">
          Corte militar moderno, fresco, sin mantenimiento diario, marcando líneas limpias en la frente.
        </p>
      </div>
    </div>
  </div>

  <script>
    const companyId = "${companyId}";
    let pollInterval = null;

    function switchTab(tab) {
      document.getElementById('tabTurno').style.display = tab === 'turno' ? 'block' : 'none';
      document.getElementById('tabEstilos').style.display = tab === 'estilos' ? 'block' : 'none';
      document.getElementById('tabTurnoBtn').classList.toggle('active', tab === 'turno');
      document.getElementById('tabEstilosBtn').classList.toggle('active', tab === 'estilos');
    }

    async function cargarEstado() {
      try {
        const res = await fetch('/api/live/barberia/public/' + companyId + '/status');
        const data = await res.json();
        if (!data.ok) return;

        document.getElementById('companyName').innerText = data.empresa || 'Barbería';
        document.getElementById('tiempoEstimado').innerText = data.tiempoEstimadoMinutos + ' min';
        document.getElementById('totalEnEspera').innerText = data.totalEnEspera;
        document.getElementById('personasFrente').innerText = data.totalEnEspera === 0 
          ? '¡Sin espera! Pasa directo.' 
          : data.totalEnEspera + ' persona(s) delante de ti';

        // Llenar select de servicios si está vacío
        const select = document.getElementById('servicioSelect');
        if (select.options.length <= 1 && data.servicios) {
          data.servicios.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = s.nombre + ' - S/ ' + Number(s.precio).toFixed(2) + ' (' + s.duracion_min + 'm)';
            select.appendChild(opt);
          });
        }

        // Llenar select de barberos si está vacío
        const barberoSel = document.getElementById('barberoSelect');
        if (barberoSel && barberoSel.options.length <= 1 && data.barberos) {
          data.barberos.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id || '';
            const tag = b.estado === 'LIBRE' ? ' (Disponible)' : ' (En atención)';
            opt.innerText = (b.alias ? b.alias + ' - ' : '') + b.nombre + tag;
            barberoSel.appendChild(opt);
          });
        }

        // Render atendiendo
        const atendiendoEl = document.getElementById('atendiendoList');
        if (data.enAtencion && data.enAtencion.length > 0) {
          atendiendoEl.innerHTML = data.enAtencion.map(t => \`
            <div class="queue-item">
              <div>
                <b style="color:#fff;">\${t.cliente_nombre}</b>
                <div style="font-size:11px; color:var(--text-muted);">\${t.servicio || 'Servicio'} · Barbero: \${t.barbero || 'Asignado'}</div>
              </div>
              <span class="queue-turn" style="background: rgba(16,185,129,0.2); color:#10B981;">En sillón</span>
            </div>
          \`).join('');
        } else {
          atendiendoEl.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">No hay clientes en atención en este momento.</div>';
        }

        // Render en espera
        const esperaEl = document.getElementById('enEsperaList');
        if (data.enEspera && data.enEspera.length > 0) {
          esperaEl.innerHTML = data.enEspera.map((t, idx) => \`
            <div class="queue-item">
              <div>
                <b style="color:#fff;">\${t.cliente_nombre}</b>
                <div style="font-size:11px; color:var(--text-muted);">\${t.servicio || 'Corte'} (\${t.duracion_min || 30} min)</div>
              </div>
              <span class="queue-turn">#\${t.numero_turno}</span>
            </div>
          \`).join('');
        } else {
          esperaEl.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">La cola está libre. ¡Sé el primero!</div>';
        }
      } catch (err) {
        console.error('Error cargando estado:', err);
      }
    }

    async function solicitarTurno(e) {
      e.preventDefault();
      const nombre = document.getElementById('clienteNombre').value;
      const telefono = document.getElementById('clienteTelefono').value;
      const servicioId = document.getElementById('servicioSelect').value;
      const barberoId = document.getElementById('barberoSelect') ? document.getElementById('barberoSelect').value : null;
      const btn = document.getElementById('btnPedir');
      btn.disabled = true;
      btn.innerText = 'Registrando...';

      try {
        const res = await fetch('/api/live/barberia/turnos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            clienteNombre: nombre,
            clienteTelefono: telefono,
            servicioId: servicioId || null,
            profesionalId: barberoId || null,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          document.getElementById('turnoForm').style.display = 'none';
          document.getElementById('confirmacionTurno').style.display = 'block';
          document.getElementById('miNumeroTurno').innerText = 'Turno #' + data.turno.numeroTurno;
          const sText = document.getElementById('servicioSelect').options[document.getElementById('servicioSelect').selectedIndex]?.text || '';
          document.getElementById('miClienteDetalle').innerText = nombre + ' · ' + sText;
          cargarEstado();
        } else {
          alert('Error: ' + (data.message || 'No se pudo registrar el turno.'));
        }
      } catch (err) {
        alert('Error de conexión con el servidor.');
      } finally {
        btn.disabled = false;
        btn.innerText = '¡Sacar mi turno!';
      }
    }

    function resetearFormularioTurno() {
      document.getElementById('turnoForm').reset();
      document.getElementById('turnoForm').style.display = 'block';
      document.getElementById('confirmacionTurno').style.display = 'none';
    }

    cargarEstado();
    pollInterval = setInterval(cargarEstado, 8000);
  </script>
</body>
</html>`;
}

module.exports = { renderBarberiaPortal };
