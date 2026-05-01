// ════════════════════════════════════════════════════════════
//  NutriApp v3.0 — Lógica principal
//  Base de datos: Supabase (reemplaza Dexie/IndexedDB)
// ════════════════════════════════════════════════════════════

'use strict';

// ── Estado global ─────────────────────────────────────────────
let currentView = 'dashboard';
let _menuActualId = null;
let _menuActualClienteId = null;
let _pdfBase64Actual = null;
let _pdfNameActual = null;
let _recetaActual = null;
let _pickerCallback = null;
let _iaHistorial = [];
let _calMes = new Date().getMonth();
let _calAnio = new Date().getFullYear();

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const COMIDAS = ['Desayuno','Almuerzo','Comida','Merienda','Cena'];

const viewTitles = {
  dashboard:'Inicio', clientes:'Clientes', 'cliente-detalle':'Ficha cliente',
  mediciones:'Mediciones', menus:'Menús', 'menu-detalle':'Detalle menú',
  platos:'Banco de platos', recetas:'Recetas web', informes:'Informes y envío',
  ia:'IA Nutricional', agenda:'Agenda', usuarios:'Usuarios'
};

// ════════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ════════════════════════════════════════════════════════════
(async () => {
  const ok = await requireAuth();
  if (!ok) return;

  // Mostrar info de usuario en sidebar
  const user = authUser();
  const rol  = authRole();
  document.getElementById('sidebar-user-name').textContent =
    user.user_metadata?.nombre || user.email.split('@')[0];
  document.getElementById('sidebar-user-role').textContent =
    rol === 'super_admin' ? '⭐ Super Admin' : 'Nutricionista';
  document.getElementById('settings-user-email').textContent = user.email;
  document.getElementById('settings-user-rol').textContent =
    rol === 'super_admin' ? 'Super Admin' : 'Nutricionista';

  // Mostrar sección admin si corresponde
  if (isSuperAdmin()) {
    document.getElementById('nav-admin').style.display = '';
    document.getElementById('settings-usuarios-section').style.display = '';
  }

  // Cargar configuración y aplicar
  await aplicarConfiguracion();

  // Inicializar EmailJS si está configurado
  initEmailJS();

  // Render inicial
  navigate('dashboard');

  // PWA service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

// ════════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ════════════════════════════════════════════════════════════
async function aplicarConfiguracion() {
  try {
    const cfg = await DB.getConfig();
    _appConfig = cfg;

    // Logo
    if (cfg.logoBase64) {
      const img = document.getElementById('sidebar-logo-img');
      const imgDash = document.getElementById('dash-logo-img');
      if (img) { img.src = cfg.logoBase64; img.style.display = 'block'; }
      if (imgDash) imgDash.src = cfg.logoBase64;
      document.getElementById('sidebar-logo-text').style.display = 'none';
      document.getElementById('dash-logo-wrap').style.display = '';
      document.getElementById('dash-logo-text').style.display = 'none';
      document.getElementById('logo-status').textContent = '✅ Logo activo';
    }

    // Nombre / subtítulo
    const nombre = cfg.nombreApp || 'NutriApp';
    const sub = cfg.subtituloApp || 'Nutrición';
    document.title = nombre;
    document.getElementById('sidebar-subtitulo').textContent = sub;
    document.getElementById('dash-subtitulo').textContent = sub;

    // Rellenar campos en settings
    const cfgNombre = document.getElementById('cfg-nombre-app');
    const cfgSub = document.getElementById('cfg-subtitulo');
    if (cfgNombre) cfgNombre.value = nombre;
    if (cfgSub) cfgSub.value = sub;
  } catch (e) {
    console.warn('Config no disponible:', e.message);
  }
}

let _appConfig = {};

function getApiKey() {
  return _appConfig.claudeApiKey || '';
}

async function guardarApiKey() {
  const k = document.getElementById('settings-api-key').value.trim();
  if (!k) { toast('Introduce una clave válida', true); return; }
  await DB.updateConfig({ claudeApiKey: k });
  _appConfig.claudeApiKey = k;
  document.getElementById('settings-api-key').value = '';
  renderKeyStatus();
  toast('✅ Clave API guardada');
}

async function borrarApiKey() {
  await DB.updateConfig({ claudeApiKey: null });
  _appConfig.claudeApiKey = null;
  renderKeyStatus();
  toast('Clave eliminada');
}

function renderKeyStatus() {
  const k = getApiKey();
  const w = document.getElementById('key-status-wrap');
  if (!w) return;
  w.innerHTML = k
    ? `<span class="key-status ok">✅ Configurada — <span class="api-key-display">${k.substring(0,12)}…${k.slice(-4)}</span></span>`
    : `<span class="key-status nok">⚠️ Sin configurar — extracción PDF e IA no disponibles</span>`;
}

async function guardarConfigIdentidad() {
  const nombreApp = document.getElementById('cfg-nombre-app').value.trim() || 'NutriApp';
  const subtituloApp = document.getElementById('cfg-subtitulo').value.trim() || 'Nutrición';
  await DB.updateConfig({ nombreApp, subtituloApp });
  _appConfig.nombreApp = nombreApp;
  _appConfig.subtituloApp = subtituloApp;
  document.title = nombreApp;
  document.getElementById('sidebar-subtitulo').textContent = subtituloApp;
  document.getElementById('dash-subtitulo').textContent = subtituloApp;
  toast('✅ Identidad guardada');
}

async function guardarEmailJS() {
  const k  = document.getElementById('ejs-key').value.trim();
  const sv = document.getElementById('ejs-service').value.trim();
  const tm = document.getElementById('ejs-template').value.trim();
  await DB.updateConfig({ ejsKey: k, ejsService: sv, ejsTemplate: tm });
  _appConfig = { ..._appConfig, ejsKey: k, ejsService: sv, ejsTemplate: tm };
  if (k) try { emailjs.init(k); } catch(e) {}
  document.getElementById('ejs-status').textContent = k ? '✅ Guardado' : '— Vacío';
  toast('✅ EmailJS guardado');
}

function initEmailJS() {
  const k = _appConfig.ejsKey;
  if (k) try { emailjs.init(k); } catch(e) {}
}

function subirLogo() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const b64 = await fileToBase64(f);
    await DB.updateConfig({ logoBase64: b64 });
    _appConfig.logoBase64 = b64;
    await aplicarConfiguracion();
    toast('✅ Logo actualizado');
  };
  inp.click();
}

async function eliminarLogo() {
  await DB.updateConfig({ logoBase64: null });
  _appConfig.logoBase64 = null;
  const img = document.getElementById('sidebar-logo-img');
  if (img) img.style.display = 'none';
  document.getElementById('sidebar-logo-text').style.display = '';
  document.getElementById('dash-logo-wrap').style.display = 'none';
  document.getElementById('dash-logo-text').style.display = '';
  document.getElementById('logo-status').textContent = 'Sin logo';
  toast('Logo eliminado');
}

// ════════════════════════════════════════════════════════════
//  NAVEGACIÓN
// ════════════════════════════════════════════════════════════
function navigate(view, extra) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (!el) { console.warn('Vista no encontrada:', view); return; }
  el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.view === view));
  document.getElementById('page-title').textContent = viewTitles[view] || view;
  currentView = view;
  renderTopbarActions(view);

  if (view === 'dashboard')                   renderDashboard();
  else if (view === 'clientes')               renderClientes();
  else if (view === 'mediciones')             renderMediciones();
  else if (view === 'cliente-detalle' && extra) renderDetalleCliente(extra);
  else if (view === 'menus')                  renderMenus();
  else if (view === 'menu-detalle' && extra)  renderMenuDetalle(extra);
  else if (view === 'platos')                 renderPlatos();
  else if (view === 'recetas')                renderRecetas();
  else if (view === 'informes')               renderInformes();
  else if (view === 'ia')                     renderIA();
  else if (view === 'agenda')                 { renderCalendario(); cargarListaCitas(); }
  else if (view === 'usuarios')               renderUsuarios();
}

