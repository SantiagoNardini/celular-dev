# celular-dev

Probá tu sitio en tu **celular Android real** mientras programás en la PC, sin saber de servidores ni puertos:

- **Elegís qué mostrar** desde un panel en el navegador: una carpeta con tu sitio (no hace falta ningún servidor) o el servidor que ya tengas prendido (Live Server, Vite, `npm run dev`…).
- Lo abre en el Chrome del celular, por cable USB, y lo **recarga solo cada vez que guardás** (o cuando vos quieras).
- Te muestra **los errores del celular explicados en español simple**, agrupados, con el detalle técnico y el archivo y la línea.
- Con un botón arma un **informe para tu IA** (Claude, ChatGPT, Copilot…) con todos los errores, listo para pegar y pedir que los arregle.
- Un **asistente** te guía para preparar el celular (depuración USB, el aviso de «Permitir»).

Sin dependencias: solo Node 22 o más nuevo, y ADB (el panel ofrece instalarlo).

## Instalación

**Con el paquete (para cualquier persona):** bajá `celular-dev-vX.Y.Z-windows.zip` de Releases, descomprimilo y hacé doble clic en `celular-dev.bat`. No hay que instalar nada:

- **Node viene adentro** (`runtime\node.exe`).
- **ADB** (la herramienta oficial de Google para hablar con el celular) **se descarga con un botón** del panel, sin permisos de administrador. Queda en `%LOCALAPPDATA%\celular-dev`, así sobrevive a las actualizaciones. Si ya tenés ADB instalado, se usa ese.
- La primera vez, el panel ofrece **accesos directos** en el Escritorio y en el menú Inicio, con ícono, que abren la ventana minimizada. El panel tiene un botón **Cerrar**.

**Desde el código:** con Node 22+ instalado, doble clic en `celular-dev.bat` igual.

En el celular hace falta **Depuración USB** activada (el asistente del panel explica cómo) y **Google Chrome**.

### Armar el paquete

```bash
npm run empaquetar
```

Baja el Node oficial de nodejs.org (comprobando su huella contra la lista oficial), junta el programa sin pruebas ni scripts, y deja en `../paquete` el ZIP y su huella SHA-256, listos para subir como release.

## Uso

**Doble clic en `celular-dev.bat`** (está al lado de esta carpeta). No hace falta copiar nada a tus proyectos.

Se abre el panel en tu navegador (`http://localhost:47823`). Elegís qué mostrar (una carpeta, una usada antes o un servidor prendido) y seguís todo desde ahí. La ventana negra muestra lo mismo: dejala abierta mientras trabajás.

- Las **capturas, informes y el registro** quedan en `Documentos\celular-dev`.
- Recuerda las **carpetas que usaste**, para elegirlas con un clic la próxima vez.
- Con un **servidor** (Live Server, `npm run dev`…), si no sabe dónde está tu código te lo pregunta una vez, para recargar al guardar, y lo recuerda. Live Server no lo necesita: recarga solo.

También se puede abrir desde una terminal, por ejemplo dentro de un proyecto:

```bash
node ruta/a/celular-dev/bin/celular.mjs
```

Para tener el comando `celular` en cualquier carpeta, una vez dentro de `celular-dev`: `npm link`.

### Opciones

| Opción | Qué hace |
|---|---|
| `--carpeta <ruta>` | Mostrar esa carpeta (la que tiene `index.html`), sin otro servidor |
| `--codigo <ruta>` | Con un servidor: carpeta de tu código, para recargar al guardar |
| `--puerto <n>` | Usar tu servidor local en ese puerto (5173, 3000, 8765, 5500, 4321, 8080 y 4200 se detectan solos) |
| `--ruta <ruta>` | Carpeta del sitio dentro del servidor, por ejemplo `/dist/` (Live Server se detecta solo) |
| `--manual` | Arranca en modo manual: no recarga al guardar |
| `--todo` | Muestra también `console.log` e `info`, no solo errores y avisos |
| `--sin-panel` | Solo terminal: elige solo (tu servidor si hay uno; si no, esta carpeta) |

### Panel

| Botón | Qué hace |
|---|---|
| Recargar | Recarga el sitio en el celular |
| Revisar sitio | Revisa el sitio en el celular: desborde a lo ancho, botones chicos, contraste, imágenes sin alt, texto chico, controles sin nombre, tiempos y peso. Lo encontrado entra en el informe |
| Red del celular | Normal, 3G lenta o sin conexión: simula esa red y recarga, para ver cómo carga en la calle |
| Abrir en el editor | En cada error: abre tu archivo en esa línea, en VS Code (o en el programa que abra ese archivo) |
| Captura | Guarda una captura del sitio en el celular (`.celular/capturas/`) |
| Pasar a manual / en vivo | En vivo recarga al guardar; en manual recargás vos |
| Informe para IA | Guarda el informe en `.celular/` y lo copia, listo para pegar |
| Abrir de nuevo en el celular | Por si cerraste la pestaña |
| Cambiar qué mostrar | Vuelve al inicio para elegir otra carpeta o servidor |

### Teclas en la terminal

`R` recargar · `M` en vivo/manual · `V` revisar sitio · `N` red normal/lenta/sin conexión · `F` captura · `A` abrir de nuevo · `P` abrir el panel · `I` `chrome://inspect` · `L` limpiar · `Q` salir. Mientras se elige qué mostrar: `S` usa el servidor encontrado, `C` esta carpeta.

## Dónde guarda las cosas

Nada en tus proyectos. Todo va a `Documentos\celular-dev`: el registro (`registro.log`), las capturas, los informes y lo que recuerda (`config.json`: carpetas usadas y dónde está el código de cada servidor). El botón «Ver capturas e informes» del panel abre esa carpeta.

## Pruebas

```bash
npm test
```

Corren solas, sin celular ni internet (unas 60, en menos de un segundo): explicaciones de errores, lectura de los avisos de ADB y de Chrome, servidor de carpetas (incluido que no deje salir de la carpeta), ubicar el archivo de un error, detección de servidores, seguridad del panel, informe, revisión y que `celular-dev.bat` tenga saltos de línea de Windows.

`.gitattributes` y `.editorconfig` (al lado de esta carpeta) hacen que git y los editores guarden siempre los `.bat` con saltos de línea de Windows: con los de Linux, el doble clic falla.

## Cómo funciona

- `adb reverse` hace que el `localhost` del celular llegue a la PC: el sitio se ve como en la PC y cuenta como página segura (funcionan cámara, ubicación, service workers).
- Para una carpeta, un servidor propio la sirve en un puerto libre, siempre con la última versión guardada.
- `adb track-devices` avisa cuando el celular se conecta o se desconecta, sin preguntar a cada rato. Si ADB se reinicia, los túneles se rearman solos.
- El protocolo de Chrome DevTools trae los errores y la consola, y permite recargar y sacar capturas.
- El panel escucha solo en tu PC (127.0.0.1) y rechaza pedidos de otras páginas.
- En reposo casi no consume: el servidor se vigila abriendo una conexión al puerto, sin pedirle páginas.
- Una sola copia a la vez; al salir borra solo los túneles que abrió.
