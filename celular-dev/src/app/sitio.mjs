// Qué se muestra en el celular: una carpeta (la sirve un servidor propio) o un servidor que ya está
// prendido. Se elige en el panel, con opciones de la terminal o solo; y se vigila el código para recargar.
import { resolve, basename } from 'node:path';
import { t } from '../idioma.mjs';
import { servirCarpeta, tieneSitio } from '../estatico.mjs';
import { vigilar } from '../vigia.mjs';
import { Traductor } from '../consola.mjs';
import { leerConfig, recordarCarpeta, codigoRecordado, rutaParaMostrar } from '../lugares.mjs';
import { cambio, contar } from './estado.mjs';
import { recargar } from './acciones.mjs';
import { marcarManual, esperarCargaSiCorresponde } from './frescura.mjs';

const espera = ms => new Promise(r => setTimeout(r, ms));

// Con un servidor, la carpeta del código (la que se vigila para recargar al guardar) sale de: --codigo,
// lo recordado para ese puerto, o la carpeta desde donde se abrió si es un proyecto. Si no, se pregunta.
export function sitioDeServidor(app, s) {
  const carpeta = app.opciones.codigo ? resolve(app.opciones.codigo) : codigoRecordado(s.puerto) || (app.esProyecto ? app.carpetaProyecto : null);
  return { tipo: 'servidor', puerto: s.puerto, ruta: s.ruta, liveServer: s.liveServer, nombre: `localhost:${s.puerto}${s.ruta === '/' ? '' : s.ruta}`, carpeta };
}

export async function sitioDeCarpeta(app, ruta) {
  if (!tieneSitio(ruta)) throw new Error(t('sitio.sinIndex', { carpeta: basename(ruta) }));
  const estatico = await servirCarpeta(ruta);
  recordarCarpeta(ruta);
  return { tipo: 'carpeta', puerto: estatico.puerto, ruta: '/', liveServer: false, nombre: basename(ruta), carpeta: ruta, cerrarEstatico: estatico.cerrar };
}

// Las carpetas usadas otras veces que todavía existen y tienen un sitio (menos la de ahora, que ya se ofrece).
function recientes(app) {
  const { estado, carpetaProyecto } = app;
  return leerConfig().recientes
    .filter(r => tieneSitio(r) && !(estado.opciones.carpeta.tieneSitio && r.toLowerCase() === carpetaProyecto.toLowerCase()))
    .slice(0, 4)
    .map(r => ({ nombre: basename(r), ruta: r, corta: rutaParaMostrar(r) }));
}

// Vigila la carpeta del código para recargar el celular al guardar (no hace falta con Live Server).
export function vigilarCodigo(app) {
  const { estado, sitio } = app;
  if (app.dejarDeVigilar) { app.dejarDeVigilar(); app.dejarDeVigilar = null; }
  estado.necesitaCodigo = false;
  if (!sitio.carpeta) {
    if (estado.modo === 'live-server') return;   // Live Server recarga solo: no hace falta saber dónde está el código
    estado.necesitaCodigo = true;
    contar(app, 'aviso', t('sitio.sinCodigo'), [t('sitio.sinCodigoSolucion')]);
    return;
  }
  app.dejarDeVigilar = vigilar(sitio.carpeta, archivos => {
    const nombres = archivos.length > 3 ? t('sitio.archivosYMas', { lista: archivos.slice(0, 3).join(', '), n: archivos.length - 3 }) : archivos.join(', ');
    if (estado.fase !== 'corriendo') return;
    if (estado.modo === 'manual') { contar(app, 'info', t('sitio.guardasteManual', { nombres })); marcarManual(app, archivos); return; }
    contar(app, 'info', t('sitio.guardaste', { nombres }));
    // Live Server recarga solo: acá solo se vigila que lo haya hecho. Si no, se recarga desde acá.
    if (estado.modo === 'live-server') esperarCargaSiCorresponde(app, archivos);
    else recargar(app);
  });
}

// Mientras se muestra el inicio, cada 3 s se miran los puertos conocidos. Solo se le pide la página a un
// servidor la primera vez que aparece (hay vistas previas que recompilan todo con cada pedido).
async function actualizarOpciones(app) {
  const { estado, interno, sitio } = app;
  const { conocidos, puertoAbierto, detectar } = app.deps.servidores;
  const propios = sitio && sitio.tipo === 'carpeta' ? [sitio.puerto] : [];
  for (const p of conocidos) {
    if (propios.includes(p)) continue;
    const abierto = await puertoAbierto(p, 300);
    if (!abierto) { interno.servidoresVistos.delete(p); continue; }
    if (!interno.servidoresVistos.has(p)) {
      const hallado = await detectar({ puerto: p });
      if (hallado) interno.servidoresVistos.set(p, { ...hallado, url: `http://localhost:${p}${hallado.ruta}` });
    }
  }
  const servidores = [...interno.servidoresVistos.values()];
  const tiene = app.esProyecto && tieneSitio(app.carpetaProyecto);
  const cambioCarpeta = tiene !== estado.opciones.carpeta.tieneSitio;
  estado.opciones.carpeta.tieneSitio = tiene;
  const usadas = recientes(app);
  if (cambioCarpeta || JSON.stringify([servidores, usadas]) !== JSON.stringify([estado.opciones.servidores, estado.opciones.recientes])) {
    estado.opciones.servidores = servidores;
    estado.opciones.recientes = usadas;
    cambio(app);
  }
}