function renderTopbarActions(view) {
  const el  = document.getElementById('topbar-actions');
  const cfg = `<button class="btn btn-secondary btn-sm" onclick="openModal('modal-settings')">⚙️</button>`;
  if (view === 'dashboard')       el.innerHTML = cfg;
  else if (view === 'clientes')   el.innerHTML = `<button class="btn btn-primary" onclick="abrirModalCliente()">+ Nuevo cliente</button>${cfg}`;
  else if (view === 'cliente-detalle') el.innerHTML = `<button class="btn btn-primary" onclick="abrirModalMedicion()">⚖️ Nueva medición</button>${cfg}`;
  else if (view === 'menus')      el.innerHTML = `<button class="btn btn-primary" onclick="abrirModalMenu()">+ Nuevo menú</button>${cfg}`;
  else if (view === 'menu-detalle') el.innerHTML = `<button class="btn btn-success btn-sm" onclick="guardarGridMenu()">💾 Guardar</button><button class="btn btn-secondary btn-sm" onclick="exportarMenuPDFActual()">📄 PDF</button><button class="btn btn-success btn-sm" onclick="enviarWhatsApp(_menuActualClienteId,'menu')">📱 WA</button><button class="btn btn-secondary btn-sm" onclick="enviarEmailMenu(_menuActualId)">📧 Email</button><button class="btn btn-ambar btn-sm" onclick="generarMenuConIA()">🤖 IA</button>${cfg}`;
  else if (view === 'platos')     el.innerHTML = `<button class="btn btn-primary" onclick="abrirModalPlato()">+ Nuevo plato</button>${cfg}`;
  else                            el.innerHTML = cfg;
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
async function renderDashboard() {
  // El logo y subtítulo los gestiona aplicarConfiguracion() al inicio
}

// ════════════════════════════════════════════════════════════
//  CLIENTES
// ════════════════════════════════════════════════════════════
async function renderClientes(filtro = '') {
  const sortMode = document.getElementById('sort-clientes')?.value || 'nombre';
  let lista = await DB.list('clientes');
  if (filtro) lista = lista.filter(c =>
    `${c.nombre} ${c.apellidos}`.toLowerCase().includes(filtro.toLowerCase()));

  const enrich = await Promise.all(lista.map(async c => {
    const meds = await DB.where('mediciones', 'clienteId', c.id, { orderBy: 'fecha' });
    return { c, nMed: meds.length, ultima: meds.at(-1) || null };
  }));

  if (sortMode === 'ultima-med') {
    enrich.sort((a, b) => {
      if (!a.ultima && !b.ultima) return 0;
      if (!a.ultima) return 1; if (!b.ultima) return -1;
      return new Date(b.ultima.fecha) - new Date(a.ultima.fecha);
    });
  } else if (sortMode === 'createdAt') {
    enrich.sort((a, b) => new Date(b.c.createdAt) - new Date(a.c.createdAt));
  } else {
    enrich.sort((a, b) =>
      `${a.c.nombre} ${a.c.apellidos}`.localeCompare(`${b.c.nombre} ${b.c.apellidos}`, 'es'));
  }

  const wrap = document.getElementById('tabla-clientes-wrap');
  if (!enrich.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><strong>Sin clientes</strong><p>Pulsa "+ Nuevo cliente" para empezar</p></div>`;
    return;
  }

  // Botón eliminar solo para super_admin
  const canDelete = isSuperAdmin();

  const rows = enrich.map(({ c, nMed, ultima }) => {
    const diasSin = ultima ? Math.floor((Date.now() - new Date(ultima.fecha)) / 86400000) : null;
    const alerta = diasSin !== null && diasSin > 60 ? 'color:var(--rojo)' : diasSin > 30 ? 'color:var(--ambar)' : '';
    const delBtn = canDelete
      ? `<button class="btn-icon" onclick="confirmarEliminarCliente('${c.id}','${c.nombre} ${c.apellidos}')" title="Eliminar">🗑️</button>`
      : '';
    return `<tr style="cursor:pointer" onclick="navigate('cliente-detalle','${c.id}')">
      <td><div style="display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--menta);display:flex;align-items:center;justify-content:center;font-size:.84rem;font-weight:700;color:var(--verde);flex-shrink:0">${c.nombre[0]}${c.apellidos[0]}</div>
        <div><div style="font-weight:600">${c.nombre} ${c.apellidos}</div><div style="font-size:.75rem;color:var(--gris-400)">${c.altura ? c.altura+'cm' : ''}</div></div>
      </div></td>
      <td>${c.telefono||'—'}</td><td>${c.email||'—'}</td>
      <td>${nMed} med.</td>
      <td style="${alerta}">${ultima ? ultima.peso+' kg · '+fmtFechaCorta(ultima.fecha)+(diasSin>30?' ⚠️':'') : '—'}</td>
      <td><div class="td-actions" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="editarCliente('${c.id}')" title="Editar">✏️</button>
        ${delBtn}
      </div></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Medic.</th><th>Última medición</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function filtrarClientes() { renderClientes(document.getElementById('search-clientes').value); }

function abrirModalCliente(c = null) {
  document.getElementById('modal-cliente-title').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('cliente-id').value = c?.id || '';
  ['nombre','apellidos','sexo','altura','telefono','email','objetivo','notas'].forEach(f => {
    const el = document.getElementById('c-' + f);
    if (el) el.value = c?.[f] || '';
  });
  document.getElementById('c-fnac').value = c?.fnac || '';
  openModal('modal-cliente');
}

async function editarCliente(id) { abrirModalCliente(await DB.get('clientes', id)); }

async function guardarCliente() {
  const id = document.getElementById('cliente-id').value;
  const nombre    = document.getElementById('c-nombre').value.trim();
  const apellidos = document.getElementById('c-apellidos').value.trim();
  if (!nombre || !apellidos) { toast('Nombre y apellidos son obligatorios', true); return; }

  const data = {
    nombre, apellidos,
    fnac:     document.getElementById('c-fnac').value || null,
    sexo:     document.getElementById('c-sexo').value || null,
    altura:   parseFloatOrNull(document.getElementById('c-altura').value),
    telefono: document.getElementById('c-telefono').value.trim() || null,
    email:    document.getElementById('c-email').value.trim() || null,
    objetivo: document.getElementById('c-objetivo').value.trim() || null,
    notas:    document.getElementById('c-notas').value.trim() || null,
  };

  try {
    if (id) { await DB.update('clientes', id, data); toast('✅ Cliente actualizado'); }
    else    { await DB.add('clientes', data); toast('✅ Cliente creado'); }
    closeModal('modal-cliente');
    renderClientes();
  } catch (e) { toast(e.message, true); }
}

function confirmarEliminarCliente(id, nombre) {
  if (!isSuperAdmin()) { toast('Sin permisos para eliminar clientes', true); return; }
  showConfirm(
    `¿Eliminar al cliente "${nombre}"?`,
    `Esta acción eliminará también todas sus mediciones, menús y citas. No se puede deshacer.`,
    async () => {
      await DB.remove('clientes', id);
      toast('Cliente eliminado');
      renderClientes();
    }
  );
}

// ════════════════════════════════════════════════════════════
//  DETALLE CLIENTE
// ════════════════════════════════════════════════════════════
async function renderDetalleCliente(id) {
  const c = await DB.get('clientes', id);
  if (!c) { navigate('clientes'); return; }
  const meds  = await DB.where('mediciones', 'clienteId', id, { orderBy: 'fecha' });
  const menus = await DB.where('menus', 'clienteId', id, { orderBy: 'createdAt', asc: false });
  const citas = await DB.where('citas', 'clienteId', id, { orderBy: 'fecha', asc: false });

  const edad = c.fnac ? Math.floor((Date.now() - new Date(c.fnac)) / 31557600000) : null;
  const ultima = meds.at(-1);
  const primera = meds[0];

  // Header
  let header = `
    <div class="client-header-card">
      <div class="client-avatar">${c.nombre[0]}${c.apellidos[0]}</div>
      <div class="client-header-info" style="flex:1">
        <h2>${c.nombre} ${c.apellidos}</h2>
        <p>${c.objetivo || 'Sin objetivo definido'}</p>
        <div class="client-meta-pills">
          ${edad ? `<span class="pill">👤 ${edad} años</span>` : ''}
          ${c.sexo ? `<span class="pill">${c.sexo === 'F' ? '♀ Femenino' : '♂ Masculino'}</span>` : ''}
          ${c.altura ? `<span class="pill">📏 ${c.altura} cm</span>` : ''}
          ${c.telefono ? `<span class="pill">📱 ${c.telefono}</span>` : ''}
          ${c.email ? `<span class="pill">📧 ${c.email}</span>` : ''}
          <span class="pill">📊 ${meds.length} mediciones</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3)" onclick="editarCliente('${id}')">✏️ Editar</button>
        <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3)" onclick="abrirModalMedicion('${id}')">⚖️ Medición</button>
        <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3)" onclick="abrirModalMenuParaCliente('${id}')">🥗 Menú</button>
      </div>
    </div>`;

  // Stats rápidos
  let statsHtml = '';
  if (ultima) {
    const dif = primera && primera.id !== ultima.id
      ? (ultima.peso - primera.peso).toFixed(1) : null;
    statsHtml = `<div class="grid-4 mb-6">
      <div class="stat-card"><div class="stat-label">Peso actual</div><div class="stat-value">${ultima.peso??'—'}<span class="stat-unit">kg</span></div>${dif ? `<div class="stat-diff ${dif<0?'pos':'neg'}">${dif>0?'+':''}${dif} kg desde inicio</div>` : ''}</div>
      <div class="stat-card"><div class="stat-label">% Grasa</div><div class="stat-value">${ultima.pctGrasa??'—'}<span class="stat-unit">%</span></div></div>
      <div class="stat-card"><div class="stat-label">Masa muscular</div><div class="stat-value">${ultima.masaMusc??'—'}<span class="stat-unit">kg</span></div></div>
      <div class="stat-card"><div class="stat-label">Puntuación</div><div class="stat-value">${ultima.puntuacion??'—'}</div></div>
    </div>`;
  }

  // Botones envío báscula
  const ultimaConUrl = meds.slice().reverse().find(m => m.reportUrl);
  const envioHtml = `
    <div class="card mb-6" style="padding:14px 18px">
      <div style="font-size:.75rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--gris-400);margin-bottom:10px">📤 Enviar informe de báscula</div>
      ${!ultima ? '<p class="text-muted text-sm">Sin mediciones registradas todavía.</p>' : `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${c.telefono ? `<button class="btn btn-success btn-sm" onclick="enviarWhatsAppBascula('${id}')">📱 WhatsApp</button>` : ''}
        ${c.email    ? `<button class="btn btn-secondary btn-sm" onclick="enviarEmailBascula('${id}')">📧 Email</button>` : ''}
        ${!c.telefono && !c.email ? '<span class="text-muted text-sm">Sin teléfono ni email en la ficha</span>' : ''}
        ${ultimaConUrl ? `<span class="text-muted text-sm" style="font-size:.72rem">URL: ${ultimaConUrl.reportUrl.substring(0,40)}…</span>` : '<span class="text-muted text-sm" style="font-size:.72rem">⚠️ Sin URL de informe en la última medición</span>'}
      </div>`}
    </div>`;

  // Historial mediciones
  const filas = renderTablaHistorial(meds, id);

  // Menús del cliente
  const menuRows = menus.map(m => `
    <tr style="cursor:pointer" onclick="navigate('menu-detalle','${m.id}')">
      <td><strong>${m.nombre}</strong></td>
      <td>${m.fechaInicio ? fmtFechaCorta(m.fechaInicio) : '—'}</td>
      <td>${m.fechaFin ? fmtFechaCorta(m.fechaFin) : '—'}</td>
      <td><div class="td-actions" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="navigate('menu-detalle','${m.id}')">👁️</button>
        <button class="btn-icon" onclick="confirmarEliminarMenu('${m.id}')">🗑️</button>
      </div></td>
    </tr>`).join('');

  // Citas del cliente
  const citaRows = citas.map(ci => `
    <tr>
      <td>${fmtFechaCorta(ci.fecha)} ${ci.hora||''}</td>
      <td>${ci.motivo||'—'}</td>
      <td>${ci.notas||'—'}</td>
      <td><div class="td-actions">
        <button class="btn-icon" onclick="editarCita('${ci.id}')">✏️</button>
        <button class="btn-icon" onclick="confirmarEliminarCita('${ci.id}')">🗑️</button>
      </div></td>
    </tr>`).join('');

  // Bitácora
  const bits = await DB.where('bitacora', 'clienteId', id, { orderBy: 'fecha', asc: false });
  const bitHtml = renderBitacoraHtml(bits, id);

  // Gráfica (solo si hay mediciones)
  const graficaHtml = meds.length >= 2 ? `
    <div class="card mb-6">
      <div class="card-header"><h3>📈 Evolución</h3>
        <div class="chart-controls" id="chart-controls-${id}"></div>
      </div>
      <div class="card-body"><div class="chart-container"><canvas id="chart-cliente-${id}"></canvas></div></div>
    </div>` : '';

  document.getElementById('detalle-content').innerHTML = header + statsHtml + envioHtml + graficaHtml + `
    <div class="tabs">
      <div class="tab active" onclick="switchTab(this,'tab-historial-${id}')">📊 Historial mediciones</div>
      <div class="tab" onclick="switchTab(this,'tab-menus-${id}')">🥗 Menús</div>
      <div class="tab" onclick="switchTab(this,'tab-citas-${id}')">📅 Citas</div>
      <div class="tab" onclick="switchTab(this,'tab-bitacora-${id}')">📝 Bitácora</div>
    </div>
    <div id="tab-historial-${id}">
      ${filas}
    </div>
    <div id="tab-menus-${id}" style="display:none">
      <div class="flex justify-between items-center mb-4">
        <span class="text-sm text-muted">${menus.length} menú(s)</span>
        <button class="btn btn-primary btn-sm" onclick="abrirModalMenuParaCliente('${id}')">+ Nuevo menú</button>
      </div>
      ${menus.length ? `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Inicio</th><th>Fin</th><th>Acciones</th></tr></thead><tbody>${menuRows}</tbody></table></div>` : '<div class="empty-state"><div class="empty-icon">🥗</div><p>Sin menús</p></div>'}
    </div>
    <div id="tab-citas-${id}" style="display:none">
      <div class="flex justify-between items-center mb-4">
        <span class="text-sm text-muted">${citas.length} cita(s)</span>
        <button class="btn btn-primary btn-sm" onclick="abrirModalCitaParaCliente('${id}')">+ Nueva cita</button>
      </div>
      ${citas.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Motivo</th><th>Notas</th><th>Acciones</th></tr></thead><tbody>${citaRows}</tbody></table></div>` : '<div class="empty-state"><div class="empty-icon">📅</div><p>Sin citas</p></div>'}
    </div>
    <div id="tab-bitacora-${id}" style="display:none">${bitHtml}</div>
  `;

  // Renderizar gráfica si aplica
  if (meds.length >= 2) setTimeout(() => renderGraficaCliente(meds, id), 100);
}

function renderTablaHistorial(meds, clienteId) {
  if (!meds.length) return `<div class="empty-state"><div class="empty-icon">⚖️</div><strong>Sin mediciones</strong><p>Añade la primera medición con "⚖️ Medición"</p></div>`;
  const canDel = isSuperAdmin();
  const rows = [...meds].reverse().map(m => {
    const delBtn = canDel
      ? `<button class="btn-icon" onclick="confirmarEliminarMedicion('${m.id}')" title="Eliminar">🗑️</button>` : '';
    return `<tr>
      <td>${fmtFecha(m.fecha)}</td>
      <td><strong>${m.peso??'—'}</strong></td>
      <td>${m.pctGrasa??'—'}</td>
      <td>${m.masaMusc??'—'}</td>
      <td>${m.agua??'—'}</td>
      <td>${m.puntuacion ? `<span class="badge ${badgePunt(m.puntuacion)}">${m.puntuacion}</span>` : '—'}</td>
      <td><div class="td-actions">
        <button class="btn-icon" onclick="editarMedicion('${m.id}')">✏️</button>
        ${delBtn}
      </div></td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Peso (kg)</th><th>% Grasa</th><th>Músculo (kg)</th><th>Agua (kg)</th><th>Punt.</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderBitacoraHtml(bits, clienteId) {
  return `<div style="display:flex;flex-direction:column;gap:10px">
    <div class="flex gap-2 mb-4">
      <input class="form-control" id="bit-texto-${clienteId}" placeholder="Añadir nota, objetivo, alerta…" style="flex:1">
      <select class="form-control" id="bit-tipo-${clienteId}" style="width:130px">
        <option value="nota">📝 Nota</option>
        <option value="objetivo">🎯 Objetivo</option>
        <option value="alerta">⚠️ Alerta</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="addBitacoraEntry('${clienteId}')">Añadir</button>
    </div>
    ${bits.map(b => `
      <div class="card" style="padding:12px 16px;display:flex;align-items:flex-start;gap:12px">
        <span style="font-size:1.1rem">${b.tipo==='objetivo'?'🎯':b.tipo==='alerta'?'⚠️':'📝'}</span>
        <div style="flex:1">
          <div style="font-size:.85rem;line-height:1.5">${b.texto}</div>
          <div style="font-size:.72rem;color:var(--gris-400);margin-top:3px">${fmtFecha(b.fecha)}</div>
        </div>
        <button class="btn-icon" onclick="eliminarBitacora('${b.id}','${clienteId}')">🗑️</button>
      </div>`).join('')}
    ${!bits.length ? '<div class="empty-state" style="padding:32px"><div class="empty-icon">📝</div><p>Sin notas aún</p></div>' : ''}
  </div>`;
}

async function addBitacoraEntry(clienteId) {
  const texto = document.getElementById(`bit-texto-${clienteId}`)?.value.trim();
  const tipo  = document.getElementById(`bit-tipo-${clienteId}`)?.value || 'nota';
  if (!texto) return;
  await DB.add('bitacora', { clienteId, texto, tipo, fecha: new Date().toISOString() });
  navigate('cliente-detalle', clienteId);
  toast('✅ Nota añadida');
}

async function eliminarBitacora(id, clienteId) {
  await DB.remove('bitacora', id);
  navigate('cliente-detalle', clienteId);
}

// Tabs helper
function switchTab(el, tabId) {
  const parent = el.closest('.view') || document.getElementById('detalle-content');
  parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const allTabs = el.closest('.tabs').nextElementSibling;
  let sib = el.closest('.tabs');
  while ((sib = sib.nextElementSibling)) { sib.style.display = 'none'; }
  const target = document.getElementById(tabId);
  if (target) target.style.display = '';
}

// ════════════════════════════════════════════════════════════
//  MEDICIONES
// ════════════════════════════════════════════════════════════
async function renderMediciones(filtro = '') {
  let meds = await DB.list('mediciones', { orderBy: 'fecha', asc: false });
  const wrap = document.getElementById('tabla-mediciones-wrap');

  if (!meds.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div><strong>Sin mediciones</strong><p>Añade la primera desde la ficha de un cliente</p></div>`;
    return;
  }

  const clientes = await DB.list('clientes');
  const cliMap = Object.fromEntries(clientes.map(c => [c.id, c]));

  if (filtro) meds = meds.filter(m => {
    const c = cliMap[m.clienteId];
    return c && `${c.nombre} ${c.apellidos}`.toLowerCase().includes(filtro.toLowerCase());
  });

  const canDel = isSuperAdmin();
  const rows = meds.map(m => {
    const c = cliMap[m.clienteId];
    const delBtn = canDel
      ? `<button class="btn-icon" onclick="confirmarEliminarMedicion('${m.id}')">🗑️</button>` : '';
    return `<tr>
      <td style="cursor:pointer" onclick="navigate('cliente-detalle','${m.clienteId}')">${c ? `<strong>${c.nombre} ${c.apellidos}</strong>` : '—'}</td>
      <td>${fmtFecha(m.fecha)}</td>
      <td><strong>${m.peso??'—'}</strong></td>
      <td>${m.pctGrasa??'—'}%</td>
      <td>${m.masaMusc??'—'}</td>
      <td>${m.puntuacion ? `<span class="badge ${badgePunt(m.puntuacion)}">${m.puntuacion}</span>` : '—'}</td>
      <td><div class="td-actions">
        <button class="btn-icon" onclick="editarMedicion('${m.id}')">✏️</button>
        ${delBtn}
      </div></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table><thead><tr><th>Cliente</th><th>Fecha</th><th>Peso (kg)</th><th>% Grasa</th><th>Músculo (kg)</th><th>Punt.</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function filtrarMediciones() { renderMediciones(document.getElementById('search-mediciones').value); }

async function abrirModalMedicion(preselId = null, m = null) {
  document.getElementById('modal-med-title').textContent = m ? 'Editar medición' : 'Nueva medición';
  document.getElementById('med-id').value = m?.id || '';
  document.getElementById('med-pdf-base64').value = '';
  document.getElementById('med-pdf-name').value = '';
  document.getElementById('pdf-drop-zone').classList.remove('has-pdf');
  document.getElementById('pdf-extract-status').classList.remove('show');

  // Cargar clientes en el selector
  const clientes = await DB.list('clientes', { orderBy: 'nombre' });
  const sel = document.getElementById('med-cliente');
  sel.innerHTML = clientes.map(c =>
    `<option value="${c.id}" ${m?.clienteId === c.id || preselId === c.id ? 'selected' : ''}>${c.nombre} ${c.apellidos}</option>`
  ).join('');

  // Campos numéricos
  const campos = ['peso','puntuacion','agua','proteina','minerales','masa-grasa','pct-grasa',
    'grasa-subcut','pct-grasa-sub','gv','mlg','masa-musc','musc-esq','pct-musc-esq',
    'osea','fc','agua-ec','agua-ic','tmb','ingesta-rec','imc','nivel-adip',
    'pct-proteinas','cc','edad-corp','peso-estandar','control-peso','grado-obesidad','nota'];

  // Mapeo campo HTML ↔ propiedad del objeto (camelCase)
  const campoMap = {
    'peso':'peso','puntuacion':'puntuacion','agua':'agua','proteina':'proteina',
    'minerales':'minerales','masa-grasa':'masaGrasa','pct-grasa':'pctGrasa',
    'grasa-subcut':'grasaSubcut','pct-grasa-sub':'pctGrasaSub','gv':'gv','mlg':'mlg',
    'masa-musc':'masaMusc','musc-esq':'muscEsq','pct-musc-esq':'pctMuscEsq',
    'osea':'osea','fc':'fc','agua-ec':'aguaEc','agua-ic':'aguaIc','tmb':'tmb',
    'ingesta-rec':'ingestaRec','imc':'imc','nivel-adip':'nivelAdip',
    'pct-proteinas':'pctProteinas','cc':'cc','edad-corp':'edadCorp',
    'peso-estandar':'pesoEstandar','control-peso':'controlPeso',
    'grado-obesidad':'gradoObesidad','nota':'nota'
  };

  campos.forEach(f => {
    const el = document.getElementById('med-' + f);
    if (el) el.value = m ? (m[campoMap[f]] ?? '') : '';
  });

  const now = new Date();
  document.getElementById('med-fecha').value = m?.fecha
    ? m.fecha.slice(0,16) : now.toISOString().slice(0,16);

  if (m?.reportUrl) document.getElementById('med-report-url').value = m.reportUrl;
  else document.getElementById('med-report-url').value = '';

  openModal('modal-medicion');
}

async function editarMedicion(id) { abrirModalMedicion(null, await DB.get('mediciones', id)); }

async function guardarMedicion() {
  const id = document.getElementById('med-id').value;
  const clienteId = document.getElementById('med-cliente').value;
  const fecha     = document.getElementById('med-fecha').value;
  if (!clienteId || !fecha) { toast('Cliente y fecha son obligatorios', true); return; }

  const n = id => parseFloatOrNull(document.getElementById('med-'+id)?.value);
  const data = {
    clienteId, fecha,
    peso: n('peso'), puntuacion: n('puntuacion'), agua: n('agua'), proteina: n('proteina'),
    minerales: n('minerales'), masaGrasa: n('masa-grasa'), pctGrasa: n('pct-grasa'),
    grasaSubcut: n('grasa-subcut'), pctGrasaSub: n('pct-grasa-sub'), gv: n('gv'),
    mlg: n('mlg'), masaMusc: n('masa-musc'), muscEsq: n('musc-esq'),
    pctMuscEsq: n('pct-musc-esq'), osea: n('osea'), fc: n('fc'),
    aguaEc: n('agua-ec'), aguaIc: n('agua-ic'), tmb: n('tmb'), ingestaRec: n('ingesta-rec'),
    imc: n('imc'), nivelAdip: n('nivel-adip'), pctProteinas: n('pct-proteinas'),
    cc: n('cc'), edadCorp: n('edad-corp'), pesoEstandar: n('peso-estandar'),
    controlPeso: n('control-peso'),
    gradoObesidad: document.getElementById('med-grado-obesidad')?.value || null,
    nota:         document.getElementById('med-nota')?.value.trim() || null,
    pdfBase64:    document.getElementById('med-pdf-base64').value || null,
    pdfName:      document.getElementById('med-pdf-name').value || null,
    reportUrl:    document.getElementById('med-report-url').value.trim() || null,
  };

  try {
    if (id) { await DB.update('mediciones', id, data); toast('✅ Medición actualizada'); }
    else    { await DB.add('mediciones', data); toast('✅ Medición guardada'); }
    closeModal('modal-medicion');
    if (currentView === 'mediciones') renderMediciones();
    else if (currentView === 'cliente-detalle') renderDetalleCliente(clienteId);
  } catch (e) { toast(e.message, true); }
}

function confirmarEliminarMedicion(id) {
  if (!isSuperAdmin()) { toast('Sin permisos para eliminar mediciones', true); return; }
  showConfirm('¿Eliminar medición?', 'Esta acción no se puede deshacer.', async () => {
    const m = await DB.get('mediciones', id);
    await DB.remove('mediciones', id);
    toast('Medición eliminada');
    if (currentView === 'cliente-detalle' && m) renderDetalleCliente(m.clienteId);
    else renderMediciones();
  });
}

// ════════════════════════════════════════════════════════════
//  EXTRACCIÓN PDF / IMAGEN (Claude API)
// ════════════════════════════════════════════════════════════
_pdfBase64Actual = null; _pdfNameActual = null;

function triggerPdfPicker() { document.getElementById('pdf-file-input').click(); }

function handlePdfDrop(e) {
  e.preventDefault();
  document.getElementById('pdf-drop-zone').classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) procesarArchivoInforme(file);
}

async function procesarArchivoInforme(file) {
  if (!file) return;
  const apiKey = getApiKey();
  if (!apiKey) { toast('Configura la clave API de Claude primero', true); return; }

  const zone = document.getElementById('pdf-drop-zone');
  const status = document.getElementById('pdf-extract-status');
  const msg  = document.getElementById('extract-msg');
  zone.classList.add('has-pdf');
  status.classList.add('show');
  msg.textContent = `Leyendo ${file.name}…`;

  try {
    const base64 = await fileToBase64(file);
    const pureB64 = base64.split(',')[1];
    const mediaType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

    document.getElementById('med-pdf-base64').value = pureB64;
    document.getElementById('med-pdf-name').value = file.name;

    msg.textContent = 'Claude está extrayendo los datos…';
    let datos;
    if (mediaType === 'application/pdf') {
      datos = await extraerDatosPDF(pureB64, file.name, apiKey);
    } else {
      datos = await extraerDatosImagen(pureB64, mediaType, file.name, apiKey);
    }
    rellenarCamposMedicion(datos);
    status.classList.remove('show');
    toast('✅ Datos extraídos correctamente');
  } catch(e) {
    status.classList.remove('show');
    toast('Error extrayendo datos: ' + e.message, true);
  }
}

async function extraerDesdeUrl() {
  const url = document.getElementById('med-report-url').value.trim();
  if (!url) { toast('Introduce una URL primero', true); return; }
  const apiKey = getApiKey();
  if (!apiKey) { toast('Configura la clave API de Claude primero', true); return; }

  const status = document.getElementById('pdf-extract-status');
  const msg = document.getElementById('extract-msg');
  status.classList.add('show');
  msg.textContent = 'Claude está analizando la URL…';

  try {
    const prompt = `Analiza el siguiente informe de báscula/composición corporal disponible en: ${url}
Extrae todos los valores numéricos en este JSON (usa null si no aparece):
{"peso":null,"puntuacion":null,"agua":null,"proteina":null,"minerales":null,"masaGrasa":null,"pctGrasa":null,"grasaSubcut":null,"pctGrasaSub":null,"gv":null,"mlg":null,"masaMusc":null,"muscEsq":null,"pctMuscEsq":null,"osea":null,"fc":null,"aguaEc":null,"aguaIc":null,"tmb":null,"ingestaRec":null,"imc":null,"nivelAdip":null,"pctProteinas":null,"cc":null,"edadCorp":null,"pesoEstandar":null,"controlPeso":null,"gradoObesidad":null}
Responde SOLO con el JSON.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const json = JSON.parse(data.content[0].text.match(/\{[\s\S]+\}/)[0]);
    rellenarCamposMedicion(json);
    status.classList.remove('show');
    toast('✅ Datos extraídos de la URL');
  } catch (e) {
    status.classList.remove('show');
    toast('Error: ' + e.message, true);
  }
}

async function extraerDatosPDF(base64, nombre, apiKey) {
  const prompt = `Analiza este informe de báscula / composición corporal.
Extrae todos los valores numéricos disponibles y devuelve ÚNICAMENTE este JSON (null si no aparece el dato):
{"peso":null,"puntuacion":null,"agua":null,"proteina":null,"minerales":null,"masaGrasa":null,"pctGrasa":null,"grasaSubcut":null,"pctGrasaSub":null,"gv":null,"mlg":null,"masaMusc":null,"muscEsq":null,"pctMuscEsq":null,"osea":null,"fc":null,"aguaEc":null,"aguaIc":null,"tmb":null,"ingestaRec":null,"imc":null,"nivelAdip":null,"pctProteinas":null,"cc":null,"edadCorp":null,"pesoEstandar":null,"controlPeso":null,"gradoObesidad":null}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [{
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 }
        }, { type: 'text', text: prompt }]
      }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.content[0].text.match(/\{[\s\S]+\}/)[0]);
}

async function extraerDatosImagen(base64, mediaType, nombre, apiKey) {
  const prompt = `Analiza esta imagen del informe de báscula / composición corporal.
Extrae todos los valores numéricos y devuelve ÚNICAMENTE este JSON (null si no aparece):
{"peso":null,"puntuacion":null,"agua":null,"proteina":null,"minerales":null,"masaGrasa":null,"pctGrasa":null,"grasaSubcut":null,"pctGrasaSub":null,"gv":null,"mlg":null,"masaMusc":null,"muscEsq":null,"pctMuscEsq":null,"osea":null,"fc":null,"aguaEc":null,"aguaIc":null,"tmb":null,"ingestaRec":null,"imc":null,"nivelAdip":null,"pctProteinas":null,"cc":null,"edadCorp":null,"pesoEstandar":null,"controlPeso":null,"gradoObesidad":null}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 }
        }, { type: 'text', text: prompt }]
      }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.content[0].text.match(/\{[\s\S]+\}/)[0]);
}

function rellenarCamposMedicion(datos) {
  const map = {
    peso:'peso', puntuacion:'puntuacion', agua:'agua', proteina:'proteina',
    minerales:'minerales', masaGrasa:'masa-grasa', pctGrasa:'pct-grasa',
    grasaSubcut:'grasa-subcut', pctGrasaSub:'pct-grasa-sub', gv:'gv',
    mlg:'mlg', masaMusc:'masa-musc', muscEsq:'musc-esq', pctMuscEsq:'pct-musc-esq',
    osea:'osea', fc:'fc', aguaEc:'agua-ec', aguaIc:'agua-ic', tmb:'tmb',
    ingestaRec:'ingesta-rec', imc:'imc', nivelAdip:'nivel-adip',
    pctProteinas:'pct-proteinas', cc:'cc', edadCorp:'edad-corp',
    pesoEstandar:'peso-estandar', controlPeso:'control-peso',
    gradoObesidad:'grado-obesidad'
  };
  for (const [key, htmlId] of Object.entries(map)) {
    const el = document.getElementById('med-' + htmlId);
    if (el && datos[key] !== null && datos[key] !== undefined) el.value = datos[key];
  }
}

// ════════════════════════════════════════════════════════════
//  MENÚS
// ════════════════════════════════════════════════════════════
async function renderMenus() {
  const menus = await DB.list('menus', { orderBy: 'createdAt', asc: false });
  const clientes = await DB.list('clientes', { orderBy: 'nombre' });

  // Rellenar filtro de clientes
  const sel = document.getElementById('filtro-menus-cli');
  sel.innerHTML = '<option value="">Todos los clientes</option>' +
    clientes.map(c => `<option value="${c.id}">${c.nombre} ${c.apellidos}</option>`).join('');

  const cliMap = Object.fromEntries(clientes.map(c => [c.id, c]));

  const wrap = document.getElementById('menus-list-wrap');
  if (!menus.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🥗</div><strong>Sin menús</strong><p>Crea el primer menú con "+ Nuevo menú"</p></div>`;
    return;
  }

  wrap.innerHTML = menus.map(m => {
    const c = m.clienteId ? cliMap[m.clienteId] : null;
    return `<div class="menu-card">
      <div class="menu-card-header">
        <div>
          <div class="menu-card-title">${m.nombre}</div>
          <div class="menu-card-meta">${c ? c.nombre+' '+c.apellidos : 'Sin asignar'} · ${m.fechaInicio ? fmtFechaCorta(m.fechaInicio)+' → '+fmtFechaCorta(m.fechaFin) : ''}</div>
        </div>
        <div class="td-actions">
          <button class="btn btn-primary btn-sm" onclick="navigate('menu-detalle','${m.id}')">Abrir</button>
          <button class="btn-icon" onclick="duplicarMenu('${m.id}')">📋</button>
          <button class="btn-icon" onclick="confirmarEliminarMenu('${m.id}')">🗑️</button>
        </div>
      </div>
      ${m.notas ? `<div class="menu-notas-box" style="margin:0">${m.notas}</div>` : ''}
    </div>`;
  }).join('');
}

function filtrarMenus() {
  const txt = document.getElementById('search-menus').value.toLowerCase();
  const cli = document.getElementById('filtro-menus-cli').value;
  document.querySelectorAll('.menu-card').forEach(card => {
    const nombre = card.querySelector('.menu-card-title')?.textContent.toLowerCase() || '';
    card.style.display = ((!txt || nombre.includes(txt))) ? '' : 'none';
  });
}

async function abrirModalMenu(preCliId = null) {
  document.getElementById('modal-menu-title').textContent = 'Nuevo menú';
  document.getElementById('menu-id').value = '';
  document.getElementById('menu-nombre').value = '';
  document.getElementById('menu-fecha-inicio').value = '';
  document.getElementById('menu-fecha-fin').value = '';
  document.getElementById('menu-notas').value = '';

  const clientes = await DB.list('clientes', { orderBy: 'nombre' });
  document.getElementById('menu-cliente').innerHTML =
    '<option value="">Sin asignar</option>' +
    clientes.map(c =>
      `<option value="${c.id}" ${preCliId === c.id ? 'selected' : ''}>${c.nombre} ${c.apellidos}</option>`
    ).join('');

  openModal('modal-menu');
}

async function abrirModalMenuParaCliente(clienteId) { await abrirModalMenu(clienteId); }

async function guardarMenu() {
  const nombre = document.getElementById('menu-nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio', true); return; }
  const data = {
    nombre,
    clienteId:   document.getElementById('menu-cliente').value || null,
    fechaInicio: document.getElementById('menu-fecha-inicio').value || null,
    fechaFin:    document.getElementById('menu-fecha-fin').value || null,
    notas:       document.getElementById('menu-notas').value.trim() || null,
  };
  try {
    const nuevo = await DB.add('menus', data);
    closeModal('modal-menu');
    toast('✅ Menú creado');
    navigate('menu-detalle', nuevo.id);
  } catch(e) { toast(e.message, true); }
}

