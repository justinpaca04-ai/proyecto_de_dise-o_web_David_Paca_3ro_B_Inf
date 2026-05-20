const API = 'http://localhost:3000/api';
let token = null;
let datosEquipos = [];

function mostrar(pantalla) {
  document.getElementById('pantalla-caratula').style.display = 'none';
  document.getElementById('pantalla-login').style.display    = 'none';
  document.getElementById('pantalla-sistema').style.display  = 'none';

  if (pantalla === 'caratula') {
    document.getElementById('pantalla-caratula').style.display = 'flex';
  }
  if (pantalla === 'login') {
    document.getElementById('pantalla-login').style.display = 'flex';
    setTimeout(() => document.getElementById('inp-cedula').focus(), 100);
  }
  if (pantalla === 'sistema') {
    document.getElementById('pantalla-sistema').style.display = 'flex';
  }
}

async function iniciarSesion() {
  const cedula     = document.getElementById('inp-cedula').value.trim();
  const contrasena = document.getElementById('inp-contrasena').value;
  const msgErr     = document.getElementById('msg-login-error');
  msgErr.style.display = 'none';

  if (cedula.length < 10 || !contrasena) {
    msgErr.textContent    = 'Ingrese su cédula (10 dígitos) y contraseña.';
    msgErr.style.display  = 'block';
    return;
  }

  try {
    const r = await fetch(`${API}/login`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ cedula, contrasena })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error desconocido');

    token = data.token;
    document.getElementById('badge-usuario').textContent = `👤 ${data.nombre}`;
    document.getElementById('inp-contrasena').value = '';
    mostrar('sistema');
    activarTab('registro');
    cargarEquipos();
  } catch (e) {
    msgErr.textContent   = e.message;
    msgErr.style.display = 'block';
  }
}

function cerrarSesion() {
  token = null;
  datosEquipos = [];
  mostrar('caratula');
}

function activarTab(nombre) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    const ids = ['registro', 'listado', 'usuarios', 'reportes'];
    t.classList.toggle('activo', ids[i] === nombre);
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('activo'));
  document.getElementById('tab-' + nombre).classList.add('activo');
  if (nombre === 'listado') cargarEquipos();
  if (nombre === 'usuarios') cargarUsuarios();
}

