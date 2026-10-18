// Arma archivos ZIP y .tar.gz sin programas de afuera, para que el paquete salga igual desde Windows,
// Mac o Linux (en GitHub se arma en Linux). Lo importante: guardan el permiso de ejecución, así en Mac y
// Linux el lanzador y node abren con doble clic sin tener que darles permiso a mano.
// Cada entrada es { nombre, datos, modo }: nombre con "/" (las carpetas terminan en "/" y no llevan datos).
import { deflateRawSync, gzipSync, crc32 } from 'node:zlib';

// fecha fija (1/1/2026): el mismo contenido da siempre el mismo archivo, byte por byte
const FECHA = new Date(2026, 0, 1);
const fechaDos = () => (((FECHA.getFullYear() - 1980) << 9) | ((FECHA.getMonth() + 1) << 5) | FECHA.getDate());

export function armarZip(entradas) {
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const { nombre, datos = Buffer.alloc(0), modo } of entradas) {
    const esCarpeta = nombre.endsWith('/');
    const nombreBytes = Buffer.from(nombre, 'utf8');
    const comprimido = esCarpeta ? Buffer.alloc(0) : deflateRawSync(datos, { level: 9 });
    const crc = esCarpeta ? 0 : crc32(datos);
    const metodo = esCarpeta ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);            // nombres en UTF-8
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(fechaDos(), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBytes.length, 26);
    locales.push(local, nombreBytes, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);   // hecho en "Unix": así se respetan los permisos
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(fechaDos(), 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBytes.length, 28);
    const permisos = (esCarpeta ? 0o040000 : 0o100000) | (modo ?? (esCarpeta ? 0o755 : 0o644));
    central.writeUInt32LE(((permisos << 16) | (esCarpeta ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombreBytes);
    desplazamiento += local.length + nombreBytes.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

// tar (formato ustar) comprimido con gzip
export function armarTarGz(entradas) {
  const partes = [];
  for (const { nombre, datos = Buffer.alloc(0), modo } of entradas) {
    const esCarpeta = nombre.endsWith('/');
    const cabecera = Buffer.alloc(512);
    let [prefijo, corto] = ['', nombre];
    if (Buffer.byteLength(nombre) > 100) {
      const corte = nombre.lastIndexOf('/', nombre.length - 2);
      [prefijo, corto] = [nombre.slice(0, corte), nombre.slice(corte + 1)];
    }
    const octal = (n, largo) => n.toString(8).padStart(largo - 1, '0') + '\0';
    cabecera.write(corto, 0, 100, 'utf8');
    cabecera.write(octal(modo ?? (esCarpeta ? 0o755 : 0o644), 8), 100, 'ascii');
    cabecera.write(octal(0, 8), 108, 'ascii');
    cabecera.write(octal(0, 8), 116, 'ascii');
    cabecera.write(octal(esCarpeta ? 0 : datos.length, 12), 124, 'ascii');
    cabecera.write(octal(Math.floor(FECHA.getTime() / 1000), 12), 136, 'ascii');
    cabecera.fill(' ', 148, 156);
    cabecera.write(esCarpeta ? '5' : '0', 156, 'ascii');
    cabecera.write('ustar\0', 257, 'ascii');
    cabecera.write('00', 263, 'ascii');
    cabecera.write(prefijo, 345, 155, 'utf8');
    let suma = 0;
    for (const byte of cabecera) suma += byte;
    cabecera.write(suma.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    partes.push(cabecera);
    if (!esCarpeta && datos.length) {
      partes.push(datos);
      const relleno = (512 - (datos.length % 512)) % 512;
      if (relleno) partes.push(Buffer.alloc(relleno));
    }
  }
  partes.push(Buffer.alloc(1024));   // dos bloques vacíos: fin del archivo
  return gzipSync(Buffer.concat(partes), { level: 9 });
}
