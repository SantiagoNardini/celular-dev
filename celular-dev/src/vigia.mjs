// Vigila los archivos del proyecto y avisa cuando se guardó algo, una sola vez por tanda: al guardar,
// los editores suelen escribir varias veces seguidas (o varios archivos).
import { watch } from 'node:fs';
import { sep } from 'node:path';

// Carpetas y archivos que cambian solos o no forman parte de la página.
const IGNORAR = /(^|[\\/])(node_modules|\.git|\.vscode|\.idea|\.netlify|\.vercel|\.next|\.cache|\.celular|dist|build|coverage)([\\/]|$)|~$|\.tmp(\.|$)|\.swp$|\.crswap$|\.log$/;

export function vigilar(carpeta, alGuardar, espera = 300) {
  let reloj = null;
  let cambiados = new Set();
  const vigia = watch(carpeta, { recursive: true }, (_tipo, nombre) => {
    if (!nombre || IGNORAR.test(nombre)) return;
    cambiados.add(nombre.split(sep).join('/'));
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      const lista = [...cambiados];
      cambiados = new Set();
      alGuardar(lista);
    }, espera);
  });
  return () => { clearTimeout(reloj); vigia.close(); };
}
