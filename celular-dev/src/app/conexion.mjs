// La conexión con el celular: abrir el sitio en su Chrome, conectarse a la consola de la pestaña y
// rearmar todo cuando el celular se desconecta o ADB se reinicia.
import { t } from '../idioma.mjs';
import { cambio, contar, registrarAviso } from './estado.mjs';
import { reanudarEspejo } from './espejo.mjs';

const espera = ms => new Promise(r => setTimeout(r, ms));

export async function abrirEnCelular(app) {
  const { sitio } = app;
  const r = await app.adb.shell(`am start -a android.intent.action.VIEW -d '${sitio.url}' com.android.chrome`);
  if (/Error|Exception/.test(r.salida)) {
    contar(app, 'error', t('celular.noAbreChrome', { detalle: r.salida }), [t('celular.noAbreChromeSolucion', { url: sitio.url })]);
    return false;
  }
  return true;
}

// La dirección que tiene abierta el celular, para mostrarla en el panel.
function recordarPagina(app, url) {
  if (!url || url === app.estado.celular.url) return;
  app.estado.celular.url = url;
  cambio(app);
}

// Busca la pestaña del sitio (esperando un poco si se acaba de abrir) y se conecta a su consola.
export async function conectarConsola(app, intentos = 20) {
  const { estado, chrome } = app;
  for (let i = 0; i < intentos && !app.interno.cerrando; i++) {
    const pestana = await chrome.buscar(app.sitio.origen);
    if (pestana) {
      try {
        await chrome.conectar(pestana);
        estado.consola = true;
        recordarPagina(app, pestana.url);
        // la red simulada dura lo que dura la conexión: al reconectar se vuelve a pedir
        if (estado.red !== 'normal') await chrome.red(estado.red).catch(() => {});
        cambio(app);
        reanudarEspejo(app);
        return true;
      } catch (error) {
        app.ui.anotar('INFO', `Conexión con la pestaña: ${error.message}`);
      }
    }
    await espera(app.tiempos.pestana);
  }
  return false;
}

// Túnel del puerto del sitio, pestaña abierta y consola conectada.
export async function llevarSitioAlCelular(app) {
  const { sitio, chrome } = app;
  sitio.reverseYaEstaba = await app.adb.reverse(sitio.puerto);
  if (!(await chrome.buscar(sitio.origen))) await abrirEnCelular(app);
  else app.ui.info(t('celular.yaEstabaAbierto'));
  if (await conectarConsola(app)) contar(app, 'ok', t('celular.abierto'));
  else { contar(app, 'aviso', t('celular.sinConsola'), [t('celular.sigoIntentando')]); reintentarConsola(app); }
  app.estado.pasos.abierto = 'ok';
  cambio(app);
}

export async function datosDelCelular(app) {
  const { estado } = app;
  const [android, chromeInfo] = await Promise.all([
    app.adb.shell('getprop ro.build.version.release'),
    app.adb.shell('dumpsys package com.android.chrome | grep versionName')
  ]);
  estado.celular.android = android.salida;
  const version = (chromeInfo.salida.match(/versionName=(\S+)/) || [])[1];
  if (version) estado.celular.navegador = `Chrome ${version}`;
  try {
    estado.celular.pantalla = await app.chrome.evaluar(`innerWidth + ' × ' + innerHeight + ' px, ${t('celular.densidad')} ' + devicePixelRatio`);
  } catch { /* sin consola todavía: queda vacío */ }
  cambio(app);
}

// Si ADB se reinicia llegan dos avisos casi juntos ("se reinició" y "el celular volvió"): sin esto, cada
// uno abría su propio túnel a Chrome y uno quedaba suelto al salir. Corre una sola reconexión a la vez.
export function rearmar(app) {
  if (!app.rearmando) app.rearmando = rearmarAhora(app).finally(() => { app.rearmando = null; });
  return app.rearmando;
}

