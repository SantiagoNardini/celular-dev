// El programa entero, de punta a punta, con un celular simulado (test/simulados.mjs): arrancar, abrir el
// sitio, errores, recargar al guardar, desconexiones, el espejo, el panel, el idioma y salir limpio.
// Lo demás es de verdad: el panel, el servidor de la carpeta, el vigía de archivos y lo que se recuerda.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { AdbSimulado, ChromeSimulado, uiCallada, hasta } from './simulados.mjs';
import { puertoAbierto, detectar } from '../src/servidor.mjs';
import { detectarProyecto as detectarReal } from '../src/proyecto.mjs';

// un puerto propio para el panel y una carpeta de datos de prueba: así no se toca una copia abierta
// de celular-dev ni lo que recuerda la de verdad
process.env.CELULAR_PUERTO_PANEL = '47898';
process.env.CELULAR_NO_ABRIR = '1';
const temporal = mkdtempSync(join(tmpdir(), 'celular-flujo-'));
process.env.CELULAR_DATOS = join(temporal, 'datos');
const { crearApp } = await import('../src/app/index.mjs');
const { elegirIdioma, textosPanel } = await import('../src/idioma.mjs');
const PANEL = `http://localhost:${process.env.CELULAR_PUERTO_PANEL}`;

let carpetaSitio;
before(() => {
  elegirIdioma('es');
  carpetaSitio = join(temporal, 'mi-sitio');
  mkdirSync(carpetaSitio, { recursive: true });
  writeFileSync(join(carpetaSitio, 'index.html'), '<!doctype html><title>Mi sitio</title><h1>Hola</h1>');
});
after(() => rmSync(temporal, { recursive: true, force: true }));
// si una prueba falla a la mitad, igual se cierra su celular-dev: si no, el panel queda ocupando el
// puerto y arrastra a las pruebas que siguen
let actual = null;
afterEach(async () => {
  if (actual && actual.codigo === null) { await actual.app.salir(0); await actual.terminado; }
  actual = null;
});

// Arma celular-dev con el celular simulado. Devuelve todo para mirar y tocar.
function armar({ opciones = {}, deps = {}, cwd = temporal } = {}) {
  const adb = new AdbSimulado();
  const piezas = { adb, chrome: null, terminado: null, codigo: null };
  piezas.terminado = new Promise(resolver => {
    piezas.app = crearApp({
      opciones,
      ui: uiCallada,
      cwd,
      tiempos: { opciones: 50, servidor: 60, reintento: 50, pestana: 10, adb: 30, chrome: 30, nitido: 40, frescuraVivo: 120, frescuraLive: 120 },
      deps: {
        buscarAdb: () => 'adb-simulado',
        crearAdb: () => adb,
        crearChrome: puerto => { piezas.chrome = new ChromeSimulado(puerto); adb.chrome = piezas.chrome; return piezas.chrome; },
        abrirNavegador: () => {}, abrirConElSistema: () => {}, hayAccesos: async () => true,
        elegirCarpeta: async () => null,
        buscarVersion: async () => null,
        // sin buscar servidores en los puertos conocidos (puede haber uno de verdad prendido)
        servidores: { conocidos: [], puertoAbierto, detectar: async () => null },
        terminar: codigo => { piezas.codigo = codigo; resolver(codigo); },
        ...deps
      }
    });
  });
  piezas.estado = piezas.app.estado;
  actual = piezas;
  return piezas;
}

async function arrancarHastaCorrer(piezas) {
  piezas.app.arrancar();
  await hasta(() => piezas.estado.fase === 'preparando', { que: 'llegar a "preparando"' });
  piezas.adb.cambiar('device');
  await hasta(() => piezas.estado.fase === 'corriendo', { que: 'llegar a "corriendo"' });
}

const accion = async (nombre, valor) => (await fetch(`${PANEL}/api/accion`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Celular': '1' }, body: JSON.stringify({ accion: nombre, valor })
})).json();
const actividad = estado => estado.actividad.map(a => a.texto).join('\n');
const excepcion = (texto, linea = 3) => ({ exceptionDetails: { text: 'Uncaught', exception: { description: texto }, stackTrace: { callFrames: [{ url: 'http://localhost:1/app.js', lineNumber: linea, columnNumber: 4 }] } } });

test('con una carpeta: la sirve, abre el sitio en el celular y se conecta a su consola', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'preparando');
  // el celular todavía no aceptó a la computadora: el asistente lo muestra
  p.adb.cambiar('unauthorized');
  await hasta(() => p.estado.pasos.celular === 'unauthorized');
  p.adb.cambiar('device');
  await hasta(() => p.estado.fase === 'corriendo');

  const { sitio } = p.app;
  assert.equal(sitio.tipo, 'carpeta');
  assert.deepEqual(p.adb.abiertas, [sitio.url]);
  assert.ok(p.adb.reverses.has(sitio.puerto), 'falta el túnel del sitio');
  assert.equal(p.adb.forwards.size, 1);
  assert.ok(p.chrome.conectado);
  assert.equal(p.estado.celular.modelo, 'moto g24 power');
  assert.equal(p.estado.celular.android, '14');
  assert.equal(p.estado.celular.navegador, 'Chrome 141.0.7390.122');
  assert.match(p.estado.celular.pantalla, /411 × 773/);
  // el sitio se ve de verdad por el servidor propio
  assert.match(await (await fetch(sitio.url)).text(), /<h1>Hola<\/h1>/);
  // y el panel muestra lo mismo
  const enPanel = await (await fetch(`${PANEL}/api/estado`)).json();
  assert.equal(enPanel.fase, 'corriendo');
  assert.equal(enPanel.sitio.nombre, 'mi-sitio');

  await p.app.salir(0);
  await p.terminado;
  // salir limpio: solo quita lo que abrió, y apaga el servidor de la carpeta y el panel
  assert.equal(p.adb.forwards.size, 0);
  assert.ok(!p.adb.reverses.has(sitio.puerto));
  assert.ok(p.adb.cerrado);
  await assert.rejects(fetch(sitio.url));
  await assert.rejects(fetch(`${PANEL}/api/estado`));
});

test('los errores del celular se explican, se agrupan y llegan al informe', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  p.chrome.evento('Runtime.exceptionThrown', excepcion('ReferenceError: mostrarRanking is not defined'));
  p.chrome.evento('Runtime.exceptionThrown', excepcion('ReferenceError: mostrarRanking is not defined'));
  p.chrome.evento('Network.responseReceived', { response: { status: 404, url: `${p.app.sitio.origen}/img/logo.png` } });
  p.chrome.evento('Runtime.consoleAPICalled', { type: 'log', args: [{ type: 'string', value: 'hola' }] });   // un log común no se muestra

  assert.equal(p.estado.avisos.length, 2);
  const [error] = p.estado.avisos.filter(a => a.nivel === 'error');
  assert.equal(error.veces, 2);
  assert.match(error.simple, /`mostrarRanking`, pero no existe/);
  assert.equal(p.estado.errores, 2);

  const informe = await accion('informe');
  assert.match(informe.texto, /ReferenceError: mostrarRanking is not defined/);
  assert.match(informe.texto, /Veces: 2/);
  assert.match(informe.texto, /No se encontró `logo\.png`/);
  assert.match(informe.archivo, /informe-.*\.md$/);

  assert.match((await accion('limpiar')).mensaje, /limpia/);
  assert.equal(p.estado.avisos.length, 0);
  await p.app.salir(0);
  await p.terminado;
});

test('los errores de antes de recargar se separan de los nuevos, sin tener que limpiar a mano', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const cargar = () => p.chrome.evento('Page.frameNavigated', { frame: { url: p.app.sitio.url } });
  cargar();
  p.chrome.evento('Runtime.exceptionThrown', excepcion('ReferenceError: viejo is not defined'));
  const [viejo] = p.estado.avisos;
  assert.equal(viejo.ronda, p.estado.ronda);
  // la página recarga: lo que falle desde ahora es de otra ronda
  cargar();
  p.chrome.evento('Runtime.exceptionThrown', excepcion('ReferenceError: nuevo is not defined'));
  const nuevo = p.estado.avisos.find(a => /nuevo/.test(a.texto));
  assert.equal(nuevo.ronda, p.estado.ronda);
  assert.ok(viejo.ronda < p.estado.ronda, 'el de antes de recargar tiene que quedar atrás');
  // si el mismo error vuelve a pasar después de recargar, es nuevo otra vez
  p.chrome.evento('Runtime.exceptionThrown', excepcion('ReferenceError: viejo is not defined'));
  assert.equal(viejo.ronda, p.estado.ronda);
  assert.equal(viejo.veces, 2);
  // navegar dentro de la misma página (el # o pushState) no cuenta como recarga
  const ronda = p.estado.ronda;
  p.chrome.evento('Page.navigatedWithinDocument', { url: `${p.app.sitio.url}#seccion` });
  assert.equal(p.estado.ronda, ronda);
  await p.app.salir(0);
  await p.terminado;
});

test('avisa si hay una versión nueva publicada, la abre y se puede dejar para después', async () => {
  const abiertas = [];
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const url = 'https://github.com/SantiagoNardini/celular-dev/releases/tag/v99.0.0';
  const p = armar({ opciones: { carpeta: carpetaSitio }, deps: { abrirNavegador: u => abiertas.push(u), buscarVersion: async () => ({ version: '99.0.0', url }) } });
  await arrancarHastaCorrer(p);
  await hasta(() => p.estado.novedad, { que: 'mostrar la versión nueva' });
  assert.equal(p.estado.version, version);
  await accion('ver-novedad');
  assert.deepEqual(abiertas, [url]);
  await accion('ocultar-novedad');
  assert.equal(p.estado.novedad, null);
  await p.app.salir(0);
  await p.terminado;
  // la que ya se dejó para después no vuelve
  const q = armar({ opciones: { carpeta: carpetaSitio }, deps: { buscarVersion: async () => ({ version: '99.0.0', url }) } });
  await arrancarHastaCorrer(q);
  await new Promise(r => setTimeout(r, 100));
  assert.equal(q.estado.novedad, null);
  await q.app.salir(0);
  await q.terminado;
});

