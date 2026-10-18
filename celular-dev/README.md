# celular-dev

Probá tu sitio en tu **celular Android real** mientras programás en la computadora (Windows, Mac o Linux), sin saber de servidores ni puertos:

- **Elegís qué mostrar** desde un panel en el navegador: una carpeta con tu sitio (no hace falta ningún servidor) o el servidor que ya tengas prendido (Live Server, Vite, `npm run dev`…).
- Lo abre en el Chrome del celular, por cable USB, y lo **recarga solo cada vez que guardás** (o cuando vos quieras).
- **Ves la pantalla del celular en vivo en el panel, y la usás desde ahí**: tocar, arrastrar, la rueda del mouse y el teclado llegan al celular.
- Te muestra **los errores del celular explicados en lenguaje simple**, agrupados, con el detalle técnico y el archivo y la línea (y un botón para abrirlo en el editor).
- Con un botón arma un **informe para tu IA** (Claude, ChatGPT, Copilot…) con todos los errores, listo para pegar y pedir que los arregle.
- Un **asistente** te guía para preparar el celular, con una animación de cada pantalla que hay que recorrer (activar la depuración USB, el aviso de «Permitir»). Los pasos se tildan solos. La primera vez que todo funciona, un aviso te invita a tocar el celular desde el panel.
- En **inglés o español**: arranca en inglés; el botón «Español» del panel lo cambia y lo recuerda (o `--idioma es`).

Sin dependencias: solo Node 22 o más nuevo, y ADB (el panel lo descarga con un botón).

## Instalación

**Con el paquete (para cualquier persona):** bajá el de tu sistema de la sección **Releases** del proyecto en GitHub, descomprimilo y abrí el lanzador. No hay que instalar nada: Node viene adentro (`runtime/`).

| Sistema | Paquete | Para abrirlo |
|---|---|---|
| Windows | `celular-dev-vX.Y.Z-windows.zip` | Doble clic en `celular-dev.bat` |
| Mac con chip Apple (M1 en adelante) | `celular-dev-vX.Y.Z-mac-arm.zip` | Doble clic en `celular-dev.command`. La primera vez: clic derecho > Abrir, y confirmá (no está firmado) |
| Mac con Intel | `celular-dev-vX.Y.Z-mac-intel.zip` | Igual que el anterior |
| Linux (64 bits) | `celular-dev-vX.Y.Z-linux.tar.gz` | `./celular-dev.sh` (o doble clic, si tu explorador de archivos lo permite) |

- **ADB** (la herramienta oficial de Google para hablar con el celular) **se descarga con un botón** del panel, sin permisos de administrador. Queda fuera de la carpeta del programa, así sobrevive a las actualizaciones (`%LOCALAPPDATA%\celular-dev` en Windows, `~/Library/Application Support/celular-dev` en Mac, `~/.local/share/celular-dev` en Linux). Si ya tenés ADB instalado, se usa ese.
- La primera vez, el panel ofrece **accesos directos** con ícono: en el Escritorio y el menú Inicio (Windows), en Aplicaciones y Launchpad (Mac), o en el menú de aplicaciones y el Escritorio (Linux).
- **Linux:** para que ADB pueda usar el USB hacen falta las reglas de Android (en Ubuntu y Debian: `sudo apt install android-sdk-platform-tools-common`). Si faltan, el asistente lo explica.

**Desde el código:** con Node 22+ instalado, abrí el lanzador de tu sistema igual.

En el celular hace falta **Depuración USB** activada (el asistente del panel explica cómo) y **Google Chrome**.

## Uso

Abrí el lanzador. Se abre el panel en tu navegador (`http://localhost:47823`). Elegís qué mostrar (una carpeta, una usada antes o un servidor prendido) y seguís todo desde ahí. La ventana de la terminal muestra lo mismo: dejala abierta mientras trabajás (o cerrá todo con el botón **Cerrar** del panel).

