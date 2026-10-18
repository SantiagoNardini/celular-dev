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
