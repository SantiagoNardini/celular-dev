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

// El panel en su propia ventana, sin barra de pestañas ni direcciones: Chrome o Edge en modo «aplicación».
// Corre con un perfil propio (así es un programa aparte, no una pestaña del Chrome de todos los días) y,
// por eso mismo, se sabe cuándo se cierra: cerrar la ventana cierra celular-dev.
export function posiblesNavegadoresDeVentana(plataforma = process.platform, env = process.env) {
  if (plataforma === 'win32') {
    const bases = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
    return [['Google', 'Chrome', 'Application', 'chrome.exe'], ['Microsoft', 'Edge', 'Application', 'msedge.exe']].flatMap(r => bases.map(b => join(b, ...r)));
  }
  if (plataforma === 'darwin') {
    return ['Google Chrome', 'Microsoft Edge', 'Chromium'].map(n => `/Applications/${n}.app/Contents/MacOS/${n}`);
  }
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']
    .flatMap(n => [`/usr/bin/${n}`, `/snap/bin/${n}`]);
}

export function buscarNavegadorDeVentana(plataforma = process.platform, env = process.env, existe = existsSync) {
  return posiblesNavegadoresDeVentana(plataforma, env).find(existe) || null;
}

export function argumentosDeVentana(url, perfil) {
  return [`--app=${url}`, `--user-data-dir=${perfil}`, '--window-size=1180,820', '--no-first-run', '--no-default-browser-check'];
}

// Abre la ventana. Devuelve { cerrar } o null si no se pudo (no hay Chrome ni Edge, o se cerró de golpe porque
// otro programa se hizo cargo del pedido): entonces el que llama abre una pestaña común. alCerrar se llama
// cuando la persona cierra la ventana.
export function abrirVentana(url, perfil, alCerrar, { programa = buscarNavegadorDeVentana(), lanzarProceso = spawn } = {}) {
  const segura = direccionSegura(url);
  if (!segura || !programa) return null;
  let hijo;
  try {
    hijo = lanzarProceso(programa, argumentosDeVentana(segura, perfil), { stdio: 'ignore', windowsHide: false });
  } catch {
    return null;
  }
  const inicio = Date.now();
  let propio = false;
  hijo.once('error', () => {});
  hijo.once('exit', () => {
    if (propio) return;
    if (Date.now() - inicio < 2000) alCerrar(false);   // se cerró enseguida: no era una ventana propia
    else alCerrar(true);
  });
  return { cerrar: () => { propio = true; try { hijo.kill(); } catch {} } };
}
