// El espejo: la pantalla del sitio en el celular, en vivo dentro del panel, y tocarla desde la PC.
//
// Chrome manda cuadros JPEG (Page.startScreencast) y el panel los recibe como un video MJPEG (una imagen
// que se reemplaza sola, "multipart/x-mixed-replace"), que el navegador muestra en un <img> sin nada más.
// Solo se piden cuadros mientras haya un panel mirando: con el panel cerrado o en otra pestaña, el celular
// no trabaja de más.
import { cambio } from './estado.mjs';

const LIMITE = '--cuadro';

export function espejoInicial() {
  return { clientes: new Set(), activo: false, ultimo: null, ancho: 0, alto: 0 };
}

function escribirCuadro(respuesta, jpeg) {
  respuesta.write(`Content-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
  respuesta.write(jpeg);
  // el límite va enseguida: así el navegador sabe que el cuadro terminó y lo muestra sin esperar al siguiente
  respuesta.write(`\r\n${LIMITE}\r\n`);
}

// Un panel empieza a mirar (GET /api/espejo.mjpg).
export function mirarEspejo(app, pedido, respuesta) {
  respuesta.writeHead(200, { 'Content-Type': `multipart/x-mixed-replace; boundary=${LIMITE.slice(2)}`, 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  respuesta.write(`${LIMITE}\r\n`);
  app.espejo.clientes.add(respuesta);
  if (app.espejo.ultimo) escribirCuadro(respuesta, app.espejo.ultimo);
  pedido.on('close', () => {
    app.espejo.clientes.delete(respuesta);
    if (!app.espejo.clientes.size) detenerEspejo(app);
  });
  iniciarEspejo(app);
}

async function iniciarEspejo(app) {
  const { espejo, chrome } = app;
  if (espejo.activo || !espejo.clientes.size || !chrome || !chrome.conectado) return;
  espejo.activo = true;
  try {
    await chrome.iniciarEspejo();
  } catch (error) {
    espejo.activo = false;
    app.ui.anotar('INFO', `Espejo: ${error.message}`);
  }
}

function detenerEspejo(app) {
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
  espejo.ultimo = datos;
  espejo.ancho = ancho;
  espejo.alto = alto;
  for (const c of espejo.clientes) escribirCuadro(c, datos);
  if (!estado.espejo) { estado.espejo = true; cambio(app); }
}

const TECLAS = new Set(['Enter', 'Backspace', 'Tab', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

// Lo que se hace sobre el espejo en el panel: tocar, arrastrar, la rueda del mouse y el teclado.
// x e y llegan como fracción de la imagen (0 a 1) y se pasan a píxeles de la página en el celular.
export async function tocar(app, valor) {
  const { espejo, chrome } = app;
  if (!chrome || !chrome.conectado || !espejo.ancho || !valor || typeof valor !== 'object') return {};
  const x = Math.round(Math.min(Math.max(+valor.x || 0, 0), 1) * espejo.ancho);
  const y = Math.round(Math.min(Math.max(+valor.y || 0, 0), 1) * espejo.alto);
  try {
    switch (valor.tipo) {
      case 'inicio': await chrome.tocar('touchStart', x, y); break;
      case 'mover': await chrome.tocar('touchMove', x, y); break;
      case 'fin': await chrome.tocar('touchEnd', x, y); break;
      case 'rueda': await chrome.rueda(x, y, Math.round(+valor.dx || 0), Math.round(+valor.dy || 0)); break;
      case 'texto': if (typeof valor.texto === 'string' && valor.texto) await chrome.escribir(valor.texto.slice(0, 200)); break;
      case 'tecla': if (TECLAS.has(valor.tecla)) await chrome.tecla(valor.tecla); break;
      default: break;
    }
  } catch { /* un toque perdido no importa: el siguiente llega */ }
  return {};
}
