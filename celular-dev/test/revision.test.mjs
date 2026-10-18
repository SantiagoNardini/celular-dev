import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluar } from '../src/revision.mjs';

const vacio = { cantidad: 0, ejemplos: [] };
const base = () => ({
  pantalla: { ancho: 411, alto: 773, densidad: 1.75 },
  desborde: { px: 0, ejemplos: [] },
  chicos: { cantidad: 0, de: 10, ejemplos: [] },
  contraste: { ...vacio }, sinAlt: { ...vacio }, textoChico: { ...vacio }, sinNombre: { ...vacio }, sinEtiqueta: { ...vacio },
  tiempos: { primeraPintura: 800, cargaCompleta: 1200, pesoKB: 300, pedidos: 12 }
});

test('un sitio sin problemas: todo en verde', () => {
  const puntos = evaluar(base());
  assert.ok(puntos.length > 0);
  assert.ok(puntos.every(p => p.nivel === 'ok'));
  assert.ok(puntos.some(p => /0,8 s/.test(p.simple)));
});

test('los problemas van primero, los errores antes que los avisos', () => {
  const d = base();
  d.chicos = { cantidad: 3, de: 10, ejemplos: ['button «x» (20×18 px)'] };
  d.desborde = { px: 37, ejemplos: ['img.banner'] };
  const puntos = evaluar(d);
  assert.equal(puntos[0].nivel, 'error');
  assert.match(puntos[0].simple, /37 px de más/);
  assert.deepEqual(puntos[0].ejemplos, ['img.banner']);
  assert.equal(puntos[1].nivel, 'aviso');
  assert.match(puntos[1].simple, /3 botones o enlaces son chicos/);
});

test('singular y plural', () => {
  const d = base();
  d.sinAlt = { cantidad: 1, ejemplos: ['img'] };
  d.contraste = { cantidad: 2, ejemplos: [] };
  const textos = evaluar(d).map(p => p.simple).join('\n');
  assert.match(textos, /1 imagen no tiene/);
  assert.match(textos, /2 textos tienen poco contraste/);
});

test('lento y pesado', () => {
  const d = base();
  d.tiempos = { primeraPintura: 4200, cargaCompleta: 6000, pesoKB: 3100, pedidos: 40 };
  const textos = evaluar(d).filter(p => p.nivel === 'aviso').map(p => p.simple).join('\n');
  assert.match(textos, /4,2 s/);
  assert.match(textos, /3,0 MB/);
});
