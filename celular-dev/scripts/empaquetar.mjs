// Arma el paquete para repartir: un ZIP que se descomprime y anda, sin instalar nada. Trae:
//   celular-dev.bat   (doble clic)
//   LEEME.txt
//   celular-dev\      el programa (sin pruebas ni scripts de desarrollo)
//   runtime\          Node oficial para Windows (node.exe y su licencia)
// Baja Node de nodejs.org (lo guarda para la próxima vez) y comprueba su huella contra la lista oficial.
// Deja el ZIP y su huella (SHA-256) en ../paquete, listos para subir como release a GitHub.
// Uso: npm run empaquetar          (con la versión de Node con que se corre)
//      NODE_VERSION=v24.22.0 npm run empaquetar
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descomprimir } from '../src/instalar-adb.mjs';
import { spawn } from 'node:child_process';

const programa = join(dirname(fileURLToPath(import.meta.url)), '..');
const raiz = join(programa, '..');
const { version } = JSON.parse(readFileSync(join(programa, 'package.json'), 'utf8'));
const nodeVersion = process.env.NODE_VERSION || process.version;
const salida = join(raiz, 'paquete');
const cache = join(salida, '.cache');
const nombre = `celular-dev-v${version}`;
const armado = join(salida, nombre);

const huella = datos => createHash('sha256').update(datos).digest('hex');
const paso = texto => console.log(`- ${texto}`);

async function bajar(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!r.ok) throw new Error(`${url} contestó ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Node oficial para Windows de 64 bits, comprobado contra SHASUMS256.txt de la misma versión.
async function nodeParaWindows() {
  const archivo = `node-${nodeVersion}-win-x64.zip`;
  const guardado = join(cache, archivo);
  const base = `https://nodejs.org/dist/${nodeVersion}`;
  const sumas = (await bajar(`${base}/SHASUMS256.txt`)).toString();
  const esperada = (sumas.split('\n').find(l => l.trim().endsWith(` ${archivo}`)) || '').split(/\s+/)[0];
  if (!esperada) throw new Error(`nodejs.org no publica ${archivo}`);
  if (!existsSync(guardado) || huella(readFileSync(guardado)) !== esperada) {
    paso(`Bajando ${archivo} de nodejs.org…`);
    const zip = await bajar(`${base}/${archivo}`);
    if (huella(zip) !== esperada) throw new Error(`la huella de ${archivo} no coincide con la oficial: no se usa`);
    mkdirSync(cache, { recursive: true });
    writeFileSync(guardado, zip);
  } else {
    paso(`${archivo} ya estaba bajado (huella comprobada).`);
  }
  return guardado;
}

function comprimir(carpeta, zip) {
  return new Promise((resolver, rechazar) => {
    // tar de Windows (bsdtar) arma ZIP con -a según la extensión
    const p = spawn('tar', ['-a', '-c', '-f', zip, '-C', dirname(carpeta), basename(carpeta)], { stdio: 'inherit', windowsHide: true });
    p.once('error', rechazar);
    p.once('exit', codigo => (codigo === 0 ? resolver() : rechazar(new Error(`tar terminó con ${codigo}`))));
  });
}

const LEEME = `celular-dev ${version}
Probá tu sitio en tu celular Android real y mirá sus errores en la PC, explicados.

CÓMO SE USA
1. Doble clic en celular-dev.bat
2. Se abre el panel en tu navegador: seguí los pasos (te ayuda a preparar el celular).
3. La primera vez te ofrece crear accesos directos en el Escritorio y en el menú Inicio.

No hace falta instalar nada: Node viene incluido en la carpeta runtime, y la herramienta
para hablar con el celular (ADB) se descarga sola de Google con un botón del panel.

Tus capturas, informes y preferencias quedan en Documentos\\celular-dev.

Node.js se incluye bajo su propia licencia (runtime\\LICENSE).
`;

async function principal() {
  console.log(`Armando ${nombre} (Node ${nodeVersion} incluido)\n`);
  rmSync(armado, { recursive: true, force: true });
  mkdirSync(join(armado, 'runtime'), { recursive: true });

  paso('Copiando el programa…');
  for (const parte of ['bin', 'src', 'marca', 'package.json', 'README.md']) {
    cpSync(join(programa, parte), join(armado, 'celular-dev', parte), { recursive: true });
  }
  copyFileSync(join(raiz, 'celular-dev.bat'), join(armado, 'celular-dev.bat'));
  writeFileSync(join(armado, 'LEEME.txt'), LEEME.replace(/\r?\n/g, '\r\n'));

  const zipNode = await nodeParaWindows();
  paso('Sacando node.exe y su licencia…');
  const temporal = join(cache, `node-${Date.now()}`);
  mkdirSync(temporal, { recursive: true });
  try {
    await descomprimir(zipNode, temporal);
    const carpetaNode = join(temporal, `node-${nodeVersion}-win-x64`);
    copyFileSync(join(carpetaNode, 'node.exe'), join(armado, 'runtime', 'node.exe'));
    copyFileSync(join(carpetaNode, 'LICENSE'), join(armado, 'runtime', 'LICENSE'));
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }

  const zip = join(salida, `${nombre}-windows.zip`);
  rmSync(zip, { force: true });
  paso('Comprimiendo…');
  await comprimir(armado, zip);
  const suma = huella(readFileSync(zip));
  writeFileSync(`${zip}.sha256`, `${suma}  ${basename(zip)}\n`);
  rmSync(armado, { recursive: true, force: true });

  const mb = (readFileSync(zip).length / 1024 / 1024).toFixed(1);
  console.log(`\nListo: ${zip} (${mb} MB)\nHuella SHA-256: ${suma}`);
}

principal().catch(error => { console.error(`\nNo se pudo armar el paquete: ${error.message}`); process.exit(1); });
