// Las herramientas del panel que usan las DevTools de Chrome en el celular: condiciones de prueba, inspector de
// elementos, pedidos de red y datos del sitio. Se carga después de panel.js y usa lo que ese archivo define
// (estado, tr, esc, ic, accion, avisar…).
Object.assign(ICONOS, {
  inspeccionar: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  papelera: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
});

let herramienta = 'condiciones';   // la pestaña abierta: condiciones | inspector | red | datos
let inspeccionando = false;        // el modo inspección: tocar el espejo elige un elemento en vez de tocar el celular
let filtroRed = 'pesados';         // todos | pesados | errores

const json = valor => esc(JSON.stringify(valor));
const bytesLegibles = n => n == null ? '…' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

// ---------- Cuadro con pestañas ----------

function vistaHerramientas(s) {
  const pestanas = [['condiciones', tr('herr.condiciones')], ['inspector', tr('herr.inspector')], ['red', `${tr('herr.red')}${s.pedidos.total ? ` <span class="cuenta">${s.pedidos.total}</span>` : ''}`], ['datos', tr('herr.datos')]];
  const cuerpo = herramienta === 'condiciones' ? vistaCondiciones(s) : herramienta === 'inspector' ? vistaInspector(s) : herramienta === 'red' ? vistaPedidos(s) : vistaDatos(s);
  return `<div class="pestanas" role="tablist">${pestanas.map(([id, nombre]) =>
    `<button role="tab" aria-selected="${herramienta === id}" class="${herramienta === id ? 'activa' : ''}" data-accion="herramienta" data-valor="${id}">${nombre}</button>`).join('')}</div>
    <div class="cuerpo-herramienta" role="tabpanel">${cuerpo}</div>`;
}

function elegirHerramienta(id) {
  herramienta = id;
  dibujar();
  if (id === 'datos' && estado && !estado.datosSitio) accion('datos-leer');
}

// ---------- Condiciones de prueba ----------

const segmentos = (clave, valores, actual) => `<div class="segmentos" role="group" aria-label="${tr(`cond.${clave}`)}">${valores.map(v =>
  `<button class="${actual === v ? 'activa' : ''}" aria-pressed="${actual === v}" data-accion="condicion" data-valor="${json({ clave, valor: v })}">${tr(`cond.${clave}.${v}`)}</button>`).join('')}</div>`;
const selector = (clave, valores, actual) => `<select id="cond-${clave}" aria-label="${tr(`cond.${clave}`)}">${valores.map(v => `<option value="${v}"${actual === v ? ' selected' : ''}>${tr(`cond.${clave}.${v}`)}</option>`).join('')}</select>`;
const filaCond = (clave, control, ayuda = '') => `<div class="fila-cond"><label>${tr(`cond.${clave}`)}</label>${control}${ayuda ? `<p class="nota">${ayuda}</p>` : ''}</div>`;

function vistaCondiciones(s) {
  const c = s.condiciones;
  const algunaCambiada = s.lento || Object.entries(c).some(([k, v]) => v !== { esquema: 'auto', animaciones: 'normal', contraste: 'normal', vision: 'ninguna', lugar: 'real' }[k]);
  return `<div class="lento ${s.lento ? 'activa' : ''}">
      <div><b>${tr('cond.lento')}</b><p class="nota">${tr('cond.lentoAyuda')}</p></div>
      <button class="${s.lento ? 'principal' : ''}" aria-pressed="${s.lento}" data-accion="celular-lento">${s.lento ? tr('cond.lentoQuitar') : tr('cond.lentoPoner')}</button>
    </div>
    ${filaCond('esquema', segmentos('esquema', ['auto', 'oscuro', 'claro'], c.esquema))}
    ${filaCond('animaciones', segmentos('animaciones', ['normal', 'reducidas'], c.animaciones))}
    ${filaCond('contraste', segmentos('contraste', ['normal', 'alto'], c.contraste))}
    ${filaCond('vision', selector('vision', ['ninguna', 'borrosa', 'protanopia', 'deuteranopia', 'tritanopia', 'acromatopsia'], c.vision))}
    ${filaCond('lugar', selector('lugar', ['real', 'buenos-aires', 'madrid', 'nueva-york', 'tokio'], c.lugar), tr('cond.lugarAyuda'))}
    ${algunaCambiada ? `<p class="reiniciar"><button class="chico fantasma" data-accion="condiciones-reiniciar">${tr('cond.reiniciar')}</button></p>` : ''}`;
}

