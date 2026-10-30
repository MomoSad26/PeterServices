# Remesas — instrucciones compartidas para agentes

Remesas es una app local/offline de gestión de remesas: web estática en JavaScript clásico, PWA y APK Android basada en WebView. El usuario necesita preservar los datos locales y poder instalar APK nuevas sobre la anterior.

## Inicio obligatorio
1. Lee `PROJECT_MAP.md` para elegir el área de la tarea.
2. Lee las filas pertinentes de `docs/DEPENDENCY_MAP.md` antes de tocar código compartido o datos.
3. Consulta solo las secciones necesarias de `docs/PROJECT_CONTEXT.md` y `docs/CHANGELOG.md`.
4. Abre el archivo objetivo y sus dependencias/callers directos. No recorras todo el repo por defecto. Si el mapa no cubre un vínculo, busca referencias de los símbolos/campos afectados.

## Invariantes
- `js/*.js` son scripts clásicos con ámbito global: conserva el orden de `index.html`. Todo script nuevo debe figurar en `index.html` y `sw.js`; revisa/incrementa `CACHE` cuando corresponda.
- Datos persistidos viven en dispositivos: preserva esquema anterior, IndexedDB/localStorage, migraciones y compatibilidad de respaldos. No borres ni reinicies datos.
- Operaciones pueden afectar saldos, deudas, historial, búsqueda, panel y respaldos. Sigue `docs/DEPENDENCY_MAP.md` y comprueba los efectos secundarios.
- Conserva `applicationId` Android y la clave de firma existente. Nunca reveles, sustituyas o regeneres keystore, contraseñas ni claves de respaldo.
- Mantén `Ajustes` como último menú. No cambies decisiones de navegación/actualización sin revisar su contexto.
- No compiles ni publiques APK si el usuario no lo pidió. `.github/workflows/build-apk.yml` debe conservar exclusivamente `workflow_dispatch`: nunca agregues `push`, `pull_request`, `schedule` ni otros disparadores automáticos sin autorización expresa. Un commit/push de código por sí solo no debe consumir cuota compilando APK.

## Al terminar
Revisa diff y referencias afectadas; actualiza mapas/contexto/changelog solo cuando la arquitectura, una dependencia o una decisión duradera cambie. Resume archivos modificados, impactos y comprobaciones realizadas.

## Compatibilidad de agentes
- Codex y herramientas compatibles: este `AGENTS.md` es la fuente principal.
- Cursor: carga `AGENTS.md`; reglas específicas por ruta están en `.cursor/rules/*.mdc`.
- Claude Code: usa `CLAUDE.md`, que importa este archivo para evitar duplicación.
- GitHub Copilot: usa `.github/copilot-instructions.md` y las reglas por ruta en `.github/instructions/`.
- ChatGPT con acceso al repositorio: no presupongas que el conector inyecta instrucciones automáticamente. Al iniciar cada tarea, recupera y lee este `AGENTS.md`, luego el mapa y únicamente los archivos pertinentes.
