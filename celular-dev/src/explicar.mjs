// Explica en español simple lo que pasó en el celular, para quien no programa todos los días.
// El mensaje técnico se sigue mostrando debajo, en chico: es lo que sirve para buscar o para la IA.

const nombreDe = ruta => (ruta || '').split('?')[0].split('/').filter(Boolean).pop() || ruta || 'la página';

const REGLAS = [
  [/^ReferenceError: (\S+) is not defined/, m => `Tu página usa \`${m[1]}\`, pero no existe. Revisá si está bien escrito o si falta cargar el archivo donde se define.`],
  [/^TypeError: Cannot read propert(?:y|ies) of (undefined|null) \(reading '([^']+)'\)/, m => `Se quiso leer \`${m[2]}\` de algo que está vacío (${m[1]}). Puede que un dato todavía no haya llegado o que un elemento no exista en la página.`],
  [/^TypeError: Cannot set propert(?:y|ies) of (undefined|null) \(setting '([^']+)'\)/, m => `Se quiso cambiar \`${m[2]}\` de algo que está vacío (${m[1]}). Revisá que ese elemento o dato exista antes de usarlo.`],
  [/^TypeError: (\S+) is not a function/, m => `Se llamó a \`${m[1]}\` como si fuera una función, y no lo es. Revisá el nombre o que el archivo que la define esté cargado.`],
  [/^TypeError: Failed to fetch/, () => 'No se pudo conectar para pedir datos. Puede ser la conexión, una dirección mal escrita o que el servidor no permita el pedido.'],
  [/^TypeError: Assignment to constant variable/, () => 'Se quiso cambiar una constante (`const`). Si tiene que cambiar, declarala con `let`.'],
  [/^SyntaxError: Unexpected token/, () => 'Hay un error de escritura en el código: falta o sobra un símbolo (una coma, una llave, un paréntesis…).'],
  [/^SyntaxError: (?:Unexpected end of JSON input|.*is not valid JSON|JSON\.parse)/, () => 'Llegaron datos que no se pudieron leer como JSON. Puede que el servidor haya devuelto un error o una página en lugar de datos.'],
  [/^SyntaxError/, () => 'Hay un error de escritura en el código y el navegador no lo pudo leer.'],
  [/^RangeError: Maximum call stack/, () => 'Una función se llama a sí misma sin parar (un bucle sin salida).'],
  [/^(?:Uncaught )?\(in promise\)/, () => 'Algo que se esperaba (una promesa) falló y nadie manejó el error.']
];

export function explicar(aviso) {
  const { tipo, texto, dato } = aviso;
  switch (tipo) {
    case 'excepcion': {
      for (const [patron, armar] of REGLAS) {
        const m = texto.match(patron);
        if (m) return armar(m);
      }
      return `Hubo un error en el código de la página: ${texto}`;
    }
    case 'consola':
      if (aviso.nivel === 'error') return `Tu código avisó un error: ${dato}`;
      if (aviso.nivel === 'aviso') return `Tu código avisó: ${dato}`;
      return `Tu código dice: ${dato}`;
    case 'http': {
      const archivo = nombreDe(dato.url);
      if (dato.estado === 404) return `No se encontró \`${archivo}\`. Revisá que el archivo exista y que el nombre esté bien escrito (mayúsculas incluidas).`;
      if (dato.estado === 401 || dato.estado === 403) return `No hay permiso para abrir \`${archivo}\` (error ${dato.estado}).`;
      if (dato.estado >= 500) return `El servidor falló al pedir \`${archivo}\` (error ${dato.estado}). El problema está del lado del servidor.`;
      return `El pedido de \`${archivo}\` devolvió un error ${dato.estado}.`;
    }
    case 'red': {
      const archivo = nombreDe(dato.url);
      if (dato.bloqueado) return `El navegador bloqueó \`${archivo}\` por seguridad (${dato.motivo}).`;
      if (/CONNECTION_REFUSED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT/.test(dato.motivo)) return `No se pudo conectar para pedir \`${archivo}\`: el servidor no responde o la dirección está mal (${dato.motivo}).`;
      return `No se pudo cargar \`${archivo}\` (${dato.motivo}).`;
    }
    case 'navegador':
      if (/Content Security Policy/i.test(texto)) return 'La seguridad de la página (CSP) bloqueó algo que se quiso cargar o ejecutar.';
      if (/Mixed Content/i.test(texto)) return 'La página es segura (https) pero quiso cargar algo inseguro (http), y el navegador lo bloqueó.';
      return `El navegador avisó: ${texto}`;
    default:
      return texto;
  }
}
