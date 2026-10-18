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
