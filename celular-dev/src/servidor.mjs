// Encontrar el servidor local que muestra el sitio y saber si sigue prendido.
import net from 'node:net';

// 8765: vista previa propia (npm run dev). 5500: Live Server de VS Code. 5173: Vite. 3000: Next/React.
// 4321: Astro. 8080: varios. 4200: Angular.
export const PUERTOS_CONOCIDOS = [5173, 3000, 8765, 5500, 4321, 8080, 4200];

// ¿Hay algo escuchando en ese puerto? Solo abre y cierra una conexión: no pide ninguna página, así el
// servidor no trabaja (hay vistas previas que recompilan el sitio entero cada vez que se pide la página).
// En localhost, un puerto cerrado contesta enseguida, así que una caída se nota al instante.
export function puertoAbierto(puerto, espera = 500) {
  return new Promise(resolver => {
    const s = net.connect({ port: puerto, host: 'localhost' });
    const fin = valor => { s.destroy(); resolver(valor); };
    s.setTimeout(espera, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
}

async function pedir(direccion) {
  try {
    const r = await fetch(direccion, { signal: AbortSignal.timeout(4000), redirect: 'follow' });
    return await r.text();
  } catch {
    return null;
  }
}

// Mira un puerto: si hay un servidor, averigua qué carpeta muestra la página. Pide la página una sola
// vez, al encontrarlo: después solo se mira que el puerto siga abierto.
// Devuelve { puerto, ruta, liveServer } o null.
async function revisar(p, ruta = '') {
  if (!(await puertoAbierto(p))) return null;
  let contenido = await pedir(`http://localhost:${p}${ruta || '/'}`);
  if (contenido === null) return null;
  let rutaFinal = ruta;
  // Live Server sobre la carpeta del proyecto: muestra la lista de archivos; la página está en una carpeta
  if (!ruta && /<title>listing directory/i.test(contenido)) {
    for (const carpeta of ['/dist/', '/src/', '/public/', '/build/', '/www/']) {
      const pagina = await pedir(`http://localhost:${p}${carpeta}`);
      if (pagina && !/<title>listing directory/i.test(pagina)) { rutaFinal = carpeta; contenido = pagina; break; }
    }
  }
  return { puerto: p, ruta: rutaFinal || '/', liveServer: /Code injected by live-server/.test(contenido) };
}

// El primer servidor que encuentre (en el puerto pedido, o en los conocidos).
export async function detectar({ puerto, ruta = '' } = {}) {
  for (const p of puerto ? [puerto] : PUERTOS_CONOCIDOS) {
    const hallado = await revisar(p, ruta);
    if (hallado) return hallado;
  }
  return null;
}

// Todos los servidores prendidos en los puertos conocidos (para ofrecerlos en el panel), menos los excluidos.
export async function detectarTodos(excluir = []) {
  const hallados = await Promise.all(PUERTOS_CONOCIDOS.filter(p => !excluir.includes(p)).map(p => revisar(p)));
  return hallados.filter(Boolean);
}
