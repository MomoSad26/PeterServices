# Instrucciones para agentes

1. Empieza por `PROJECT_MAP.md`; identifica el módulo de la tarea y lee solo ese módulo y sus dependencias directas.
2. Consulta `docs/PROJECT_CONTEXT.md` únicamente para las reglas de arquitectura, datos o publicación que afecten al cambio. Consulta `docs/CHANGELOG.md` para conocer la línea base reciente.
3. No recorras ni leas todo el repositorio por defecto. El código actual es la fuente de verdad: verifica en él cualquier detalle que pueda haber cambiado.
4. JavaScript usa scripts clásicos con ámbito global y orden de carga en `index.html`. No conviertas a módulos ni cambies ese orden sin una migración explícita.
5. Si agregas un archivo JavaScript, inclúyelo en el orden correcto de `index.html` y en la lista de precarga de `sw.js`; revisa también la versión de caché.
6. Preserva los datos locales y la compatibilidad del esquema. No reinicies, reemplaces ni migres datos sin un plan compatible y explícito.
7. Para Android, conserva `applicationId` y la clave de firma existente. Nunca expongas, regeneres ni sustituyas el keystore o credenciales como parte de un cambio rutinario.
8. Actualiza el mapa o el contexto solo cuando cambie arquitectura, comportamiento importante o flujo de publicación. Registra las decisiones relevantes en `docs/CHANGELOG.md`.
9. No compiles ni publiques una APK cuando la usuaria indique que no hace falta. Antes de terminar, revisa el diff y resume archivos y efectos del cambio.
