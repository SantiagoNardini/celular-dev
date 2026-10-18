// Descarga ADB (Android SDK Platform-Tools) desde Google, sin winget ni permisos de administrador.
// Queda en la carpeta de programas del usuario (%LOCALAPPDATA%\celular-dev), fuera de la carpeta de
// celular-dev: así sobrevive a las actualizaciones, que reemplazan esa carpeta entera.
import { createWriteStream, existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const URLS = {
  win32: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  darwin: 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip',
  linux: 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip'
};

export function carpetaHerramientas() {
  const base = process.platform === 'win32' ? (process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')) : join(homedir(), '.local', 'share');
  return join(base, 'celular-dev');
}

// Dónde queda adb.exe si lo descargó celular-dev.
export function adbPropio() {
  return join(carpetaHerramientas(), 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
}

// alAvanzar(porcentaje) se llama mientras baja. Devuelve la ruta de adb.exe.
export async function descargarAdb(alAvanzar = () => {}) {
  const url = URLS[process.platform];
  if (!url) throw new Error('no hay ADB para este sistema');
  const destino = carpetaHerramientas();
  mkdirSync(destino, { recursive: true });
  const zip = join(tmpdir(), `platform-tools-${Date.now()}.zip`);

  const respuesta = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!respuesta.ok) throw new Error(`Google contestó ${respuesta.status} al pedir ADB`);
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
    if (!existsSync(nueva)) throw new Error('el ZIP de Google no trae la carpeta platform-tools');
    const actual = join(destino, 'platform-tools');
    if (existsSync(actual)) rmSync(actual, { recursive: true, force: true });
    renameSync(nueva, actual);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
    rmSync(zip, { force: true });
  }
  if (!existsSync(adbPropio())) throw new Error('no quedó adb después de descomprimir');
  return adbPropio();
}

// Windows 10 y 11 traen tar (bsdtar), que también abre ZIP. En Mac y Linux, unzip.
export function descomprimir(zip, destino) {
  return new Promise((resolver, rechazar) => {
    const [programa, args] = process.platform === 'win32' ? ['tar', ['-xf', zip, '-C', destino]] : ['unzip', ['-q', '-o', zip, '-d', destino]];
    const p = spawn(programa, args, { stdio: 'ignore', windowsHide: true });
    p.once('error', rechazar);
    p.once('exit', codigo => (codigo === 0 ? resolver() : rechazar(new Error(`no se pudo descomprimir (${programa} terminó con ${codigo})`))));
  });
}
