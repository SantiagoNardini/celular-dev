// Las condiciones de prueba que se aplican en el celular: tema, animaciones, contraste, visión, lugar y
// celular lento. Acá está lo que se manda; el panel las elige (herramientas.mjs).
export const OPCIONES = {
  esquema: ['auto', 'oscuro', 'claro'],
  animaciones: ['normal', 'reducidas'],
  contraste: ['normal', 'alto'],
  vision: ['ninguna', 'borrosa', 'protanopia', 'deuteranopia', 'tritanopia', 'acromatopsia'],
  lugar: ['real', 'buenos-aires', 'madrid', 'nueva-york', 'tokio']
};
const VISION_CHROME = { ninguna: 'none', borrosa: 'blurredVision', protanopia: 'protanopia', deuteranopia: 'deuteranopia', tritanopia: 'tritanopia', acromatopsia: 'achromatopsia' };
export const LUGARES = {
  'buenos-aires': { zona: 'America/Argentina/Buenos_Aires', idioma: 'es-AR', lat: -34.6037, lon: -58.3816 },
  madrid: { zona: 'Europe/Madrid', idioma: 'es-ES', lat: 40.4168, lon: -3.7038 },
  'nueva-york': { zona: 'America/New_York', idioma: 'en-US', lat: 40.7128, lon: -74.006 },
  tokio: { zona: 'Asia/Tokyo', idioma: 'ja-JP', lat: 35.6762, lon: 139.6503 }
};
export const VECES_LENTO = 4;   // el celular lento: procesador 4 veces más despacio y red 3G

// Aplica en el celular todo lo que está elegido (al elegir algo, y al reconectar con la pestaña).
export async function aplicarCondiciones(app) {
  const { estado, chrome } = app;
  const c = estado.condiciones;
  await chrome.medios(c);
  await chrome.vision(VISION_CHROME[c.vision]);
  await chrome.lugar(LUGARES[c.lugar] || null);
  await chrome.cpu(estado.lento ? VECES_LENTO : 1);
}

