// Reconocer el proyecto de la carpeta (Vite, Next, Astro…) y, si la persona lo pide, prender su servidor de
// desarrollo y apagarlo bien al terminar. Nada de esto corre solo: lo pide el panel o la opción --iniciar.
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { puertoAbierto } from './servidor.mjs';

const esWindows = process.platform === 'win32';

// [dependencia, nombre, puerto en el que suele quedar]. El primero que coincide gana (Next y Nuxt traen Vite o
// Webpack por dentro, Astro y SvelteKit traen Vite).
const MARCOS = [
  ['next', 'next', 3000], ['nuxt', 'nuxt', 3000], ['astro', 'astro', 4321], ['@sveltejs/kit', 'sveltekit', 5173],
  ['vite', 'vite', 5173], ['react-scripts', 'cra', 3000], ['@angular/cli', 'angular', 4200]
];
// los scripts que se prueban, en este orden: son los que en la práctica prenden el servidor
const SCRIPTS = ['dev', 'start', 'serve'];

function gestorDe(carpeta) {
  if (existsSync(join(carpeta, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(carpeta, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(carpeta, 'bun.lockb')) || existsSync(join(carpeta, 'bun.lock'))) return 'bun';
  return 'npm';
}

// Devuelve { carpeta, nombre, marco, script, gestor, comando, texto, puertoProbable, faltaInstalar } o null si la
// carpeta no es un proyecto con un script para prender el servidor.
export function detectarProyecto(carpeta) {
  let paquete;
  try { paquete = JSON.parse(readFileSync(join(carpeta, 'package.json'), 'utf8')); } catch { return null; }
  if (!paquete || typeof paquete !== 'object') return null;
  const scripts = paquete.scripts && typeof paquete.scripts === 'object' ? paquete.scripts : {};
  const script = SCRIPTS.find(s => Object.hasOwn(scripts, s) && typeof scripts[s] === 'string');
  if (!script) return null;
  const dependencias = { ...paquete.dependencies, ...paquete.devDependencies };
  const encontrado = MARCOS.find(([d]) => Object.hasOwn(dependencias, d));
  const gestor = gestorDe(carpeta);
  // el nombre del script sale de la lista de arriba: no viene de afuera, así que es seguro pasarlo al comando
  const comando = gestor === 'yarn' ? ['yarn', script] : [gestor, 'run', script];
  return {
    carpeta,
    nombre: typeof paquete.name === 'string' && paquete.name ? paquete.name : basename(carpeta),
    marco: encontrado ? encontrado[1] : 'generico',
    script, gestor, comando, texto: comando.join(' '),
    puertoProbable: encontrado ? encontrado[2] : 0,
    // con dependencias declaradas pero sin node_modules, el servidor no va a arrancar: se avisa antes
    faltaInstalar: Object.keys(dependencias).length > 0 && !existsSync(join(carpeta, 'node_modules'))
  };
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

// El puerto que dice una línea del servidor ("Local: http://localhost:5173/"), o null.
export function puertoDeLinea(linea) {
  const m = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d{2,5})/.exec(String(linea).replace(ANSI, ''));
  return m ? +m[1] : null;
}

// Prende el servidor del proyecto y espera a que conteste. Devuelve { puerto, detener() }.
//   alLinea(texto): cada renglón que imprime el servidor · alCerrar(codigo): si se cierra solo después de arrancar
export function iniciarProyecto(proyecto, { alLinea = () => {}, alCerrar = () => {}, espera = 60000, sondear = puertoAbierto, senal = null } = {}) {
  return new Promise((resolver, rechazar) => {
    const [programa, ...args] = proyecto.comando;
    // BROWSER=none: que el servidor no abra su propia pestaña (CRA y otros lo respetan). En Windows, npm es un .cmd: va con shell.
    const proceso = spawn(programa, args, {
      cwd: proyecto.carpeta, shell: esWindows, windowsHide: true, detached: !esWindows,
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1' }
    });
    let terminado = false;      // el proceso ya salió
    let listo = false;          // el servidor ya contestó
    let puerto = null;
    const ultimas = [];
    const salida = new Promise(r => proceso.once('exit', c => { terminado = true; r(c); }));
    const matarAlSalir = () => matarArbol(proceso);
    process.once('exit', matarAlSalir);

    let detenido = false;       // se apagó a propósito (no es un cierre inesperado)
    let motivo = null;          // por qué falló el arranque, si falló
    const detener = async () => {
      detenido = true;
      process.off('exit', matarAlSalir);
      if (terminado) return;
      matarArbol(proceso);
      await Promise.race([salida, new Promise(r => setTimeout(r, 4000))]);
      if (!terminado) matarArbol(proceso, true);
    };
    const fallar = async error => { motivo = error; clearTimeout(reloj); await detener(); rechazar(error); };
    const falla = (tipo, mensaje, codigo = null) => Object.assign(new Error(mensaje), { tipo, codigo, lineas: ultimas.slice(-8) });
    const reloj = setTimeout(() => fallar(falla('timeout', 'el servidor no contestó a tiempo')), espera);

    // se puede cancelar mientras arranca (AbortController): corta todo y avisa
    if (senal) {
      if (senal.aborted) fallar(falla('cancelado', 'se canceló el arranque del servidor'));
      else senal.addEventListener('abort', () => { if (!listo) fallar(falla('cancelado', 'se canceló el arranque del servidor')); }, { once: true });
    }

    const leer = flujo => {
      let resto = '';
      flujo.setEncoding('utf8');
      flujo.on('data', parte => {
        const renglones = (resto + parte).split(/\r?\n/);
        resto = renglones.pop();
        for (const r of renglones) {
          const limpio = r.replace(ANSI, '').trimEnd();
          if (!limpio) continue;
          ultimas.push(limpio); if (ultimas.length > 30) ultimas.shift();
          alLinea(limpio);
          const p = puertoDeLinea(limpio);
          if (p && !puerto) { puerto = p; esperarPuerto(); }
        }
      });
    };
    leer(proceso.stdout); leer(proceso.stderr);

    // cuando el servidor dice en qué puerto quedó, se espera a que de verdad conteste
    async function esperarPuerto() {
      while (!terminado && !listo) {
        if (await sondear(puerto, 400)) { listo = true; clearTimeout(reloj); return resolver({ puerto, detener }); }
        await new Promise(r => setTimeout(r, 200));
      }
    }
    proceso.once('error', error => fallar(error));
    proceso.once('exit', codigo => {
      process.off('exit', matarAlSalir);
      if (listo) { if (!detenido) alCerrar(codigo); return; }
      clearTimeout(reloj);
      rechazar(motivo || (detenido ? falla('cancelado', 'se canceló el arranque del servidor') : falla('salio', `el servidor se cerró antes de arrancar (código ${codigo})`, codigo)));
    });
  });
}

// Cierra el proceso y todo lo que prendió (npm lanza varios). Es sincrónico: sirve también cuando el programa ya se va.
function matarArbol(proceso, fuerte = false) {
  if (!proceso.pid || proceso.exitCode !== null) return;
  try {
    if (esWindows) spawnSync('taskkill', ['/pid', String(proceso.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    else process.kill(-proceso.pid, fuerte ? 'SIGKILL' : 'SIGTERM');   // el grupo entero (se lanzó con detached)
  } catch { /* ya no estaba */ }
}
