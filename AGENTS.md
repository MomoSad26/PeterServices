# Remesas — instrucciones compartidas para agentes

Última actualización: 2026-10-29

Remesas es una aplicación local/offline de gestión de remesas: web estática en JavaScript clásico, PWA y APK Android basada en WebView.

## Inicio obligatorio

Antes de editar código o configuración:

1. Lee `docs/INVARIANTS.md` y respeta todas sus reglas.
2. Lee `PROJECT_MAP.md` para elegir el área de la tarea.
3. Lee las filas pertinentes de `docs/DEPENDENCY_MAP.md` para identificar relaciones y comprobaciones.
4. Consulta únicamente las secciones necesarias de `docs/PROJECT_CONTEXT.md` y `docs/CHANGELOG.md`.
5. Abre el archivo objetivo y sus dependencias/callers directos. Busca referencias de símbolos o campos si el mapa no cubre una relación. No recorras todo el repositorio por defecto.

## Reglas de trabajo

- El código actual es la fuente de verdad: verifica llamadas, estructuras y efectos antes de asumir que la documentación sigue vigente.
- Mantén los cambios acotados a la tarea. No aproveches una corrección localizada para reescribir módulos no relacionados.
- Antes de terminar, revisa el diff y las referencias afectadas. Actualiza mapas/contexto/changelog solo cuando cambie una relación, una regla o una decisión duradera.
- Distingue entre validaciones ejecutadas, comprobaciones manuales pendientes y pruebas que no existen.

## Compilación y publicación

El workflow `.github/workflows/build-apk.yml` debe conservar exclusivamente `workflow_dispatch`. Nunca agregues `push`, `pull_request`, `schedule` ni otros disparadores automáticos sin autorización expresa. **No compiles ni publiques una APK salvo que la persona usuaria lo solicite expresamente.** Un commit o push de documentación/código no debe consumir cuota compilando APK.

## Compatibilidad de agentes

- Codex y herramientas compatibles: sigue este `AGENTS.md` y `docs/INVARIANTS.md`.
- Cursor: sigue `.cursor/rules/*.mdc` junto con los documentos anteriores.
- Claude Code: usa `CLAUDE.md` como entrada que importa estas instrucciones.
- GitHub Copilot: usa `.github/copilot-instructions.md` y las reglas por ruta de `.github/instructions/`.
- ChatGPT con acceso a GitHub debe recuperar y leer explícitamente `AGENTS.md` y `docs/INVARIANTS.md`; no debe asumir que el conector inyecta automáticamente las instrucciones.