async function duplicarMenu(menuId) {
  const m = await DB.get('menus', menuId);
  const dias = await DB.where('menu_dias', 'menuId', menuId);
  const nuevo = await DB.add('menus', { ...m, id: undefined, nombre: m.nombre + ' (copia)', createdAt: undefined });
  for (const d of dias) {
    await DB.add('menu_dias', { menuId: nuevo.id, dia: d.dia, datos: d.datos });
  }
  toast('✅ Menú duplicado');
  renderMenus();
}

function confirmarEliminarMenu(id) {
  showConfirm('¿Eliminar menú?', 'Esta acción no se puede deshacer.', async () => {
    await DB.remove('menus', id);
    toast('Menú eliminado');
    renderMenus();
  });
}

// ── Detalle / Grid de menú ────────────────────────────────────
async function renderMenuDetalle(menuId) {
  _menuActualId = menuId;
  const m = await DB.get('menus', menuId);
  _menuActualClienteId = m?.clienteId || null;
  if (!m) { navigate('menus'); return; }

  const cliente = m.clienteId ? await DB.get('clientes', m.clienteId) : null;
  const dias    = await DB.where('menu_dias', 'menuId', menuId);
  const diasMap = Object.fromEntries(dias.map(d => [d.dia, d.datos || {}]));

  let grid = `<div class="menu-tabla-wrap"><table class="menu-tabla">
    <thead><tr><th>Comida</th>${DIAS.map(d => `<th>${d}</th>`).join('')}</tr></thead>
    <tbody>`;

  COMIDAS.forEach(comida => {
    grid += `<tr><td class="comida-label">${comida}</td>`;
    DIAS.forEach(dia => {
      const val = diasMap[dia]?.[comida] || '';
      grid += `<td class="menu-cell">
        <textarea class="menu-cell-input" data-dia="${dia}" data-comida="${comida}" rows="2">${val}</textarea>
        <button class="menu-cell-btn" onclick="abrirPickerParaCelda('${dia}','${comida}')">+ plato</button>
      </td>`;
    });
    grid += '</tr>';
  });

  grid += '</tbody></table></div>';

  document.getElementById('menu-detalle-content').innerHTML = `
    <div class="card mb-4">
      <div class="card-header">
        <div>
          <div style="font-size:1.05rem;font-weight:700;color:var(--verde)">${m.nombre}</div>
          <div class="text-sm text-muted">${cliente ? cliente.nombre+' '+cliente.apellidos : 'Sin asignar'} · ${m.fechaInicio ? fmtFechaCorta(m.fechaInicio)+' → '+fmtFechaCorta(m.fechaFin) : 'Sin fechas'}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="editarMenuMeta('${menuId}')">✏️ Editar</button>
      </div>
      ${m.notas ? `<div class="menu-notas-box">${m.notas}</div>` : ''}
    </div>
    ${grid}`;
}