test('mantiene la pantalla del celular prendida mientras corre, la prende si estaba apagada y la deja como estaba al salir', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  p.adb.stayOn = '2';   // la persona ya tenía «mantener activa» con el cable USB
  await arrancarHastaCorrer(p);
  assert.equal(p.adb.stayOn, '3');
  assert.ok(p.adb.comandos.includes('input keyevent KEYCODE_WAKEUP'), 'tiene que despertar la pantalla');
  // al reconectar, se vuelve a pedir (el celular pudo reiniciarse)
  p.adb.stayOn = '0';
  p.adb.cambiar('sin-celular');
  p.adb.cambiar('device');
  await hasta(() => p.adb.stayOn === '3', { que: 'volver a mantenerla prendida' });
  await p.app.salir(0);
  await p.terminado;
  assert.equal(p.adb.stayOn, '2', 'tiene que devolver lo que tenía');
});

test('con varios celulares: el panel los lista y se elige cuál usar; el diagnóstico cuenta el estado sin datos personales', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'preparando');
  p.adb.lista = [{ serie: 'AAA111', estado: 'device', nombre: 'moto g24 power' }, { serie: 'BBB222', estado: 'device', nombre: 'Pixel 6' }];
  p.adb.emit('lista', p.adb.lista);
  p.adb.cambiar('varios');
  await hasta(() => p.estado.pasos.celular === 'varios' && p.estado.celulares.length === 2, { que: 'avisar que hay varios' });
  assert.deepEqual(p.estado.celulares.map(c => c.nombre), ['moto g24 power', 'Pixel 6']);
  assert.match((await accion('elegir-celular', 'ZZZ')).error, /ya no está conectado/);
  assert.match((await accion('elegir-celular', 'BBB222')).mensaje, /elegido/);
  await hasta(() => p.estado.fase === 'corriendo', { que: 'seguir con el celular elegido' });
  assert.equal(p.adb.serie, 'BBB222');

  const { texto } = await accion('diagnostico');
  assert.match(texto, /# celular-dev diagnostics/);
  assert.match(texto, /Phase: corriendo/);
  assert.match(texto, /Model: moto g24 power/);
  assert.match(texto, /Device: Pixel 6 \[BBB…\] device/, 'el número de serie va recortado');
  assert.ok(!texto.includes('BBB222'));
  assert.ok(!texto.includes(process.env.USERPROFILE || process.env.HOME), 'no tiene que traer la carpeta del usuario');
  await p.app.salir(0);
  await p.terminado;
});

test('la consola del celular: console.log y info van a su lista, no a los errores', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  p.chrome.evento('Runtime.consoleAPICalled', { type: 'log', args: [{ type: 'string', value: 'hola desde el celular' }] });
  p.chrome.evento('Runtime.consoleAPICalled', { type: 'info', args: [{ type: 'string', value: 'dato' }, { type: 'number', value: 3 }] });
  assert.equal(p.estado.avisos.length, 0, 'un log no es un error');
  assert.deepEqual(p.estado.consolaLineas.map(l => l.texto), ['console.info: dato 3', 'console.log: hola desde el celular']);
  p.chrome.evento('Page.loadEventFired', {});
  assert.equal(p.estado.consolaLineas.length, 2, 'la carga de la página no es un mensaje de consola');
  await accion('limpiar');
  assert.equal(p.estado.consolaLineas.length, 0);
  await p.app.salir(0);
  await p.terminado;
});

test('condiciones de prueba: tema, animaciones, visión y lugar se aplican y se reaplican al reconectar', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  assert.match((await accion('condicion', { clave: 'esquema', valor: 'oscuro' })).mensaje, /oscuro/);
  assert.equal(p.chrome.mediosPedidos.at(-1).esquema, 'oscuro');
  await accion('condicion', { clave: 'animaciones', valor: 'reducidas' });
  assert.deepEqual([p.chrome.mediosPedidos.at(-1).esquema, p.chrome.mediosPedidos.at(-1).animaciones], ['oscuro', 'reducidas'], 'se mantienen las anteriores');
  await accion('condicion', { clave: 'vision', valor: 'protanopia' });
  assert.equal(p.chrome.visiones.at(-1), 'protanopia');
  await accion('condicion', { clave: 'lugar', valor: 'madrid' });
  assert.deepEqual(p.chrome.lugares.at(-1), { zona: 'Europe/Madrid', idioma: 'es-ES', lat: 40.4168, lon: -3.7038 });
  assert.ok((await accion('condicion', { clave: 'esquema', valor: 'violeta' })).error, 'una opción que no existe no se acepta');
  assert.ok((await accion('condicion', { clave: 'nada', valor: 'x' })).error);
  assert.equal(p.estado.condiciones.esquema, 'oscuro');

  // al reconectar con la pestaña, se vuelve a pedir todo
  const antes = p.chrome.mediosPedidos.length;
  p.chrome.perderPestana();
  await hasta(() => p.estado.consola === true, { que: 'reconectar la consola' });
  assert.ok(p.chrome.mediosPedidos.length > antes);
  assert.equal(p.chrome.mediosPedidos.at(-1).esquema, 'oscuro');
  assert.equal(p.chrome.visiones.at(-1), 'protanopia');

  assert.match((await accion('condiciones-reiniciar')).mensaje, /reiniciadas/);
  assert.deepEqual(p.estado.condiciones, { esquema: 'auto', animaciones: 'normal', contraste: 'normal', vision: 'ninguna', lugar: 'real' });
  assert.equal(p.chrome.lugares.at(-1), null);

  await p.app.salir(0);
  await p.terminado;
});

test('celular lento: red 3G y procesador más lento de una vez; elegir otra red a mano lo apaga', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const recargas = p.chrome.recargas;
  assert.match((await accion('celular-lento')).mensaje, /activado/);
  assert.equal(p.estado.lento, true);
  assert.equal(p.estado.red, 'lenta');
  assert.equal(p.chrome.redes.at(-1), 'lenta');
  assert.equal(p.chrome.cpus.at(-1), 4);
  assert.equal(p.chrome.recargas, recargas + 1, 'recarga para ver cómo carga');
  // al reconectar vuelve a quedar lento
  p.chrome.perderPestana();
  await hasta(() => p.estado.consola === true, { que: 'reconectar la consola' });
  assert.equal(p.chrome.cpus.at(-1), 4);
  // «Volver a todo normal» con el celular lento: devuelve también la red
  await accion('condiciones-reiniciar');
  assert.equal(p.estado.lento, false);
  assert.equal(p.estado.red, 'normal');
  assert.equal(p.chrome.redes.at(-1), 'normal');
  assert.equal(p.chrome.cpus.at(-1), 1);
  await accion('celular-lento');
  // otra red a mano: ya no es el celular lento
  await accion('red', 'normal');
  assert.equal(p.estado.lento, false);
  assert.equal(p.chrome.cpus.at(-1), 1);
  await accion('celular-lento');
  assert.match((await accion('celular-lento')).mensaje, /normales|apagado/);
  assert.equal(p.estado.red, 'normal');
  assert.equal(p.chrome.cpus.at(-1), 1);
  await p.app.salir(0);
  await p.terminado;
});

test('inspector: tocar un elemento del espejo dice qué es, dónde está y avisa si es muy chico', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  p.chrome.elemento = { selector: 'main > button.comprar', etiqueta: 'button', id: '', clases: ['comprar'], texto: 'Comprar', rect: { x: 20, y: 100, ancho: 30, alto: 30 }, pantalla: { ancho: 411, alto: 773 }, estilos: {}, interactivo: true, nombre: 'Comprar', rol: '', desborde: false, atributos: [] };
  assert.deepEqual(await accion('inspeccionar', { x: 0.5, y: 0.5 }), {});
  assert.deepEqual(p.chrome.inspeccionado, { fx: 0.5, fy: 0.5 }, 'la página pasa la fracción a sus píxeles');
  assert.equal(p.estado.inspeccion.selector, 'main > button.comprar');
  // sin elemento ahí
  p.chrome.elemento = null;
  assert.match((await accion('inspeccionar', { x: 0.1, y: 0.1 })).error, /ningún elemento/);
  assert.equal(p.estado.inspeccion.selector, 'main > button.comprar', 'lo anterior queda');
  // se cierra a mano, y al cargar otra página
  await accion('inspeccion-cerrar');
  assert.equal(p.estado.inspeccion, null);
  p.chrome.elemento = { selector: 'h1', etiqueta: 'h1', rect: { x: 0, y: 0, ancho: 10, alto: 10 }, pantalla: { ancho: 411, alto: 773 }, estilos: {}, atributos: [] };
  await accion('inspeccionar', { x: 0.2, y: 0.2 });
  assert.ok(p.estado.inspeccion);
  p.chrome.evento('Page.frameNavigated', { frame: { id: 'F', url: p.app.sitio.url } });
  assert.equal(p.estado.inspeccion, null, 'al cargar otra página el elemento ya no está donde estaba');
  await p.app.salir(0);
  await p.terminado;
});

