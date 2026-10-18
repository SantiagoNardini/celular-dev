// La pantalla del celular se queda prendida mientras celular-dev está abierto y el cable puesto: si se apaga,
// el espejo se queda sin imagen y la página deja de recargarse. Al cerrar se deja como estaba.
// Se usa «Mantener activa» de Android (stay_on_while_plugged_in): solo vale con el celular enchufado.
import { preferencia, guardarPreferencia } from '../lugares.mjs';

const CLAVE = 'pantallaOriginal';
const CARGANDO = 3;   // activa con el cable USB o con un cargador (1 = cargador, 2 = USB)

export async function mantenerDespierto(app) {
  const { adb } = app;
  try {
    // lo que tenía la persona se guarda en disco: si el programa se cierra a la fuerza, la próxima vez se puede devolver
    if (preferencia(CLAVE) == null) {
      const actual = (await adb.shell('settings get global stay_on_while_plugged_in')).salida.trim();
      guardarPreferencia(CLAVE, /^\d+$/.test(actual) ? actual : '0');
    }
    await adb.shell(`settings put global stay_on_while_plugged_in ${CARGANDO}`);
    // si ya estaba apagada, se prende (con bloqueo de pantalla con PIN, eso lo tiene que hacer la persona)
    await adb.shell('input keyevent KEYCODE_WAKEUP');
  } catch { /* sin eso, el aviso de pantalla apagada sigue funcionando */ }
}

export async function devolverPantalla(app) {
  const original = preferencia(CLAVE);
  if (original == null) return;
  try {
    await Promise.race([
      app.adb.shell(`settings put global stay_on_while_plugged_in ${original}`),
      new Promise((_, no) => setTimeout(no, 3000))
    ]);
    guardarPreferencia(CLAVE, null);
  } catch { /* el celular ya no está: queda guardado para devolverlo la próxima vez */ }
}
