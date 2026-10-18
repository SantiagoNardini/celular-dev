import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { partirLugar, ubicar } from '../src/editor.mjs';

let raiz;
before(() => {
  raiz = mkdtempSync(join(tmpdir(), 'celular-editor-'));
  for (const dir of ['js', 'src/js', 'dist', 'node_modules/lib', 'a', 'b']) mkdirSync(join(raiz, dir), { recursive: true });
  writeFileSync(join(raiz, 'js', 'app.js'), '');
  writeFileSync(join(raiz, 'src', 'js', 'solo-en-src.js'), '');
  writeFileSync(join(raiz, 'dist', 'compilado.js'), '');
  writeFileSync(join(raiz, 'node_modules', 'lib', 'dependencia.js'), '');
  writeFileSync(join(raiz, 'a', 'repetido.js'), '');
  writeFileSync(join(raiz, 'b', 'repetido.js'), '');
});
after(() => rmSync(raiz, { recursive: true, force: true }));

test('partirLugar: ruta, línea y columna', () => {
  assert.deepEqual(partirLugar('/js/app.js:214:9'), { ruta: '/js/app.js', linea: 214, columna: 9 });
  assert.deepEqual(partirLugar('/app.js:3'), { ruta: '/app.js', linea: 3, columna: 1 });
  assert.deepEqual(partirLugar('http://localhost:5500/dist/app.js?v=2:10:1'), { ruta: '/dist/app.js', linea: 10, columna: 1 });
  assert.equal(partirLugar('sin lugar'), null);
  assert.equal(partirLugar(''), null);
});

test('la misma ruta dentro de la carpeta del código', () => {
  assert.deepEqual(ubicar('/js/app.js:5:2', raiz), { archivo: join(raiz, 'js', 'app.js'), linea: 5, columna: 2 });
});

test('servidor que muestra una subcarpeta (/dist/): se busca sin esa parte', () => {
  const sitio = join(raiz, 'dist');
  assert.equal(ubicar('/dist/compilado.js:1', sitio, '/dist/').archivo, join(sitio, 'compilado.js'));
});

test('si la ruta no coincide, lo busca por nombre (sin entrar a node_modules)', () => {
  assert.equal(ubicar('/otra/ruta/solo-en-src.js:7', raiz).archivo, join(raiz, 'src', 'js', 'solo-en-src.js'));
  assert.equal(ubicar('/dependencia.js:1', raiz), null);
});

test('si hay dos archivos con el mismo nombre no adivina', () => {
  assert.equal(ubicar('/repetido.js:1', raiz), null);
});

test('nunca sale de la carpeta del código', () => {
  assert.equal(ubicar('/../../Windows/win.ini:1', join(raiz, 'js')), null);
});

test('sin carpeta del código no hay nada que ubicar', () => {
  assert.equal(ubicar('/js/app.js:1', null), null);
});
