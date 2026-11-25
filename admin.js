/* ==========================================================================
   admin.js · Huellitas Felices
   Panel del administrador:
     - Inicio de sesión (Supabase Auth) y verificación de que sea administrador.
     - Agenda: todas las visitas; marcar realizada / cancelada / adopción concretada.
     - Perritos: lista, registro con foto e historial de cada uno.
     - Adoptantes: registro de personas con su historial de visitas y adopciones.
   La seguridad real está en la base de datos (RLS + funciones en schema.sql):
   aunque alguien abra este archivo, sin ser administrador no recibe datos.
   ========================================================================== */
'use strict';

document.addEventListener('DOMContentLoaded', function () {
  const H = window.Huellitas;
  const $ = function (id) { return document.getElementById(id); };
  const el = H && H.el;

  const ESTADO_VISITA = { programada: 'Programada', realizada: 'Realizada', cancelada: 'Cancelada', adopcion_concretada: 'Adopción concretada' };
  const ESTADO_ADOPCION = { solicitada: 'Solicitada', completada: 'Completada', cancelada: 'Cancelada' };
  const ROL = { interesado: 'Interesado', adoptante: 'Adoptante', admin: 'Administrador' };

  let pestana = 'visitas';
  let detalleActual = null;

  function aviso(texto, tipo) {
    const p = $('aviso-admin');
    p.textContent = texto || '';
    p.className = tipo === 'ok' ? 'exito' : 'alerta';
    p.hidden = !texto;
    if (texto) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function chip(texto, clase) { return el('span', { class: 'chip chip-' + clase, text: texto }); }
  function enlace(texto, onclick) { return el('button', { type: 'button', class: 'enlace', text: texto, onclick: onclick }); }
  function boton(texto, onclick, extra) { return el('button', { type: 'button', class: 'boton-mini ' + (extra || ''), text: texto, onclick: onclick }); }

  /** Tabla con scroll horizontal en telefono*/
  function tabla(columnas, filas, vacio) {
    if (filas.length === 0) return el('p', { class: 'vacio', text: vacio || 'Sin registros.' });
    return el('section', { class: 'tabla-scroll' },
      el('table', {},
        el('thead', {}, el('tr', {}, columnas.map(function (c) { return el('th', { scope: 'col', text: c }); }))),
        el('tbody', {}, filas.map(function (fila) {
          return el('tr', {}, fila.map(function (celda) { return el('td', {}, celda); }));
        }))
      )
    );
  }

  function dia(fecha, sumar) { // 'AAAA-MM-DD' + n dias
    const d = new Date(fecha + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + sumar);
    return d.toISOString().slice(0, 10);
  }

  function errorDe(error) { return error && error.message ? error.message : 'Ocurrio un error inesperado.'; }

  /*sesion*/
  async function entrarSiEsAdmin() {
    const { data: sesion } = await H.db.auth.getSession();
    if (!sesion.session) { $('panel-login').hidden = false; $('panel-admin').hidden = true; return false; }

    const { data: esAdmin, error } = await H.db.rpc('es_admin');
    if (error || !esAdmin) {
      await H.db.auth.signOut();
      $('panel-login').hidden = false; $('panel-admin').hidden = true;
      aviso('Esta cuenta no tiene permisos de administrador.');
      return false;
    }
    $('admin-usuario').textContent = 'Sesion iniciada como ' + sesion.session.user.email;
    $('panel-login').hidden = true;
    $('panel-admin').hidden = false;
    aviso('');
    cambiarPestana(pestana);
    return true;
  }

  function iniciarSesion() {
    $('form-login').addEventListener('submit', async function (e) {
      e.preventDefault();
      const f = e.target;
      const boton = f.querySelector('button');
      boton.disabled = true;
      const { error } = await H.db.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      boton.disabled = false;
      if (error) { aviso('Correo o contraseña incorrectos.'); return; }
      f.reset();
      entrarSiEsAdmin();
    });
    $('btn-salir').addEventListener('click', async function () {
      await H.db.auth.signOut();
      $('panel-admin').hidden = true; $('panel-login').hidden = false;
      aviso('Sesión cerrada.', 'ok');
    });
  }

  /*pestañas */
  function cambiarPestana(nombre) {
    pestana = nombre;
    document.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.tab === nombre)); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = p.id !== 'tab-' + nombre; });
    cerrarDetalle();
    if (nombre === 'visitas') cargarVisitas();
    if (nombre === 'perritos') cargarPerritos();
    if (nombre === 'adoptantes') cargarPersonas();
  }

  function refrescar() {
    if (pestana === 'visitas') cargarVisitas();
    if (pestana === 'perritos') cargarPerritos();
    if (pestana === 'adoptantes') cargarPersonas();
    if (detalleActual) abrirDetalle(detalleActual.tipo, detalleActual.id);
  }

  /*acciones */
  async function resolverVisita(id, accion, textoConfirmacion) {
    if (!confirm(textoConfirmacion)) return;
    const { error } = await H.db.rpc('admin_resolver_visita', { p_visita: id, p_accion: accion });
    if (error) { aviso(errorDe(error)); return; }
    aviso('Visita actualizada.', 'ok');
    refrescar();
  }

  async function resolverAdopcion(id, accion, textoConfirmacion) {
    if (!confirm(textoConfirmacion)) return;
    const { error } = await H.db.rpc('admin_resolver_adopcion', { p_adopcion: id, p_accion: accion });
    if (error) { aviso(errorDe(error)); return; }
    aviso('Adopcion actualizada.', 'ok');
    refrescar();
  }

  function botonesVisita(v) {
    if (v.estado !== 'programada') return '—';
    const nombre = v.perritos ? v.perritos.nombre : 'el perrito';
    return el('section', { class: 'acciones' },
      boton('Realizada', function () { resolverVisita(v.id, 'realizada', '¿Marcar la visita a ' + nombre + ' como REALIZADA?'); }),
      boton('Cancelar', function () { resolverVisita(v.id, 'cancelada', '¿CANCELAR esta visita? El horario quedara libre.'); }, 'peligro'),
      boton('Adopción concretada', function () {
        resolverVisita(v.id, 'adopcion_concretada', '¿Confirmas que ' + nombre + ' fue ADOPTADO? Se cancelaran las demas visitas y solicitudes de este perrito.');
      }, 'ok')
    );
  }

  /*agenda */
  async function cargarVisitas() {
    const filtros = $('filtros-visitas');
    const estado = filtros.estado.value;
    const fecha = filtros.fecha.value;
    const cont = $('lista-visitas');
    cont.replaceChildren(el('p', { class: 'vacio', text: 'Cargando…' }));

    let q = H.db.from('visitas')
      .select('id, fecha_hora, motivo, mensaje, estado, perro_id, usuario_id, perritos(nombre), usuarios(nombre, email, telefono)')
      .order('fecha_hora', { ascending: estado === 'programada' });
    if (estado !== 'todas') q = q.eq('estado', estado);
    if (fecha) q = q.gte('fecha_hora', fecha + 'T00:00:00-06:00').lt('fecha_hora', dia(fecha, 1) + 'T00:00:00-06:00');

    const { data, error } = await q;
    if (error) { cont.replaceChildren(); aviso(errorDe(error)); return; }

    cont.replaceChildren(tabla(
      ['Fecha y hora', 'Perrito', 'Interesado', 'Contacto', 'Motivo', 'Mensaje', 'Estado', 'Acciones'],
      data.map(function (v) {
        return [
          H.formatoFechaHora(v.fecha_hora),
          enlace(v.perritos.nombre, function () { abrirDetalle('perro', v.perro_id); }),
          enlace(v.usuarios.nombre, function () { abrirDetalle('persona', v.usuario_id); }),
          el('span', {}, v.usuarios.telefono, el('br'), v.usuarios.email),
          v.motivo === 'adopcion' ? 'Quiere adoptar' : 'Visita',
          v.mensaje || '—',
          chip(ESTADO_VISITA[v.estado], v.estado),
          botonesVisita(v)
        ];
      }),
      'No se encontraron visitas'
    ));
  }

  /* perritos */
  async function cargarPerritos() {
    const cont = $('lista-perritos');
    cont.replaceChildren(el('p', { class: 'vacio', text: 'Cargando…' }));
    const { data, error } = await H.db.from('perritos').select('*, visitas(count), adopciones(count)').order('created_at').order('nombre');
    if (error) { cont.replaceChildren(); aviso(errorDe(error)); return; }

    cont.replaceChildren(tabla(
      ['Foto', 'Nombre', 'Raza', 'Edad', 'Tamaño', 'Salud', 'Estatus', 'Visitas', 'Historial'],
      data.map(function (p) {
        const est = H.ESTATUS[p.estatus];
        return [
          el('img', { class: 'miniatura', src: p.foto_url || 'img/huella.svg', alt: 'Foto de ' + p.nombre }),
          p.nombre, p.raza, H.formatoEdad(p.edad_anios), p.tamano, p.salud,
          el('span', { class: 'estatus ' + est.clase, text: est.texto }),
          String(p.visitas[0].count),
          enlace('Ver historial', function () { abrirDetalle('perro', p.id); })
        ];
      }),
      'Aun no hay perritos registrados.'
    ));
  }

  function iniciarRegistroPerrito() {
    $('form-perrito').addEventListener('submit', async function (e) {
      e.preventDefault();
      const f = e.target;
      const boton = f.querySelector('button[type="submit"]');
      const nombre = f.nombre.value.trim();
      const edad = Number(f.edad_anios.value);
      if (!nombre || !f.raza.value.trim() || !f.salud.value.trim() || f.edad_anios.value === '' || edad < 0 || edad > 30) {
        aviso('Completa nombre, raza, edad (0 a 30) y estado de salud.'); return;
      }

      boton.disabled = true;
      let foto_url = null;
      const archivo = f.foto.files[0];
      if (archivo) {
        if (!/^image\/(jpeg|png|webp)$/.test(archivo.type) || archivo.size > 3 * 1024 * 1024) {
          aviso('La foto debe ser JPG, PNG o WEBP de maximo 3 MB.'); boton.disabled = false; return;
        }
        const ext = archivo.type.split('/')[1].replace('jpeg', 'jpg');
        const ruta = crypto.randomUUID() + '.' + ext;
        const { error: errSubida } = await H.db.storage.from('perritos').upload(ruta, archivo, { contentType: archivo.type });
        if (errSubida) { aviso('No se pudo subir la foto: ' + errorDe(errSubida)); boton.disabled = false; return; }
        foto_url = H.db.storage.from('perritos').getPublicUrl(ruta).data.publicUrl;
      }

      const { error } = await H.db.from('perritos').insert({
        nombre: nombre, raza: f.raza.value.trim(), edad_anios: edad,
        tamano: f.tamano.value, salud: f.salud.value.trim(), foto_url: foto_url
      });
      boton.disabled = false;
      if (error) { aviso(errorDe(error)); return; }
      f.reset();
      f.closest('details').open = false;
      aviso('Perrito registrado como Disponible.', 'ok');
      cargarPerritos();
    });
  }

  /*adoptantes */
  async function cargarPersonas() {
    const filtros = $('filtros-personas');
    const cont = $('lista-personas');
    cont.replaceChildren(el('p', { class: 'vacio', text: 'Cargando…' }));

    let q = H.db.from('usuarios').select('*, visitas(count), adopciones(count)').neq('rol', 'admin').order('created_at', { ascending: false });
    if (filtros.rol.value !== 'todos') q = q.eq('rol', filtros.rol.value);
    const { data, error } = await q;
    if (error) { cont.replaceChildren(); aviso(errorDe(error)); return; }

    const texto = filtros.texto.value.trim().toLowerCase();
    const lista = data.filter(function (u) {
      return !texto || u.nombre.toLowerCase().includes(texto) || u.email.toLowerCase().includes(texto);
    });

    cont.replaceChildren(tabla(
      ['Nombre', 'Correo', 'Teléfono', 'Tipo', 'Visitas', 'Adopciones', 'Historial'],
      lista.map(function (u) {
        return [
          u.nombre, u.email, u.telefono, chip(ROL[u.rol], u.rol),
          String(u.visitas[0].count), String(u.adopciones[0].count),
          enlace('Ver historial', function () { abrirDetalle('persona', u.id); })
        ];
      }),
      'No se encontraron personas'
    ));
  }

  /* historial */
  function cerrarDetalle() { detalleActual = null; $('detalle').hidden = true; $('detalle').replaceChildren(); }

  async function abrirDetalle(tipo, id) {
    detalleActual = { tipo: tipo, id: id };
    const cont = $('detalle');
    cont.hidden = false;
    cont.replaceChildren(el('p', { class: 'vacio', text: 'Cargando historial…' }));

    const esPerro = tipo === 'perro';
    const columna = esPerro ? 'perro_id' : 'usuario_id';
    const [entidad, visitas, adopciones] = await Promise.all([
      esPerro ? H.db.from('perritos').select('*').eq('id', id).single() : H.db.from('usuarios').select('*').eq('id', id).single(),
      H.db.from('visitas').select('id, fecha_hora, motivo, estado, perritos(nombre), usuarios(nombre)').eq(columna, id).order('fecha_hora', { ascending: false }),
      H.db.from('adopciones').select('id, estado, fecha_solicitud, fecha_adopcion, perritos(nombre), usuarios(nombre)').eq(columna, id).order('fecha_solicitud', { ascending: false })
    ]);
    const fallo = entidad.error || visitas.error || adopciones.error;
    if (fallo) { cont.replaceChildren(); aviso(errorDe(fallo)); return; }

    const e = entidad.data;
    const titulo = esPerro
      ? el('h3', {}, 'Historial de ' + e.nombre + ' ', el('span', { class: 'estatus ' + H.ESTATUS[e.estatus].clase, text: '(' + H.ESTATUS[e.estatus].texto + ')' }))
      : el('h3', {}, 'Historial de ' + e.nombre + ' ', chip(ROL[e.rol], e.rol));
    const ficha = esPerro
      ? e.raza + ' · ' + H.formatoEdad(e.edad_anios) + ' · ' + e.tamano + ' · Salud: ' + e.salud
      : e.email + ' · Tel. ' + e.telefono + ' · Registrado el ' + H.formatoFechaHora(e.created_at);

    const otro = esPerro ? 'usuarios' : 'perritos';
    const colOtro = esPerro ? 'Interesado' : 'Perrito';

    const tablaVisitas = tabla(
      ['Fecha y hora', colOtro, 'Motivo', 'Estado', 'Acciones'],
      visitas.data.map(function (v) {
        return [H.formatoFechaHora(v.fecha_hora), v[otro].nombre, v.motivo === 'adopcion' ? 'Quiere adoptar' : 'Visita',
                chip(ESTADO_VISITA[v.estado], v.estado), botonesVisita(Object.assign({ perritos: v.perritos }, v))];
      }), 'Sin visitas registradas.');

    const tablaAdopciones = tabla(
      ['Solicitud', colOtro, 'Estado', 'Fecha de adopcion', 'Acciones'],
      adopciones.data.map(function (a) {
        const acciones = a.estado !== 'solicitada' ? '—' : el('section', { class: 'acciones' },
          boton('Completar adopcion', function () { resolverAdopcion(a.id, 'completada', '¿Confirmas que la adopcion se concreto?'); }, 'ok'),
          boton('Cancelar', function () { resolverAdopcion(a.id, 'cancelada', '¿Cancelar esta solicitud de adopcion?'); }, 'peligro'));
        return [H.formatoFechaHora(a.fecha_solicitud), a[otro].nombre, chip(ESTADO_ADOPCION[a.estado], a.estado),
                a.fecha_adopcion ? H.formatoFechaHora(a.fecha_adopcion) : '—', acciones];
      }), 'Sin adopciones registradas.');

    cont.replaceChildren(
      titulo, el('p', { text: ficha }),
      el('h4', { text: 'Visitas (' + visitas.data.length + ')' }), tablaVisitas,
      el('h4', { text: 'Adopciones (' + adopciones.data.length + ')' }), tablaAdopciones,
      el('button', { type: 'button', class: 'boton boton-claro', text: 'Cerrar historial', onclick: cerrarDetalle })
    );
    cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /*arranque */
  if (!H || !H.configurado) {
    $('panel-login').hidden = true;
    aviso('El panel necesita conectarse a Supabase');
    return;
  }

  iniciarSesion();
  iniciarRegistroPerrito();
  document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { cambiarPestana(t.dataset.tab); }); });
  $('filtros-visitas').addEventListener('change', cargarVisitas);
  $('filtros-visitas').addEventListener('reset', function () { setTimeout(cargarVisitas, 0); });
  $('filtros-personas').addEventListener('change', cargarPersonas);
  $('filtros-personas').addEventListener('input', cargarPersonas);
  entrarSiEsAdmin();
});