async function guardarGridMenu() {
  if (!_menuActualId) return;
  const celdas = document.querySelectorAll('.menu-cell-input');
  const diasMap = {};
  celdas.forEach(c => {
    const dia = c.dataset.dia;
    const com = c.dataset.comida;
    if (!diasMap[dia]) diasMap[dia] = {};
    diasMap[dia][com] = c.value;
  });

  const diasExistentes = await DB.where('menu_dias', 'menuId', _menuActualId);
  const existMap = Object.fromEntries(diasExistentes.map(d => [d.dia, d.id]));

  for (const [dia, datos] of Object.entries(diasMap)) {
    if (existMap[dia]) {
      await DB.update('menu_dias', existMap[dia], { datos });
    } else {
      await DB.add('menu_dias', { menuId: _menuActualId, dia, datos });
    }
  }
  toast('✅ Menú guardado');
}

function abrirPickerParaCelda(dia, comida) {
  _pickerCallback = (texto) => {
    const textarea = document.querySelector(`.menu-cell-input[data-dia="${dia}"][data-comida="${comida}"]`);
    if (textarea) {
      textarea.value = textarea.value ? textarea.value + '\n' + texto : texto;
    }
  };
  abrirPickerPlatos();
}

async function abrirPickerPlatos() {
  const platos = await DB.list('platos', { orderBy: 'nombre' });
  const lista = document.getElementById('picker-lista');
  lista.innerHTML = platos.length
    ? platos.map(p => `
        <div class="picker-recipe-item" onclick="seleccionarDelPicker('${p.id}')">
          <div class="pr-name">${p.nombre}</div>
          <span class="picker-tag">${p.categoria}</span>
          ${p.kcal ? `<span class="picker-tag">${p.kcal} kcal</span>` : ''}
        </div>`).join('')
    : '<p class="text-muted text-sm">Sin platos en el banco</p>';
  openModal('modal-picker-platos');
}

