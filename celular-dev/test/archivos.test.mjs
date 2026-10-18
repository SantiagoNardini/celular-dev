// Los paquetes (ZIP y .tar.gz) se arman sin programas de afuera: que el sistema los abra y que el
// lanzador y node mantengan el permiso de ejecución.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { armarZip, armarTarGz } from '../scripts/archivos.mjs';
import { descomprimir } from '../src/instalar-adb.mjs';

let temporal;
before(() => { temporal = mkdtempSync(join(tmpdir(), 'celular-archivos-')); });
after(() => rmSync(temporal, { recursive: true, force: true }));

const ENTRADAS = [
  { nombre: 'paquete/' },
  { nombre: 'paquete/LEEME.txt', datos: Buffer.from('hola, ñandú\n') },
  { nombre: 'paquete/celular-dev.sh', datos: Buffer.from('#!/bin/sh\necho hola\n'), modo: 0o755 },
  { nombre: `paquete/${'carpeta-larga/'.repeat(9)}archivo.js`, datos: Buffer.alloc(3000, 'x') }
];

test('el ZIP se abre con lo que tenga el sistema y queda igual', async () => {
  const zip = join(temporal, 'p.zip');
  writeFileSync(zip, armarZip(ENTRADAS));
  const destino = join(temporal, 'zip');
  mkdirSync(destino);
  await descomprimir(zip, destino);
  assert.equal(readFileSync(join(destino, 'paquete', 'LEEME.txt'), 'utf8'), 'hola, ñandú\n');
  assert.equal(readFileSync(join(destino, ENTRADAS[3].nombre)).length, 3000);
  if (process.platform !== 'win32') assert.equal(statSync(join(destino, 'paquete', 'celular-dev.sh')).mode & 0o111, 0o111, 'perdió el permiso de ejecución');
});

test('el mismo contenido da el mismo ZIP, byte por byte', () => {
  assert.deepEqual(armarZip(ENTRADAS), armarZip(ENTRADAS));
});

test('el .tar.gz tiene cabeceras ustar válidas, con el modo y los nombres largos', () => {
  const tar = gunzipSync(armarTarGz(ENTRADAS));
  assert.equal(tar.length % 512, 0);
  // la cabecera del lanzador: el segundo archivo después de la carpeta y LEEME.txt (que ocupa 1 bloque)
  const cabecera = tar.subarray(512 * 3, 512 * 4);
  assert.equal(cabecera.toString('utf8', 0, 100).replace(/\0+$/, ''), 'paquete/celular-dev.sh');
  assert.equal(cabecera.toString('ascii', 100, 107), '0000755');
  assert.equal(cabecera.toString('ascii', 257, 262), 'ustar');
  let suma = 0;
  for (let i = 0; i < 512; i++) suma += i >= 148 && i < 156 ? 32 : cabecera[i];
  assert.equal(parseInt(cabecera.toString('ascii', 148, 154), 8), suma);
});

test('el .tar.gz lo abre el tar del sistema, con permisos y nombres largos', () => {
  const archivo = join(temporal, 'p.tar.gz');
  writeFileSync(archivo, armarTarGz(ENTRADAS));
  const destino = join(temporal, 'tgz');
  mkdirSync(destino);
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar';
  const r = spawnSync(tar, ['-xzf', archivo, '-C', destino]);
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(readFileSync(join(destino, 'paquete', 'LEEME.txt'), 'utf8'), 'hola, ñandú\n');
  assert.equal(readFileSync(join(destino, ENTRADAS[3].nombre)).length, 3000);
  if (process.platform !== 'win32') assert.equal(statSync(join(destino, 'paquete', 'celular-dev.sh')).mode & 0o777, 0o755);
});
