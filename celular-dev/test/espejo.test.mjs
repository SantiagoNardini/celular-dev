// La lectura de las medidas de una imagen JPEG: sirve para reconocer, en el espejo, una imagen que no es del
// tamaño simulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medidaJpeg } from '../src/app/espejo.mjs';

const conMarcadores = (...antes) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...antes,
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 8, 0x04, 0x00, 0x02, 0xd0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])]);

test('lee el ancho y el alto del marcador SOF', () => {
  assert.deepEqual(medidaJpeg(conMarcadores()), { ancho: 720, alto: 1024 });
});

test('salta los marcadores que vienen antes (APP0, tablas) sin confundirse', () => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const tabla = Buffer.concat([Buffer.from([0xff, 0xdb, 0x00, 0x43, 0]), Buffer.alloc(64, 0xff)]);
  assert.deepEqual(medidaJpeg(conMarcadores(app0, tabla)), { ancho: 720, alto: 1024 });
});

test('sin medidas (o con datos cortados) devuelve null y no se rompe', () => {
  assert.equal(medidaJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(medidaJpeg(Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])), null);
  assert.equal(medidaJpeg(Buffer.alloc(0)), null);
  assert.equal(medidaJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff])), null);
});
