// Tamaños de pantalla típicos para probar el sitio sin otro celular. Chrome simula el ancho y el alto (como las
// herramientas de desarrollo): la página se arma y responde como en una pantalla de ese tamaño.
//
// Se comprobó en un moto g24 (411 × 773 px de página):
//  - los tamaños que entran en la pantalla real se ven en vivo, con los toques exactos;
//  - los que no entran (una tablet, el celular de costado, uno más grande) no se pueden mostrar: Chrome solo
//    dibuja lo que cabe en la pantalla física y repite ese contenido en el resto. Se ofrecen en la lista, pero
//    deshabilitados, y se habilitan solos con un celular de pantalla más grande.
//  - los datos de tamaño que trae cada imagen siguen diciendo el tamaño real: para los toques se usan las
//    medidas del tamaño elegido.
export const TAMANOS = [
  { id: 'chico', ancho: 320, alto: 568 },            // celulares chicos (iPhone SE de primera generación)
  { id: 'android', ancho: 360, alto: 640 },          // Android común
  { id: 'iphone-se', ancho: 375, alto: 667 },
  { id: 'iphone', ancho: 390, alto: 844 },           // iPhone 14
  { id: 'android-grande', ancho: 412, alto: 915 },   // Pixel y similares
  { id: 'max', ancho: 430, alto: 932 },              // iPhone Pro Max
  { id: 'horizontal', ancho: 844, alto: 390 },       // un celular de costado
  { id: 'tablet', ancho: 768, alto: 1024 }
];

export const tamanoDe = id => TAMANOS.find(t => t.id === id) || null;

// ¿Entra en la pantalla real del celular? (real: { ancho, alto } de la página, sin simular nada)
export const cabe = (tamano, real) => !real || (tamano.ancho <= real.ancho + 1 && tamano.alto <= real.alto + 1);

// Lo que se le pide a Chrome: el ancho y el alto, con la densidad de píxeles del celular (0 = la de siempre).
export const paraChrome = tamano => ({ ancho: tamano.ancho, alto: tamano.alto, densidad: 0 });

// La lista que ve el panel, con cuáles entran en la pantalla real.
export const listaParaPanel = real => TAMANOS.map(t => ({ id: t.id, ancho: t.ancho, alto: t.alto, cabe: cabe(t, real) }));
