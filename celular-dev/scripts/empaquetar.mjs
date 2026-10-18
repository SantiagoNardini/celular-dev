// Arma los paquetes para repartir: se descomprimen y andan, sin instalar nada. Cada uno trae:
//   el lanzador         celular-dev.bat (Windows), celular-dev.command (Mac) o celular-dev.sh (Linux)
//   LEEME.txt
//   celular-dev/        el programa (sin pruebas ni scripts de desarrollo)
//   runtime/            Node oficial para ese sistema (node o node.exe, y su licencia)
// Baja Node de nodejs.org (lo guarda para la próxima vez) y comprueba su huella contra la lista oficial.
// Deja cada paquete y su huella (SHA-256) en ../paquete, listos para subir como release a GitHub.
// Uso: npm run empaquetar                     (todos los sistemas)
//      npm run empaquetar -- windows mac-arm  (solo esos)
//      NODE_VERSION=v24.22.0 npm run empaquetar
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { descomprimir } from '../src/instalar-adb.mjs';
import { armarZip, armarTarGz } from './archivos.mjs';

const programa = join(dirname(fileURLToPath(import.meta.url)), '..');
const raiz = join(programa, '..');
const { version } = JSON.parse(readFileSync(join(programa, 'package.json'), 'utf8'));
const nodeVersion = process.env.NODE_VERSION || process.version;
const salida = join(raiz, 'paquete');
const cache = join(salida, '.cache');
const nombre = `celular-dev-v${version}`;

// sistema: cómo se llama Node en nodejs.org, qué lanzador lleva y en qué formato sale
const SISTEMAS = {
  windows: { node: 'win-x64', archivoNode: 'zip', lanzador: 'celular-dev.bat', formato: 'zip', exe: 'node.exe' },
  'mac-arm': { node: 'darwin-arm64', archivoNode: 'tar.gz', lanzador: 'celular-dev.command', formato: 'zip', exe: 'node' },
  'mac-intel': { node: 'darwin-x64', archivoNode: 'tar.gz', lanzador: 'celular-dev.command', formato: 'zip', exe: 'node' },
  linux: { node: 'linux-x64', archivoNode: 'tar.gz', lanzador: 'celular-dev.sh', formato: 'tar.gz', exe: 'node' }
};

const huella = datos => createHash('sha256').update(datos).digest('hex');
const paso = texto => console.log(`- ${texto}`);

async function bajar(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!r.ok) throw new Error(`${url} contestó ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

let sumas = null;
// Node oficial, comprobado contra SHASUMS256.txt de la misma versión.
async function bajarNode(sistema) {
  const archivo = `node-${nodeVersion}-${sistema.node}.${sistema.archivoNode}`;
  const guardado = join(cache, archivo);
  const base = `https://nodejs.org/dist/${nodeVersion}`;
  sumas ??= (await bajar(`${base}/SHASUMS256.txt`)).toString();
  const esperada = (sumas.split('\n').find(l => l.trim().endsWith(` ${archivo}`)) || '').split(/\s+/)[0];
  if (!esperada) throw new Error(`nodejs.org no publica ${archivo}`);
  if (!existsSync(guardado) || huella(readFileSync(guardado)) !== esperada) {
    paso(`Bajando ${archivo} de nodejs.org…`);
    const datos = await bajar(`${base}/${archivo}`);
    if (huella(datos) !== esperada) throw new Error(`la huella de ${archivo} no coincide con la oficial: no se usa`);
    mkdirSync(cache, { recursive: true });
    writeFileSync(guardado, datos);
  } else {
    paso(`${archivo} ya estaba bajado (huella comprobada).`);
  }
  return guardado;
}

// node y su licencia, sacados del archivo oficial
async function sacarNode(sistema, archivo) {
  const temporal = join(cache, `node-${Date.now()}`);
  mkdirSync(temporal, { recursive: true });
  try {
    if (sistema.archivoNode === 'zip') await descomprimir(archivo, temporal);
    else {
      // tar.gz: lo abre el tar de cualquier sistema (en Windows, el del sistema: el de Git no siempre)
      const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe') : 'tar';
      const r = spawnSync(tar, ['-xzf', archivo, '-C', temporal], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`no se pudo abrir ${archivo}`);
    }
    const carpeta = join(temporal, `node-${nodeVersion}-${sistema.node}`);
    const node = join(carpeta, ...(sistema.exe === 'node.exe' ? ['node.exe'] : ['bin', 'node']));
    return { node: readFileSync(node), licencia: readFileSync(join(carpeta, 'LICENSE')) };
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

// Todos los archivos de una carpeta, con su nombre relativo y "/" como separador.
function listar(carpeta, base = carpeta) {
  const lista = [];
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) lista.push(...listar(ruta, base));
    else lista.push(relative(base, ruta).split(sep).join('/'));
  }
  return lista.sort();
}

