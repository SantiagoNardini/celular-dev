// Encontrar en el disco la carpeta que se arrastró al panel, y los tamaños de pantalla que se pueden simular.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buscarCarpeta, limpiarSoltada } from '../src/buscar-carpeta.mjs';
import { TAMANOS, tamanoDe, cabe, paraChrome, listaParaPanel } from '../src/app/tamanos.mjs';

let raiz;
const crear = (ruta, archivos) => {
  mkdirSync(join(raiz, ruta), { recursive: true });
  for (const [nombre, contenido] of Object.entries(archivos)) writeFileSync(join(raiz, ruta, nombre), contenido);
};
before(() => { raiz = mkdtempSync(join(tmpdir(), 'celular-buscar-')); });
after(() => rmSync(raiz, { recursive: true, force: true }));
const buscar = (soltada, profundidad = 4) => buscarCarpeta(soltada, { raices: [{ ruta: raiz, profundidad }] });
const soltada = (nombre, archivos = {}, carpetas = []) => ({ nombre, archivos: Object.entries(archivos).map(([n, t]) => ({ nombre: n, tamano: t })), carpetas });

test('una sola carpeta con ese nombre y un index.html: es esa', async () => {
  crear('proyectos/unica-pagina', { 'index.html': '<h1>hola</h1>', 'estilos.css': 'body{}' });
  const r = await buscar(soltada('unica-pagina', { 'index.html': 13, 'estilos.css': 6 }));
  assert.equal(r.length, 1);
  assert.equal(r[0].ruta, join(raiz, 'proyectos', 'unica-pagina'));
  assert.equal(r[0].puntaje, 1);
});

test('con el mismo nombre y distinto contenido, la que se parece más', async () => {
  crear('a/mi-pagina', { 'index.html': '<h1>a</h1>', 'estilos.css': 'body{}' });
  crear('b/mi-pagina', { 'index.html': '<h1>b</h1>', 'otro.js': 'x' });
  const r = await buscar(soltada('mi-pagina', { 'index.html': 10, 'estilos.css': 6 }));
  assert.equal(r.length, 1, 'tiene que elegir una sola');
  assert.equal(r[0].ruta, join(raiz, 'a', 'mi-pagina'));
});

test('dos copias iguales: no adivina, devuelve las dos para preguntar', async () => {
  crear('c/gemelas', { 'index.html': '<h1>x</h1>', 'app.js': 'y' });
  crear('d/gemelas', { 'index.html': '<h1>x</h1>', 'app.js': 'y' });
  const r = await buscar(soltada('gemelas', { 'index.html': 10, 'app.js': 1 }));
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(c => c.puntaje), [1, 1]);
});

test('una carpeta sin index.html no es un sitio; se ignora', async () => {
  crear('e/sin-sitio', { 'notas.txt': 'hola' });
  assert.deepEqual(await buscar(soltada('sin-sitio', { 'notas.txt': 4 })), []);
});

test('no la encuentra: lista vacía (el programa abre la ventana para elegirla)', async () => {
  assert.deepEqual(await buscar(soltada('no-existe-esta', { 'index.html': 1 })), []);
});

test('no entra en node_modules ni en carpetas ocultas, y respeta la profundidad', async () => {
  crear('f/node_modules/escondida', { 'index.html': '<p>' });
  crear('f/.oculta/escondida', { 'index.html': '<p>' });
  assert.deepEqual(await buscar(soltada('escondida', { 'index.html': 3 })), []);
  crear('g/h/i/j/k/muy-honda', { 'index.html': '<p>' });
  assert.deepEqual(await buscar(soltada('muy-honda', { 'index.html': 3 }), 3), []);
  assert.equal((await buscar(soltada('muy-honda', { 'index.html': 3 }), 8)).length, 1);
});

test('el nombre se compara sin mayúsculas, y un tamaño -1 (no se pudo leer) no descarta el archivo', async () => {
  crear('l/Mi-Sitio', { 'index.html': '<h1>z</h1>' });
  const r = await buscar(soltada('mi-sitio', { 'index.html': -1 }));
  assert.equal(r.length, 1);
});

test('lo que manda el panel se limpia: nada de rutas, cantidades acotadas, tamaños numéricos', () => {
  assert.equal(limpiarSoltada(null), null);
  assert.equal(limpiarSoltada({ nombre: '../afuera' }), null);
  assert.equal(limpiarSoltada({ nombre: 'C:\\Windows' }), null);
  assert.equal(limpiarSoltada({ nombre: '' }), null);
  const l = limpiarSoltada({ nombre: 'sitio', archivos: [{ nombre: 'index.html', tamano: '12' }, { nombre: '../mal', tamano: 1 }, { nombre: 'x', tamano: 'no' }, null], carpetas: ['css', 'a/b', 3] });
  assert.deepEqual(l, { nombre: 'sitio', archivos: [{ nombre: 'index.html', tamano: 12 }, { nombre: 'x', tamano: -1 }], carpetas: ['css'] });
  assert.equal(limpiarSoltada({ nombre: 's', archivos: Array.from({ length: 500 }, (_, i) => ({ nombre: `f${i}`, tamano: 1 })) }).archivos.length, 300);
});

test('tamaños de pantalla: cuáles entran en la pantalla real (411 × 773) y qué se le pide a Chrome', () => {
  assert.equal(TAMANOS.length, 8);
  const real = { ancho: 411, alto: 773 };
  const entran = TAMANOS.filter(t => cabe(t, real)).map(t => t.id);
  assert.deepEqual(entran, ['chico', 'android', 'iphone-se']);
  assert.deepEqual(paraChrome(tamanoDe('android')), { ancho: 360, alto: 640, densidad: 0 });
  assert.equal(tamanoDe('no-existe'), null);
  // sin saber la pantalla real, se tratan todos como en vivo
  assert.ok(listaParaPanel(null).every(t => t.cabe));
  assert.equal(listaParaPanel(real).find(t => t.id === 'horizontal').cabe, false);
  // un tolerancia de un píxel: el celular dice 411,43 de ancho y un tamaño de 412 entra de milagro
  assert.equal(cabe({ ancho: 412, alto: 700 }, real), true);
  assert.equal(cabe({ ancho: 413, alto: 700 }, real), false);
});

import { esMasNueva } from '../src/app/novedad.mjs';
test('comparar versiones número por número', () => {
  assert.equal(esMasNueva('0.10.0', '0.9.2'), true);
  assert.equal(esMasNueva('v0.4.0', '0.3.1'), true);
  assert.equal(esMasNueva('0.3.1', '0.3.1'), false);
  assert.equal(esMasNueva('0.3.0', '0.3.1'), false);
});
