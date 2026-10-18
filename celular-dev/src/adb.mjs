// Todo lo que habla con ADB: encontrarlo, prender su servicio, correr comandos, armar los túneles
// (reverse y forward) y vigilar si el celular se conecta o se desconecta.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { EventEmitter } from 'node:events';
import { adbPropio } from './instalar-adb.mjs';
import { t } from './idioma.mjs';
import { puertoAbierto } from './servidor.mjs';

const esWindows = process.platform === 'win32';

export function buscarAdb() {
  const nombre = esWindows ? 'adb.exe' : 'adb';
  // primero el que ya esté instalado (si hay dos versiones distintas de adb, se pelean y cada una
  // reinicia el servicio de la otra); el que descargó celular-dev, solo si no hay otro
  const candidatos = (process.env.PATH || '').split(delimiter).filter(Boolean).map(dir => join(dir, nombre));
  for (const sdk of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (sdk) candidatos.push(join(sdk, 'platform-tools', nombre));
  }
  if (esWindows && process.env.LOCALAPPDATA) {
    candidatos.push(
      join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages', 'Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe', 'platform-tools', nombre),
      join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', nombre)
    );
  }
  if (process.env.HOME) {
    candidatos.push(join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', nombre), join(process.env.HOME, 'Android', 'Sdk', 'platform-tools', nombre));
  }
  candidatos.push(adbPropio());
  return candidatos.find(c => existsSync(c)) || null;
}

export class Adb extends EventEmitter {
  constructor(ruta) {
    super();
    this.ruta = ruta;
    this.rastreo = null;
    this.estado = 'desconocido';   // device, unauthorized, offline, sin-celular, sin-permiso (Linux)
    this.cerrando = false;
    this.loIniciamos = undefined;   // el servicio de adb lo prendimos nosotros (y lo apagamos al salir), o ya estaba
  }

  // Prende el servicio de adb si no está prendido. Se lanza sin conectarle la salida: el servicio
  // queda abierto en segundo plano y, si heredara la salida, nos quedaríamos esperando a que se cierre.
  async prender() {
    if (this.loIniciamos === undefined) {
      this.loIniciamos = !(await puertoAbierto(5037));
      // aunque el programa se cierre de golpe, el servicio que prendimos no queda abierto en el Administrador de tareas
      if (this.loIniciamos) process.once('exit', () => this.apagarServicio());
    }
    return new Promise(resolver => {
      const p = spawn(this.ruta, ['start-server'], { stdio: 'ignore', windowsHide: true });
      const reloj = setTimeout(() => { p.kill(); resolver(false); }, 15000);
      p.once('exit', codigo => { clearTimeout(reloj); resolver(codigo === 0); });
      p.once('error', () => { clearTimeout(reloj); resolver(false); });
    });
  }

  // Corre un comando de adb y devuelve { codigo, salida }. Se resuelve cuando el proceso termina, sin
  // esperar a que se cierre su salida (por la misma razón que en prender).
  ejecutar(args, espera = 15000) {
    return new Promise(resolver => {
      let salida = '';
      const p = spawn(this.ruta, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      p.stdout.on('data', d => { salida += d; });
      p.stderr.on('data', d => { salida += d; });
      const terminar = codigo => {
        clearTimeout(reloj);
        // lo último que escribió puede llegar un instante después de que terminó
        setTimeout(() => { p.stdout.destroy(); p.stderr.destroy(); resolver({ codigo, salida: salida.trim() }); }, 50);
      };
      const reloj = setTimeout(() => { p.kill(); terminar(-1); }, espera);
      p.once('exit', terminar);
      p.once('error', error => { clearTimeout(reloj); resolver({ codigo: -1, salida: error.message }); });
    });
  }

  shell(comando) {
    return this.ejecutar(['shell', comando]);
  }

  // ---------- Túneles ----------

  // Hace que el localhost:puerto del celular llegue al de la PC. Devuelve si ya existía antes, para
  // no borrarlo al salir si era de otro programa.
  async reverse(puerto) {
    const lista = await this.ejecutar(['reverse', '--list']);
    const yaEstaba = new RegExp(`tcp:${puerto}\\s+tcp:${puerto}`).test(lista.salida);
    const r = await this.ejecutar(['reverse', `tcp:${puerto}`, `tcp:${puerto}`]);
    if (r.codigo !== 0) throw new Error(t('adb.sinReverse', { puerto, detalle: r.salida }));
    return yaEstaba;
  }

  async quitarReverse(puerto) {
    await this.ejecutar(['reverse', '--remove', `tcp:${puerto}`]);
  }

  // Abre un puerto libre de la PC hacia el Chrome del celular (adb lo elige con tcp:0 y dice cuál es).
  async forwardChrome() {
    const r = await this.ejecutar(['forward', 'tcp:0', 'localabstract:chrome_devtools_remote']);
    const puerto = parseInt(r.salida, 10);
    if (r.codigo !== 0 || !puerto) throw new Error(t('adb.sinForward', { detalle: r.salida }));
    return puerto;
  }

  async quitarForward(puerto) {
    await this.ejecutar(['forward', '--remove', `tcp:${puerto}`]);
  }

  // ---------- Vigilar el celular ----------
  // "adb track-devices" queda abierto y avisa solo cada vez que el celular se conecta, se desconecta o
  // cambia de estado. Cada aviso es un largo en 4 cifras hexadecimales y después el texto, un renglón
  // "SERIE<TAB>estado" por celular; sin celulares llega "0000" (sin salto de línea: se lee por largo).
  // Eventos: 'estado' (nuevo estado) y 'reinicio' (el servicio de adb se cayó: se perdieron los túneles).

  async vigilar() {
    const esReinicio = this.rastreo !== null;
    await this.prender();
    if (this.cerrando) return;
    const p = spawn(this.ruta, ['track-devices'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    this.rastreo = p;
    let recibido = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', datos => {
      const { estados, resto, invalido } = leerAvisos(recibido + datos);
      recibido = resto;
      for (const e of estados) this.cambiar(e);
      // algo inesperado mezclado: se descartó, y se pregunta el estado una vez a la antigua
      if (invalido) this.consultarUnaVez();
    });
    p.once('exit', () => {
      if (this.cerrando || this.rastreo !== p) return;
      // se cerró el servicio de adb (lo cerró otro programa, o Android Studio): se vuelve a abrir
      setTimeout(() => this.vigilar(), 1000);
    });
    if (esReinicio) this.emit('reinicio');
  }

  async consultarUnaVez() {
    const r = await this.ejecutar(['devices']);
    this.cambiar(estadoDe(r.salida.split('\n').slice(1).join('\n')));
  }

  cambiar(estado) {
    if (estado === this.estado) return;
    this.estado = estado;
    this.emit('estado', estado);
  }

  // Espera hasta que el celular esté listo. alCambiar recibe cada estado intermedio para explicarlo.
  esperarListo(alCambiar) {
    if (this.estado === 'device') return Promise.resolve();
    return new Promise(resolver => {
      const escuchar = estado => {
        if (estado === 'device') { this.off('estado', escuchar); resolver(); } else alCambiar(estado);
      };
      this.on('estado', escuchar);
      if (this.estado !== 'desconocido') alCambiar(this.estado);
    });
  }

  cerrar() {
    this.cerrando = true;
    if (this.rastreo) this.rastreo.kill();
    this.apagarServicio();
  }

  // Si el servicio de adb lo prendió celular-dev, se apaga al salir (si ya estaba prendido, de otro programa o de
  // antes, se deja: lo puede estar usando otro). Es sincrónico: sirve también cuando el programa ya se está yendo.
  apagarServicio() {
    if (!this.loIniciamos) return;
    this.loIniciamos = false;
    try { spawnSync(this.ruta, ['kill-server'], { stdio: 'ignore', windowsHide: true, timeout: 4000 }); } catch { /* ya no está */ }
  }
}

// Estado del primer celular de una lista "SERIE<TAB>estado" (una por renglón); sin renglones, ninguno.
export function estadoDe(texto) {
  const primero = texto.split('\n').map(l => l.trim()).find(Boolean);
  if (!primero) return 'sin-celular';
  // en Linux, sin permiso para el USB: "SERIE<TAB>no permissions (user in plugdev group; ...)"
  if (/\bno permissions\b/.test(primero)) return 'sin-permiso';
  return (primero.split(/\s+/)[1] || 'desconocido').trim();
}

// Separa los avisos completos de track-devices. Devuelve { estados, resto, invalido }:
// resto es lo que todavía no llegó entero; invalido, si apareció algo que no tiene el formato (se descarta).
export function leerAvisos(texto) {
  const estados = [];
  while (texto.length >= 4) {
    const prefijo = texto.slice(0, 4);
    if (!/^[0-9a-f]{4}$/i.test(prefijo)) return { estados, resto: '', invalido: true };
    const largo = parseInt(prefijo, 16);
    if (texto.length < 4 + largo) break;
    estados.push(estadoDe(texto.slice(4, 4 + largo)));
    texto = texto.slice(4 + largo);
  }
  return { estados, resto: texto, invalido: false };
}
