# Remesas — APK para Android

La web de este repo (index.html, app.js, styles.css...) empaquetada en una APK que corre
en su propio WebView: sin Chrome, sin barra de direcciones y sin internet.

## Cómo actualizar la app
1. Cambia la web (index.html, app.js, styles.css...) y súbela a `main`.
2. GitHub Actions compila la APK sola (~2 min) y la publica en Releases.
3. En el teléfono abre
   https://github.com/momosad26/PeterServices/releases/latest/download/Remesas.apk
   e instálala encima de la anterior. Los datos se conservan.

## Notas
- La firma (`remesas.keystore`) debe ser siempre la misma; si cambia, Android no deja
  actualizar sin desinstalar (y desinstalar borra los datos).
- Para pasar datos desde la PWA de Chrome: en la PWA, Respaldos → Exportar; en la APK,
  Respaldos → Importar.
- Compilar en local: `./sync-web.sh && gradle assembleRelease`.
