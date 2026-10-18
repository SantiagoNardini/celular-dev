// Abre la ventana de Windows para elegir una carpeta. El navegador no puede dar la ruta de una carpeta
// (por seguridad, ni arrastrándola), así que la ventana la abre este programa, en la PC.
import { spawn } from 'node:child_process';

const guion = titulo => `
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

// Devuelve la ruta elegida, o null si se canceló o no se puede abrir la ventana.
export function elegirCarpeta(titulo = 'Elegí la carpeta de tu sitio (la que tiene index.html)') {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise(resolver => {
    // el guion va codificado para que las tildes y comillas lleguen intactas
    const codificado = Buffer.from(guion(titulo), 'utf16le').toString('base64');
    const p = spawn('powershell', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado], { windowsHide: true });
    let salida = '';
    p.stdout.on('data', d => { salida += d; });
    p.once('exit', () => resolver(salida.trim() || null));
    p.once('error', () => resolver(null));
  });
}
