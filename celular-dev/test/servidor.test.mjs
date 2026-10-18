import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { puertoAbierto, detectar } from '../src/servidor.mjs';

const prendidos = [];
after(() => prendidos.forEach(s => { s.close(); s.closeAllConnections(); }));

function servidor(responder) {
  return new Promise(resolver => {
    const s = createServer(responder).listen(0, '127.0.0.1', () => resolver(s.address().port));
    prendidos.push(s);
  });
}

test('puertoAbierto: sí con algo escuchando, no con el puerto libre', async () => {
  const puerto = await servidor((_, r) => r.end('ok'));
  assert.equal(await puertoAbierto(puerto), true);
  const libre = await servidor(() => {});
  prendidos.pop().close();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(await puertoAbierto(libre), false);
});

test('puertoAbierto no le pide ninguna página al servidor', async () => {
  let pedidos = 0;
  const puerto = await servidor((_, r) => { pedidos++; r.end(); });
  await puertoAbierto(puerto);
  await new Promise(r => setTimeout(r, 100));
  assert.equal(pedidos, 0);
});

test('Live Server sobre la carpeta del proyecto: encuentra el sitio en /dist/', async () => {
  const puerto = await servidor((pedido, r) => {
    if (pedido.url === '/dist/') return r.end('<html><title>Mi sitio</title><!-- Code injected by live-server --></html>');
    if (pedido.url === '/') return r.end('<title>listing directory /</title>');
    r.statusCode = 404; r.end();
  });
  assert.deepEqual(await detectar({ puerto }), { puerto, ruta: '/dist/', liveServer: true });
});

test('un servidor común en la raíz', async () => {
  const puerto = await servidor((_, r) => r.end('<title>Sitio</title>'));
  assert.deepEqual(await detectar({ puerto }), { puerto, ruta: '/', liveServer: false });
});
