// Abre la ventana del sistema para elegir una carpeta. El navegador no puede dar la ruta de una carpeta
// (por seguridad, ni arrastrándola), así que la ventana la abre este programa, en la PC.
//   Windows: la de Windows Forms, por PowerShell   Mac: la de Finder, por AppleScript
//   Linux:   zenity (GNOME y la mayoría) o kdialog (KDE)
import { spawn } from 'node:child_process';
import { t } from './idioma.mjs';

const guionWindows = titulo => `
Add-Type -AssemblyName System.Windows.Forms
$duena = New-Object System.Windows.Forms.Form
$duena.TopMost = $true
$dialogo = New-Object System.Windows.Forms.FolderBrowserDialog
$dialogo.Description = '${titulo.replace(/'/g, "''")}'
$dialogo.UseDescriptionForTitle = $true
$dialogo.ShowNewFolderButton = $false
if ($dialogo.ShowDialog($duena) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialogo.SelectedPath) }
$duena.Dispose()
`;

// AppleScript: el texto va entre comillas dobles, así que se escapan
const comillasApple = texto => `"${texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function ventanas(titulo) {
  if (process.platform === 'win32') {
    // el guion va codificado para que las tildes y comillas lleguen intactas
    const codificado = Buffer.from(guionWindows(titulo), 'utf16le').toString('base64');
    return [['powershell', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado]]];
  }
  if (process.platform === 'darwin') {
    return [['osascript', ['-e', `POSIX path of (choose folder with prompt ${comillasApple(titulo)})`]]];
  }
  return [
    ['zenity', ['--file-selection', '--directory', `--title=${titulo}`]],
    ['kdialog', ['--getexistingdirectory', process.env.HOME || '/', '--title', titulo]]
  ];
}

function preguntar(programa, args) {
  return new Promise(resolver => {
    const p = spawn(programa, args, { windowsHide: true });
    let salida = '';
    p.stdout.on('data', d => { salida += d; });
    p.once('exit', () => resolver({ ruta: salida.trim().replace(/(.)\/$/, '$1') || null }));
    p.once('error', error => resolver({ falta: error.code === 'ENOENT' }));
  });
}

// Devuelve la ruta elegida, o null si se canceló o no se puede abrir la ventana.
export async function elegirCarpeta(titulo = t('carpeta.tituloSitio')) {
  for (const [programa, args] of ventanas(titulo)) {
    const r = await preguntar(programa, args);
    if (!r.falta) return r.ruta || null;
  }
  return null;
}
