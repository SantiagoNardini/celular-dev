// Panel de celular-dev: dibuja la pantalla que corresponde al estado (que llega en vivo por SSE), manda
// las acciones de los botones y maneja el espejo del celular. No guarda nada propio: todo sale del estado
// que manda el programa. Los textos llegan del programa en el idioma elegido (/api/textos).
const app = document.getElementById('app');
const pastilla = document.getElementById('estado');
const avisoEl = document.getElementById('toast');
let estado = null;
let textos = null;
let idiomaCargado = null;
let ayudaAbierta = false;     // el desplegable "cómo activar la depuración USB" queda como lo dejó la persona
let cerrado = false;          // se cerró celular-dev desde el panel: no se vuelve a dibujar nada

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// un texto del idioma elegido; los {datos} se escapan (el texto en sí es del programa y puede traer HTML)
const tr = (clave, datos = {}) => (textos && textos[clave] != null ? textos[clave] : clave).replace(/\{(\w+)\}/g, (_, k) => esc(datos[k]));
// C:\Users\nombre\...\proyectos\mi-sitio: alcanza con las dos últimas carpetas (la ruta entera queda en el title)
const rutaCorta = ruta => {
  const separador = String(ruta).includes('\\') ? '\\' : '/';
  const partes = String(ruta).split(/[\\/]/).filter(Boolean);
  return partes.length > 3 ? `…${separador}${partes.slice(-2).join(separador)}` : ruta;
};
// `código` en los mensajes simples se muestra como código
const conCodigo = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');
const nombreRed = red => tr(`red.${red}`);

function avisar(texto, mal = false) {
  avisoEl.textContent = texto;
  avisoEl.className = 'toast visible' + (mal ? ' mal' : '');
  clearTimeout(avisar.reloj);
  avisar.reloj = setTimeout(() => { avisoEl.className = 'toast' + (mal ? ' mal' : ''); }, 3500);
}

