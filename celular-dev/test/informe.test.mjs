import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarInforme } from '../src/informe.mjs';
import { elegirIdioma } from '../src/idioma.mjs';

elegirIdioma('es');

const base = {
  sitio: { descripcion: 'mi-sitio (http://localhost:5500/)' },
  celular: { modelo: 'moto g24 power', android: '14', navegador: 'Chrome 155', pantalla: '411 × 773 px' },
  capturas: [], fecha: '2026-10-17 23:00:00'
};

test('sin errores lo dice, con el contexto del celular', () => {
  const t = armarInforme({ ...base, errores: [] });
  assert.match(t, /moto g24 power, Android 14/);
  assert.match(t, /No hubo errores/);
});

test('errores y avisos separados, con detalle técnico, lugar y veces', () => {
  const t = armarInforme({ ...base, errores: [
    { nivel: 'error', simple: 'Tu página usa `x`, pero no existe.', texto: 'ReferenceError: x is not defined', donde: '/app.js:4:3', veces: 3, ultima: '23:00' },
    { nivel: 'aviso', simple: 'No se encontró `logo.png`.', texto: 'Pedido con error 404: /logo.png', donde: '', veces: 1, ultima: '23:01' }
  ] });
  assert.match(t, /## Errores \(1\)/);
  assert.match(t, /## Avisos \(1\)/);
  assert.match(t, /`\/app\.js:4:3`/);
  assert.match(t, /Veces: 3/);
  assert.ok(t.indexOf('## Errores') < t.indexOf('## Avisos'));
});

test('incluye la revisión del sitio y la red simulada', () => {
  const t = armarInforme({ ...base, errores: [], red: 'lenta', revision: { hora: '23:05', red: 'lenta', puntos: [
    { nivel: 'error', simple: 'La página es más ancha que la pantalla.', ejemplos: ['img.banner'] },
    { nivel: 'ok', simple: 'Todo lo demás bien.', ejemplos: [] }
  ] } });
  assert.match(t, /Red simulada: 3G lenta/);
  assert.match(t, /con red 3G lenta/);
  assert.match(t, /## Revisión del sitio en el celular \(1\)/);
  assert.match(t, /`img\.banner`/);
  assert.doesNotMatch(t, /Todo lo demás bien/);
});

test('las comillas invertidas del mensaje no rompen el formato', () => {
  const t = armarInforme({ ...base, errores: [{ nivel: 'error', simple: 's', texto: 'Error con `código`', donde: '', veces: 1, ultima: '1' }] });
  assert.match(t, /`Error con 'código'`/);
});

test('en inglés, para quien usa el panel en inglés', () => {
  elegirIdioma('en');
  try {
    const t = armarInforme({ ...base, errores: [], red: 'lenta', revision: null });
    assert.match(t, /# Errors found on the phone/);
    assert.match(t, /For the AI:/);
    assert.match(t, /Simulated network: slow 3G/);
    assert.match(t, /There were no errors/);
  } finally {
    elegirIdioma('es');
  }
});

test('cuenta la pantalla simulada, si la hay', () => {
  const con = armarInforme({ ...base, errores: [], tamano: { ancho: 360, alto: 640 } });
  assert.match(con, /Pantalla simulada: 360 × 640 px/);
  assert.doesNotMatch(armarInforme({ ...base, errores: [] }), /Pantalla simulada/);
});