async function guardarEquipo() {
  const campos = {
    codigo_inventario  : document.getElementById('f-codigo').value.trim().toUpperCase(),
    tipo_equipo        : document.getElementById('f-tipo').value,
    marca              : document.getElementById('f-marca').value.trim(),
    modelo             : document.getElementById('f-modelo').value.trim(),
    serie              : document.getElementById('f-serie').value.trim(),
    descripcion_dano   : document.getElementById('f-dano').value.trim(),
    diagnostico_tecnico: document.getElementById('f-diagnostico').value.trim(),
    fecha_baja         : document.getElementById('f-fecha').value,
    observaciones      : document.getElementById('f-obs').value.trim()
  };

  const msgOK  = document.getElementById('msg-guardado');
  const msgErr = document.getElementById('msg-form-error');
  msgOK.style.display  = 'none';
  msgErr.style.display = 'none';

  const requeridos = ['codigo_inventario','tipo_equipo','marca','modelo',
                      'serie','descripcion_dano','diagnostico_tecnico','fecha_baja'];
  for (const k of requeridos) {
    if (!campos[k]) {
      msgErr.textContent   = 'Complete todos los campos obligatorios (*)';
      msgErr.style.display = 'block';
      return;
    }
  }

  try {
    const r = await fetch(`${API}/equipos`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body   : JSON.stringify(campos)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error al guardar');
    msgOK.style.display = 'block';
    limpiarFormulario();
    setTimeout(() => msgOK.style.display = 'none', 4000);
  } catch (e) {
    msgErr.textContent   = e.message;
    msgErr.style.display = 'block';
  }
}

function limpiarFormulario() {
  ['f-codigo','f-tipo','f-marca','f-modelo','f-serie',
   'f-dano','f-diagnostico','f-obs','f-fecha'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-fecha').valueAsDate = new Date();
}

async function cargarEquipos() {
  try {
    const r = await fetch(`${API}/equipos`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    datosEquipos = await r.json();
    renderTabla(datosEquipos);
  } catch {
    document.getElementById('tbody-equipos').innerHTML =
      '<tr><td colspan="7" class="vacio">Error al cargar datos.</td></tr>';
  }
}

function renderTabla(datos) {
  const tbody = document.getElementById('tbody-equipos');
  if (!datos.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="vacio">No hay equipos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = datos.map(eq => `
    <tr>
      <td><strong>${eq.codigo_inventario}</strong></td>
      <td>${eq.tipo_equipo}</td>
      <td>${eq.marca} ${eq.modelo}</td>
      <td>${eq.nombre_responsable || eq.cedula_responsable}</td>
      <td>${eq.fecha_baja}</td>
      <td><span class="badge ${eq.estado_proceso}">${eq.estado_proceso.replace('_',' ')}</span></td>
      <td style="display:flex;gap:6px;">
      <button class="btn-ver" onclick="verDetalle('${eq.codigo_inventario}')">Ver</button>
      <button class="btn-ver" style="border-color:var(--rojo);color:var(--rojo);" onclick="abrirModalEstado('${eq.codigo_inventario}')">Estado</button>
    </td>
    </tr>
  `).join('');
}

function filtrarTabla(q) {
  const f = q.toLowerCase();
  renderTabla(datosEquipos.filter(e =>
    e.codigo_inventario.toLowerCase().includes(f) ||
    e.marca.toLowerCase().includes(f) ||
    e.modelo.toLowerCase().includes(f) ||
    (e.nombre_responsable || '').toLowerCase().includes(f)
  ));
}

async function verDetalle(codigo) {
  try {
    const r  = await fetch(`${API}/equipos/${codigo}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const eq = await r.json();
    document.getElementById('modal-titulo').textContent = `Detalle — ${eq.codigo_inventario}`;
    document.getElementById('modal-body').innerHTML = `
      <div class="det-fila"><span class="det-label">Código Inventario</span><span class="det-valor"><strong>${eq.codigo_inventario}</strong></span></div>
      <div class="det-fila"><span class="det-label">Tipo de Equipo</span><span class="det-valor">${eq.tipo_equipo}</span></div>
      <div class="det-fila"><span class="det-label">Marca / Modelo</span><span class="det-valor">${eq.marca} — ${eq.modelo}</span></div>
      <div class="det-fila"><span class="det-label">Número de Serie</span><span class="det-valor">${eq.serie}</span></div>
      <hr class="separador"/>
      <div class="det-fila"><span class="det-label">Responsable</span><span class="det-valor">${eq.nombre_responsable || eq.cedula_responsable}</span></div>
      <div class="det-fila"><span class="det-label">Fecha de Baja</span><span class="det-valor">${eq.fecha_baja}</span></div>
      <div class="det-fila"><span class="det-label">Estado</span><span class="det-valor"><span class="badge ${eq.estado_proceso}">${eq.estado_proceso.replace('_',' ')}</span></span></div>
      <hr class="separador"/>
      <div class="det-fila"><span class="det-label">Descripción del Daño</span><span class="det-valor">${eq.descripcion_dano}</span></div>
      <div class="det-fila"><span class="det-label">Diagnóstico Técnico</span><span class="det-valor">${eq.diagnostico_tecnico}</span></div>
      ${eq.observaciones ? `<div class="det-fila"><span class="det-label">Observaciones</span><span class="det-valor">${eq.observaciones}</span></div>` : ''}
      <hr class="separador"/>
      <div class="det-fila"><span class="det-label">Registrado el</span><span class="det-valor">${new Date(eq.registrado_en).toLocaleString('es-EC')}</span></div>
    `;
    document.getElementById('modal-overlay').classList.add('visible');
  } catch {
    alert('No se pudo cargar el detalle.');
  }
}

function cerrarModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) cerrarModal();
  });
  document.getElementById('f-fecha').valueAsDate = new Date();
  mostrar('caratula');
});

let codigoActual = null;

function abrirModalEstado(codigo) {
  codigoActual = codigo;
  document.getElementById('modal-estado-codigo').textContent = codigo;
  document.getElementById('motivo-estado').value = '';
  document.getElementById('msg-estado-ok').style.display  = 'none';
  document.getElementById('msg-estado-err').style.display = 'none';
  document.getElementById('modal-estado').classList.add('visible');
}

function cerrarModalEstado() {
  document.getElementById('modal-estado').classList.remove('visible');
  codigoActual = null;
}

async function cambiarEstado(estado) {
  const motivo  = document.getElementById('motivo-estado').value.trim();
  const msgOK   = document.getElementById('msg-estado-ok');
  const msgErr  = document.getElementById('msg-estado-err');
  msgOK.style.display  = 'none';
  msgErr.style.display = 'none';

  try {
    const r = await fetch(`${API}/equipos/${codigoActual}/estado`, {
      method : 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body   : JSON.stringify({ estado_nuevo: estado, motivo })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    msgOK.textContent   = '✅ Estado actualizado correctamente.';
    msgOK.style.display = 'block';
    cargarEquipos();
    setTimeout(() => cerrarModalEstado(), 1500);
  } catch (e) {
    msgErr.textContent   = e.message;
    msgErr.style.display = 'block';
  }
}

async function cargarUsuarios() {
  try {
    const r    = await fetch(`${API}/usuarios`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await r.json();
    const lista = document.getElementById('lista-usuarios');
    if (!data.length) {
      lista.innerHTML = '<p class="vacio">No hay usuarios registrados.</p>';
      return;
    }
    lista.innerHTML = data.map(u => `
      <div class="usuario-item">
        <div>
          <div class="usuario-info-nombre">${u.nombre}</div>
          <div class="usuario-info-sub">${u.cargo} — Cédula: ${u.cedula}</div>
        </div>
        <span class="badge-rol ${u.rol}">${u.rol}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('lista-usuarios').innerHTML =
      '<p class="vacio">Error al cargar usuarios.</p>';
  }
}

async function crearUsuario() {
  const cedula     = document.getElementById('u-cedula').value.trim();
  const nombre     = document.getElementById('u-nombre').value.trim();
  const cargo      = document.getElementById('u-cargo').value.trim();
  const contrasena = document.getElementById('u-contrasena').value;
  const rol        = document.getElementById('u-rol').value;
  const msgOK      = document.getElementById('msg-usuario-ok');
  const msgErr     = document.getElementById('msg-usuario-err');
  msgOK.style.display  = 'none';
  msgErr.style.display = 'none';

  if (!cedula || !nombre || !cargo || !contrasena) {
    msgErr.textContent   = 'Complete todos los campos obligatorios.';
    msgErr.style.display = 'block';
    return;
  }

  try {
    const r = await fetch(`${API}/usuarios`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body   : JSON.stringify({ cedula, nombre, cargo, contrasena, rol })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    msgOK.textContent   = '✅ Usuario creado correctamente.';
    msgOK.style.display = 'block';
    ['u-cedula','u-nombre','u-cargo','u-contrasena'].forEach(id => {
      document.getElementById(id).value = '';
    });
    cargarUsuarios();
  } catch (e) {
    msgErr.textContent   = e.message;
    msgErr.style.display = 'block';
  }
}

async function buscarReporte() {
  const fechaInicio = document.getElementById('r-fecha-inicio').value;
  const fechaFin    = document.getElementById('r-fecha-fin').value;
  const mes         = document.getElementById('r-mes').value;
  const anio        = document.getElementById('r-anio').value;
  const tipoEquipo  = document.getElementById('r-tipo').value;
  const estado      = document.getElementById('r-estado').value;

  const params = new URLSearchParams();
  params.append('token', token);
  if (fechaInicio) params.append('fecha_inicio', fechaInicio);
  if (fechaFin)    params.append('fecha_fin',    fechaFin);
  if (mes)         params.append('mes',          mes);
  if (anio)        params.append('anio',         anio);
  if (tipoEquipo)  params.append('tipo_equipo',  tipoEquipo);
  if (estado)      params.append('estado_proceso', estado);

  try {
    const r    = await fetch(`${API}/equipos/reporte/datos?${params.toString()}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const datos = await r.json();
    renderTablaReporte(datos);
    document.getElementById('reporte-acciones').style.display = datos.length ? 'flex' : 'none';
    document.getElementById('reporte-total').textContent = `Total encontrados: ${datos.length} equipo(s)`;
  } catch {
    alert('Error al buscar equipos');
  }
}

function renderTablaReporte(datos) {
  const tbody = document.getElementById('tbody-reporte');
  if (!datos.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="vacio">No se encontraron equipos con esos filtros.</td></tr>';
    return;
  }
  tbody.innerHTML = datos.map(eq => `
    <tr>
      <td><strong>${eq.codigo_inventario}</strong></td>
      <td>${eq.tipo_equipo}</td>
      <td>${eq.marca} ${eq.modelo}</td>
      <td>${eq.serie}</td>
      <td>${eq.nombre_responsable || eq.cedula_responsable}</td>
      <td>${eq.fecha_baja ? String(eq.fecha_baja).substring(0,10) : ''}</td>
      <td><span class="badge ${eq.estado_proceso}">${eq.estado_proceso.replace('_',' ')}</span></td>
    </tr>
  `).join('');
}

function descargarReporte(tipo) {
  const fechaInicio = document.getElementById('r-fecha-inicio').value;
  const fechaFin    = document.getElementById('r-fecha-fin').value;
  const mes         = document.getElementById('r-mes').value;
  const anio        = document.getElementById('r-anio').value;
  const tipoEquipo  = document.getElementById('r-tipo').value;
  const estado      = document.getElementById('r-estado').value;

  const params = new URLSearchParams();
  if (fechaInicio) params.append('fecha_inicio', fechaInicio);
  if (fechaFin)    params.append('fecha_fin',    fechaFin);
  if (mes)         params.append('mes',          mes);
  if (anio)        params.append('anio',         anio);
  if (tipoEquipo)  params.append('tipo_equipo',  tipoEquipo);
  if (estado)      params.append('estado_proceso', estado);

  fetch(`${API}/reportes/${tipo}?${params.toString()}`, {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(r => r.blob())
  .then(blob => {
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = tipo === 'excel' ? 'reporte_bajas.xlsx' : 'reporte_bajas.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  })
  .catch(() => alert('Error al generar el reporte'));
}