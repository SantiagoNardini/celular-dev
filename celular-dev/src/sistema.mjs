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

// Solo se abren direcciones http o https, normalizadas. Devuelve null si no lo es.
export function direccionSegura(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// Qué programa abre una dirección. En Windows NO se usa «cmd /c start»: cmd entiende el & de una dirección como el
// comienzo de otro comando (…?a=1&calc ejecutaría calc). rundll32 recibe la dirección tal cual, sin intérprete.
export function comandoParaAbrirUrl(url, plataforma = process.platform) {
  if (plataforma === 'win32') return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  return [plataforma === 'darwin' ? 'open' : 'xdg-open', [url]];
}

export function abrirNavegador(url) {
  const segura = direccionSegura(url);
  if (!segura) return;
  const [programa, args] = comandoParaAbrirUrl(segura);
  lanzar(programa, args);
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
