// Conexión con el Chrome del celular por el protocolo de DevTools (el mismo que usa chrome://inspect).
// Se mantiene abierta mientras corre: por ahí llegan los errores y la consola de la página, y por ahí
// se le pide recargar, sacar una captura o mandar la pantalla en vivo (el espejo).
import { EventEmitter } from 'node:events';

// latencia en ms y velocidades en bytes por segundo (-1: sin límite). "lenta" es como el 3G lento de
// las DevTools de Chrome: 400 ms y unos 50 kB/s.
export const PERFILES_RED = {
  normal: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  lenta: { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 },
  'sin-conexion': { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }
};

// códigos de teclado de las teclas que se pueden mandar desde el espejo
const TECLAS = { Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

export class Chrome extends EventEmitter {
  constructor(puertoDevtools) {
    super();
    this.puerto = puertoDevtools;
    this.ws = null;
    this.pendientes = new Map();
    this.siguienteId = 1;
    this.pestana = null;
  }

  async pestanas() {
    const r = await fetch(`http://localhost:${this.puerto}/json`, { signal: AbortSignal.timeout(3000) });
    return (await r.json()).filter(p => p.type === 'page');
  }

  async buscar(prefijoUrl) {
    try {
      return (await this.pestanas()).find(p => p.url.startsWith(prefijoUrl)) || null;
    } catch {
      return null;
    }
  }

  // Se conecta a la pestaña del sitio. Una pestaña en segundo plano está congelada y no contesta:
  // se la trae al frente antes.
  async conectar(pestana) {
    this.cerrar();
    await fetch(`http://localhost:${this.puerto}/json/activate/${pestana.id}`, { signal: AbortSignal.timeout(3000) }).catch(() => {});
    const ws = new WebSocket(pestana.webSocketDebuggerUrl);
    await new Promise((resolver, rechazar) => {
      const reloj = setTimeout(() => rechazar(new Error('Chrome del celular no contestó')), 5000);
      ws.addEventListener('open', () => { clearTimeout(reloj); resolver(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(reloj); rechazar(new Error('no se pudo conectar con la pestaña')); }, { once: true });
    });
    this.ws = ws;
    this.pestana = pestana;
    ws.addEventListener('message', e => this.recibir(JSON.parse(e.data)));
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const { rechazar } of this.pendientes.values()) rechazar(new Error('se cerró la conexión con la pestaña'));
      this.pendientes.clear();
      this.emit('cerrada');
    });
    for (const dominio of ['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable']) await this.enviar(dominio);
  }

  recibir(m) {
    if (m.id && this.pendientes.has(m.id)) {
      const { resolver, rechazar, reloj } = this.pendientes.get(m.id);
      clearTimeout(reloj);
      this.pendientes.delete(m.id);
      if (m.error) rechazar(new Error(m.error.message)); else resolver(m.result);
    } else if (m.method === 'Page.screencastFrame') {
      this.alCuadro(m.params);
    } else if (m.method) {
      this.emit('evento', m.method, m.params);
    }
  }

  enviar(metodo, params = {}, espera = 10000) {
    if (!this.ws) return Promise.reject(new Error('no hay conexión con la pestaña del celular'));
    const id = this.siguienteId++;
    return new Promise((resolver, rechazar) => {
      const reloj = setTimeout(() => { this.pendientes.delete(id); rechazar(new Error(`el celular no contestó a ${metodo}`)); }, espera);
      this.pendientes.set(id, { resolver, rechazar, reloj });
      this.ws.send(JSON.stringify({ id, method: metodo, params }));
    });
  }

  get conectado() {
    return this.ws !== null;
  }

  recargar() {
    return this.enviar('Page.reload', { ignoreCache: true });
  }

  // Corre una expresión en la página del celular y devuelve su valor.
  async evaluar(expresion) {
    const r = await this.enviar('Runtime.evaluate', { expression: expresion, returnByValue: true });
    return r.result ? r.result.value : undefined;
  }

  async abrir(url) {
    return this.enviar('Page.navigate', { url });
  }

  // Simula la red del celular: normal, lenta (como un 3G flojo) o sin conexión. Mientras hay una red
  // simulada no se usa la caché, así se ve cuánto tarda de verdad. Dura mientras esté la conexión:
  // al reconectar hay que volver a pedirla.
  async red(perfil) {
    const p = PERFILES_RED[perfil] || PERFILES_RED.normal;
    await this.enviar('Network.emulateNetworkConditions', p);
    await this.enviar('Network.setCacheDisabled', { cacheDisabled: perfil !== 'normal' });
  }

  async captura() {
    // optimizeForSpeed: comprime menos (sigue sin perder calidad) y tarda un 30 % menos
    const r = await this.enviar('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true }, 20000);
    return Buffer.from(r.data, 'base64');
  }

  // ---------- Espejo: la pantalla en vivo y tocarla desde la PC ----------

  // Chrome manda un cuadro y no manda el siguiente hasta que se le avisa que llegó. Se avisa enseguida:
  // así la imagen que muestra el resultado de un toque sale apenas está. El celular mismo pone el
  // límite (unos 25 por segundo en un moto g24), y sin cambios en la pantalla no manda nada.
  iniciarEspejo({ ancho = 540, alto = 1215, calidad = 80 } = {}) {
    return this.enviar('Page.startScreencast', { format: 'jpeg', quality: calidad, maxWidth: ancho, maxHeight: alto, everyNthFrame: 1 });
  }

  detenerEspejo() {
    return this.enviar('Page.stopScreencast').catch(() => {});
  }

  alCuadro({ data, metadata, sessionId }) {
    this.enviar('Page.screencastFrameAck', { sessionId }).catch(() => {});
    // el cuadro es solo la página: el alto que informa Chrome incluye su barra de arriba (offsetTop)
    this.emit('cuadro', { datos: Buffer.from(data, 'base64'), ancho: metadata.deviceWidth, alto: metadata.deviceHeight - (metadata.offsetTop || 0) });
  }

  // tipo: touchStart, touchMove o touchEnd; x e y en píxeles de la página. momento: cuándo se tocó en
  // la computadora (ms); con eso Chrome calcula bien la velocidad y, al soltar rápido, la página sigue
  // deslizándose como con el dedo.
  tocar(tipo, x, y, momento) {
    const datos = { type: tipo, touchPoints: tipo === 'touchEnd' ? [] : [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] };
    if (momento) datos.timestamp = momento / 1000;
    return this.enviar('Input.dispatchTouchEvent', datos, 3000);
  }

  rueda(x, y, deltaX, deltaY) {
    return this.enviar('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY }, 3000);
  }

  // Atrás, como el botón del celular
  atras() {
    return this.evaluar('history.back()');
  }

  // Una captura a la resolución completa del celular y con poca compresión: es la imagen "nítida" que se
  // manda cuando la pantalla se queda quieta (en un moto g24, unos 330 ms y 110 kB). Se recorta a la parte
  // visible de la página, igual que las imágenes del espejo: sin recorte, Chrome incluye 56 px de más abajo,
  // la imagen cambiaría de alto al intercambiarlas y los toques caerían corridos.
  async capturaNitida() {
    const params = { format: 'jpeg', quality: 92, optimizeForSpeed: true };
    try {
      const { cssVisualViewport: v } = await this.enviar('Page.getLayoutMetrics');
      if (v && v.clientWidth > 0 && v.clientHeight > 0) params.clip = { x: v.pageX, y: v.pageY, width: v.clientWidth, height: v.clientHeight, scale: 1 };
    } catch { /* sin medidas, la captura va sin recorte */ }
    const r = await this.enviar('Page.captureScreenshot', params, 15000);
    return Buffer.from(r.data, 'base64');
  }

  // Simula otra pantalla: la página se arma y responde con ese ancho y alto (medidas: { ancho, alto, densidad }).
  // Sin medidas, vuelve a la real. Dura lo que dura la conexión con la pestaña: al reconectar hay que volver a pedirla.
  tamano(medidas) {
    if (!medidas) return this.enviar('Emulation.clearDeviceMetricsOverride');
    return this.enviar('Emulation.setDeviceMetricsOverride', { width: medidas.ancho, height: medidas.alto, deviceScaleFactor: medidas.densidad, mobile: true });
  }

  // El tamaño de la página en el celular (sin nada simulado), para saber qué tamaños entran en su pantalla.
  async medidasPantalla() {
    const { cssVisualViewport: v } = await this.enviar('Page.getLayoutMetrics');
    return { ancho: Math.round(v.clientWidth), alto: Math.round(v.clientHeight) };
  }

  escribir(texto) {
    return this.enviar('Input.insertText', { text: texto }, 3000);
  }

  async tecla(nombre) {
    const codigo = TECLAS[nombre];
    if (!codigo) return;
    const datos = { key: nombre, code: nombre, windowsVirtualKeyCode: codigo, nativeVirtualKeyCode: codigo };
    if (nombre === 'Enter') datos.text = String.fromCharCode(13);
    await this.enviar('Input.dispatchKeyEvent', { type: nombre === 'Enter' ? 'keyDown' : 'rawKeyDown', ...datos }, 3000);
    await this.enviar('Input.dispatchKeyEvent', { type: 'keyUp', ...datos }, 3000);
  }

  cerrar() {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try { ws.close(); } catch { /* ya estaba cerrada */ }
    }
  }
}
