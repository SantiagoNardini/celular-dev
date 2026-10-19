// Prender el servidor del proyecto por la persona, si lo pide: desde el panel (con confirmación, y la opción de
// recordarlo o de no preguntar más) o con --iniciar en la terminal. Nunca arranca nada sin que se haya pedido.
import { t } from '../idioma.mjs';
import { preferencia, guardarPreferencia } from '../lugares.mjs';
import { cambio, contar, acortar } from './estado.mjs';
import { sitioDeServidor } from './sitio.mjs';

const clave = ruta => String(ruta).toLowerCase();
const decisiones = () => { const p = preferencia('proyectos'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; };

// Lo que la persona decidió para este proyecto: { decision: 'siempre' | 'no', comando } o null.
export const decisionDe = proyecto => decisiones()[clave(proyecto.carpeta)] || null;

export function guardarDecision(proyecto, decision) {
  const todas = decisiones();
  if (decision) todas[clave(proyecto.carpeta)] = { decision, comando: proyecto.texto };
  else delete todas[clave(proyecto.carpeta)];
  guardarPreferencia('proyectos', todas);
}

// ¿Se ofrece prender el servidor? Solo si la carpeta es un proyecto, todavía no hay un servidor suyo prendido, y la
// persona no dijo «no» para ese proyecto ni «ahora no» en esta vez. Devuelve lo que muestra el panel, o null.
export function sugerencia(app, servidores) {
  const { estado, interno } = app;
  if (!app.esProyecto || interno.proyectoOculto || estado.arranque || app.servidorPropio) return null;
  const p = app.deps.detectarProyecto(app.carpetaProyecto);
  if (!p) return null;
  const d = decisionDe(p);
  if (d && d.decision === 'no') return null;
  if (p.puertoProbable && servidores.some(s => s.puerto === p.puertoProbable)) return null;   // ya lo tiene prendido
  return { nombre: p.nombre, marco: p.marco, texto: p.texto, faltaInstalar: p.faltaInstalar, recordado: !!(d && d.decision === 'siempre') };
}

// Lo que imprime el servidor se guarda (últimas líneas) y se publica como mucho cuatro veces por segundo.
function agregarLinea(app, linea) {
  const { estado, relojes } = app;
  app.lineasServidor.push(acortar(linea, 300));
  if (app.lineasServidor.length > 80) app.lineasServidor.shift();
  if (relojes.salidaServidor) return;
  relojes.salidaServidor = setTimeout(() => {
    relojes.salidaServidor = null;
    if (app.interno.cerrando) return;
    if (estado.arranque) estado.arranque.lineas = app.lineasServidor.slice(-8);
    if (estado.servidorPropio) estado.servidorPropio.lineas = [...app.lineasServidor];
    cambio(app);
  }, 250);
}

function explicarFalla(error, proyecto) {
  if (error.tipo === 'timeout') return t('proyecto.noArranco', { texto: proyecto.texto });
  if (error.tipo === 'salio') return proyecto.faltaInstalar ? t('proyecto.faltaInstalar', { gestor: proyecto.gestor }) : t('proyecto.seCerro', { codigo: error.codigo });
  if (error.code === 'ENOENT') return t('proyecto.noEstaGestor', { gestor: proyecto.gestor });
  return error.message;
}

// Prende el servidor y espera a que conteste. Devuelve { puerto, proyecto }, o null si no arrancó o se canceló.
export async function prenderProyecto(app, recordar = false) {
  const { estado } = app;
  const proyecto = app.deps.detectarProyecto(app.carpetaProyecto);
  if (!proyecto) throw new Error(t('proyecto.noHay'));
  if (app.arrancando) return null;
  const control = new AbortController();
  app.arrancando = control;
  app.lineasServidor = [];
  estado.arranque = { fase: 'iniciando', texto: proyecto.texto, lineas: [], error: '' };
  cambio(app);
  try {
    const r = await app.deps.iniciarProyecto(proyecto, { senal: control.signal, alLinea: l => agregarLinea(app, l), alCerrar: codigo => alCerrarSolo(app, proyecto, codigo) });
    if (recordar) guardarDecision(proyecto, 'siempre');
    app.servidorPropio = { proyecto, detener: r.detener, puerto: r.puerto };
    estado.servidorPropio = { texto: proyecto.texto, puerto: r.puerto, lineas: [...app.lineasServidor], cerrado: false };
    estado.arranque = null;
    contar(app, 'ok', t('proyecto.listo', { texto: proyecto.texto, puerto: r.puerto }));
    return { puerto: r.puerto, proyecto };
  } catch (error) {
    if (error.tipo === 'cancelado') { estado.arranque = null; cambio(app); return null; }
    estado.arranque = { fase: 'error', texto: proyecto.texto, lineas: (error.lineas || app.lineasServidor).slice(-8).map(l => acortar(l, 300)), error: explicarFalla(error, proyecto), faltaInstalar: proyecto.faltaInstalar };
    contar(app, 'error', t('proyecto.noPrendio', { texto: proyecto.texto }), [estado.arranque.error]);
    return null;
  } finally {
    app.arrancando = null;
  }
}

// El servidor se cerró solo, ya andando.
function alCerrarSolo(app, proyecto, codigo) {
  if (app.interno.cerrando) return;
  app.servidorPropio = null;
  if (app.estado.servidorPropio) app.estado.servidorPropio.cerrado = true;
  contar(app, 'error', t('proyecto.seCerroSolo', { texto: proyecto.texto, codigo }), [t('proyecto.seCerroSoloSolucion')]);
}

// Apaga el servidor que prendió celular-dev (o cancela el arranque si todavía no terminó). Sin nada prendido, no hace nada.
export async function apagarServidorPropio(app) {
  if (app.arrancando) app.arrancando.abort();
  const propio = app.servidorPropio;
  if (!propio) return false;
  app.servidorPropio = null;
  app.estado.servidorPropio = null;
  await propio.detener();
  return true;
}

// Con el servidor andando: se lo elige como sitio.
export const sitioDelServidor = (app, r) => sitioDeServidor(app, { puerto: r.puerto, ruta: '/', liveServer: false, carpeta: r.proyecto.carpeta });

// Al arrancar: --iniciar lo pide; «siempre para este proyecto» (con el mismo comando que se aceptó) lo repite sin preguntar.
// Devuelve el sitio, o null si no corresponde. Si ya hay un servidor del proyecto prendido, lo usa sin tocarlo.
export async function iniciarSiCorresponde(app) {
  const pedido = !!app.opciones.iniciar;
  const p = (pedido || app.esProyecto) ? app.deps.detectarProyecto(app.carpetaProyecto) : null;
  if (pedido && !p) throw new Error(t('proyecto.noHay'));
  if (!p) return null;
  if (!pedido) {
    const d = decisionDe(p);
    if (!(d && d.decision === 'siempre' && d.comando === p.texto)) return null;
  }
  if (p.puertoProbable) {
    const hallado = await app.deps.servidores.detectar({ puerto: p.puertoProbable });
    if (hallado) return sitioDeServidor(app, { ...hallado, carpeta: p.carpeta });
  }
  app.ui.info(t('proyecto.prendiendo', { texto: p.texto }));
  const r = await prenderProyecto(app, false);
  if (!r) {
    if (pedido) throw new Error(app.estado.arranque ? app.estado.arranque.error : t('proyecto.noPrendio', { texto: p.texto }));
    return null;
  }
  return sitioDelServidor(app, r);
}
