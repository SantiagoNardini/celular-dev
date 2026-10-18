// Lo que se puede hacer con todo andando: los botones del panel y las teclas de la terminal.
// Cada acción devuelve { mensaje } o { error } para que el panel lo muestre.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { t, elegirIdioma } from '../idioma.mjs';
import { armarInforme } from '../informe.mjs';
import { revisar, evaluar } from '../revision.mjs';
import { ubicar, abrirEnEditor } from '../editor.mjs';
import { crearAccesos } from '../accesos.mjs';
import { rutaParaMostrar as mostrar, recordarCodigo, guardarPreferencia } from '../lugares.mjs';
import { abrirChromeInspect } from '../sistema.mjs';
import { REDES, nombreRed, cambio, contar } from './estado.mjs';
import { abrirEnCelular, conectarConsola, llevarSitioAlCelular } from './conexion.mjs';
import { sitioDeServidor, sitioDeCarpeta, vigilarCodigo, elegirEnPanel, aplicarSitio, elegir } from './sitio.mjs';
import { tocar, marcarPrimerExito, olvidarImagen, reanudarEspejo } from './espejo.mjs';
import { esperarCarga } from './frescura.mjs';
import { tamanoDe, paraChrome, cabe } from './tamanos.mjs';
import { limpiarSoltada } from '../buscar-carpeta.mjs';

const sello = (ui, d) => `${ui.fecha(d)}_${ui.hora(d).replace(/:/g, '-')}`;

export async function recargar(app, motivo = '') {
  const { estado, chrome } = app;
  if (estado.fase !== 'corriendo') return { error: t('accion.noListoRecargar') };
  if (!estado.servidorOk) { contar(app, 'aviso', t('accion.noRecargoServidor')); return { error: t('accion.servidorApagado') }; }
  if (!chrome.conectado && !(await conectarConsola(app, 4))) {
    contar(app, 'error', t('accion.sinPestana'), [t('accion.laVuelvoAAbrir')]);
    if (await abrirEnCelular(app)) await conectarConsola(app);
    return { mensaje: t('accion.abriDeNuevo') };
  }
  try {
    await chrome.recargar();
    estado.recargas++;
    // el celular tiene que terminar de cargar: si no lo hace, se avisa
    esperarCarga(app, app.tiempos.frescuraVivo);
    contar(app, 'ok', t('accion.recargado', { motivo }));
    return { mensaje: t('accion.recargadoCorto') };
  } catch (error) {
    contar(app, 'error', t('accion.noRecargo', { detalle: error.message }));
    return { error: t('accion.noRecargoCorto') };
  }
}

export async function capturar(app) {
  const { chrome, ui } = app;
  if (!chrome || !chrome.conectado) return { error: t('accion.sinConexionPestana') };
  try {
    const imagen = await chrome.captura();
    const carpeta = join(app.carpetaPropia, 'capturas');
    mkdirSync(carpeta, { recursive: true });
    const archivo = join(carpeta, `${sello(ui, new Date())}.png`);
    writeFileSync(archivo, imagen);
    const ruta = mostrar(archivo);
    app.interno.capturas.unshift(archivo);
    contar(app, 'ok', t('accion.capturaGuardada', { ruta }));
    return { mensaje: t('accion.capturaGuardadaEn', { ruta }) };
  } catch (error) {
    contar(app, 'error', t('accion.noCaptura', { detalle: error.message }));
    return { error: t('accion.noCapturaCorto') };
  }
}

export function cambiarModo(app) {
  const { estado, interno } = app;
  if (estado.modo === 'live-server') return { mensaje: t('accion.liveServerYaRecarga') };
  estado.modo = interno.modoElegido = estado.modo === 'vivo' ? 'manual' : 'vivo';
  contar(app, 'ok', estado.modo === 'vivo' ? t('accion.modoVivo') : t('accion.modoManual'));
  return { mensaje: t(`modo.${estado.modo}`) };
}

