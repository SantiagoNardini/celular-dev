// El diagnóstico: un texto con el estado de todo (versiones, ADB, celulares que ve, qué pasó hace un momento), para
// pegarlo donde se pida ayuda. No incluye el contenido de tus archivos ni tus datos: solo rutas del programa (con
// tu carpeta de usuario reemplazada por ~) y mensajes del programa. Está siempre en inglés: lo lee quien da soporte.
import { release, homedir } from 'node:os';
import { join } from 'node:path';

// de una dirección solo se cuenta el sitio y la ruta: lo que va después del ? o # puede traer claves o datos de la persona
const sinConsulta = url => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return String(url || ''); } };
const sinUsuario = texto => String(texto == null ? '' : texto).split(homedir()).join('~');

export async function armarDiagnostico(app) {
  const { estado, adb } = app;
  const L = [];
  const linea = (clave, valor) => L.push(`${clave}: ${valor === '' || valor == null ? '-' : valor}`);

  L.push('# celular-dev diagnostics', '');
  linea('Version', estado.version);
  linea('System', `${process.platform} ${release()} (${process.arch})`);
  linea('Node', process.version);
  linea('Language', estado.idioma);
  linea('Phase', estado.fase);
  L.push('');

  L.push('## ADB');
  if (adb) {
    linea('Path', sinUsuario(adb.ruta));
    try { linea('Version', ((await adb.ejecutar(['version'], 4000)).salida.split('\n')[0] || '').trim()); } catch { linea('Version', '?'); }
    linea('Server started by celular-dev', adb.loIniciamos ? 'yes' : 'no');
    linea('State', adb.estado);
    linea('Selected phone', adb.serie ? 'yes' : 'no (single or none)');
    if (!adb.lista.length) L.push('Devices: none');
    for (const d of adb.lista) L.push(`Device: ${d.nombre} [${d.serie.slice(0, 3)}…] ${d.estado}`);
  } else {
    L.push('Not started yet (ADB not found or still starting).');
  }
  L.push('');

  L.push('## Phone');
  linea('Model', estado.celular.modelo);
  linea('Android', estado.celular.android);
  linea('Browser', estado.celular.navegador);
  linea('Viewport', estado.celular.pantalla);
  linea('Open page', sinConsulta(estado.celular.url));
  linea('Steps', Object.entries(estado.pasos).map(([k, v]) => `${k}=${v}`).join(' '));
  L.push('');

  L.push('## Site');
  linea('Site', estado.sitio ? `${estado.sitio.tipo} ${sinConsulta(estado.sitio.url)}` : 'not chosen');
  linea('Server up', estado.servidorOk);
  linea('Mode', estado.modo);
  linea('Network', estado.red);
  linea('Screen size', estado.tamano);
  linea('Console connected', estado.consola);
  linea('Mirror running', estado.espejo);
  linea('Reloads / errors', `${estado.recargas} / ${estado.errores}`);
  L.push('');

  L.push('## Recent activity');
  for (const a of estado.actividad.slice(0, 20)) L.push(`${a.hora} [${a.nivel}] ${sinUsuario(a.texto)}`);
  if (!estado.actividad.length) L.push('(nothing yet)');
  L.push('', '## Recent page errors');
  for (const e of estado.avisos.slice(0, 10)) L.push(`[${e.nivel}] ${e.texto}${e.donde ? ' · ' + e.donde : ''}${e.veces > 1 ? ` (x${e.veces})` : ''}`);
  if (!estado.avisos.length) L.push('(none)');
  L.push('', `Log file: ${sinUsuario(join(app.carpetaPropia, 'registro.log'))}`);
  return L.join('\n');
}
