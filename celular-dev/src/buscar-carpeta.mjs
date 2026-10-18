// Encuentra en el disco la carpeta que se arrastró al panel. Por seguridad, el navegador no dice dónde está
// una carpeta que se suelta: solo su nombre y lo que tiene adentro. Con eso se la busca en los lugares donde
// la gente guarda sus proyectos, y se reconoce por su contenido (qué archivos tiene y de qué tamaño).
import { readdir, stat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Carpetas que no tiene sentido recorrer: de otros programas, del sistema o enormes.
const SALTEAR = /^(node_modules|appdata|library|windows|program files|program files \(x86\)|programdata|\$recycle\.bin|system volume information)$/i;

// Dónde buscar: los lugares habituales (hasta 5 niveles), el resto de la carpeta del usuario (2 niveles) y
// las carpetas donde ya se usaron proyectos (3 niveles).
export function raicesDeBusqueda(vecinas = []) {
  const casa = homedir();
  const habituales = ['Desktop', 'Escritorio', 'Documents', 'Documentos', 'Downloads', 'Descargas', 'Projects', 'Proyectos', 'dev', 'repos', 'code', 'www', 'OneDrive']
    .map(nombre => ({ ruta: join(casa, nombre), profundidad: 5 }));
  return [...habituales, ...vecinas.map(ruta => ({ ruta, profundidad: 3 })), { ruta: casa, profundidad: 2 }];
}

// Recorre por niveles (de lo más cercano a lo más profundo) buscando carpetas con ese nombre.
async function encontrarPorNombre(nombre, raices, { limite, tiempo }) {
  const fin = Date.now() + tiempo;
  const vistas = new Set();
  const halladas = new Map();   // ruta real -> ruta
  const buscado = nombre.toLowerCase();
  let visitadas = 0;
  let cola = [];
  for (const { ruta, profundidad } of raices) cola.push({ ruta, nivel: 0, profundidad });
  while (cola.length && visitadas < limite && Date.now() < fin) {
    const siguiente = [];
    for (const { ruta, nivel, profundidad } of cola) {
      if (visitadas >= limite || Date.now() >= fin) break;
      let real;
      try { real = await realpath(ruta); } catch { continue; }
      if (vistas.has(real)) continue;
      vistas.add(real);
      visitadas++;
      let entradas;
      try { entradas = await readdir(ruta, { withFileTypes: true }); } catch { continue; }
      for (const e of entradas) {
        if (!e.isDirectory() || e.name.startsWith('.') || SALTEAR.test(e.name)) continue;
        const hija = join(ruta, e.name);
        if (e.name.toLowerCase() === buscado) halladas.set(hija, hija);
        if (nivel + 1 < profundidad) siguiente.push({ ruta: hija, nivel: nivel + 1, profundidad });
      }
    }
    cola = siguiente;
  }
  return [...halladas.values()];
}

// Qué tanto se parece lo que tiene la carpeta a lo que se soltó: de 0 a 1, o null si no es un sitio.
async function puntuar(ruta, soltada) {
  let entradas;
  try { entradas = await readdir(ruta, { withFileTypes: true }); } catch { return null; }
  if (!entradas.some(e => e.isFile() && e.name.toLowerCase() === 'index.html')) return null;
  const archivos = new Map(entradas.filter(e => e.isFile()).map(e => [e.name, e]));
  const carpetas = new Set(entradas.filter(e => e.isDirectory()).map(e => e.name));
  let coinciden = 0;
  for (const a of soltada.archivos) {
    if (!archivos.has(a.nombre)) continue;
    if (a.tamano < 0) { coinciden++; continue; }
    try { if ((await stat(join(ruta, a.nombre))).size === a.tamano) coinciden++; } catch { /* no cuenta */ }
  }
  for (const nombre of soltada.carpetas) if (carpetas.has(nombre)) coinciden++;
  const total = soltada.archivos.length + soltada.carpetas.length;
  return total ? coinciden / total : 1;
}

// Devuelve las carpetas que pueden ser la que se soltó, de la más probable a la menos:
//   []  no se encontró · [una]  segura · [varias]  hay que preguntar cuál
// soltada: { nombre, archivos: [{ nombre, tamano }], carpetas: [nombre] }
export async function buscarCarpeta(soltada, { raices = raicesDeBusqueda(), limite = 20000, tiempo = 4000 } = {}) {
  const rutas = await encontrarPorNombre(soltada.nombre, raices, { limite, tiempo });
  const candidatas = [];
  for (const ruta of rutas) {
    const puntaje = await puntuar(ruta, soltada);
    if (puntaje === null) continue;
    let modificada = 0;
    try { modificada = (await stat(join(ruta, 'index.html'))).mtimeMs; } catch { /* queda en 0 */ }
    candidatas.push({ ruta, puntaje, modificada });
  }
  candidatas.sort((a, b) => b.puntaje - a.puntaje || b.modificada - a.modificada);
  if (candidatas.length <= 1) return candidatas;
  // si una se parece claramente más que las demás, es esa; si no, se pregunta
  if (candidatas[0].puntaje - candidatas[1].puntaje >= 0.2) return [candidatas[0]];
  const mejores = candidatas.filter(c => candidatas[0].puntaje - c.puntaje < 0.2);
  return mejores.slice(0, 6);
}

// Lo que mandó el panel, limpio: nombres cortos y sin rutas, tamaños numéricos, cantidades acotadas.
export function limpiarSoltada(valor) {
  if (!valor || typeof valor !== 'object') return null;
  const nombre = typeof valor.nombre === 'string' ? valor.nombre : '';
  if (!nombre || nombre.length > 255 || /[\\/]/.test(nombre)) return null;
  const sinRutas = s => typeof s === 'string' && s.length > 0 && s.length <= 255 && !/[\\/]/.test(s);
  const archivos = (Array.isArray(valor.archivos) ? valor.archivos : []).slice(0, 300)
    .filter(a => a && sinRutas(a.nombre)).map(a => ({ nombre: a.nombre, tamano: Number.isFinite(+a.tamano) ? +a.tamano : -1 }));
  const carpetas = (Array.isArray(valor.carpetas) ? valor.carpetas : []).slice(0, 300).filter(sinRutas);
  return { nombre, archivos, carpetas };
}