document.addEventListener('change', e => {
  if (e.target.id === 'cond-vision' || e.target.id === 'cond-lugar') accion('condicion', { clave: e.target.id.slice(5), valor: e.target.value });
});

// ---------- Inspector de elementos ----------

const colorSeguro = c => /^rgba?\([\d\s.,%/]+\)$/.test(c) ? c : 'transparent';
const muestra = c => `<span class="muestra" style="background:${colorSeguro(c)}" aria-hidden="true"></span>`;

function vistaInspector(s) {
  const i = s.inspeccion;
  const boton = `<button class="${inspeccionando ? 'principal' : ''} chico" data-accion="inspeccionar-modo">${ic('inspeccionar')}${inspeccionando ? tr('inspector.terminar') : tr('inspector.empezar')}</button>`;
  if (!i) return `<p class="nota">${tr('inspector.ayuda')}</p><p class="reiniciar">${boton}</p>`;
  const e = i.estilos;
  const avisos = [];
  if (i.interactivo && Math.min(i.rect.ancho, i.rect.alto) < 48) avisos.push(tr('inspector.avisoToque', { medida: `${i.rect.ancho} × ${i.rect.alto}` }));
  if (i.desborde) avisos.push(tr('inspector.avisoDesborde'));
  const fila = (nombre, valor) => valor ? `<tr><th>${tr(`inspector.${nombre}`)}</th><td>${valor}</td></tr>` : '';
  return `<div class="inspeccion">
      <p class="selector"><code>${esc(i.selector)}</code></p>
      <p class="chips"><span>&lt;${esc(i.etiqueta)}&gt;</span><span>${i.rect.ancho} × ${i.rect.alto} px</span>${i.interactivo ? `<span>${tr('inspector.tocable')}</span>` : ''}</p>
      ${avisos.map(a => `<p class="aviso-inspector">${ic('alerta')}${a}</p>`).join('')}
      <table class="datos-inspector">
        ${fila('texto', esc(i.texto))}${fila('nombre', esc(i.nombre))}${fila('rol', esc(i.rol))}
        ${fila('color', `${muestra(e.color)}${esc(e.color)}`)}${fila('fondo', `${muestra(e.fondo)}${esc(e.fondo)}`)}
        ${fila('letra', `${esc(e.letra)} · ${esc(e.tamanoLetra)} · ${esc(e.pesoLetra)}`)}
        ${fila('caja', `${esc(e.mostrar)} · ${esc(e.posicion)} · ${esc(e.ancho)} × ${esc(e.alto)}`)}
        ${fila('margen', esc(e.margen))}${fila('relleno', esc(e.relleno))}${fila('borde', esc(e.borde))}
        ${fila('atributos', esc(i.atributos.join(' ')))}
      </table>
      <p class="reiniciar">${boton}
        <button class="chico fantasma" data-accion="inspector-copiar" data-valor="selector">${ic('copiar')}${tr('inspector.copiarSelector')}</button>
        <button class="chico fantasma" data-accion="inspector-copiar" data-valor="ia">${ic('copiar')}${tr('errores.copiar')}</button>
        <button class="chico fantasma" data-accion="inspeccion-cerrar">${tr('inspector.cerrar')}</button></p>
    </div>`;
}