// Revisión del sitio en el celular: desbordes, botones chicos, contraste, imágenes, tiempos.
export async function revisarSitio(app) {
  const { estado, chrome, ui } = app;
  if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
  if (!chrome.conectado && !(await conectarConsola(app, 4))) return { error: t('accion.sinConexionPestana') };
  if (estado.revisando) return { mensaje: t('accion.yaReviso') };
  estado.revisando = true;
  cambio(app);
  try {
    const puntos = evaluar(await revisar(chrome));
    estado.revision = { hora: ui.hora(), red: estado.red, puntos };
    const problemas = puntos.filter(p => p.nivel !== 'ok');
    contar(app, problemas.length ? 'aviso' : 'ok', problemas.length ? t('accion.revisionProblemas', { n: problemas.length }) : t('accion.revisionBien'));
    for (const p of problemas) ui.delCelular(p.nivel, p.simple, p.ejemplos.join(' · ') || p.simple, '');
    return { mensaje: problemas.length ? t('accion.revisionProblemasCorto', { n: problemas.length }) : t('accion.revisionBienCorto') };
  } catch (error) {
    contar(app, 'error', t('accion.noReviso', { detalle: error.message }));
    return { error: t('accion.noRevisoCorto') };
  } finally {
    estado.revisando = false;
    cambio(app);
  }
}

// Simula una red en el celular y recarga, para ver cómo carga el sitio con esa conexión.
export async function cambiarRed(app, perfil) {
  const { estado, chrome } = app;
  if (!REDES.includes(perfil)) perfil = REDES[(REDES.indexOf(estado.red) + 1) % REDES.length];
  if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
  if (!chrome.conectado && !(await conectarConsola(app, 4))) return { error: t('accion.sinConexionPestana') };
  try {
    await chrome.red(perfil);
    estado.red = perfil;
    contar(app, perfil === 'normal' ? 'ok' : 'aviso', perfil === 'normal' ? t('accion.redNormal') : t('accion.redSimulada', { red: nombreRed(perfil) }));
    await recargar(app);
    return { mensaje: t('accion.redCorto', { red: nombreRed(perfil) }) };
  } catch (error) {
    contar(app, 'error', t('accion.noRed', { detalle: error.message }));
    return { error: t('accion.noRedCorto') };
  }
}

// Abre en el editor el archivo y la línea de un error del celular.
async function abrirCodigo(app, id) {
  const { sitio } = app;
  const aviso = app.estado.avisos.find(a => a.id === id);
  if (!aviso || !aviso.donde) return { error: t('accion.errorSinArchivo') };
  if (!sitio.carpeta) return { error: t('accion.primeroCodigo') };
  const lugar = ubicar(aviso.donde, sitio.carpeta, sitio.ruta);
  if (!lugar) return { error: t('accion.noEncuentroArchivo', { archivo: aviso.donde.replace(/:\d+(:\d+)?$/, '') }) };
  const como = await abrirEnEditor(lugar);
  app.ui.info(t('accion.abriendoArchivo', { archivo: mostrar(lugar.archivo), linea: lugar.linea, editor: como === 'vscode' ? t('accion.enVsCode') : '' }));
  return { mensaje: t('accion.abriendoArchivoCorto', { archivo: basename(lugar.archivo), linea: lugar.linea }) };
}

export function generarInforme(app) {
  const { sitio, estado, ui } = app;
  const d = new Date();
  const texto = armarInforme({
    sitio: { descripcion: sitio ? `${sitio.nombre} (${sitio.url})` : t('informe.sinElegir') },
    celular: estado.celular,
    errores: estado.avisos,
    revision: estado.revision,
    red: estado.red,
    tamano: tamanoDe(estado.tamano),
    capturas: app.interno.capturas,
    fecha: `${ui.fecha(d)} ${ui.hora(d)}`
  });
  mkdirSync(app.carpetaPropia, { recursive: true });
  const archivo = join(app.carpetaPropia, `${t('informe.archivo')}-${sello(ui, d)}.md`);
  writeFileSync(archivo, texto);
  const ruta = mostrar(archivo);
  contar(app, 'ok', t('accion.informeGuardado', { ruta }));
  return { texto, archivo: ruta };
}

// Baja ADB de Google a la carpeta propia de celular-dev (sin winget ni permisos de administrador).
// El arranque, que espera a que haya ADB, lo encuentra solo apenas termina.
function instalarAdb(app) {
  const { estado } = app;
  if (typeof estado.descargaAdb === 'number') return { mensaje: t('accion.yaDescargando') };
  estado.descargaAdb = 0;
  contar(app, 'info', t('accion.descargandoAdb'));
  app.deps.descargarAdb(porcentaje => { estado.descargaAdb = porcentaje; cambio(app); })
    .then(ruta => { estado.descargaAdb = null; contar(app, 'ok', t('accion.adbDescargado', { ruta: mostrar(ruta) })); })
    .catch(error => {
      estado.descargaAdb = 'error';
      contar(app, 'error', t('accion.noDescargaAdb', { detalle: error.message }), [t('accion.revisaInternet')]);
    });
  return { mensaje: t('accion.descargandoAdbCorto') };
}

