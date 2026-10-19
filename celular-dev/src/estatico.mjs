// Servidor propio para mostrar una carpeta con un sitio (index.html, css, js, imágenes) sin que haga
// falta tener otro servidor prendido. Sirve siempre la versión recién guardada: nada queda en caché.
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8', '.wasm': 'application/wasm'
};

export function tieneSitio(carpeta) {
  return existsSync(join(carpeta, 'index.html'));
}

// Prende el servidor en un puerto libre. Devuelve { puerto, cerrar }.
export function servirCarpeta(carpeta) {
  const raiz = resolve(carpeta);
  const servidor = createServer((pedido, respuesta) => {
    let ruta;
    try { ruta = decodeURIComponent(new URL(pedido.url, 'http://localhost').pathname); } catch { ruta = '/'; }
    if (pedido.method !== 'GET' && pedido.method !== 'HEAD') { respuesta.setHeader('Allow', 'GET, HEAD'); return enviar(respuesta, 405, 'Solo GET y HEAD.'); }
    let archivo = resolve(join(raiz, ruta));
    // nada fuera de la carpeta elegida
    if (archivo !== raiz && !archivo.startsWith(raiz + sep)) return enviar(respuesta, 403, 'No permitido.');
    try {
      if (statSync(archivo).isDirectory()) {
        // /carpeta sin la barra final: sin ella, los links relativos de su página (estilos, imágenes) se arman mal
        if (!ruta.endsWith('/')) {
          const { search } = new URL(pedido.url, 'http://localhost');
          respuesta.writeHead(301, { Location: `${ruta.split('/').map(encodeURIComponent).join('/')}/${search}`, 'Cache-Control': 'no-store' });
          return respuesta.end();
        }
        archivo = join(archivo, 'index.html');
      }
      const datos = statSync(archivo);
      const cabeceras = { 'Content-Type': TIPOS[extname(archivo).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      // pedido de una parte del archivo (el Chrome del celular lo hace para reproducir videos y audio)
      const parte = rangoPedido(pedido.headers.range, datos.size);
      if (parte === 'invalido') { respuesta.writeHead(416, { ...cabeceras, 'Content-Range': `bytes */${datos.size}` }); return respuesta.end(); }
      if (parte) {
        respuesta.writeHead(206, { ...cabeceras, 'Content-Range': `bytes ${parte.inicio}-${parte.fin}/${datos.size}`, 'Content-Length': parte.fin - parte.inicio + 1 });
        if (pedido.method === 'HEAD') return respuesta.end();
        return createReadStream(archivo, { start: parte.inicio, end: parte.fin }).on('error', () => respuesta.destroy()).pipe(respuesta);
      }
      respuesta.writeHead(200, { ...cabeceras, 'Content-Length': datos.size });
      if (pedido.method === 'HEAD') return respuesta.end();
      createReadStream(archivo).on('error', () => respuesta.destroy()).pipe(respuesta);
    } catch {
      enviar(respuesta, 404, `No existe ${ruta} en la carpeta del sitio.`);
    }
  });
  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => resolver({ puerto: servidor.address().port, cerrar: () => { servidor.close(); servidor.closeAllConnections(); } }));
  });
}

// "bytes=0-99", "bytes=100-" o "bytes=-50" -> { inicio, fin }; null si no hay rango; 'invalido' si no se puede cumplir.
export function rangoPedido(cabecera, tamano) {
  if (!cabecera) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;   // algo raro: se ignora y se manda el archivo entero
  let inicio, fin;
  if (m[1] === '') { inicio = Math.max(tamano - Number(m[2]), 0); fin = tamano - 1; }
  else { inicio = Number(m[1]); fin = m[2] === '' ? tamano - 1 : Math.min(Number(m[2]), tamano - 1); }
  if (tamano === 0 || inicio >= tamano || inicio > fin) return 'invalido';
  return { inicio, fin };
}

function enviar(respuesta, estado, texto) {
  respuesta.writeHead(estado, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  respuesta.end(texto);
}
