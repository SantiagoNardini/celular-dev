import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explicar } from '../src/explicar.mjs';

const ex = (texto, extra = {}) => explicar({ tipo: 'excepcion', nivel: 'error', texto, ...extra });

test('variable que no existe: nombra la variable', () => {
  assert.match(ex('ReferenceError: mostrarRanking is not defined'), /`mostrarRanking`, pero no existe/);
});

test('leer algo vacío: nombra la propiedad y si era null o undefined', () => {
  const t = ex("TypeError: Cannot read properties of undefined (reading 'length')");
  assert.match(t, /leer `length`/);
  assert.match(t, /undefined/);
});

test('cambiar algo vacío', () => {
  assert.match(ex("TypeError: Cannot set properties of null (setting 'textContent')"), /cambiar `textContent`/);
});

test('llamar a algo que no es función', () => {
  assert.match(ex('TypeError: datos.map is not a function'), /`datos\.map` como si fuera una función/);
});

test('errores de escritura', () => {
  assert.match(ex('SyntaxError: Unexpected token }'), /falta o sobra un símbolo/);
  assert.match(ex('SyntaxError: Unexpected end of JSON input'), /JSON/);
});

test('un error desconocido no se pierde: se muestra tal cual', () => {
  assert.match(ex('Error: algo muy raro'), /algo muy raro/);
});

test('consola: error, aviso y log', () => {
  assert.match(explicar({ tipo: 'consola', nivel: 'error', texto: 'x', dato: 'falló' }), /avisó un error: falló/);
  assert.match(explicar({ tipo: 'consola', nivel: 'aviso', texto: 'x', dato: 'ojo' }), /avisó: ojo/);
  assert.match(explicar({ tipo: 'consola', nivel: 'log', texto: 'x', dato: 'hola' }), /dice: hola/);
});

test('pedidos HTTP: 404 nombra el archivo, 500 culpa al servidor', () => {
  assert.match(explicar({ tipo: 'http', texto: 'x', dato: { url: '/img/logo.png?v=2', estado: 404 } }), /No se encontró `logo\.png`/);
  assert.match(explicar({ tipo: 'http', texto: 'x', dato: { url: '/api/datos', estado: 500 } }), /del lado del servidor/);
  assert.match(explicar({ tipo: 'http', texto: 'x', dato: { url: '/privado', estado: 403 } }), /permiso/);
});

test('red: bloqueado y sin conexión', () => {
  assert.match(explicar({ tipo: 'red', texto: 'x', dato: { url: '/a.js', motivo: 'bloqueado (csp)', bloqueado: true } }), /bloqueó `a\.js`/);
  assert.match(explicar({ tipo: 'red', texto: 'x', dato: { url: 'https://x.com/d', motivo: 'net::ERR_NAME_NOT_RESOLVED' } }), /no responde o la dirección está mal/);
});

test('navegador: CSP y contenido mixto', () => {
  assert.match(explicar({ tipo: 'navegador', texto: 'Refused to load because it violates the following Content Security Policy directive' }), /CSP/);
  assert.match(explicar({ tipo: 'navegador', texto: 'Mixed Content: The page was loaded over HTTPS' }), /inseguro/);
});
