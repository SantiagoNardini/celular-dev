// Corre DENTRO de la página del celular (lo manda revision.mjs) y mide lo que se ve en la pantalla:
// desborde a lo ancho, botones chicos para el dedo, contraste, imágenes sin alt, texto muy chico,
// controles sin nombre, campos sin etiqueta y tiempos de carga. Devuelve solo datos, sin opinar.
(() => {
  const ancho = document.documentElement.clientWidth;
  const visible = e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
  const nombre = e => (e.getAttribute('aria-label') || e.textContent || e.title || e.value || e.getAttribute('alt') ||
    (e.labels && e.labels[0] && e.labels[0].textContent) || '').trim();
  const describir = e => {
    const texto = (e.textContent || e.getAttribute('alt') || e.getAttribute('src') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '') + (texto ? ` «${texto}»` : '');
  };
  const todos = [...document.querySelectorAll('body *')].filter(visible);

  // desborde: elementos que se salen a lo ancho (y hacen que la página se mueva de costado)
  const desborde = document.documentElement.scrollWidth - ancho;
  const salidos = todos.filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.right > ancho + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[style*="overflow"], .scroll, pre');
  });
  // de los que se salen, solo los más externos (si se sale el padre, sus hijos no suman)
  const culpables = salidos.filter(e => !salidos.includes(e.parentElement));

  // botones y enlaces chicos para el dedo (menos de 40 px de alto o de ancho), salvo enlaces dentro de un texto
  const tocables = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [onclick]')].filter(visible);
  const chicos = tocables.filter(e => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.parentElement && e.parentElement.textContent.trim().length > e.textContent.trim().length + 20) return false;
    return r.width < 40 || r.height < 40;
  });

  // contraste del texto contra el primer fondo opaco hacia arriba (mínimo WCAG AA)
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const luz = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fondoDe = e => {
    for (let x = e; x; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (cs.backgroundImage !== 'none') return null;   // sobre una imagen o degradé no se puede medir
      const c = rgb(cs.backgroundColor);
      if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const poco = [];
  const conTexto = todos.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  for (const e of conTexto) {
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fondo = fondoDe(e);
    const color = rgb(cs.color);
    if (!fondo || (color.length === 4 && color[3] < 1)) continue;
    const a = luz(color.slice(0, 3)), b = luz(fondo);
    const relacion = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    if (relacion < (grande ? 3 : 4.5)) poco.push({ e, relacion });
  }

  const sinAlt = [...document.images].filter(i => visible(i) && !i.hasAttribute('alt'));
  const textoChico = conTexto.filter(e => parseFloat(getComputedStyle(e).fontSize) < 12);
  const sinNombre = tocables.filter(e => !nombre(e) && e.type !== 'hidden');
  const sinEtiqueta = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')]
    .filter(e => visible(e) && !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.getAttribute('title'));

  const nav = performance.getEntriesByType('navigation')[0] || {};
  const recursos = performance.getEntriesByType('resource');
  const pintura = performance.getEntriesByName('first-contentful-paint')[0];
  const ejemplos = lista => lista.slice(0, 4).map(describir);

  return {
    pantalla: { ancho, alto: innerHeight, densidad: devicePixelRatio },
    desborde: { px: Math.max(0, desborde), ejemplos: ejemplos(culpables) },
    chicos: { cantidad: chicos.length, de: tocables.length, ejemplos: chicos.slice(0, 4).map(e => { const r = e.getBoundingClientRect(); return `${describir(e)} (${Math.round(r.width)}×${Math.round(r.height)} px)`; }) },
    contraste: { cantidad: poco.length, ejemplos: poco.slice(0, 4).map(p => `${describir(p.e)} (${p.relacion.toFixed(1)}:1)`) },
    sinAlt: { cantidad: sinAlt.length, ejemplos: ejemplos(sinAlt) },
    textoChico: { cantidad: textoChico.length, ejemplos: ejemplos(textoChico) },
    sinNombre: { cantidad: sinNombre.length, ejemplos: ejemplos(sinNombre) },
    sinEtiqueta: { cantidad: sinEtiqueta.length, ejemplos: ejemplos(sinEtiqueta) },
    tiempos: {
      primeraPintura: pintura ? Math.round(pintura.startTime) : null,
      cargaCompleta: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      pesoKB: Math.round(recursos.reduce((s, r) => s + (r.transferSize || 0), nav.transferSize || 0) / 1024),
      pedidos: recursos.length + 1
    }
  };
})()