async function crearLosAccesos(app) {
  try {
    const rutas = await crearAccesos();
    app.estado.ofrecerAccesos = false;
    guardarPreferencia('accesosOfrecidos', true);
    contar(app, 'ok', t('accion.accesosCreados', { rutas: rutas.map(mostrar).join(t('accion.y')) }));
    return { mensaje: t(`accesos.listo.${process.platform}`) };
  } catch (error) {
    contar(app, 'error', t('accion.noAccesos', { detalle: error.message }));
    return { error: t('accion.noAccesosCorto') };
  }
}

export function abrirInspect(app) {
  abrirChromeInspect();
  app.ui.info(t('accion.abriendoInspect'));
}

// Cambiar qué se muestra con todo andando: se vuelve al inicio y se lleva el nuevo sitio al celular.
async function cambiarSitio(app) {
  const nuevo = await elegirEnPanel(app);
  if (!nuevo) return;
  await aplicarSitio(app, nuevo);
  app.estado.fase = 'corriendo';
  app.estado.consola = false;
  app.chrome.cerrar();
  await llevarSitioAlCelular(app);
}

function cambiarIdioma(app, valor) {
  const nuevo = elegirIdioma(valor);
  guardarPreferencia('idioma', nuevo);
  app.estado.idioma = nuevo;
  cambio(app);
  return { mensaje: t('accion.idiomaCambiado') };
}

// Simula otra pantalla en el celular (o vuelve a la real): la página se ve como en ese tamaño.
async function cambiarTamano(app, id) {
  const { estado, chrome } = app;
  if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
  const medidas = id === 'real' ? null : tamanoDe(id);
  if (id !== 'real' && !medidas) return { error: t('accion.tamanoDesconocido') };
  // Chrome no puede mostrar un tamaño más grande que la pantalla real: repite el contenido en el resto
  if (medidas && !cabe(medidas, app.pantallaReal)) return { error: t('accion.tamanoNoCabe', { ancho: medidas.ancho, alto: medidas.alto, realAncho: app.pantallaReal.ancho, realAlto: app.pantallaReal.alto }) };
  if (!chrome.conectado && !(await conectarConsola(app, 4))) return { error: t('accion.sinConexionPestana') };
  try {
    await chrome.tamano(medidas && paraChrome(medidas));
    estado.tamano = medidas ? medidas.id : 'real';
    // lo que se mostraba ya no vale, y los toques usan las medidas nuevas hasta que llegue la primera imagen
    olvidarImagen(app);
    const medida = medidas || app.pantallaReal;
    if (medida) { app.espejo.ancho = medida.ancho; app.espejo.alto = medida.alto; }
    reanudarEspejo(app);
    cambio(app);
    if (!medidas) { contar(app, 'ok', t('accion.tamanoReal')); return { mensaje: t('accion.tamanoReal') }; }
    contar(app, 'aviso', t('accion.tamanoSimulado', { ancho: medidas.ancho, alto: medidas.alto }));
    return { mensaje: t('accion.tamanoCorto', { ancho: medidas.ancho, alto: medidas.alto }) };
  } catch (error) {
    contar(app, 'error', t('accion.noTamano', { detalle: error.message }));
    return { error: t('accion.noTamanoCorto') };
  }
}

// Una carpeta arrastrada al panel: se la busca en el disco. Una sola, se muestra; varias, se pregunta cuál;
// ninguna, se abre la ventana para elegirla.
async function soltarCarpeta(app, valor) {
  const { estado } = app;
  if (!app.alElegirSitio) return { error: t('sitio.noSeEstaEligiendo') };
  const soltada = limpiarSoltada(valor);
  if (!soltada) return { error: t('soltar.noEsCarpeta') };
  const candidatas = await app.deps.buscarCarpeta(soltada, { raices: app.deps.raicesBusqueda() });
  if (candidatas.length === 1) return elegir(app, () => sitioDeCarpeta(app, candidatas[0].ruta));
  if (candidatas.length > 1) {
    estado.soltada = { nombre: soltada.nombre, candidatas: candidatas.map(c => ({ ruta: c.ruta })) };
    cambio(app);
    return { mensaje: t('soltar.variasCorto', { n: candidatas.length }) };
  }
  const ruta = await app.deps.elegirCarpeta(t('carpeta.tituloSoltada', { nombre: soltada.nombre }));
  if (!ruta) return { mensaje: t('accion.ningunaCarpeta') };
  return elegir(app, () => sitioDeCarpeta(app, ruta));
}

