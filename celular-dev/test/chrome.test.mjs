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
  // avisa que llegó un rato después (así Chrome no manda más de unos 12 por segundo)
  assert.equal(enviados.length, 0);
  await new Promise(r => setTimeout(r, 120));
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

test('los cuadros seguidos se piden a unos 30 por segundo como mucho', async () => {
  const chrome = new Chrome(0);
  const avisos = [];
  chrome.enviar = async (metodo, params) => { if (metodo === 'Page.screencastFrameAck') avisos.push([params.sessionId, Date.now()]); };
  const cuadro = n => chrome.recibir({ method: 'Page.screencastFrame', params: { data: '', sessionId: n, metadata: { deviceWidth: 1, deviceHeight: 1 } } });
  const inicio = Date.now();
  cuadro(1); cuadro(2); cuadro(3);
  await new Promise(r => setTimeout(r, 150));
  assert.deepEqual(avisos.map(a => a[0]), [1, 2, 3]);
  // el primero enseguida; los otros, separados unos 33 ms
  assert.ok(avisos[0][1] - inicio < 25, 'el primero tardó');
  assert.ok(avisos[2][1] - inicio >= 60, 'no esperó entre cuadros');
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
