// Todo lo que se muestra en la terminal: mensajes con etiqueta de color, pasos, carteles y el título
// de la ventana. Cada mensaje queda también anotado en el registro (Documentos/celular-dev/registro.log).
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from './idioma.mjs';

const COLOR = {
  verde: '\x1b[32m', amarillo: '\x1b[33m', rojo: '\x1b[31m', cian: '\x1b[36m',
  gris: '\x1b[90m', blanco: '\x1b[97m', negrita: '\x1b[1m', normal: '\x1b[0m'
};
const conColor = process.stdout.isTTY && !process.env.NO_COLOR;
const pintar = (color, texto) => (conColor ? COLOR[color] + texto + COLOR.normal : texto);

let registro = null;

// Todo texto que viene de afuera (errores de la página, consola del celular, salida de ADB) pasa por acá antes de
// mostrarse: una página podría escribir códigos de escape (cambiar el título de la ventana, mover el cursor, pegar
// en el portapapeles) o saltos de línea que falsifiquen renglones del registro.
export const limpiarControl = texto => String(texto == null ? '' : texto).replace(/\r\n|\r|\n/g, ' ⏎ ').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]+/g, ' ');

export function iniciarRegistro(carpeta) {
  try {
    mkdirSync(carpeta, { recursive: true });
    registro = join(carpeta, 'registro.log');
    writeFileSync(registro, `Registro de celular-dev - ${fechaHora()}\n`);
  } catch {
    registro = null;   // sin registro se sigue igual: es solo para revisar después
  }
  return registro;
}

// Fecha local (no la universal de toISOString, que de noche ya es el día siguiente).
export function fecha(d = new Date()) {
  const dos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function fechaHora() {
  return `${fecha()} ${hora()}`;
}

export function hora(d = new Date()) {
  return d.toTimeString().slice(0, 8);
}

export function anotar(etiqueta, texto) {
  if (!registro) return;
  try { appendFileSync(registro, `${fechaHora()} [${etiqueta}] ${limpiarControl(texto)}\n`); } catch { /* se sigue sin anotar */ }
}

function mensaje(etiqueta, color, texto, solucion = []) {
  texto = limpiarControl(texto);
  console.log(`${pintar('gris', hora())} ${pintar(color, `[${etiqueta.padEnd(6)}]`)} ${texto}`);
  anotar(etiqueta, texto);
  for (const linea of solucion) {
    console.log(pintar(color, `                  -> ${linea}`));
    anotar(etiqueta, `   -> ${linea}`);
  }
}

export const ok = texto => mensaje('OK', 'verde', texto);
export const info = texto => mensaje('INFO', 'gris', texto);
export const aviso = (texto, solucion) => mensaje('ESPERA', 'amarillo', texto, solucion);
export const falla = (texto, solucion) => mensaje('ERROR', 'rojo', texto, solucion);

// Lo que viene del celular (consola, errores de la página, red) va con su propia etiqueta: primero
// la explicación simple y debajo, en gris, el mensaje técnico y dónde ocurrió.
export function delCelular(nivel, simple, tecnico, donde, veces = 1) {
  simple = limpiarControl(simple); tecnico = limpiarControl(tecnico); donde = limpiarControl(donde);
  const color = nivel === 'error' ? 'rojo' : nivel === 'aviso' ? 'amarillo' : 'blanco';
  const etiqueta = nivel === 'error' ? 'CEL ✖' : nivel === 'aviso' ? 'CEL !' : 'CEL';
  const repetido = veces > 1 ? pintar('gris', `  (×${veces})`) : '';
  console.log(`${pintar('gris', hora())} ${pintar(color, `[${etiqueta.padEnd(6)}]`)} ${pintar(color, simple.replace(/`/g, ''))}${repetido}`);
  const detalle = [tecnico !== simple ? tecnico : '', donde ? `en ${donde}` : ''].filter(Boolean).join(' · ');
  if (detalle) console.log(pintar('gris', `                  ${detalle}`));
  anotar(etiqueta, `${simple}${tecnico !== simple ? ` | ${tecnico}` : ''}${donde ? ` (en ${donde})` : ''}${veces > 1 ? ` x${veces}` : ''}`);
}

export function paso(n, total, texto) {
  console.log('');
  console.log(pintar('cian', `  ${t('pantalla.paso', { n, total, texto })}`));
  anotar('PASO', `${n} de ${total}: ${texto}`);
}

export function cartel(texto, color = 'cian') {
  const linea = '='.repeat(texto.length + 6);
  console.log('');
  console.log(pintar(color, `  ${linea}`));
  console.log(pintar(color, `     ${texto}`));
  console.log(pintar(color, `  ${linea}`));
  console.log('');
}

export function renglon(texto, color = 'blanco') {
  console.log(pintar(color, texto));
}

// El título de la ventana muestra siempre el estado, aunque esté minimizada.
export function titulo(texto) {
  if (process.stdout.isTTY) process.stdout.write(`\x1b]0;${texto}\x07`);
}
