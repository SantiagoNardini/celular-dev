// Panel de celular-dev: dibuja la pantalla que corresponde al estado (que llega en vivo por SSE) y manda
// las acciones de los botones. No guarda nada propio: todo sale del estado que manda el programa.
const app = document.getElementById('app');
const pastilla = document.getElementById('estado');
const avisoEl = document.getElementById('toast');
let estado = null;
let ayudaAbierta = false;     // el desplegable "cómo activar la depuración USB" queda como lo dejó la persona
let cerrado = false;          // se cerró celular-dev desde el panel: no se vuelve a dibujar nada

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// C:\Users\nombre\...\proyectos\mi-sitio: alcanza con las dos últimas carpetas (la ruta entera queda en el title)
const rutaCorta = ruta => {
  const partes = String(ruta).split(/[\\/]/).filter(Boolean);
  return partes.length > 3 ? `…\\${partes.slice(-2).join('\\')}` : ruta;
};
// `código` en los mensajes simples se muestra como código
const conCodigo = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');

function avisar(texto, mal = false) {
  avisoEl.textContent = texto;
  avisoEl.className = 'toast visible' + (mal ? ' mal' : '');
  clearTimeout(avisar.reloj);
  avisar.reloj = setTimeout(() => { avisoEl.className = 'toast' + (mal ? ' mal' : ''); }, 3500);
}

