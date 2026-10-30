# Invariantes del proyecto Remesas

Última actualización: 2026-10-29

Estas reglas protegen datos existentes, cálculos del negocio y la capacidad de instalar actualizaciones. Se deben revisar antes de modificar código funcional, persistencia, navegación, PWA o Android. Si una tarea exige cambiar una de ellas, debe tratarse como una decisión técnica explícita, no como un efecto secundario.

## Datos y compatibilidad

- Los datos del negocio viven en el dispositivo, principalmente en IndexedDB. `js/db.js` conserva compatibilidad con localStorage y realiza las migraciones previstas.
- Nunca borres, reinicies ni sustituyas datos existentes para resolver un defecto. No cambies nombres de campos, IDs o estructuras persistidas sin una migración compatible y reversible.
- Mantén compatibles los respaldos antiguos. Antes de cambiar el esquema o los formatos, revisa exportación/importación y datos ya guardados.
- Las preferencias visuales guardadas por `prefs.js` están separadas del respaldo general; no asumas que se exportan con la base de datos.
- Archivar historial no equivale a eliminar. Los registros archivados siguen participando en cálculos y relaciones.

## Integridad funcional

- Operaciones de envíos, ventas, compras, gastos e In/Out pueden afectar saldos, deudas, historial, panel y búsqueda. Sigue `docs/DEPENDENCY_MAP.md` antes de tocar esos flujos.
- Clientes, trabajadores, destinatarios y mensajeros pueden tener referencias históricas. Comprueba desactivación y eliminación antes de cambiar su comportamiento.
- Mantén `Ajustes` como último elemento del menú principal.
- Mantén el aviso de actualización como decisión de la persona usuaria. Ni la PWA ni la APK deben reemplazar la interfaz en uso sin la confirmación prevista.
- No amplíes la superficie del puente `AndroidBridge` ni expongas métodos nativos a JavaScript sin revisar el impacto de seguridad del WebView.

## JavaScript y PWA

- Los archivos `js/*.js` son scripts clásicos que comparten ámbito global. Conserva el orden de carga en `index.html`; no conviertas módulos a `import/export` como parte de una mejora localizada.
- Todo script nuevo, eliminado o renombrado debe reflejarse en `index.html` y en la lista `FILES` de `sw.js`.
- Al cambiar recursos cacheados, revisa si hay que incrementar `CACHE` para que los dispositivos reciban la versión nueva.
- El flujo principal debe seguir funcionando offline después de la carga y caché inicial. La comprobación de nuevas APK en Android sí requiere conexión.

## Android, firma y datos locales

- Conserva el `applicationId` `com.peterservices.remesas` y la clave de firma existente `android/remesas.keystore`.
- El `versionCode` debe avanzar en cada APK publicada. No retrocedas números ni alteres el cálculo de versión sin revisar también la detección de actualizaciones.
- No regeneres, reemplaces, muevas ni expongas el keystore, su alias o sus contraseñas. No copies credenciales a documentación, issues, logs o respuestas.
- El repositorio contiene el keystore y debe permanecer privado. No cambies su visibilidad como parte de una tarea normal.
- La APK nueva debe estar firmada con la misma clave para poder instalarse encima de la anterior y conservar el acceso a sus datos locales.

## Compilación autorizada únicamente

- `.github/workflows/build-apk.yml` debe tener únicamente el evento `workflow_dispatch`.
- Nunca añadas disparadores automáticos (`push`, `pull_request`, `schedule` u otros) sin autorización expresa.
- No ejecutes el workflow ni compiles/publiques APK si la persona usuaria no lo pidió expresamente.
- Una modificación de documentación o código no funcional no debe generar una APK ni consumir cuota de artefactos.

## Privacidad

No incluyas en documentación, ejemplos, capturas, issues o logs datos identificables de clientes, envíos, destinatarios, saldos, respaldos reales, credenciales ni claves. Usa datos ficticios para ejemplos y pruebas.
