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

// Íconos de línea (dibujados acá, sin archivos aparte), del color del texto que los rodea.
const ICONOS = {
  recargar: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  revisar: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/>',
  captura: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  vivo: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  manual: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  informe: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  atras: '<path d="m15 18-6-6 6-6"/>',
  abrir: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  carpeta: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  servidor: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  celular: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  alerta: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  cambiar: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  tilde: '<path d="m20 6-11 11-5-5"/>',
  globo: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  limpiar: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>'
};
const ic = nombre => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[nombre]}</svg>`;

function avisar(texto, mal = false) {
  avisoEl.textContent = texto;
  avisoEl.className = 'toast visible' + (mal ? ' mal' : '');
  clearTimeout(avisar.reloj);
  avisar.reloj = setTimeout(() => { avisoEl.className = 'toast' + (mal ? ' mal' : ''); }, 3500);
}

const pedir = (accion, valor) => fetch('/api/accion', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Celular': '1' }, body: JSON.stringify({ accion, valor }) });

async function accion(nombre, valor, boton) {
  // el botón se marca enseguida, aunque el celular tarde en contestar
  if (boton) boton.classList.add('ocupado');
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
  } finally {
    if (boton) boton.classList.remove('ocupado');
  }
}

document.addEventListener('click', e => {
  const boton = e.target.closest('[data-accion]');
  if (boton && boton.dataset.accion === 'copiar-url') {
    const url = estado && estado.celular.url;
    if (url) navigator.clipboard.writeText(url).then(() => avisar(tr('espejo.copiada'))).catch(() => avisar(url));
    return;
  }
  if (boton && !boton.classList.contains('ocupado')) accion(boton.dataset.accion, boton.dataset.valor, boton);
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
        <div class="icono">${ic('carpeta')}</div>
        <h2>${tr('inicio.carpetaTitulo')}</h2>
        <p class="sub">${tr('inicio.carpetaSub')}</p>
        ${carpeta.tieneSitio ? `<p class="nota" style="margin-bottom:10px" title="${esc(carpeta.ruta)}">${tr('inicio.hayUnSitio', { ruta: rutaCorta(carpeta.ruta) })}</p>` : ''}
        <div class="botones">${usarEsta}<button ${carpeta.tieneSitio ? '' : 'class="principal"'} data-accion="elegir-carpeta">${tr('inicio.elegirCarpeta')}</button></div>
        ${usadas}
      </section>
      <section class="tarjeta opcion ${servidores.length ? 'destacada' : ''}">
        <div class="icono">${ic('servidor')}</div>
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

// La guía del celular: en el dibujo del teléfono se muestra, con una animación, lo que hay que hacer en el
// paso en que está la persona (las pantallas del celular que tiene que recorrer, el aviso de «Permitir»...).
// Las animaciones son solo CSS: no hace falta redibujar nada para que se muevan.
const escena = (i, leyenda, contenido) => `<div class="escena" style="--i:${i}"><p class="leyenda">${leyenda}</p>${contenido}</div>`;
const filaMock = (texto, marcada = false) => `<div class="fila-mock${marcada ? ' marcada' : ''}"><span>${texto}</span></div>`;

function guiaCable() {
  const puntos = Array.from({ length: 7 }, (_, k) => `<i style="--k:${k}"></i>`).join('');
  return `<div class="guia" aria-label="${tr('guia.resumen')}">
    ${escena(0, `1 · ${tr('guia.paso1')}`, filaMock(tr('guia.fila.red')) + filaMock(tr('guia.fila.pantalla')) + filaMock(tr('guia.fila.acerca'), true))}
    ${escena(1, `2 · ${tr('guia.paso2')}`, filaMock(tr('guia.fila.compilacion'), true) + `<div class="puntos" style="--i:1">${puntos}</div><p class="logro" style="--i:1">${tr('guia.listo')}</p>`)}
    ${escena(2, `3 · ${tr('guia.paso3')}`, filaMock(tr('guia.fila.sistema')) + filaMock(tr('guia.fila.opciones'), true) + filaMock(tr('guia.fila.acerca')))}
    ${escena(3, `4 · ${tr('guia.paso4')}`, `<div class="fila-mock marcada"><span>${tr('guia.fila.depuracion')}</span><span class="interruptor" style="--i:3"></span></div>`)}
    ${escena(4, `5 · ${tr('guia.paso5')}`, `<div class="cable-mock"><div class="puerto"></div><div class="cable" style="--i:4"></div></div>`)}
  </div>`;
}

// Lo que se dibuja en el teléfono según el paso actual; pie: el texto que va debajo.
function guiaDelPaso(id) {
  const cel = estado.pasos.celular;
  if (id === 'cable') return { dibujo: guiaCable(), pie: tr('guia.pie') };
  if (id === 'permitir' && cel === 'unauthorized') {
    return {
      dibujo: `<div class="dialogo-falso"><b>${tr('asistente.dialogoTitulo')}</b>${tr('asistente.dialogoTexto')}
        <p class="casilla"><span class="marca-casilla">✓</span>${tr('asistente.dialogoSiempre')}</p>
        <div class="acciones"><span>${tr('asistente.dialogoCancelar')}</span><span class="permitir">${tr('asistente.dialogoPermitir')}</span></div></div>`,
      pie: tr('asistente.asiSeVe')
    };
  }
  if (id === 'permitir') return { dibujo: `<p class="vacia">${tr('asistente.desbloquea')}</p>`, pie: tr('asistente.tuCelular') };
  if (id === 'chrome') {
    return { dibujo: `<div class="mock-tienda"><span class="logo-chrome"></span><b>Chrome</b><span class="instalar">${tr('guia.instalar')}</span></div>`, pie: tr('asistente.tuCelular') };
  }
  return { dibujo: `<div class="cargando"><span class="girando"></span><p class="vacia">${id === 'abierto' ? tr('asistente.abriendo') : tr('asistente.preparando')}</p></div>`, pie: tr('asistente.tuCelular') };
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
  const { dibujo, pie } = guiaDelPaso(lista[actual] ? lista[actual].id : 'abierto');
  return `
    <h1>${tr('asistente.titulo')}</h1>
    <p class="sub">${estado.sitio ? tr('asistente.paraVer', { nombre: estado.sitio.nombre }) + ' ' : ''}${tr('asistente.seTilda')}</p>
    <div class="asistente">
      <section class="tarjeta">${pasos}${actual <= 2 ? ayudaUsb() : ''}</section>
      <div><div class="telefono"><div class="pantalla">${dibujo}</div></div>
      <p class="pie-telefono">${pie}</p></div>
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
      <div class="metrica"><p>${ic('celular')}${tr('panel.celular')}</p><p class="${s.pasos.celular === 'ok' ? 'verde' : 'rojo'}">${s.pasos.celular === 'ok' ? esc(s.celular.modelo || tr('panel.conectado')) : tr('panel.desconectado')}</p></div>
      <div class="metrica"><p>${ic(s.sitio.tipo === 'carpeta' ? 'carpeta' : 'servidor')}${tr('panel.sitio')}</p><p class="${s.servidorOk ? '' : 'rojo'}" title="${esc(s.sitio.url)}">${esc(s.sitio.nombre)}${s.servidorOk ? '' : ` (${tr('panel.apagado')})`}</p></div>
      <div class="metrica"><p>${ic('alerta')}${tr('panel.errores')}</p><p class="${s.errores ? 'rojo' : 'verde'}">${s.errores}</p></div>`,
    botones: `
      ${s.necesitaCodigo ? `<div class="banda"><p>${tr('panel.sinCodigo')}</p>
        <button class="chico" data-accion="elegir-codigo">${ic('carpeta')}${tr('panel.elegirCodigo')}</button></div>` : ''}
      <section class="tarjeta barra">
        <div class="fila">
          <button data-accion="recargar">${ic('recargar')}${tr('panel.recargar')}</button>
          <button data-accion="revisar">${ic('revisar')}${s.revisando ? tr('panel.revisando') : tr('panel.revisar')}</button>
          <button data-accion="captura">${ic('captura')}${tr('panel.captura')}</button>
          <button data-accion="modo">${ic(s.modo === 'manual' ? 'vivo' : 'manual')}${modoTexto}</button>
          <button class="principal" data-accion="informe" style="margin-left:auto">${ic('informe')}${tr('panel.informe')}</button>
        </div>
        <div class="fila">
          <span class="etiqueta">${tr('panel.redDelCelular')}</span>
          <div class="segmentos" role="group" aria-label="${tr('panel.redDelCelular')}">
            ${['normal', 'lenta', 'sin-conexion'].map(v =>
              `<button class="${s.red === v ? 'activa' : ''}" aria-pressed="${s.red === v}" data-accion="red" data-valor="${v}">${nombreRed(v)}</button>`).join('')}
          </div>
          <span style="flex:1"></span>
          <button class="chico fantasma" data-accion="cambiar-sitio">${ic('cambiar')}${tr('panel.cambiarSitio')}</button>
          <button class="chico fantasma" data-accion="abrir-datos">${ic('carpeta')}${tr('panel.verDatos')}</button>
        </div>
      </section>`,
    revision: !s.revision ? '' : `<h2>${tr('panel.revision')} <span class="cuenta">${esc(s.revision.hora)}${s.revision.red !== 'normal' ? ` · ${tr('panel.red')} ${nombreRed(s.revision.red)}` : ''}</span></h2>` +
      s.revision.puntos.map(p => `<div class="item ${p.nivel}"><span class="punto" aria-hidden="true"></span><div class="cuerpo">
        <p class="simple">${conCodigo(p.simple)}</p>${p.ejemplos.length ? `<p class="tecnico">${p.ejemplos.map(esc).join(' · ')}</p>` : ''}</div></div>`).join(''),
    errores: `<h2>${tr('panel.erroresTitulo')} ${s.avisos.length ? `<span class="cuenta">${s.avisos.length}</span><button class="chico fantasma" data-accion="limpiar">${ic('limpiar')}${tr('panel.limpiar')}</button>` : ''}</h2>${errores}`,
    actividad: `<h2>${tr('panel.actividad')}</h2>${actividad}`,
    bienvenida: s.primerExito && s.espejo ? `<section class="tarjeta bienvenida">
        <span class="marca-ok">${ic('tilde')}</span>
        <div><h2>${tr('bienvenida.titulo')}</h2><p>${tr('bienvenida.texto')}</p></div>
        <button class="principal chico" data-accion="entendido">${tr('bienvenida.entendido')}</button></section>` : '',
    espejoSugerencia: s.primerExito && s.espejo ? `<span class="dedo"></span><p>${tr('bienvenida.sugerencia')}</p>` : '',
    direccion: direccionDelCelular(s),
    espejoTapa: s.espejo ? '' : `<p class="vacia">${s.consola ? tr('espejo.esperando') : tr('espejo.sinPestana')}</p>`,
    pie: `<div class="controles-espejo">
        <button data-accion="atras" title="${tr('espejo.atras')}" aria-label="${tr('espejo.atras')}">${ic('atras')}</button>
        <button data-accion="recargar" title="${tr('panel.recargar')}" aria-label="${tr('panel.recargar')}">${ic('recargar')}</button>
        <button data-accion="captura" title="${tr('panel.captura')}" aria-label="${tr('panel.captura')}">${ic('captura')}</button>
        <button data-accion="abrir" title="${tr('panel.abrirDeNuevo')}" aria-label="${tr('panel.abrirDeNuevo')}">${ic('abrir')}</button>
      </div>
      <p class="estado-espejo">${s.espejo ? `<span class="vivo">${tr('espejo.enVivo')}</span> · ${tr('espejo.ayuda')}` : tr('espejo.titulo')} · ${modo}${s.red !== 'normal' ? ` · <b class="alerta-texto">${tr('panel.red')} ${nombreRed(s.red)}</b>` : ''}</p>`
  };
}

// La página que tiene abierta el celular, como la barra de direcciones de un navegador: se puede copiar, o
// abrir en la computadora para compararla con lo que se ve en el celular. Avisa si el celular salió del sitio.
function direccionDelCelular(s) {
  const url = s.celular.url;
  if (!url) return '';
  let fuera = false;
  try { fuera = !!s.sitio && new URL(url).origin !== new URL(s.sitio.url).origin; } catch { /* una dirección rara: no se compara */ }
  return `<div class="direccion${fuera ? ' fuera' : ''}" title="${esc(tr('espejo.direccion'))}: ${esc(url)}">
      ${ic('globo')}<span class="url">${esc(url.replace(/^https?:\/\//, ''))}</span>
      <button data-accion="copiar-url" title="${tr('espejo.copiar')}" aria-label="${tr('espejo.copiar')}">${ic('copiar')}</button>
      <button data-accion="abrir-en-pc" title="${tr('espejo.abrirEnPc')}" aria-label="${tr('espejo.abrirEnPc')}">${ic('abrir')}</button>
    </div>${fuera ? `<p class="aviso-fuera">${tr('espejo.fueraDelSitio')}</p>` : ''}`;
}

// Cada pantalla se arma una vez (esqueleto) y después solo se reemplaza la zona que cambió: si se
// redibujara todo con cada error que llega, un clic que cae justo en ese momento se perdería. El espejo
// está en el esqueleto: así la imagen en vivo no se corta cada vez que cambia algo.
const ESQUELETOS = {
  corriendo: `<div data-zona="oferta"></div><div class="tablero"><div>
      <div data-zona="bienvenida"></div>
      <div class="metricas" data-zona="metricas"></div>
      <div data-zona="botones"></div>
      <section class="tarjeta lista" data-zona="revision"></section>
      <section class="tarjeta lista" data-zona="errores"></section>
      <section class="tarjeta lista actividad" data-zona="actividad"></section>
    </div><div>
      <div class="telefono espejo"><div class="pantalla">
        <img id="espejo" tabindex="0" draggable="false" alt="">
        <div class="tapa" data-zona="espejoTapa"></div>
        <div class="sugerencia" data-zona="espejoSugerencia"></div>
      </div></div>
      <div data-zona="direccion"></div>
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
    const ancho = anchoEnPantalla(imagen);
    imagen.dataset.conectada = '1';
    imagen.dataset.ancho = ancho;
    imagen.src = `/api/espejo.mjpg?ancho=${ancho}&${Date.now()}`;
  } else if (!quiere && imagen.dataset.conectada) {
    soltarEspejo();
  }
}

// cuántos píxeles de verdad mide el celular en esta pantalla (con la escala de Windows o una Retina, más)
const anchoEnPantalla = imagen => Math.round((imagen.parentElement.clientWidth || 380) * (window.devicePixelRatio || 1));
// si la ventana cambia mucho de tamaño (o pasa a otro monitor), se piden imágenes del tamaño nuevo
let relojTamano = null;
window.addEventListener('resize', () => {
  clearTimeout(relojTamano);
  relojTamano = setTimeout(() => {
    const imagen = document.getElementById('espejo');
    if (!imagen || !imagen.dataset.conectada) return;
    if (Math.abs(anchoEnPantalla(imagen) - +imagen.dataset.ancho) > 60) { soltarEspejo(); actualizarEspejo(); }
  }, 400);
});

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

// dónde, en fracción de la imagen, y cuándo (ms, en la hora de la computadora)
const enImagen = (e, imagen = e.target) => {
  const r = imagen.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: Math.round(performance.timeOrigin + e.timeStamp) };
};
// un círculo donde se tocó, para ver que el toque llegó
function marcarToque(e) {
  const pantalla = e.target.parentElement;
  const r = pantalla.getBoundingClientRect();
  const marca = document.createElement('span');
  marca.className = 'toque';
  marca.style.left = `${e.clientX - r.left}px`;
  marca.style.top = `${e.clientY - r.top}px`;
  pantalla.appendChild(marca);
  marca.addEventListener('animationend', () => marca.remove());
}
let tocando = false;

document.addEventListener('pointerdown', e => {
  if (e.target.id !== 'espejo' || !estado || !estado.espejo || e.button > 0) return;
  e.preventDefault();
  e.target.focus();
  e.target.setPointerCapture(e.pointerId);
  tocando = true;
  marcarToque(e);
  tocar({ tipo: 'inicio', ...enImagen(e) });
});
document.addEventListener('pointermove', e => {
  if (!tocando || e.target.id !== 'espejo') return;
  // si el mouse se movió rápido, el navegador junta varios movimientos en uno: se usa el último, con su hora
  const juntos = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  tocar({ tipo: 'mover', ...enImagen(juntos.length ? juntos[juntos.length - 1] : e, e.target) });
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