const pedir = (accion, valor) => fetch('/api/accion', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Celular': '1' }, body: JSON.stringify({ accion, valor }) });

async function accion(nombre, valor) {
  try {
    const datos = await (await pedir(nombre, valor)).json();
    if (nombre === 'salir') {
      cerrado = true;
      soltarEspejo();
      pastilla.textContent = tr('pastilla.cerrado');
      pastilla.className = 'pastilla';
      app.innerHTML = `<h1>${tr('cerrado.titulo')}</h1><p class="sub">${tr('cerrado.texto')}</p>`;
      return;
    }
    if (datos.error) avisar(datos.error, true);
    else if (datos.texto && nombre === 'informe') {
      try { await navigator.clipboard.writeText(datos.texto); avisar(tr('toast.informeCopiado', { archivo: datos.archivo })); }
      catch { avisar(tr('toast.informeGuardado', { archivo: datos.archivo })); }
    } else if (datos.mensaje) avisar(datos.mensaje);
  } catch {
    avisar(tr('toast.sinConexion'), true);
  }
}

document.addEventListener('click', e => {
  const boton = e.target.closest('[data-accion]');
  if (boton) accion(boton.dataset.accion, boton.dataset.valor);
});
document.addEventListener('toggle', e => { if (e.target.id === 'ayuda') ayudaAbierta = e.target.open; }, true);

// ---------- Cabecera ----------

function dibujarCabecera() {
  const [texto, clase] =
    estado.fase === 'adb' ? [tr('pastilla.adb'), 'alerta'] :
    estado.fase === 'inicio' ? [tr('pastilla.inicio'), ''] :
    estado.fase === 'preparando' ? [tr('pastilla.preparando'), 'alerta'] :
    !estado.servidorOk ? [tr('pastilla.servidorApagado'), 'peligro'] :
    estado.pasos.celular !== 'ok' ? [tr('pastilla.desconectado'), 'peligro'] :
    [tr('pastilla.funcionando'), 'ok'];
  pastilla.textContent = texto;
  pastilla.className = 'pastilla ' + clase;
  document.title = `celular-dev · ${texto}`;
  document.documentElement.lang = estado.idioma;
  const otro = estado.idioma === 'es' ? 'en' : 'es';
  const idioma = document.getElementById('idioma');
  idioma.dataset.valor = otro;
  idioma.textContent = otro === 'en' ? 'English' : 'Español';
  const cerrar = document.getElementById('cerrar');
  cerrar.textContent = tr('cabecera.cerrar');
  cerrar.title = tr('cabecera.cerrarTitulo');
}

// ---------- Inicio ----------

function vistaInicio() {
  const { carpeta, servidores, recientes } = estado.opciones;
  const usadas = recientes.length
    ? `<p class="nota" style="margin:14px 0 0">${tr('inicio.usadasAntes')}</p>` + recientes.map((r, i) => `<div class="fila-servidor" title="${esc(r.ruta)}"><span><b style="font-weight:500">${esc(r.nombre)}</b> <span class="nota">${esc(rutaCorta(r.ruta))}</span></span><button class="chico" data-accion="usar-reciente" data-valor="${i}">${tr('inicio.usar')}</button></div>`).join('')
    : '';
  const filas = servidores.length
    ? servidores.map((s, i) => `<div class="fila-servidor"><span>${esc(s.url)}${s.liveServer ? ' · Live Server' : ''}</span><button class="chico" data-accion="usar-servidor" data-valor="${i}">${tr('inicio.usar')}</button></div>`).join('')
    : `<p class="nota" style="margin-top:8px">${tr('inicio.sinServidores')}</p>`;
  const usarEsta = carpeta.tieneSitio
    ? `<button class="principal" data-accion="usar-carpeta">${tr('inicio.usarEsta', { nombre: carpeta.nombre })}</button>`
    : '';
  return `
    <h1>${tr('inicio.titulo')}</h1>
    <p class="sub">${tr('inicio.sub')}</p>
    <div class="opciones">
      <section class="tarjeta opcion ${servidores.length ? '' : 'destacada'}">
        <div class="icono" aria-hidden="true">📁</div>
        <h2>${tr('inicio.carpetaTitulo')}</h2>
        <p class="sub">${tr('inicio.carpetaSub')}</p>
        ${carpeta.tieneSitio ? `<p class="nota" style="margin-bottom:10px" title="${esc(carpeta.ruta)}">${tr('inicio.hayUnSitio', { ruta: rutaCorta(carpeta.ruta) })}</p>` : ''}
        <div class="botones">${usarEsta}<button ${carpeta.tieneSitio ? '' : 'class="principal"'} data-accion="elegir-carpeta">${tr('inicio.elegirCarpeta')}</button></div>
        ${usadas}
      </section>
      <section class="tarjeta opcion ${servidores.length ? 'destacada' : ''}">
        <div class="icono" aria-hidden="true">🌐</div>
        <h2>${tr('inicio.servidorTitulo')}</h2>
        <p class="sub">${tr('inicio.servidorSub')}</p>
        ${filas}
      </section>
    </div>`;
}

// ---------- Asistente ----------

const ayudaUsb = () => `
  <details id="ayuda" ${ayudaAbierta ? 'open' : ''}>
    <summary>${tr('asistente.comoActivo')}</summary>
    <ol>${tr('asistente.pasosUsb')}</ol>
  </details>`;

function pasosDelAsistente() {
  const p = estado.pasos;
  const cel = p.celular;
  const lista = [
    { id: 'adb', titulo: tr('asistente.adb'), ok: p.adb === 'ok',
      detalle: typeof estado.descargaAdb === 'number'
        ? `${tr('asistente.descargando', { porcentaje: estado.descargaAdb })}<div class="progreso" role="progressbar" aria-valuenow="${estado.descargaAdb}" aria-valuemin="0" aria-valuemax="100"><span style="width:${estado.descargaAdb}%"></span></div>`
        : `${estado.descargaAdb === 'error' ? tr('asistente.noSeDescargo') : tr('asistente.seBajaSola')}
          <div class="botones" style="margin-top:8px"><button class="chico" data-accion="instalar-adb">${estado.descargaAdb === 'error' ? tr('asistente.probarDeNuevo') : tr('asistente.descargarAdb')}</button></div>` },
    { id: 'cable', titulo: tr('asistente.cable'), ok: cel !== 'sin-celular' && cel !== 'desconocido',
      detalle: tr('asistente.cableDetalle') },
    { id: 'permitir', titulo: tr('asistente.permitir'), ok: cel === 'ok',
      detalle: cel === 'offline' ? tr('asistente.noResponde') : cel === 'sin-permiso' ? tr('asistente.sinPermisoLinux') : tr('asistente.permitirDetalle') },
    { id: 'chrome', titulo: tr('asistente.chrome'), ok: p.chrome === 'ok',
      detalle: p.chrome === 'falta' ? tr('asistente.instalaChrome') : tr('asistente.revisando') },
    { id: 'abierto', titulo: tr('asistente.abrir'), ok: p.abierto === 'ok', detalle: tr('asistente.abriendo') }
  ];
  return { lista, actual: lista.findIndex(x => !x.ok) };
}

function vistaAsistente() {
  const { lista, actual } = pasosDelAsistente();
  const pasos = lista.map((x, i) => {
    const clase = x.ok ? 'ok' : i === actual ? 'actual' : 'pendiente';
    return `<div class="paso ${clase}">
      <span class="marca-paso" aria-hidden="true">${x.ok ? '✓' : i + 1}</span>
      <div><p class="titulo-paso">${x.titulo}<span class="sr-solo">${x.ok ? ` (${tr('asistente.listo')})` : ''}</span></p>
      ${i === actual ? `<div class="detalle">${x.detalle}</div>` : ''}</div>
    </div>`;
  }).join('');
  const esperandoPermiso = lista[actual] && lista[actual].id === 'permitir' && estado.pasos.celular === 'unauthorized';
  const dibujo = esperandoPermiso
    ? `<div class="dialogo-falso"><b>${tr('asistente.dialogoTitulo')}</b>${tr('asistente.dialogoTexto')}<div class="acciones"><span>${tr('asistente.dialogoCancelar')}</span><span style="color:var(--acento);font-weight:500">${tr('asistente.dialogoPermitir')}</span></div></div>`
    : `<p class="vacia">${lista[actual] && lista[actual].id === 'cable' ? tr('asistente.conectaCelular') : tr('asistente.preparando')}</p>`;
  return `
    <h1>${tr('asistente.titulo')}</h1>
    <p class="sub">${estado.sitio ? tr('asistente.paraVer', { nombre: estado.sitio.nombre }) + ' ' : ''}${tr('asistente.seTilda')}</p>
    <div class="asistente">
      <section class="tarjeta">${pasos}${actual <= 2 ? ayudaUsb() : ''}</section>
      <div><div class="telefono"><div class="pantalla">${dibujo}</div></div>
      <p class="pie-telefono">${esperandoPermiso ? tr('asistente.asiSeVe') : tr('asistente.tuCelular')}</p></div>
    </div>`;
}

// ---------- Panel ----------

function vistaPanel() {
  const s = estado;
  const modoTexto = s.modo === 'live-server' ? tr('panel.liveServerRecarga') : s.modo === 'vivo' ? tr('panel.pasarAManual') : tr('panel.pasarAVivo');
  const errores = s.avisos.length
    ? s.avisos.map(a => `<div class="item ${a.nivel}"><span class="punto" aria-hidden="true"></span><div class="cuerpo">
        <p class="simple">${conCodigo(a.simple)}</p>
        <p class="tecnico">${esc(a.texto)}${a.donde ? ' · ' + esc(a.donde) : ''} · ${esc(a.ultima)}</p>
        ${a.abrible ? `<button class="enlace" data-accion="abrir-codigo" data-valor="${esc(a.id)}">${tr('panel.abrirEnEditor')}</button>` : ''}</div>
        ${a.veces > 1 ? `<span class="veces">×${a.veces}</span>` : ''}</div>`).join('')
    : `<p class="vacio">${tr('panel.sinErrores')}</p>`;
  const actividad = s.actividad.length
    ? s.actividad.map(a => `<div class="item ${a.nivel}"><span class="punto" aria-hidden="true"></span><div class="cuerpo"><p class="simple">${conCodigo(a.texto)}</p><p class="tecnico">${esc(a.hora)}</p></div></div>`).join('')
    : `<p class="vacio">${tr('panel.todaviaNada')}</p>`;
  const modo = s.modo === 'vivo' ? tr('panel.enVivo') : s.modo === 'manual' ? tr('panel.manual') : 'Live Server';
  return {
    metricas: `
      <div class="metrica"><p>${tr('panel.celular')}</p><p class="${s.pasos.celular === 'ok' ? 'verde' : 'rojo'}">${s.pasos.celular === 'ok' ? esc(s.celular.modelo || tr('panel.conectado')) : tr('panel.desconectado')}</p></div>
      <div class="metrica"><p>${tr('panel.sitio')}</p><p class="${s.servidorOk ? '' : 'rojo'}" title="${esc(s.sitio.url)}">${esc(s.sitio.nombre)}${s.servidorOk ? '' : ` (${tr('panel.apagado')})`}</p></div>
      <div class="metrica"><p>${tr('panel.errores')}</p><p class="${s.errores ? 'rojo' : 'verde'}">${s.errores}</p></div>`,
    botones: `
      ${s.necesitaCodigo ? `<div class="banda"><p>${tr('panel.sinCodigo')}</p>
        <button class="chico" data-accion="elegir-codigo">${tr('panel.elegirCodigo')}</button></div>` : ''}
      <div class="botones">
        <button data-accion="recargar">↻ ${tr('panel.recargar')}</button>
        <button data-accion="revisar">${s.revisando ? tr('panel.revisando') : `✓ ${tr('panel.revisar')}`}</button>
        <button data-accion="captura">📷 ${tr('panel.captura')}</button>
        <button data-accion="modo">${modoTexto}</button>
        <button class="principal" data-accion="informe">${tr('panel.informe')}</button>
      </div>
      <div class="red" role="group" aria-label="${tr('panel.redDelCelular')}">
        <span class="nota">${tr('panel.redDelCelular')}:</span>
        ${['normal', 'lenta', 'sin-conexion'].map(v =>
          `<button class="chico ${s.red === v ? 'activa' : ''}" aria-pressed="${s.red === v}" data-accion="red" data-valor="${v}">${nombreRed(v)}</button>`).join('')}
      </div>
      <div class="botones" style="margin-top:8px">
        <button class="chico" data-accion="abrir">${tr('panel.abrirDeNuevo')}</button>
        <button class="chico" data-accion="cambiar-sitio">${tr('panel.cambiarSitio')}</button>
        <button class="chico" data-accion="abrir-datos">${tr('panel.verDatos')}</button>
      </div>`,
    revision: !s.revision ? '' : `<h2>${tr('panel.revision')} <span class="nota" style="font-weight:400">${esc(s.revision.hora)}${s.revision.red !== 'normal' ? ` · ${tr('panel.red')} ${nombreRed(s.revision.red)}` : ''}</span></h2>` +
      s.revision.puntos.map(p => `<div class="item ${p.nivel}"><span class="punto" aria-hidden="true"></span><div class="cuerpo">
        <p class="simple">${conCodigo(p.simple)}</p>${p.ejemplos.length ? `<p class="tecnico">${p.ejemplos.map(esc).join(' · ')}</p>` : ''}</div></div>`).join(''),
    errores: `<h2>${tr('panel.erroresTitulo')} ${s.avisos.length ? `<button class="chico" data-accion="limpiar">${tr('panel.limpiar')}</button>` : ''}</h2>${errores}`,
    actividad: `<h2>${tr('panel.actividad')}</h2>${actividad}`,
    espejoTapa: s.espejo ? '' : `<p class="vacia">${s.consola ? tr('espejo.esperando') : tr('espejo.sinPestana')}</p>`,
    pie: `<p class="pie-telefono">${s.espejo ? tr('espejo.ayuda') : tr('espejo.titulo')} · ${modo}${s.red !== 'normal' ? ` · <b class="alerta-texto">${tr('panel.red')} ${nombreRed(s.red)}</b>` : ''}</p>`
  };
}

// Cada pantalla se arma una vez (esqueleto) y después solo se reemplaza la zona que cambió: si se
// redibujara todo con cada error que llega, un clic que cae justo en ese momento se perdería. El espejo
// está en el esqueleto: así la imagen en vivo no se corta cada vez que cambia algo.
const ESQUELETOS = {
  corriendo: `<div data-zona="oferta"></div><div class="tablero"><div>
      <div class="metricas" data-zona="metricas"></div>
      <div data-zona="botones"></div>
      <section class="lista" data-zona="revision"></section>
      <section class="lista" data-zona="errores"></section>
      <section class="lista" data-zona="actividad"></section>
    </div><div>
      <div class="telefono espejo"><div class="pantalla">
        <img id="espejo" tabindex="0" draggable="false" alt="">
        <div class="tapa" data-zona="espejoTapa"></div>
      </div></div>
      <div data-zona="pie"></div>
    </div></div>`,
  otra: '<div data-zona="oferta"></div><div data-zona="principal"></div>'
};

// La primera vez: ofrecer los accesos directos.
function vistaOferta() {
  if (!estado.ofrecerAccesos) return '';
  return `<div class="oferta"><p>${tr(`oferta.${estado.plataforma}`)}</p>
    <div class="botones"><button class="principal chico" data-accion="crear-accesos">${tr('oferta.crear')}</button><button class="chico" data-accion="no-accesos">${tr('oferta.no')}</button></div></div>`;
}

let esqueletoDibujado = null;
const dibujado = new Map();

function dibujar() {
  if (!estado || !textos || cerrado) return;
  dibujarCabecera();
  const esqueleto = estado.fase === 'corriendo' ? 'corriendo' : 'otra';
  const zonas = estado.fase === 'corriendo' ? vistaPanel()
    : { principal: estado.fase === 'inicio' ? vistaInicio() : vistaAsistente() };
  zonas.oferta = vistaOferta();
  if (esqueletoDibujado !== esqueleto) {
    soltarEspejo();
    app.innerHTML = ESQUELETOS[esqueleto];
    esqueletoDibujado = esqueleto;
    dibujado.clear();
  }
  for (const [zona, html] of Object.entries(zonas)) {
    if (dibujado.get(zona) === html) continue;
    app.querySelector(`[data-zona="${zona}"]`).innerHTML = html;
    dibujado.set(zona, html);
  }
  const imagen = document.getElementById('espejo');
  if (imagen) imagen.alt = tr('espejo.alt');
  actualizarEspejo();
}

// ---------- Espejo ----------
// La imagen se conecta solo mientras todo anda y esta pestaña se ve: en otra pestaña o minimizada, se
// suelta, y el celular deja de mandar cuadros.

function actualizarEspejo() {
  const imagen = document.getElementById('espejo');
  if (!imagen) return;
  const quiere = !cerrado && estado && estado.fase === 'corriendo' && estado.consola && document.visibilityState === 'visible';
  if (quiere && !imagen.dataset.conectada) {
    imagen.dataset.conectada = '1';
    imagen.src = `/api/espejo.mjpg?${Date.now()}`;
  } else if (!quiere && imagen.dataset.conectada) {
    soltarEspejo();
  }
}

function soltarEspejo() {
  const imagen = document.getElementById('espejo');
  if (!imagen || !imagen.dataset.conectada) return;
  delete imagen.dataset.conectada;
  imagen.removeAttribute('src');
}

document.addEventListener('visibilitychange', actualizarEspejo);
// si se corta (por ejemplo, se reinició el programa), se vuelve a conectar con el próximo cambio de estado
document.addEventListener('error', e => { if (e.target.id === 'espejo') delete e.target.dataset.conectada; }, true);

// Los toques van en orden y de a uno: si llegan muchos movimientos juntos, solo se manda el último.
let cola = Promise.resolve();
let movimientoPendiente = null;
function tocar(valor) {
  if (valor.tipo === 'mover' || valor.tipo === 'rueda') {
    const habia = movimientoPendiente;
    if (habia && habia.tipo === valor.tipo) {
      if (valor.tipo === 'rueda') { habia.dx += valor.dx; habia.dy += valor.dy; habia.x = valor.x; habia.y = valor.y; }
      else Object.assign(habia, valor);
      return;
    }
    movimientoPendiente = valor;
    cola = cola.then(() => { const v = movimientoPendiente; movimientoPendiente = null; return v && pedir('tocar', v); }).catch(() => {});
    return;
  }
  cola = cola.then(() => pedir('tocar', valor)).catch(() => {});
}

const enImagen = e => {
  const r = e.target.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
};
let tocando = false;

document.addEventListener('pointerdown', e => {
  if (e.target.id !== 'espejo' || !estado || !estado.espejo || e.button > 0) return;
  e.preventDefault();
  e.target.focus();
  e.target.setPointerCapture(e.pointerId);
  tocando = true;
  tocar({ tipo: 'inicio', ...enImagen(e) });
});
document.addEventListener('pointermove', e => {
  if (!tocando || e.target.id !== 'espejo') return;
  tocar({ tipo: 'mover', ...enImagen(e) });
});
const soltar = e => {
  if (!tocando) return;
  tocando = false;
  tocar({ tipo: 'fin', ...(e.target.id === 'espejo' ? enImagen(e) : { x: 0, y: 0 }) });
};
document.addEventListener('pointerup', soltar);
document.addEventListener('pointercancel', soltar);
document.addEventListener('wheel', e => {
  if (e.target.id !== 'espejo' || !estado || !estado.espejo) return;
  e.preventDefault();
  tocar({ tipo: 'rueda', ...enImagen(e), dx: e.deltaX, dy: e.deltaY });
}, { passive: false });

const TECLAS = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
document.addEventListener('keydown', e => {
  if (document.activeElement && document.activeElement.id !== 'espejo') return;
  if (!estado || !estado.espejo || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1) { e.preventDefault(); tocar({ tipo: 'texto', texto: e.key }); }
  else if (TECLAS.has(e.key)) { e.preventDefault(); tocar({ tipo: 'tecla', tecla: e.key }); }
});
// pegar texto en el espejo lo escribe en el celular
document.addEventListener('paste', e => {
  if (!document.activeElement || document.activeElement.id !== 'espejo' || !estado || !estado.espejo) return;
  const texto = e.clipboardData.getData('text');
  if (texto) { e.preventDefault(); tocar({ tipo: 'texto', texto }); }
});

// ---------- Conexión con el programa ----------

async function cargarTextos(idioma) {
  if (idiomaCargado === idioma) return;
  idiomaCargado = idioma;
  textos = await (await fetch('/api/textos')).json();
  esqueletoDibujado = null;   // los textos fijos del esqueleto también cambian
}

function conectar() {
  const fuente = new EventSource('/api/eventos');
  fuente.onmessage = async e => {
    estado = JSON.parse(e.data);
    try { await cargarTextos(estado.idioma); } catch { idiomaCargado = null; return; }
    dibujar();
  };
  fuente.onerror = () => {
    if (cerrado) { fuente.close(); return; }
    pastilla.textContent = textos ? tr('pastilla.sinConexion') : '…';
    pastilla.className = 'pastilla peligro';
  };
}
conectar();