test('pedidos de red: se ven el peso y el tiempo de cada uno, lo que falla, y se reinicia al cargar la página', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const origen = p.app.sitio.origen;
  const pedir = (id, tipo, ruta, ini, fin, estadoHttp, bytes, extra = {}) => {
    p.chrome.evento('Network.requestWillBeSent', { requestId: id, loaderId: id, frameId: 'F', type: tipo, timestamp: ini, request: { url: `${origen}${ruta}`, method: 'GET' } });
    p.chrome.evento('Network.responseReceived', { requestId: id, response: { status: estadoHttp, mimeType: tipo === 'Image' ? 'image/png' : 'text/html', ...extra } });
    if (bytes != null) p.chrome.evento('Network.loadingFinished', { requestId: id, timestamp: fin, encodedDataLength: bytes });
  };
  pedir('1', 'Document', '/', 10, 10.2, 200, 2048);
  pedir('2', 'Image', '/img/foto.png', 10.3, 11.6, 200, 3 * 1024 * 1024);
  pedir('3', 'Image', '/img/falta.png', 10.4, 10.5, 404, 120);
  p.chrome.evento('Network.requestWillBeSent', { requestId: '4', loaderId: '4', frameId: 'F', type: 'Fetch', timestamp: 10.5, request: { url: `${origen}/api/x`, method: 'POST' } });
  p.chrome.evento('Network.loadingFailed', { requestId: '4', timestamp: 10.6, errorText: 'net::ERR_CONNECTION_REFUSED' });
  await hasta(() => p.estado.pedidos.total === 4, { que: 'juntar los pedidos' });
  const { filas, bytes } = p.estado.pedidos;
  const foto = filas.find(f => f.id === '2');
  assert.deepEqual([foto.ruta, foto.tipo, foto.estado, foto.tamano, foto.tiempo], ['/img/foto.png', 'Image', 200, 3145728, 1300]);
  assert.equal(filas.find(f => f.id === '4').fallo, 'net::ERR_CONNECTION_REFUSED');
  assert.equal(filas.find(f => f.id === '3').estado, 404);
  assert.equal(bytes, 2048 + 3145728 + 120);
  // una carga nueva de la página principal empieza de cero
  p.chrome.evento('Network.requestWillBeSent', { requestId: '5', loaderId: '5', frameId: 'F', type: 'Document', timestamp: 20, request: { url: `${origen}/otra`, method: 'GET' } });
  await hasta(() => p.estado.pedidos.total === 1, { que: 'empezar de cero con la página nueva' });
  // un documento de otro marco (un iframe) no borra lo de la página
  p.chrome.evento('Page.frameNavigated', { frame: { id: 'F', url: `${origen}/otra` } });
  p.chrome.evento('Network.requestWillBeSent', { requestId: '6', loaderId: '6', frameId: 'IFRAME', type: 'Document', timestamp: 21, request: { url: 'https://otro.com/anuncio', method: 'GET' } });
  await hasta(() => p.estado.pedidos.total === 2, { que: 'sumar el pedido del iframe' });
  assert.equal(p.estado.pedidos.filas[0].ruta, 'otro.com/anuncio');
  await accion('pedidos-limpiar');
  assert.equal(p.estado.pedidos.total, 0);
  await p.app.salir(0);
  await p.terminado;
});

test('datos del sitio: lee almacenamiento y cookies, borra uno, o empieza de cero y recarga', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  p.chrome.almacen = { local: [{ clave: 'token', valor: 'abc', largo: 3 }], sesion: [], serviceWorkers: 1, caches: ['v1'], bases: ['pedidos'] };
  p.chrome.cookiesDelSitio = [{ name: 'sid', value: 'xyz', domain: 'localhost', path: '/', httpOnly: true, secure: false }];
  assert.deepEqual(await accion('datos-leer'), {});
  const d = p.estado.datosSitio;
  assert.deepEqual([d.local.length, d.sesion.length, d.serviceWorkers, d.caches, d.bases], [1, 0, 1, ['v1'], ['pedidos']]);
  assert.deepEqual(d.cookies, [{ nombre: 'sid', valor: 'xyz', dominio: 'localhost', ruta: '/', soloHttp: true, segura: false }]);
  assert.equal(d.origen, p.app.sitio.origen);

  assert.match((await accion('dato-borrar', { tipo: 'cookie', clave: 'sid', dominio: 'localhost', ruta: '/' })).mensaje, /Borrado/);
  assert.deepEqual(p.chrome.cookiesBorradas, [['sid', 'localhost', '/']]);
  await accion('dato-borrar', { tipo: 'local', clave: 'token' });
  assert.deepEqual(p.chrome.corridas.at(-1), { almacen: 'local', clave: 'token' });
  assert.ok((await accion('dato-borrar', { tipo: 'otra', clave: 'x' })).error);
  assert.ok((await accion('dato-borrar', 'texto')).error);

  const recargas = p.chrome.recargas;
  assert.match((await accion('datos-limpiar')).mensaje, /de cero/);
  assert.deepEqual(p.chrome.datosBorrados, [p.app.sitio.origen]);
  assert.equal(p.chrome.recargas, recargas + 1, 'recarga como si fuera la primera visita');
  await p.app.salir(0);
  await p.terminado;
});

test('un solo botón para arreglar lo que falla: el celular, el servidor o la pestaña de Chrome', async () => {
  const servidor = createServer((_, r) => r.end('<!doctype html><h1>Servidor</h1>'));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  const p = armar({ opciones: { puerto: String(puerto) }, deps: { servidores: { conocidos: [], puertoAbierto, detectar } } });
  await arrancarHastaCorrer(p);
  assert.match((await accion('arreglar')).mensaje, /nada que arreglar/);

  // la pestaña de Chrome se cerró: lo abre de nuevo y se conecta
  p.chrome.pestanas.length = 0;
  p.chrome.perderPestana();
  const abiertas = p.adb.abiertas.length;
  assert.match((await accion('arreglar')).mensaje, /Chrome abierto y conectado/);
  assert.equal(p.adb.abiertas.length, abiertas + 1);
  assert.equal(p.estado.consola, true);

  // el servidor se apagó: mientras siga apagado, dice qué hacer; cuando vuelve, lo toma y recarga
  await new Promise(r => servidor.close(r));
  await hasta(() => p.estado.servidorOk === false, { que: 'notar que se cayó' });
  assert.match((await accion('arreglar')).error, new RegExp(`sigue apagado`));
  await new Promise(r => servidor.listen(puerto, '127.0.0.1', r));
  await hasta(() => p.estado.servidorOk === true, { que: 'volver' });

  // el celular se desconectó: pregunta de nuevo a ADB y explica qué falta
  p.adb.cambiar('sin-celular');
  assert.match((await accion('arreglar')).error, /Sigo sin ver el celular/);
  assert.ok(p.adb.consultas >= 1, 'tiene que volver a preguntarle a ADB');
  p.adb.cambiar('unauthorized');
  assert.match((await accion('arreglar')).error, /Permitir/);

  await p.app.salir(0);
  await p.terminado;
  servidor.close();
});

test('al guardar recarga el celular; en modo manual, no', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  writeFileSync(join(carpetaSitio, 'index.html'), '<!doctype html><title>Mi sitio</title><h1>Hola de nuevo</h1>');
  await hasta(() => p.chrome.recargas === 1, { que: 'recargar al guardar' });
  assert.match(actividad(p.estado), /Guardaste index\.html/);

  assert.equal((await accion('modo')).mensaje, 'Modo manual');
  writeFileSync(join(carpetaSitio, 'index.html'), '<!doctype html><title>Mi sitio</title><h1>Hola</h1>');
  await hasta(() => /modo manual: recargá cuando quieras/.test(actividad(p.estado)), { que: 'avisar el guardado en manual' });
  assert.equal(p.chrome.recargas, 1, 'en modo manual no tiene que recargar');

  // a mano sí
  assert.equal((await accion('recargar')).mensaje, 'Celular recargado');
  assert.equal(p.chrome.recargas, 2);
  await p.app.salir(0);
  await p.terminado;
});

test('si se desconecta el celular, al volver rearma todo y no deja túneles sueltos', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const [primerForward] = p.adb.forwards;
  p.adb.cambiar('sin-celular');
  assert.equal(p.estado.pasos.celular, 'sin-celular');
  assert.ok(!p.chrome.conectado);
  assert.match(actividad(p.estado), /Se desconectó el celular/);

  // ADB avisa dos veces casi juntas (volvió el celular y se reinició): una sola reconexión
  p.adb.cambiar('device');
  p.adb.emit('reinicio');
  await hasta(() => /Celular reconectado, con su consola/.test(actividad(p.estado)), { que: 'reconectar' });
  await hasta(() => !p.app.rearmando);
  assert.ok(p.chrome.conectado);
  assert.equal(p.adb.forwards.size, 1, 'quedó un túnel a Chrome de más');
  assert.ok(!p.adb.forwards.has(primerForward), 'no quitó el túnel viejo');

  // si se pierde la pestaña (se cerró), se reconecta sola apenas vuelve
  p.chrome.perderPestana();
  assert.equal(p.estado.consola, false);
  await hasta(() => p.estado.consola === true, { que: 'reconectar la consola' });

  await p.app.salir(0);
  await p.terminado;
  assert.equal(p.adb.forwards.size, 0);
});

test('el espejo: pide cuadros solo mientras alguien mira, los manda al panel y lleva los toques', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  assert.equal(p.chrome.espejo, false, 'sin nadie mirando no tiene que pedir cuadros');

  const recibido = [];
  const pedido = request(`${PANEL}/api/espejo.mjpg`, { headers: { Host: `localhost:${process.env.CELULAR_PUERTO_PANEL}` } });
  const respuesta = await new Promise((resolver, rechazar) => { pedido.on('response', resolver); pedido.on('error', rechazar); pedido.end(); });
  assert.match(respuesta.headers['content-type'], /multipart\/x-mixed-replace; boundary=cuadro/);
  respuesta.on('data', d => recibido.push(d));
  await hasta(() => p.chrome.espejo, { que: 'pedir cuadros' });

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  p.chrome.cuadro(jpeg);
  await hasta(() => Buffer.concat(recibido).includes(jpeg), { que: 'mandar el cuadro al panel' });
  assert.match(Buffer.concat(recibido).toString('latin1'), /Content-Type: image\/jpeg\r\nContent-Length: 9/);
  assert.equal(p.estado.espejo, true);

  // un toque en el medio de la imagen cae en el medio de la página del celular
  await accion('tocar', { tipo: 'inicio', x: 0.5, y: 0.5 });
  await accion('tocar', { tipo: 'fin', x: 0.5, y: 0.5 });
  await accion('tocar', { tipo: 'rueda', x: 0, y: 1, dx: 0, dy: 120 });
  await accion('tocar', { tipo: 'texto', texto: 'hola' });
  await accion('tocar', { tipo: 'tecla', tecla: 'Enter' });
  await accion('tocar', { tipo: 'tecla', tecla: 'F5' });   // no permitida: no llega
  assert.deepEqual(p.chrome.toques, [['touchStart', 206, 387], ['touchEnd', 206, 387], ['rueda', 0, 773, 0, 120]]);
  assert.deepEqual(p.chrome.escrito, ['hola', '[Enter]']);
  // la hora de cada toque llega a Chrome (así calcula la velocidad al deslizar)
  await accion('tocar', { tipo: 'mover', x: 0.5, y: 0.4, t: 1792300000123 });
  assert.equal(p.chrome.momentos.at(-1), 1792300000123);
  // el botón Atrás del panel
  assert.deepEqual(await accion('atras'), {});
  assert.equal(p.chrome.atrases, 1);

  // nadie mira: deja de pedir cuadros
  respuesta.destroy();
  await hasta(() => !p.chrome.espejo, { que: 'dejar de pedir cuadros' });
  await p.app.salir(0);
  await p.terminado;
});

