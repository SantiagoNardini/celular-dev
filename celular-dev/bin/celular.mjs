#!/usr/bin/env node
// celular-dev: abre tu sitio en tu celular Android por cable, lo recarga al guardar y te muestra los
// errores de la página tal como pasan en el celular, explicados. Se usa desde un panel en el navegador
// de la PC (se abre solo) o desde la terminal; los dos muestran lo mismo.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Adb, buscarAdb } from '../src/adb.mjs';
import { detectar, puertoAbierto, PUERTOS_CONOCIDOS } from '../src/servidor.mjs';
import { Chrome } from '../src/chrome.mjs';
import { Traductor } from '../src/consola.mjs';
import { explicar } from '../src/explicar.mjs';
import { vigilar } from '../src/vigia.mjs';
import { servirCarpeta, tieneSitio } from '../src/estatico.mjs';
import { elegirCarpeta } from '../src/carpeta.mjs';
import { armarInforme } from '../src/informe.mjs';
import { iniciarPanel, abrirNavegador, PUERTO_PANEL } from '../src/panel.mjs';
import { carpetaDatos, rutaParaMostrar, leerConfig, recordarCarpeta, recordarCodigo, codigoRecordado, preferencia, guardarPreferencia } from '../src/lugares.mjs';
import { descargarAdb } from '../src/instalar-adb.mjs';
import { hayAccesos, crearAccesos } from '../src/accesos.mjs';
import { revisar, evaluar } from '../src/revision.mjs';
import { ubicar, abrirEnEditor } from '../src/editor.mjs';
import * as ui from '../src/pantalla.mjs';

const AYUDA = `
celular-dev - probá tu sitio en tu celular Android real

Uso:  celular [opciones]        (o doble clic en celular-dev.bat)

Sin opciones abre un panel en el navegador para elegir qué mostrar y seguir todo desde ahí.
Las capturas, los informes y el registro quedan en Documentos\\celular-dev.

  --carpeta <ruta>  mostrar esa carpeta (la que tiene index.html), sin necesidad de otro servidor
  --codigo <ruta>   con un servidor: carpeta de tu código, para recargar el celular al guardar
  --puerto <n>      usar tu servidor local en ese puerto (${PUERTOS_CONOCIDOS.join(', ')} se detectan solos)
  --ruta <ruta>     carpeta del sitio dentro del servidor, por ejemplo /dist/ (Live Server se detecta solo)
  --manual          no recargar el celular al guardar: recargás vos (tecla R, botón del panel o el celular)
  --todo            mostrar también console.log e info del celular, no solo errores y avisos
  --sin-panel       solo terminal: no abre el panel (elige solo: tu servidor si hay uno, si no esta carpeta)
  --ayuda           esta ayuda

Necesita el celular conectado por USB con la depuración USB activada, y Chrome en el celular.
`;

const TECLAS = 'R recargar · M en vivo/manual · V revisar sitio · N red normal/lenta/sin conexión · F captura · A abrir de nuevo · P panel · I inspect · L limpiar · Q salir';
const REDES = { normal: 'normal', lenta: '3G lenta', 'sin-conexion': 'sin conexión' };

let opciones;
try {
  opciones = parseArgs({
    options: {
      carpeta: { type: 'string' }, codigo: { type: 'string' }, puerto: { type: 'string' }, ruta: { type: 'string' },
      manual: { type: 'boolean' }, todo: { type: 'boolean' }, 'sin-panel': { type: 'boolean' },
      ayuda: { type: 'boolean', short: 'h' }
    }
  }).values;
} catch (error) {
  console.log(`${error.message}\n${AYUDA}`);
  process.exit(1);
}
if (opciones.ayuda) { console.log(AYUDA); process.exit(0); }
const conPanel = !opciones['sin-panel'];

// La carpeta desde donde se abrió solo cuenta si parece un proyecto: con doble clic en celular-dev.bat
// se abre desde la carpeta de la herramienta, y ahí no hay nada que mostrar ni que vigilar.
const carpetaHerramienta = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const carpetaProyecto = process.cwd();
const esProyecto = !resolve(carpetaProyecto).toLowerCase().startsWith(resolve(carpetaHerramienta, '..').toLowerCase())
  && ['package.json', 'index.html', 'src'].some(f => existsSync(join(carpetaProyecto, f)));
const carpetaPropia = carpetaDatos();
const espera = ms => new Promise(r => setTimeout(r, ms));
const mostrar = ruta => rutaParaMostrar(ruta);

// ---------- Estado ----------
// Es lo que dibuja el panel (se le manda entero cada vez que cambia) y lo que resume la terminal.

const estado = {
  fase: 'adb',                       // adb | inicio | preparando | corriendo
  pasos: { adb: 'pendiente', celular: 'desconocido', chrome: 'pendiente', abierto: 'pendiente' },
  opciones: {
    carpeta: { nombre: basename(carpetaProyecto), ruta: carpetaProyecto, tieneSitio: esProyecto && tieneSitio(carpetaProyecto) },
    recientes: [],                   // carpetas usadas otras veces: { nombre, ruta }
    servidores: []
  },
  sitio: null,                       // { tipo, nombre, url }
  necesitaCodigo: false,             // un servidor sin carpeta de código conocida: no se puede recargar al guardar
  descargaAdb: null,                 // null, o el porcentaje mientras se descarga ADB, o 'error'
  ofrecerAccesos: false,             // todavía no hay accesos directos: el panel ofrece crearlos
  servidorOk: true,
  celular: { modelo: '', android: '', navegador: '', pantalla: '' },
  modo: opciones.manual ? 'manual' : 'vivo',   // vivo | manual | live-server
  consola: false,
  red: 'normal',                     // normal | lenta | sin-conexion: la red que se simula en el celular
  revision: null,                    // la última revisión del sitio: { hora, red, puntos }
  revisando: false,
  recargas: 0,
  errores: 0,
  avisos: [],                        // errores y avisos del celular, agrupados, el último arriba
  actividad: [],                     // lo que hizo el programa: guardados, recargas, conexiones
  vista: 0                           // sube cada vez que hay una vista nueva del celular
};

