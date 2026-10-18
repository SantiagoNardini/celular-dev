// Descarga ADB (Android SDK Platform-Tools) desde Google, sin instaladores ni permisos de administrador.
// Queda en la carpeta de programas del usuario, fuera de la carpeta de celular-dev: así sobrevive a las
// actualizaciones, que reemplazan esa carpeta entera.
//   Windows: %LOCALAPPDATA%\celular-dev   Mac: ~/Library/Application Support/celular-dev
//   Linux:   ~/.local/share/celular-dev (o $XDG_DATA_HOME/celular-dev)
import { createWriteStream, existsSync, mkdirSync, rmSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { t } from './idioma.mjs';

const URLS = {
  win32: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  darwin: 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip',
  linux: 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip'
};

export function carpetaHerramientas() {
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'celular-dev');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'celular-dev');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'celular-dev');
}

// Dónde queda adb si lo descargó celular-dev.
export function adbPropio() {
  return join(carpetaHerramientas(), 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
}

// alAvanzar(porcentaje) se llama mientras baja. Devuelve la ruta de adb.
export async function descargarAdb(alAvanzar = () => {}) {
  const url = URLS[process.platform];
  if (!url) throw new Error(t('adb.sinVersion'));
  const destino = carpetaHerramientas();
  mkdirSync(destino, { recursive: true });
  const zip = join(tmpdir(), `platform-tools-${Date.now()}.zip`);

  const respuesta = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!respuesta.ok) throw new Error(t('adb.googleContesto', { estado: respuesta.status }));
  const total = +respuesta.headers.get('content-length') || 0;
  let bajado = 0;
  let ultimo = -1;
  const cuerpo = Readable.fromWeb(respuesta.body);
  cuerpo.on('data', parte => {
    bajado += parte.length;
    const porcentaje = total ? Math.floor((bajado / total) * 100) : 0;
    if (porcentaje !== ultimo) { ultimo = porcentaje; alAvanzar(porcentaje); }
  });
  await pipeline(cuerpo, createWriteStream(zip));

  // se descomprime al lado y recién al final se reemplaza la versión anterior (si la había)
  const temporal = join(destino, `descomprimiendo-${Date.now()}`);
  mkdirSync(temporal, { recursive: true });
  try {
    await descomprimir(zip, temporal);
    const nueva = join(temporal, 'platform-tools');
    if (!existsSync(nueva)) throw new Error(t('adb.zipSinCarpeta'));
    const actual = join(destino, 'platform-tools');
    if (existsSync(actual)) rmSync(actual, { recursive: true, force: true });
    renameSync(nueva, actual);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
    rmSync(zip, { force: true });
  }
  if (!existsSync(adbPropio())) throw new Error(t('adb.noQuedo'));
  // por si el descompresor no respetó el permiso de ejecución (Mac y Linux)
  if (process.platform !== 'win32') chmodSync(adbPropio(), 0o755);
  return adbPropio();
}

// Windows 10 y 11 traen tar (bsdtar), que también abre ZIP; Mac también (y unzip). En Linux, unzip:
// si no está, se prueba con bsdtar y con Python, que casi siempre están. En Windows se usa el tar del
// sistema por su ruta: el que trae Git (si está primero en el PATH) no abre ZIP.
const tarWindows = () => join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
const DESCOMPRESORES = {
  win32: (zip, destino) => [[tarWindows(), ['-xf', zip, '-C', destino]]],
  darwin: (zip, destino) => [['unzip', ['-q', '-o', zip, '-d', destino]], ['tar', ['-xf', zip, '-C', destino]]],
  linux: (zip, destino) => [['unzip', ['-q', '-o', zip, '-d', destino]], ['bsdtar', ['-xf', zip, '-C', destino]], ['python3', ['-m', 'zipfile', '-e', zip, destino]]]
};

export async function descomprimir(zip, destino) {
  const intentos = (DESCOMPRESORES[process.platform] || DESCOMPRESORES.linux)(zip, destino);
  let ultimo = null;
  for (const [programa, args] of intentos) {
    try {
      return await correr(programa, args);
    } catch (error) {
      ultimo = error;
      if (error.code !== 'ENOENT') break;   // el programa está pero falló: no tiene sentido probar otro
    }
  }
  throw ultimo.code === 'ENOENT' ? new Error(t('adb.sinDescompresor')) : ultimo;
}

function correr(programa, args) {
  return new Promise((resolver, rechazar) => {
    const p = spawn(programa, args, { stdio: 'ignore', windowsHide: true });
    p.once('error', rechazar);
    p.once('exit', codigo => (codigo === 0 ? resolver() : rechazar(new Error(t('adb.noDescomprime', { programa, codigo })))));
  });
}
