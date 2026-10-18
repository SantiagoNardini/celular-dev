// Lo que hace simple la instalación: ícono, descomprimir (para ADB y Node), preferencias y accesos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

let temporal;
before(() => {
  temporal = mkdtempSync(join(tmpdir(), 'celular-instalacion-'));
  // las preferencias van a una carpeta de prueba, no a Documentos
  process.env.CELULAR_DATOS = join(temporal, 'datos');
});
after(() => rmSync(temporal, { recursive: true, force: true }));

const programa = join(dirname(fileURLToPath(import.meta.url)), '..');

test('el ícono es un .ico válido con los tamaños de Windows, y el .png de 256 px', () => {
  const ico = readFileSync(join(programa, 'marca', 'icono.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);   // tipo ícono
  const cantidad = ico.readUInt16LE(4);
  assert.equal(cantidad, 7);
  const tamanos = Array.from({ length: cantidad }, (_, i) => ico[6 + i * 16] || 256);
  assert.deepEqual(tamanos, [16, 24, 32, 48, 64, 128, 256]);
  const png = readFileSync(join(programa, 'marca', 'icono.png'));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 256);
});

test('descomprimir un ZIP (así se instalan ADB y el Node del paquete)', { skip: process.platform !== 'win32' }, async () => {
  const { descomprimir } = await import('../src/instalar-adb.mjs');
  const origen = join(temporal, 'origen', 'platform-tools');
  mkdirSync(origen, { recursive: true });
  writeFileSync(join(origen, 'adb.exe'), 'falso');
  const zip = join(temporal, 'prueba.zip');
  const r = spawnSync('tar', ['-a', '-c', '-f', zip, '-C', join(temporal, 'origen'), 'platform-tools']);
  assert.equal(r.status, 0, 'tar no pudo armar el ZIP de prueba');
  const destino = join(temporal, 'destino');
  mkdirSync(destino);
  await descomprimir(zip, destino);
  assert.equal(readFileSync(join(destino, 'platform-tools', 'adb.exe'), 'utf8'), 'falso');
});

test('el ADB propio queda fuera de la carpeta del programa (sobrevive a las actualizaciones)', async () => {
  const { adbPropio } = await import('../src/instalar-adb.mjs');
  assert.ok(!adbPropio().toLowerCase().startsWith(programa.toLowerCase()));
  assert.match(adbPropio(), /celular-dev[\\/]platform-tools[\\/]adb/);
});

test('las preferencias se guardan y no pisan lo demás que se recuerda', async () => {
  const { preferencia, guardarPreferencia, recordarCarpeta, leerConfig } = await import('../src/lugares.mjs');
  recordarCarpeta('C:\\un\\sitio');
  assert.equal(preferencia('accesosOfrecidos'), undefined);
  guardarPreferencia('accesosOfrecidos', true);
  assert.equal(preferencia('accesosOfrecidos'), true);
  assert.deepEqual(leerConfig().recientes, ['C:\\un\\sitio']);
  assert.ok(existsSync(join(process.env.CELULAR_DATOS, 'config.json')));
});

test('los accesos directos apuntan al .bat y usan el ícono', async () => {
  const { LANZADOR, ICONO } = await import('../src/accesos.mjs');
  assert.ok(existsSync(LANZADOR), `no está ${LANZADOR}`);
  assert.ok(existsSync(ICONO), `no está ${ICONO}`);
});
