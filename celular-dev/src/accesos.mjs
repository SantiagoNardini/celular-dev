// Accesos directos de celular-dev en el Escritorio y en el menú Inicio, con su ícono. Abren
// celular-dev.bat con la ventana minimizada: la herramienta se usa desde el panel del navegador.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LANZADOR = join(raiz, '..', 'celular-dev.bat');
export const ICONO = join(raiz, 'marca', 'icono.ico');

function powershell(guion) {
  return new Promise((resolver, rechazar) => {
    // el guion va codificado para que las rutas con tildes o espacios lleguen intactas
    const codificado = Buffer.from(guion, 'utf16le').toString('base64');
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado], { windowsHide: true });
    let salida = '', error = '';
    p.stdout.on('data', d => { salida += d; });
    p.stderr.on('data', d => { error += d; });
    p.once('error', rechazar);
    p.once('exit', codigo => (codigo === 0 ? resolver(salida.trim()) : rechazar(new Error(error.trim() || `PowerShell terminó con ${codigo}`))));
  });
}

const comillas = texto => `'${String(texto).replace(/'/g, "''")}'`;

// Carpetas del Escritorio y del menú Inicio de este usuario (el Escritorio puede estar en OneDrive).
async function carpetas() {
  const salida = await powershell("[Environment]::GetFolderPath('Desktop'); [Environment]::GetFolderPath('Programs')");
  const [escritorio, inicio] = salida.split(/\r?\n/);
  return { escritorio, inicio };
}

export async function hayAccesos() {
  if (process.platform !== 'win32') return true;
  const { escritorio, inicio } = await carpetas();
  return existsSync(join(escritorio, 'celular-dev.lnk')) || existsSync(join(inicio, 'celular-dev.lnk'));
}

// Crea (o actualiza) los dos accesos. Devuelve sus rutas.
export async function crearAccesos() {
  if (process.platform !== 'win32') throw new Error('Los accesos directos son para Windows.');
  if (!existsSync(LANZADOR)) throw new Error(`No encuentro ${LANZADOR}`);
  const { escritorio, inicio } = await carpetas();
  const rutas = [join(escritorio, 'celular-dev.lnk'), join(inicio, 'celular-dev.lnk')];
  const guion = `
$shell = New-Object -ComObject WScript.Shell
foreach ($ruta in @(${rutas.map(comillas).join(', ')})) {
  $acceso = $shell.CreateShortcut($ruta)
  $acceso.TargetPath = ${comillas(LANZADOR)}
  $acceso.WorkingDirectory = ${comillas(dirname(LANZADOR))}
  $acceso.IconLocation = ${comillas(ICONO + ',0')}
  $acceso.Description = 'Probá tu sitio en tu celular Android'
  $acceso.WindowStyle = 7
  $acceso.Save()
}`;
  await powershell(guion);
  return rutas;
}
