// celular-dev armado: junta el estado, el panel, ADB y el Chrome del celular, y sigue los pasos del
// arranque. Todo lo que habla con afuera (ADB, Chrome, el navegador, las ventanas del sistema, la terminal)
// llega en "deps": el programa usa los de verdad y las pruebas, unos simulados.
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pantalla from '../pantalla.mjs';
import { Adb, buscarAdb } from '../adb.mjs';
import { Chrome } from '../chrome.mjs';
import { detectar, puertoAbierto, PUERTOS_CONOCIDOS } from '../servidor.mjs';
import { elegirCarpeta } from '../carpeta.mjs';
import { iniciarPanel, PUERTO_PANEL } from '../panel.mjs';
import { abrirNavegador, abrirConElSistema } from '../sistema.mjs';
import { descargarAdb } from '../instalar-adb.mjs';
import { hayAccesos } from '../accesos.mjs';
import { carpetaDatos, preferencia, leerConfig } from '../lugares.mjs';
import { buscarCarpeta, raicesDeBusqueda } from '../buscar-carpeta.mjs';
import { t, textosPanel } from '../idioma.mjs';
import { estadoInicial, cambio, contar } from './estado.mjs';
import { obtenerSitio, aplicarSitio } from './sitio.mjs';
import { llevarSitioAlCelular, datosDelCelular, escucharAdb, escucharChrome, explicarCelular } from './conexion.mjs';
import { recargar, alAccion } from './acciones.mjs';
import { espejoInicial, mirarEspejo, alCuadro } from './espejo.mjs';
import { mostrarResumen } from './teclas.mjs';
import { mantenerDespierto, devolverPantalla } from './despierto.mjs';
import { RegistroPedidos } from './pedidos.mjs';
import { apagarServidorPropio } from './arranque.mjs';
import { detectarProyecto, iniciarProyecto } from '../proyecto.mjs';
import { versionActual, buscarVersionPublicada, revisarNovedad } from './novedad.mjs';

const espera = ms => new Promise(r => setTimeout(r, ms));
const carpetaHerramienta = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function crearApp({ opciones = {}, cwd = process.cwd(), deps = {}, tiempos = {}, ui = pantalla } = {}) {
  // la carpeta desde donde se abrió solo cuenta si parece un proyecto: con doble clic en el lanzador se
  // abre desde la carpeta de la herramienta, y ahí no hay nada que mostrar ni que vigilar
  const esProyecto = !resolve(cwd).toLowerCase().startsWith(resolve(carpetaHerramienta, '..').toLowerCase())
    && ['package.json', 'index.html', 'src'].some(f => existsSync(join(cwd, f)));
  const estado = estadoInicial({ carpetaProyecto: cwd, esProyecto, manual: opciones.manual });
  const app = {
    opciones, ui, estado,
    conPanel: !opciones['sin-panel'],
    carpetaProyecto: cwd,
    esProyecto,
    carpetaPropia: carpetaDatos(),
    deps: {
      buscarAdb, crearAdb: ruta => new Adb(ruta), crearChrome: puerto => new Chrome(puerto), iniciarPanel, abrirNavegador,
      abrirConElSistema, elegirCarpeta, descargarAdb, hayAccesos, terminar: codigo => process.exit(codigo),
      buscarVersion: buscarVersionPublicada, detectarProyecto, iniciarProyecto,
      buscarCarpeta, raicesBusqueda: () => raicesDeBusqueda(leerConfig().recientes.map(r => dirname(r))),
      servidores: { conocidos: PUERTOS_CONOCIDOS, puertoAbierto, detectar },
      ...deps
    },
    tiempos: { opciones: 3000, servidor: 3000, reintento: 2000, pestana: 500, adb: 3000, chrome: 5000, nitido: 300, frescuraVivo: 8000, frescuraLive: 10000, ...tiempos },
    interno: { cerrando: false, inicio: Date.now(), modoElegido: estado.modo, capturas: [], impreso: new Map(), servidoresVistos: new Map() },
    espejo: espejoInicial(),
    pedidos: new RegistroPedidos(),
    relojes: {},
    adb: null, chrome: null, traductor: null, panel: null, sitio: null, puertoDevtools: 0, ultimaCarga: 0, pantallaReal: null,
    dejarDeVigilar: null, alElegirSitio: null, rearmando: null, conectando: null, arrancando: null, servidorPropio: null, lineasServidor: []
  };
  // la primera vez, el panel le muestra qué hacer con el espejo
  estado.version = versionActual(carpetaHerramienta);
  estado.primerExito = app.conPanel && !preferencia('primerExito');
  app.salir = codigo => salir(app, codigo);
  app.arrancar = () => arrancar(app);
  app.accion = (accion, valor) => alAccion(app, accion, valor);
  return app;
}