// Muestra el inicio en el panel y espera a que se elija qué mostrar.
export async function elegirEnPanel(app) {
  const { estado } = app;
  estado.fase = 'inicio';
  estado.soltada = null;
  cambio(app);
  await actualizarOpciones(app);
  app.relojes.opciones = setInterval(() => actualizarOpciones(app), app.tiempos.opciones);
  const extras = (estado.opciones.servidores.length ? t('sitio.teclaS') : '') + (estado.opciones.carpeta.tieneSitio ? t('sitio.teclaC') : '');
  app.ui.info(t('sitio.elegiEnPanel', { url: app.panel.url }) + extras);
  const elegido = await new Promise(resolver => { app.alElegirSitio = resolver; });
  app.alElegirSitio = null;
  clearInterval(app.relojes.opciones);
  return elegido;
}

// Recibe lo elegido en el panel o con una tecla mientras se muestra el inicio.
export async function elegir(app, obtener) {
  if (!app.alElegirSitio) return { error: t('sitio.noSeEstaEligiendo') };
  const nuevo = await obtener();
  app.estado.soltada = null;
  app.alElegirSitio(nuevo);
  return { mensaje: t('sitio.listo', { nombre: nuevo.nombre }) };
}

export async function obtenerSitio(app) {
  const { opciones, deps } = app;
  const conocidos = deps.servidores.conocidos;
  if (opciones.carpeta) return sitioDeCarpeta(app, resolve(opciones.carpeta));
  if (opciones.puerto || opciones.ruta || !app.conPanel) {
    const pedido = { puerto: opciones.puerto ? parseInt(opciones.puerto, 10) : 0, ruta: opciones.ruta || '' };
    let hallado = await deps.servidores.detectar(pedido);
    // solo terminal y sin servidor: si en esta carpeta hay un sitio, se muestra ese
    if (!hallado && !opciones.puerto && !opciones.ruta && app.esProyecto && tieneSitio(app.carpetaProyecto)) return sitioDeCarpeta(app, app.carpetaProyecto);
    if (!hallado) {
      const donde = pedido.puerto ? t('sitio.elPuerto', { puerto: pedido.puerto }) : t('sitio.losPuertos', { puertos: conocidos.join(', ') });
      app.ui.aviso(t('sitio.sinServidor', { donde }), [t('sitio.sinServidorSolucion')]);
      while (!hallado && !app.interno.cerrando) { await espera(1500); hallado = await deps.servidores.detectar(pedido); }
      if (!hallado) return null;
    }
    return sitioDeServidor(app, hallado);
  }
  return elegirEnPanel(app);
}

// Deja listo el sitio elegido: quién lo sirve, qué carpeta se vigila y cómo se recarga.
export async function aplicarSitio(app, nuevo) {
  const { estado, interno } = app;
  const anterior = app.sitio;
  app.sitio = { ...nuevo, origen: `http://localhost:${nuevo.puerto}`, url: `http://localhost:${nuevo.puerto}${nuevo.ruta}`, reverseYaEstaba: true };
  const sitio = app.sitio;
  estado.sitio = { tipo: sitio.tipo, nombre: sitio.nombre, url: sitio.url };
  estado.modo = sitio.liveServer ? 'live-server' : interno.modoElegido;
  estado.servidorOk = true;
  estado.avisos = [];
  estado.errores = 0;
  estado.revision = null;
  app.traductor = new Traductor({ origen: sitio.origen, todo: true });
  if (anterior) {
    if (anterior.cerrarEstatico) anterior.cerrarEstatico();
    if (app.adb && !anterior.reverseYaEstaba && anterior.puerto !== sitio.puerto) await app.adb.quitarReverse(anterior.puerto);
  }
  contar(app, 'ok', sitio.tipo === 'carpeta' ? t('sitio.mostrandoCarpeta', { nombre: sitio.nombre })
    : t('sitio.usandoServidor', { url: sitio.url, extra: sitio.liveServer ? ' (Live Server)' : '' }));
  vigilarCodigo(app);
}
