// Abrir cosas con el programa que corresponde en cada sistema (Windows, Mac o Linux): una dirección en
// el navegador, una carpeta en el explorador de archivos, un archivo con su programa, y chrome://inspect.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const callado = { stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' };

function lanzar(programa, args, opciones = callado) {
  try {
    const p = spawn(programa, args, opciones);
    p.once('error', () => {});
    p.unref();
    return p;
  } catch {
    return null;
  }
}

export function abrirNavegador(url) {
  if (process.platform === 'win32') lanzar('cmd', ['/c', 'start', '', url]);
  else lanzar(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}

export function abrirConElSistema(ruta) {
  if (process.platform === 'win32') lanzar('cmd', ['/c', 'start', '""', `"${ruta}"`], { ...callado, windowsVerbatimArguments: true });
  else lanzar(process.platform === 'darwin' ? 'open' : 'xdg-open', [ruta]);
}

// chrome://inspect solo lo abre Chrome (el sistema no sabe qué hacer con esas direcciones).
export function abrirChromeInspect() {
  const destino = 'chrome://inspect/#devices';
  if (process.platform === 'win32') lanzar('cmd', ['/c', 'start', '', 'chrome', destino]);
  else if (process.platform === 'darwin') lanzar('open', ['-a', 'Google Chrome', destino]);
  else {
    const chrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].find(existsSync);
    lanzar(chrome || 'google-chrome', [destino]);
  }
}

// Visual Studio Code: en Windows y Mac puede no estar en el PATH aunque esté instalado.
export function buscarCode() {
  const posibles = process.platform === 'win32'
    ? [join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'), join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'bin', 'code.cmd')]
    : process.platform === 'darwin'
      ? ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code', join(process.env.HOME || '', 'Applications', 'Visual Studio Code.app', 'Contents', 'Resources', 'app', 'bin', 'code')]
      : [];
  return posibles.find(existsSync) || 'code';
}