async function arrancar(app) {
  const { ui, estado, deps, conPanel } = app;
  ui.iniciarRegistro(app.carpetaPropia);
  ui.cartel(t('arranque.cartel'));

  // el panel también hace de candado: si su puerto está ocupado, ya hay otra copia corriendo
  app.panel = await deps.iniciarPanel({
    obtenerEstado: () => estado,
    obtenerTextos: textosPanel,
    alAccion: app.accion,
    alEspejo: (pedido, respuesta) => mirarEspejo(app, pedido, respuesta)
  });
  if (!app.panel) {
    ui.falla(t('arranque.otraCopia'), [t('arranque.otraCopiaSolucion')]);
    deps.abrirNavegador(`http://localhost:${PUERTO_PANEL}/`);
    return deps.terminar(1);
  }
  // CELULAR_NO_ABRIR=1: el panel funciona igual, pero no se abre solo (para pruebas automáticas)
  if (conPanel && !process.env.CELULAR_NO_ABRIR) { deps.abrirNavegador(app.panel.url); ui.info(t('arranque.panelAbierto', { url: app.panel.url })); }
  else if (conPanel) ui.info(t('arranque.panelEn', { url: app.panel.url }));
  // la primera vez, el panel ofrece crear los accesos directos (si todavía no están)
  if (conPanel && !preferencia('accesosOfrecidos')) {
    deps.hayAccesos().then(hay => { estado.ofrecerAccesos = !hay; cambio(app); }).catch(() => {});
  }
  cambio(app);

  ui.paso(1, 4, t('paso.adb'));
  let rutaAdb = deps.buscarAdb();
  if (!rutaAdb) {
    estado.pasos.adb = 'falta';
    cambio(app);
    ui.falla(t('arranque.sinAdb'), [t('arranque.sinAdbSolucion'), t('arranque.sigoSolo')]);
    while (!rutaAdb && !app.interno.cerrando) { await espera(app.tiempos.adb); rutaAdb = deps.buscarAdb(); }
    if (app.interno.cerrando) return;
  }
  app.adb = deps.crearAdb(rutaAdb);
  // con varios celulares conectados: --celular <serie> (o ANDROID_SERIAL, como el propio adb) dice cuál
  const serie = app.opciones.celular || process.env.ANDROID_SERIAL;
  if (serie) app.adb.serie = serie;
  if (!(await app.adb.prender())) ui.aviso(t('arranque.adbTarda'));
  estado.pasos.adb = 'ok';
  contar(app, 'ok', t('arranque.adbOk'));

  // se vigila el celular desde ya: así el asistente muestra su estado mientras se elige qué mostrar
  escucharAdb(app);
  app.adb.vigilar();

  ui.paso(2, 4, t('paso.sitio'));
  const elegido = await obtenerSitio(app);
  if (!elegido || app.interno.cerrando) return;
  await aplicarSitio(app, elegido);

  ui.paso(3, 4, t('paso.celular'));
  estado.fase = 'preparando';
  cambio(app);
  await app.adb.esperarListo(e => explicarCelular(app, e));
  estado.pasos.celular = 'ok';
  estado.celular.modelo = (await app.adb.shell('getprop ro.product.model')).salida;
  while (!(await app.adb.shell('pm path com.android.chrome')).salida.includes('package:') && !app.interno.cerrando) {
    if (estado.pasos.chrome !== 'falta') {
      estado.pasos.chrome = 'falta';
      contar(app, 'error', t('arranque.sinChrome'), [t('arranque.sinChromeSolucion')]);
    }
    await espera(app.tiempos.chrome);
  }
  estado.pasos.chrome = 'ok';
  try {
    app.puertoDevtools = await app.adb.forwardChrome();
  } catch (error) {
    contar(app, 'error', error.message, [t('arranque.forwardSolucion')]);
    return;
  }
  contar(app, 'ok', t('arranque.celularConectado', { modelo: estado.celular.modelo }));
  await mantenerDespierto(app);

  ui.paso(4, 4, t('paso.abrir'));
  app.chrome = deps.crearChrome(app.puertoDevtools);
  escucharChrome(app, cuadro => alCuadro(app, cuadro));
  await llevarSitioAlCelular(app);
  await datosDelCelular(app);

  // ---------- Corriendo ----------

  app.relojes.servidor = setInterval(async () => {
    if (estado.fase !== 'corriendo' || !app.sitio) return;
    const vivo = await deps.servidores.puertoAbierto(app.sitio.puerto);
    if (estado.servidorOk && !vivo) {
      estado.servidorOk = false;
      contar(app, 'error', t('arranque.servidorCaido', { url: app.sitio.url }), [t('arranque.servidorCaidoSolucion')]);
    } else if (!estado.servidorOk && vivo) {
      estado.servidorOk = true;
      contar(app, 'ok', t('arranque.servidorVolvio'));
      // mientras estuvo apagado, el celular quedó mostrando un error: se recarga para ver el sitio
      await recargar(app);
    }
  }, app.tiempos.servidor);

  estado.fase = 'corriendo';
  cambio(app);
  mostrarResumen(app);
  revisarNovedad(app, estado.version);
  ui.anotar('OK', `Corriendo: ${app.sitio.url}, ${estado.celular.modelo}, modo ${estado.modo}`);
}