const interno = { cerrando: false, inicio: Date.now(), modoElegido: estado.modo, capturas: [], impreso: new Map(), servidoresVistos: new Map() };
let adb, chrome, traductor, panel, vistaPng = null, sacandoVista = false;
let sitio = null;                    // { tipo, puerto, ruta, url, origen, liveServer, nombre, carpeta, cerrarEstatico, reverseYaEstaba }
let puertoDevtools = 0, relojServidor, relojReconexion, relojOpciones, dejarDeVigilar;
let alElegirSitio = null;            // mientras el panel muestra el inicio: recibe lo que se eligió

function cambio() {
  titulo();
  if (panel) panel.avisar();
}

function titulo() {
  const situacion = estado.fase === 'adb' ? 'FALTA ADB' : estado.fase === 'inicio' ? 'ELEGÍ QUÉ MOSTRAR'
    : estado.fase === 'preparando' ? 'PREPARANDO EL CELULAR' : !estado.servidorOk ? 'SERVIDOR APAGADO'
    : estado.pasos.celular !== 'ok' ? 'CELULAR DESCONECTADO' : 'CORRIENDO';
  const partes = [`Celular: ${situacion}`];
  if (sitio) partes.push(sitio.url);
  if (estado.fase === 'corriendo') partes.push(estado.modo === 'live-server' ? 'recarga Live Server' : `modo ${estado.modo}`);
  if (estado.errores) partes.push(`${estado.errores} errores`);
  ui.titulo(partes.join('  |  '));
}

// Lo que pasa se cuenta en la terminal y queda en la actividad del panel.
function contar(nivel, texto, solucion) {
  ({ ok: ui.ok, info: ui.info, aviso: ui.aviso, error: ui.falla })[nivel](texto, solucion);
  estado.actividad.unshift({ id: `${Date.now()}-${Math.random()}`, nivel, texto: solucion && solucion.length ? `${texto} ${solucion[0]}` : texto, hora: ui.hora() });
  if (estado.actividad.length > 30) estado.actividad.length = 30;
  cambio();
}

// Un error o aviso del celular: se explica, se agrupa con los iguales y se cuenta.
function registrarAviso(t) {
  const simple = explicar(t);
  const clave = `${t.tipo}|${t.texto}|${t.donde}`;
  let grupo = estado.avisos.find(a => a.clave === clave);
  if (grupo) {
    grupo.veces++;
    grupo.ultima = ui.hora();
    estado.avisos = [grupo, ...estado.avisos.filter(a => a !== grupo)];
  } else {
    grupo = { id: clave, clave, nivel: t.nivel, tipo: t.tipo, simple, texto: t.texto, donde: t.donde, abrible: !!(t.donde && /:\d+/.test(t.donde)), veces: 1, ultima: ui.hora() };
    estado.avisos.unshift(grupo);
    if (estado.avisos.length > 100) estado.avisos.length = 100;
  }
  if (t.nivel === 'error') estado.errores++;
  // en la terminal, un error que se repite seguido no se vuelve a imprimir más de una vez cada 3 s
  const ultimo = interno.impreso.get(clave) || 0;
  if (Date.now() - ultimo > 3000) {
    interno.impreso.set(clave, Date.now());
    ui.delCelular(t.nivel, simple, t.texto, t.donde, grupo.veces);
  }
  cambio();
}

function explicarCelular(e) {
  estado.pasos.celular = e === 'device' ? 'ok' : e;
  cambio();
  if (e === 'sin-celular') {
    ui.aviso('No veo ningún celular conectado.', [
      'Conectalo a la PC con un cable USB que pase datos (algunos solo cargan).',
      'En el celular: Ajustes > Sistema > Opciones de desarrollador > Depuración USB activada.'
    ]);
  } else if (e === 'unauthorized') {
    ui.aviso('El celular está conectado pero todavía no aceptó a esta PC.', ['Desbloquealo y tocá "Permitir" en el aviso "¿Permitir depuración USB?".']);
  } else if (e !== 'desconocido') {
    ui.aviso(`El celular responde raro (estado: ${e}).`, ['Desconectá y volvé a conectar el cable.']);
  }
}

// ---------- Qué mostrar ----------

// Con un servidor, la carpeta del código (la que se vigila para recargar al guardar) sale de: --codigo,
// lo recordado para ese puerto, o la carpeta desde donde se abrió si es un proyecto. Si no, se pregunta.
function sitioDeServidor(s) {
  const carpeta = opciones.codigo ? resolve(opciones.codigo) : codigoRecordado(s.puerto) || (esProyecto ? carpetaProyecto : null);
  return { tipo: 'servidor', puerto: s.puerto, ruta: s.ruta, liveServer: s.liveServer, nombre: `localhost:${s.puerto}${s.ruta === '/' ? '' : s.ruta}`, carpeta };
}

async function sitioDeCarpeta(ruta) {
  if (!tieneSitio(ruta)) throw new Error(`En «${basename(ruta)}» no hay un index.html. Elegí la carpeta donde está tu sitio.`);
  const estatico = await servirCarpeta(ruta);
  recordarCarpeta(ruta);
  return { tipo: 'carpeta', puerto: estatico.puerto, ruta: '/', liveServer: false, nombre: basename(ruta), carpeta: ruta, cerrarEstatico: estatico.cerrar };
}