export async function alAccion(app, accion, valor) {
  const { estado, sitio } = app;
  switch (accion) {
    case 'usar-servidor': {
      const s = estado.opciones.servidores[parseInt(valor, 10)];
      if (!s) return { error: t('accion.servidorYaNo') };
      return elegir(app, async () => sitioDeServidor(app, s));
    }
    case 'usar-carpeta': return elegir(app, () => sitioDeCarpeta(app, app.carpetaProyecto));
    case 'usar-reciente': {
      const r = estado.opciones.recientes[parseInt(valor, 10)];
      if (!r) return { error: t('accion.carpetaYaNo') };
      return elegir(app, () => sitioDeCarpeta(app, r.ruta));
    }
    case 'elegir-carpeta': {
      const ruta = await app.deps.elegirCarpeta(t('carpeta.tituloSitio'));
      if (!ruta) return { mensaje: t('accion.ningunaCarpeta') };
      return elegir(app, () => sitioDeCarpeta(app, ruta));
    }
    case 'elegir-codigo': {
      if (!sitio || sitio.tipo !== 'servidor') return { error: t('accion.soloConServidor') };
      const ruta = await app.deps.elegirCarpeta(t('carpeta.tituloCodigo'));
      if (!ruta) return { mensaje: t('accion.ningunaCarpeta') };
      sitio.carpeta = ruta;
      recordarCodigo(sitio.puerto, ruta);
      vigilarCodigo(app);
      contar(app, 'ok', t('accion.codigoElegido', { carpeta: basename(ruta) }));
      return { mensaje: t('accion.vigilando', { carpeta: basename(ruta) }) };
    }
    case 'abrir-datos':
      app.deps.abrirConElSistema(app.carpetaPropia);
      return { mensaje: t('accion.abriendoDatos') };
    case 'cambiar-sitio':
      if (estado.fase !== 'corriendo') return { error: t('accion.primeroAndando') };
      cambiarSitio(app).catch(error => contar(app, 'error', t('accion.noCambioSitio', { detalle: error.message })));
      return {};
    case 'recargar': return recargar(app, t('accion.aMano'));
    case 'revisar': return revisarSitio(app);
    case 'red': return cambiarRed(app, valor);
    case 'abrir-codigo': return abrirCodigo(app, valor);
    case 'captura': return capturar(app);
    case 'modo': return cambiarModo(app);
    case 'informe': return generarInforme(app);
    case 'tocar': return tocar(app, valor);
    case 'entendido': marcarPrimerExito(app); return {};
    case 'tamano': return cambiarTamano(app, valor);
    case 'soltar-carpeta': return soltarCarpeta(app, valor);
    case 'usar-soltada': {
      const c = estado.soltada && estado.soltada.candidatas[parseInt(valor, 10)];
      if (!c) return { error: t('accion.carpetaYaNo') };
      return elegir(app, () => sitioDeCarpeta(app, c.ruta));
    }
    case 'abrir-en-pc': {
      // la dirección sale del estado, no de lo que mande el panel: solo se abre lo que el celular tiene abierto
      const url = estado.celular.url;
      if (!url) return { error: t('accion.sinDireccion') };
      if (!/^https?:\/\//i.test(url)) return { error: t('accion.direccionNoWeb') };
      app.deps.abrirNavegador(url);
      return { mensaje: t('accion.abiertoEnPc', { url }) };
    }
    case 'atras':
      if (!app.chrome || !app.chrome.conectado) return { error: t('accion.sinConexionPestana') };
      await app.chrome.atras().catch(() => {});
      return {};
    case 'idioma': return cambiarIdioma(app, valor);
    case 'abrir':
      if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
      if (await abrirEnCelular(app)) await conectarConsola(app);
      return { mensaje: t('accion.abiertoDeNuevo') };
    case 'limpiar':
      estado.avisos = []; estado.errores = 0; app.interno.impreso.clear(); cambio(app);
      return { mensaje: t('accion.listaLimpia') };
    case 'instalar-adb': return instalarAdb(app);
    case 'crear-accesos': return crearLosAccesos(app);
    case 'no-accesos':
      estado.ofrecerAccesos = false;
      guardarPreferencia('accesosOfrecidos', true);
      cambio(app);
      return { mensaje: t('accion.noTeLoOfrezco') };
    case 'salir':
      // se contesta primero, y un instante después se cierra todo
      setTimeout(() => app.salir(0), 300);
      return { mensaje: t('accion.cerrando') };
    default: return { error: t('accion.desconocida', { accion }) };
  }
}

