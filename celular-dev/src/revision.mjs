// Revisión del sitio en el celular: corre revision-pagina.js en la página y convierte lo medido en una
// lista de puntos en español simple: { nivel: 'error' | 'aviso' | 'ok', simple, ejemplos }.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUION = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'revision-pagina.js'), 'utf8');

export async function revisar(chrome) {
  const datos = await chrome.evaluar(GUION);
  if (!datos) throw new Error('la página no devolvió resultados');
  return datos;
}

const seg = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Pasa lo medido a puntos para mostrar (los problemas primero, después lo que está bien).
export function evaluar(d) {
  const problemas = [];
  const bien = [];
  const punto = (condicion, nivel, simple, ejemplos, okTexto) => {
    if (condicion) problemas.push({ nivel, simple, ejemplos: ejemplos || [] });
    else if (okTexto) bien.push({ nivel: 'ok', simple: okTexto, ejemplos: [] });
  };

  punto(d.desborde.px > 0, 'error',
    `La página es más ancha que la pantalla: se puede mover de costado (${d.desborde.px} px de más). Suele ser una imagen, tabla o caja con ancho fijo.`,
    d.desborde.ejemplos, 'Entra justo en el ancho de la pantalla, sin moverse de costado.');
  punto(d.sinNombre.cantidad > 0, 'error',
    `${plural(d.sinNombre.cantidad, 'botón o enlace no tiene', 'botones o enlaces no tienen')} nombre: quien usa lector de pantalla no sabe qué hace. Agregale un texto o un aria-label.`,
    d.sinNombre.ejemplos, 'Todos los botones y enlaces tienen nombre.');
  punto(d.chicos.cantidad > 0, 'aviso',
    `${plural(d.chicos.cantidad, 'botón o enlace es chico', 'botones o enlaces son chicos')} para tocar con el dedo (menos de 40 px). Lo recomendado es al menos 44 px. Si toda la fila o tarjeta se puede tocar, no es problema.`,
    d.chicos.ejemplos, 'Los botones tienen buen tamaño para el dedo.');
  punto(d.contraste.cantidad > 0, 'aviso',
    `${plural(d.contraste.cantidad, 'texto tiene', 'textos tienen')} poco contraste con el fondo y cuesta leerlo, sobre todo al sol.`,
    d.contraste.ejemplos, 'Los textos tienen buen contraste.');
  punto(d.textoChico.cantidad > 0, 'aviso',
    `${plural(d.textoChico.cantidad, 'texto mide', 'textos miden')} menos de 12 px: en el celular se lee con dificultad.`,
    d.textoChico.ejemplos, 'No hay textos demasiado chicos.');
  punto(d.sinAlt.cantidad > 0, 'aviso',
    `${plural(d.sinAlt.cantidad, 'imagen no tiene', 'imágenes no tienen')} texto alternativo (alt). Sirve para lectores de pantalla y por si la imagen no carga.`,
    d.sinAlt.ejemplos, 'Todas las imágenes tienen texto alternativo.');
  punto(d.sinEtiqueta.cantidad > 0, 'aviso',
    `${plural(d.sinEtiqueta.cantidad, 'campo para completar no tiene', 'campos para completar no tienen')} etiqueta: no queda claro qué hay que escribir.`,
    d.sinEtiqueta.ejemplos, null);

  const t = d.tiempos;
  if (t.primeraPintura != null) {
    punto(t.primeraPintura > 3000, 'aviso',
      `Tarda ${seg(t.primeraPintura)} en mostrar algo en la pantalla. Más de 3 s se siente lento: revisá imágenes pesadas o scripts que frenan la carga.`,
      [], `Muestra algo en ${seg(t.primeraPintura)}.`);
  }
  punto(t.pesoKB > 2000, 'aviso',
    `La página pesa ${(t.pesoKB / 1024).toFixed(1).replace('.', ',')} MB: con datos móviles tarda y gasta. Comprimí imágenes o cargalas de a poco.`,
    [], `Pesa ${t.pesoKB} kB en ${plural(t.pedidos, 'archivo', 'archivos')}.`);

  const orden = { error: 0, aviso: 1 };
  problemas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  return [...problemas, ...bien];
}