// Las carpetas usadas otras veces que todavía existen y tienen un sitio (menos la de ahora, que ya se ofrece).
function recientes() {
  return leerConfig().recientes
    .filter(r => tieneSitio(r) && !(estado.opciones.carpeta.tieneSitio && r.toLowerCase() === carpetaProyecto.toLowerCase()))
    .slice(0, 4)
    .map(r => ({ nombre: basename(r), ruta: r, corta: mostrar(r) }));
}

// Vigila la carpeta del código para recargar el celular al guardar (no hace falta con Live Server).
function vigilarCodigo() {
  if (dejarDeVigilar) { dejarDeVigilar(); dejarDeVigilar = null; }
  estado.necesitaCodigo = false;
  if (estado.modo === 'live-server') return;
  if (!sitio.carpeta) {
    estado.necesitaCodigo = true;
    contar('aviso', 'No sé en qué carpeta está el código de este servidor, así que no puedo recargar el celular al guardar.', ['Elegila en el panel («Elegir la carpeta del código») o recargá con R.']);
    return;
  }
  dejarDeVigilar = vigilar(sitio.carpeta, archivos => {
    const nombres = archivos.slice(0, 3).join(', ') + (archivos.length > 3 ? ` y ${archivos.length - 3} más` : '');
    if (estado.fase !== 'corriendo') return;
    if (estado.modo === 'manual') { contar('info', `Guardaste ${nombres} (modo manual: recargá cuando quieras).`); return; }
    contar('info', `Guardaste ${nombres}`);
    recargar();
  });
}

// Mientras se muestra el inicio, cada 3 s se miran los puertos conocidos. Solo se le pide la página a un
// servidor la primera vez que aparece (hay vistas previas que recompilan todo con cada pedido).
async function actualizarOpciones() {
  const propios = sitio && sitio.tipo === 'carpeta' ? [sitio.puerto] : [];
  for (const p of PUERTOS_CONOCIDOS) {
    if (propios.includes(p)) continue;
    const abierto = await puertoAbierto(p, 300);
    if (!abierto) { interno.servidoresVistos.delete(p); continue; }
    if (!interno.servidoresVistos.has(p)) {
      const hallado = await detectar({ puerto: p });
      if (hallado) interno.servidoresVistos.set(p, { ...hallado, url: `http://localhost:${p}${hallado.ruta}` });
    }
  }
  const servidores = [...interno.servidoresVistos.values()];
  const tiene = esProyecto && tieneSitio(carpetaProyecto);
  const cambioCarpeta = tiene !== estado.opciones.carpeta.tieneSitio;
  estado.opciones.carpeta.tieneSitio = tiene;
  const usadas = recientes();
  if (cambioCarpeta || JSON.stringify([servidores, usadas]) !== JSON.stringify([estado.opciones.servidores, estado.opciones.recientes])) {
    estado.opciones.servidores = servidores;
    estado.opciones.recientes = usadas;
    cambio();
  }
}

// Muestra el inicio en el panel y espera a que se elija qué mostrar.
async function elegirEnPanel() {
  estado.fase = 'inicio';
  cambio();
  await actualizarOpciones();
  relojOpciones = setInterval(actualizarOpciones, 3000);
  ui.info(`Elegí en el panel qué mostrar (${panel.url}).${estado.opciones.servidores.length ? ' Desde acá también: S usa el servidor encontrado.' : ''}${estado.opciones.carpeta.tieneSitio ? ' C usa esta carpeta.' : ''}`);
  const elegido = await new Promise(resolver => { alElegirSitio = resolver; });
  alElegirSitio = null;
  clearInterval(relojOpciones);
  return elegido;
}

async function obtenerSitio() {
  if (opciones.carpeta) return sitioDeCarpeta(resolve(opciones.carpeta));
  if (opciones.puerto || opciones.ruta || !conPanel) {
    const pedido = { puerto: opciones.puerto ? parseInt(opciones.puerto, 10) : 0, ruta: opciones.ruta || '' };
    let hallado = await detectar(pedido);
    // solo terminal y sin servidor: si en esta carpeta hay un sitio, se muestra ese
    if (!hallado && !opciones.puerto && !opciones.ruta && esProyecto && tieneSitio(carpetaProyecto)) return sitioDeCarpeta(carpetaProyecto);
    if (!hallado) {
      const donde = pedido.puerto ? `el puerto ${pedido.puerto}` : `los puertos ${PUERTOS_CONOCIDOS.join(', ')}`;
      ui.aviso(`No hay ningún servidor prendido en ${donde}.`, ['Prendé el de tu proyecto (npm run dev, "Go Live" en VS Code…). Apenas lo prendas, sigo solo.']);
      while (!hallado && !interno.cerrando) { await espera(1500); hallado = await detectar(pedido); }
    }
    return sitioDeServidor(hallado);
  }
  return elegirEnPanel();
}

