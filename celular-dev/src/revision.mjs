// Revisión del sitio en el celular: corre revision-pagina.js en la página y convierte lo medido en una
// lista de puntos en lenguaje simple: { nivel: 'error' | 'aviso' | 'ok', simple, ejemplos }.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, existe } from './idioma.mjs';

const GUION = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'revision-pagina.js'), 'utf8');

export async function revisar(chrome) {
  const datos = await chrome.evaluar(GUION);
  if (!datos) throw new Error('la página no devolvió resultados');
  return datos;
}

// segundos y megas con la coma o el punto del idioma
const seg = ms => t('revision.segundos', { s: (ms / 1000).toFixed(1) });
const mb = kb => (kb / 1024).toFixed(1);

// Pasa lo medido a puntos para mostrar (los problemas primero, después lo que está bien).
export function evaluar(d) {
  const problemas = [];
  const bien = [];
  const punto = (condicion, nivel, clave, datos, ejemplos) => {
    if (condicion) problemas.push({ nivel, simple: t(`revision.${clave}`, datos), ejemplos: ejemplos || [] });
    else if (existe(`revision.${clave}Ok`)) bien.push({ nivel: 'ok', simple: t(`revision.${clave}Ok`, datos), ejemplos: [] });
  };

  punto(d.desborde.px > 0, 'error', 'desborde', { px: d.desborde.px }, d.desborde.ejemplos);
  punto(d.sinNombre.cantidad > 0, 'error', 'sinNombre', { n: d.sinNombre.cantidad }, d.sinNombre.ejemplos);
  punto(d.chicos.cantidad > 0, 'aviso', 'chicos', { n: d.chicos.cantidad }, d.chicos.ejemplos);
  punto(d.contraste.cantidad > 0, 'aviso', 'contraste', { n: d.contraste.cantidad }, d.contraste.ejemplos);
  punto(d.textoChico.cantidad > 0, 'aviso', 'textoChico', { n: d.textoChico.cantidad }, d.textoChico.ejemplos);
  punto(d.sinAlt.cantidad > 0, 'aviso', 'sinAlt', { n: d.sinAlt.cantidad }, d.sinAlt.ejemplos);
  punto(d.sinEtiqueta.cantidad > 0, 'aviso', 'sinEtiqueta', { n: d.sinEtiqueta.cantidad }, d.sinEtiqueta.ejemplos);

  const tiempos = d.tiempos;
  if (tiempos.primeraPintura != null) punto(tiempos.primeraPintura > 3000, 'aviso', 'lenta', { s: seg(tiempos.primeraPintura) });
  punto(tiempos.pesoKB > 2000, 'aviso', 'pesada', { mb: mb(tiempos.pesoKB), kb: tiempos.pesoKB, n: tiempos.pedidos });

  const orden = { error: 0, aviso: 1 };
  problemas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  return [...problemas, ...bien];
}
