import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAvisos, estadoDe } from '../src/adb.mjs';

const aviso = texto => texto.length.toString(16).padStart(4, '0') + texto;

test('estado del primer celular, o ninguno', () => {
  assert.equal(estadoDe('ZT322T2F7S\tdevice\n'), 'device');
  assert.equal(estadoDe('ZT322T2F7S\tunauthorized\n'), 'unauthorized');
  assert.equal(estadoDe(''), 'sin-celular');
});

test('un aviso completo', () => {
  assert.deepEqual(leerAvisos(aviso('ZT322T2F7S\tdevice\n')), { estados: ['device'], resto: '', invalido: false });
});

test('sin celulares llega 0000, sin salto de línea', () => {
  assert.deepEqual(leerAvisos('0000'), { estados: ['sin-celular'], resto: '', invalido: false });
});

test('varios avisos juntos, en orden', () => {
  const r = leerAvisos(aviso('A\tunauthorized\n') + aviso('A\tdevice\n') + '0000');
  assert.deepEqual(r.estados, ['unauthorized', 'device', 'sin-celular']);
});

test('un aviso cortado a la mitad espera el resto', () => {
  const completo = aviso('ZT322T2F7S\tdevice\n');
  const primero = leerAvisos(completo.slice(0, 9));
  assert.deepEqual(primero.estados, []);
  assert.equal(primero.resto, completo.slice(0, 9));
  assert.deepEqual(leerAvisos(primero.resto + completo.slice(9)).estados, ['device']);
});

test('el aviso de adb al prender su servicio no rompe nada: se descarta', () => {
  const r = leerAvisos('* daemon not running; starting now at tcp:5037\n');
  assert.deepEqual(r, { estados: [], resto: '', invalido: true });
});
