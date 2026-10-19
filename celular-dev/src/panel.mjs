// El panel: una página en el navegador de la PC para usar la herramienta sin la terminal.
// Muestra el estado en vivo (le llega por SSE cada vez que algo cambia), manda las acciones de los botones
// y muestra el espejo del celular (un video MJPEG que arma el programa).
//
// Seguridad: escucha solo en 127.0.0.1, rechaza pedidos con otro Host (así una página de internet no
// puede usarlo aunque apunte su dominio a 127.0.0.1) y las acciones exigen un encabezado propio, que un
// sitio ajeno no puede mandar sin permiso del navegador.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CELULAR_PUERTO_PANEL: otro puerto (lo usan las pruebas, para no chocar con una copia abierta)
export const PUERTO_PANEL = +process.env.CELULAR_PUERTO_PANEL || 47823;
const carpeta = join(dirname(fileURLToPath(import.meta.url)), 'panel');
const ARCHIVOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/panel.css': ['panel.css', 'text/css; charset=utf-8'],
  '/panel.js': ['panel.js', 'text/javascript; charset=utf-8'],
  '/herramientas.js': ['herramientas.js', 'text/javascript; charset=utf-8'],
  '/icono.png': [join('..', '..', 'marca', 'icono.png'), 'image/png']
};
const HOSTS = new Set([`127.0.0.1:${PUERTO_PANEL}`, `localhost:${PUERTO_PANEL}`]);

// Prende el panel. Si el puerto está ocupado, ya hay otra copia corriendo: devuelve null.
export function iniciarPanel({ obtenerEstado, alAccion, obtenerTextos = () => ({}), alEspejo = null }) {
  const clientes = new Set();
  let pendiente = null;

  const servidor = createServer(async (pedido, respuesta) => {
    if (!HOSTS.has(pedido.headers.host)) { respuesta.writeHead(403); return respuesta.end(); }
    const ruta = pedido.url.split('?')[0];

    if (pedido.method === 'GET' && ARCHIVOS[ruta]) {
      const [archivo, tipo] = ARCHIVOS[ruta];
      respuesta.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
      return respuesta.end(readFileSync(join(carpeta, archivo)));
    }
    if (pedido.method === 'GET' && ruta === '/api/estado') return json(respuesta, 200, obtenerEstado());
    if (pedido.method === 'GET' && ruta === '/api/eventos') {
      respuesta.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      respuesta.write(`data: ${JSON.stringify(obtenerEstado())}\n\n`);
      clientes.add(respuesta);
      pedido.on('close', () => clientes.delete(respuesta));
      return;
    }
    if (pedido.method === 'GET' && ruta === '/api/textos') return json(respuesta, 200, obtenerTextos());
    if (pedido.method === 'GET' && ruta === '/api/espejo.mjpg' && alEspejo) return alEspejo(pedido, respuesta);
    if (pedido.method === 'POST' && ruta === '/api/accion') {
      if (pedido.headers['x-celular'] !== '1') return json(respuesta, 403, { error: 'No permitido.' });
      let cuerpo = '';
      for await (const parte of pedido) { cuerpo += parte; if (cuerpo.length > 10000) break; }
      try {
        const { accion, valor } = JSON.parse(cuerpo || '{}');
        return json(respuesta, 200, (await alAccion(accion, valor)) || {});
      } catch (error) {
        return json(respuesta, 200, { error: error.message });
      }
    }
    respuesta.writeHead(404);
    respuesta.end();
  });

  // Manda el estado a todos los paneles abiertos, como mucho cada 150 ms aunque cambie más seguido.
  function avisar() {
    if (pendiente) return;
    pendiente = setTimeout(() => {
      pendiente = null;
      const datos = `data: ${JSON.stringify(obtenerEstado())}\n\n`;
      for (const c of clientes) c.write(datos);
    }, 150);
  }

  let latido = null;

  return new Promise(resolver => {
    servidor.once('error', () => resolver(null));
    servidor.listen(PUERTO_PANEL, '127.0.0.1', () => {
      // cada 25 s un comentario vacío, para que la conexión no se corte por inactividad (solo si el
      // panel abrió: si no, el reloj quedaría andando y no dejaría terminar el programa)
      latido = setInterval(() => { for (const c of clientes) c.write(': \n\n'); }, 25000);
      resolver({
      url: `http://localhost:${PUERTO_PANEL}/`,
      avisar,
      // se cortan también las conexiones abiertas (el SSE y las que el navegador deja vivas): si no,
      // close() espera a que se cierren solas y el programa no termina
      cerrar: () => { clearInterval(latido); clearTimeout(pendiente); for (const c of clientes) c.end(); servidor.close(); servidor.closeAllConnections(); }
      });
    });
  });
}

function json(respuesta, estado, datos) {
  respuesta.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  respuesta.end(JSON.stringify(datos));
}

