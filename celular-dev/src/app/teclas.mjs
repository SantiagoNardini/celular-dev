// La terminal: las teclas (R recargar, M modo...) y el resumen de cuando todo está andando.
import { createInterface } from 'node:readline';
import { t } from '../idioma.mjs';
import { recargar, cambiarModo, capturar, revisarSitio, cambiarRed, abrirInspect, alAccion } from './acciones.mjs';
import { sitioDeServidor, sitioDeCarpeta, elegir } from './sitio.mjs';

export function escucharTeclas(app) {
  const { estado, ui } = app;
  const acciones = {
    r: () => recargar(app, t('accion.aMano')), m: () => cambiarModo(app), f: () => capturar(app), a: () => alAccion(app, 'abrir'),
    v: () => revisarSitio(app), n: () => cambiarRed(app),
    p: () => { if (!app.ventana) app.deps.abrirNavegador(app.panel.url); }, i: () => abrirInspect(app), q: () => app.salir(0),
    l: () => { console.clear(); if (estado.fase === 'corriendo') mostrarResumen(app); },
    h: () => ui.renglon(`     ${t('resumen.teclas')}   ${t('teclas')}`, 'gris'),
    s: () => { const s = estado.opciones.servidores[0]; if (app.alElegirSitio && s) return elegir(app, async () => sitioDeServidor(app, s)); },
    c: () => { if (app.alElegirSitio && estado.opciones.carpeta.tieneSitio) return elegir(app, () => sitioDeCarpeta(app, app.carpetaProyecto)); }
  };
  const atender = tecla => {
    if (tecla === '\u0003') return app.salir(0);   // Ctrl+C
    const accion = acciones[tecla.toLowerCase()];
    if (accion) Promise.resolve().then(accion).then(r => { if (r && r.error) ui.falla(r.error); }).catch(error => ui.falla(error.message));
  };
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', atender);
  } else {
    // sin terminal (por ejemplo, desde otro programa): cada renglón que llega es una tecla
    createInterface({ input: process.stdin }).on('line', linea => linea.trim() && atender(linea.trim()[0]));
  }
}

export function mostrarResumen(app) {
  const { estado, sitio, ui } = app;
  ui.cartel(t('resumen.corriendo'), 'verde');
  if (estado.version) ui.renglon(`     ${t('resumen.version')}  v${estado.version}`);
  ui.renglon(`     ${t('resumen.sitio')}    ${sitio.url}${sitio.tipo === 'carpeta' ? `  (${t('resumen.carpeta')} ${sitio.carpeta})` : ''}`);
  ui.renglon(`     ${t('resumen.celular')}  ${estado.celular.modelo}${estado.celular.android ? `, Android ${estado.celular.android}` : ''}`);
  ui.renglon(`     ${t('resumen.recarga')}  ${t(`resumen.recarga.${estado.modo}`)}`);
  if (app.conPanel) ui.renglon(`     ${t('resumen.panel')}    ${app.panel.url}`);
  ui.renglon('');
  ui.renglon(`     ${t('resumen.teclas')}   ${t('teclas')}`, 'gris');
  ui.renglon('');
}
