// Las herramientas del panel que usan las DevTools de Chrome en el celular: condiciones de prueba (tema,
// animaciones, visión, lugar, celular lento), inspeccionar un elemento tocándolo en el espejo y los datos del sitio.
import { t } from '../idioma.mjs';
import { cambio, contar, condicionesIniciales } from './estado.mjs';
import { OPCIONES, VECES_LENTO, aplicarCondiciones } from './condiciones.mjs';
import { conectarConsola } from './conexion.mjs';

// ---------- Condiciones de prueba ----------

export async function elegirCondicion(app, valor) {
  const { estado, chrome } = app;
  if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
  const clave = valor && valor.clave;
  const elegido = valor && String(valor.valor);
  if (!OPCIONES[clave] || !OPCIONES[clave].includes(elegido)) return { error: t('condiciones.noExiste') };
  if (!chrome.conectado && !(await conectarConsola(app, 4))) return { error: t('accion.sinConexionPestana') };
  const antes = estado.condiciones[clave];
  estado.condiciones[clave] = elegido;
  try {
    await aplicarCondiciones(app);
  } catch (error) {
    estado.condiciones[clave] = antes;
    contar(app, 'error', t('condiciones.noSePudo', { detalle: error.message }));
    return { error: t('condiciones.noSePudoCorto') };
  }
  cambio(app);
  return { mensaje: t(`condiciones.${clave}.${elegido}`) };
}

export async function reiniciarCondiciones(app) {
  const { estado } = app;
  estado.condiciones = condicionesIniciales();
  estado.lento = false;
  try {
    if (app.chrome.conectado) await aplicarCondiciones(app);
  } catch (error) {
    contar(app, 'error', t('condiciones.noSePudo', { detalle: error.message }));
  }
  cambio(app);
  return { mensaje: t('condiciones.reiniciadas') };
}

// El celular lento, de una vez: red 3G y procesador más lento.
export async function celularLento(app, recargar) {
  const { estado, chrome } = app;
  if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
  if (!chrome.conectado && !(await conectarConsola(app, 4))) return { error: t('accion.sinConexionPestana') };
  const prender = !estado.lento;
  try {
    await chrome.red(prender ? 'lenta' : 'normal');
    await chrome.cpu(prender ? VECES_LENTO : 1);
  } catch (error) {
    contar(app, 'error', t('condiciones.noSePudo', { detalle: error.message }));
    return { error: t('condiciones.noSePudoCorto') };
  }
  estado.lento = prender;
  estado.red = prender ? 'lenta' : 'normal';
  contar(app, prender ? 'aviso' : 'ok', prender ? t('condiciones.lentoPuesto') : t('condiciones.lentoQuitado'));
  cambio(app);
  await recargar(app);
  return { mensaje: prender ? t('condiciones.lentoCorto') : t('condiciones.lentoQuitado') };
}

// ---------- Inspeccionar un elemento ----------

