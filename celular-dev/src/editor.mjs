// Del lugar de un error en el celular ("/js/app.js:214:9") al archivo de tu código, y abrirlo en el
// editor justo en esa línea (Visual Studio Code si está; si no, el programa que abre ese tipo de archivo).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, normalize, sep, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { buscarCode, abrirConElSistema } from './sistema.mjs';

const SALTEAR = new Set(['node_modules', '.git', '.next', '.cache', '.vercel', '.netlify', 'coverage']);

// "/js/app.js:214:9" o "http://localhost:5500/dist/app.js:3" -> { ruta: '/js/app.js', linea: 214, columna: 9 }
export function partirLugar(donde) {
  const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(donde || '');
  if (!m) return null;
  let ruta = m[1];
  try { if (/^https?:\/\//.test(ruta)) ruta = new URL(ruta).pathname; } catch { /* queda como vino */ }
  try { ruta = decodeURIComponent(ruta.split('?')[0].split('#')[0]); } catch { /* queda como vino */ }
  return { ruta, linea: +m[2], columna: m[3] ? +m[3] : 1 };
}

// Busca un archivo por nombre dentro de la carpeta (hasta 5 niveles), para cuando la ruta del servidor
// no coincide con la del disco. Si hay varios con el mismo nombre, no adivina.
function buscarPorNombre(carpeta, nombre, nivel = 0, hallados = []) {
  if (nivel > 5 || hallados.length > 1) return hallados;
  let entradas;
  try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { return hallados; }
  for (const e of entradas) {
    if (e.isDirectory()) { if (!SALTEAR.has(e.name)) buscarPorNombre(join(carpeta, e.name), nombre, nivel + 1, hallados); }
    else if (e.name === nombre) hallados.push(join(carpeta, e.name));
  }
  return hallados;
}

// Devuelve { archivo, linea, columna } o null si no se encuentra el archivo en la carpeta del código.
// rutaSitio: la carpeta del sitio dentro del servidor (por ejemplo /dist/), que en el disco puede no estar.
export function ubicar(donde, carpeta, rutaSitio = '/') {
  const lugar = partirLugar(donde);
  if (!lugar || !carpeta) return null;
  const raiz = resolve(carpeta);
  const dentro = archivo => archivo === raiz || archivo.startsWith(raiz + sep);
  const relativa = lugar.ruta.replace(/^\/+/, '');
  const sinSitio = rutaSitio !== '/' && lugar.ruta.startsWith(rutaSitio) ? lugar.ruta.slice(rutaSitio.length) : null;
  const candidatos = [relativa, sinSitio].filter(Boolean).map(r => resolve(join(raiz, normalize(r))));
  let archivo = candidatos.find(c => dentro(c) && existsSync(c) && statSync(c).isFile());
  if (!archivo) {
    const hallados = buscarPorNombre(raiz, basename(lugar.ruta));
    if (hallados.length === 1) archivo = hallados[0];
  }
  return archivo ? { archivo, linea: lugar.linea, columna: lugar.columna } : null;
}

// Abre el archivo en esa línea. Devuelve 'vscode' o 'sistema' según cómo lo abrió.
export function abrirEnEditor({ archivo, linea, columna }) {
  return new Promise(resolver => {
    const code = buscarCode();
    const destino = `${archivo}:${linea}:${columna}`;
    const p = process.platform === 'win32'
      ? spawn('cmd', ['/c', `"${code}" --goto "${destino}"`], { stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true })
      : spawn(code, ['--goto', destino], { stdio: 'ignore' });
    p.once('error', () => { abrirConElSistema(archivo); resolver('sistema'); });
    p.once('exit', codigo => {
      if (codigo === 0) return resolver('vscode');
      abrirConElSistema(archivo);
      resolver('sistema');
    });
  });
}

