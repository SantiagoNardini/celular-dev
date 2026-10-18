// Accesos directos para abrir celular-dev sin buscar la carpeta, con su ícono:
//   Windows: en el Escritorio y en el menú Inicio (abren celular-dev.bat con la ventana minimizada)
//   Mac:     una app en tu carpeta Aplicaciones (~/Applications), que también aparece en Launchpad
//   Linux:   en el menú de aplicaciones y en el Escritorio (archivos .desktop)
// La herramienta se usa desde el panel del navegador, que tiene su botón Cerrar.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { t } from './idioma.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANZADORES = { win32: 'celular-dev.bat', darwin: 'celular-dev.command', linux: 'celular-dev.sh' };
export const LANZADOR = join(raiz, '..', LANZADORES[process.platform] || LANZADORES.linux);
export const ICONO = join(raiz, 'marca', process.platform === 'win32' ? 'icono.ico' : process.platform === 'darwin' ? 'icono.icns' : 'icono.png');

// ---------- Windows ----------

function powershell(guion) {
  return new Promise((resolver, rechazar) => {
    // el guion va codificado para que las rutas con tildes o espacios lleguen intactas
    const codificado = Buffer.from(guion, 'utf16le').toString('base64');
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado], { windowsHide: true });
    let salida = '', error = '';
    p.stdout.on('data', d => { salida += d; });
    p.stderr.on('data', d => { error += d; });
    p.once('error', rechazar);
    p.once('exit', codigo => (codigo === 0 ? resolver(salida.trim()) : rechazar(new Error(error.trim() || `PowerShell: ${codigo}`))));
  });
}

const comillas = texto => `'${String(texto).replace(/'/g, "''")}'`;

// Carpetas del Escritorio y del menú Inicio de este usuario (el Escritorio puede estar en OneDrive).
async function carpetasWindows() {
  const salida = await powershell("[Environment]::GetFolderPath('Desktop'); [Environment]::GetFolderPath('Programs')");
  const [escritorio, inicio] = salida.split(/\r?\n/);
  return [join(escritorio, 'celular-dev.lnk'), join(inicio, 'celular-dev.lnk')];
}

async function crearEnWindows() {
  const rutas = await carpetasWindows();
  await powershell(`
$shell = New-Object -ComObject WScript.Shell
foreach ($ruta in @(${rutas.map(comillas).join(', ')})) {
  $acceso = $shell.CreateShortcut($ruta)
  $acceso.TargetPath = ${comillas(LANZADOR)}
  $acceso.WorkingDirectory = ${comillas(dirname(LANZADOR))}
  $acceso.IconLocation = ${comillas(ICONO + ',0')}
  $acceso.Description = ${comillas(t('accesos.descripcion'))}
  $acceso.WindowStyle = 7
  $acceso.Save()
}`);
  return rutas;
}

// ---------- Mac ----------

const APP_MAC = () => join(homedir(), 'Applications', 'celular-dev.app');

// Una app mínima: un Info.plist, el ícono y un guion que abre celular-dev.command. Como la crea este
// programa (no viene de internet), el Mac la abre sin preguntar.
function crearEnMac() {
  const app = APP_MAC();
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true });
  writeFileSync(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>celular-dev</string>
  <key>CFBundleDisplayName</key><string>celular-dev</string>
  <key>CFBundleIdentifier</key><string>dev.celular-dev.lanzador</string>
  <key>CFBundleExecutable</key><string>celular-dev</string>
  <key>CFBundleIconFile</key><string>icono</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
</dict></plist>
`);
  const guion = join(app, 'Contents', 'MacOS', 'celular-dev');
  writeFileSync(guion, `#!/bin/sh\nexec /bin/sh "${LANZADOR.replace(/"/g, '\\"')}" </dev/null >/dev/null 2>&1\n`);
  chmodSync(guion, 0o755);
  if (existsSync(ICONO)) copyFileSync(ICONO, join(app, 'Contents', 'Resources', 'icono.icns'));
  // que Launchpad y Spotlight la vean enseguida (si no está la herramienta, igual aparece al rato)
  spawnSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app], { stdio: 'ignore' });
  return [app];
}

// ---------- Linux ----------

function escritorioLinux() {
  const r = spawnSync('xdg-user-dir', ['DESKTOP'], { encoding: 'utf8' });
  const ruta = r.status === 0 ? r.stdout.trim() : '';
  return ruta && ruta !== homedir() && existsSync(ruta) ? ruta : [join(homedir(), 'Desktop'), join(homedir(), 'Escritorio')].find(existsSync) || null;
}

const MENU_LINUX = () => join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications', 'celular-dev.desktop');

function crearEnLinux() {
  const contenido = `[Desktop Entry]
Type=Application
Name=celular-dev
Comment=${t('accesos.descripcion')}
Exec="${LANZADOR}"
Icon=${ICONO}
Terminal=false
Categories=Development;
`;
  const rutas = [MENU_LINUX()];
  const escritorio = escritorioLinux();
  if (escritorio) rutas.push(join(escritorio, 'celular-dev.desktop'));
  for (const ruta of rutas) {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, contenido);
    chmodSync(ruta, 0o755);
  }
  // en GNOME, un .desktop del Escritorio no abre hasta marcarlo como confiable
  if (escritorio) spawnSync('gio', ['set', rutas[1], 'metadata::trusted', 'true'], { stdio: 'ignore' });
  return rutas;
}

// ---------- Para todos ----------

export async function hayAccesos() {
  if (process.platform === 'win32') return (await carpetasWindows()).some(existsSync);
  if (process.platform === 'darwin') return existsSync(APP_MAC());
  return existsSync(MENU_LINUX());
}

// Crea (o actualiza) los accesos. Devuelve sus rutas.
export async function crearAccesos() {
  if (!existsSync(LANZADOR)) throw new Error(t('accesos.sinLanzador', { ruta: LANZADOR }));
  if (process.platform === 'win32') return crearEnWindows();
  if (process.platform === 'darwin') return crearEnMac();
  return crearEnLinux();
}
