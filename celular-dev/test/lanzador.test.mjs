// Los lanzadores del doble clic. El .bat necesita saltos de línea de Windows (con los de Linux, cmd.exe
// se confunde con las etiquetas y falla); los de Mac y Linux, al revés, y además permiso de ejecución.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bat = join(raiz, 'celular-dev.bat');
const sh = join(raiz, 'celular-dev.sh');
const command = join(raiz, 'celular-dev.command');

test('los tres lanzadores están al lado de la carpeta del programa', () => {
  for (const archivo of [bat, sh, command]) assert.ok(existsSync(archivo), `no está ${archivo}`);
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

test('los lanzadores de Mac y Linux usan saltos de línea de Linux (LF) y empiezan con #!/bin/sh', () => {
  for (const archivo of [sh, command]) {
    const texto = readFileSync(archivo, 'utf8');
    assert.ok(!texto.includes('\r'), `${archivo} tiene saltos de línea de Windows: no arrancaría`);
    assert.ok(texto.startsWith('#!/bin/sh\n'), `${archivo} no empieza con #!/bin/sh`);
  }
});

test('celular-dev.sh usa primero el Node del paquete, revisa la versión y abre el programa', () => {
  const texto = readFileSync(sh, 'utf8');
  assert.ok(texto.indexOf('runtime/node') < texto.indexOf('command -v node'));
  assert.match(texto, /< 22/);
  assert.match(texto, /celular-dev\/bin\/celular\.mjs/);
});

test('celular-dev.command abre celular-dev.sh', () => {
  assert.match(readFileSync(command, 'utf8'), /celular-dev\.sh/);
});

test('git guarda los lanzadores de Mac y Linux con permiso de ejecución', { skip: !existsSync(join(raiz, '.git')) }, () => {
  const r = spawnSync('git', ['ls-files', '-s', 'celular-dev.sh', 'celular-dev.command'], { cwd: raiz, encoding: 'utf8' });
  if (r.status !== 0) return;
  const modos = r.stdout.trim().split('\n').filter(Boolean).map(l => l.split(' ')[0]);
  assert.deepEqual(modos, ['100755', '100755']);
});

test('celular-dev.sh no tiene errores de sintaxis', { skip: process.platform === 'win32' }, () => {
  const r = spawnSync('sh', ['-n', sh]);
  assert.equal(r.status, 0, String(r.stderr));
});

import { comandoParaAbrirUrl, direccionSegura } from '../src/sistema.mjs';
test('abrir una dirección en Windows no pasa por cmd.exe (un & en la dirección ejecutaría otro comando)', () => {
  const url = 'http://localhost:5500/?a=1&calc.exe&x=2';
  assert.deepEqual(comandoParaAbrirUrl(url, 'win32'), ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]);
  assert.deepEqual(comandoParaAbrirUrl(url, 'darwin'), ['open', [url]]);
  assert.deepEqual(comandoParaAbrirUrl(url, 'linux'), ['xdg-open', [url]]);
  // solo http y https
  assert.equal(direccionSegura(url), url);
  assert.equal(direccionSegura('file:///C:/Windows/System32/calc.exe'), null);
  assert.equal(direccionSegura('javascript:alert(1)'), null);
  assert.equal(direccionSegura('calc'), null);
  assert.equal(direccionSegura('https://example.com/a b'), 'https://example.com/a%20b');
});

test('opciones que no pueden andar (puerto raro, carpeta que no existe) avisan y salen, en vez de quedar esperando', () => {
  const celular = join(raiz, 'celular-dev', 'bin', 'celular.mjs');
  const correr = (...args) => spawnSync(process.execPath, [celular, '--idioma', 'es', ...args], { encoding: 'utf8', timeout: 15000 });
  for (const [args, texto] of [[['--puerto', 'abc'], /puerto «abc» no sirve/], [['--puerto', '70000'], /puerto «70000»/], [['--carpeta', join(raiz, 'no-existe-esta-carpeta')], /no existe/], [['--codigo', join(raiz, 'tampoco')], /no existe/]]) {
    const r = correr(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stdout, texto);
  }
  assert.equal(correr('--ayuda').status, 0);
});

test('--version (y -v) dice la versión del package.json, y el cartel y el panel la muestran', async () => {
  const { version } = JSON.parse(readFileSync(join(raiz, 'celular-dev', 'package.json'), 'utf8'));
  const celular = join(raiz, 'celular-dev', 'bin', 'celular.mjs');
  for (const opcion of ['--version', '-v']) {
    const r = spawnSync(process.execPath, [celular, opcion], { encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), `celular-dev ${version}`);
  }
  // el cartel de arranque y el panel
  const { t, elegirIdioma } = await import('../src/idioma.mjs');
  elegirIdioma('es');
  assert.equal(t('arranque.cartel', { version: ` v${version}` }), `celular-dev v${version}: tu sitio en tu celular Android`);
  assert.equal(t('arranque.cartel', { version: '' }), 'celular-dev: tu sitio en tu celular Android');
  assert.match(readFileSync(join(raiz, 'celular-dev', 'src', 'panel', 'index.html'), 'utf8'), /celular-dev<span id="version" class="version">/);
});