async function seleccionarDelPicker(id) {
  const p = await DB.get('platos', id);
  if (_pickerCallback && p) _pickerCallback(p.nombre);
  closeModal('modal-picker-platos');
}

function filtrarPicker() {
  const q = document.getElementById('picker-search').value.toLowerCase();
  document.querySelectorAll('.picker-recipe-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

async function editarMenuMeta(menuId) {
  const m = await DB.get('menus', menuId);
  document.getElementById('menu-id').value = m.id;
  document.getElementById('menu-nombre').value = m.nombre || '';
  document.getElementById('menu-fecha-inicio').value = m.fechaInicio || '';
  document.getElementById('menu-fecha-fin').value = m.fechaFin || '';
  document.getElementById('menu-notas').value = m.notas || '';

  const clientes = await DB.list('clientes', { orderBy: 'nombre' });
  document.getElementById('menu-cliente').innerHTML =
    '<option value="">Sin asignar</option>' +
    clientes.map(c =>
      `<option value="${c.id}" ${m.clienteId === c.id ? 'selected' : ''}>${c.nombre} ${c.apellidos}</option>`
    ).join('');

  document.getElementById('modal-menu-title').textContent = 'Editar menú';

  // Override guardarMenu para update
  const btn = document.querySelector('#modal-menu .modal-footer .btn-primary');
  btn.onclick = async () => {
    const data = {
      nombre:      document.getElementById('menu-nombre').value.trim(),
      clienteId:   document.getElementById('menu-cliente').value || null,
      fechaInicio: document.getElementById('menu-fecha-inicio').value || null,
      fechaFin:    document.getElementById('menu-fecha-fin').value || null,
      notas:       document.getElementById('menu-notas').value.trim() || null,
    };
    await DB.update('menus', menuId, data);
    closeModal('modal-menu');
    btn.onclick = guardarMenu;
    toast('✅ Menú actualizado');
    renderMenuDetalle(menuId);
  };
  openModal('modal-menu');
}

// ── IA para menú ──────────────────────────────────────────────
async function generarMenuConIA() {
  if (!_menuActualId) return;
  const apiKey = getApiKey();
  if (!apiKey) { toast('Configura la clave API de Claude primero', true); return; }

  const m = await DB.get('menus', _menuActualId);
  const cliente = m.clienteId ? await DB.get('clientes', m.clienteId) : null;
  let ultimaMed = null;
  if (cliente) {
    const meds = await DB.where('mediciones', 'clienteId', cliente.id, { orderBy: 'fecha' });
    ultimaMed = meds.at(-1);
  }

  const contexto = cliente
    ? `Cliente: ${cliente.nombre} ${cliente.apellidos}, objetivo: ${cliente.objetivo||'No definido'}. ${ultimaMed ? `Última medición: ${ultimaMed.peso} kg, ${ultimaMed.pctGrasa}% grasa, TMB: ${ultimaMed.tmb} kcal.` : ''}`
    : 'Sin cliente asignado.';

  toast('🤖 Generando menú con IA…');

  const prompt = `Eres un dietista nutricionista experto. ${contexto}
Genera un menú semanal completo y equilibrado (Lunes a Domingo) con Desayuno, Almuerzo, Comida, Merienda y Cena.
Responde ÚNICAMENTE en formato JSON:
{
  "Lunes":{"Desayuno":"...","Almuerzo":"...","Comida":"...","Merienda":"...","Cena":"..."},
  "Martes":{...}, ...
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const menuIA = JSON.parse(data.content[0].text.match(/\{[\s\S]+\}/)[0]);

    DIAS.forEach(dia => {
      COMIDAS.forEach(comida => {
        const textarea = document.querySelector(`.menu-cell-input[data-dia="${dia}"][data-comida="${comida}"]`);
        if (textarea && menuIA[dia]?.[comida]) textarea.value = menuIA[dia][comida];
      });
    });
    toast('✅ Menú generado por IA');
  } catch (e) { toast('Error IA: ' + e.message, true); }
}

// ════════════════════════════════════════════════════════════
//  BANCO DE PLATOS
// ════════════════════════════════════════════════════════════
async function renderPlatos(filtro = '', cat = '') {
  filtro = filtro || document.getElementById('search-platos')?.value || '';
  cat    = cat    || document.getElementById('filtro-cat-platos')?.value || '';

  let platos = await DB.list('platos', { orderBy: 'nombre' });
  if (filtro) platos = platos.filter(p => p.nombre?.toLowerCase().includes(filtro.toLowerCase()));
  if (cat)    platos = platos.filter(p => p.categoria === cat);

  const wrap = document.getElementById('platos-grid-wrap');
  if (!platos.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🍽️</div><strong>Sin platos</strong><p>Añade platos al banco para usarlos en menús</p></div>`;
    return;
  }

  wrap.innerHTML = `<div class="platos-grid">${platos.map(p => `
    <div class="plato-card">
      <div class="plato-nombre">${p.nombre}</div>
      <div class="plato-cat">${p.categoria||'General'}</div>
      <div class="plato-meta">${p.tiempo ? '⏱ '+p.tiempo+' min' : ''} ${p.ingredientes ? '· '+p.ingredientes.slice(0,60)+'…' : ''}</div>
      <div class="plato-macros">
        ${p.kcal     ? `<div class="macro-pill"><span>${p.kcal}</span>kcal</div>` : ''}
        ${p.proteinas? `<div class="macro-pill"><span>${p.proteinas}g</span>Prot</div>` : ''}
        ${p.hidratos ? `<div class="macro-pill"><span>${p.hidratos}g</span>HC</div>` : ''}
      </div>
      <div class="plato-actions">
        <button class="btn btn-secondary btn-sm" onclick="editarPlato('${p.id}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarPlato('${p.id}')">🗑️</button>
      </div>
    </div>`).join('')}</div>`;
}

function filtrarPlatos() { renderPlatos(); }

function abrirModalPlato(p = null) {
  document.getElementById('modal-plato-title').textContent = p ? 'Editar plato' : 'Nuevo plato';
  document.getElementById('plato-id').value = p?.id || '';
  ['nombre','categoria','tiempo','kcal','proteinas','hidratos','ingredientes','preparacion','notas'].forEach(f => {
    const el = document.getElementById('p-' + f);
    if (el) el.value = p?.[f] || '';
  });
  openModal('modal-plato');
}

async function editarPlato(id) { abrirModalPlato(await DB.get('platos', id)); }

async function guardarPlato() {
  const nombre = document.getElementById('p-nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio', true); return; }
  const id = document.getElementById('plato-id').value;
  const data = {
    nombre,
    categoria:    document.getElementById('p-categoria').value,
    tiempo:       parseFloatOrNull(document.getElementById('p-tiempo').value),
    kcal:         parseFloatOrNull(document.getElementById('p-kcal').value),
    proteinas:    parseFloatOrNull(document.getElementById('p-proteinas').value),
    hidratos:     parseFloatOrNull(document.getElementById('p-hidratos').value),
    ingredientes: document.getElementById('p-ingredientes').value.trim() || null,
    preparacion:  document.getElementById('p-preparacion').value.trim() || null,
    notas:        document.getElementById('p-notas').value.trim() || null,
  };
  try {
    if (id) { await DB.update('platos', id, data); toast('✅ Plato actualizado'); }
    else    { await DB.add('platos', data); toast('✅ Plato añadido al banco'); }
    closeModal('modal-plato');
    renderPlatos();
  } catch(e) { toast(e.message, true); }
}

async function eliminarPlato(id) {
  showConfirm('¿Eliminar plato?', '', async () => {
    await DB.remove('platos', id);
    toast('Plato eliminado');
    renderPlatos();
  });
}

// ════════════════════════════════════════════════════════════
//  RECETAS WEB (TheMealDB)
// ════════════════════════════════════════════════════════════
async function renderRecetas() {
  const favs = await DB.list('recetas');
  const wrap = document.getElementById('recetas-favoritas-wrap');
  if (!favs.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div><p>Sin favoritas guardadas</p></div>';
    return;
  }
  wrap.innerHTML = `<div class="recetas-grid">${favs.map(r => `
    <div class="receta-card" onclick="verRecetaModal(${JSON.stringify(r.datos||{idMeal:r.idMeal,strMeal:r.nombre,strMealThumb:r.imagen,strCategory:r.categoria}).replace(/"/g,'&quot;')})">
      <img src="${r.imagen||''}" alt="${r.nombre}" onerror="this.src=''">
      <div class="receta-card-body">
        <div class="receta-card-title">${r.nombre}</div>
        <div class="receta-card-cat">${r.categoria||''}</div>
      </div>
    </div>`).join('')}</div>`;
}

const ES_EN = {
  'pollo':'chicken','pechuga':'chicken breast','salmón':'salmon','salmon':'salmon',
  'ternera':'beef','carne':'beef','cerdo':'pork','lomo':'pork loin','jamón':'ham',
  'merluza':'hake','bacalao':'cod','atún':'tuna','dorada':'sea bream','gambas':'shrimp',
  'huevo':'egg','huevos':'eggs','tortilla':'omelette','pasta':'pasta','arroz':'rice',
  'lentejas':'lentils','garbanzos':'chickpeas','judías':'beans','espinacas':'spinach',
  'calabacín':'zucchini','berenjena':'eggplant','brócoli':'broccoli','zanahoria':'carrot',
  'tomate':'tomato','cebolla':'onion','pimiento':'pepper','ajo':'garlic','patata':'potato',
  'aguacate':'avocado','champiñón':'mushroom','champiñones':'mushrooms','manzana':'apple',
  'naranja':'orange','limón':'lemon','fresa':'strawberry','chocolate':'chocolate',
  'queso':'cheese','yogur':'yogurt','leche':'milk','mantequilla':'butter',
  'sopa':'soup','ensalada':'salad','guiso':'stew','asado':'roast','plancha':'grilled',
  'horno':'baked','vapor':'steamed','verduras':'vegetables','fruta':'fruit'
};

function traducirBusqueda(texto) {
  const lower = texto.toLowerCase().trim();
  if (ES_EN[lower]) return ES_EN[lower];
  for (const [es, en] of Object.entries(ES_EN)) {
    if (lower.includes(es)) return lower.replace(es, en);
  }
  return texto;
}

