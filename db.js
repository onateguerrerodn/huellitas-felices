'use strict';

(function () {
  const cfg = window.HUELLITAS_CONFIG || {};
  const configurado = Boolean(cfg.SUPABASE_URL) && !cfg.SUPABASE_URL.startsWith('TU_') &&
                      Boolean(cfg.SUPABASE_ANON_KEY) && !cfg.SUPABASE_ANON_KEY.startsWith('TU_') &&
                      Boolean(window.supabase);

  const H = window.Huellitas = window.Huellitas || {};
  H.configurado = configurado;
  H.db = configurado ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  H.ZONA = 'America/Mexico_City';

  H.formatoEdad = function (n) {
    n = Number(n);
    if (n < 1) { const m = Math.max(1, Math.round(n * 12)); return m + (m === 1 ? ' mes' : ' meses'); }
    return n + (n === 1 ? ' año' : ' años');
  };

  /** fecha y hora */
  H.formatoFechaHora = function (iso) {
    return new Date(iso).toLocaleString('es-MX', { timeZone: H.ZONA, dateStyle: 'medium', timeStyle: 'short' });
  };

  H.ESTATUS = {
    disponible: { texto: 'Disponible', clase: 'disponible' },
    en_proceso: { texto: 'En proceso', clase: 'proceso' },
    adoptado:   { texto: 'Adoptado',   clase: 'adoptado' }
  };

  H.el = function (tag, props, ...hijos) {
    const nodo = document.createElement(tag);
    Object.entries(props || {}).forEach(function ([k, v]) {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') nodo.className = v;
      else if (k === 'text') nodo.textContent = v;
      else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
      else nodo.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach(function (h) {
      if (h === null || h === undefined || h === false) return;
      nodo.append(h.nodeType ? h : document.createTextNode(h));
    });
    return nodo;
  };
})();
