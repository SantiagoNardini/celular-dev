#!/bin/sh
# Abre celular-dev en Linux (en Mac se abre con celular-dev.command, que usa este mismo archivo).
# El paquete para repartir trae su propio Node en runtime/ (no hay que instalar nada).
# Si no está, se usa el Node instalado en la PC.
DIR="$(cd "$(dirname "$0")" && pwd)"
# abierto desde el Dock, Launchpad o el menú, el PATH viene corto: se suman los lugares de Homebrew
# y los habituales, para encontrar Node y ADB si están instalados ahí
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin"
export PATH

case "${LC_ALL:-${LANG:-}}" in
  es*) ES=1 ;;
  *) ES= ;;
esac
decir() { if [ -n "$ES" ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
esperar() {
  # solo si hay alguien mirando la terminal (desde el menú de aplicaciones no hay)
  if [ -t 0 ]; then echo; decir "  Tocá Enter para cerrar." "  Press Enter to close."; read -r _; fi
}

NODO="$DIR/runtime/node"
if [ ! -x "$NODO" ]; then
  NODO="$(command -v node 2>/dev/null)"
  if [ -z "$NODO" ]; then
    echo
    decir "  No encontré Node.js en esta computadora. celular-dev lo necesita para funcionar." \
          "  Node.js was not found on this computer. celular-dev needs it to run."
    decir "  Lo más fácil: bajá celular-dev desde su página de descargas (Releases), que ya trae todo." \
          "  Easiest: download celular-dev from its Releases page, which includes everything."
    decir "  O instalá Node 22 o más nuevo desde https://nodejs.org" \
          "  Or install Node 22 or newer from https://nodejs.org"
    esperar
    exit 1
  fi
  if ! "$NODO" -e "process.exit(+process.versions.node.split('.')[0] < 22 ? 1 : 0)"; then
    echo
    decir "  Tu Node.js es muy viejo: celular-dev necesita la versión 22 o más nueva (https://nodejs.org)." \
          "  Your Node.js is too old: celular-dev needs version 22 or newer (https://nodejs.org)."
    esperar
    exit 1
  fi
fi

"$NODO" "$DIR/celular-dev/bin/celular.mjs" "$@"
CODIGO=$?
# si se cerró bien, la ventana se cierra sola; solo con un error espera, para poder leerlo
[ "$CODIGO" -ne 0 ] && esperar
exit $CODIGO
