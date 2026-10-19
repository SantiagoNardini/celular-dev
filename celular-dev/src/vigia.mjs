// Vigila los archivos del proyecto y avisa cuando se guardó algo, una sola vez por tanda: al guardar,
// los editores suelen escribir varias veces seguidas (o varios archivos).
import { watch, existsSync } from 'node:fs';
import { sep } from 'node:path';

// Carpetas y archivos que cambian solos o no forman parte de la página.
const IGNORAR = /(^|[\\/])(node_modules|\.git|\.vscode|\.idea|\.netlify|\.vercel|\.next|\.cache|\.celular|dist|build|coverage)([\\/]|$)|~$|\.tmp(\.|$)|\.swp$|\.crswap$|\.log$/;

// alFallar(error): no se pudo vigilar (por ejemplo, ENOSPC en Linux por el límite de archivos vigilados, o la carpeta se borró).
export function vigilar(carpeta, alGuardar, espera = 300, alFallar = () => {}) {
  let reloj = null;
  let cambiados = new Set();
  let vigia;
  // según el sistema y la versión de Node, vigilar una carpeta que no existe tira el error enseguida, más tarde o nunca
  if (!existsSync(carpeta)) {
    alFallar(Object.assign(new Error(`ENOENT: no existe la carpeta ${carpeta}`), { code: 'ENOENT' }));
    return () => {};
  }
  try {
    vigia = watch(carpeta, { recursive: true }, (_tipo, nombre) => {
    if (!nombre || IGNORAR.test(nombre)) return;
    cambiados.add(nombre.split(sep).join('/'));
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      const lista = [...cambiados];
      cambiados = new Set();
      alGuardar(lista);
    }, espera);
    });
  } catch (error) {
    alFallar(error);
    return () => {};
  }
  vigia.on('error', error => { try { vigia.close(); } catch { /* ya cerrado */ } alFallar(error); });
  return () => { clearTimeout(reloj); vigia.close(); };
}
