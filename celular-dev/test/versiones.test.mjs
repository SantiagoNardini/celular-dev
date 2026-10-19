// El paquete de la raíz (para npx) y el del programa tienen que decir la misma versión: la publicación usa el segundo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const leer = ruta => JSON.parse(readFileSync(join(aqui, ...ruta), 'utf8'));

test('la versión de la raíz y la del programa coinciden, y los dos exponen el comando celular-dev', () => {
  const programa = leer(['..', 'package.json']);
  const raiz = leer(['..', '..', 'package.json']);
  assert.equal(raiz.version, programa.version);
  assert.ok(programa.bin['celular-dev'] && raiz.bin['celular-dev']);
  assert.equal(raiz.license, 'MIT');
});
