// Lo que el vigía de archivos no tiene que contar como un guardado (si no, el celular se recarga sin parar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vigilar } from '../src/vigia.mjs';

const espera = ms => new Promise(r => setTimeout(r, ms));

test('no recarga por lo que escriben las pruebas (Playwright), los cachés de los servidores ni los temporales de sed -i', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'celular-vigia-'));
  for (const d of ['test-results/.playwright-artifacts-3', 'playwright-report', '.svelte-kit', '.nuxt', '.turbo', 'src']) mkdirSync(join(raiz, d), { recursive: true });
  const guardados = [];
  const parar = vigilar(raiz, lista => guardados.push(...lista), 60);
  await espera(700);
  guardados.length = 0;   // en Mac el vigía repite al empezar lo recién creado (las carpetas de arriba): se deja asentar
  for (const f of ['test-results/.last-run.json', 'test-results/.playwright-artifacts-3/a.crdownload', 'test-results/x.png', 'playwright-report/index.html', '.svelte-kit/tsconfig.json', '.nuxt/app.mjs', '.turbo/log', 'src/seduEofa8', 'sedT1yY1h']) writeFileSync(join(raiz, f), 'x');
  await espera(400);
  const ignorado = /test-results|playwright|\.svelte-kit|\.nuxt|\.turbo|sed[A-Za-z0-9]{6}|crdownload|last-run/;
  assert.deepEqual(guardados.filter(n => ignorado.test(n)), [], 'nada de eso es un guardado: ' + guardados.join(', '));
  writeFileSync(join(raiz, 'src', 'app.js'), 'x');   // un guardado de verdad sí cuenta
  await espera(400);
  assert.ok(guardados.includes('src/app.js'), 'un guardado de verdad sí se cuenta: ' + guardados.join(', '));
  parar();
  rmSync(raiz, { recursive: true, force: true });
});
