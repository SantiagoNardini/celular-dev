// Dónde guarda sus cosas celular-dev (no en la carpeta de cada proyecto: se usa desde un solo lugar)
// y qué recuerda entre una vez y otra: las carpetas usadas y dónde está el código de cada servidor.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Documentos\celular-dev: ahí van el registro, las capturas y los informes, fáciles de encontrar.
// Si no hay carpeta Documentos (por ejemplo, la movió OneDrive), en la carpeta del usuario.
export function carpetaDatos() {
  // CELULAR_DATOS: otra carpeta (la usan las pruebas, para no tocar la de verdad)
  if (process.env.CELULAR_DATOS) { mkdirSync(process.env.CELULAR_DATOS, { recursive: true }); return process.env.CELULAR_DATOS; }
  // Linux en español la llama Documentos; en Windows puede estar dentro de OneDrive
  const documentos = [join(homedir(), 'Documents'), join(homedir(), 'Documentos'), join(homedir(), 'OneDrive', 'Documents'), join(homedir(), 'OneDrive', 'Documentos')].find(existsSync);
  const carpeta = join(documentos || homedir(), 'celular-dev');
  mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

// Muestra una ruta acortada a partir de la carpeta del usuario: ~\Documents\celular-dev\capturas\...
export function rutaParaMostrar(ruta) {
  const casa = homedir();
  return ruta.toLowerCase().startsWith(casa.toLowerCase()) ? '~' + ruta.slice(casa.length) : ruta;
}

const ARCHIVO = () => join(carpetaDatos(), 'config.json');

export function leerConfig() {
  try {
    const c = JSON.parse(readFileSync(ARCHIVO(), 'utf8'));
    const objeto = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return { recientes: Array.isArray(c.recientes) ? c.recientes : [], codigo: objeto(c.codigo), preferencias: objeto(c.preferencias) };
  } catch {
    return { recientes: [], codigo: {}, preferencias: {} };
  }
}

// Preferencias sueltas (por ejemplo, no volver a ofrecer los accesos directos).
export function preferencia(clave) {
  return leerConfig().preferencias[clave];
}

export function guardarPreferencia(clave, valor) {
  const config = leerConfig();
  config.preferencias[clave] = valor;
  guardarConfig(config);
}

function guardarConfig(config) {
  try { writeFileSync(ARCHIVO(), JSON.stringify(config, null, 2)); } catch { /* si no se puede, la próxima vez no lo recuerda */ }
}

// Las últimas 5 carpetas usadas, la más reciente primero.
export function recordarCarpeta(ruta) {
  const config = leerConfig();
  config.recientes = [ruta, ...config.recientes.filter(r => r.toLowerCase() !== ruta.toLowerCase())].slice(0, 5);
  guardarConfig(config);
}

// Dónde está el código del servidor de cada puerto, para recargar el celular al guardar.
export function recordarCodigo(puerto, ruta) {
  const config = leerConfig();
  config.codigo[String(puerto)] = ruta;
  guardarConfig(config);
}

export function codigoRecordado(puerto) {
  const ruta = leerConfig().codigo[String(puerto)];
  return ruta && existsSync(ruta) ? ruta : null;
}
