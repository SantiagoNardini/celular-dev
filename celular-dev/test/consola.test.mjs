import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Traductor, corta } from '../src/consola.mjs';

const origen = 'http://localhost:5500';
const t = (todo = false) => new Traductor({ origen, todo });

test('corta saca el origen de las direcciones', () => {
  assert.equal(corta('http://localhost:5500/js/app.js', origen), '/js/app.js');
  assert.equal(corta('http://localhost:5500', origen), '/');
  assert.equal(corta('https://otro.com/x.js', origen), 'https://otro.com/x.js');
});

test('excepción: primera línea del mensaje y lugar contando desde 1', () => {
  const r = t().traducir('Runtime.exceptionThrown', { exceptionDetails: {
    text: 'Uncaught', exception: { description: 'ReferenceError: x is not defined\n    at a (app.js:4:3)' },
    stackTrace: { callFrames: [{ url: `${origen}/app.js`, lineNumber: 3, columnNumber: 2 }] }
  } });
  assert.deepEqual(r, { nivel: 'error', tipo: 'excepcion', texto: 'ReferenceError: x is not defined', donde: '/app.js:4:3' });
});

test('consola: listas y objetos se muestran legibles', () => {
  const r = t(true).traducir('Runtime.consoleAPICalled', { type: 'log', args: [
    { type: 'string', value: 'datos' },
    { type: 'object', subtype: 'array', preview: { properties: [{ name: '0', value: '1' }, { name: '1', value: '2' }] } },
    { type: 'object', preview: { properties: [{ name: 'a', value: '1' }], overflow: true } }
  ] });
  assert.equal(r.texto, 'console.log: datos [1, 2] {a: 1, …}');
});

test('console.log se oculta salvo con --todo; warn y error siempre', () => {
  const log = { type: 'log', args: [{ type: 'string', value: 'hola' }] };
  assert.equal(t().traducir('Runtime.consoleAPICalled', log), null);
  assert.ok(t(true).traducir('Runtime.consoleAPICalled', log));
  assert.equal(t().traducir('Runtime.consoleAPICalled', { type: 'warning', args: [{ type: 'string', value: 'ojo' }] }).nivel, 'aviso');
  assert.equal(t().traducir('Runtime.consoleAPICalled', { type: 'error', args: [{ type: 'string', value: 'mal' }] }).nivel, 'error');
});

test('HTTP: 404 es aviso, 500 es error, el favicon que falta no cuenta', () => {
  const resp = (url, status) => t().traducir('Network.responseReceived', { response: { url: `${origen}${url}`, status } });
  assert.equal(resp('/ok.js', 200), null);
  assert.equal(resp('/falta.png', 404).nivel, 'aviso');
  assert.equal(resp('/api', 500).nivel, 'error');
  assert.equal(resp('/favicon.ico', 404), null);
});

test('pedido fallido: recuerda la dirección del pedido y no cuenta los cancelados', () => {
  const tr = t();
  tr.traducir('Network.requestWillBeSent', { requestId: '7', request: { url: `${origen}/datos.json` } });
  const r = tr.traducir('Network.loadingFailed', { requestId: '7', errorText: 'net::ERR_FAILED' });
  assert.equal(r.dato.url, '/datos.json');
  assert.equal(tr.traducir('Network.loadingFailed', { requestId: '8', canceled: true }), null);
});

test('carga de página y eventos desconocidos', () => {
  assert.equal(t().traducir('Page.loadEventFired', {}).tipo, 'carga');
  assert.equal(t().traducir('Algo.raro', {}), null);
});

import { limpiarControl } from '../src/pantalla.mjs';
test('lo que viene de afuera se muestra sin códigos de control: no cambia la terminal ni falsifica renglones del registro', () => {
  assert.equal(limpiarControl('hola\x1b[31m rojo\x1b]0;título falso\x07 fin'), 'hola [31m rojo ]0;título falso  fin');
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(limpiarControl('a\x1b[2Jb\x00c\x9bd\x07')));
  assert.equal(limpiarControl('uno\ndos\r\ntres'), 'uno ⏎ dos ⏎ tres');
  assert.equal(limpiarControl(null), '');
  assert.equal(limpiarControl('con tilde ñ y emoji 🙂'), 'con tilde ñ y emoji 🙂');
});
