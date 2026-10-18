// Explica en lenguaje simple lo que pasó en el celular, para quien no programa todos los días.
// El mensaje técnico se sigue mostrando debajo, en chico: es lo que sirve para buscar o para la IA.
import { t } from './idioma.mjs';

const nombreDe = ruta => (ruta || '').split('?')[0].split('/').filter(Boolean).pop() || ruta || t('explicar.laPagina');

// [patrón del mensaje de Chrome, clave del texto, cómo sacar los datos del mensaje]
const REGLAS = [
  [/^ReferenceError: (\S+) is not defined/, 'explicar.noDefinido', m => ({ nombre: m[1] })],
  [/^TypeError: Cannot read propert(?:y|ies) of (undefined|null) \(reading '([^']+)'\)/, 'explicar.leerVacio', m => ({ propiedad: m[2], vacio: m[1] })],
  [/^TypeError: Cannot set propert(?:y|ies) of (undefined|null) \(setting '([^']+)'\)/, 'explicar.cambiarVacio', m => ({ propiedad: m[2], vacio: m[1] })],
  [/^TypeError: (\S+) is not a function/, 'explicar.noEsFuncion', m => ({ nombre: m[1] })],
  [/^TypeError: Failed to fetch/, 'explicar.fetch', () => ({})],
  [/^TypeError: Assignment to constant variable/, 'explicar.constante', () => ({})],
  [/^SyntaxError: Unexpected token/, 'explicar.simbolo', () => ({})],
  [/^SyntaxError: (?:Unexpected end of JSON input|.*is not valid JSON|JSON\.parse)/, 'explicar.json', () => ({})],
  [/^SyntaxError/, 'explicar.sintaxis', () => ({})],
  [/^RangeError: Maximum call stack/, 'explicar.bucle', () => ({})],
  [/^(?:Uncaught )?\(in promise\)/, 'explicar.promesa', () => ({})]
];

export function explicar(aviso) {
  const { tipo, texto, dato } = aviso;
  switch (tipo) {
    case 'excepcion': {
      for (const [patron, clave, datos] of REGLAS) {
        const m = texto.match(patron);
        if (m) return t(clave, datos(m));
      }
      return t('explicar.errorCodigo', { texto });
    }
    case 'consola':
      if (aviso.nivel === 'error') return t('explicar.consolaError', { dato });
      if (aviso.nivel === 'aviso') return t('explicar.consolaAviso', { dato });
      return t('explicar.consolaLog', { dato });
    case 'http': {
      const archivo = nombreDe(dato.url);
      if (dato.estado === 404) return t('explicar.http404', { archivo });
      if (dato.estado === 401 || dato.estado === 403) return t('explicar.httpPermiso', { archivo, estado: dato.estado });
      if (dato.estado >= 500) return t('explicar.http500', { archivo, estado: dato.estado });
      return t('explicar.httpOtro', { archivo, estado: dato.estado });
    }
    case 'red': {
      const archivo = nombreDe(dato.url);
      if (dato.bloqueado) return t('explicar.redBloqueado', { archivo, motivo: dato.motivo });
      if (/CONNECTION_REFUSED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT/.test(dato.motivo)) return t('explicar.redSinConexion', { archivo, motivo: dato.motivo });
      return t('explicar.redOtro', { archivo, motivo: dato.motivo });
    }
    case 'navegador':
      if (/Content Security Policy/i.test(texto)) return t('explicar.csp');
      if (/Mixed Content/i.test(texto)) return t('explicar.mixto');
      return t('explicar.navegador', { texto });
    default:
      return texto;
  }
}
