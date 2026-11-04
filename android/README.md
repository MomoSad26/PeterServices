# Remesas — APK para Android

La APK contiene la aplicación web del repositorio dentro de un Android WebView. La raíz del repositorio es la fuente de los archivos web; `android/sync-web.sh` los copia a los assets de Android antes de compilar.

El uso principal del negocio es local. La app necesita conexión para consultar GitHub Releases y comprobar si existe una APK nueva.

## Selector nativo de contactos

En la APK, los campos `input[type="tel"]` incorporan un botón 👤. Al pulsarlo, `AndroidBridge.pickContact()` comprueba el permiso `READ_CONTACTS` y, si todavía no está concedido, explica el motivo y solicita autorización en tiempo de ejecución. Si se deniega de forma permanente, ofrece abrir los ajustes de la aplicación.

Con el permiso concedido, Android consulta `ContactsContract.CommonDataKinds.Phone.CONTENT_URI` y muestra una lista nativa con búsqueda por nombre o número. Cada fila representa un número, de modo que los contactos con varios teléfonos permiten elegir cualquiera. Solo se leen los nombres y números telefónicos necesarios para seleccionar; no se consultan correos ni direcciones, no se sube la agenda y no se guarda una copia local.

El número elegido se devuelve al campo que abrió el selector y se normaliza al recibirlo: se conservan solo dígitos, se antepone `53` cuando quedan exactamente ocho y siempre se agrega `+`. Los campos escritos manualmente no se modifican. La PWA/navegador no muestra el botón porque no dispone del puente nativo.

## Cómo actualizar la app

1. Los cambios de la aplicación llegan a `main` sin iniciar una compilación automática.
2. Cuando se autorice una nueva APK, abre [Build APK en GitHub Actions](https://github.com/MomoSad26/PeterServices/actions/workflows/build-apk.yml) y pulsa **Run workflow** en la rama `main`.
3. Espera a que la ejecución manual termine correctamente.
4. Descarga `Remesas.apk` desde [la última Release](https://github.com/MomoSad26/PeterServices/releases/latest).

Instala la APK encima de la anterior. Los datos locales se conservan siempre que se mantengan el mismo `applicationId` y la misma clave de firma.

## Notas de compatibilidad y seguridad

- El `applicationId` es `com.peterservices.remesas`.
- La firma (`remesas.keystore`) debe ser siempre la misma; si cambia, Android no permite actualizar encima de la instalación anterior.
- El `versionCode` debe aumentar para cada APK publicada.
- El repositorio contiene el keystore y debe permanecer privado. No copies la clave ni sus credenciales a otros archivos, logs o documentación.
- Para pasar datos entre la PWA del navegador y la APK, usa **Respaldos → Exportar** en el origen y **Respaldos → Importar** en el destino.

## Compilar en local

Necesitas JDK 17 y Gradle 8.14.3. Desde la raíz:

```bash
cd android
./sync-web.sh
gradle assembleRelease
```

La APK se genera en `app/build/outputs/apk/release/app-release.apk`.
