// Los dos idiomas: que no falte ningún texto en ninguno y que cada clave que usa el código exista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import es from '../src/textos/es.mjs';
import en from '../src/textos/en.mjs';
import { t, elegirIdioma, textosPanel } from '../src/idioma.mjs';

const programa = join(dirname(fileURLToPath(import.meta.url)), '..');
const claves = o => Object.keys(o).filter(k => k !== 'panel').sort();

function archivos(carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap(e => e.isDirectory() ? archivos(join(carpeta, e.name)) : /\.m?js$/.test(e.name) ? [join(carpeta, e.name)] : []);
}

// Las claves fijas que usa el código, y las armadas con una variable conocida (modo.${...}, red.${...}).
const VARIABLES = {
  'modo.': ['vivo', 'manual', 'live-server'], 'resumen.recarga.': ['vivo', 'manual', 'live-server'],
  'red.': ['normal', 'lenta', 'sin-conexion'],
  'proyecto.marco.': ['vite', 'next', 'nuxt', 'astro', 'sveltekit', 'cra', 'angular', 'generico'],
  'cond.esquema.': ['auto', 'oscuro', 'claro'], 'cond.animaciones.': ['normal', 'reducidas'], 'cond.contraste.': ['normal', 'alto'],
  'cond.vision.': ['ninguna', 'borrosa', 'protanopia', 'deuteranopia', 'tritanopia', 'acromatopsia'], 'cond.lugar.': ['real', 'buenos-aires', 'madrid', 'nueva-york', 'tokio'], 'red.filtro.': ['pesados', 'errores', 'todos'], 'accesos.listo.': ['win32', 'darwin', 'linux'], 'oferta.': ['win32', 'darwin', 'linux']
};
function usadas(texto, funcion) {
  const lista = new Set();
  for (const m of texto.matchAll(new RegExp(`\\b${funcion}\\((['\`])([^'\`]+)\\1`, 'g'))) {
    const clave = m[2];
    if (!clave.includes('${')) { lista.add(clave); continue; }
    const fija = clave.slice(0, clave.indexOf('${'));
    if (VARIABLES[fija]) for (const v of VARIABLES[fija]) lista.add(fija + v);
  }
  return lista;
}

test('español e inglés tienen las mismas claves', () => {
  assert.deepEqual(claves(en), claves(es));
  assert.deepEqual(Object.keys(en.panel).sort(), Object.keys(es.panel).sort());
});

test('los dos idiomas tienen los mismos {datos} en cada texto', () => {
  const datos = v => (typeof v === 'string' ? [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort() : null);
  for (const k of claves(es)) assert.deepEqual(datos(en[k]), datos(es[k]), `distintos {datos} en ${k}`);
  for (const k of Object.keys(es.panel)) assert.deepEqual(datos(en.panel[k]), datos(es.panel[k]), `distintos {datos} en panel ${k}`);
});

test('cada texto que usa el programa existe', () => {
  const faltan = [];
  for (const archivo of [...archivos(join(programa, 'src')), ...archivos(join(programa, 'bin'))]) {
    if (archivo.includes('textos') || archivo.endsWith('panel.js') || archivo.endsWith('herramientas.js')) continue;
    for (const clave of usadas(readFileSync(archivo, 'utf8'), 't')) if (!(clave in es)) faltan.push(`${clave} (${archivo})`);
  }
  assert.deepEqual(faltan, []);
});

test('cada texto que usa el panel existe, y son solo cadenas (viajan al navegador)', () => {
  const panel = ['panel.js', 'herramientas.js'].map(f => readFileSync(join(programa, 'src', 'panel', f), 'utf8')).join(' ');
  const faltan = [...usadas(panel, 'tr'), ...usadas(panel, 'trSin')].filter(c => !(c in es.panel));
  assert.deepEqual(faltan, []);
  for (const [k, v] of Object.entries(es.panel)) assert.equal(typeof v, 'string', k);
  for (const [k, v] of Object.entries(en.panel)) assert.equal(typeof v, 'string', k);
});

test('completa los datos, arma plurales y cambia de idioma', () => {
  elegirIdioma('es');
  assert.equal(t('sitio.listo', { nombre: 'mi-sitio' }), 'Listo: mi-sitio');
  assert.equal(t('accion.revisionProblemasCorto', { n: 1 }), '1 cosa para mejorar');
  assert.equal(t('accion.revisionProblemasCorto', { n: 2 }), '2 cosas para mejorar');
  assert.equal(textosPanel()['panel.recargar'], 'Recargar');
  elegirIdioma('en');
  assert.equal(t('sitio.listo', { nombre: 'my-site' }), 'Done: my-site');
  assert.equal(textosPanel()['panel.recargar'], 'Reload');
  elegirIdioma('es');
});

test('sin idioma elegido, o uno desconocido: inglés', () => {
  assert.equal(elegirIdioma(undefined), 'en');
  assert.equal(elegirIdioma('fr'), 'en');
  elegirIdioma('es');
});
