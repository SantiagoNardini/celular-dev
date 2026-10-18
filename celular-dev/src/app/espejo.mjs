// El espejo: la pantalla del sitio en el celular, en vivo dentro del panel, y tocarla desde la PC.
//
// Chrome manda cuadros JPEG (Page.startScreencast) y el panel los recibe como un video MJPEG (una imagen
// que se reemplaza sola, "multipart/x-mixed-replace"), que el navegador muestra en un <img> sin nada más.
// Solo se piden cuadros mientras haya un panel mirando: con el panel cerrado o en otra pestaña, el celular
// no trabaja de más.
import { cambio } from './estado.mjs';
import { guardarPreferencia } from '../lugares.mjs';

const LIMITE = '--cuadro';

// La primera vez que toca el espejo, el aviso de bienvenida se va y no vuelve a salir.
export function marcarPrimerExito(app) {
  if (!app.estado.primerExito) return;
  app.estado.primerExito = false;
  guardarPreferencia('primerExito', true);
  cambio(app);
}

export function espejoInicial() {
  // clientes: cada panel que mira, con el ancho (en píxeles de su pantalla) en que muestra el celular
  // ultimo: la última imagen mandada (liviana o nítida); liviano: la última liviana, para reconocer el eco;
  // version: sube con cada cambio real de la pantalla; refinando: hay una captura nítida en curso
  return { clientes: new Map(), activo: false, pedido: 0, ultimo: null, liviano: null, version: 0, refinando: false, ancho: 0, alto: 0 };
}

