// Dibuja el ícono de celular-dev: un celular gris claro sobre fondo negro, con una página web adentro (la barra de
// direcciones y dos bloques de contenido). Usa los grises y el negro del fondo del panel. Se guarda como
// marca/icono.ico con los tamaños que usa Windows (16 a 256 px), como marca/icono.png (256 px) y como marca/icono.icns
// (Mac). Sin librerías: las figuras se calculan píxel por píxel (con 4×4 muestras por píxel para bordes suaves)
// y el PNG se arma a mano con zlib, que viene con Node.
// Uso: node scripts/generar-icono.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONDO = [0x1b, 0x1b, 0x1b];      // la tarjeta del panel en oscuro (casi negro)
const BORDE = [0x3d, 0x3d, 0x3d];      // el borde fuerte del panel
const CUERPO = [0xd6, 0xd6, 0xd6];     // el celular, gris claro
const GRIS = [0xa8, 0xa8, 0xa8];       // el texto secundario del panel: la página de adentro
const PANTALLA = [0x12, 0x12, 0x12];   // el fondo del panel (negro)

// distancia con signo a un rectángulo de esquinas redondeadas (negativa adentro); medidas de 0 a 1
function rectRedondeado(x, y, cx, cy, ancho, alto, radio) {
  const qx = Math.abs(x - cx) - ancho / 2 + radio;
  const qy = Math.abs(y - cy) - alto / 2 + radio;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio;
}

// color del punto (x, y) del ícono, o null si es transparente
function colorEn(x, y) {
  const marco = rectRedondeado(x, y, 0.5, 0.5, 0.94, 0.94, 0.22);
  if (marco > 0) return null;
  if (marco > -0.016) return BORDE;                                                   // un filo gris, para que no se pierda sobre fondos oscuros
  if (rectRedondeado(x, y, 0.5, 0.5, 0.46, 0.76, 0.095) > 0) return FONDO;          // fuera del celular
  if (rectRedondeado(x, y, 0.5, 0.5, 0.372, 0.64, 0.045) < 0) {                       // la pantalla, con una página web
    if (rectRedondeado(x, y, 0.5, 0.3, 0.3, 0.075, 0.0375) < 0) return GRIS;       // la barra de direcciones
    if (rectRedondeado(x, y, 0.5, 0.455, 0.3, 0.15, 0.025) < 0) return GRIS;       // un bloque (imagen)
    if (rectRedondeado(x, y, 0.5, 0.585, 0.3, 0.03, 0.015) < 0) return GRIS;       // renglón
    if (rectRedondeado(x, y, 0.455, 0.65, 0.21, 0.03, 0.015) < 0) return GRIS;     // renglón corto
    return PANTALLA;
  }
  if (rectRedondeado(x, y, 0.5, 0.153, 0.1, 0.02, 0.01) < 0) return FONDO;           // el altavoz
  return CUERPO;
}

function dibujar(tamano) {
  const pixeles = Buffer.alloc(tamano * tamano * 4);
  const M = 4;
  for (let py = 0; py < tamano; py++) {
    for (let px = 0; px < tamano; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < M; sy++) for (let sx = 0; sx < M; sx++) {
        const c = colorEn((px + (sx + 0.5) / M) / tamano, (py + (sy + 0.5) / M) / tamano);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const i = (py * tamano + px) * 4;
      if (a) { pixeles[i] = r / a; pixeles[i + 1] = g / a; pixeles[i + 2] = b / a; }
      pixeles[i + 3] = Math.round((a / (M * M)) * 255);
    }
  }
  return pixeles;
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(datos) {
  let c = 0xffffffff;
  for (const byte of datos) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function png(tamano, rgba) {
  const parte = (tipo, datos) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(tamano, 0); cabecera.writeUInt32BE(tamano, 4);
  cabecera[8] = 8; cabecera[9] = 6;   // 8 bits por canal, RGBA
  const crudo = Buffer.alloc(tamano * (tamano * 4 + 1));
  for (let y = 0; y < tamano; y++) rgba.copy(crudo, y * (tamano * 4 + 1) + 1, y * tamano * 4, (y + 1) * tamano * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parte('IHDR', cabecera), parte('IDAT', deflateSync(crudo, { level: 9 })), parte('IEND', Buffer.alloc(0))
  ]);
}

// ICO con una imagen PNG por tamaño (Windows Vista en adelante lo entiende)
function ico(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0); cabecera.writeUInt16LE(1, 2); cabecera.writeUInt16LE(imagenes.length, 4);
  let desplazamiento = 6 + 16 * imagenes.length;
  const entradas = imagenes.map(({ tamano, datos }) => {
    const e = Buffer.alloc(16);
    e[0] = tamano >= 256 ? 0 : tamano; e[1] = tamano >= 256 ? 0 : tamano;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(datos.length, 8); e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += datos.length;
    return e;
  });
  return Buffer.concat([cabecera, ...entradas, ...imagenes.map(i => i.datos)]);
}

// ICNS (el ícono de las apps de Mac): una cabecera y una entrada por tamaño, cada una con su PNG
function icns(imagenes) {
  const TIPOS = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09' };
  const entradas = imagenes.filter(i => TIPOS[i.tamano]).map(({ tamano, datos }) => {
    const e = Buffer.alloc(8);
    e.write(TIPOS[tamano], 0, 'ascii'); e.writeUInt32BE(datos.length + 8, 4);
    return Buffer.concat([e, datos]);
  });
  const cabecera = Buffer.alloc(8);
  cabecera.write('icns', 0, 'ascii'); cabecera.writeUInt32BE(8 + entradas.reduce((n, e) => n + e.length, 0), 4);
  return Buffer.concat([cabecera, ...entradas]);
}

const carpeta = join(dirname(fileURLToPath(import.meta.url)), '..', 'marca');
mkdirSync(carpeta, { recursive: true });
const imagenes = [16, 24, 32, 48, 64, 128, 256].map(tamano => ({ tamano, datos: png(tamano, dibujar(tamano)) }));
writeFileSync(join(carpeta, 'icono.ico'), ico(imagenes));
writeFileSync(join(carpeta, 'icono.png'), imagenes.at(-1).datos);
writeFileSync(join(carpeta, 'icono.icns'), icns([...imagenes, { tamano: 512, datos: png(512, dibujar(512)) }]));
console.log(`Listo: icono.ico (${imagenes.map(i => i.tamano).join(', ')} px), icono.png (256 px) e icono.icns (16 a 512 px) en ${carpeta}`);
