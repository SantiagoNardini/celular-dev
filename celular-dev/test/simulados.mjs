// Un celular de mentira para las pruebas del flujo completo: un ADB y un Chrome simulados que se
// comportan como los de verdad (los mismos métodos y eventos), y anotan todo lo que se les pide.
// Con ellos se prueba el programa entero sin celular, sin cable y sin tocar el ADB de la computadora.
import { EventEmitter } from 'node:events';
import * as pantalla from '../src/pantalla.mjs';

export class AdbSimulado extends EventEmitter {
  constructor({ modelo = 'moto g24 power', tieneChrome = true } = {}) {
    super();
    this.estado = 'desconocido';
    this.modelo = modelo;
    this.tieneChrome = tieneChrome;
    this.reverses = new Set();
    this.forwards = new Set();
    this.siguientePuerto = 41000;
    this.abiertas = [];          // las direcciones que se abrieron en el Chrome del celular
    this.chrome = null;          // el Chrome simulado, para abrirle las pestañas
    this.cerrado = false;
  }

  async prender() { return true; }

  async shell(comando) {
    (this.comandos ||= []).push(comando);
    if (comando.startsWith('settings get global stay_on_while_plugged_in')) return { codigo: 0, salida: this.stayOn ?? '0' };
    if (comando.startsWith('settings put global stay_on_while_plugged_in')) { this.stayOn = comando.split(' ').pop(); return { codigo: 0, salida: '' }; }
    if (comando.startsWith('getprop ro.product.model')) return { codigo: 0, salida: this.modelo };
    if (comando.startsWith('getprop ro.build.version.release')) return { codigo: 0, salida: '14' };
    if (comando.startsWith('pm path com.android.chrome')) return { codigo: 0, salida: this.tieneChrome ? 'package:/data/app/chrome/base.apk' : '' };
    if (comando.startsWith('dumpsys package com.android.chrome')) return { codigo: 0, salida: '    versionName=141.0.7390.122' };
    if (comando.startsWith('dumpsys power')) return { codigo: 0, salida: this.pantalla === 'apagada' ? 'mWakefulness=Asleep' : 'mWakefulness=Awake' };
    const abrir = /am start .* -d '([^']+)' com\.android\.chrome/.exec(comando);
    if (abrir) {
      this.abiertas.push(abrir[1]);
      if (this.chrome) this.chrome.abrirPestana(abrir[1]);
      return { codigo: 0, salida: 'Starting: Intent { act=android.intent.action.VIEW }' };
    }
    return { codigo: 0, salida: '' };
  }

  async reverse(puerto) {
    const yaEstaba = this.reverses.has(puerto);
    this.reverses.add(puerto);
    return yaEstaba;
  }

  async quitarReverse(puerto) { this.reverses.delete(puerto); }

  async forwardChrome() {
    const puerto = this.siguientePuerto++;
    this.forwards.add(puerto);
    return puerto;
  }

  async quitarForward(puerto) { this.forwards.delete(puerto); }

  vigilar() {}
  async consultarUnaVez() { this.consultas = (this.consultas || 0) + 1; }

  // lo que en el de verdad avisa "adb track-devices": device, unauthorized, sin-celular...
  cambiar(estado) {
    if (estado === this.estado) return;
    this.estado = estado;
    this.emit('estado', estado);
  }

  esperarListo(alCambiar) {
    if (this.estado === 'device') return Promise.resolve();
    return new Promise(resolver => {
      const escuchar = estado => {
        if (estado === 'device') { this.off('estado', escuchar); resolver(); } else alCambiar(estado);
      };
      this.on('estado', escuchar);
    });
  }

  cerrar() { this.cerrado = true; }
}

