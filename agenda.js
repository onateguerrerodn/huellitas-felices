'use strict';

(function () {
  const H = window.Huellitas;
  const HORAS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
  const OFFSET = '-06:00';

  document.addEventListener('DOMContentLoaded', iniciar);

  function iniciar() {
    const form = document.getElementById('form-contacto');
    const avisoAgenda = document.getElementById('aviso-agenda');
    if (!form || !form.elements.hora) return;

    if (!H || !H.configurado) {
      // Sin Supabase el formulario sigue funcionando como antes (solo validacion)
      form.elements.hora.disabled = true;
      form.elements.hora.replaceChildren(H.el ? H.el('option', { value: '', text: 'Agenda no conectada' }) : '');
      if (avisoAgenda) {
        avisoAgenda.textContent = 'La agenda en linea aun no esta conectada a la base de datos';
        avisoAgenda.hidden = false;
      }
      return;
    }

    let perros = [];
    let ultimaConsulta = 0;

    /*perritos*/
    async function cargarPerros() {
      const { data, error } = await H.db.from('perritos').select('id, nombre, estatus')
        .neq('estatus', 'adoptado').order('nombre');
      const sel = form.elements.perrito;
      if (error) {
        sel.replaceChildren(H.el('option', { value: '', text: 'No se pudo cargar la lista' }));
        return;
      }
      perros = data;
      sel.replaceChildren(
        H.el('option', { value: '', text: 'Selecciona un perrito' }),
        ...perros.map(function (p) { return H.el('option', { value: p.id, text: p.nombre }); })
      );
      const preseleccion = new URLSearchParams(location.search).get('perro');
      if (preseleccion && perros.some(function (p) { return p.id === preseleccion; })) sel.value = preseleccion;
    }

    /* horarios*/
    function aIso(fecha, hora) { return fecha + 'T' + hora + ':00' + OFFSET; }
    function opcion(valor, texto, deshabilitada) {
      return H.el('option', { value: valor, text: texto, disabled: deshabilitada });
    }

    async function cargarHorarios() {
      const sel = form.elements.hora;
      const fecha = form.elements.fecha.value;
      const folio = ++ultimaConsulta;

      sel.disabled = true;
      if (!fecha) { sel.replaceChildren(opcion('', 'Primero elige una fecha')); return; }
      if (new Date(fecha + 'T12:00:00').getDay() === 0) {
        sel.replaceChildren(opcion('', 'No abrimos los domingos')); return;
      }
      sel.replaceChildren(opcion('', 'Consultando horarios…'));

      const { data, error } = await H.db.rpc('horarios_ocupados', { p_fecha: fecha });
      if (folio !== ultimaConsulta) return;
      if (error) { sel.replaceChildren(opcion('', 'No se pudieron consultar los horarios')); return; }

      const ocupados = new Set(data || []);
      const ahora = new Date();
      sel.replaceChildren(
        opcion('', 'Selecciona un horario'),
        ...HORAS.map(function (h) {
          const ocupado = ocupados.has(h);
          const pasado = new Date(aIso(fecha, h)) <= ahora;
          const nota = ocupado ? ' — ocupado' : (pasado ? ' — ya paso' : '');
          return opcion(h, h + ' h' + nota, ocupado || pasado);
        })
      );
      sel.disabled = false;
    }

    form.elements.fecha.addEventListener('change', cargarHorarios);
    form.addEventListener('reset', function () { setTimeout(cargarHorarios, 0); });
    cargarHorarios();
    cargarPerros();

    /* envio*/
    H.enviarSolicitud = async function (datos) {
      const { error } = await H.db.rpc('agendar_visita', {
        p_nombre: datos.nombre.trim(),
        p_email: datos.email.trim(),
        p_telefono: datos.telefono,
        p_perro: datos.perrito,
        p_fecha_hora: aIso(datos.fecha, datos.hora),
        p_motivo: datos.motivo,
        p_mensaje: datos.mensaje
      });

      if (error) {
        cargarHorarios(); // refresca por si el horario se ocupo en este instante
        const esPropio = error.code === 'P0001'; // mensajes escritos en schema.sql
        return { ok: false, mensaje: esPropio ? error.message : 'No pudimos agendar tu visita. Intenta de nuevo en unos minutos.' };
      }
      const perro = perros.find(function (p) { return p.id === datos.perrito; });
      const dia = new Date(datos.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      return {
        ok: true,
        mensaje: '¡Gracias, ' + datos.nombre.trim().split(/\s+/)[0] + 'Tu visita para conocer a ' +
                 (perro ? perro.nombre : 'tu perrito') + ' quedo agendada el ' + dia + ' a las ' + datos.hora +
                 ' h. Te contactaremos para confirmarla.'
      };
    };
  }
})();