const leeme = (sistema) => {
  const lanzar = { 'celular-dev.bat': 'Doble clic en celular-dev.bat', 'celular-dev.command': 'Doble clic en celular-dev.command (la primera vez: clic derecho > Abrir, y confirmá)', 'celular-dev.sh': 'Doble clic en celular-dev.sh (o desde una terminal: ./celular-dev.sh)' }[sistema.lanzador];
  const launch = { 'celular-dev.bat': 'Double-click celular-dev.bat', 'celular-dev.command': 'Double-click celular-dev.command (the first time: right-click > Open, then confirm)', 'celular-dev.sh': 'Double-click celular-dev.sh (or from a terminal: ./celular-dev.sh)' }[sistema.lanzador];
  return `celular-dev ${version}
Probá tu sitio en tu celular Android real y mirá sus errores en la computadora, explicados.
Test your site on your real Android phone and see its errors on your computer, explained.

CÓMO SE USA
1. ${lanzar}
2. Se abre el panel en tu navegador: seguí los pasos (te ayuda a preparar el celular).
3. La primera vez te ofrece crear accesos directos.

No hace falta instalar nada: Node viene incluido en la carpeta runtime, y la herramienta
para hablar con el celular (ADB) se descarga sola de Google con un botón del panel.
Tus capturas, informes y preferencias quedan en Documentos/celular-dev.

HOW TO USE IT
1. ${launch}
2. The panel opens in your browser: follow the steps (it helps you set up the phone).
3. The first time, it offers to create shortcuts.

Nothing to install: Node is included in the runtime folder, and the tool that talks to
the phone (ADB) downloads from Google with a button in the panel.
Your screenshots, reports and preferences are saved in Documents/celular-dev.

Node.js se incluye bajo su propia licencia / Node.js is included under its own license: runtime/LICENSE
`;
};

async function armar(clave) {
  const sistema = SISTEMAS[clave];
  console.log(`\n${nombre}-${clave} (Node ${nodeVersion})`);
  const ejecutable = 0o755;
  const entradas = [];
  const agregar = (ruta, datos, modo) => entradas.push({ nombre: `${nombre}/${ruta}`, datos, modo });

  paso('Juntando el programa…');
  for (const parte of ['bin', 'src', 'marca']) {
    for (const archivo of listar(join(programa, parte))) agregar(`celular-dev/${parte}/${archivo}`, readFileSync(join(programa, parte, archivo)), parte === 'bin' ? ejecutable : undefined);
  }
  for (const archivo of ['package.json', 'README.md']) agregar(`celular-dev/${archivo}`, readFileSync(join(programa, archivo)));
  agregar(sistema.lanzador, readFileSync(join(raiz, sistema.lanzador)), ejecutable);
  // en Mac, celular-dev.command usa celular-dev.sh
  if (sistema.lanzador === 'celular-dev.command') agregar('celular-dev.sh', readFileSync(join(raiz, 'celular-dev.sh')), ejecutable);
  const texto = leeme(sistema);
  agregar('LEEME.txt', Buffer.from(sistema.exe === 'node.exe' ? texto.replace(/\r?\n/g, '\r\n') : texto));

  const { node, licencia } = await sacarNode(sistema, await bajarNode(sistema));
  agregar(`runtime/${sistema.exe}`, node, ejecutable);
  agregar('runtime/LICENSE', licencia);

  paso('Comprimiendo…');
  const archivo = join(salida, `${nombre}-${clave}.${sistema.formato}`);
  const datos = sistema.formato === 'zip' ? armarZip(entradas) : armarTarGz(entradas);
  mkdirSync(salida, { recursive: true });
  writeFileSync(archivo, datos);
  const suma = huella(datos);
  writeFileSync(`${archivo}.sha256`, `${suma}  ${archivo.split(sep).pop()}\n`);
  paso(`Listo: ${archivo} (${(statSync(archivo).size / 1024 / 1024).toFixed(1)} MB)`);
  paso(`Huella SHA-256: ${suma}`);
  return archivo;
}

async function principal() {
  const pedidos = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const claves = pedidos.length ? pedidos : Object.keys(SISTEMAS);
  for (const clave of claves) if (!SISTEMAS[clave]) throw new Error(`no conozco "${clave}": puede ser ${Object.keys(SISTEMAS).join(', ')}`);
  for (const clave of claves) await armar(clave);
}

principal().catch(error => { console.error(`\nNo se pudo armar el paquete: ${error.message}`); process.exit(1); });