test('el espejo pide imágenes del ancho en que se muestran, y cambia si otro panel las quiere más grandes', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const mirar = async ancho => {
    const pedido = request(`${PANEL}/api/espejo.mjpg${ancho ? `?ancho=${ancho}` : ''}`, { headers: { Host: `localhost:${process.env.CELULAR_PUERTO_PANEL}` } });
    return new Promise((resolver, rechazar) => { pedido.on('response', resolver); pedido.on('error', rechazar); pedido.end(); });
  };
  const chico = await mirar(400);
  await hasta(() => p.chrome.pedidosEspejo?.length === 1);
  assert.equal(p.chrome.pedidosEspejo[0].ancho, 400);
  // otro panel, en una pantalla con más resolución: se pide más grande para los dos
  const grande = await mirar(2000);
  await hasta(() => p.chrome.pedidosEspejo.length === 2);
  assert.equal(p.chrome.pedidosEspejo[1].ancho, 720, 'no tiene que pasar de 720');
  // se cierra el grande: vuelve al tamaño del que queda
  grande.destroy();
  await hasta(() => p.chrome.pedidosEspejo.length === 3);
  assert.equal(p.chrome.pedidosEspejo[2].ancho, 400);
  chico.destroy();
  await hasta(() => !p.chrome.espejo);
  // sin dato de ancho: 540
  const sinDato = await mirar();
  await hasta(() => p.chrome.pedidosEspejo.length === 4);
  assert.equal(p.chrome.pedidosEspejo[3].ancho, 540);
  sinDato.destroy();
  await p.app.salir(0);
  await p.terminado;
});

test('al volver a la pestaña del panel con la pantalla quieta, el espejo se muestra sin esperar ningún movimiento', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const mirar = async () => {
    const pedido = request(`${PANEL}/api/espejo.mjpg`, { headers: { Host: `localhost:${process.env.CELULAR_PUERTO_PANEL}` } });
    const respuesta = await new Promise((resolver, rechazar) => { pedido.on('response', resolver); pedido.on('error', rechazar); pedido.end(); });
    respuesta.resume();
    return pedido;
  };
  let pedido = await mirar();
  p.chrome.cuadro(Buffer.from([0xff, 0xd8, 1, 1, 1, 0xff, 0xd9]));
  await hasta(() => p.estado.espejo, { que: 'mostrar el espejo' });
  // el panel pasa a segundo plano: suelta el espejo
  pedido.destroy();
  await hasta(() => p.estado.espejo === false, { que: 'soltar el espejo' });
  // vuelve y la pantalla sigue igual: Chrome no manda ningún cuadro, pero el panel tiene que mostrar la imagen
  const nitidas = p.chrome.nitidas || 0;
  pedido = await mirar();
  await hasta(() => p.estado.espejo === true, { que: 'mostrar el espejo de nuevo' });
  await hasta(() => (p.chrome.nitidas || 0) > nitidas, { que: 'sacar una captura nueva' });
  pedido.destroy();
  await p.app.salir(0);
  await p.terminado;
});

test('el espejo manda una imagen nítida cuando la pantalla se queda quieta, sin que el eco la pise', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const recibido = [];
  const pedido = request(`${PANEL}/api/espejo.mjpg`, { headers: { Host: `localhost:${process.env.CELULAR_PUERTO_PANEL}` } });
  const respuesta = await new Promise((resolver, rechazar) => { pedido.on('response', resolver); pedido.on('error', rechazar); pedido.end(); });
  respuesta.on('data', d => recibido.push(d));
  await hasta(() => p.chrome.espejo);
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const todo = () => Buffer.concat(recibido);
  const NITIDO = Buffer.from([0xff, 0xd8, 0xaa, 0xff, 0xd9]);
  const nitidos = () => { let n = 0, i = -1; while ((i = todo().indexOf(NITIDO, i + 1)) !== -1) n++; return n; };
  const liviano = n => Buffer.from([0xff, 0xd8, n, n, n, 0xff, 0xd9]);

  // la pantalla cambia y se queda quieta: llega la nítida
  p.chrome.cuadro(liviano(1));
  await hasta(() => nitidos() === 1, { que: 'la imagen nítida' });
  assert.ok(todo().lastIndexOf(NITIDO) > todo().lastIndexOf(liviano(1)), 'la nítida va después de la liviana');

  // el eco (el mismo cuadro liviano otra vez, como lo manda Chrome después de cada captura): no se reenvía
  // ni dispara otra captura
  const largo = todo().length;
  p.chrome.cuadro(liviano(1));
  await espera(150);
  assert.equal(todo().length, largo);
  assert.equal(p.chrome.nitidas, 1);

  // un cambio real: se manda, y después se vuelve a afinar
  p.chrome.cuadro(liviano(2));
  await hasta(() => nitidos() === 2, { que: 'afinar el cambio' });
  assert.ok(todo().includes(liviano(2)));

  // si cambia mientras se saca la nítida, esa ya es vieja: se descarta y se saca otra
  p.chrome.demoraNitida = 120;
  p.chrome.cuadro(liviano(3));
  await espera(70);
  p.chrome.cuadro(liviano(4));
  await hasta(() => nitidos() === 3, { que: 'la nítida del último cambio' });
  await espera(250);
  assert.equal(nitidos(), 3, 'la nítida vieja no tiene que llegar');
  assert.equal(p.chrome.nitidas, 4);
  assert.ok(todo().lastIndexOf(NITIDO) > todo().lastIndexOf(liviano(4)));

  // sin nadie mirando no se saca nada
  respuesta.destroy();
  await hasta(() => !p.chrome.espejo);
  const hechas = p.chrome.nitidas;
  p.chrome.cuadro(liviano(5));
  await espera(150);
  assert.equal(p.chrome.nitidas, hechas);
  await p.app.salir(0);
  await p.terminado;
});

test('el panel sabe qué página tiene abierta el celular, y se puede abrir en la computadora', async () => {
  const abiertas = [];
  const p = armar({ opciones: { carpeta: carpetaSitio }, deps: { abrirNavegador: url => abiertas.push(url) } });
  await arrancarHastaCorrer(p);
  const { origen, url } = p.app.sitio;
  assert.equal(p.estado.celular.url, url, 'al conectar, la página que abrió');

  // navega: cambia la dirección; el # y pushState también; una subventana (iframe) no cuenta
  p.chrome.evento('Page.frameNavigated', { frame: { url: `${origen}/otra/`, urlFragment: '#tabla' } });
  assert.equal(p.estado.celular.url, `${origen}/otra/#tabla`);
  p.chrome.evento('Page.frameNavigated', { frame: { parentId: 'x', url: 'https://anuncios.example/' } });
  assert.equal(p.estado.celular.url, `${origen}/otra/#tabla`);
  p.chrome.evento('Page.navigatedWithinDocument', { url: `${origen}/otra/#fecha` });
  assert.equal(p.estado.celular.url, `${origen}/otra/#fecha`);
  assert.equal((await (await fetch(`${PANEL}/api/estado`)).json()).celular.url, `${origen}/otra/#fecha`);

  // abrirla en la computadora; el panel no puede pedir otra dirección: se usa la que tiene el celular
  assert.match((await accion('abrir-en-pc', 'https://malo.example/')).mensaje, /Abriendo en tu computadora/);
  assert.deepEqual(abiertas, [`${origen}/otra/#fecha`]);
  // una dirección que no es web no se abre
  p.chrome.evento('Page.navigatedWithinDocument', { url: 'chrome://version/' });
  assert.ok((await accion('abrir-en-pc')).error);
  assert.equal(abiertas.length, 1);
  await p.app.salir(0);
  await p.terminado;
});

test('la primera vez muestra qué hacer con el espejo, hasta que se lo toca', async () => {
  const { guardarPreferencia, preferencia } = await import('../src/lugares.mjs');
  guardarPreferencia('primerExito', false);
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  assert.equal(p.estado.primerExito, true);
  await arrancarHastaCorrer(p);
  p.chrome.cuadro(Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9]));
  await accion('tocar', { tipo: 'mover', x: 0.5, y: 0.5 });   // mover no cuenta, solo el primer toque
  assert.equal(p.estado.primerExito, true);
  await accion('tocar', { tipo: 'inicio', x: 0.5, y: 0.5 });
  assert.equal(p.estado.primerExito, false);
  assert.equal(preferencia('primerExito'), true, 'tiene que quedar recordado');
  await p.app.salir(0);
  await p.terminado;

  // la próxima vez no vuelve a salir
  assert.equal(armar({ opciones: { carpeta: carpetaSitio } }).estado.primerExito, false);
  // el botón «Entendido» también lo cierra
  guardarPreferencia('primerExito', false);
  const q = armar({ opciones: { carpeta: carpetaSitio } });
  assert.equal(q.estado.primerExito, true);
  await q.app.accion('entendido');
  assert.equal(q.estado.primerExito, false);
  assert.equal(preferencia('primerExito'), true);
  // y sin panel (solo terminal) no se muestra nada
  guardarPreferencia('primerExito', false);
  assert.equal(armar({ opciones: { carpeta: carpetaSitio, 'sin-panel': true } }).estado.primerExito, false);
});

