// ¿Se actualizó el celular? Después de guardar (o de pedir una recarga) el celular tiene que terminar de
// cargar la página. Si no lo hace (pantalla apagada, Chrome en segundo plano, algo trabado), el panel lo
// avisa en vez de dejar creer que se ve lo último. En modo manual avisa que hay cambios sin recargar.
import { t } from '../idioma.mjs';
import { cambio, contar } from './estado.mjs';

// Guardar esto en una carpeta de Live Server no recarga la página (se inyecta o no cambia nada visible)
const SIN_RECARGA = /\.(css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3)$/i;

// Se espera que el celular termine de cargar dentro de "ms"; si no llega, se avisa.
export function esperarCarga(app, ms) {
  const desde = Date.now();
  clearTimeout(app.relojes.frescura);
  app.relojes.frescura = setTimeout(() => sinCarga(app, desde), ms);
}

// Con Live Server la recarga la hace él: solo se vigila si lo guardado debería haberla causado.
export function esperarCargaSiCorresponde(app, archivos) {
  if (archivos.every(a => SIN_RECARGA.test(a))) return;
  esperarCarga(app, app.tiempos.frescuraLive);
}

async function sinCarga(app, desde) {
  const { estado } = app;
  if (app.interno.cerrando || estado.fase !== 'corriendo' || estado.desactualizado) return;
  // ¿Está la pantalla apagada? Es lo más común, y se puede saber.
  let apagada = false;
  try {
    const r = await app.adb.shell('dumpsys power | grep mWakefulness');
    apagada = /mWakefulness=(Asleep|Dozing)/.test(r.salida);
  } catch { /* sin saberlo, el aviso es el general */ }
  // mientras se preguntaba, el celular pudo haber terminado de cargar
  if (app.interno.cerrando || app.ultimaCarga >= desde || estado.desactualizado) return;
  estado.desactualizado = { motivo: apagada ? 'pantalla-apagada' : 'sin-carga', hora: app.ui.hora() };
  contar(app, 'aviso', t(apagada ? 'frescura.pantallaApagada' : 'frescura.sinCarga'), [t('frescura.solucion')]);
}

// En modo manual: se guardó algo y el celular todavía no lo muestra.
export function marcarManual(app, archivos) {
  const { estado } = app;
  if (estado.desactualizado && estado.desactualizado.motivo !== 'manual') return;
  const antes = estado.desactualizado ? estado.desactualizado.n : 0;
  estado.desactualizado = { motivo: 'manual', n: antes + archivos.length, hora: app.ui.hora() };
  cambio(app);
}

// El celular terminó de cargar la página (Page.loadEventFired): todo al día.
export function alCargar(app) {
  const { estado } = app;
  app.ultimaCarga = Date.now();
  clearTimeout(app.relojes.frescura);
  if (!estado.desactualizado) return;
  estado.desactualizado = null;
  contar(app, 'ok', t('frescura.seActualizo'));
}
