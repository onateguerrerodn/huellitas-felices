'use strict'; // evita errores (variables sin declarar, etc.)

/* agregamos js a <html>. el css solo oculta el menu cuando existe esta clase asi, si el javascript fallara el menu seguiria visible y la pagina seguiria siendo usable. */
document.documentElement.classList.add('js');

/* menu hamburguesa*/
function iniciarMenu() {
  const boton = document.getElementById('btn-menu');
  const menu = document.getElementById('menu-principal');

  // Si la pagina no tiene menu, salimos sin hacer nada
  if (!boton || !menu) return;

  /**
   * Abre o cierra el menu.
   * @param {boolean} abrir - true para abrir, false para cerrar.
   */
  function establecerMenu(abrir) {
    // La clase "abierto" es la que el CSS usa para mostrar el menu
    menu.classList.toggle('abierto', abrir);
    // informa si el menu esta desplegado
    boton.setAttribute('aria-expanded', String(abrir));
    // El texto del boton cambia segun el estado
    boton.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
  }

  // invierte el estado actual del menu
  boton.addEventListener('click', function () {
    const estaAbierto = boton.getAttribute('aria-expanded') === 'true';
    establecerMenu(!estaAbierto);
  });

  // Al elegir una opcion del menu, lo cerramos
  menu.querySelectorAll('a').forEach(function (enlace) {
    enlace.addEventListener('click', function () {
      establecerMenu(false);
    });
  });

  //con la tecla Escape se cierra el menu
  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape' && menu.classList.contains('abierto')) {
      establecerMenu(false);
      boton.focus();
    }
  });
  window.matchMedia('(min-width: 768px)').addEventListener('change', function (mq) {
    if (mq.matches) establecerMenu(false);
  });
}

/* validacion del formulario*/
// Email
const REGEX_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// Telefono 10 digitos
const REGEX_TELEFONO = /^[0-9]{10}$/;

// Nombre solo letras con acentos y ñ, espacios, apostrofo, punto y guion
const REGEX_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/;

/* validadores */
const validadores = {

  // Nombre completo
  nombre: function (campo) {
    const valor = campo.value.trim(); // trim() quita espacios al inicio y al final
    if (valor === '') return 'Escribe tu nombre completo.';
    if (valor.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
    if (!REGEX_NOMBRE.test(valor)) return 'El nombre solo puede contener letras y espacios.';
    if (valor.split(/\s+/).length < 2) return 'Escribe tu nombre y apellido.';
    return '';
  },

  // Correo electronico
  email: function (campo) {
    const valor = campo.value.trim();
    if (valor === '') return 'Escribe tu correo electrónico.';
    if (!REGEX_EMAIL.test(valor)) return 'Escribe un correo válido, por ejemplo: correo@ejemplo.com';
    return '';
  },

  // Telefono
  telefono: function (campo) {
    const valor = campo.value.trim();
    if (valor === '') return 'Escribe tu número de telefono.';
    if (!REGEX_TELEFONO.test(valor)) return 'El telefono debe tener 10 digitos, sin espacios ni guiones.';
    return '';
  },

  // Perrito
  perrito: function (campo) {
    if (campo.value === '') return 'Elige el perrito que quieres conocer.';
    return '';
  },

  // Horario
  hora: function (campo) {
    if (campo.value === '') return 'Elige un horario disponible.';
    return '';
  },

  // Motivo
  motivo: function (campo) {
    if (campo.value === '') return 'Selecciona un motivo de tu visita.';
    return '';
  },

  // Fecha preferida
  fecha: function (campo) {
    if (campo.value === '') return 'Elige una fecha para tu visita.';
    if (campo.min && campo.value < campo.min) return 'La fecha no puede ser anterior a hoy.';
    // Los domingos el refugio esta cerrado (getDay() === 0)
    if (new Date(campo.value + 'T12:00:00').getDay() === 0) return 'No abrimos los domingos. Elige otro dia.';
    return '';
  },

  // Mensaje
  mensaje: function (campo) {
    const valor = campo.value.trim();
    if (valor === '') return 'Escribe un mensaje.';
    if (valor.length < 10) return 'El mensaje debe tener al menos 10 caracteres (llevas ' + valor.length + ').';
    return '';
  },

  //aceptacion
  acepto: function (campo) {
    if (!campo.checked) return 'Debes aceptar que te contactemos para continuar.';
    return '';
  }
};

/**Obtiene la fecha de hoy en formato AAAA-MM-DD usando la hora LOCAL
 * (toISOString usaria UTC y podria dar el dia siguiente por la noche).
 * @returns {string} fecha como "2026-11-23"
 */
function fechaDeHoy() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return hoy.getFullYear() + '-' + mes + '-' + dia;
}

/**muestra u oculta el mensaje de error de un campo y cambia su estilo visual.
 * @param {HTMLElement} campo   - input / select / textarea.
 * @param {string}      mensaje - texto de error ('' = el campo es valido).
 */
