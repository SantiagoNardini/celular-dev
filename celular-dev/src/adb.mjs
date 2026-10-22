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
    this.serie = null;             // el celular elegido (si hay varios conectados); null: el único que haya
    this.lista = [];               // los celulares que ve adb: { serie, estado, nombre }
    this.estado = 'desconocido';   // device, varios (hay más de uno listo: hay que elegir), unauthorized, offline, sin-celular, sin-permiso (Linux)
    this.cerrando = false;
    this.loIniciamos = undefined;   // el servicio de adb lo prendimos nosotros (y lo apagamos al salir), o ya estaba
  }

  // Prende el servicio de adb si no está prendido. Se lanza sin conectarle la salida: el servicio
  // queda abierto en segundo plano y, si heredara la salida, nos quedaríamos esperando a que se cierre.
  async prender() {
    if (this.loIniciamos === undefined) {
      this.loIniciamos = !(await puertoAbierto(+process.env.ANDROID_ADB_SERVER_PORT || 5037));
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
    // con varios celulares conectados, adb pide decir cuál: se le dice el elegido
    if (this.serie && !['start-server', 'kill-server', 'devices', 'track-devices', 'version'].includes(args[0])) args = ['-s', this.serie, ...args];
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

  // Hace que el localhost:puerto del celular llegue al de la PC (o a otro puerto de la PC: el del puente de IPv6).
  // Devuelve si ya existía antes, para no borrarlo al salir si era de otro programa.
  async reverse(puerto, destino = puerto) {
    const lista = await this.ejecutar(['reverse', '--list']);
    const yaEstaba = new RegExp(`tcp:${puerto}\\s+tcp:${destino}(\\s|$)`).test(lista.salida);
    const r = await this.ejecutar(['reverse', `tcp:${puerto}`, `tcp:${destino}`]);
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
    const p = spawn(this.ruta, ['track-devices', '-l'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    this.rastreo = p;
    let recibido = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', datos => {
      const { textos, resto, invalido } = separarAvisos(recibido + datos);
      recibido = resto;
      for (const texto of textos) this.recibir(texto);
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
    const r = await this.ejecutar(['devices', '-l']);
    this.recibir(r.salida.split('\n').slice(1).join('\n'));
  }

  // Lo que dice adb de los celulares: se guarda la lista, se decide cuál se usa y se avisa el estado.
  recibir(texto) {
    const lista = dispositivosDe(texto);
    if (JSON.stringify(lista) !== JSON.stringify(this.lista)) { this.lista = lista; this.emit('lista', lista); }
    this.cambiar(estadoDe(texto, this.serie));
    // el celular que anda queda como el elegido: si después se enchufa otro, no se cambia solo
    const usado = serieElegida(lista, this.serie);
    if (usado && this.estado === 'device') this.serie = usado;
  }

  // La persona elige cuál usar entre varios.
  elegir(serie) {
    if (!this.lista.some(d => d.serie === serie)) return false;
    this.serie = serie;
    this.cambiar(estadoDe(this.lista.map(d => `${d.serie}\t${d.estado}`).join('\n'), serie));
    return true;
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

// Los celulares de una lista "SERIE<TAB>estado [detalles]" (una por renglón). Con -l, el detalle trae el modelo.
export function dispositivosDe(texto) {
  return texto.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [serie, ...resto] = l.split(/\s+/);
    const modelo = (/\bmodel:(\S+)/.exec(resto.join(' ')) || [])[1];
    const estado = /\bno permissions\b/.test(l) ? 'sin-permiso' : (resto[0] || 'desconocido');
    return { serie, estado, nombre: modelo ? modelo.replace(/_/g, ' ') : serie };
  });
}

// El celular que se usa: el elegido si está, o el único que está listo; null si hay que elegir (o no hay).
export function serieElegida(lista, serie = null) {
  if (serie && lista.some(d => d.serie === serie)) return serie;
  const listos = lista.filter(d => d.estado === 'device');
  if (listos.length === 1) return listos[0].serie;
  return lista.length === 1 ? lista[0].serie : null;
}

// El estado del celular que se usa. Con varios listos y ninguno elegido, 'varios': hay que elegir.
export function estadoDe(texto, serie = null) {
  const lista = dispositivosDe(texto);
  if (!lista.length) return 'sin-celular';
  const usado = serieElegida(lista, serie);
  if (usado) return lista.find(d => d.serie === usado).estado;
  if (lista.filter(d => d.estado === 'device').length > 1) return 'varios';
  return lista[0].estado;
}

// Separa los avisos completos de track-devices. Devuelve { estados, resto, invalido }:
// resto es lo que todavía no llegó entero; invalido, si apareció algo que no tiene el formato (se descarta).
export function separarAvisos(texto) {
  const textos = [];
  while (texto.length >= 4) {
    const prefijo = texto.slice(0, 4);
    if (!/^[0-9a-f]{4}$/i.test(prefijo)) return { textos, resto: '', invalido: true };
    const largo = parseInt(prefijo, 16);
    if (texto.length < 4 + largo) break;
    textos.push(texto.slice(4, 4 + largo));
    texto = texto.slice(4 + largo);
  }
  return { textos, resto: texto, invalido: false };
}

export function leerAvisos(texto) {
  const { textos, resto, invalido } = separarAvisos(texto);
  return { estados: textos.map(s => estadoDe(s)), resto, invalido };
}
