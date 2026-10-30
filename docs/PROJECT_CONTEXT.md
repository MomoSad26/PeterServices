# Contexto técnico del proyecto

## Producto

Remesas es una herramienta local para gestionar un negocio de remesas: clientes, trabajadores, envíos, destinatarios y mensajeros, historial, ventas, compras, gastos, movimientos In/Out, divisas y balance, deudas, respaldos y ajustes. La interfaz y las rutas se encuentran en `index.html` y `js/router.js`.

## Arquitectura

- Aplicación web estática en la raíz, escrita en JavaScript sin framework ni paso de empaquetado.
- Los archivos de `js/` se cargan como scripts clásicos desde `index.html` y comparten variables/funciones globales. El orden importa; revisa la secuencia de etiquetas `<script>` y los comentarios de dependencia antes de mover código.
- La PWA usa `sw.js` para precargar recursos y servir caché offline. La lista `FILES` debe incluir los recursos nuevos que deban estar disponibles offline. Al cambiar recursos o esa lista, evalúa incrementar `CACHE` para forzar una caché nueva.
- La APK contiene una copia local de la web dentro de un Android WebView. `android/sync-web.sh` copia los archivos de la raíz a `android/app/src/main/assets/www`; esos assets generados no son la fuente primaria.
- El núcleo del negocio funciona localmente. La app Android necesita conexión para consultar GitHub Releases y comprobar si existe una APK nueva; no confundir ese chequeo con almacenamiento remoto de los datos del negocio.

## Datos y compatibilidad

- La base de datos principal se mantiene en el dispositivo mediante IndexedDB; `js/db.js` conserva compatibilidad con localStorage y migra datos antiguos a IndexedDB cuando corresponde.
- El modelo incluye divisas, clientes, trabajadores, envíos, ventas, compras, gastos, In/Out, deudas, destinatarios, mensajeros, países, monedas, secuencias e información general del negocio.
- Las preferencias visuales se guardan aparte en localStorage mediante `prefs.js`; no forman parte de la base de datos ni del respaldo general.
- Hay respaldos manuales y automáticos en `js/respaldos.js`. El formato de respaldo tiene versiones de cifrado. La clave fija heredada usada para abrir respaldos antiguos es una dependencia de compatibilidad: **no cambiarla ni copiar su valor a documentación, logs o mensajes**. Los respaldos protegidos con contraseña dependen de la contraseña elegida por la persona usuaria; perderla puede impedir recuperar esos archivos.
- Al ampliar el esquema, agrega defaults compatibles en `defaultDB()`/normalización y considera datos ya existentes. Nunca asumas que todos los dispositivos tienen una base vacía o la versión más reciente.
- No borres datos ni cambies nombres/IDs persistidos sin migración explícita y reversible.

## Reglas funcionales conocidas

- Envíos, ventas, compras, gastos e In/Out interactúan con saldos y pueden generar o relacionarse con deudas. Antes de alterar cálculos, sigue las funciones compartidas de `balance-base.js` y las reglas de la operación afectada.
- Archivar historial no equivale a eliminar: los registros archivados se ocultan de las listas normales, pero se mantienen para cálculos y relaciones.
- Clientes, trabajadores, destinatarios y mensajeros pueden conservar referencias históricas; revisa el comportamiento de desactivación antes de cambiar eliminaciones.
- `Ajustes` debe permanecer como último elemento del menú principal.
- El reordenamiento de divisas de Balance usa Pointer Events y pulsación larga de 400 ms; revisa `js/balance-reorder.js` antes de cambiar interacción táctil.

## Android: identidad, firma y datos del usuario

Valores que deben permanecer estables en actualizaciones normales:

- `applicationId`: `com.peterservices.remesas`.
- Keystore de firma: `android/remesas.keystore`.
- El esquema Gradle genera `versionCode` y `versionName` usando el número de ejecución de GitHub Actions.

No regeneres, reemplaces, muevas ni cambies el alias/contraseña de la clave de firma en una tarea ordinaria. Android exige que la actualización esté firmada con la misma clave; una firma distinta puede impedir instalar encima de la app existente y poner en riesgo el acceso a sus datos locales. El keystore está actualmente dentro del repositorio privado y la configuración de firma está en Gradle: no publiques el repositorio, no imprimas credenciales y no copies valores sensibles a documentación. Migrar esa configuración a GitHub Secrets requiere una tarea separada, copia de seguridad de la clave y verificación de una APK firmada compatible.

## Compilación y publicación

- Flujo: `.github/workflows/build-apk.yml`.
- Ejecuta en Ubuntu, configura JDK 17 y Gradle 8.14.3, copia la web con `android/sync-web.sh`, ejecuta `gradle assembleRelease` y publica `Remesas.apk` en GitHub Releases.
- La publicación usa tags `v1.0.N`; Gradle deriva el número de versión de `GITHUB_RUN_NUMBER`. No fijes manualmente un número que pueda retroceder ni alteres el cálculo sin revisar también el sistema de detección de actualizaciones.
- La APK más reciente se descarga con el enlace estable: `https://github.com/MomoSad26/PeterServices/releases/latest/download/Remesas.apk`.
- El workflow tiene exclusivamente el disparador `workflow_dispatch`: ningún push, pull request, horario u otro evento debe compilar la APK. Los commits y actualizaciones del repositorio pueden ejecutarse normalmente sin generar APK ni gastar cuota de artefactos. Solo ejecutar el workflow manualmente cuando la persona usuaria autorice expresamente una compilación/publicación.
- La copia temporal de Actions tiene `retention-days: 1` y `continue-on-error: true`; solo se crea cuando la persona usuaria autoriza una compilación manual. No confundir artefactos temporales de Actions con el asset de APK de GitHub Releases.
- Compilación local indicada por el proyecto: desde `android/`, ejecutar `./sync-web.sh && gradle assembleRelease`.

## Instrucciones para agentes de IA

- Fuente común: `AGENTS.md`. Codex la reconoce directamente; Cursor también admite `AGENTS.md`; Claude Code tiene `CLAUDE.md` como entrada que importa el documento común.
- GitHub Copilot usa `.github/copilot-instructions.md` y puede aplicar instrucciones específicas desde `.github/instructions/`.
- Las reglas de Cursor por ruta están en `.cursor/rules/*.mdc`.
- ChatGPT con herramientas/conector GitHub no tiene un mecanismo universal que garantice la carga automática de instrucciones del repositorio. En este proyecto debe recuperar primero `AGENTS.md`, luego `PROJECT_MAP.md` y `docs/DEPENDENCY_MAP.md`, y leer los archivos de código pertinentes. No afirmar que la memoria se cargó automáticamente si no se verificó.
- Procedimiento recomendado: área en `PROJECT_MAP.md` → relaciones en `docs/DEPENDENCY_MAP.md` → solo archivos objetivo y dependencias necesarias → comprobaciones del impacto → actualizar documentación si cambió una decisión duradera.

## Seguridad y alcance de cambios

- El repositorio debe permanecer privado mientras contenga el keystore y configuración sensible.
- No pegues datos reales de clientes, envíos, saldos, respaldos o credenciales en documentación, issues, logs ni respuestas.
- No muevas ni expongas el puente `AndroidBridge` ni amplíes sus métodos sin revisar las implicaciones de seguridad de WebView.
- Una petición de cambio en la web normalmente debe limitarse a los módulos implicados, estilos relacionados y, cuando aplique, caché del service worker. No leer ni reescribir todo el proyecto para un ajuste localizado.
- No compilar, publicar ni generar una APK cuando la solicitud indique expresamente que no hace falta.
