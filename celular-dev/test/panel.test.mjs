import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

// un puerto propio, para no chocar con una copia de celular-dev que esté abierta
process.env.CELULAR_PUERTO_PANEL = '47899';
const { iniciarPanel, PUERTO_PANEL } = await import('../src/panel.mjs');

let panel;
const acciones = [];
const estado = { fase: 'inicio', contador: 0 };
before(async () => {
  panel = await iniciarPanel({
    obtenerEstado: () => estado,
    alAccion: async (accion, valor) => { acciones.push([accion, valor]); return { mensaje: 'hecho' }; },
    obtenerTextos: () => ({ 'panel.recargar': 'Recargar' }),
    alEspejo: (pedido, respuesta) => { respuesta.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=cuadro' }); respuesta.end('--cuadro'); }
  });
});
after(() => panel && panel.cerrar());

const pedir = ({ ruta = '/', metodo = 'GET', host = `localhost:${PUERTO_PANEL}`, encabezados = {}, cuerpo } = {}) =>
  new Promise((resolver, rechazar) => {
    const p = request({ host: '127.0.0.1', port: PUERTO_PANEL, path: ruta, method: metodo, headers: { Host: host, ...encabezados } }, r => {
      let datos = '';
      r.on('data', d => { datos += d; });
      r.on('end', () => resolver({ estado: r.statusCode, tipo: r.headers['content-type'], datos }));
    });
    p.on('error', rechazar);
    p.end(cuerpo);
  });

test('sirve el panel y el estado', async () => {
  const r = await pedir();
  assert.equal(r.estado, 200);
  assert.match(r.datos, /celular-dev/);
  assert.deepEqual(JSON.parse((await pedir({ ruta: '/api/estado' })).datos), estado);
});

test('rechaza pedidos con otro Host (una página de internet apuntando a 127.0.0.1)', async () => {
  assert.equal((await pedir({ host: 'sitio-malo.com' })).estado, 403);
  assert.equal((await pedir({ host: `sitio-malo.com:${PUERTO_PANEL}` })).estado, 403);
});

test('las acciones exigen el encabezado propio', async () => {
  const sin = await pedir({ ruta: '/api/accion', metodo: 'POST', cuerpo: '{"accion":"recargar"}' });
  assert.equal(sin.estado, 403);
  assert.equal(acciones.length, 0);
  const con = await pedir({ ruta: '/api/accion', metodo: 'POST', encabezados: { 'X-Celular': '1', 'Content-Type': 'application/json' }, cuerpo: '{"accion":"recargar","valor":"x"}' });
  assert.equal(JSON.parse(con.datos).mensaje, 'hecho');
  assert.deepEqual(acciones, [['recargar', 'x']]);
});

test('un cuerpo roto no lo tumba', async () => {
  const r = await pedir({ ruta: '/api/accion', metodo: 'POST', encabezados: { 'X-Celular': '1' }, cuerpo: '{roto' });
  assert.ok(JSON.parse(r.datos).error);
});

test('manda los textos del idioma elegido', async () => {
  assert.deepEqual(JSON.parse((await pedir({ ruta: '/api/textos' })).datos), { 'panel.recargar': 'Recargar' });
});

test('el espejo lo atiende el programa (video MJPEG)', async () => {
  const r = await pedir({ ruta: '/api/espejo.mjpg' });
  assert.equal(r.estado, 200);
  assert.match(r.tipo, /^multipart.x-mixed-replace/);
});

test('el espejo también exige el Host propio', async () => {
  assert.equal((await pedir({ ruta: '/api/espejo.mjpg', host: 'sitio-malo.com' })).estado, 403);
});

test('una segunda copia no puede abrir el panel (el puerto hace de candado)', async () => {
  assert.equal(await iniciarPanel({ obtenerEstado: () => ({}), alAccion: async () => ({}) }), null);
});

test('los cambios llegan por SSE', async () => {
  const r = await fetch(`http://localhost:${PUERTO_PANEL}/api/eventos`);
  const lector = r.body.getReader();
  const leer = async () => new TextDecoder().decode((await lector.read()).value);
  assert.match(await leer(), /"contador":0/);
  estado.contador = 5;
  panel.avisar();
  assert.match(await leer(), /"contador":5/);
  await lector.cancel();
});