function textoInspectorParaIa(i) {
  const e = i.estilos;
  const lineas = [trSin('inspector.ia.intro', { sitio: estado.sitio.url, celular: estado.celular.modelo || 'Android' }), '',
    trSin('inspector.ia.selector', { selector: i.selector }),
    trSin('inspector.ia.tamano', { ancho: i.rect.ancho, alto: i.rect.alto, pantallaAncho: i.pantalla.ancho, pantallaAlto: i.pantalla.alto }),
    trSin('inspector.ia.estilos', { estilos: `color ${e.color}; background ${e.fondo}; font ${e.tamanoLetra} ${e.letra} ${e.pesoLetra}; display ${e.mostrar}; margin ${e.margen}; padding ${e.relleno}` })];
  if (i.texto) lineas.push(trSin('inspector.ia.texto', { texto: i.texto }));
  if (i.interactivo && Math.min(i.rect.ancho, i.rect.alto) < 48) lineas.push(trSin('inspector.ia.toqueChico'));
  lineas.push('', trSin('inspector.ia.cierre'));
  return lineas.join('\n');
}

function alternarInspeccion() {
  inspeccionando = !inspeccionando;
  if (inspeccionando) herramienta = 'inspector';
  dibujar();
}

// el recuadro sobre el espejo, en la posición del elemento elegido
function dibujarResaltado() {
  const r = document.getElementById('resaltado');
  if (!r) return;
  const i = estado && estado.inspeccion;
  const pantalla = r.parentElement;
  pantalla.classList.toggle('inspeccionando', inspeccionando);
  if (!i || !i.pantalla.ancho || !i.pantalla.alto) { r.hidden = true; return; }
  r.hidden = false;
  r.style.left = `${(i.rect.x / i.pantalla.ancho) * 100}%`;
  r.style.top = `${(i.rect.y / i.pantalla.alto) * 100}%`;
  r.style.width = `${(i.rect.ancho / i.pantalla.ancho) * 100}%`;
  r.style.height = `${(i.rect.alto / i.pantalla.alto) * 100}%`;
}

// ---------- Pedidos de red ----------