function escribirCuadro(respuesta, jpeg) {
  respuesta.write(`Content-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
  respuesta.write(jpeg);
  // el límite va enseguida: así el navegador sabe que el cuadro terminó y lo muestra sin esperar al siguiente
  respuesta.write(`\r\n${LIMITE}\r\n`);
}

// Las imágenes se piden del ancho en que se muestran: más grandes no se ven mejor y tardan más (el
// celular las achica y las comprime). En un moto g24: 720 px, unos 108 ms del cambio a la imagen; 540 px,
// 86 ms; 360 px, 58 ms. Entre 320 y 720 px; sin dato, 540.
export const anchoPedido = url => {
  const n = parseInt(new URL(url, 'http://x').searchParams.get('ancho'), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 320), 720) : 540;
};
const anchoDeseado = espejo => Math.max(...espejo.clientes.values());

// Un panel empieza a mirar (GET /api/espejo.mjpg?ancho=...).
export function mirarEspejo(app, pedido, respuesta) {
  respuesta.writeHead(200, { 'Content-Type': `multipart/x-mixed-replace; boundary=${LIMITE.slice(2)}`, 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  respuesta.write(`${LIMITE}\r\n`);
  app.espejo.clientes.set(respuesta, anchoPedido(pedido.url));
  if (app.espejo.ultimo) escribirCuadro(respuesta, app.espejo.ultimo);
  pedido.on('close', () => {
    app.espejo.clientes.delete(respuesta);
    if (!app.espejo.clientes.size) detenerEspejo(app);
    else if (anchoDeseado(app.espejo) !== app.espejo.pedido) reanudarEspejo(app);
  });
  // si ya andaba con otro tamaño, se vuelve a pedir con el nuevo
  if (app.espejo.activo && anchoDeseado(app.espejo) !== app.espejo.pedido) reanudarEspejo(app);
  else iniciarEspejo(app);
}

async function iniciarEspejo(app) {
  const { espejo, chrome } = app;
  if (espejo.activo || !espejo.clientes.size || !chrome || !chrome.conectado) return;
  espejo.activo = true;
  espejo.pedido = anchoDeseado(espejo);
  try {
    await chrome.iniciarEspejo({ ancho: espejo.pedido, alto: Math.round(espejo.pedido * 2.25) });
  } catch (error) {
    espejo.activo = false;
    app.ui.anotar('INFO', `Espejo: ${error.message}`);
  }
}

function detenerEspejo(app) {
  clearTimeout(app.relojes.nitido);
  if (!app.espejo.activo) return;
  app.espejo.activo = false;
  app.estado.espejo = false;
  cambio(app);
  if (app.chrome && app.chrome.conectado) app.chrome.detenerEspejo();
}

// Al reconectar con la pestaña, el pedido de cuadros se perdió: se vuelve a hacer si alguien mira.
export function reanudarEspejo(app) {
  app.espejo.activo = false;
  iniciarEspejo(app);
}

// Llega un cuadro del celular: se guarda (para quien abra el panel después) y se manda a los paneles.
export function alCuadro(app, { datos, ancho, alto }) {
  const { espejo, estado } = app;
  espejo.ancho = ancho;
  espejo.alto = alto;
  // Después de cada captura nítida, Chrome manda otra vez el último cuadro liviano, idéntico byte por byte
  // (se comprobó en un moto g24; un cambio real da uno distinto). No es un cambio: se descarta, para que no
  // pise a la imagen nítida ni dispare otra captura sin fin.
  if (espejo.liviano && espejo.liviano.equals(datos)) return;
  espejo.liviano = datos;
  espejo.ultimo = datos;
  espejo.version++;
  for (const c of espejo.clientes.keys()) escribirCuadro(c, datos);
  if (!estado.espejo) { estado.espejo = true; cambio(app); }
  programarNitido(app);
}

// Mientras se toca o se desliza llegan imágenes livianas, rápidas. Cuando la pantalla se queda quieta
// (nitido ms sin cambios), llega una captura a resolución completa y poca compresión: se lee mejor justo
// cuando se mira con calma, y no cuesta velocidad cuando se usa.
function programarNitido(app) {
  clearTimeout(app.relojes.nitido);
  app.relojes.nitido = setTimeout(() => afinar(app), app.tiempos.nitido);
}

async function afinar(app) {
  const { espejo, chrome } = app;
  if (espejo.refinando || !espejo.clientes.size || !chrome || !chrome.conectado || app.interno.cerrando) return;
  const version = espejo.version;
  espejo.refinando = true;
  try {
    const nitida = await chrome.capturaNitida();
    // si la pantalla cambió mientras se sacaba, ya es vieja: se descarta
    if (espejo.version === version && espejo.clientes.size) {
      espejo.ultimo = nitida;
      for (const c of espejo.clientes.keys()) escribirCuadro(c, nitida);
    }
  } catch { /* sin imagen nítida se sigue con la liviana */ } finally {
    espejo.refinando = false;
    if (espejo.version !== version) programarNitido(app);
  }
}

const TECLAS = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

// Lo que se hace sobre el espejo en el panel: tocar, arrastrar, la rueda del mouse y el teclado.
// x e y llegan como fracción de la imagen (0 a 1) y se pasan a píxeles de la página en el celular.
export async function tocar(app, valor) {
  const { espejo, chrome } = app;
  if (!chrome || !chrome.conectado || !espejo.ancho || !valor || typeof valor !== 'object') return {};
  const x = Math.round(Math.min(Math.max(+valor.x || 0, 0), 1) * espejo.ancho);
  const y = Math.round(Math.min(Math.max(+valor.y || 0, 0), 1) * espejo.alto);
  if (valor.tipo === 'inicio') marcarPrimerExito(app);
  // No se espera a que el celular conteste: así el panel manda el siguiente movimiento enseguida. Van
  // todos por la misma conexión con Chrome, así que llegan en orden.
  const momento = Number.isFinite(+valor.t) && +valor.t > 0 ? +valor.t : 0;
  const perdido = () => {};   // un toque perdido no importa: el siguiente llega
  switch (valor.tipo) {
    case 'inicio': chrome.tocar('touchStart', x, y, momento).catch(perdido); break;
    case 'mover': chrome.tocar('touchMove', x, y, momento).catch(perdido); break;
    case 'fin': chrome.tocar('touchEnd', x, y, momento).catch(perdido); break;
    case 'rueda': chrome.rueda(x, y, Math.round(+valor.dx || 0), Math.round(+valor.dy || 0)).catch(perdido); break;
    case 'texto': if (typeof valor.texto === 'string' && valor.texto) chrome.escribir(valor.texto.slice(0, 200)).catch(perdido); break;
    case 'tecla': if (TECLAS.has(valor.tecla)) chrome.tecla(valor.tecla).catch(perdido); break;
    default: break;
  }
  return {};
}