// Corre dentro de la página del celular: el elemento que hay en (x, y) y lo que importa saber de él.
function elementoEn({ fx, fy }) {
  const x = Math.min(Math.max(fx * innerWidth, 0), innerWidth - 1);
  const y = Math.min(Math.max(fy * innerHeight, 0), innerHeight - 1);
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const camino = nodo => {
    const partes = [];
    for (let n = nodo; n && n.nodeType === 1 && n !== document.documentElement && partes.length < 4; n = n.parentElement) {
      if (n.id) { partes.unshift(`#${CSS.escape(n.id)}`); break; }
      let p = n.tagName.toLowerCase();
      const clases = [...n.classList].slice(0, 2).map(c => `.${CSS.escape(c)}`).join('');
      p += clases;
      if (!clases && n.parentElement) {
        const iguales = [...n.parentElement.children].filter(h => h.tagName === n.tagName);
        if (iguales.length > 1) p += `:nth-of-type(${iguales.indexOf(n) + 1})`;
      }
      partes.unshift(p);
      if (n === document.body) break;
    }
    return partes.join(' > ');
  };
  const etiqueta = el.tagName.toLowerCase();
  const interactivo = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(etiqueta) || el.hasAttribute('onclick') || ['button', 'link', 'checkbox', 'tab', 'menuitem'].includes(el.getAttribute('role')) || cs.cursor === 'pointer';
  const texto = (el.innerText || '').trim().replace(/\s+/g, ' ');
  const dato = n => cs.getPropertyValue(n);
  return {
    selector: camino(el),
    etiqueta,
    id: el.id || '',
    clases: [...el.classList].slice(0, 6),
    texto: texto.length > 80 ? `${texto.slice(0, 77)}…` : texto,
    rect: { x: Math.round(r.left), y: Math.round(r.top), ancho: Math.round(r.width), alto: Math.round(r.height) },
    pantalla: { ancho: innerWidth, alto: innerHeight },
    estilos: {
      color: dato('color'), fondo: dato('background-color'), tamanoLetra: dato('font-size'), pesoLetra: dato('font-weight'),
      letra: dato('font-family').split(',')[0].replace(/["']/g, '').trim(), mostrar: dato('display'), posicion: dato('position'),
      margen: dato('margin'), relleno: dato('padding'), borde: dato('border-radius'), ancho: dato('width'), alto: dato('height')
    },
    interactivo,
    nombre: el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || (texto.length > 40 ? `${texto.slice(0, 37)}…` : texto),
    rol: el.getAttribute('role') || '',
    desborde: r.right > innerWidth + 1 || r.left < -1,
    atributos: ['href', 'src', 'alt', 'type', 'name', 'placeholder'].filter(a => el.hasAttribute(a)).map(a => `${a}="${String(el.getAttribute(a)).slice(0, 60)}"`)
  };
}

export async function inspeccionar(app, valor) {
  const { estado, chrome } = app;
  if (!chrome || !chrome.conectado || !valor || typeof valor !== 'object') return { error: t('accion.sinConexionPestana') };
  // x e y llegan como fracción de la imagen: la página los pasa a sus píxeles
  const fx = Math.min(Math.max(+valor.x || 0, 0), 1);
  const fy = Math.min(Math.max(+valor.y || 0, 0), 1);
  try {
    const encontrado = await chrome.correr(elementoEn, { fx, fy });
    if (!encontrado) return { error: t('inspector.nadaAhi') };
    estado.inspeccion = encontrado;
    cambio(app);
    return {};
  } catch (error) {
    return { error: t('inspector.noSePudo', { detalle: error.message }) };
  }
}

export function cerrarInspeccion(app) {
  app.estado.inspeccion = null;
  cambio(app);
  return {};
}

// ---------- Datos del sitio ----------

// Corre dentro de la página: lo que el sitio guardó en el celular.
async function volcarAlmacenamiento() {
  const volcar = almacen => {
    try { return Object.keys(almacen).map(k => { const v = String(almacen.getItem(k)); return { clave: k, valor: v.length > 200 ? `${v.slice(0, 197)}…` : v, largo: v.length }; }); } catch { return []; }
  };
  const sw = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations().catch(() => [])).length : 0;
  const cachesNombres = window.caches ? await caches.keys().catch(() => []) : [];
  const bases = indexedDB && indexedDB.databases ? (await indexedDB.databases().catch(() => [])).map(b => b.name) : [];
  return { local: volcar(localStorage), sesion: volcar(sessionStorage), serviceWorkers: sw, caches: cachesNombres, bases };
}

const origenActual = app => { try { return new URL(app.estado.celular.url).origin; } catch { return app.sitio.origen; } };

export async function leerDatos(app) {
  const { estado, chrome, ui } = app;
  if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
  if (!chrome.conectado && !(await conectarConsola(app, 4))) return { error: t('accion.sinConexionPestana') };
  try {
    const dato = await chrome.correr(volcarAlmacenamiento);
    const cookies = await chrome.cookies(estado.celular.url || app.sitio.url);
    estado.datosSitio = {
      hora: ui.hora(), origen: origenActual(app), ...dato,
      cookies: cookies.map(c => ({ nombre: c.name, valor: c.value.length > 200 ? `${c.value.slice(0, 197)}…` : c.value, dominio: c.domain, ruta: c.path, soloHttp: !!c.httpOnly, segura: !!c.secure }))
    };
    cambio(app);
    return {};
  } catch (error) {
    return { error: t('datos.noSePudoLeer', { detalle: error.message }) };
  }
}

export async function borrarDato(app, valor) {
  const { chrome } = app;
  if (!valor || typeof valor !== 'object') return { error: t('datos.noExiste') };
  try {
    if (valor.tipo === 'cookie') await chrome.borrarCookie(String(valor.clave), String(valor.dominio), String(valor.ruta || '/'));
    else if (valor.tipo === 'local' || valor.tipo === 'sesion') {
      await chrome.correr(({ almacen, clave }) => (almacen === 'local' ? localStorage : sessionStorage).removeItem(clave), { almacen: valor.tipo, clave: String(valor.clave) });
    } else return { error: t('datos.noExiste') };
  } catch (error) {
    return { error: t('datos.noSePudoBorrar', { detalle: error.message }) };
  }
  await leerDatos(app);
  return { mensaje: t('datos.borrado') };
}

// «Empezar de cero»: borra todo lo que el sitio guardó en el celular (solo de este sitio) y recarga.
export async function empezarDeCero(app, recargar) {
  const { estado, chrome } = app;
  if (estado.fase !== 'corriendo') return { error: t('accion.noListo') };
  if (!chrome.conectado && !(await conectarConsola(app, 4))) return { error: t('accion.sinConexionPestana') };
  try {
    await chrome.borrarDatos(origenActual(app));
  } catch (error) {
    contar(app, 'error', t('datos.noSePudoBorrarTodo', { detalle: error.message }));
    return { error: t('datos.noSePudoBorrarTodoCorto') };
  }
  contar(app, 'ok', t('datos.limpio'));
  await recargar(app);
  setTimeout(() => leerDatos(app).catch(() => {}), 1500).unref();
  return { mensaje: t('datos.limpioCorto') };
}