async function salir(app, codigo) {
  const { interno, adb, sitio, ui, estado } = app;
  if (interno.cerrando) return;
  interno.cerrando = true;
  for (const reloj of Object.values(app.relojes)) clearInterval(reloj);
  if (app.dejarDeVigilar) app.dejarDeVigilar();
  if (app.alElegirSitio) app.alElegirSitio(null);
  for (const c of app.espejo.clientes.keys()) c.end();
  if (app.chrome) app.chrome.cerrar();
  // el servidor que prendió celular-dev se apaga con él (el que ya estaba prendido de antes no se toca)
  await apagarServidorPropio(app).catch(() => {});
  if (adb) {
    await devolverPantalla(app);
    adb.cerrar();
    if (app.puertoDevtools) await adb.quitarForward(app.puertoDevtools);
    // el túnel se deja si ya estaba antes: puede ser de otro programa
    if (sitio && !sitio.reverseYaEstaba) await adb.quitarReverse(sitio.puerto);
  }
  if (sitio && sitio.cerrarEstatico) sitio.cerrarEstatico();
  if (app.panel) app.panel.cerrar();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  const minutos = Math.round((Date.now() - interno.inicio) / 60000);
  const resumen = t('salir.resumen', { minutos, recargas: estado.recargas, errores: estado.errores });
  ui.renglon('');
  ui.renglon(`  ${resumen}`, 'gris');
  ui.anotar('FIN', resumen);
  ui.titulo(t('salir.titulo'));
  return app.deps.terminar(codigo);
}
