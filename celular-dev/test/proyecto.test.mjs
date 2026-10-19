// Reconocer el proyecto y prender/apagar su servidor (con un servidor de mentira, pero un npm de verdad).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectarProyecto, puertoDeLinea, iniciarProyecto } from '../src/proyecto.mjs';
import { puertoAbierto } from '../src/servidor.mjs';

let raiz;
before(() => { raiz = mkdtempSync(join(tmpdir(), 'celular-proyecto-')); });
after(() => rmSync(raiz, { recursive: true, force: true }));
const proyecto = (nombre, paquete, archivos = {}) => {
  const c = join(raiz, nombre);
  mkdirSync(c, { recursive: true });
  writeFileSync(join(c, 'package.json'), JSON.stringify(paquete));
  for (const [n, t] of Object.entries(archivos)) writeFileSync(join(c, n), t);
  return c;
};

test('reconoce el marco, el script y el gestor de paquetes', () => {
  const vite = detectarProyecto(proyecto('vite', { name: 'mi-vite', scripts: { dev: 'vite' }, devDependencies: { vite: '^5' } }));
  assert.deepEqual([vite.nombre, vite.marco, vite.script, vite.texto, vite.puertoProbable], ['mi-vite', 'vite', 'dev', 'npm run dev', 5173]);
  assert.equal(detectarProyecto(proyecto('next', { scripts: { dev: 'next dev' }, dependencies: { next: '14', react: '18' } })).marco, 'next');
  assert.equal(detectarProyecto(proyecto('astro', { scripts: { dev: 'astro dev' }, dependencies: { astro: '4' } })).puertoProbable, 4321);
  assert.equal(detectarProyecto(proyecto('svelte', { scripts: { dev: 'vite dev' }, devDependencies: { '@sveltejs/kit': '2', vite: '5' } })).marco, 'sveltekit');
  const cra = detectarProyecto(proyecto('cra', { scripts: { start: 'react-scripts start' }, dependencies: { 'react-scripts': '5' } }));
  assert.deepEqual([cra.marco, cra.script, cra.texto], ['cra', 'start', 'npm run start']);
  assert.equal(detectarProyecto(proyecto('ng', { scripts: { start: 'ng serve' }, devDependencies: { '@angular/cli': '17' } })).puertoProbable, 4200);
  // el gestor sale del archivo de bloqueo
  assert.equal(detectarProyecto(proyecto('pnpm', { scripts: { dev: 'vite' } }, { 'pnpm-lock.yaml': '' })).texto, 'pnpm run dev');
  assert.equal(detectarProyecto(proyecto('yarn', { scripts: { dev: 'vite' } }, { 'yarn.lock': '' })).texto, 'yarn dev');
  assert.equal(detectarProyecto(proyecto('bun', { scripts: { dev: 'vite' } }, { 'bun.lockb': '' })).texto, 'bun run dev');
  // dev gana sobre start; un proyecto sin marco conocido es genérico
  const dos = detectarProyecto(proyecto('dos', { scripts: { start: 'node a', dev: 'node b' } }));
  assert.deepEqual([dos.script, dos.marco, dos.puertoProbable], ['dev', 'generico', 0]);
});

test('no es un proyecto: sin package.json, roto, sin scripts útiles, o con scripts que no son texto', () => {
  assert.equal(detectarProyecto(join(raiz, 'no-existe')), null);
  const roto = join(raiz, 'roto'); mkdirSync(roto); writeFileSync(join(roto, 'package.json'), '{ esto no es json');
  assert.equal(detectarProyecto(roto), null);
  assert.equal(detectarProyecto(proyecto('sin-scripts', { name: 'x' })), null);
  assert.equal(detectarProyecto(proyecto('solo-build', { scripts: { build: 'vite build', test: 'jest' } })), null);
  assert.equal(detectarProyecto(proyecto('script-raro', { scripts: { dev: 5 } })), null);
  assert.equal(detectarProyecto(proyecto('arreglo', [1, 2])), null);
  // el nombre del script que se ejecuta sale de nuestra lista, nunca del archivo
  assert.equal(detectarProyecto(proyecto('malicioso', { scripts: { dev: 'vite', 'x; calc': 'a' } })).comando.join(' '), 'npm run dev');
});

test('avisa si faltan las dependencias (hay dependencias pero no node_modules)', () => {
  assert.equal(detectarProyecto(proyecto('falta', { scripts: { dev: 'vite' }, devDependencies: { vite: '5' } })).faltaInstalar, true);
  const c = proyecto('instalado', { scripts: { dev: 'vite' }, devDependencies: { vite: '5' } });
  mkdirSync(join(c, 'node_modules'));
  assert.equal(detectarProyecto(c).faltaInstalar, false);
  assert.equal(detectarProyecto(proyecto('sin-deps', { scripts: { dev: 'node s.js' } })).faltaInstalar, false);
});

