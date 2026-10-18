// El estado: es lo que dibuja el panel (se le manda entero cada vez que cambia) y lo que resume la
// terminal. Acá también se cuenta lo que pasa (actividad) y se agrupan los errores del celular.
import { basename } from 'node:path';
import { t, idioma } from '../idioma.mjs';
import { explicar } from '../explicar.mjs';
import { tieneSitio } from '../estatico.mjs';

export const REDES = ['normal', 'lenta', 'sin-conexion'];
export const nombreRed = red => t(`red.${red}`);

export function estadoInicial({ carpetaProyecto, esProyecto, manual }) {
  return {
    fase: 'adb',                       // adb | inicio | preparando | corriendo
    idioma: idioma(),
    plataforma: process.platform,
    pasos: { adb: 'pendiente', celular: 'desconocido', chrome: 'pendiente', abierto: 'pendiente' },
    opciones: {
      carpeta: { nombre: basename(carpetaProyecto), ruta: carpetaProyecto, tieneSitio: esProyecto && tieneSitio(carpetaProyecto) },
      recientes: [],                   // carpetas usadas otras veces: { nombre, ruta }
      servidores: []
    },
    sitio: null,                       // { tipo, nombre, url }
    necesitaCodigo: false,             // un servidor sin carpeta de código conocida: no se puede recargar al guardar
    descargaAdb: null,                 // null, o el porcentaje mientras se descarga ADB, o 'error'
    ofrecerAccesos: false,             // todavía no hay accesos directos: el panel ofrece crearlos
    servidorOk: true,
    celular: { modelo: '', android: '', navegador: '', pantalla: '', url: '' },   // url: la página que tiene abierta ahora
    modo: manual ? 'manual' : 'vivo',  // vivo | manual | live-server
    consola: false,
    espejo: false,                     // llegan cuadros de la pantalla del celular
    version: '',                       // la de celular-dev que está corriendo
    novedad: null,                     // hay una versión nueva publicada: { version, url }
    primerExito: false,                // todavía no tocó el espejo: el panel le muestra qué hacer
    red: 'normal',                     // normal | lenta | sin-conexion: la red que se simula en el celular
    revision: null,                    // la última revisión del sitio: { hora, red, puntos }
    tamano: 'real',                    // 'real' o el id de un tamaño de pantalla simulado (tamanos.mjs)
    tamanos: [],                       // los tamaños que se pueden simular, con cuáles entran en la pantalla real
    desactualizado: null,              // el celular no muestra lo último que se guardó: { motivo, hora }
    soltada: null,                     // una carpeta arrastrada al panel que está en varios lugares: { nombre, candidatas }
    revisando: false,
    recargas: 0,
    errores: 0,
    ronda: 0,                          // cuántas veces cargó la página el celular: separa los errores nuevos de los de antes de recargar
    avisos: [],                        // errores y avisos del celular, agrupados, el último arriba (ronda: en qué carga pasó por última vez)
    actividad: []                      // lo que hizo el programa: guardados, recargas, conexiones
  };
}

export function cambio(app) {
  titulo(app);
  if (app.panel) app.panel.avisar();
}

function titulo(app) {
  const { estado, sitio } = app;
  const situacion = estado.fase === 'adb' ? t('titulo.adb') : estado.fase === 'inicio' ? t('titulo.inicio')
    : estado.fase === 'preparando' ? t('titulo.preparando') : !estado.servidorOk ? t('titulo.servidorApagado')
    : estado.pasos.celular !== 'ok' ? t('titulo.desconectado') : t('titulo.corriendo');
  const partes = [t('titulo.celular', { situacion })];
  if (sitio) partes.push(sitio.url);
  if (estado.fase === 'corriendo') partes.push(t(`modo.${estado.modo}`));
  if (estado.errores) partes.push(t('titulo.errores', { n: estado.errores }));
  app.ui.titulo(partes.join('  |  '));
}

// Lo que pasa se cuenta en la terminal y queda en la actividad del panel.
export function contar(app, nivel, texto, solucion) {
  const { ui, estado } = app;
  ({ ok: ui.ok, info: ui.info, aviso: ui.aviso, error: ui.falla })[nivel](texto, solucion);
  estado.actividad.unshift({ id: `${Date.now()}-${Math.random()}`, nivel, texto: solucion && solucion.length ? `${texto} ${solucion[0]}` : texto, hora: ui.hora() });
  if (estado.actividad.length > 30) estado.actividad.length = 30;
  cambio(app);
}

// Un error o aviso del celular: se explica, se agrupa con los iguales y se cuenta.
export function registrarAviso(app, aviso) {
  const { ui, estado, interno } = app;
  const simple = explicar(aviso);
  const clave = `${aviso.tipo}|${aviso.texto}|${aviso.donde}`;
  let grupo = estado.avisos.find(a => a.clave === clave);
  if (grupo) {
    grupo.veces++;
    grupo.ultima = ui.hora();
    grupo.ronda = estado.ronda;
    estado.avisos = [grupo, ...estado.avisos.filter(a => a !== grupo)];
  } else {
    grupo = { id: clave, clave, nivel: aviso.nivel, tipo: aviso.tipo, simple, texto: aviso.texto, donde: aviso.donde, abrible: !!(aviso.donde && /:\d+/.test(aviso.donde)), veces: 1, ultima: ui.hora(), ronda: estado.ronda };
    estado.avisos.unshift(grupo);
    if (estado.avisos.length > 100) estado.avisos.length = 100;
  }
  if (aviso.nivel === 'error') estado.errores++;
  // en la terminal, un error que se repite seguido no se vuelve a imprimir más de una vez cada 3 s
  const ultimo = interno.impreso.get(clave) || 0;
  if (Date.now() - ultimo > 3000) {
    interno.impreso.set(clave, Date.now());
    ui.delCelular(aviso.nivel, simple, aviso.texto, aviso.donde, grupo.veces);
  }
  cambio(app);
}