test('si el celular no termina de recargar después de guardar, el panel avisa (y dice si es la pantalla apagada); al actualizarse se va', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  assert.equal(p.estado.desactualizado, null);
  // la pantalla se apagó: el celular recibe el pedido de recarga pero no termina de cargar
  p.chrome.sinCarga = true;
  p.adb.pantalla = 'apagada';
  writeFileSync(join(carpetaSitio, 'index.html'), '<!doctype html><title>Mi sitio</title><h1>apagada</h1>');
  await hasta(() => p.estado.desactualizado, { que: 'el aviso de que no se actualizó' });
  assert.equal(p.estado.desactualizado.motivo, 'pantalla-apagada');
  assert.match(actividad(p.estado), /pantalla del celular está apagada/);
  // la enciende: termina de cargar y el aviso se va
  p.chrome.evento('Page.loadEventFired', {});
  assert.equal(p.estado.desactualizado, null);
  assert.match(actividad(p.estado), /El celular se actualizó/);

  // sin ser la pantalla: el aviso general
  p.adb.pantalla = 'prendida';
  await accion('recargar');
  await hasta(() => p.estado.desactualizado, { que: 'el aviso general' });
  assert.equal(p.estado.desactualizado.motivo, 'sin-carga');
  // una recarga que sí carga lo saca
  p.chrome.sinCarga = false;
  await accion('recargar');
  await hasta(() => p.estado.desactualizado === null, { que: 'que se actualice' });
  // y con una recarga que carga bien no hay aviso
  await new Promise(r => setTimeout(r, 250));
  assert.equal(p.estado.desactualizado, null);
});

test('en modo manual, avisa que hay cambios guardados que el celular todavía no muestra', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  await accion('modo');   // pasa a manual
  writeFileSync(join(carpetaSitio, 'index.html'), '<!doctype html><title>Mi sitio</title><h1>manual</h1>');
  await hasta(() => p.estado.desactualizado, { que: 'el aviso de cambios sin recargar' });
  assert.equal(p.estado.desactualizado.motivo, 'manual');
  const antes = p.estado.desactualizado.n;
  assert.equal(p.chrome.recargas, 0, 'en manual no recarga solo');
  writeFileSync(join(carpetaSitio, 'extra.js'), 'x');
  await hasta(() => p.estado.desactualizado.n > antes, { que: 'sumar el segundo guardado' });
  rmSync(join(carpetaSitio, 'extra.js'), { force: true });
  // al recargar y cargar, se va
  await accion('recargar');
  await hasta(() => p.estado.desactualizado === null, { que: 'que se vaya el aviso' });
});

test('con Live Server y la carpeta del código conocida, vigila que el celular se recargue (menos con estilos e imágenes)', async () => {
  const carpeta = join(temporal, 'live');
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'index.html'), '<h1>x</h1>');
  const servidor = createServer((_, r) => r.end('<!doctype html><!-- Code injected by live-server --><h1>x</h1>'));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const p = armar({ opciones: { puerto: String(servidor.address().port), codigo: carpeta }, deps: { servidores: { conocidos: [], puertoAbierto, detectar } } });
  await arrancarHastaCorrer(p);
  assert.equal(p.estado.modo, 'live-server');
  const espera = ms => new Promise(r => setTimeout(r, ms));
  // en Mac, el vigía repite al empezar lo recién escrito (el index.html de arriba) y eso pasa por un guardado: se deja
  // asentar y se da por cargado el celular, para medir solo lo que hace la prueba
  await espera(400);
  p.chrome.evento('Page.loadEventFired', {});
  assert.equal(p.estado.desactualizado, null);
  // solo estilos: Live Server no recarga la página, no hay nada que esperar
  writeFileSync(join(carpeta, 'estilo.css'), 'a{}');
  await espera(700);
  assert.equal(p.estado.desactualizado, null);
  // un script sí tendría que recargarla: si no llega, se avisa
  writeFileSync(join(carpeta, 'app.js'), 'x');
  await hasta(() => p.estado.desactualizado, { ms: 4000, que: 'el aviso de que Live Server no recargó' });
  assert.equal(p.estado.desactualizado.motivo, 'sin-carga');
  p.chrome.evento('Page.loadEventFired', {});   // Live Server por fin recarga el celular
  assert.equal(p.estado.desactualizado, null);
  assert.equal(p.chrome.recargas, 0, 'con Live Server no recarga celular-dev');
  assert.equal(p.estado.necesitaCodigo, false);
  await p.app.salir(0);
  await p.terminado;
  servidor.close();
});

test('probar otros tamaños de pantalla: se simulan los que entran, los toques usan esas medidas y se descarta la imagen con la proporción real', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  assert.equal(p.estado.tamano, 'real');
  assert.deepEqual(p.estado.tamanos.filter(t => t.cabe).map(t => t.id), ['chico', 'android', 'iphone-se']);
  const pedido = request(`${PANEL}/api/espejo.mjpg?ancho=400`, { headers: { Host: `localhost:${process.env.CELULAR_PUERTO_PANEL}` } });
  const espejo = await new Promise((resolver, rechazar) => { pedido.on('response', resolver); pedido.on('error', rechazar); pedido.end(); });
  espejo.resume();
  await hasta(() => p.chrome.espejo, { que: 'pedir imágenes en vivo' });
  const espera = ms => new Promise(r => setTimeout(r, ms));
  // un JPEG mínimo con las medidas que se le pidan (lo que importa es el marcador con ancho y alto)
  const jpegDe = (ancho, alto) => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8, alto >> 8, alto & 255, ancho >> 8, ancho & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  p.chrome.cuadro(jpegDe(400, 752), 411, 773);

  // uno que entra en la pantalla: los datos de la imagen dicen 411 × 773 (lo real), pero el toque en el medio
  // tiene que caer en el medio de 360 × 640
  assert.match((await accion('tamano', 'android')).mensaje, /360 × 640/);
  assert.deepEqual(p.chrome.tamanos.at(-1), { ancho: 360, alto: 640, densidad: 0 });
  await hasta(() => p.chrome.espejo, { que: 'volver a pedir imágenes en vivo' });
  p.chrome.cuadro(jpegDe(400, 712), 411, 773);
  await accion('tocar', { tipo: 'inicio', x: 0.5, y: 0.5 });
  assert.deepEqual(p.chrome.toques.at(-1), ['touchStart', 180, 320]);

  // Chrome mete una imagen con la proporción del celular real cada vez que saca una captura: se descarta
  const buena = p.app.espejo.ultimo;
  p.chrome.cuadro(jpegDe(400, 752), 411, 773);
  assert.ok(p.app.espejo.ultimo.equals(buena), 'una imagen con otra proporción no tiene que mostrarse');
  p.chrome.cuadro(jpegDe(630, 1120), 411, 773);   // en cambio, una nítida con la proporción de 360 × 640 sí
  assert.ok(p.app.espejo.ultimo.equals(jpegDe(630, 1120)));

  // uno que no entra (tablet, celular de costado): Chrome repite el contenido, no se acepta
  const rechazo = await accion('tamano', 'tablet');
  assert.match(rechazo.error, /768 × 1024.*más grande que la pantalla de tu celular \(411 × 773 px\)/);
  assert.equal(p.estado.tamano, 'android');
  assert.deepEqual(p.chrome.tamanos.at(-1), { ancho: 360, alto: 640, densidad: 0 }, 'no tiene que haber pedido nada a Chrome');

  // de vuelta a la real
  assert.equal((await accion('tamano', 'real')).mensaje, 'Pantalla real otra vez.');
  assert.equal(p.chrome.tamanos.at(-1), null);
  await hasta(() => p.chrome.espejo, { que: 'volver a las imágenes en vivo' });
  p.chrome.cuadro(jpegDe(400, 752), 411, 773);   // sin tamaño simulado, la proporción real es la buena
  assert.ok(p.app.espejo.ultimo.equals(jpegDe(400, 752)));

  // la simulación se vuelve a pedir si se reconecta con la pestaña (dura lo que dura la conexión)
  await accion('tamano', 'iphone-se');
  p.chrome.perderPestana();
  await hasta(() => p.estado.consola === true, { que: 'reconectar' });
  assert.deepEqual(p.chrome.tamanos.at(-1), { ancho: 375, alto: 667, densidad: 0 });
  // el informe lo cuenta, y un tamaño que no existe no se acepta
  assert.match((await accion('informe')).texto, /Pantalla simulada: 375 × 667 px/);
  assert.ok((await accion('tamano', 'no-existe')).error);
  assert.equal(p.estado.tamano, 'iphone-se');
  espejo.destroy();
  await espera(20);
  await p.app.salir(0);
  await p.terminado;
});

test('arrastrar una carpeta al panel: la encuentra en el disco, pregunta si hay varias, o abre la ventana si no la encuentra', async () => {
  const raizP = join(temporal, 'arrastrar');
  const sitio = (ruta, archivos) => { mkdirSync(join(raizP, ruta), { recursive: true }); for (const [n, c] of Object.entries(archivos)) writeFileSync(join(raizP, ruta, n), c); };
  sitio('a/mi-pagina', { 'index.html': '<h1>a</h1>', 'estilos.css': 'body{}' });
  sitio('b/mi-pagina', { 'index.html': '<h1>b</h1>', 'otro.js': 'x' });
  sitio('c/gemelas', { 'index.html': '<h1>g</h1>', 'app.js': 'y' });
  sitio('d/gemelas', { 'index.html': '<h1>g</h1>', 'app.js': 'y' });
  const elegidas = [];
  const deps = { raicesBusqueda: () => [{ ruta: raizP, profundidad: 4 }], elegirCarpeta: async titulo => { elegidas.push(titulo); return carpetaSitio; } };
  const iniciar = async () => { const p = armar({ deps }); p.app.arrancar(); await hasta(() => p.estado.fase === 'inicio', { que: 'el inicio' }); return p; };
  const terminar = async p => { await p.app.salir(0); await p.terminado; };

  // 1) una sola, reconocida por su contenido (hay otra con el mismo nombre, pero distinta)
  let p = await iniciar();
  assert.match((await accion('soltar-carpeta', { nombre: 'mi-pagina', archivos: [{ nombre: 'index.html', tamano: 10 }, { nombre: 'estilos.css', tamano: 6 }], carpetas: [] })).mensaje, /Listo: mi-pagina/);
  await hasta(() => p.estado.fase === 'preparando', { que: 'seguir con esa carpeta' });
  assert.equal(p.app.sitio.carpeta, join(raizP, 'a', 'mi-pagina'));
  await terminar(p);

  // 2) dos copias iguales: se pregunta cuál
  p = await iniciar();
  const gemelas = { nombre: 'gemelas', archivos: [{ nombre: 'index.html', tamano: 10 }, { nombre: 'app.js', tamano: 1 }], carpetas: [] };
  assert.match((await accion('soltar-carpeta', gemelas)).mensaje, /2 carpetas/);
  assert.equal(p.estado.fase, 'inicio');
  assert.equal(p.estado.soltada.nombre, 'gemelas');
  assert.equal(p.estado.soltada.candidatas.length, 2);
  assert.ok((await accion('usar-soltada', '9')).error);
  assert.match((await accion('usar-soltada', '1')).mensaje, /Listo: gemelas/);
  await hasta(() => p.estado.fase === 'preparando');
  assert.equal(p.estado.soltada, null);
  assert.ok(/gemelas$/.test(p.app.sitio.carpeta));
  await terminar(p);

  // 3) no está en el disco (o está en otro lugar): se abre la ventana para elegirla
  p = await iniciar();
  assert.match((await accion('soltar-carpeta', { nombre: 'no-esta-en-ningun-lado', archivos: [{ nombre: 'index.html', tamano: 1 }], carpetas: [] })).mensaje, /Listo: mi-sitio/);
  assert.match(elegidas[0], /no-esta-en-ningun-lado/);
  await terminar(p);

  // 4) lo que no es una carpeta no se acepta, y con todo andando no se puede elegir (hay que pasar por «Cambiar qué mostrar»)
  p = await iniciar();
  assert.ok((await accion('soltar-carpeta', { nombre: '../afuera', archivos: [] })).error);
  assert.ok((await accion('soltar-carpeta', 'hola')).error);
  await accion('usar-reciente', '0');
  await hasta(() => p.estado.fase === 'preparando');
  p.adb.cambiar('device');
  await hasta(() => p.estado.fase === 'corriendo');
  assert.match((await accion('soltar-carpeta', gemelas)).error, /Ahora no se está eligiendo/);
  await terminar(p);
});

