// El programa entero, de punta a punta, con un celular simulado (test/simulados.mjs): arrancar, abrir el
// sitio, errores, recargar al guardar, desconexiones, el espejo, el panel, el idioma y salir limpio.
// Lo demás es de verdad: el panel, el servidor de la carpeta, el vigía de archivos y lo que se recuerda.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { AdbSimulado, ChromeSimulado, uiCallada, hasta } from './simulados.mjs';
import { puertoAbierto, detectar } from '../src/servidor.mjs';

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
function armar({ opciones = {}, deps = {} } = {}) {
  const adb = new AdbSimulado();
  const piezas = { adb, chrome: null, terminado: null, codigo: null };
  piezas.terminado = new Promise(resolver => {
    piezas.app = crearApp({
      opciones,
      ui: uiCallada,
      cwd: temporal,
      tiempos: { opciones: 50, servidor: 60, reintento: 50, pestana: 10, adb: 30, chrome: 30 },
      deps: {
        buscarAdb: () => 'adb-simulado',
        crearAdb: () => adb,
        crearChrome: puerto => { piezas.chrome = new ChromeSimulado(puerto); adb.chrome = piezas.chrome; return piezas.chrome; },
        abrirNavegador: () => {}, abrirConElSistema: () => {}, hayAccesos: async () => true,
        elegirCarpeta: async () => null,
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
