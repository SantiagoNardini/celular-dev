#!/usr/bin/env node
// celular-dev: abre tu sitio en tu celular Android por cable, lo recarga al guardar y te muestra los
// errores de la página tal como pasan en el celular, explicados. Se usa desde un panel en el navegador
// de la PC (se abre solo) o desde la terminal; los dos muestran lo mismo.
// Acá solo se leen las opciones y se arranca: el programa está en src/app.
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { elegirIdioma, t } from '../src/idioma.mjs';
import { preferencia, carpetaDatos, rutaParaMostrar } from '../src/lugares.mjs';
import { PUERTOS_CONOCIDOS } from '../src/servidor.mjs';
import { crearApp } from '../src/app/index.mjs';
import { escucharTeclas } from '../src/app/teclas.mjs';
import * as ui from '../src/pantalla.mjs';

let opciones;
try {
  opciones = parseArgs({
    options: {
      carpeta: { type: 'string' }, codigo: { type: 'string' }, puerto: { type: 'string' }, ruta: { type: 'string' },
      manual: { type: 'boolean' }, iniciar: { type: 'boolean' }, todo: { type: 'boolean' }, 'sin-panel': { type: 'boolean' },
      idioma: { type: 'string' }, celular: { type: 'string' }, ayuda: { type: 'boolean', short: 'h' }
    }
  }).values;
} catch (error) {
  elegirIdioma(process.env.CELULAR_IDIOMA || preferencia('idioma'));
  console.log(`${error.message}\n${t('ayuda', { puertos: PUERTOS_CONOCIDOS.join(', ') })}`);
  process.exit(1);
}
// el idioma: --idioma, o CELULAR_IDIOMA, o el que se eligió en el panel; si no, inglés
elegirIdioma(opciones.idioma || process.env.CELULAR_IDIOMA || preferencia('idioma'));
if (opciones.ayuda) { console.log(t('ayuda', { puertos: PUERTOS_CONOCIDOS.join(', ') })); process.exit(0); }

// opciones que no pueden andar: se avisa y se sale, en vez de quedar esperando algo que nunca va a aparecer
const puerto = opciones.puerto;
const problema = (puerto !== undefined && !(/^\d+$/.test(puerto) && +puerto >= 1 && +puerto <= 65535)) ? t('opcion.puertoMal', { valor: puerto })
  : (opciones.carpeta && !existsSync(opciones.carpeta)) ? t('opcion.carpetaNoExiste', { valor: opciones.carpeta })
  : (opciones.codigo && !existsSync(opciones.codigo)) ? t('opcion.carpetaNoExiste', { valor: opciones.codigo })
  : (opciones.idioma && !['es', 'en'].includes(opciones.idioma)) ? t('opcion.idiomaMal', { valor: opciones.idioma }) : null;
if (problema) { console.log(problema); process.exit(1); }

const app = crearApp({ opciones });

process.on('SIGINT', () => app.salir(0));
process.on('SIGTERM', () => app.salir(0));
process.on('SIGHUP', () => app.salir(0));     // se cerró la ventana de la terminal
process.on('SIGBREAK', () => app.salir(0));   // Ctrl+Pausa en Windows
process.on('uncaughtException', error => {
  ui.falla(t('error.algoSalioMal', { detalle: error.message }), [t('error.cerraYAbri'), t('error.mandaRegistro', { ruta: rutaParaMostrar(join(carpetaDatos(), 'registro.log')) })]);
  ui.anotar('ERROR', error.stack || String(error));
  app.salir(1);
});

// una promesa rechazada que nadie atendió no tumba el programa: se anota y se sigue (la salida es solo para lo grave)
process.on('unhandledRejection', error => {
  ui.falla(t('error.algoSalioMal', { detalle: error && error.message ? error.message : String(error) }));
  ui.anotar('ERROR', (error && error.stack) || String(error));
});

escucharTeclas(app);
app.arrancar().catch(error => {
  ui.falla(t('error.alArrancar', { detalle: error.message }));
  ui.anotar('ERROR', error.stack || String(error));
  app.salir(1);
});