- Las **capturas, informes y el registro** quedan en `Documentos/celular-dev`.
- Recuerda las **carpetas que usaste**, para elegirlas con un clic la próxima vez.
- Con un **servidor** (Live Server, `npm run dev`…), si no sabe dónde está tu código te lo pregunta una vez, para recargar al guardar, y lo recuerda. Live Server no lo necesita: recarga solo.
- **Arrastrar una carpeta** hasta el panel (en la pantalla de inicio) la muestra. El navegador no dice dónde está una carpeta que se arrastra, solo su nombre y lo que tiene adentro: celular-dev la busca en el Escritorio, Documentos, Descargas y tus carpetas de proyectos, y la reconoce por su contenido. Si hay varias iguales, te deja elegir; si no la encuentra, abre la ventana para elegirla.
- **Avisa si el celular no se actualizó** después de guardar: si la pantalla está apagada o Chrome quedó en segundo plano, el panel lo dice (y distingue la pantalla apagada). En modo manual avisa que hay cambios sin recargar; con Live Server, si conoce tu carpeta de código, vigila que el celular se recargue.

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
| `--idioma <es\|en>` | Idioma del panel y los mensajes. Si no se pasa: el elegido en el panel; si nunca se eligió, inglés |

### Panel

| Botón | Qué hace |
|---|---|
| El celular (a la derecha) | La pantalla en vivo. Clic para tocar, arrastrar para deslizar, la rueda para bajar; con clic en la imagen, lo que escribís (o pegás) va al celular |
| La dirección (debajo del celular) | La página que tiene abierta el celular ahora, como la barra de un navegador: se puede copiar o abrir en la computadora para compararla. Se pone en ámbar si el celular salió del sitio que elegiste |
| Pantalla (debajo del celular) | Simula otro tamaño de pantalla en el celular: 320×568, 360×640, 375×667… Los toques usan esas medidas. Chrome solo dibuja lo que cabe en la pantalla física, así que los tamaños más grandes que la de tu celular (una tablet, el celular de costado) aparecen en gris. Se vuelve al tamaño normal al cerrar |
| Recargar | Recarga el sitio en el celular |
| Revisar sitio | Revisa el sitio en el celular: desborde a lo ancho, botones chicos, contraste, imágenes sin alt, texto chico, controles sin nombre, tiempos y peso. Lo encontrado entra en el informe |
| Red del celular | Normal, 3G lenta o sin conexión: simula esa red y recarga, para ver cómo carga en la calle |
| Abrir en el editor | En cada error: abre tu archivo en esa línea, en VS Code (o en el programa que abra ese archivo) |
| Captura | Guarda una captura del sitio en el celular |
| Pasar a manual / en vivo | En vivo recarga al guardar; en manual recargás vos |
| Informe para IA | Guarda el informe y lo copia, listo para pegar |
| Abrir de nuevo en el celular | Por si cerraste la pestaña |
| Cambiar qué mostrar | Vuelve al inicio para elegir otra carpeta o servidor |
| English / Español | Cambia el idioma (y lo recuerda) |

El espejo solo trabaja mientras mirás el panel: con la pestaña en segundo plano o minimizada, el celular deja de mandar imágenes. Mientras tocás o deslizás recibe imágenes livianas y rápidas; cuando la pantalla se queda quieta (unos 0,3 s), llega una imagen nítida a la resolución completa del celular, que se lee mucho mejor.

### Teclas en la terminal

`R` recargar · `M` en vivo/manual · `V` revisar sitio · `N` red normal/lenta/sin conexión · `F` captura · `A` abrir de nuevo · `P` abrir el panel · `I` `chrome://inspect` · `L` limpiar · `Q` salir. Mientras se elige qué mostrar: `S` usa el servidor encontrado, `C` esta carpeta.

## Dónde guarda las cosas

Nada en tus proyectos. Todo va a `Documentos/celular-dev`: el registro (`registro.log`), las capturas, los informes y lo que recuerda (`config.json`: carpetas usadas, dónde está el código de cada servidor, el idioma). El botón «Ver capturas e informes» del panel abre esa carpeta.

## Desarrollo

### Pruebas

```bash
npm test
```

Corren solas, sin celular ni internet (unas 100, en un par de segundos). Además de cada pieza por separado (explicaciones, avisos de ADB y de Chrome, servidor de carpetas, ubicar el archivo de un error, seguridad del panel, informe, revisión, lanzadores, paquetes), prueban **el programa entero con un celular simulado** (`test/simulados.mjs`: un ADB y un Chrome de mentira, con los mismos métodos y eventos): arrancar, el aviso de «Permitir», errores, recargar al guardar, desconexiones y reconexiones sin túneles sueltos, el espejo y los toques, el panel, el idioma, servidores que se caen, la descarga de ADB y salir limpio.

