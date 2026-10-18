#!/bin/sh
# Doble clic en el Finder para abrir celular-dev en Mac: abre una Terminal y corre celular-dev.sh.
exec /bin/sh "$(cd "$(dirname "$0")" && pwd)/celular-dev.sh" "$@"
