// ¿Hay una versión nueva? Se le pregunta una vez a GitHub (solo se pide el dato de la última versión: no se
// manda nada tuyo). Si falla, no hay internet o está apagado, no pasa nada. Se apaga con CELULAR_SIN_ACTUALIZACIONES=1.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preferencia, guardarPreferencia } from '../lugares.mjs';
import { cambio } from './estado.mjs';

const REPOSITORIO = 'SantiagoNardini/celular-dev';

export function versionActual(carpetaHerramienta) {
  try { return JSON.parse(readFileSync(join(carpetaHerramienta, 'package.json'), 'utf8')).version; } catch { return ''; }
}

// 0.10.0 > 0.9.2: se compara número por número
export function esMasNueva(candidata, actual) {
  const partes = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const a = partes(candidata), b = partes(actual);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

export async function buscarVersionPublicada() {
  const r = await fetch(`https://api.github.com/repos/${REPOSITORIO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) return null;
  const { tag_name: etiqueta } = await r.json();
  return etiqueta ? { version: String(etiqueta).replace(/^v/, ''), url: `https://github.com/${REPOSITORIO}/releases/tag/${etiqueta}` } : null;
}

export async function revisarNovedad(app, actual) {
  if (process.env.CELULAR_SIN_ACTUALIZACIONES || !app.conPanel) return;
  try {
    const publicada = await app.deps.buscarVersion();
    if (!publicada || app.interno.cerrando || !esMasNueva(publicada.version, actual)) return;
    if (preferencia('novedadVista') === publicada.version) return;   // ya dijo «ahora no» a esta
    app.estado.novedad = publicada;
    cambio(app);
  } catch { /* sin internet: no se avisa nada */ }
}

export function ocultarNovedad(app) {
  const { novedad } = app.estado;
  if (novedad) guardarPreferencia('novedadVista', novedad.version);
  app.estado.novedad = null;
  cambio(app);
}