// Deja listo el sitio elegido: quién lo sirve, qué carpeta se vigila y cómo se recarga.
async function aplicarSitio(nuevo) {
  const anterior = sitio;
  sitio = { ...nuevo, origen: `http://localhost:${nuevo.puerto}`, url: `http://localhost:${nuevo.puerto}${nuevo.ruta}`, reverseYaEstaba: true };
  estado.sitio = { tipo: sitio.tipo, nombre: sitio.nombre, url: sitio.url };
  estado.modo = sitio.liveServer ? 'live-server' : interno.modoElegido;
  estado.servidorOk = true;
  estado.avisos = [];
  estado.errores = 0;
  estado.revision = null;
  traductor = new Traductor({ origen: sitio.origen, todo: opciones.todo });
  if (anterior) {
    if (anterior.cerrarEstatico) anterior.cerrarEstatico();
    if (adb && !anterior.reverseYaEstaba && anterior.puerto !== sitio.puerto) await adb.quitarReverse(anterior.puerto);
  }
  contar('ok', sitio.tipo === 'carpeta' ? `Mostrando la carpeta «${sitio.nombre}».` : `Usando tu servidor: ${sitio.url}${sitio.liveServer ? ' (Live Server)' : ''}`);
  vigilarCodigo();
}

// ---------- Celular ----------

async function abrirEnCelular() {
  const r = await adb.shell(`am start -a android.intent.action.VIEW -d '${sitio.url}' com.android.chrome`);
  if (/Error|Exception/.test(r.salida)) {
    contar('error', `No pude abrir Chrome en el celular: ${r.salida}`, [`Abrí Chrome a mano y entrá a ${sitio.url}`]);
    return false;
  }
  return true;
}

// Busca la pestaña del sitio (esperando un poco si se acaba de abrir) y se conecta a su consola.
async function conectarConsola(intentos = 20) {
  for (let i = 0; i < intentos && !interno.cerrando; i++) {
    const pestana = await chrome.buscar(sitio.origen);
    if (pestana) {
      try {
        await chrome.conectar(pestana);
        estado.consola = true;
        // la red simulada dura lo que dura la conexión: al reconectar se vuelve a pedir
        if (estado.red !== 'normal') await chrome.red(estado.red).catch(() => {});
        cambio();
        programarVista();
        return true;
      } catch (error) {
        ui.anotar('INFO', `Conexión con la pestaña: ${error.message}`);
      }
    }
    await espera(500);
  }
  return false;
}

// Túnel del puerto del sitio, pestaña abierta y consola conectada.
async function llevarSitioAlCelular() {
  sitio.reverseYaEstaba = await adb.reverse(sitio.puerto);
  if (!(await chrome.buscar(sitio.origen))) await abrirEnCelular();
  else ui.info('Tu sitio ya estaba abierto en el celular.');
  if (await conectarConsola()) contar('ok', 'Sitio abierto en el celular, con su consola.');
  else { contar('aviso', 'Abrí el sitio, pero todavía no me pude conectar a su consola.', ['Sigo intentando solo.']); reintentarConsola(); }
  estado.pasos.abierto = 'ok';
  cambio();
}

async function datosDelCelular() {
  const [android, chromeInfo] = await Promise.all([
    adb.shell('getprop ro.build.version.release'),
    adb.shell('dumpsys package com.android.chrome | grep versionName')
  ]);
  estado.celular.android = android.salida;
  const version = (chromeInfo.salida.match(/versionName=(\S+)/) || [])[1];
  if (version) estado.celular.navegador = `Chrome ${version}`;
  try {
    estado.celular.pantalla = await chrome.evaluar("innerWidth + ' × ' + innerHeight + ' px, densidad ' + devicePixelRatio");
  } catch { /* sin consola todavía: queda vacío */ }
  cambio();
}

// La vista del celular en el panel: se saca un rato después de cada carga, de a una por vez.
function programarVista() {
  if (!conPanel) return;
  clearTimeout(programarVista.reloj);
  programarVista.reloj = setTimeout(async () => {
    if (sacandoVista || !chrome || !chrome.conectado) return;
    sacandoVista = true;
    try { vistaPng = await chrome.captura(); estado.vista++; cambio(); } catch { /* se intenta en la próxima carga */ }
    sacandoVista = false;
  }, 900);
}

// Si ADB se reinicia llegan dos avisos casi juntos ("se reinició" y "el celular volvió"): sin esto, cada
// uno abría su propio túnel a Chrome y uno quedaba suelto al salir. Corre una sola reconexión a la vez.
let rearmando = null;
function rearmar() {
  if (!rearmando) rearmando = rearmarAhora().finally(() => { rearmando = null; });
  return rearmando;
}

async function rearmarAhora() {
  try {
    // el túnel se perdió con la desconexión: se vuelve a armar, sin olvidar si era de otro programa
    await adb.reverse(sitio.puerto);
    const anterior = puertoDevtools;
    puertoDevtools = await adb.forwardChrome();
    chrome.puerto = puertoDevtools;
    if (anterior) await adb.quitarForward(anterior);
    if (!(await chrome.buscar(sitio.origen))) await abrirEnCelular();
    if (await conectarConsola()) contar('ok', 'Celular reconectado, con su consola.');
    else contar('aviso', 'Celular reconectado, pero no encuentro la pestaña del sitio.', ['Tocá «Abrir de nuevo en el celular».']);
    cambio();
  } catch (error) {
    contar('error', `No pude rearmar la conexión: ${error.message}`, ['Desconectá y volvé a conectar el cable.']);
  }
}

function reintentarConsola() {
  clearInterval(relojReconexion);
  relojReconexion = setInterval(async () => {
    if (interno.cerrando || estado.pasos.celular !== 'ok' || chrome.conectado) return;
    if (!(await chrome.buscar(sitio.origen))) return;
    if (await conectarConsola(1)) {
      clearInterval(relojReconexion);
      contar('ok', 'Consola del celular conectada de nuevo.');
    }
  }, 2000);
}

// ---------- Acciones (botones del panel y teclas) ----------

