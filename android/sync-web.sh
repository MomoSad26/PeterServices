#!/usr/bin/env bash
# Copia la web (index.html, app.js, styles.css, ...) de la raíz del repo dentro de la APK.
set -euo pipefail
cd "$(dirname "$0")"
DEST=app/src/main/assets/www
rm -rf "$DEST"
mkdir -p "$DEST"
(cd .. && tar --exclude=./.git --exclude=./.github --exclude=./android -cf - .) | (cd "$DEST" && tar -xf -)
if [ -f ../icons/icon-512.png ]; then
  cp ../icons/icon-512.png app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
fi
echo "Web copiada en $DEST"