function mostrarEstado(campo, mensaje) {
  const contenedorError = document.getElementById('error-' + campo.name);
  const esValido = mensaje === '';

  // evita inyectar codigo HTML por accidente
  if (contenedorError) contenedorError.textContent = mensaje;

  // Clases css .invalido o .valido
  campo.classList.toggle('invalido', !esValido);
  campo.classList.toggle('valido', esValido);

  //avisa que el campo tiene un error
  campo.setAttribute('aria-invalid', String(!esValido));
}

/**
 * Valida un solo campo y actualiza su estado visual.
 * @param {HTMLElement} campo
 * @returns {boolean} true si el campo es valido.
 */
function validarCampo(campo) {
  const validador = validadores[campo.name];
  if (!validador) return true; 
  const mensaje = validador(campo);
  mostrarEstado(campo, mensaje);
  return mensaje === '';
}

/**
 * quita todos los estilos y mensajes de validacion
 * @param {HTMLFormElement} formulario
 */
function limpiarEstados(formulario) {
  Object.keys(validadores).forEach(function (nombre) {
    const campo = formulario.elements[nombre];
    const contenedorError = document.getElementById('error-' + nombre);
    if (contenedorError) contenedorError.textContent = '';
    campo.classList.remove('invalido', 'valido');
    campo.removeAttribute('aria-invalid');
  });
}

function iniciarFormulario() {
  const formulario = document.getElementById('form-contacto');

  if (!formulario) return;

  const alerta = document.getElementById('alerta-form');   // resumen de errores
  const exito = document.getElementById('mensaje-exito');  // mensaje de exito

  formulario.noValidate = true;

  // la fecha minima es hoy (el calendario bloquea dias pasados)
  formulario.elements.fecha.min = fechaDeHoy();

  /* validacin en vivo*/
  formulario.addEventListener('focusout', function (evento) {
    if (validadores[evento.target.name]) validarCampo(evento.target);
  });
  formulario.addEventListener('input', function (evento) {
    const campo = evento.target;

    // Telefono eliminamos todo lo que no sea numero (asi "477 123-4567" se convierte en "4771234567")
    if (campo.name === 'telefono') {
      campo.value = campo.value.replace(/\D/g, '');
    }

    if (campo.classList.contains('invalido')) validarCampo(campo);
  });

  formulario.addEventListener('change', function (evento) {
    const campo = evento.target;
    if (campo.classList.contains('invalido')) validarCampo(campo);
  });

  /* validacion al enviar */
  formulario.addEventListener('submit', async function (evento) {
    evento.preventDefault();
    exito.hidden = true; // ocultamos un mensaje de éxito anterior
    // Validamos todos los campos y guardamos los que fallaron
    const camposInvalidos = [];
    Object.keys(validadores).forEach(function (nombre) {
      const campo = formulario.elements[nombre];
      if (!validarCampo(campo)) camposInvalidos.push(campo);
    });

    // si hay errores mostramos alerta, damos foco al primer error y paramos
    if (camposInvalidos.length > 0) {
      alerta.textContent = camposInvalidos.length === 1
        ? 'Hay 1 campo que debes corregir antes de enviar.'
        : 'Hay ' + camposInvalidos.length + ' campos que debes corregir antes de enviar.';
      alerta.hidden = false;
      camposInvalidos[0].focus();
      return;
    }

    //si todo es valido
    alerta.hidden = true;
    const datos = Object.fromEntries(new FormData(formulario).entries());
    let resultado = null;
    const enviar = window.Huellitas && window.Huellitas.enviarSolicitud;
    const botonEnviar = formulario.querySelector('button[type="submit"]');
    if (enviar) {
      botonEnviar.disabled = true;
      botonEnviar.textContent = 'Agendando…';
      try { resultado = await enviar(datos); }
      catch (e) { resultado = { ok: false, mensaje: 'No pudimos agendar tu visita. Revisa tu conexion e intenta de nuevo.' }; }
      botonEnviar.disabled = false;
      botonEnviar.textContent = 'Agendar visita';

      // Fallo en el servidor (por ejemplo, el horario se ocupo)
      if (!resultado.ok) {
        alerta.textContent = resultado.mensaje;
        alerta.hidden = false;
        alerta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    } else {
      console.log('Solicitud valida lista para enviar:', datos);
    }

    // Mensaje de confirmacion
    const primerNombre = datos.nombre.trim().split(/\s+/)[0];
    exito.textContent = resultado ? resultado.mensaje :
      'Gracias, ' + primerNombre + ' recibimos tu solicitud, te contactaremos pronto para confirmar tu visita.';
    exito.hidden = false;

    // Limpiamos el formulario y subimos para que se vea el mensaje de exito
    formulario.reset();
    limpiarEstados(formulario);
    exito.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/* esperamos a que el HTML este completamente cargado y activamos todo*/
document.addEventListener('DOMContentLoaded', function () {
  iniciarMenu();
  iniciarFormulario();
  console.log('main.js cargado correctamente');
});