test('sin opciones: el panel ofrece la carpeta usada antes, y se elige desde ahí', async () => {
  const p = armar();
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'inicio' && p.estado.opciones.recientes.length > 0, { que: 'mostrar las carpetas usadas' });
  assert.equal(p.estado.opciones.recientes[0].nombre, 'mi-sitio');
  // otra acción que todavía no corresponde
  assert.ok((await accion('recargar')).error);
  assert.match((await accion('usar-reciente', '0')).mensaje, /Listo: mi-sitio/);
  await hasta(() => p.estado.fase === 'preparando');
  p.adb.cambiar('device');
  await hasta(() => p.estado.fase === 'corriendo');
  assert.equal(p.app.sitio.carpeta, carpetaSitio);
  await p.app.salir(0);
  await p.terminado;
});

test('con un servidor: respeta el túnel que ya estaba, avisa si se cae y recarga cuando vuelve', async () => {
  const servidor = createServer((_, r) => r.end('<!doctype html><h1>Servidor</h1>'));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  const p = armar({ opciones: { puerto: String(puerto) }, deps: { servidores: { conocidos: [], puertoAbierto, detectar } } });
  p.adb.reverses.add(puerto);   // otro programa ya había conectado este puerto
  await arrancarHastaCorrer(p);
  assert.equal(p.app.sitio.tipo, 'servidor');
  // no sabe dónde está el código: lo pide, en vez de prometer recargar al guardar
  assert.equal(p.estado.necesitaCodigo, true);

  await new Promise(r => servidor.close(r));
  await hasta(() => p.estado.servidorOk === false, { que: 'notar que se cayó' });
  assert.match((await accion('recargar')).error, /apagado/);
  await new Promise(r => servidor.listen(puerto, '127.0.0.1', r));
  await hasta(() => p.estado.servidorOk === true && p.chrome.recargas === 1, { que: 'recargar cuando vuelve' });

  await p.app.salir(0);
  await p.terminado;
  servidor.close();
  assert.ok(p.adb.reverses.has(puerto), 'quitó un túnel que era de otro programa');
});

test('sin ADB: espera, el panel lo descarga y sigue solo', async () => {
  let hayAdb = false;
  const avances = [];
  const p = armar({
    opciones: { carpeta: carpetaSitio },
    deps: {
      buscarAdb: () => (hayAdb ? 'adb-simulado' : null),
      descargarAdb: async alAvanzar => { alAvanzar(50); avances.push(50); alAvanzar(100); hayAdb = true; return join(temporal, 'adb'); }
    }
  });
  p.app.arrancar();
  await hasta(() => p.estado.pasos.adb === 'falta');
  assert.equal(p.estado.fase, 'adb');
  assert.match((await accion('instalar-adb')).mensaje, /Descargando ADB/);
  await hasta(() => p.estado.fase === 'preparando', { que: 'seguir después de descargar' });
  assert.deepEqual(avances, [50]);
  assert.equal(p.estado.descargaAdb, null);
  assert.equal(p.estado.pasos.adb, 'ok');
  await p.app.salir(0);
  await p.terminado;
});

test('el idioma se cambia desde el panel y los mensajes siguen en ese idioma', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  try {
    assert.equal((await accion('idioma', 'en')).mensaje, 'Done: panel in English.');
    assert.equal(p.estado.idioma, 'en');
    assert.equal(textosPanel()['panel.recargar'], 'Reload');
    assert.equal((await (await fetch(`${PANEL}/api/textos`)).json())['panel.recargar'], 'Reload');
    assert.equal((await accion('recargar')).mensaje, 'Phone reloaded');
    assert.match(actividad(p.estado), /Phone reloaded \(manually\)\./);
    p.chrome.evento('Runtime.exceptionThrown', excepcion('ReferenceError: x is not defined'));
    assert.match(p.estado.avisos[0].simple, /uses `x`, but it does not exist/);
    // queda recordado para la próxima vez
    const { preferencia } = await import('../src/lugares.mjs');
    assert.equal(preferencia('idioma'), 'en');
  } finally {
    await accion('idioma', 'es');
    await p.app.salir(0);
    await p.terminado;
  }
});

test('revisar el sitio, simular la red y sacar una captura', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  assert.equal((await accion('revisar')).mensaje, 'Todo bien');
  assert.ok(p.estado.revision.puntos.every(x => x.nivel === 'ok'));
  assert.equal((await accion('red', 'lenta')).mensaje, 'Red: 3G lenta');
  assert.deepEqual(p.chrome.redes, ['lenta']);
  assert.equal(p.chrome.recargas, 1, 'al cambiar la red recarga');
  // la red simulada se vuelve a pedir si se reconecta la pestaña
  p.chrome.perderPestana();
  await hasta(() => p.estado.consola === true);
  assert.deepEqual(p.chrome.redes, ['lenta', 'lenta']);
  const captura = await accion('captura');
  assert.match(captura.mensaje, /Captura guardada/);
  assert.equal(p.app.interno.capturas.length, 1);
  await p.app.salir(0);
  await p.terminado;
});

test('al cambiar de sitio no se arrastra lo del anterior (consola, red, elemento inspeccionado, datos), y el diagnóstico no lleva lo que va después del ? de la dirección', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  p.chrome.evento('Runtime.consoleAPICalled', { type: 'log', args: [{ type: 'string', value: 'del sitio anterior' }] });
  p.chrome.evento('Network.requestWillBeSent', { requestId: '9', loaderId: '9', frameId: 'F', type: 'Document', timestamp: 1, request: { url: `${p.app.sitio.origen}/`, method: 'GET' } });
  p.chrome.elemento = { selector: 'h1', etiqueta: 'h1', rect: { x: 0, y: 0, ancho: 10, alto: 10 }, pantalla: { ancho: 411, alto: 773 }, estilos: {}, atributos: [] };
  await accion('inspeccionar', { x: 0.1, y: 0.1 });
  await hasta(() => p.estado.pedidos.total === 1, { que: 'juntar el pedido' });
  assert.ok(p.estado.consolaLineas.length && p.estado.inspeccion);
  p.estado.celular.url = `${p.app.sitio.origen}/pagina?token=secreto123#clave`;
  const { texto } = await accion('diagnostico');
  assert.match(texto, /Open page: http:\/\/localhost:\d+\/pagina\n/);
  assert.ok(!texto.includes('secreto123') && !texto.includes('clave'), 'el diagnóstico no tiene que llevar la consulta de la dirección');

  assert.deepEqual(await accion('cambiar-sitio'), {});
  await hasta(() => p.estado.fase === 'inicio', { que: 'volver al inicio' });
  await accion('usar-reciente', '0');
  await hasta(() => p.estado.fase === 'corriendo', { que: 'seguir con el sitio nuevo' });
  assert.deepEqual([p.estado.consolaLineas.length, p.estado.pedidos.total, p.estado.inspeccion, p.estado.datosSitio], [0, 0, null, null]);
  await p.app.salir(0);
  await p.terminado;
});

test('dos pedidos de conexión con la pestaña a la vez comparten una sola conexión, y lo enorme que manda la página se corta', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const { conectarConsola } = await import('../src/app/conexion.mjs');
  p.chrome.cerrar();
  const antes = p.chrome.conexiones;
  const [a, b] = await Promise.all([conectarConsola(p.app, 3), conectarConsola(p.app, 3)]);
  assert.deepEqual([a, b], [true, true]);
  assert.equal(p.chrome.conexiones, antes + 1, 'tiene que haberse conectado una sola vez');
  assert.equal(p.app.conectando, null);

  // un console.log de megas y una dirección enorme no inflan el estado
  p.chrome.evento('Runtime.consoleAPICalled', { type: 'log', args: [{ type: 'string', value: 'x'.repeat(5_000_000) }] });
  p.chrome.evento('Runtime.consoleAPICalled', { type: 'error', args: [{ type: 'string', value: 'y'.repeat(5_000_000) }] });
  p.chrome.evento('Network.requestWillBeSent', { requestId: '7', loaderId: '7', frameId: 'F', type: 'Image', timestamp: 1, request: { url: `data:image/png;base64,${'A'.repeat(3_000_000)}`, method: 'GET' } });
  p.chrome.evento('Page.frameNavigated', { frame: { id: 'F', url: `data:text/html,${'z'.repeat(1_000_000)}` } });
  await hasta(() => p.estado.pedidos.total === 1, { que: 'juntar el pedido' });
  assert.ok(p.estado.consolaLineas[0].texto.length <= 2001);
  assert.ok(p.estado.avisos[0].texto.length <= 2001);
  assert.ok(p.estado.pedidos.filas[0].url.length <= 2000);
  assert.ok(p.estado.celular.url.length <= 2001);
  assert.ok(JSON.stringify(p.estado).length < 60_000, 'el estado que va al panel tiene que ser chico');
  await p.app.salir(0);
  await p.terminado;
});