async function accion(nombre, valor) {
  try {
    const r = await fetch('/api/accion', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Celular': '1' }, body: JSON.stringify({ accion: nombre, valor }) });
    const datos = await r.json();
    if (nombre === 'salir') {
      cerrado = true;
      pastilla.textContent = 'Cerrado';
      pastilla.className = 'pastilla';
      app.innerHTML = '<h1>celular-dev se cerró</h1><p class="sub">Ya podés cerrar esta pestaña. Para volver a usarlo, abrí celular-dev desde su acceso directo.</p>';
      return;
    }
    if (datos.error) avisar(datos.error, true);
    else if (datos.texto && nombre === 'informe') {
      try { await navigator.clipboard.writeText(datos.texto); avisar(`Informe copiado. También quedó en ${datos.archivo}`); }
      catch { avisar(`Informe guardado en ${datos.archivo}`); }
    } else if (datos.mensaje) avisar(datos.mensaje);
  } catch {
    avisar('No hay conexión con celular-dev. ¿Se cerró la ventana del programa?', true);
  }
}

document.addEventListener('click', e => {
  const boton = e.target.closest('[data-accion]');
  if (boton) accion(boton.dataset.accion, boton.dataset.valor);
});
document.addEventListener('toggle', e => { if (e.target.id === 'ayuda') ayudaAbierta = e.target.open; }, true);

// ---------- Pastilla de estado ----------

function dibujarPastilla() {
  const [texto, clase] =
    estado.fase === 'adb' ? ['Falta una herramienta', 'alerta'] :
    estado.fase === 'inicio' ? ['Elegí qué mostrar', ''] :
    estado.fase === 'preparando' ? ['Preparando el celular', 'alerta'] :
    !estado.servidorOk ? ['Servidor apagado', 'peligro'] :
    estado.pasos.celular !== 'ok' ? ['Celular desconectado', 'peligro'] :
    ['Funcionando', 'ok'];
  pastilla.textContent = texto;
  pastilla.className = 'pastilla ' + clase;
  document.title = `celular-dev · ${texto}`;
}

// ---------- Inicio ----------

function vistaInicio() {
  const { carpeta, servidores, recientes } = estado.opciones;
  const usadas = recientes.length
    ? `<p class="nota" style="margin:14px 0 0">Usadas antes:</p>` + recientes.map((r, i) => `<div class="fila-servidor" title="${esc(r.ruta)}"><span><b style="font-weight:500">${esc(r.nombre)}</b> <span class="nota">${esc(rutaCorta(r.ruta))}</span></span><button class="chico" data-accion="usar-reciente" data-valor="${i}">Usar</button></div>`).join('')
    : '';
  const filas = servidores.length
    ? servidores.map((s, i) => `<div class="fila-servidor"><span>${esc(s.url)}${s.liveServer ? ' · Live Server' : ''}</span><button class="chico" data-accion="usar-servidor" data-valor="${i}">Usar</button></div>`).join('')
    : '<p class="nota" style="margin-top:8px">No hay ninguno prendido. Si usás <code>npm run dev</code> o Live Server, prendelo y aparece acá solo.</p>';
  const usarEsta = carpeta.tieneSitio
    ? `<button class="principal" data-accion="usar-carpeta">Usar «${esc(carpeta.nombre)}»</button>`
    : '';
  return `
    <h1>¿Qué querés ver en tu celular?</h1>
    <p class="sub">Elegí una opción. Lo demás lo hacemos nosotros.</p>
    <div class="opciones">
      <section class="tarjeta opcion ${servidores.length ? '' : 'destacada'}">
        <div class="icono" aria-hidden="true">📁</div>
        <h2>Una carpeta con tu sitio</h2>
        <p class="sub">La que tiene tu <code>index.html</code>. No necesitás servidor ni saber de puertos.</p>
        ${carpeta.tieneSitio ? `<p class="nota" style="margin-bottom:10px" title="${esc(carpeta.ruta)}">En esta carpeta hay un sitio: <code>${esc(rutaCorta(carpeta.ruta))}</code></p>` : ''}
        <div class="botones">${usarEsta}<button ${carpeta.tieneSitio ? '' : 'class="principal"'} data-accion="elegir-carpeta">Elegir una carpeta…</button></div>
        ${usadas}
      </section>
      <section class="tarjeta opcion ${servidores.length ? 'destacada' : ''}">
        <div class="icono" aria-hidden="true">🌐</div>
        <h2>Un servidor que ya tengo prendido</h2>
        <p class="sub">Lo buscamos solo en tu PC.</p>
        ${filas}
      </section>
    </div>`;
}

// ---------- Asistente ----------

const AYUDA_USB = `
  <details id="ayuda" ${ayudaAbierta ? 'open' : ''}>
    <summary>¿Cómo activo la depuración USB?</summary>
    <ol>
      <li>En el celular abrí <b>Ajustes</b> &gt; <b>Acerca del teléfono</b>.</li>
      <li>Tocá 7 veces <b>Número de compilación</b> hasta que diga que sos desarrollador.</li>
      <li>Volvé a <b>Ajustes</b> &gt; <b>Sistema</b> &gt; <b>Opciones de desarrollador</b>.</li>
      <li>Activá <b>Depuración USB</b>.</li>
      <li>Conectá el cable. Si aparece un aviso de USB, elegí <b>Transferencia de archivos</b>.</li>
    </ol>
  </details>`;

function pasosDelAsistente() {
  const p = estado.pasos;
  const cel = p.celular;
  const lista = [
    { id: 'adb', titulo: 'Herramienta para hablar con el celular (ADB)', ok: p.adb === 'ok',
      detalle: typeof estado.descargaAdb === 'number'
        ? `Descargando de Google… ${estado.descargaAdb} %<div class="progreso" role="progressbar" aria-valuenow="${estado.descargaAdb}" aria-valuemin="0" aria-valuemax="100"><span style="width:${estado.descargaAdb}%"></span></div>`
        : `${estado.descargaAdb === 'error' ? 'No se pudo descargar: revisá la conexión y probá de nuevo.' : 'Falta, pero se baja sola: es la herramienta oficial de Google (unos 7 MB), no hace falta instalar nada.'}
          <div class="botones" style="margin-top:8px"><button class="chico" data-accion="instalar-adb">${estado.descargaAdb === 'error' ? 'Probar de nuevo' : 'Descargar ADB'}</button></div>` },
    { id: 'cable', titulo: 'Celular conectado por cable', ok: cel !== 'sin-celular' && cel !== 'desconocido',
      detalle: 'Conectalo con un cable USB que pase datos (algunos solo cargan) y activá la depuración USB.' },
    { id: 'permitir', titulo: 'Tocá «Permitir» en tu celular', ok: cel === 'ok',
      detalle: cel === 'offline' ? 'El celular no responde: desconectá y volvé a conectar el cable.' : 'Desbloquealo: el aviso «¿Permitir depuración USB?» aparece en la pantalla. Marcá «Permitir siempre desde esta computadora».' },
    { id: 'chrome', titulo: 'Google Chrome en el celular', ok: p.chrome === 'ok',
      detalle: p.chrome === 'falta' ? 'Instalalo desde Play Store y volvé a abrir celular-dev.' : 'Revisando…' },
    { id: 'abierto', titulo: 'Abrir tu sitio en el celular', ok: p.abierto === 'ok', detalle: 'Abriendo…' }
  ];
  let actual = lista.findIndex(x => !x.ok);
  return { lista, actual };
}

function vistaAsistente() {
  const { lista, actual } = pasosDelAsistente();
  const pasos = lista.map((x, i) => {
    const clase = x.ok ? 'ok' : i === actual ? 'actual' : 'pendiente';
    return `<div class="paso ${clase}">
      <span class="marca-paso" aria-hidden="true">${x.ok ? '✓' : i + 1}</span>
      <div><p class="titulo-paso">${x.titulo}<span class="sr-solo">${x.ok ? ' (listo)' : ''}</span></p>
      ${i === actual ? `<div class="detalle">${x.detalle}</div>` : ''}</div>
    </div>`;
  }).join('');
  const esperandoPermiso = lista[actual] && lista[actual].id === 'permitir' && estado.pasos.celular === 'unauthorized';
  const dibujo = esperandoPermiso
    ? `<div class="dialogo-falso"><b>¿Permitir depuración USB?</b>La huella de la clave RSA de la computadora es…<div class="acciones"><span>Cancelar</span><span style="color:var(--acento);font-weight:500">Permitir</span></div></div>`
    : `<p class="vacia">${lista[actual] && lista[actual].id === 'cable' ? 'Conectá el celular' : 'Preparando…'}</p>`;
  return `
    <h1>Preparemos tu celular</h1>
    <p class="sub">${estado.sitio ? `Para ver <code>${esc(estado.sitio.nombre)}</code>. ` : ''}Se va tildando solo a medida que avanzás.</p>
    <div class="asistente">
      <section class="tarjeta">${pasos}${actual <= 2 ? AYUDA_USB : ''}</section>
      <div><div class="telefono"><div class="pantalla">${dibujo}</div></div>
      <p class="pie-telefono">${esperandoPermiso ? 'Así se ve el aviso' : 'Tu celular'}</p></div>
    </div>`;
}

// ---------- Panel ----------

function vistaPanel() {
  const s = estado;
  const modoTexto = s.modo === 'live-server' ? 'Live Server recarga solo' : s.modo === 'vivo' ? 'Pasar a manual' : 'Pasar a en vivo';
  const errores = s.avisos.length
    ? s.avisos.map(a => `<div class="item ${a.nivel}"><span class="punto" aria-hidden="true"></span><div class="cuerpo">
        <p class="simple">${conCodigo(a.simple)}</p>
        <p class="tecnico">${esc(a.texto)}${a.donde ? ' · ' + esc(a.donde) : ''} · ${esc(a.ultima)}</p>
        ${a.abrible ? `<button class="enlace" data-accion="abrir-codigo" data-valor="${esc(a.id)}">Abrir en el editor</button>` : ''}</div>
        ${a.veces > 1 ? `<span class="veces">×${a.veces}</span>` : ''}</div>`).join('')
    : '<p class="vacio">Sin errores por ahora. Cuando algo falle en el celular, aparece acá explicado.</p>';
  const actividad = s.actividad.length
    ? s.actividad.map(a => `<div class="item ${a.nivel}"><span class="punto" aria-hidden="true"></span><div class="cuerpo"><p class="simple">${conCodigo(a.texto)}</p><p class="tecnico">${esc(a.hora)}</p></div></div>`).join('')
    : '<p class="vacio">Todavía nada.</p>';
  const vista = s.vista ? `<img src="/api/vista.png?v=${s.vista}" alt="Vista actual del sitio en el celular">` : '<p class="vacia">La vista aparece al cargar la página</p>';
  return {
    metricas: `
      <div class="metrica"><p>Celular</p><p class="${s.pasos.celular === 'ok' ? 'verde' : 'rojo'}">${s.pasos.celular === 'ok' ? esc(s.celular.modelo || 'Conectado') : 'Desconectado'}</p></div>
      <div class="metrica"><p>Sitio</p><p class="${s.servidorOk ? '' : 'rojo'}" title="${esc(s.sitio.url)}">${esc(s.sitio.nombre)}${s.servidorOk ? '' : ' (apagado)'}</p></div>
      <div class="metrica"><p>Errores</p><p class="${s.errores ? 'rojo' : 'verde'}">${s.errores}</p></div>`,
    botones: `
      ${s.necesitaCodigo ? `<div class="banda"><p>No sé en qué carpeta está el código de este servidor, así que no puedo recargar el celular cuando guardás.</p>
        <button class="chico" data-accion="elegir-codigo">Elegir la carpeta del código</button></div>` : ''}
      <div class="botones">
        <button data-accion="recargar">↻ Recargar</button>
        <button data-accion="revisar">${s.revisando ? 'Revisando…' : '✓ Revisar sitio'}</button>
        <button data-accion="captura">📷 Captura</button>
        <button data-accion="modo">${modoTexto}</button>
        <button class="principal" data-accion="informe">Informe para IA</button>
      </div>
      <div class="red" role="group" aria-label="Red del celular">
        <span class="nota">Red del celular:</span>
        ${[['normal', 'Normal'], ['lenta', '3G lenta'], ['sin-conexion', 'Sin conexión']].map(([v, t]) =>
          `<button class="chico ${s.red === v ? 'activa' : ''}" aria-pressed="${s.red === v}" data-accion="red" data-valor="${v}">${t}</button>`).join('')}
      </div>
      <div class="botones" style="margin-top:8px">
        <button class="chico" data-accion="abrir">Abrir de nuevo en el celular</button>
        <button class="chico" data-accion="cambiar-sitio">Cambiar qué mostrar</button>
        <button class="chico" data-accion="abrir-datos">Ver capturas e informes</button>
      </div>`,
    revision: !s.revision ? '' : `<h2>Revisión del sitio <span class="nota" style="font-weight:400">${esc(s.revision.hora)}${s.revision.red !== 'normal' ? ' · red ' + esc(s.revision.red === 'lenta' ? '3G lenta' : 'sin conexión') : ''}</span></h2>` +
      s.revision.puntos.map(p => `<div class="item ${p.nivel}"><span class="punto" aria-hidden="true"></span><div class="cuerpo">
        <p class="simple">${conCodigo(p.simple)}</p>${p.ejemplos.length ? `<p class="tecnico">${p.ejemplos.map(esc).join(' · ')}</p>` : ''}</div></div>`).join(''),
    errores: `<h2>Errores y avisos del celular ${s.avisos.length ? '<button class="chico" data-accion="limpiar">Limpiar</button>' : ''}</h2>${errores}`,
    actividad: `<h2>Actividad</h2>${actividad}`,
    telefono: `<div class="telefono"><div class="pantalla">${vista}</div></div>
      <p class="pie-telefono">${s.consola ? 'Vista del celular' : 'Sin conexión con la pestaña'} · ${s.modo === 'vivo' ? 'en vivo' : s.modo === 'manual' ? 'manual' : 'Live Server'}${s.red !== 'normal' ? ` · <b class="alerta-texto">red ${s.red === 'lenta' ? '3G lenta' : 'sin conexión'}</b>` : ''}</p>`
  };
}

// Cada pantalla se arma una vez (esqueleto) y después solo se reemplaza la zona que cambió: si se
// redibujara todo con cada error que llega, un clic que cae justo en ese momento se perdería.
const ESQUELETOS = {
  corriendo: `<div data-zona="oferta"></div><div class="tablero"><div>
      <div class="metricas" data-zona="metricas"></div>
      <div data-zona="botones"></div>
      <section class="lista" data-zona="revision"></section>
      <section class="lista" data-zona="errores"></section>
      <section class="lista" data-zona="actividad"></section>
    </div><div data-zona="telefono"></div></div>`,
  otra: '<div data-zona="oferta"></div><div data-zona="principal"></div>'
};

// La primera vez: ofrecer los accesos directos en el Escritorio y en el menú Inicio.
function vistaOferta() {
  if (!estado.ofrecerAccesos) return '';
  return `<div class="oferta"><p><b>¿Querés tener celular-dev a mano?</b> Creo un acceso directo en tu Escritorio y en el menú Inicio, con su ícono.</p>
    <div class="botones"><button class="principal chico" data-accion="crear-accesos">Crear accesos directos</button><button class="chico" data-accion="no-accesos">No, gracias</button></div></div>`;
}
let esqueletoDibujado = null;
const dibujado = new Map();

function dibujar() {
  if (!estado || cerrado) return;
  dibujarPastilla();
  const esqueleto = estado.fase === 'corriendo' ? 'corriendo' : 'otra';
  const zonas = estado.fase === 'corriendo' ? vistaPanel()
    : { principal: estado.fase === 'inicio' ? vistaInicio() : vistaAsistente() };
  zonas.oferta = vistaOferta();
  if (esqueletoDibujado !== esqueleto) {
    app.innerHTML = ESQUELETOS[esqueleto];
    esqueletoDibujado = esqueleto;
    dibujado.clear();
  }
  for (const [zona, html] of Object.entries(zonas)) {
    if (dibujado.get(zona) === html) continue;
    app.querySelector(`[data-zona="${zona}"]`).innerHTML = html;
    dibujado.set(zona, html);
  }
}

function conectar() {
  const fuente = new EventSource('/api/eventos');
  fuente.onmessage = e => { estado = JSON.parse(e.data); dibujar(); };
  fuente.onerror = () => {
    if (cerrado) { fuente.close(); return; }
    pastilla.textContent = 'Sin conexión con el programa';
    pastilla.className = 'pastilla peligro';
  };
}
conectar();
