// Los pedidos de red de la página en el celular: qué se pidió, cuánto pesó y cuánto tardó. Se reinicia en cada
// carga de la página. Sirve para ver lo que más pesa y lo que falla o tarda.
const MAXIMO = 300;

export class RegistroPedidos {
  constructor() {
    this.pedidos = new Map();   // requestId -> pedido
    this.principal = undefined; // el id del marco principal de la página, cuando se sabe
  }

  marcoPrincipal(id) {
    this.principal = id;
  }

  reiniciar() {
    this.pedidos.clear();
  }

  evento(metodo, p) {
    switch (metodo) {
      case 'Network.requestWillBeSent': {
        // el documento de la página principal: empieza una carga nueva, lo anterior ya no vale
        if (p.type === 'Document' && p.requestId === p.loaderId && (this.principal === undefined || p.frameId === this.principal)) this.pedidos.clear();
        // una redirección reutiliza el id: es otro pedido, el anterior ya terminó
        this.pedidos.set(p.requestId, { id: p.requestId, url: p.request.url, metodo: p.request.method, tipo: p.type || 'Other', inicio: p.timestamp, estado: 0, mime: '', tamano: null, tiempo: null, fallo: '', cache: false });
        if (this.pedidos.size > MAXIMO) this.pedidos.delete(this.pedidos.keys().next().value);
        return true;
      }
      case 'Network.responseReceived': {
        const x = this.pedidos.get(p.requestId);
        if (!x) return false;
        x.estado = p.response.status;
        x.mime = p.response.mimeType || '';
        x.cache = !!(p.response.fromDiskCache || p.response.fromPrefetchCache || p.response.fromServiceWorker);
        return true;
      }
      case 'Network.loadingFinished': {
        const x = this.pedidos.get(p.requestId);
        if (!x) return false;
        x.tamano = p.encodedDataLength;
        x.tiempo = Math.round((p.timestamp - x.inicio) * 1000);
        return true;
      }
      case 'Network.loadingFailed': {
        const x = this.pedidos.get(p.requestId);
        if (!x) return false;
        x.fallo = p.canceled ? 'cancelado' : (p.blockedReason || p.errorText || 'falló');
        x.tiempo = Math.round((p.timestamp - x.inicio) * 1000);
        return true;
      }
      default:
        return false;
    }
  }

  // Lo que ve el panel: una fila por pedido (el último arriba) y los totales.
  resumen(origen) {
    const filas = [...this.pedidos.values()].reverse().map(x => ({
      id: x.id, url: x.url, ruta: rutaCorta(x.url, origen), metodo: x.metodo, tipo: x.tipo, estado: x.estado,
      tamano: x.tamano, tiempo: x.tiempo, fallo: x.fallo, cache: x.cache
    }));
    return { total: filas.length, bytes: filas.reduce((s, f) => s + (f.tamano || 0), 0), filas };
  }
}

// /img/logo.png?v=3 para el mismo sitio; dominio.com/ruta para los de afuera
export function rutaCorta(url, origen) {
  try {
    const u = new URL(url);
    if (u.protocol === 'data:') return 'data:…';
    const ruta = (u.origin === origen ? '' : u.host) + u.pathname + u.search;
    return ruta.length > 70 ? `${ruta.slice(0, 67)}…` : ruta;
  } catch {
    return String(url).slice(0, 70);
  }
}
