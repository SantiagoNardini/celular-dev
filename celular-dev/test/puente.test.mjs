// El puente para servidores que solo escuchan en IPv6 (Vite en Windows): el túnel del cable llega por IPv4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { alcanzablePorIpv4, crearPuente } from '../src/puente.mjs';

const escuchar = (servidor, host) => new Promise((resolver, rechazar) => { servidor.once('error', rechazar); servidor.listen(0, host, () => resolver(servidor.address().port)); });
const pedir = puerto => new Promise((resolver, rechazar) => {
  get({ host: '127.0.0.1', port: puerto, agent: false }, r => { let t = ''; r.on('data', d => { t += d; }); r.on('end', () => resolver(t)); }).on('error', rechazar);
});

test('un servidor que solo escucha en IPv4 se ve por IPv4; uno que solo escucha en IPv6, no', async t => {
  const v4 = createServer((_, r) => r.end('v4'));
  const p4 = await escuchar(v4, '127.0.0.1');
  assert.equal(await alcanzablePorIpv4(p4), true);
  v4.close(); v4.closeAllConnections();
  const v6 = createServer((_, r) => r.end('v6'));
  let p6;
  try { p6 = await escuchar(v6, '::1'); } catch { return t.skip('esta máquina no tiene IPv6'); }
  assert.equal(await alcanzablePorIpv4(p6), false);
  v6.close(); v6.closeAllConnections();
});

test('el puente lleva lo que llega por IPv4 al servidor que solo escucha en IPv6, y se apaga al cerrarlo', async t => {
  const v6 = createServer((_, r) => r.end('hola desde IPv6'));
  let p6;
  try { p6 = await escuchar(v6, '::1'); } catch { return t.skip('esta máquina no tiene IPv6'); }
  await assert.rejects(pedir(p6), 'sin el puente, por IPv4 no responde');
  const puente = await crearPuente(p6);
  assert.notEqual(puente.puerto, p6);
  assert.equal(await pedir(puente.puerto), 'hola desde IPv6');
  assert.equal(await pedir(puente.puerto), 'hola desde IPv6', 'sigue andando con más de un pedido');
  puente.cerrar();
  await assert.rejects(pedir(puente.puerto), 'cerrado, ya no responde');
  v6.close(); v6.closeAllConnections();
});