async function buscarMealDB() {
  const q = document.getElementById('search-mealdb').value.trim();
  if (!q) return;
  const wrap = document.getElementById('mealdb-results');
  wrap.innerHTML = '<div class="text-muted text-sm">Buscando…</div>';
  try {
    const qEn = traducirBusqueda(q);
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(qEn)}`);
    const data = await res.json();
    const meals = data.meals || [];
    if (!meals.length) { wrap.innerHTML = `<div class="text-muted text-sm">Sin resultados para "${q}"${qEn !== q ? ` (buscado como "${qEn}")` : ''}</div>`; return; }
    wrap.innerHTML = `<div class="recetas-grid">${meals.map(m => `
      <div class="receta-card" onclick='verRecetaModal(${JSON.stringify(m).replace(/'/g,"&#39;")})'>
        <img src="${m.strMealThumb}" alt="${m.strMeal}">
        <div class="receta-card-body">
          <div class="receta-card-title">${m.strMeal}</div>
          <div class="receta-card-cat">${m.strCategory||''} · ${m.strArea||''}</div>
        </div>
      </div>`).join('')}</div>`;
  } catch (e) { wrap.innerHTML = '<div class="text-muted text-sm">Error de conexión</div>'; }
}

let _recetaModal = null;
function verRecetaModal(meal) {
  if (typeof meal === 'string') meal = JSON.parse(meal);
  _recetaModal = meal;
  document.getElementById('receta-detalle-titulo').textContent = meal.strMeal;
  const ingreds = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal['strIngredient'+i];
    const med = meal['strMeasure'+i];
    if (ing && ing.trim()) ingreds.push(`${med ? med.trim()+' ' : ''}${ing.trim()}`);
  }
  const apiKey = getApiKey();
  document.getElementById('receta-detalle-body').innerHTML = `
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <img src="${meal.strMealThumb}" alt="${meal.strMeal}" style="width:200px;border-radius:10px;object-fit:cover">
      <div style="flex:1;min-width:200px">
        <div class="badge badge-verde mb-4">${meal.strCategory||''} · ${meal.strArea||''}</div>
        ${apiKey ? `<button class="btn btn-ambar btn-sm mb-4" onclick="traducirRecetaConIA()">🤖 Traducir al español + info nutricional</button>` : `<p class="text-muted text-sm mb-4" style="font-size:.75rem">⚠️ Ingredientes en inglés (configura API Claude para traducir automáticamente)</p>`}
        <h4 style="margin-bottom:10px;color:var(--verde)" id="receta-ing-titulo">Ingredientes</h4>
        <ul id="receta-ing-lista" style="font-size:.85rem;line-height:1.8;padding-left:16px">${ingreds.map(i=>`<li>${i}</li>`).join('')}</ul>
      </div>
    </div>
    <div id="receta-instrucciones">${meal.strInstructions ? `<div class="mt-4"><h4 style="color:var(--verde);margin-bottom:8px">Preparación</h4><p style="font-size:.84rem;line-height:1.75">${meal.strInstructions}</p></div>` : ''}</div>
    <div id="receta-nutricion"></div>`;
  openModal('modal-receta-detalle');
}

async function traducirRecetaConIA() {
  const meal = _recetaModal;
  if (!meal) return;
  const apiKey = getApiKey();
  if (!apiKey) { toast('Configura la clave API de Claude primero', true); return; }

  const btn = document.querySelector('#receta-detalle-body .btn-ambar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Traduciendo…'; }

  const ingreds = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal['strIngredient'+i];
    const med = meal['strMeasure'+i];
    if (ing && ing.trim()) ingreds.push(`${med ? med.trim()+' ' : ''}${ing.trim()}`);
  }

  const prompt = `Traduce al español esta receta y estima la información nutricional aproximada por ración.

Nombre: ${meal.strMeal}
Ingredientes: ${ingreds.join(', ')}
Instrucciones: ${(meal.strInstructions||'').substring(0, 800)}

Responde SOLO con este JSON:
{
  "nombre": "nombre en español",
  "ingredientes": ["ingrediente 1", "ingrediente 2"],
  "instrucciones": "instrucciones en español (máx 300 palabras)",
  "kcal": 000,
  "proteinas": 00,
  "hidratos": 00,
  "grasas": 00
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const json = JSON.parse(data.content[0].text.match(/\{[\s\S]+\}/)[0]);

    document.getElementById('receta-ing-titulo').textContent = 'Ingredientes';
    document.getElementById('receta-ing-lista').innerHTML = json.ingredientes.map(i=>`<li>${i}</li>`).join('');
    document.getElementById('receta-instrucciones').innerHTML = `<div class="mt-4"><h4 style="color:var(--verde);margin-bottom:8px">Preparación</h4><p style="font-size:.84rem;line-height:1.75">${json.instrucciones}</p></div>`;
    document.getElementById('receta-nutricion').innerHTML = `
      <div class="mt-4" style="background:var(--menta);border-radius:8px;padding:12px 16px">
        <h4 style="color:var(--verde);margin-bottom:8px">Información nutricional (estimada por ración)</h4>
        <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.85rem">
          <span>⚡ <strong>${json.kcal}</strong> kcal</span>
          <span>🥩 <strong>${json.proteinas}g</strong> proteínas</span>
          <span>🍞 <strong>${json.hidratos}g</strong> hidratos</span>
          <span>🫒 <strong>${json.grasas}g</strong> grasas</span>
        </div>
      </div>`;
    if (btn) { btn.disabled = false; btn.textContent = '✅ Traducido'; }
    _recetaModal._traduccion = json;
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Traducir al español + info nutricional'; }
    toast('Error al traducir: ' + e.message, true);
  }
}

async function guardarFavorita() {
  if (!_recetaModal) return;
  const m = _recetaModal;
  try {
    await DB.add('recetas', {
      idMeal: m.idMeal, nombre: m.strMeal,
      categoria: m.strCategory, imagen: m.strMealThumb,
      datos: m, isFavorita: true
    });
    toast('⭐ Guardada en favoritas');
  } catch(e) {
    if (e.message.includes('unique')) toast('Ya está en favoritas');
    else toast(e.message, true);
  }
}

async function importarComoPlato() {
  if (!_recetaModal) return;
  const m = _recetaModal;
  const ingreds = [];
  for (let i = 1; i <= 20; i++) {
    const ing = m['strIngredient'+i];
    const med = m['strMeasure'+i];
    if (ing?.trim()) ingreds.push(`${med?.trim()||''} ${ing.trim()}`.trim());
  }
  const t = m._traduccion;
  await DB.add('platos', {
    nombre: t ? t.nombre : m.strMeal,
    categoria: 'Comida',
    ingredientes: t ? t.ingredientes.join(', ') : ingreds.join(', '),
    preparacion: t ? t.instrucciones : (m.strInstructions || ''),
    imagen: m.strMealThumb,
    kcal: t?.kcal || null,
    proteinas: t?.proteinas || null,
    hidratos: t?.hidratos || null
  });
  closeModal('modal-receta-detalle');
  toast('✅ Importado al banco de platos');
  if (currentView === 'platos') renderPlatos();
}

// ════════════════════════════════════════════════════════════
//  AGENDA
// ════════════════════════════════════════════════════════════
async function renderCalendario() {
  const titulo = document.getElementById('cal-titulo');
  const grid   = document.getElementById('cal-grid');
  const meses  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  titulo.textContent = `${meses[_calMes]} ${_calAnio}`;

  const primero = new Date(_calAnio, _calMes, 1);
  const diasEnMes = new Date(_calAnio, _calMes+1, 0).getDate();
  const iniciaSemana = (primero.getDay() + 6) % 7; // lunes=0

  const mes = String(_calMes+1).padStart(2,'0');
  const [citas, bloqueados] = await Promise.all([
    DB.list('citas'),
    DB.list('dias_bloqueados')
  ]);

  const citasDates = new Set(citas.map(c => c.fecha));
  const bloqDates  = new Set(bloqueados.map(b => b.fecha));

  const dias = ['L','M','X','J','V','S','D'];
  let html = dias.map(d => `<div style="font-weight:700;font-size:.68rem;color:var(--gris-400);padding:3px 0">${d}</div>`).join('');

  // Celdas vacías hasta el primer día
  for (let i = 0; i < iniciaSemana; i++) html += '<div></div>';

  for (let d = 1; d <= diasEnMes; d++) {
    const dd   = String(d).padStart(2,'0');
    const fecha = `${_calAnio}-${mes}-${dd}`;
    const hoy  = new Date().toISOString().slice(0,10) === fecha;
    const tieCita = citasDates.has(fecha);
    const bloq    = bloqDates.has(fecha);
    html += `<div onclick="seleccionarDia('${fecha}')" style="
      padding:4px 2px;border-radius:5px;cursor:pointer;
      ${hoy ? 'background:var(--verde);color:#fff;font-weight:700;' : ''}
      ${tieCita && !hoy ? 'background:var(--menta);color:var(--verde);font-weight:700;' : ''}
      ${bloq ? 'background:var(--ambar-claro);' : ''}
    ">${d}${tieCita ? '<span style="display:block;width:5px;height:5px;border-radius:50%;background:var(--verde-claro);margin:1px auto 0"></span>' : ''}</div>`;
  }

  grid.innerHTML = html;
}

function cambiarMesCal(delta) {
  _calMes += delta;
  if (_calMes > 11) { _calMes = 0; _calAnio++; }
  if (_calMes < 0)  { _calMes = 11; _calAnio--; }
  renderCalendario();
}

function seleccionarDia(fecha) {
  document.getElementById('cita-fecha').value = fecha;
  abrirModalCita(fecha);
}

