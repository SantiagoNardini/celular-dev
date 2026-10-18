// El .bat del doble clic: con saltos de línea de Linux, cmd.exe se confunde con las etiquetas y falla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const bat = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'celular-dev.bat');

test('celular-dev.bat existe al lado de la carpeta del programa', () => {
  assert.ok(existsSync(bat), `no está ${bat}`);
});

test('celular-dev.bat usa saltos de línea de Windows (CRLF) en todos los renglones', () => {
  const texto = readFileSync(bat, 'latin1');
  const sueltos = texto.split('\r\n').filter(r => r.includes('\n'));
  assert.equal(sueltos.length, 0, 'hay renglones con saltos de línea de Linux (LF)');
});

test('celular-dev.bat abre el programa y revisa Node antes', () => {
  const texto = readFileSync(bat, 'latin1');
  assert.match(texto, /celular-dev\\bin\\celular\.mjs/);
  assert.match(texto, /where node/);
  assert.match(texto, /:sin_node/);
  assert.match(texto, /:node_viejo/);
});

test('celular-dev.bat usa primero el Node que trae el paquete (runtime\\node.exe)', () => {
  const texto = readFileSync(bat, 'latin1');
  const propio = texto.indexOf('runtime\\node.exe');
  assert.ok(propio > 0, 'no busca runtime\\node.exe');
  assert.ok(propio < texto.indexOf('where node'), 'tiene que mirar runtime\\ antes que el Node instalado');
});