async function recargar(motivo = '') {
  if (estado.fase !== 'corriendo') return { error: 'Todavía no está todo listo para recargar.' };
  if (!estado.servidorOk) { contar('aviso', 'No recargo el celular porque tu servidor está apagado.'); return { error: 'Tu servidor está apagado.' }; }
  if (!chrome.conectado && !(await conectarConsola(4))) {
    contar('error', 'No encuentro la pestaña del sitio en el celular.', ['La vuelvo a abrir.']);
    if (await abrirEnCelular()) await conectarConsola();
    return { mensaje: 'Abrí el sitio de nuevo en el celular.' };
  }
  try {
    await chrome.recargar();
    estado.recargas++;
    contar('ok', `Celular recargado${motivo}.`);
    return { mensaje: 'Celular recargado' };
  } catch (error) {
    contar('error', `No pude recargar el celular: ${error.message}.`);
    return { error: 'No pude recargar el celular.' };
  }
}

async function capturar() {
  if (!chrome || !chrome.conectado) return { error: 'No hay conexión con la pestaña del celular.' };
  try {
    const imagen = await chrome.captura();
    vistaPng = imagen;
    estado.vista++;
    const carpeta = join(carpetaPropia, 'capturas');
    mkdirSync(carpeta, { recursive: true });
    const d = new Date();
    const archivo = join(carpeta, `${ui.fecha(d)}_${ui.hora(d).replace(/:/g, '-')}.png`);
    writeFileSync(archivo, imagen);
    const ruta = mostrar(archivo);
    interno.capturas.unshift(archivo);
    contar('ok', `Captura guardada: ${ruta}`);
    return { mensaje: `Captura guardada en ${ruta}` };
  } catch (error) {
    contar('error', `No pude sacar la captura: ${error.message}`);
    return { error: 'No pude sacar la captura.' };
  }
}

function cambiarModo() {
  if (estado.modo === 'live-server') return { mensaje: 'Live Server ya recarga la página solo al guardar.' };
  estado.modo = interno.modoElegido = estado.modo === 'vivo' ? 'manual' : 'vivo';
  contar('ok', estado.modo === 'vivo' ? 'Modo en vivo: el celular se recarga cada vez que guardás.' : 'Modo manual: recargás vos.');
  return { mensaje: estado.modo === 'vivo' ? 'Modo en vivo' : 'Modo manual' };
}

// Revisión del sitio en el celular: desbordes, botones chicos, contraste, imágenes, tiempos.
async function revisarSitio() {
  if (estado.fase !== 'corriendo') return { error: 'Todavía no está todo listo.' };
  if (!chrome.conectado && !(await conectarConsola(4))) return { error: 'No hay conexión con la pestaña del celular.' };
  if (estado.revisando) return { mensaje: 'Ya estoy revisando…' };
  estado.revisando = true;
  cambio();
  try {
    const puntos = evaluar(await revisar(chrome));
    estado.revision = { hora: ui.hora(), red: estado.red, puntos };
    const problemas = puntos.filter(p => p.nivel !== 'ok');
    contar(problemas.length ? 'aviso' : 'ok', problemas.length
      ? `Revisión del sitio: ${problemas.length} ${problemas.length === 1 ? 'cosa para mejorar' : 'cosas para mejorar'}.`
      : 'Revisión del sitio: todo bien.');
    for (const p of problemas) ui.delCelular(p.nivel, p.simple, p.ejemplos.join(' · ') || p.simple, '');
    return { mensaje: problemas.length ? `${problemas.length} cosas para mejorar` : 'Todo bien' };
  } catch (error) {
    contar('error', `No pude revisar el sitio: ${error.message}`);
    return { error: 'No pude revisar el sitio.' };
  } finally {
    estado.revisando = false;
    cambio();
  }
}

// Simula una red en el celular y recarga, para ver cómo carga el sitio con esa conexión.
async function cambiarRed(perfil) {
  if (!REDES[perfil]) perfil = Object.keys(REDES)[(Object.keys(REDES).indexOf(estado.red) + 1) % 3];
  if (estado.fase !== 'corriendo') return { error: 'Todavía no está todo listo.' };
  if (!chrome.conectado && !(await conectarConsola(4))) return { error: 'No hay conexión con la pestaña del celular.' };
  try {
    await chrome.red(perfil);
    estado.red = perfil;
    contar(perfil === 'normal' ? 'ok' : 'aviso', perfil === 'normal'
      ? 'Red normal otra vez.'
      : `Simulando red ${REDES[perfil]} en el celular. Se vuelve a la normal al cerrar celular-dev.`);
    await recargar();
    return { mensaje: `Red: ${REDES[perfil]}` };
  } catch (error) {
    contar('error', `No pude cambiar la red: ${error.message}`);
    return { error: 'No pude cambiar la red.' };
  }
}

// Abre en el editor el archivo y la línea de un error del celular.
async function abrirCodigo(id) {
  const aviso = estado.avisos.find(a => a.id === id);
  if (!aviso || !aviso.donde) return { error: 'Ese error no dice en qué archivo pasó.' };
  if (!sitio.carpeta) return { error: 'Primero elegí la carpeta del código (el botón amarillo de arriba).' };
  const lugar = ubicar(aviso.donde, sitio.carpeta, sitio.ruta);
  if (!lugar) return { error: `No encontré ${aviso.donde.replace(/:\d+(:\d+)?$/, '')} en tu carpeta del código.` };
  const como = await abrirEnEditor(lugar);
  ui.info(`Abriendo ${mostrar(lugar.archivo)}, línea ${lugar.linea}${como === 'vscode' ? ' en Visual Studio Code' : ''}.`);
  return { mensaje: `Abriendo ${basename(lugar.archivo)}, línea ${lugar.linea}` };
}