async function cargarListaCitas(filtro = 'hoy') {
  const hoy = new Date().toISOString().slice(0,10);
  const [citas, clientes] = await Promise.all([
    DB.list('citas', { orderBy: 'fecha' }),
    DB.list('clientes')
  ]);
  const cliMap = Object.fromEntries(clientes.map(c => [c.id, c]));

  let filtradas = citas;
  if (filtro === 'hoy') filtradas = citas.filter(c => c.fecha === hoy);
  else if (filtro === 'semana') {
    const fin = new Date(); fin.setDate(fin.getDate() + 7);
    filtradas = citas.filter(c => c.fecha >= hoy && c.fecha <= fin.toISOString().slice(0,10));
  } else if (filtro === 'mes') {
    const mes = hoy.slice(0,7);
    filtradas = citas.filter(c => c.fecha?.startsWith(mes));
  }

  const lista = document.getElementById('agenda-lista');
  const sub   = document.getElementById('agenda-subtitulo');
  sub.textContent = `${filtradas.length} cita(s)`;

  if (!filtradas.length) {
    lista.innerHTML = `<div class="empty-state" style="padding:32px"><div class="empty-icon">📅</div><p>Sin citas</p></div>`;
    return;
  }

  lista.innerHTML = filtradas.map(ci => {
    const c = cliMap[ci.clienteId];
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gris-100)">
      <div style="text-align:center;background:var(--menta);border-radius:8px;padding:6px 10px;min-width:56px">
        <div style="font-size:1.1rem;font-weight:700;color:var(--verde)">${ci.fecha?.slice(8)}</div>
        <div style="font-size:.7rem;color:var(--verde-claro)">${ci.hora||''}</div>
      </div>
      <div style="flex:1">
        <div style="font-weight:600">${c ? c.nombre+' '+c.apellidos : 'Sin cliente'}</div>
        <div class="text-sm text-muted">${ci.motivo||'—'}</div>
      </div>
      <div class="td-actions">
        ${c?.telefono ? `<button class="btn-icon" title="Confirmar cita por WhatsApp" onclick="enviarWhatsAppCita('${ci.id}','confirmar')">📱✅</button><button class="btn-icon" title="Recordatorio por WhatsApp" onclick="enviarWhatsAppCita('${ci.id}','recordatorio')">📱🔔</button>` : ''}
        ${c?.email ? `<button class="btn-icon" title="Confirmar cita por Email" onclick="enviarEmailCita('${ci.id}','confirmar')">📧✅</button><button class="btn-icon" title="Recordatorio por Email" onclick="enviarEmailCita('${ci.id}','recordatorio')">📧🔔</button>` : ''}
        <button class="btn-icon" onclick="editarCita('${ci.id}')">✏️</button>
        <button class="btn-icon" onclick="confirmarEliminarCita('${ci.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function filtrarCitas(tipo, btn) {
  document.querySelectorAll('#view-agenda .btn-filter').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
  cargarListaCitas(tipo);
}

async function abrirModalCita(fechaPre = null) {
  document.getElementById('modal-cita-title').textContent = 'Nueva cita';
  document.getElementById('cita-id').value = '';
  document.getElementById('cita-motivo').value = '';
  document.getElementById('cita-notas').value = '';
  document.getElementById('cita-hora').value = '';
  if (fechaPre) document.getElementById('cita-fecha').value = fechaPre;

  const clientes = await DB.list('clientes', { orderBy: 'nombre' });
  document.getElementById('cita-cliente').innerHTML =
    '<option value="">Sin asignar</option>' +
    clientes.map(c => `<option value="${c.id}">${c.nombre} ${c.apellidos}</option>`).join('');

  openModal('modal-cita');
}

async function abrirModalCitaParaCliente(clienteId) {
  await abrirModalCita();
  document.getElementById('cita-cliente').value = clienteId;
}

async function editarCita(id) {
  const ci = await DB.get('citas', id);
  document.getElementById('modal-cita-title').textContent = 'Editar cita';
  document.getElementById('cita-id').value = ci.id;
  document.getElementById('cita-fecha').value = ci.fecha || '';
  document.getElementById('cita-hora').value = ci.hora || '';
  document.getElementById('cita-motivo').value = ci.motivo || '';
  document.getElementById('cita-notas').value = ci.notas || '';

  const clientes = await DB.list('clientes', { orderBy: 'nombre' });
  document.getElementById('cita-cliente').innerHTML =
    '<option value="">Sin asignar</option>' +
    clientes.map(c => `<option value="${c.id}" ${ci.clienteId===c.id?'selected':''}>${c.nombre} ${c.apellidos}</option>`).join('');

  openModal('modal-cita');
}

async function guardarCita() {
  const id = document.getElementById('cita-id').value;
  const fecha = document.getElementById('cita-fecha').value;
  if (!fecha) { toast('La fecha es obligatoria', true); return; }
  const data = {
    clienteId: document.getElementById('cita-cliente').value || null,
    fecha, hora: document.getElementById('cita-hora').value || null,
    motivo: document.getElementById('cita-motivo').value.trim() || null,
    notas:  document.getElementById('cita-notas').value.trim() || null,
  };
  try {
    if (id) { await DB.update('citas', id, data); toast('✅ Cita actualizada'); }
    else    { await DB.add('citas', data); toast('✅ Cita guardada'); }
    closeModal('modal-cita');
    renderCalendario(); cargarListaCitas();
  } catch(e) { toast(e.message, true); }
}

function confirmarEliminarCita(id) {
  showConfirm('¿Eliminar cita?', '', async () => {
    await DB.remove('citas', id);
    toast('Cita eliminada');
    renderCalendario(); cargarListaCitas();
  });
}

async function abrirModalBloquearDia() {
  if (!isSuperAdmin()) { toast('Solo el super admin puede bloquear días', true); return; }
  document.getElementById('bloqueo-fecha').value = new Date().toISOString().slice(0,10);
  document.getElementById('bloqueo-motivo').value = '';
  openModal('modal-bloquear-dia');
}

async function guardarDiaBloqueado() {
  const fecha = document.getElementById('bloqueo-fecha').value;
  if (!fecha) { toast('Selecciona una fecha', true); return; }
  const data = {
    fecha,
    tipo:   document.getElementById('bloqueo-tipo').value,
    motivo: document.getElementById('bloqueo-motivo').value.trim() || null,
  };
  try {
    await DB.add('dias_bloqueados', data);
    closeModal('modal-bloquear-dia');
    toast('✅ Día bloqueado');
    renderCalendario();
  } catch(e) { toast(e.message, true); }
}

// ════════════════════════════════════════════════════════════
//  INFORMES Y ENVÍO
// ════════════════════════════════════════════════════════════
async function renderInformes() {
  const clientes = await DB.list('clientes', { orderBy: 'nombre' });
  const wrap = document.getElementById('informes-wrap');
  if (!clientes.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><strong>Sin clientes</strong><p>Añade clientes para generar informes</p></div>`;
    return;
  }
  wrap.innerHTML = clientes.map(c => `
    <div class="informe-cliente-card">
      <div class="informe-cli-header">
        <div>
          <h4>${c.nombre} ${c.apellidos}</h4>
          <p>${c.telefono||''} ${c.email||''}</p>
        </div>
      </div>
      <div class="informe-rows">
        <div class="informe-row-v2"><span class="ir-icon">📄</span><span class="ir-label">Informe de progreso (PDF)</span>
          <div class="ir-actions">
            <button class="btn btn-secondary btn-sm" onclick="generarInformePDF('${c.id}')">📄 Generar PDF</button>
          </div>
        </div>
        <div class="informe-row-v2"><span class="ir-icon">📱</span><span class="ir-label">Enviar por WhatsApp</span>
          <div class="ir-actions">
            <button class="btn btn-success btn-sm" onclick="enviarWhatsApp('${c.id}','progreso')">📱 Progreso</button>
            <button class="btn btn-success btn-sm" onclick="enviarWhatsApp('${c.id}','menu')">🥗 Menú</button>
          </div>
        </div>
        <div class="informe-row-v2"><span class="ir-icon">📧</span><span class="ir-label">Enviar por Email</span>
          <div class="ir-actions">
            <button class="btn btn-ambar btn-sm" onclick="enviarEmail('${c.id}','progreso')">📧 Email</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

async function generarInformePDF(clienteId) {
  const c    = await DB.get('clientes', clienteId);
  const meds = await DB.where('mediciones', 'clienteId', clienteId, { orderBy: 'fecha' });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 64, 53);
  doc.text('NutriApp — Informe de Progreso', 14, 20);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text(`Cliente: ${c.nombre} ${c.apellidos}`, 14, 32);
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, 14, 40);

  if (meds.length) {
    const ultima = meds.at(-1);
    const primera = meds[0];
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Última medición:', 14, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(`Peso: ${ultima.peso||'—'} kg`, 14, 63);
    doc.text(`% Grasa: ${ultima.pctGrasa||'—'}%`, 14, 71);
    doc.text(`Masa muscular: ${ultima.masaMusc||'—'} kg`, 14, 79);
    doc.text(`Puntuación salud: ${ultima.puntuacion||'—'}`, 14, 87);

    if (meds.length > 1 && primera.peso && ultima.peso) {
      const dif = (ultima.peso - primera.peso).toFixed(1);
      doc.text(`Evolución peso: ${dif > 0 ? '+' : ''}${dif} kg (${fmtFechaCorta(primera.fecha)} → ${fmtFechaCorta(ultima.fecha)})`, 14, 97);
    }

    // Tabla historial
    const tableData = meds.map(m => [
      fmtFechaCorta(m.fecha), m.peso||'—', m.pctGrasa||'—', m.masaMusc||'—', m.puntuacion||'—'
    ]);
    doc.autoTable({
      startY: 110,
      head: [['Fecha','Peso (kg)','% Grasa','Músculo (kg)','Puntuación']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 64, 53] }
    });
  }

  doc.save(`informe_${c.nombre}_${c.apellidos}_${new Date().toISOString().slice(0,10)}.pdf`);
  toast('✅ PDF generado');
}

