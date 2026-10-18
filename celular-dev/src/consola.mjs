// Convierte lo que cuenta el Chrome del celular (errores, consola, red) en avisos.
// Cada aviso es { nivel: 'error' | 'aviso' | 'log', tipo, texto, donde, dato } o null si no hay que mostrarlo:
//   tipo:  excepcion | consola | navegador | http | red | carga
//   texto: el mensaje técnico, tal como lo da Chrome
//   dato:  lo que hace falta para explicarlo en simple (la dirección del pedido, el código HTTP...)
import { t } from './idioma.mjs';

// Saca el origen (http://localhost:5500) de las direcciones: alcanza con la ruta.
export function corta(url, origen) {
  if (!url) return '';
  return origen && url.startsWith(origen) ? url.slice(origen.length) || '/' : url;
}

function lugar(url, linea, columna, origen) {
  if (!url) return '';
  // el protocolo cuenta líneas y columnas desde 0
  return `${corta(url, origen)}:${linea + 1}${columna != null ? ':' + (columna + 1) : ''}`;
}

function valor(arg) {
  if (arg.type === 'string') return arg.value;
  if (arg.value !== undefined) return JSON.stringify(arg.value);
  if (arg.preview && arg.preview.properties) {
    const mas = arg.preview.overflow ? ', …' : '';
    if (arg.subtype === 'array') return `[${arg.preview.properties.map(p => p.value).join(', ')}${mas}]`;
    return `{${arg.preview.properties.map(p => `${p.name}: ${p.value}`).join(', ')}${mas}}`;
  }
  return arg.description || arg.type;
}

export class Traductor {
  constructor({ origen, todo = false }) {
    this.origen = origen;          // http://localhost:5500
    this.todo = todo;              // mostrar también console.log / info
    this.pedidos = new Map();      // requestId -> url, para nombrar los pedidos que fallan
  }

  traducir(metodo, p) {
    switch (metodo) {
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails;
        const texto = (d.exception && d.exception.description ? d.exception.description.split('\n')[0] : d.text) || 'Error';
        const marco = d.stackTrace && d.stackTrace.callFrames[0];
        const donde = marco ? lugar(marco.url, marco.lineNumber, marco.columnNumber, this.origen) : lugar(d.url, d.lineNumber, d.columnNumber, this.origen);
        return { nivel: 'error', tipo: 'excepcion', texto, donde };
      }
      case 'Runtime.consoleAPICalled': {
        const nivel = p.type === 'error' || p.type === 'assert' ? 'error' : p.type === 'warning' ? 'aviso' : 'log';
        if (nivel === 'log' && !this.todo) return null;
        const marco = p.stackTrace && p.stackTrace.callFrames[0];
        const mensaje = p.args.map(valor).join(' ');
        return {
          nivel, tipo: 'consola', texto: `console.${p.type === 'warning' ? 'warn' : p.type}: ${mensaje}`,
          donde: marco ? lugar(marco.url, marco.lineNumber, marco.columnNumber, this.origen) : '', dato: mensaje
        };
      }
      case 'Log.entryAdded': {
        const e = p.entry;
        // los fallos de red ya los cuenta Network con más detalle
        if (e.source === 'network') return null;
        if (e.level !== 'error' && e.level !== 'warning' && !this.todo) return null;
        const nivel = e.level === 'error' ? 'error' : e.level === 'warning' ? 'aviso' : 'log';
        return { nivel, tipo: 'navegador', texto: e.text, donde: e.url ? lugar(e.url, e.lineNumber || 0, null, this.origen) : '', dato: e.source };
      }
      case 'Network.requestWillBeSent':
        this.pedidos.set(p.requestId, p.request.url);
        if (this.pedidos.size > 500) this.pedidos.delete(this.pedidos.keys().next().value);
        return null;
      case 'Network.responseReceived': {
        const r = p.response;
        if (r.status < 400) return null;
        // el navegador pide el ícono solo, en cada carga: que falte no es un error del sitio
        if (r.status === 404 && /\/favicon\.ico(\?|$)/.test(r.url)) return null;
        return { nivel: r.status >= 500 ? 'error' : 'aviso', tipo: 'http', texto: t('consola.pedidoConError', { estado: r.status, url: corta(r.url, this.origen) }), donde: '', dato: { url: corta(r.url, this.origen), estado: r.status } };
      }
      case 'Network.loadingFailed': {
        if (p.canceled) return null;
        const url = this.pedidos.get(p.requestId) || '';
        const motivo = p.blockedReason ? t('consola.bloqueado', { motivo: p.blockedReason }) : p.errorText;
        return { nivel: 'error', tipo: 'red', texto: t('consola.pedidoFallido', { url: corta(url, this.origen), motivo }), donde: '', dato: { url: corta(url, this.origen), motivo, bloqueado: !!p.blockedReason } };
      }
      case 'Page.loadEventFired':
        return { nivel: 'log', tipo: 'carga', texto: t('consola.cargada'), donde: '' };
      default:
        return null;
    }
  }
}