// lo que devuelve revision-pagina.js en una página sin problemas
export const REVISION_BIEN = {
  pantalla: { ancho: 411, alto: 773, densidad: 1.75 },
  desborde: { px: 0, ejemplos: [] },
  chicos: { cantidad: 0, de: 4, ejemplos: [] },
  contraste: { cantidad: 0, ejemplos: [] }, sinAlt: { cantidad: 0, ejemplos: [] }, textoChico: { cantidad: 0, ejemplos: [] },
  sinNombre: { cantidad: 0, ejemplos: [] }, sinEtiqueta: { cantidad: 0, ejemplos: [] },
  tiempos: { primeraPintura: 600, cargaCompleta: 900, pesoKB: 120, pedidos: 5 }
};

export class ChromeSimulado extends EventEmitter {
  constructor(puerto) {
    super();
    this.puerto = puerto;
    this.pestanas = [];
    this.pestana = null;
    this.recargas = 0;
    this.redes = [];
    this.espejo = false;
    this.toques = [];
    this.escrito = [];
    this.revision = REVISION_BIEN;
  }

  abrirPestana(url) { this.pestanas.push({ id: String(this.pestanas.length + 1), url }); }
  async buscar(prefijo) { return this.pestanas.find(p => p.url.startsWith(prefijo)) || null; }
  async conectar(pestana) { this.pestana = pestana; }
  get conectado() { return this.pestana !== null; }

  async recargar() {
    if (!this.conectado) throw new Error('no hay conexión con la pestaña del celular');
    this.recargas++;
    // como el de verdad: al terminar de cargar avisa (con sinCarga = true, es la pantalla apagada o la pestaña trabada)
    if (!this.sinCarga) setTimeout(() => this.emit('evento', 'Page.loadEventFired', {}), 5);
  }

  async evaluar(expresion) {
    if (expresion.includes('innerWidth')) return '411 × 773 px, densidad 1.75';
    if (expresion.includes('history.back')) { this.atrases = (this.atrases || 0) + 1; return undefined; }
    return this.revision;
  }

  async red(perfil) { this.redes.push(perfil); }
  async captura() { return Buffer.from('89504e470d0a1a0a', 'hex'); }
  async capturaNitida() {
    this.nitidas = (this.nitidas || 0) + 1;
    if (this.demoraNitida) await new Promise(r => setTimeout(r, this.demoraNitida));
    return Buffer.from([0xff, 0xd8, 0xaa, 0xff, 0xd9]);
  }
  async tamano(medidas) { (this.tamanos ||= []).push(medidas); }
  async medidasPantalla() { return { ancho: 411, alto: 773 }; }
  async iniciarEspejo(opciones) { this.espejo = true; this.pedidosEspejo = [...(this.pedidosEspejo || []), opciones]; }
  detenerEspejo() { this.espejo = false; return Promise.resolve(); }
  async tocar(tipo, x, y, momento) { this.toques.push([tipo, x, y]); this.momentos = [...(this.momentos || []), momento]; }
  async atras() { this.atrases = (this.atrases || 0) + 1; }
  async rueda(x, y, dx, dy) { this.toques.push(['rueda', x, y, dx, dy]); }
  async escribir(texto) { this.escrito.push(texto); }
  async tecla(nombre) { this.escrito.push(`[${nombre}]`); }

  // como el de verdad: cerrar a propósito no avisa "cerrada"
  cerrar() { this.pestana = null; }

  // ---------- lo que hacen las pruebas ----------
  perderPestana() { this.pestana = null; this.emit('cerrada'); }
  evento(metodo, params) { this.emit('evento', metodo, params); }
  cuadro(datos, ancho = 411, alto = 773) { this.emit('cuadro', { datos, ancho, alto }); }
}

// La terminal callada: las pruebas no llenan la pantalla (hora y fecha siguen andando).
export const uiCallada = {
  ...pantalla,
  iniciarRegistro() {}, anotar() {}, ok() {}, info() {}, aviso() {}, falla() {}, delCelular() {},
  paso() {}, cartel() {}, renglon() {}, titulo() {}
};

// Espera a que algo pase, hasta un tope.
export async function hasta(condicion, { ms = 5000, que = 'la condición' } = {}) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await condicion()) return;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error(`no se cumplió ${que} en ${ms} ms`);
}