function generarInforme() {
  const d = new Date();
  const texto = armarInforme({
    sitio: { descripcion: sitio ? `${sitio.nombre} (${sitio.url})` : 'sin elegir' },
    celular: estado.celular,
    errores: estado.avisos,
    revision: estado.revision,
    red: REDES[estado.red],
    capturas: interno.capturas,
    fecha: `${ui.fecha(d)} ${ui.hora(d)}`
  });
  mkdirSync(carpetaPropia, { recursive: true });
  const archivo = join(carpetaPropia, `informe-${ui.fecha(d)}_${ui.hora(d).replace(/:/g, '-')}.md`);
  writeFileSync(archivo, texto);
  const ruta = mostrar(archivo);
  contar('ok', `Informe para IA guardado: ${ruta}`);
  return { texto, archivo: ruta };
}

// Baja ADB de Google a la carpeta propia de celular-dev (sin winget ni permisos de administrador).
// El arranque, que espera a que haya ADB, lo encuentra solo apenas termina.
function instalarAdb() {
  if (typeof estado.descargaAdb === 'number') return { mensaje: 'Ya lo estoy descargando…' };
  estado.descargaAdb = 0;
  contar('info', 'Descargando ADB de Google (unos 7 MB)…');
  descargarAdb(porcentaje => { estado.descargaAdb = porcentaje; cambio(); })
    .then(ruta => { estado.descargaAdb = null; contar('ok', `ADB descargado en ${mostrar(ruta)}.`); })
    .catch(error => {
      estado.descargaAdb = 'error';
      contar('error', `No pude descargar ADB: ${error.message}`, ['Revisá la conexión a internet y probá de nuevo.']);
    });
  return { mensaje: 'Descargando ADB…' };
}

async function crearLosAccesos() {
  try {
    const rutas = await crearAccesos();
    estado.ofrecerAccesos = false;
    guardarPreferencia('accesosOfrecidos', true);
    contar('ok', `Accesos directos creados: ${rutas.map(mostrar).join(' y ')}.`);
    return { mensaje: 'Listo: celular-dev está en tu Escritorio y en el menú Inicio.' };
  } catch (error) {
    contar('error', `No pude crear los accesos directos: ${error.message}`);
    return { error: 'No pude crear los accesos directos.' };
  }
}

function abrirInspect() {
  const destino = 'chrome://inspect/#devices';
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', 'chrome', destino], { stdio: 'ignore', windowsHide: true });
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', ['-a', 'Google Chrome', destino], { stdio: 'ignore' });
  ui.info(`Abriendo ${destino} en el Chrome de la PC: tocá "inspect" debajo de tu sitio.`);
}

// Cambiar qué se muestra con todo andando: se vuelve al inicio y se lleva el nuevo sitio al celular.
async function cambiarSitio() {
  const nuevo = await elegirEnPanel();
  await aplicarSitio(nuevo);
  estado.fase = 'corriendo';
  estado.consola = false;
  chrome.cerrar();
  await llevarSitioAlCelular();
}

async function elegir(obtener) {
  if (!alElegirSitio) return { error: 'Ahora no se está eligiendo qué mostrar.' };
  const nuevo = await obtener();
  alElegirSitio(nuevo);
  return { mensaje: `Listo: ${nuevo.nombre}` };
}

async function alAccion(accion, valor) {
  switch (accion) {
    case 'usar-servidor': {
      const s = estado.opciones.servidores[parseInt(valor, 10)];
      if (!s) return { error: 'Ese servidor ya no está prendido.' };
      return elegir(async () => sitioDeServidor(s));
    }
    case 'usar-carpeta': return elegir(() => sitioDeCarpeta(carpetaProyecto));
    case 'usar-reciente': {
      const r = estado.opciones.recientes[parseInt(valor, 10)];
      if (!r) return { error: 'Esa carpeta ya no está.' };
      return elegir(() => sitioDeCarpeta(r.ruta));
    }
    case 'elegir-carpeta': {
      const ruta = await elegirCarpeta();
      if (!ruta) return { mensaje: 'No elegiste ninguna carpeta.' };
      return elegir(() => sitioDeCarpeta(ruta));
    }
    case 'elegir-codigo': {
      if (!sitio || sitio.tipo !== 'servidor') return { error: 'Solo hace falta con un servidor.' };
      const ruta = await elegirCarpeta('Elegí la carpeta del código de tu sitio (la que editás)');
      if (!ruta) return { mensaje: 'No elegiste ninguna carpeta.' };
      sitio.carpeta = ruta;
      recordarCodigo(sitio.puerto, ruta);
      vigilarCodigo();
      contar('ok', `Listo: al guardar en «${basename(ruta)}» se recarga el celular. Lo recuerdo para la próxima vez.`);
      return { mensaje: `Vigilando «${basename(ruta)}»` };
    }
    case 'abrir-datos':
      if (process.platform === 'win32') spawn('explorer', [carpetaPropia], { stdio: 'ignore' });
      else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [carpetaPropia], { stdio: 'ignore' });
      return { mensaje: 'Abriendo la carpeta de capturas e informes.' };
    case 'cambiar-sitio':
      if (estado.fase !== 'corriendo') return { error: 'Primero tiene que estar todo andando.' };
      cambiarSitio().catch(error => contar('error', `No pude cambiar el sitio: ${error.message}`));
      return {};
    case 'recargar': return recargar(' (a mano)');
    case 'revisar': return revisarSitio();
    case 'red': return cambiarRed(valor);
    case 'abrir-codigo': return abrirCodigo(valor);
    case 'captura': return capturar();
    case 'modo': return cambiarModo();
    case 'informe': return generarInforme();
    case 'abrir':
      if (estado.fase !== 'corriendo') return { error: 'Todavía no está todo listo.' };
      if (await abrirEnCelular()) await conectarConsola();
      return { mensaje: 'Abierto de nuevo en el celular.' };
    case 'limpiar':
      estado.avisos = []; estado.errores = 0; interno.impreso.clear(); cambio();
      return { mensaje: 'Lista de errores limpia.' };
    case 'instalar-adb': return instalarAdb();
    case 'crear-accesos': return crearLosAccesos();
    case 'no-accesos':
      estado.ofrecerAccesos = false;
      guardarPreferencia('accesosOfrecidos', true);
      cambio();
      return { mensaje: 'Listo, no te lo vuelvo a ofrecer.' };
    case 'salir':
      // se contesta primero, y un instante después se cierra todo
      setTimeout(() => salir(0), 300);
      return { mensaje: 'Cerrando celular-dev…' };
    default: return { error: `Acción desconocida: ${accion}` };
  }
}