También revisan que **los dos idiomas tengan los mismos textos** y que cada texto que usa el código exista.

En GitHub, las pruebas corren solas en Windows, Mac y Linux con cada cambio (`.github/workflows/pruebas.yml`).

### Textos e idiomas

Todo lo que se muestra está en `src/textos/es.mjs` y `src/textos/en.mjs`, con la misma clave. En el código: `t('clave', { datos })`; en el panel, `tr('clave')` con los textos de `panel`. Para sumar un idioma: copiá `en.mjs`, traducilo y agregalo en `src/idioma.mjs`.

### Cómo está armado

- `bin/celular.mjs` lee las opciones y arranca.
- `src/app/` es el programa: `index.mjs` (arranque y salida), `estado.mjs` (lo que dibuja el panel), `sitio.mjs` (qué mostrar), `conexion.mjs` (celular y Chrome), `acciones.mjs` (botones y teclas), `espejo.mjs`, `frescura.mjs` (¿se actualizó el celular?), `tamanos.mjs` (tamaños de pantalla) y `teclas.mjs`. Recibe ADB, Chrome, el panel y el sistema por parámetro (`deps`): así las pruebas usan los simulados.
- `src/` tiene las piezas: `adb.mjs`, `chrome.mjs`, `panel.mjs` (+ `panel/`), `estatico.mjs`, `vigia.mjs`, `consola.mjs`, `explicar.mjs`, `revision.mjs`, `informe.mjs`, `editor.mjs`, `carpeta.mjs`, `accesos.mjs`, `instalar-adb.mjs`, `lugares.mjs`, `sistema.mjs`, `idioma.mjs`, `pantalla.mjs`.

### Armar los paquetes y publicar una versión

```bash
npm run empaquetar
```

Arma los paquetes de Windows, Mac (chip Apple e Intel) y Linux en `../paquete`, cada uno con su huella SHA-256. Baja el Node oficial de nodejs.org (comprobando su huella contra la lista oficial) y junta el programa sin pruebas ni scripts. Los ZIP y `.tar.gz` se arman sin programas de afuera (`scripts/archivos.mjs`), con el permiso de ejecución puesto. Para uno solo: `npm run empaquetar -- windows` (o `mac-arm`, `mac-intel`, `linux`).

Para publicar una versión en GitHub: cambiá `version` en `package.json`, subí el cambio y después la etiqueta. GitHub corre las pruebas, arma los paquetes y los publica en Releases (`.github/workflows/version.yml`):

```bash
git tag v0.3.1
git push origin v0.3.1
```

`.gitattributes` y `.editorconfig` (al lado de esta carpeta) hacen que git y los editores guarden siempre `celular-dev.bat` con saltos de línea de Windows, y `celular-dev.sh` y `celular-dev.command` con los de Linux: al revés, el doble clic falla.

## Cómo funciona

- `adb reverse` hace que el `localhost` del celular llegue a la computadora: el sitio se ve como en la computadora y cuenta como página segura (funcionan cámara, ubicación, service workers).
- Para una carpeta, un servidor propio la sirve en un puerto libre, siempre con la última versión guardada.
- `adb track-devices` avisa cuando el celular se conecta o se desconecta, sin preguntar a cada rato. Si ADB se reinicia, los túneles se rearman solos.
- El protocolo de Chrome DevTools trae los errores y la consola, y permite recargar, sacar capturas, mandar la pantalla en vivo (`Page.startScreencast`), simular otro tamaño de pantalla (`Emulation.setDeviceMetricsOverride`) y los toques (`Input.dispatchTouchEvent`). El panel lee el flujo de imágenes y las dibuja en un `<canvas>`: con un `<img>`, Chrome muestra cada imagen recién cuando empieza la siguiente, y con la pantalla quieta la última (la nítida) no se vería.
- El panel escucha solo en tu computadora (127.0.0.1) y rechaza pedidos de otras páginas.
- En reposo casi no consume: el servidor se vigila abriendo una conexión al puerto, sin pedirle páginas; y el espejo, a unas 12 imágenes por segundo como mucho, solo mientras alguien mira.
- Una sola copia a la vez; al salir borra solo los túneles que abrió.