async function rearmarAhora(app) {
  const { adb, chrome, sitio } = app;
  try {
    // el túnel se perdió con la desconexión: se vuelve a armar, sin olvidar si era de otro programa
    await adb.reverse(sitio.puerto);
    const anterior = app.puertoDevtools;
    app.puertoDevtools = await adb.forwardChrome();
    chrome.puerto = app.puertoDevtools;
    if (anterior) await adb.quitarForward(anterior);
    if (!(await chrome.buscar(sitio.origen))) await abrirEnCelular(app);
    if (await conectarConsola(app)) contar(app, 'ok', t('celular.reconectado'));
    else contar(app, 'aviso', t('celular.reconectadoSinPestana'), [t('celular.tocaAbrirDeNuevo')]);
    cambio(app);
  } catch (error) {
    contar(app, 'error', t('celular.noRearma', { detalle: error.message }), [t('celular.reconectaCable')]);
  }
}

export function reintentarConsola(app) {
  clearInterval(app.relojes.reconexion);
  app.relojes.reconexion = setInterval(async () => {
    if (app.interno.cerrando || app.estado.pasos.celular !== 'ok' || app.chrome.conectado) return;
    if (!(await app.chrome.buscar(app.sitio.origen))) return;
    if (await conectarConsola(app, 1)) {
      clearInterval(app.relojes.reconexion);
      contar(app, 'ok', t('celular.consolaDeNuevo'));
    }
  }, app.tiempos.reintento);
}

// Lo que cuenta el Chrome del celular: errores y consola van a la lista; la pantalla, al espejo.
export function escucharChrome(app, alCuadro) {
  const { chrome } = app;
  chrome.on('evento', (metodo, params) => {
    // la página que tiene abierta el celular: cambia al navegar, y también al cambiar el # o con pushState
    if (metodo === 'Page.frameNavigated' && params.frame && !params.frame.parentId) recordarPagina(app, params.frame.url + (params.frame.urlFragment || ''));
    else if (metodo === 'Page.navigatedWithinDocument') recordarPagina(app, params.url);
    const aviso = app.traductor.traducir(metodo, params);
    if (!aviso || aviso.tipo === 'carga') return;
    registrarAviso(app, aviso);
  });
  chrome.on('cuadro', alCuadro);
  chrome.on('cerrada', () => {
    app.estado.consola = false;
    app.estado.espejo = false;
    app.espejo.activo = false;
    cambio(app);
    if (app.interno.cerrando || app.estado.pasos.celular !== 'ok') return;
    contar(app, 'aviso', t('celular.perdiPestana'), [t('celular.meReconecto')]);
    reintentarConsola(app);
  });
}

// El celular se conecta o se desconecta (por el cable, o porque ADB se reinició).
export function escucharAdb(app) {
  const { adb, estado } = app;
  adb.on('estado', e => {
    if (app.interno.cerrando) return;
    const antes = estado.pasos.celular;
    estado.pasos.celular = e === 'device' ? 'ok' : e;
    cambio(app);
    if (estado.fase !== 'corriendo') return;
    if (e !== 'device' && antes === 'ok') {
      contar(app, 'error', t('celular.desconectado'), [t('celular.desconectadoSolucion')]);
      app.chrome.cerrar();
      estado.consola = false;
    } else if (e === 'device' && antes !== 'ok') {
      rearmar(app);
    }
  });
  adb.on('reinicio', () => {
    if (app.interno.cerrando || estado.fase !== 'corriendo') return;
    contar(app, 'info', t('celular.adbReinicio'));
    rearmar(app);
  });
}

// Mientras se espera el celular, la terminal explica qué falta.
export function explicarCelular(app, e) {
  const { ui } = app;
  app.estado.pasos.celular = e === 'device' ? 'ok' : e;
  cambio(app);
  if (e === 'sin-celular') ui.aviso(t('celular.noVeo'), [t('celular.noVeoCable'), t('celular.noVeoDepuracion')]);
  else if (e === 'unauthorized') ui.aviso(t('celular.sinPermitir'), [t('celular.sinPermitirSolucion')]);
  else if (e === 'sin-permiso') ui.aviso(t('celular.sinPermisoLinux'), [t('celular.sinPermisoLinuxSolucion')]);
  else if (e !== 'desconocido') ui.aviso(t('celular.raro', { estado: e }), [t('celular.reconectaCable')]);
}