test('saca el puerto de lo que imprime el servidor, con o sin colores', () => {
  assert.equal(puertoDeLinea('  ➜  Local:   http://localhost:5173/'), 5173);
  assert.equal(puertoDeLinea('\x1b[32m  ➜\x1b[39m  Local:   \x1b[36mhttp://localhost:\x1b[1m4321\x1b[22m/\x1b[39m'), 4321);
  assert.equal(puertoDeLinea('ready - started server on 0.0.0.0:3000, url: http://localhost:3000'), 3000);
  assert.equal(puertoDeLinea('Server at http://127.0.0.1:8080/index.html'), 8080);
  assert.equal(puertoDeLinea('Network: http://192.168.0.5:5173/'), null, 'una dirección de la red no sirve: hace falta la local');
  assert.equal(puertoDeLinea('compilado en 120 ms'), null);
});

test('prende el servidor de verdad (npm run dev), espera a que conteste y lo apaga entero', async () => {
  const servidor = `import { createServer } from 'node:http';
const s = createServer((_, r) => r.end('hola')).listen(0, '127.0.0.1', () => console.log('Local: http://localhost:' + s.address().port + '/'));
setInterval(() => {}, 1000);`;
  const carpeta = proyecto('real', { name: 'real', scripts: { dev: 'node servidor.mjs' } }, { 'servidor.mjs': servidor });
  const lineas = [];
  const p = detectarProyecto(carpeta);
  const r = await iniciarProyecto(p, { alLinea: l => lineas.push(l), espera: 30000 });
  assert.ok(r.puerto > 0);
  assert.ok(lineas.some(l => /Local: http:\/\/localhost:\d+/.test(l)), 'se tienen que ver las líneas del servidor');
  assert.equal(await puertoAbierto(r.puerto, 1000), true);
  assert.match(await (await fetch(`http://127.0.0.1:${r.puerto}/`)).text(), /hola/);
  await r.detener();
  assert.equal(await puertoAbierto(r.puerto, 1000), false, 'al apagarlo no tiene que quedar nada escuchando (tampoco los procesos que lanzó npm)');
  await r.detener();   // apagar dos veces no pasa nada
});

test('si el servidor se cierra antes de arrancar, o no arranca a tiempo, se dice por qué y no queda nada abierto', async () => {
  const cae = proyecto('cae', { scripts: { dev: 'node cae.mjs' } }, { 'cae.mjs': "console.error('Error: falta una dependencia'); process.exit(3);" });
  await assert.rejects(iniciarProyecto(detectarProyecto(cae), { espera: 20000 }), e => e.tipo === 'salio' && e.codigo > 0 && e.lineas.some(l => /falta una dependencia/.test(l)));
  const mudo = proyecto('mudo', { scripts: { dev: 'node mudo.mjs' } }, { 'mudo.mjs': 'setInterval(() => {}, 1000);' });
  const t0 = Date.now();
  await assert.rejects(iniciarProyecto(detectarProyecto(mudo), { espera: 1500 }), e => e.tipo === 'timeout');
  assert.ok(Date.now() - t0 < 12000);
});

test('si el servidor se cierra solo después de arrancar, avisa', async () => {
  const servidor = `import { createServer } from 'node:http';
const s = createServer((_, r) => r.end('x')).listen(0, '127.0.0.1', () => { console.log('Local: http://localhost:' + s.address().port + '/'); setTimeout(() => process.exit(5), 600); });`;
  const c = proyecto('corto', { scripts: { dev: 'node s.mjs' } }, { 's.mjs': servidor });
  let codigo = null;
  const r = await iniciarProyecto(detectarProyecto(c), { alCerrar: x => { codigo = x; }, espera: 30000 });
  assert.ok(r.puerto);
  for (let i = 0; i < 50 && codigo === null; i++) await new Promise(res => setTimeout(res, 100));
  assert.equal(codigo, 5);
});

test('cancelar mientras arranca corta todo y avisa que se canceló; apagarlo a propósito no cuenta como un cierre inesperado', async () => {
  const mudo = proyecto('mudo2', { scripts: { dev: 'node mudo.mjs' } }, { 'mudo.mjs': 'setInterval(() => {}, 1000);' });
  const cierres = [];
  const control = new AbortController();
  const pendiente = iniciarProyecto(detectarProyecto(mudo), { espera: 30000, alCerrar: c => cierres.push(c), senal: control.signal });
  await new Promise(r => setTimeout(r, 700));
  control.abort();
  await assert.rejects(pendiente, e => e.tipo === 'cancelado');
  // ya cancelado de antes: ni siquiera arranca
  await assert.rejects(iniciarProyecto(detectarProyecto(mudo), { senal: AbortSignal.abort() }), e => e.tipo === 'cancelado');
  const ok = proyecto('ok2', { scripts: { dev: 'node s.mjs' } }, { 's.mjs': "import { createServer } from 'node:http'; const s = createServer((_, r) => r.end('x')).listen(0, '127.0.0.1', () => console.log('Local: http://localhost:' + s.address().port + '/')); setInterval(() => {}, 1000);" });
  const r = await iniciarProyecto(detectarProyecto(ok), { alCerrar: c => cierres.push(c), espera: 30000 });
  await r.detener();
  await new Promise(res => setTimeout(res, 500));
  assert.deepEqual(cierres, [], 'apagarlo a propósito no es un cierre inesperado');
});
