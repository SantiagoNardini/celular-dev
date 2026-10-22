// Puente para los servidores que solo escuchan en IPv6. En Windows con Node 17 o más nuevo, «localhost» puede
// resolverse solo a ::1, así que un servidor como Vite queda atendiendo ahí y nada más. El túnel del cable (adb
// reverse) llega a la PC por IPv4 (127.0.0.1): encuentra la puerta cerrada y el celular ve ERR_EMPTY_RESPONSE.
// Con el puente, celular-dev abre un puerto propio en 127.0.0.1 que reenvía cada conexión al servidor por
// «localhost» (por donde sí responde), y el túnel apunta a ese puerto: no hace falta tocar el proyecto.
import net from 'node:net';

// ¿Responde el puerto por IPv4? (lo mismo que ve el túnel del cable)
export function alcanzablePorIpv4(puerto, espera = 500) {
  return new Promise(resolver => {
    const s = net.connect({ port: puerto, host: '127.0.0.1' });
    const fin = valor => { s.destroy(); resolver(valor); };
    s.setTimeout(espera, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
}

// Abre un puerto libre en 127.0.0.1 que reenvía al «localhost:puerto» de la PC. Devuelve { puerto, cerrar }.
export function crearPuente(puerto) {
  return new Promise((resolver, rechazar) => {
    const conexiones = new Set();
    const servidor = net.createServer(cliente => {
      const destino = net.connect({ port: puerto, host: 'localhost' });
      const par = [cliente, destino];
      for (const s of par) conexiones.add(s);
      const soltar = () => { for (const s of par) { s.destroy(); conexiones.delete(s); } };
      cliente.once('error', soltar); destino.once('error', soltar);
      cliente.once('close', soltar); destino.once('close', soltar);
      cliente.pipe(destino); destino.pipe(cliente);
    });
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => resolver({
      puerto: servidor.address().port,
      cerrar: () => { servidor.close(); for (const s of conexiones) s.destroy(); conexiones.clear(); }
    }));
  });
}
