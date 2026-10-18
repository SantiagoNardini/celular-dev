// Idioma de todo lo que se muestra (panel, terminal, explicaciones e informe): español o inglés.
// Los textos están en textos/es.mjs y textos/en.mjs, con la misma clave en los dos. Un texto puede ser
// una cadena con {datos} para completar o, si necesita plurales, una función que recibe los datos.
// Los del panel van aparte, en "panel": se le mandan al navegador tal cual (solo cadenas).
import es from './textos/es.mjs';
import en from './textos/en.mjs';

export const IDIOMAS = { es, en };
let actual = 'es';

// El idioma del sistema: "es-AR", "es_ES.UTF-8"... cuenta como español; cualquier otro, inglés.
export function idiomaDelSistema() {
  const local = process.env.LC_ALL || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '';
  return /^es\b|^es[-_]/i.test(local) ? 'es' : 'en';
}

export function elegirIdioma(pedido) {
  actual = IDIOMAS[pedido] ? pedido : idiomaDelSistema();
  return actual;
}

export function idioma() {
  return actual;
}

export function t(clave, datos = {}) {
  const valor = clave === 'panel' ? undefined : IDIOMAS[actual][clave] ?? IDIOMAS.es[clave];
  if (valor === undefined) return clave;
  if (typeof valor === 'function') return valor(datos);
  return valor.replace(/\{(\w+)\}/g, (_, k) => (datos[k] ?? ''));
}

export function existe(clave) {
  return clave !== 'panel' && clave in IDIOMAS.es;
}

// Los textos del panel, para mandarlos al navegador.
export function textosPanel() {
  return IDIOMAS[actual].panel;
}