// ---------- Teclas ----------

function escucharTeclas() {
  const acciones = {
    r: () => recargar(' (a mano)'), m: cambiarModo, f: capturar, a: () => alAccion('abrir'),
    v: revisarSitio, n: () => cambiarRed(),
    p: () => abrirNavegador(panel.url), i: abrirInspect, q: () => salir(0),
    l: () => { console.clear(); if (estado.fase === 'corriendo') mostrarResumen(); },
    h: () => ui.renglon(`     Teclas:   ${TECLAS}`, 'gris'),
    s: () => { const s = estado.opciones.servidores[0]; if (alElegirSitio && s) return elegir(async () => sitioDeServidor(s)); },
    c: () => { if (alElegirSitio && estado.opciones.carpeta.tieneSitio) return elegir(() => sitioDeCarpeta(carpetaProyecto)); }
  };
  const atender = tecla => {
    if (tecla === '\u0003') return salir(0);   // Ctrl+C
    const accion = acciones[tecla.toLowerCase()];
    if (accion) Promise.resolve(accion()).then(r => { if (r && r.error) ui.falla(r.error); }).catch(error => ui.falla(error.message));
  };
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', atender);
  } else {
    // sin terminal (por ejemplo, desde otro programa): cada renglón que llega es una tecla
    createInterface({ input: process.stdin }).on('line', linea => linea.trim() && atender(linea.trim()[0]));
  }
}

function mostrarResumen() {
  ui.cartel('CORRIENDO: ya podés ver tu sitio en el celular', 'verde');
  ui.renglon(`     Sitio:    ${sitio.url}${sitio.tipo === 'carpeta' ? `  (carpeta ${sitio.carpeta})` : ''}`);
  ui.renglon(`     Celular:  ${estado.celular.modelo}${estado.celular.android ? `, Android ${estado.celular.android}` : ''}`);
  ui.renglon(`     Recarga:  ${estado.modo === 'live-server' ? 'la hace Live Server' : estado.modo === 'vivo' ? 'en vivo, al guardar' : 'manual'}`);
  if (conPanel) ui.renglon(`     Panel:    ${panel.url}`);
  console.log('');
  ui.renglon(`     Teclas:   ${TECLAS}`, 'gris');
  console.log('');
}

// ---------- Salir ----------

async function salir(codigo) {
  if (interno.cerrando) return;
  interno.cerrando = true;
  clearInterval(relojServidor);
  clearInterval(relojReconexion);
  clearInterval(relojOpciones);
  if (dejarDeVigilar) dejarDeVigilar();
  if (chrome) chrome.cerrar();
  if (adb) {
    adb.cerrar();
    if (puertoDevtools) await adb.quitarForward(puertoDevtools);
    // el túnel se deja si ya estaba antes: puede ser de otro programa
    if (sitio && !sitio.reverseYaEstaba) await adb.quitarReverse(sitio.puerto);
  }
  if (sitio && sitio.cerrarEstatico) sitio.cerrarEstatico();
  if (panel) panel.cerrar();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  const minutos = Math.round((Date.now() - interno.inicio) / 60000);
  const resumen = `Terminado. Estuvo ${minutos} min, con ${estado.recargas} recargas y ${estado.errores} errores del celular.`;
  console.log('');
  ui.renglon(`  ${resumen}`, 'gris');
  ui.anotar('FIN', resumen);
  ui.titulo('Celular: DETENIDO');
  process.exit(codigo);
}

process.on('SIGINT', () => salir(0));
process.on('SIGTERM', () => salir(0));
process.on('uncaughtException', error => {
  ui.falla(`Algo salió mal: ${error.message}`, ['Cerrá esta ventana y volvé a abrirlo.', `Si se repite, mandá ${join('.celular', 'registro.log')} a quien te ayuda.`]);
  ui.anotar('ERROR', error.stack || String(error));
  salir(1);
});

// ---------- Arranque ----------