test('una condición que Chrome no acepta no impide aplicar las demás, y los nombres raros no rompen nada', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  for (const clave of ['__proto__', 'constructor', 'toString', 5, null]) assert.match((await accion('condicion', { clave, valor: 'x' })).error, /no existe/);
  // Chrome rechaza el cambio de lugar: el procesador lento se aplica igual y se avisa el error
  p.chrome.lugar = async () => { throw new Error('Emulation.setLocaleOverride no existe en este Chrome'); };
  p.estado.lento = true;
  assert.ok((await accion('condicion', { clave: 'lugar', valor: 'madrid' })).error);
  assert.equal(p.chrome.cpus.at(-1), 4, 'el procesador lento se aplicó igual');
  assert.equal(p.estado.condiciones.lugar, 'real', 'lo que no se aceptó no queda marcado');
  await p.app.salir(0);
  await p.terminado;
});

// ---------- Prender el servidor del proyecto (opcional) ----------

// Un proyecto de mentira (con package.json) y un servidor de mentira para «prender»: lo único que no es de verdad es
// el proceso (iniciarProyecto se reemplaza); el panel, las preferencias y el resto del programa sí.
let proyectosCreados = 0;
function proyectoDePrueba(scripts = { dev: 'vite' }) {
  const carpeta = join(temporal, `proyecto-${++proyectosCreados}`);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'package.json'), JSON.stringify({ name: `proyecto-${proyectosCreados}`, scripts, devDependencies: { vite: '5' } }));
  mkdirSync(join(carpeta, 'node_modules'));
  return carpeta;
}
async function servidorDePrueba() {
  const s = createServer((_, r) => r.end('<h1>proyecto</h1>'));
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return s;
}
function iniciarFalso(servidor, modo = 'bien') {
  const registro = { llamadas: 0, apagados: 0, alCerrar: null };
  const fn = async (proyecto, { alLinea, alCerrar, senal }) => {
    registro.llamadas++;
    registro.alCerrar = alCerrar;
    alLinea('VITE v5 ready');
    if (modo === 'error') throw Object.assign(new Error('x'), { tipo: 'salio', codigo: 1, lineas: ['Error: falta una cosa'] });
    if (modo === 'colgar') await new Promise((_, no) => senal.addEventListener('abort', () => no(Object.assign(new Error('c'), { tipo: 'cancelado' })), { once: true }));
    return { puerto: servidor.address().port, detener: async () => { registro.apagados++; } };
  };
  return { fn, registro };
}

test('con un proyecto, el panel ofrece prender el servidor (sin prenderlo), y al aceptar lo prende, lo muestra y lo apaga al cerrar', async () => {
  const carpeta = proyectoDePrueba();
  const servidor = await servidorDePrueba();
  const { fn, registro } = iniciarFalso(servidor);
  const p = armar({ cwd: carpeta, deps: { iniciarProyecto: fn } });
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'inicio', { que: 'el inicio' });
  await hasta(() => p.estado.opciones.proyecto, { que: 'la oferta' });
  assert.deepEqual([p.estado.opciones.proyecto.marco, p.estado.opciones.proyecto.texto, p.estado.opciones.proyecto.faltaInstalar], ['vite', 'npm run dev', false]);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(registro.llamadas, 0, 'no se prende nada sin que se pida');

  await accion('proyecto-iniciar', 'una');
  await hasta(() => p.estado.fase === 'preparando', { que: 'seguir con el servidor prendido' });
  assert.equal(registro.llamadas, 1);
  assert.equal(p.app.sitio.puerto, servidor.address().port);
  assert.equal(p.app.sitio.carpeta, carpeta, 'se vigila el código del proyecto para recargar al guardar');
  assert.equal(p.estado.necesitaCodigo, false);
  assert.deepEqual([p.estado.servidorPropio.texto, p.estado.servidorPropio.cerrado], ['npm run dev', false]);
  assert.ok(p.estado.servidorPropio.lineas.includes('VITE v5 ready'));
  assert.equal(p.estado.arranque, null);

  await p.app.salir(0);
  await p.terminado;
  assert.equal(registro.apagados, 1, 'el servidor que prendió celular-dev se apaga con él');
  servidor.close();
});

test('«ahora no» la esconde, «no preguntar más» la apaga para ese proyecto, y «siempre» lo prende solo la próxima vez', async () => {
  const servidor = await servidorDePrueba();
  // ahora no: se esconde hasta que se vuelve a abrir
  const a = proyectoDePrueba();
  let p = armar({ cwd: a, deps: { iniciarProyecto: iniciarFalso(servidor).fn } });
  p.app.arrancar();
  await hasta(() => p.estado.opciones.proyecto, { que: 'la oferta' });
  assert.match((await accion('proyecto-ocultar', 'ahora')).mensaje, /no lo prendo/);
  assert.equal(p.estado.opciones.proyecto, null);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(p.estado.opciones.proyecto, null, 'no vuelve a aparecer en la misma vez');
  await p.app.salir(0); await p.terminado;
  p = armar({ cwd: a, deps: { iniciarProyecto: iniciarFalso(servidor).fn } });
  p.app.arrancar();
  await hasta(() => p.estado.opciones.proyecto, { que: 'la oferta otra vez, en otra apertura' });
  // no preguntar más: se recuerda
  assert.match((await accion('proyecto-ocultar', 'nunca')).mensaje, /no te vuelvo a preguntar/);
  await p.app.salir(0); await p.terminado;
  p = armar({ cwd: a, deps: { iniciarProyecto: iniciarFalso(servidor).fn } });
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'inicio', { que: 'el inicio' });
  await new Promise(r => setTimeout(r, 250));
  assert.equal(p.estado.opciones.proyecto, null, 'no se vuelve a ofrecer para ese proyecto');
  await p.app.salir(0); await p.terminado;

  // siempre: la próxima vez arranca solo, sin pasar por el inicio
  const b = proyectoDePrueba();
  const primero = iniciarFalso(servidor);
  p = armar({ cwd: b, deps: { iniciarProyecto: primero.fn } });
  p.app.arrancar();
  await hasta(() => p.estado.opciones.proyecto, { que: 'la oferta' });
  await accion('proyecto-iniciar', 'siempre');
  await hasta(() => p.estado.fase === 'preparando');
  await p.app.salir(0); await p.terminado;
  const segundo = iniciarFalso(servidor);
  p = armar({ cwd: b, deps: { iniciarProyecto: segundo.fn } });
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'preparando', { que: 'arrancar solo, sin preguntar' });
  assert.equal(segundo.registro.llamadas, 1);
  assert.equal(p.estado.necesitaCodigo, false);
  await p.app.salir(0); await p.terminado;
  assert.equal(segundo.registro.apagados, 1);
  // pero si el comando cambió (otro script), vuelve a preguntar: lo que se aceptó era otra cosa
  writeFileSync(join(b, 'package.json'), JSON.stringify({ name: 'b', scripts: { start: 'node otra-cosa.js' } }));
  const tercero = iniciarFalso(servidor);
  p = armar({ cwd: b, deps: { iniciarProyecto: tercero.fn } });
  p.app.arrancar();
  await hasta(() => p.estado.opciones.proyecto, { que: 'preguntar de nuevo por el comando nuevo' });
  assert.equal(p.estado.opciones.proyecto.texto, 'npm run start');
  assert.equal(tercero.registro.llamadas, 0);
  await p.app.salir(0); await p.terminado;
  servidor.close();
});

test('si el servidor no arranca se muestra por qué y se puede reintentar o cancelar; cancelar mientras arranca lo corta', async () => {
  const carpeta = proyectoDePrueba();
  const servidor = await servidorDePrueba();
  let modo = 'error';
  const registro = { llamadas: 0 };
  const fn = (...args) => { registro.llamadas++; return iniciarFalso(servidor, modo).fn(...args); };
  const p = armar({ cwd: carpeta, deps: { iniciarProyecto: fn } });
  p.app.arrancar();
  await hasta(() => p.estado.opciones.proyecto, { que: 'la oferta' });
  await accion('proyecto-iniciar', 'una');
  await hasta(() => p.estado.arranque && p.estado.arranque.fase === 'error', { que: 'el error' });
  assert.match(p.estado.arranque.error, /se cerró al arrancar/);
  assert.deepEqual(p.estado.arranque.lineas, ['Error: falta una cosa']);
  assert.equal(p.estado.fase, 'inicio', 'sigue en el inicio: se puede elegir otra cosa');
  // sin dependencias instaladas, el error lo dice
  rmSync(join(carpeta, 'node_modules'), { recursive: true });
  await accion('proyecto-iniciar', 'una');
  await hasta(() => p.estado.arranque && /install/.test(p.estado.arranque.error), { que: 'el aviso de instalar' });
  mkdirSync(join(carpeta, 'node_modules'));
  // cancelar mientras arranca
  modo = 'colgar';
  await accion('proyecto-iniciar', 'una');
  await hasta(() => p.estado.arranque && p.estado.arranque.fase === 'iniciando', { que: 'el arranque' });
  assert.match((await accion('proyecto-iniciar', 'una')).mensaje, /Ya se está prendiendo/);
  await accion('proyecto-cancelar');
  await hasta(() => p.estado.arranque === null, { que: 'cancelar' });
  assert.equal(p.estado.fase, 'inicio');
  // y ahora sí anda
  modo = 'bien';
  await accion('proyecto-iniciar', 'una');
  await hasta(() => p.estado.fase === 'preparando', { que: 'prender bien' });
  await p.app.salir(0); await p.terminado;
  servidor.close();
});

