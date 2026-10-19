// La conexión con el Chrome del celular, sin celular: lo que llega del espejo y cómo se avisa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chrome } from '../src/chrome.mjs';

test('un cuadro del espejo: la imagen, y el tamaño de la página sin la barra de Chrome', async () => {
  const chrome = new Chrome(0);
  const enviados = [];
  chrome.enviar = async (metodo, params) => { enviados.push([metodo, params]); };
  const cuadros = [];
  chrome.on('cuadro', c => cuadros.push(c));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  chrome.recibir({ method: 'Page.screencastFrame', params: { data: jpeg.toString('base64'), sessionId: 7, metadata: { deviceWidth: 411.43, deviceHeight: 829.14, offsetTop: 56 } } });
  assert.equal(cuadros.length, 1);
  assert.deepEqual(cuadros[0].datos, jpeg);
  assert.equal(cuadros[0].ancho, 411.43);
  assert.ok(Math.abs(cuadros[0].alto - 773.14) < 0.01);
  // avisa enseguida que llegó: así el próximo cambio sale sin esperar
  assert.deepEqual(enviados, [['Page.screencastFrameAck', { sessionId: 7 }]]);
});

test('los cuadros no se mezclan con los eventos de la consola', () => {
  const chrome = new Chrome(0);
  chrome.enviar = async () => {};
  const eventos = [];
  chrome.on('evento', m => eventos.push(m));
  chrome.recibir({ method: 'Runtime.consoleAPICalled', params: {} });
  chrome.recibir({ method: 'Page.screencastFrame', params: { data: '', sessionId: 1, metadata: { deviceWidth: 1, deviceHeight: 1 } } });
  assert.deepEqual(eventos, ['Runtime.consoleAPICalled']);
});

test('cada cuadro se avisa enseguida, aunque lleguen seguidos', () => {
  const chrome = new Chrome(0);
  const avisos = [];
  chrome.enviar = async (metodo, params) => { if (metodo === 'Page.screencastFrameAck') avisos.push(params.sessionId); };
  for (const n of [1, 2, 3]) chrome.recibir({ method: 'Page.screencastFrame', params: { data: '', sessionId: n, metadata: { deviceWidth: 1, deviceHeight: 1 } } });
  assert.deepEqual(avisos, [1, 2, 3]);
});

test('el espejo arranca con calidad 80, y la captura nítida pide JPEG 92 a resolución completa', async () => {
  const chrome = new Chrome(0);
  const pedidos = [];
  chrome.enviar = async (metodo, params) => {
    pedidos.push([metodo, params]);
    if (metodo === 'Page.getLayoutMetrics') return { cssVisualViewport: { pageX: 0, pageY: 500, clientWidth: 411.43, clientHeight: 773.14 } };
    return { data: Buffer.from('jpg').toString('base64') };
  };
  await chrome.iniciarEspejo();
  assert.equal(pedidos[0][0], 'Page.startScreencast');
  assert.equal(pedidos[0][1].quality, 80);
  assert.equal((await chrome.capturaNitida()).toString(), 'jpg');
  // recortada a la parte visible de la página (donde está desplazada), a escala 1: la resolución del celular
  assert.deepEqual(pedidos.at(-1), ['Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true, clip: { x: 0, y: 500, width: 411.43, height: 773.14, scale: 1 } }]);
});

test('si no hay medidas de la página, la captura nítida va sin recorte', async () => {
  const chrome = new Chrome(0);
  let ultima;
  chrome.enviar = async (metodo, params) => {
    if (metodo === 'Page.getLayoutMetrics') throw new Error('no contesta');
    ultima = params;
    return { data: Buffer.from('jpg').toString('base64') };
  };
  assert.equal((await chrome.capturaNitida()).toString(), 'jpg');
  assert.equal(ultima.clip, undefined);
});

test('la captura pide el PNG rápido', async () => {
  const chrome = new Chrome(0);
  let pedido;
  chrome.enviar = async (metodo, params) => { pedido = [metodo, params]; return { data: Buffer.from('png').toString('base64') }; };
  assert.equal((await chrome.captura()).toString(), 'png');
  assert.deepEqual(pedido, ['Page.captureScreenshot', { format: 'png', optimizeForSpeed: true }]);
});

test('un toque lleva la hora en segundos, como la pide Chrome', async () => {
  const chrome = new Chrome(0);
  let enviado;
  chrome.enviar = async (metodo, params) => { enviado = [metodo, params]; };
  await chrome.tocar('touchMove', 10, 20, 1792300000500);
  assert.equal(enviado[0], 'Input.dispatchTouchEvent');
  assert.equal(enviado[1].timestamp, 1792300000.5);
  assert.deepEqual(enviado[1].touchPoints.map(p => [p.x, p.y]), [[10, 20]]);
  await chrome.tocar('touchEnd', 10, 20);
  assert.deepEqual(enviado[1].touchPoints, []);
  assert.equal(enviado[1].timestamp, undefined);
});

test('simular otra pantalla: ancho, alto y densidad; sin medidas vuelve a la real', async () => {
  const chrome = new Chrome(0);
  const pedidos = [];
  chrome.enviar = async (metodo, params) => { pedidos.push([metodo, params]); };
  await chrome.tamano({ ancho: 360, alto: 640, densidad: 0 });
  assert.deepEqual(pedidos.at(-1), ['Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 0, mobile: true }]);
  await chrome.tamano(null);
  assert.equal(pedidos.at(-1)[0], 'Emulation.clearDeviceMetricsOverride');
});

test('el tamaño de la página en el celular sale de la parte visible, redondeado', async () => {
  const chrome = new Chrome(0);
  chrome.enviar = async () => ({ cssVisualViewport: { clientWidth: 411.43, clientHeight: 773.14 } });
  assert.deepEqual(await chrome.medidasPantalla(), { ancho: 411, alto: 773 });
});


test('el tema se manda a Chrome como dark / light (y vacío para el del celular); las demás condiciones, con sus valores de Chrome', async () => {
  const chrome = new Chrome(1);
  let enviado;
  chrome.enviar = async (metodo, params) => { enviado = [metodo, params]; };
  const valores = async condiciones => { await chrome.medios(condiciones); return Object.fromEntries(enviado[1].features.map(f => [f.name, f.value])); };
  assert.equal(enviado, undefined);
  assert.deepEqual(await valores({ esquema: 'oscuro', animaciones: 'reducidas', contraste: 'alto' }), { 'prefers-color-scheme': 'dark', 'prefers-reduced-motion': 'reduce', 'prefers-contrast': 'more' });
  assert.equal((await valores({ esquema: 'claro' }))['prefers-color-scheme'], 'light');
  assert.deepEqual(await valores({ esquema: 'auto', animaciones: 'normal', contraste: 'normal' }), { 'prefers-color-scheme': '', 'prefers-reduced-motion': '', 'prefers-contrast': '' });
  assert.equal(enviado[0], 'Emulation.setEmulatedMedia');
});