async function principal() {
  ui.iniciarRegistro(carpetaPropia);
  ui.cartel('celular-dev: tu sitio en tu celular Android');

  // el panel también hace de candado: si su puerto está ocupado, ya hay otra copia corriendo
  panel = await iniciarPanel({ obtenerEstado: () => estado, alAccion, obtenerVista: () => vistaPng });
  if (!panel) {
    ui.falla('Ya hay otra copia de celular-dev abierta.', ['Te abro su panel. Si querés empezar de nuevo, cerrá esa ventana primero.']);
    abrirNavegador(`http://localhost:${PUERTO_PANEL}/`);
    process.exit(1);
  }
  // CELULAR_NO_ABRIR=1: el panel funciona igual, pero no se abre solo (para pruebas automáticas)
  if (conPanel && !process.env.CELULAR_NO_ABRIR) { abrirNavegador(panel.url); ui.info(`Panel abierto en el navegador: ${panel.url}`); }
  // la primera vez, el panel ofrece crear los accesos directos (si todavía no están)
  if (conPanel && process.platform === 'win32' && !preferencia('accesosOfrecidos')) {
    hayAccesos().then(hay => { estado.ofrecerAccesos = !hay; cambio(); }).catch(() => {});
  }
  else if (conPanel) ui.info(`Panel en ${panel.url}`);
  escucharTeclas();
  cambio();

  ui.paso(1, 4, 'Buscar ADB (la herramienta que habla con el celular)');
  let rutaAdb = buscarAdb();
  if (!rutaAdb) {
    estado.pasos.adb = 'falta';
    cambio();
    ui.falla('No encontré ADB en esta PC.', [
      process.platform === 'win32' ? 'Instalalo con el botón del panel, o con:  winget install Google.PlatformTools' : 'Instalá "Android SDK Platform-Tools" (por ejemplo: brew install android-platform-tools).',
      'Apenas esté instalado, sigo solo.'
    ]);
    while (!rutaAdb && !interno.cerrando) { await espera(3000); rutaAdb = buscarAdb(); }
  }
  adb = new Adb(rutaAdb);
  if (!(await adb.prender())) ui.aviso('El servicio de ADB tardó en prender. Sigo intentando.');
  estado.pasos.adb = 'ok';
  contar('ok', 'ADB encontrado.');

  // se vigila el celular desde ya: así el asistente muestra su estado mientras se elige qué mostrar
  adb.on('estado', e => {
    if (interno.cerrando) return;
    const antes = estado.pasos.celular;
    estado.pasos.celular = e === 'device' ? 'ok' : e;
    cambio();
    if (estado.fase !== 'corriendo') return;
    if (e !== 'device' && antes === 'ok') {
      contar('error', 'Se desconectó el celular.', ['Volvé a conectar el cable: apenas lo detecte, rearmo todo solo.']);
      chrome.cerrar();
      estado.consola = false;
    } else if (e === 'device' && antes !== 'ok') {
      rearmar();
    }
  });
  adb.on('reinicio', () => {
    if (interno.cerrando || estado.fase !== 'corriendo') return;
    contar('info', 'ADB se reinició (lo cerró otro programa): rearmo la conexión con el celular.');
    rearmar();
  });
  adb.vigilar();

  ui.paso(2, 4, 'Elegir qué mostrar');
  await aplicarSitio(await obtenerSitio());

  ui.paso(3, 4, 'Conectar el celular');
  estado.fase = 'preparando';
  cambio();
  await adb.esperarListo(explicarCelular);
  estado.pasos.celular = 'ok';
  estado.celular.modelo = (await adb.shell('getprop ro.product.model')).salida;
  while (!(await adb.shell('pm path com.android.chrome')).salida.includes('package:') && !interno.cerrando) {
    if (estado.pasos.chrome !== 'falta') {
      estado.pasos.chrome = 'falta';
      contar('error', 'El celular no tiene Google Chrome.', ['Instalalo desde Play Store: apenas esté, sigo solo.']);
    }
    await espera(5000);
  }
  estado.pasos.chrome = 'ok';
  try {
    puertoDevtools = await adb.forwardChrome();
  } catch (error) {
    contar('error', error.message, ['Desconectá y volvé a conectar el cable, y abrí de nuevo celular-dev.']);
    return;
  }
  contar('ok', `Celular conectado: ${estado.celular.modelo}`);

  ui.paso(4, 4, 'Abrir tu sitio en el celular');
  chrome = new Chrome(puertoDevtools);
  chrome.on('evento', (metodo, params) => {
    const t = traductor.traducir(metodo, params);
    if (!t) return;
    if (t.tipo === 'carga') { programarVista(); return; }
    registrarAviso(t);
  });
  chrome.on('cerrada', () => {
    estado.consola = false;
    cambio();
    if (interno.cerrando || estado.pasos.celular !== 'ok') return;
    contar('aviso', 'Se perdió la conexión con la pestaña del celular (¿la cerraste?).', ['Me reconecto solo cuando vuelva a estar abierta.']);
    reintentarConsola();
  });
  await llevarSitioAlCelular();
  await datosDelCelular();

  // ---------- Corriendo ----------

  relojServidor = setInterval(async () => {
    if (estado.fase !== 'corriendo' || !sitio) return;
    const vivo = await puertoAbierto(sitio.puerto);
    if (estado.servidorOk && !vivo) {
      estado.servidorOk = false;
      contar('error', `Tu servidor dejó de responder (${sitio.url}).`, ['Fijate si se cortó en tu editor y volvé a prenderlo. Cuando vuelva, sigo solo.']);
    } else if (!estado.servidorOk && vivo) {
      estado.servidorOk = true;
      contar('ok', 'Tu servidor volvió a responder.');
      // mientras estuvo apagado, el celular quedó mostrando un error: se recarga para ver el sitio
      await recargar();
    }
  }, 3000);

  estado.fase = 'corriendo';
  cambio();
  mostrarResumen();
  ui.anotar('OK', `Corriendo: ${sitio.url}, ${estado.celular.modelo}, modo ${estado.modo}`);
}

principal().catch(error => {
  ui.falla(`Algo salió mal al arrancar: ${error.message}`);
  ui.anotar('ERROR', error.stack || String(error));
  salir(1);
});