const esImagen = x => x.tipo === 'Image' || /^image\//.test(x.mime || '');
function consejoRed(x) {
  if (x.tamano > 300 * 1024 && esImagen(x)) return tr('red.consejoImagen', { tamano: bytesLegibles(x.tamano) });
  if (x.tamano > 300 * 1024 && (x.tipo === 'Script' || x.tipo === 'Stylesheet')) return tr('red.consejoCodigo', { tamano: bytesLegibles(x.tamano) });
  if (x.tiempo > 1000 && !x.fallo) return tr('red.consejoLento', { tiempo: x.tiempo });
  return '';
}
function comandoCurl(x) {
  const url = String(x.url).replace(/'/g, "'\\''");
  return `curl -i${x.metodo && x.metodo !== 'GET' ? ` -X ${x.metodo}` : ''} '${url}'`;
}

function vistaPedidos(s) {
  const { total, bytes, filas } = s.pedidos;
  const falla = x => x.fallo || x.estado >= 400;
  let lista = filtroRed === 'errores' ? filas.filter(falla) : filtroRed === 'pesados' ? [...filas].sort((a, b) => (b.tamano || 0) - (a.tamano || 0)).slice(0, 15) : filas.slice(0, 80);
  const encabezado = `<div class="resumen-red"><span>${tr('red.resumen', { total, tamano: bytesLegibles(bytes) })}</span>
      <div class="segmentos" role="group" aria-label="${tr('herr.red')}">${['pesados', 'errores', 'todos'].map(f => `<button class="${filtroRed === f ? 'activa' : ''}" aria-pressed="${filtroRed === f}" data-accion="filtro-red" data-valor="${f}">${tr(`red.filtro.${f}`)}</button>`).join('')}</div>
      ${total ? `<button class="chico fantasma" data-accion="pedidos-limpiar">${ic('limpiar')}${tr('panel.limpiar')}</button>` : ''}</div>`;
  if (!total) return `${encabezado}<p class="vacio">${tr('red.vacio')}</p>`;
  if (!lista.length) return `${encabezado}<p class="vacio">${ic('tilde')}${tr('red.sinErrores')}</p>`;
  return `${encabezado}<div class="tabla-red">${lista.map(x => {
    const mal = falla(x);
    const consejo = consejoRed(x);
    const estadoTexto = x.fallo ? '✕' : x.estado || '…';
    return `<div class="pedido ${mal ? 'mal' : ''}"><div class="linea-pedido">
        <span class="estado-http ${mal ? 'rojo' : x.estado >= 300 ? 'gris' : ''}" title="${esc(x.fallo || '')}">${esc(estadoTexto)}</span>
        <span class="metodo">${esc(x.metodo)}</span>
        <span class="ruta" title="${esc(x.url)}">${esc(x.ruta)}</span>
        <span class="tipo">${esc(x.tipo)}</span>
        <span class="peso ${x.tamano > 500 * 1024 ? 'pesado' : ''}">${x.cache ? tr('red.cache') : bytesLegibles(x.tamano)}</span>
        <span class="tiempo ${x.tiempo > 1000 ? 'pesado' : ''}">${x.tiempo == null ? '…' : `${x.tiempo} ms`}</span>
        <button class="copiar-curl" data-accion="copiar-curl" data-valor="${esc(x.id)}" title="${tr('red.copiarCurl')}" aria-label="${tr('red.copiarCurl')}">${ic('copiar')}</button></div>
        ${x.fallo ? `<p class="consejo mal">${esc(x.fallo)}</p>` : ''}${consejo ? `<p class="consejo">${consejo}</p>` : ''}</div>`;
  }).join('')}</div>`;
}

// ---------- Datos del sitio ----------

function vistaDatos(s) {
  const d = s.datosSitio;
  const acciones = `<p class="reiniciar"><button class="chico" data-accion="datos-leer">${ic('recargar')}${tr('datos.leer')}</button>
      <button class="chico peligro" data-accion="datos-limpiar">${ic('papelera')}${tr('datos.empezarDeCero')}</button></p>`;
  if (!d) return `<p class="nota">${tr('datos.ayuda')}</p>${acciones}`;
  const seccion = (titulo, filas, tipo) => `<h3>${titulo} <span class="cuenta">${filas.length}</span></h3>${filas.length ? filas.map(f => `<div class="dato"><span class="clave">${esc(f.clave)}</span><span class="valor" title="${esc(f.valor)}">${esc(f.valor)}</span>
      <button class="chico fantasma" data-accion="dato-borrar" data-valor="${json({ tipo, clave: f.clave, dominio: f.dominio, ruta: f.ruta })}" aria-label="${tr('datos.borrar')}" title="${tr('datos.borrar')}">${ic('papelera')}</button></div>`).join('') : `<p class="nota">${tr('datos.nada')}</p>`}`;
  const lista = (titulo, nombres) => `<h3>${titulo} <span class="cuenta">${nombres.length}</span></h3>${nombres.length ? `<p class="nota">${nombres.map(esc).join(' · ')}</p>` : `<p class="nota">${tr('datos.nada')}</p>`}`;
  return `<p class="nota">${tr('datos.de', { origen: d.origen, hora: d.hora })}</p>${acciones}
    ${seccion(tr('datos.local'), d.local, 'local')}${seccion(tr('datos.sesion'), d.sesion, 'sesion')}
    ${seccion(tr('datos.cookies'), d.cookies.map(c => ({ clave: c.nombre, valor: `${c.valor}${c.soloHttp ? ' · httpOnly' : ''}${c.segura ? ' · secure' : ''}`, dominio: c.dominio, ruta: c.ruta })), 'cookie')}
    ${lista(tr('datos.workers'), d.serviceWorkers ? [String(d.serviceWorkers)] : [])}${lista(tr('datos.caches'), d.caches)}${lista(tr('datos.bases'), d.bases)}`;
}