async function enviarWhatsAppBascula(clienteId) {
  const c    = await DB.get('clientes', clienteId);
  if (!c?.telefono) { toast('El cliente no tiene teléfono', true); return; }
  const meds = await DB.where('mediciones', 'clienteId', clienteId, { orderBy: 'fecha' });
  const ultima = meds.at(-1);
  if (!ultima) { toast('Sin mediciones', true); return; }

  const urlInforme = meds.slice().reverse().find(m => m.reportUrl)?.reportUrl;
  let msg = `Hola ${c.nombre} 👋 Aquí tienes los resultados de tu última medición:\n`;
  msg += `• Peso: ${ultima.peso||'—'} kg\n`;
  msg += `• % Grasa: ${ultima.pctGrasa||'—'}%\n`;
  msg += `• Masa muscular: ${ultima.masaMusc||'—'} kg\n`;
  msg += `• Puntuación: ${ultima.puntuacion||'—'}\n`;
  if (urlInforme) msg += `\n📊 Tu informe completo: ${urlInforme}`;
  msg += `\n\n¡Seguimos trabajando! 💪`;

  const phone = c.telefono.replace(/\D/g,'');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function enviarEmailBascula(clienteId) {
  const c    = await DB.get('clientes', clienteId);
  if (!c?.email) { toast('El cliente no tiene email', true); return; }
  const meds = await DB.where('mediciones', 'clienteId', clienteId, { orderBy: 'fecha' });
  const ultima = meds.at(-1);
  if (!ultima) { toast('Sin mediciones', true); return; }

  const urlInforme = meds.slice().reverse().find(m => m.reportUrl)?.reportUrl;
  const cfg = _appConfig;

  const message = `Hola ${c.nombre},\n\nAquí tienes los resultados de tu última medición:\n• Peso: ${ultima.peso||'—'} kg\n• % Grasa: ${ultima.pctGrasa||'—'}%\n• Masa muscular: ${ultima.masaMusc||'—'} kg\n• Puntuación: ${ultima.puntuacion||'—'}\n${urlInforme ? `\nInforme completo: ${urlInforme}\n` : ''}\n¡Seguimos trabajando! 💪`;

  if (!cfg.ejsKey || !cfg.ejsService || !cfg.ejsTemplate) {
    await navigator.clipboard.writeText(message).catch(()=>{});
    toast('Texto copiado al portapapeles (configura EmailJS para enviar directo)');
    return;
  }
  try {
    await emailjs.send(cfg.ejsService, cfg.ejsTemplate, {
      to_email: c.email, to_name: `${c.nombre} ${c.apellidos}`,
      from_name: cfg.nombreApp || 'NutriApp',
      subject: 'Resultados de tu medición',
      message
    });
    toast('✅ Email enviado');
  } catch(e) { toast('Error enviando email: ' + e.message, true); }
}

async function enviarWhatsApp(clienteId, tipo) {
  const c = await DB.get('clientes', clienteId);
  if (!c.telefono) { toast('El cliente no tiene teléfono', true); return; }

  const meds = await DB.where('mediciones', 'clienteId', clienteId, { orderBy: 'fecha' });
  const ultima = meds.at(-1);

  let msg = `Hola ${c.nombre}! `;
  if (tipo === 'progreso' && ultima) {
    msg += `Aquí tienes tu resumen de progreso:\n• Peso: ${ultima.peso||'—'} kg\n• % Grasa: ${ultima.pctGrasa||'—'}%\n• Masa muscular: ${ultima.masaMusc||'—'} kg\n• Puntuación: ${ultima.puntuacion||'—'}\n\nSi tienes dudas, no dudes en contactarme. 💪`;
  } else {
    msg += `Te envío tu menú semanal. Cualquier duda, escríbeme. 🥗`;
  }

  const phone = c.telefono.replace(/\D/g,'');
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

async function enviarEmail(clienteId, tipo) {
  const c    = await DB.get('clientes', clienteId);
  const cfg  = _appConfig;

  if (!cfg.ejsKey || !cfg.ejsService || !cfg.ejsTemplate) {
    // Sin EmailJS: copiar texto
    const meds = await DB.where('mediciones', 'clienteId', clienteId, { orderBy: 'fecha' });
    const ultima = meds.at(-1);
    const texto = `Hola ${c.nombre},\n\nAquí tu resumen:\n• Peso: ${ultima?.peso||'—'} kg\n• % Grasa: ${ultima?.pctGrasa||'—'}%\n• Músculo: ${ultima?.masaMusc||'—'} kg\n• Puntuación: ${ultima?.puntuacion||'—'}\n\n¡Buen trabajo!`;
    await navigator.clipboard.writeText(texto).catch(()=>{});
    toast('Texto copiado al portapapeles (configura EmailJS para enviar directo)');
    return;
  }

  try {
    await emailjs.send(cfg.ejsService, cfg.ejsTemplate, {
      to_email: c.email, to_name: `${c.nombre} ${c.apellidos}`,
      from_name: cfg.nombreApp || 'NutriApp',
      subject: 'Tu informe nutricional',
      message: `Hola ${c.nombre}, adjuntamos tu informe de progreso.`
    });
    toast('✅ Email enviado');
  } catch(e) { toast('Error enviando email: ' + e.message, true); }
}

async function enviarWhatsAppCita(citaId, tipo) {
  const ci = await DB.get('citas', citaId);
  const c  = ci.clienteId ? await DB.get('clientes', ci.clienteId) : null;
  if (!c?.telefono) { toast('El cliente no tiene teléfono', true); return; }

  const fecha = ci.fecha ? new Date(ci.fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' }) : '—';
  const hora  = ci.hora || '';

  let msg;
  if (tipo === 'confirmar') {
    msg = `Hola ${c.nombre} 👋 Te confirmo tu cita el ${fecha}${hora ? ' a las ' + hora : ''}. Cualquier cambio no dudes en avisarme. ¡Hasta pronto! 😊`;
  } else {
    msg = `Hola ${c.nombre} 🔔 Te recuerdo que tienes cita mañana ${fecha}${hora ? ' a las ' + hora : ''}. ¡Te espero!`;
  }

  const phone = c.telefono.replace(/\D/g,'');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function enviarEmailCita(citaId, tipo) {
  const ci  = await DB.get('citas', citaId);
  const c   = ci.clienteId ? await DB.get('clientes', ci.clienteId) : null;
  if (!c?.email) { toast('El cliente no tiene email', true); return; }

  const fecha = ci.fecha ? new Date(ci.fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' }) : '—';
  const hora  = ci.hora || '';
  const cfg   = _appConfig;

  const subject = tipo === 'confirmar' ? 'Confirmación de cita' : 'Recordatorio de cita';
  const message = tipo === 'confirmar'
    ? `Hola ${c.nombre},\n\nTe confirmo tu cita el ${fecha}${hora ? ' a las ' + hora : ''}.\n\nCualquier cambio no dudes en avisarme.\n\n¡Hasta pronto!`
    : `Hola ${c.nombre},\n\nTe recuerdo que tienes cita mañana ${fecha}${hora ? ' a las ' + hora : ''}.\n\n¡Te espero!`;

  if (!cfg.ejsKey || !cfg.ejsService || !cfg.ejsTemplate) {
    await navigator.clipboard.writeText(message).catch(()=>{});
    toast('Texto copiado al portapapeles (configura EmailJS para enviar directo)');
    return;
  }

  try {
    await emailjs.send(cfg.ejsService, cfg.ejsTemplate, {
      to_email: c.email, to_name: `${c.nombre} ${c.apellidos}`,
      from_name: cfg.nombreApp || 'NutriApp', subject, message
    });
    toast('✅ Email enviado');
  } catch(e) { toast('Error enviando email: ' + e.message, true); }
}

async function enviarEmailMenu(menuId) {
  const m   = menuId ? await DB.get('menus', menuId) : null;
  const c   = m?.clienteId ? await DB.get('clientes', m.clienteId) : null;
  if (!c) { toast('Este menú no tiene cliente asignado', true); return; }
  if (!c.email) { toast('El cliente no tiene email', true); return; }

  const dias = await DB.where('menu_dias', 'menuId', menuId);
  const diasMap = Object.fromEntries(dias.map(d => [d.dia, d.datos || {}]));
  const orden = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const comidas = ['desayuno','almuerzo','comida','merienda','cena'];

  let cuerpo = `Hola ${c.nombre},\n\nAquí tienes tu menú semanal "${m.nombre}":\n\n`;
  for (const dia of orden) {
    const d = diasMap[dia];
    if (!d) continue;
    cuerpo += `── ${dia} ──\n`;
    for (const com of comidas) {
      if (d[com]) cuerpo += `  ${com.charAt(0).toUpperCase()+com.slice(1)}: ${d[com]}\n`;
    }
    cuerpo += '\n';
  }
  if (m.notas) cuerpo += `Recomendaciones:\n${m.notas}\n`;
  cuerpo += '\n¡Mucho ánimo! 💪';

  const cfg = _appConfig;
  if (!cfg.ejsKey || !cfg.ejsService || !cfg.ejsTemplate) {
    await navigator.clipboard.writeText(cuerpo).catch(()=>{});
    toast('Menú copiado al portapapeles (configura EmailJS para enviar directo)');
    return;
  }

  try {
    await emailjs.send(cfg.ejsService, cfg.ejsTemplate, {
      to_email: c.email, to_name: `${c.nombre} ${c.apellidos}`,
      from_name: cfg.nombreApp || 'NutriApp',
      subject: `Tu menú semanal — ${m.nombre}`,
      message: cuerpo
    });
    toast('✅ Menú enviado por email');
  } catch(e) { toast('Error enviando email: ' + e.message, true); }
}

// ════════════════════════════════════════════════════════════
//  IA NUTRICIONAL
// ════════════════════════════════════════════════════════════
async function renderIA() {
  const clientes = await DB.list('clientes', { orderBy: 'nombre' });
  const sel = document.getElementById('ia-cliente-sel');
  sel.innerHTML = '<option value="">Sin cliente seleccionado</option>' +
    clientes.map(c => `<option value="${c.id}">${c.nombre} ${c.apellidos}</option>`).join('');

  document.getElementById('ia-quick-prompts').innerHTML = [
    'Analiza la evolución del cliente seleccionado',
    'Genera un menú semanal personalizado',
    'Interpreta los datos de la última medición',
    'Redacta un mensaje motivador para el cliente',
    'Sugerencias para mejorar la composición corporal'
  ].map(p => `<button class="ia-quick-btn" onclick="setIAPrompt('${p.replace(/'/g,"\\'")}')">💬 ${p}</button>`).join('');
}

function setIAPrompt(p) {
  document.getElementById('ia-input').value = p;
  document.getElementById('ia-input').focus();
}

function limpiarChatIA() {
  _iaHistorial = [];
  document.getElementById('ia-chat-messages').innerHTML =
    '<div class="ia-msg assistant">👋 Chat limpiado. ¿En qué puedo ayudarte?</div>';
}

async function enviarMensajeIA() {
  const apiKey = getApiKey();
  if (!apiKey) { toast('Configura la clave API de Claude primero', true); return; }

  const input = document.getElementById('ia-input');
  const msg   = input.value.trim();
  if (!msg) return;

  const clienteId = document.getElementById('ia-cliente-sel').value;
  const msgs = document.getElementById('ia-chat-messages');

  // Añadir mensaje usuario
  msgs.innerHTML += `<div class="ia-msg user">${msg}</div>`;
  input.value = '';
  const thinking = document.createElement('div');
  thinking.className = 'ia-msg thinking';
  thinking.textContent = 'Claude está pensando…';
  msgs.appendChild(thinking);
  msgs.scrollTop = msgs.scrollHeight;

  // Construir contexto del cliente
  let contexto = '';
  if (clienteId) {
    try {
      const c = await DB.get('clientes', clienteId);
      const meds = await DB.where('mediciones', 'clienteId', clienteId, { orderBy: 'fecha' });
      const menus = await DB.where('menus', 'clienteId', clienteId, { orderBy: 'createdAt', asc: false, limit: 2 });
      contexto = `\n[CONTEXTO CLIENTE: ${c.nombre} ${c.apellidos}, ${c.objetivo||''}. ${c.notas||''}\nÚltimas mediciones: ${meds.slice(-3).map(m=>`${fmtFechaCorta(m.fecha)}: ${m.peso}kg ${m.pctGrasa}%grasa ${m.masaMusc}kg músculo punt.${m.puntuacion}`).join(' | ')}\nMenús: ${menus.map(m=>m.nombre).join(', ')}]`;
    } catch {}
  }

  _iaHistorial.push({ role: 'user', content: msg + contexto });

  const btn = document.getElementById('btn-ia-send');
  btn.disabled = true;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: 'Eres un asistente nutricional profesional y empático. Ayudas a nutricionistas con análisis de pacientes, planes de alimentación, interpretación de composición corporal y comunicación con clientes. Responde siempre en español.',
        messages: _iaHistorial.slice(-10)
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const reply = data.content[0].text;
    _iaHistorial.push({ role: 'assistant', content: reply });
    thinking.remove();
    msgs.innerHTML += `<div class="ia-msg assistant">${reply}</div>`;
  } catch(e) {
    thinking.textContent = '❌ Error: ' + e.message;
  } finally {
    btn.disabled = false;
    msgs.scrollTop = msgs.scrollHeight;
  }
}

// ════════════════════════════════════════════════════════════
//  EXPORTAR MENÚ PDF
// ════════════════════════════════════════════════════════════
async function exportarMenuPDFActual() {
  if (!_menuActualId) return;
  await guardarGridMenu();
  const m    = await DB.get('menus', _menuActualId);
  const dias  = await DB.where('menu_dias', 'menuId', _menuActualId);
  const diasMap = Object.fromEntries(dias.map(d => [d.dia, d.datos || {}]));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 64, 53);
  doc.text(m.nombre, 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  if (m.fechaInicio) doc.text(`${fmtFechaCorta(m.fechaInicio)} → ${fmtFechaCorta(m.fechaFin)}`, 14, 22);

  const head = [['Comida', ...DIAS]];
  const body = COMIDAS.map(comida =>
    [comida, ...DIAS.map(dia => diasMap[dia]?.[comida] || '')]
  );

  doc.autoTable({
    startY: 28,
    head, body,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 53] },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [200, 230, 213] } }
  });

  doc.save(`menu_${m.nombre.replace(/\s/g,'_')}.pdf`);
  toast('✅ PDF del menú generado');
}

// ════════════════════════════════════════════════════════════
//  USUARIOS (solo super_admin)
// ════════════════════════════════════════════════════════════
async function renderUsuarios() {
  if (!isSuperAdmin()) { navigate('dashboard'); return; }
  const usuarios = await DB.listUsuarios();
  const wrap = document.getElementById('tabla-usuarios-wrap');
  if (!usuarios.length) { wrap.innerHTML = '<p>Sin usuarios</p>'; return; }
  wrap.innerHTML = `<table><thead><tr><th>Nombre / Email</th><th>Rol</th><th>Acciones</th></tr></thead><tbody>${
    usuarios.map(u => `<tr>
      <td>${u.nombre||'—'}</td>
      <td><select class="form-control" style="width:160px" onchange="cambiarRol('${u.id}',this.value)">
        <option value="nutricionista" ${u.rol==='nutricionista'?'selected':''}>Nutricionista</option>
        <option value="super_admin" ${u.rol==='super_admin'?'selected':''}>Super Admin</option>
      </select></td>
      <td></td>
    </tr>`).join('')
  }</tbody></table>`;
}

async function cambiarRol(userId, rol) {
  await DB.updateRol(userId, rol);
  toast('✅ Rol actualizado');
}

function mostrarInstruccionesNuevoUsuario() {
  showConfirm(
    '¿Cómo crear un usuario?',
    'Ve al Dashboard de Supabase → Authentication → Users → "Invite user". Introduce el email del nuevo nutricionista. Recibirá un enlace para crear su contraseña.',
    null, '✅ Entendido'
  );
}

// ════════════════════════════════════════════════════════════
//  GRÁFICA DE EVOLUCIÓN
// ════════════════════════════════════════════════════════════
let _charts = {};
function renderGraficaCliente(meds, clienteId) {
  const canvasId = `chart-cliente-${clienteId}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (_charts[clienteId]) { _charts[clienteId].destroy(); }

  const labels = meds.map(m => fmtFechaCorta(m.fecha));
  _charts[clienteId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Peso (kg)', data: meds.map(m=>m.peso), borderColor: '#1e4035', backgroundColor: 'rgba(30,64,53,.1)', tension: .3, yAxisID: 'y' },
        { label: '% Grasa', data: meds.map(m=>m.pctGrasa), borderColor: '#c04040', backgroundColor: 'rgba(192,64,64,.1)', tension: .3, yAxisID: 'y2' },
        { label: 'Músculo (kg)', data: meds.map(m=>m.masaMusc), borderColor: '#4a8c6f', backgroundColor: 'rgba(74,140,111,.1)', tension: .3, yAxisID: 'y' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y:  { type: 'linear', position: 'left',  title: { display: true, text: 'kg' } },
        y2: { type: 'linear', position: 'right', title: { display: true, text: '%' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

// ════════════════════════════════════════════════════════════
//  MODALES
// ════════════════════════════════════════════════════════════
function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('open'); if (id === 'modal-settings') { renderKeyStatus(); } }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// Cerrar clic fuera
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

function showConfirm(title, msg, onOk, okLabel = 'Eliminar') {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok');
  btn.textContent = okLabel;
  btn.onclick = onOk ? async () => { closeModal('modal-confirm'); await onOk(); } : () => closeModal('modal-confirm');
  if (!onOk) btn.style.display = 'none'; else btn.style.display = '';
  openModal('modal-confirm');
}

// ════════════════════════════════════════════════════════════
//  UTILIDADES
// ════════════════════════════════════════════════════════════
function toast(msg, error = false) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtFechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function parseFloatOrNull(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function badgePunt(p) {
  if (p >= 80) return 'badge-verde';
  if (p >= 60) return 'badge-ambar';
  return 'badge-rojo';
}
