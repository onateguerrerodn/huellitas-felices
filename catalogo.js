/* dibuja el catalogo de perritos leyendo la tabla perritos de aupabase, si aupabase no esta configurado o falla, se conservan las tarjetas que ya trae perritos.html*/
'use strict';

document.addEventListener('DOMContentLoaded', async function () {
  const H = window.Huellitas;
  const contenedor = document.getElementById('catalogo');
  if (!contenedor || !H || !H.configurado) return;

  const { data, error } = await H.db.from('perritos').select('*').order('created_at').order('nombre');
  if (error || !data || data.length === 0) {
    console.warn('Catalogo: se usa el contenido estatico.', error);
    return;
  }

  contenedor.replaceChildren(...data.map(function (p) {
    const estatus = H.ESTATUS[p.estatus] || H.ESTATUS.disponible;
    const foto = H.el('img', { src: p.foto_url || 'img/huella.svg', alt: p.nombre, loading: 'lazy' });
    const accion = p.estatus === 'adoptado'
      ? H.el('p', { class: 'nota-adoptado', text: '¡Ya encontró hogar!' })
      : H.el('a', { class: 'boton', href: 'contacto.html?perro=' + encodeURIComponent(p.id), text: 'Agendar visita' });

    return H.el('article', { class: 'tarjeta' },
      H.el('figure', {}, foto),
      H.el('section', { class: 'cuerpo' },
        H.el('h3', { text: p.nombre }),
        H.el('dl', {},
          H.el('dt', { text: 'Raza:' }),    H.el('dd', { text: p.raza }),
          H.el('dt', { text: 'Edad:' }),    H.el('dd', { text: H.formatoEdad(p.edad_anios) }),
          H.el('dt', { text: 'Tamaño:' }),  H.el('dd', { text: p.tamano }),
          H.el('dt', { text: 'Salud:' }),   H.el('dd', { text: p.salud })
        ),
        H.el('p', { class: 'estatus ' + estatus.clase, text: estatus.texto }),
        accion
      )
    );
  }));
});