test('--iniciar prende el servidor sin pasar por el inicio; si ya hay uno prendido lo usa sin tocarlo; sin proyecto avisa', async () => {
  const carpeta = proyectoDePrueba();
  const servidor = await servidorDePrueba();
  const { fn, registro } = iniciarFalso(servidor);
  let p = armar({ cwd: carpeta, opciones: { iniciar: true }, deps: { iniciarProyecto: fn } });
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'preparando', { que: 'arrancar sin preguntar' });
  assert.equal(registro.llamadas, 1);
  await p.app.salir(0); await p.terminado;
  assert.equal(registro.apagados, 1);

  // ya hay un servidor en el puerto del proyecto: se usa, sin prender otro ni apagarlo al salir
  const otro = iniciarFalso(servidor);
  const puerto = servidor.address().port;
  p = armar({ cwd: carpeta, opciones: { iniciar: true }, deps: { iniciarProyecto: otro.fn, detectarProyecto: c => ({ ...detectarReal(c), puertoProbable: puerto }), servidores: { conocidos: [], puertoAbierto, detectar: async ({ puerto: pp } = {}) => (pp === puerto ? { puerto, ruta: '/', liveServer: false } : null) } } });
  p.app.arrancar();
  await hasta(() => p.estado.fase === 'preparando', { que: 'usar el que ya está' });
  assert.equal(otro.registro.llamadas, 0);
  assert.equal(p.estado.servidorPropio, null);
  await p.app.salir(0); await p.terminado;
  assert.equal(otro.registro.apagados, 0, 'un servidor que no prendió celular-dev no se apaga');

  // sin proyecto: avisa y sale con error
  p = armar({ cwd: temporal, opciones: { iniciar: true }, deps: { iniciarProyecto: fn } });
  // como hace bin/celular.mjs: un error al arrancar muestra el mensaje y sale con 1
  let mensaje = '';
  p.app.arrancar().catch(error => { mensaje = error.message; return p.app.salir(1); });
  await hasta(() => p.codigo === 1, { que: 'salir con error' });
  assert.match(mensaje, /no parece un proyecto/);
  servidor.close();
});

test('si el servidor que prendió celular-dev se cierra solo se avisa, y «Apagar el servidor» lo apaga', async () => {
  const carpeta = proyectoDePrueba();
  const servidor = await servidorDePrueba();
  const { fn, registro } = iniciarFalso(servidor);
  const p = armar({ cwd: carpeta, deps: { iniciarProyecto: fn } });
  p.app.arrancar();
  await hasta(() => p.estado.opciones.proyecto, { que: 'la oferta' });
  await accion('proyecto-iniciar', 'una');
  await hasta(() => p.estado.fase === 'preparando');
  p.adb.cambiar('device');
  await hasta(() => p.estado.fase === 'corriendo');
  assert.match((await accion('servidor-apagar')).mensaje, /apagado/);
  assert.equal(registro.apagados, 1);
  assert.equal(p.estado.servidorPropio, null);
  assert.match((await accion('servidor-apagar')).error, /ningún servidor/);
  await p.app.salir(0); await p.terminado;
  assert.equal(registro.apagados, 1, 'no se apaga dos veces');

  // se cierra solo
  const dos = iniciarFalso(servidor);
  const q = armar({ cwd: carpeta, opciones: { iniciar: true }, deps: { iniciarProyecto: dos.fn } });
  q.app.arrancar();
  await hasta(() => q.estado.fase === 'preparando');
  q.adb.cambiar('device');
  await hasta(() => q.estado.fase === 'corriendo');
  dos.registro.alCerrar(3);
  await hasta(() => q.estado.servidorPropio && q.estado.servidorPropio.cerrado, { que: 'avisar que se cerró' });
  assert.match(actividad(q.estado), /se cerró solo \(código 3\)/);
  await q.app.salir(0); await q.terminado;
  servidor.close();
});

test('el panel se abre en su ventana y cerrarla cierra celular-dev; si no hay ventana, en el navegador', async () => {
  delete process.env.CELULAR_NO_ABRIR;
  try {
    let alCerrar; const navegador = [];
    const p = armar({ opciones: { carpeta: carpetaSitio }, deps: { abrirNavegador: u => navegador.push(u), abrirVentana: (url, perfil, cb) => { alCerrar = cb; return { cerrar() {} }; } } });
    await arrancarHastaCorrer(p);
    assert.ok(p.app.ventana);
    assert.deepEqual(navegador, []);
    alCerrar(true);   // la persona cerró la ventana
    assert.equal(await p.terminado, 0);

    const q = armar({ opciones: { carpeta: carpetaSitio }, deps: { abrirNavegador: u => navegador.push(u), abrirVentana: () => null } });
    await arrancarHastaCorrer(q);
    assert.equal(navegador.length, 1);   // sin Chrome ni Edge: pestaña común
    await q.app.salir(0); await q.terminado;

    const r = armar({ opciones: { carpeta: carpetaSitio, navegador: true }, deps: { abrirNavegador: u => navegador.push(u), abrirVentana: () => { throw new Error('no debía abrir ventana'); } } });
    await arrancarHastaCorrer(r);
    assert.equal(navegador.length, 2);   // con --navegador, siempre pestaña
    await r.app.salir(0); await r.terminado;
  } finally { process.env.CELULAR_NO_ABRIR = '1'; }
});

test('si tu servidor solo escucha en IPv6, el túnel del celular apunta a un puente y se cierra al salir', async () => {
  const servidor = createServer((_, r) => r.end('<!doctype html><title>x</title>'));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  let cerrado = false;
  const p = armar({ opciones: { puerto: String(puerto) }, deps: {
    alcanzablePorIpv4: async () => false,   // como Vite en Windows: solo responde en localhost
    crearPuente: async () => ({ puerto: 45678, cerrar: () => { cerrado = true; } }),
    servidores: { conocidos: [], puertoAbierto, detectar }
  } });
  await arrancarHastaCorrer(p);
  assert.equal(p.adb.destinos.get(puerto), 45678, 'el túnel apunta al puente');
  assert.ok(p.estado.actividad.some(a => /IPv6/.test(a.texto)), 'se le cuenta a la persona');
  await p.app.salir(0);
  await p.terminado;
  assert.equal(cerrado, true, 'el puente se cierra al salir');
  servidor.close(); servidor.closeAllConnections();
});

test('si tu servidor responde por IPv4, el túnel va directo y no se arma ningún puente', async () => {
  const servidor = createServer((_, r) => r.end('<!doctype html><title>x</title>'));
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  let creado = false;
  const p = armar({ opciones: { puerto: String(puerto) }, deps: { crearPuente: async () => { creado = true; return { puerto: 1, cerrar() {} }; }, servidores: { conocidos: [], puertoAbierto, detectar } } });
  await arrancarHastaCorrer(p);
  assert.equal(p.adb.destinos.get(puerto), puerto);
  assert.equal(creado, false);
  await p.app.salir(0);
  await p.terminado;
  servidor.close(); servidor.closeAllConnections();
});

test('el espejo sigue andando después de desconectar y volver a conectar el celular (con el panel mirando todo el tiempo)', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const recibido = [];
  const pedido = request(`${PANEL}/api/espejo.mjpg`, { headers: { Host: `localhost:${process.env.CELULAR_PUERTO_PANEL}` } });
  const respuesta = await new Promise((resolver, rechazar) => { pedido.on('response', resolver); pedido.on('error', rechazar); pedido.end(); });
  respuesta.on('data', d => recibido.push(d));
  await hasta(() => p.chrome.espejo, { que: 'pedir cuadros' });
  const antes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  p.chrome.cuadro(antes);
  await hasta(() => Buffer.concat(recibido).includes(antes), { que: 'el primer cuadro' });

  // se desconecta el cable y vuelve (el panel sigue mirando: no suelta el flujo)
  p.adb.cambiar('sin-celular');
  await hasta(() => !p.chrome.conectado, { que: 'perder la consola' });
  p.chrome.espejo = false;   // la conexión nueva con Chrome arranca sin el pedido de cuadros
  p.adb.cambiar('device');
  await hasta(() => /Celular reconectado, con su consola/.test(actividad(p.estado)), { que: 'reconectar' });
  await hasta(() => p.chrome.espejo, { que: 'volver a pedir cuadros después de reconectar' });

  const despues = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 0xff, 0xd9]);
  p.chrome.cuadro(despues);
  await hasta(() => Buffer.concat(recibido).includes(despues), { que: 'el cuadro de después de reconectar' });
  respuesta.destroy();
  await p.app.salir(0);
  await p.terminado;
});

test('si Chrome del celular ya no atiende la pestaña (conexión zombi), recargar reconecta y prueba de nuevo, y el espejo vuelve', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const conexionesAntes = p.chrome.conexiones;
  p.chrome.sinAdjuntar = true;
  const r = await accion('recargar');
  assert.ok(!r.error, 'después de reconectar, recarga');
  assert.equal(p.chrome.conexiones, conexionesAntes + 1, 'se volvió a conectar');
  assert.ok(p.chrome.conectado);
  assert.equal(p.chrome.recargas >= 1, true);
  assert.match(actividad(p.estado), /conexión con la pestaña del celular estaba muerta/);
  await p.app.salir(0);
  await p.terminado;
});

test('si la pestaña se desengancha o se cuelga (Inspector.detached), celular-dev se reconecta solo', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const conexionesAntes = p.chrome.conexiones;
  p.chrome.evento('Inspector.detached', { reason: 'target_closed' });
  await hasta(() => p.chrome.conexiones === conexionesAntes + 1 && p.estado.consola === true, { que: 'reconectar la pestaña' });
  await p.app.salir(0);
  await p.terminado;
});

test('el espejo congelado por una conexión muerta se recupera: la captura nítida falla con «Not attached» y se reconecta', async () => {
  const p = armar({ opciones: { carpeta: carpetaSitio } });
  await arrancarHastaCorrer(p);
  const pedido = request(`${PANEL}/api/espejo.mjpg`, { headers: { Host: `localhost:${process.env.CELULAR_PUERTO_PANEL}` } });
  const respuesta = await new Promise((resolver, rechazar) => { pedido.on('response', resolver); pedido.on('error', rechazar); pedido.end(); });
  respuesta.resume();
  await hasta(() => p.chrome.espejo, { que: 'pedir cuadros' });
  const conexionesAntes = p.chrome.conexiones;
  p.chrome.nitidaMuerta = true;
  p.chrome.cuadro(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]));   // al quedar quieta, intenta la captura nítida y falla
  await hasta(() => p.chrome.conexiones === conexionesAntes + 1, { que: 'reconectar después de la captura fallida' });
  p.chrome.nitidaMuerta = false;
  respuesta.destroy();
  await p.app.salir(0);
  await p.terminado;
});
