import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { servirCarpeta, tieneSitio } from '../src/estatico.mjs';

let raiz, sitio, servidor;
before(async () => {
  raiz = mkdtempSync(join(tmpdir(), 'celular-estatico-'));
  sitio = join(raiz, 'sitio');
  mkdirSync(join(sitio, 'css'), { recursive: true });
  writeFileSync(join(sitio, 'index.html'), '<h1>hola</h1>');
  writeFileSync(join(sitio, 'css', 'estilos.css'), 'h1{}');
  writeFileSync(join(raiz, 'secreto.txt'), 'no se tiene que ver');
  servidor = await servirCarpeta(sitio);
});
after(() => { servidor.cerrar(); rmSync(raiz, { recursive: true, force: true }); });

// pedido crudo: fetch arregla los "../" de la dirección y no dejaría probar la salida de la carpeta
const pedir = ruta => new Promise((resolver, rechazar) => {
  request({ host: '127.0.0.1', port: servidor.puerto, path: ruta }, r => {
    let cuerpo = '';
    r.on('data', d => { cuerpo += d; });
    r.on('end', () => resolver({ estado: r.statusCode, tipo: r.headers['content-type'], cache: r.headers['cache-control'], cuerpo }));
  }).on('error', rechazar).end();
});

test('sabe si una carpeta tiene un sitio', () => {
  assert.equal(tieneSitio(sitio), true);
  assert.equal(tieneSitio(raiz), false);
});

test('sirve index.html en / y sin caché', async () => {
  const r = await pedir('/');
  assert.equal(r.estado, 200);
  assert.match(r.tipo, /text\/html/);
  assert.equal(r.cache, 'no-store');
  assert.equal(r.cuerpo, '<h1>hola</h1>');
});

test('tipo de archivo según la extensión', async () => {
  assert.match((await pedir('/css/estilos.css')).tipo, /text\/css/);
});

test('404 si no existe', async () => {
  assert.equal((await pedir('/no-existe.js')).estado, 404);
});

test('no deja salir de la carpeta del sitio', async () => {
  for (const ruta of ['/../secreto.txt', '/%2e%2e/secreto.txt', '/css/../../secreto.txt', '/..%5csecreto.txt']) {
    const r = await pedir(ruta);
    assert.notEqual(r.cuerpo, 'no se tiene que ver', `se filtró con ${ruta}`);
    assert.ok([403, 404].includes(r.estado), `${ruta} devolvió ${r.estado}`);
  }
});

import { rangoPedido } from '../src/estatico.mjs';
test('un pedido de una parte del archivo (videos y audio en el celular) se contesta con 206', async () => {
  writeFileSync(join(sitio, 'video.bin'), '0123456789');
  const pedirRango = rango => new Promise((resolver, rechazar) => {
    request({ host: '127.0.0.1', port: servidor.puerto, path: '/video.bin', headers: rango ? { Range: rango } : {} }, r => {
      let cuerpo = '';
      r.on('data', d => { cuerpo += d; });
      r.on('end', () => resolver({ estado: r.statusCode, cuerpo, rango: r.headers['content-range'], largo: r.headers['content-length'], aceptaRangos: r.headers['accept-ranges'] }));
    }).on('error', rechazar).end();
  });
  assert.deepEqual(await pedirRango('bytes=2-5'), { estado: 206, cuerpo: '2345', rango: 'bytes 2-5/10', largo: '4', aceptaRangos: 'bytes' });
  assert.equal((await pedirRango('bytes=7-')).cuerpo, '789');
  assert.equal((await pedirRango('bytes=-3')).cuerpo, '789');
  assert.equal((await pedirRango('bytes=0-999')).rango, 'bytes 0-9/10');
  const mal = await pedirRango('bytes=50-60');
  assert.deepEqual([mal.estado, mal.rango], [416, 'bytes */10']);
  const entero = await pedirRango(null);
  assert.deepEqual([entero.estado, entero.cuerpo, entero.aceptaRangos], [200, '0123456789', 'bytes']);
  assert.equal((await pedirRango('algo raro')).estado, 200, 'un rango que no se entiende se ignora');
  assert.equal(rangoPedido('bytes=-', 10), null);
  assert.equal(rangoPedido('bytes=3-1', 10), 'invalido');
});

test('una carpeta sin la barra final redirige (si no, los links relativos de su página se rompen), y solo se aceptan GET y HEAD', async () => {
  const pedirCrudo = (ruta, metodo = 'GET') => new Promise((resolver, rechazar) => {
    request({ host: '127.0.0.1', port: servidor.puerto, path: ruta, method: metodo }, r => { r.resume(); r.on('end', () => resolver({ estado: r.statusCode, ubicacion: r.headers.location, permitidos: r.headers.allow })); }).on('error', rechazar).end();
  });
  assert.deepEqual(await pedirCrudo('/css'), { estado: 301, ubicacion: '/css/', permitidos: undefined });
  assert.equal((await pedirCrudo('/css?v=2')).ubicacion, '/css/?v=2');
  assert.equal((await pedirCrudo('/css/')).estado, 404, 'la carpeta css no tiene index.html');
  const post = await pedirCrudo('/', 'POST');
  assert.deepEqual([post.estado, post.permitidos], [405, 'GET, HEAD']);
  assert.equal((await pedirCrudo('/', 'HEAD')).estado, 200);
});

import { vigilar } from '../src/vigia.mjs';
test('si no se puede vigilar la carpeta (borrada, límite de archivos), avisa y no tira el programa', async () => {
  const errores = [];
  const parar = vigilar(join(raiz, 'no-existe-esta-carpeta'), () => {}, 10, e => errores.push(e));
  assert.equal(errores.length, 1);
  assert.equal(typeof parar, 'function');
  parar();
  // una carpeta que se borra mientras se vigila no es una excepción sin atender
  const efimera = join(raiz, 'efimera');
  mkdirSync(efimera);
  const fallos = [];
  const parar2 = vigilar(efimera, () => {}, 10, e => fallos.push(e));
  rmSync(efimera, { recursive: true, force: true });
  await new Promise(r => setTimeout(r, 300));
  parar2();
  assert.ok(fallos.length <= 1);
});
