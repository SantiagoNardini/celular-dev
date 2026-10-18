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
    let archivo = resolve(join(raiz, ruta));
    // nada fuera de la carpeta elegida
    if (archivo !== raiz && !archivo.startsWith(raiz + sep)) return enviar(respuesta, 403, 'No permitido.');
    try {
      if (statSync(archivo).isDirectory()) archivo = join(archivo, 'index.html');
      const datos = statSync(archivo);
      respuesta.writeHead(200, {
        'Content-Type': TIPOS[extname(archivo).toLowerCase()] || 'application/octet-stream',
        'Content-Length': datos.size,
        'Cache-Control': 'no-store'
      });
      if (pedido.method === 'HEAD') return respuesta.end();
      createReadStream(archivo).pipe(respuesta);
    } catch {
      enviar(respuesta, 404, `No existe ${ruta} en la carpeta del sitio.`);
    }
  });
  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => resolver({ puerto: servidor.address().port, cerrar: () => { servidor.close(); servidor.closeAllConnections(); } }));
  });
}

function enviar(respuesta, estado, texto) {
  respuesta.writeHead(estado, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  respuesta.end(texto);
}
