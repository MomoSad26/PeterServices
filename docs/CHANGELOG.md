# Historial breve y línea base

Este documento conserva hitos útiles para futuras sesiones; no sustituye el historial Git ni pretende listar cada cambio. Verifica siempre el código actual antes de asumir que una nota histórica sigue vigente.

## Estado de referencia

- Repositorio principal: `MomoSad26/PeterServices`, rama `main`.
- Última APK publicada verificada durante esta actualización: `v1.0.129`.
- Último cambio funcional verificado: commit `5f96f2d` (27-10-2026), ajuste del gesto y controles para reordenar divisas en Balance.
- Commit posterior de configuración CI: `e1951c7` (29-10-2026). El workflow conserva únicamente `workflow_dispatch`.

## 2026-10-29 — Mejora de documentación y guía de validación

- Se añadió un README principal en la raíz con descripción del producto, ejecución local, descarga de APK, conservación de datos y enlaces a la documentación.
- Se extrajeron las reglas no negociables a `docs/INVARIANTS.md` para reducir la densidad de `AGENTS.md` y mantener una única referencia para esas reglas.
- Se amplió `PROJECT_MAP.md` con niveles de impacto potencial (no prioridades arbitrarias).
- Se amplió `docs/DEPENDENCY_MAP.md` con comprobaciones manuales sugeridas por área y efectos colaterales que deben contrastarse.
- Se resumió `docs/PROJECT_CONTEXT.md` y se actualizaron las instrucciones de `android/README.md`, que todavía describían la compilación automática por push.
- Se incorporó fecha de última actualización en los documentos de orientación principales.
- No se modificó código de la aplicación, datos, firma, identificador Android ni workflow; no se compiló ni publicó APK.

## Preparación multiagente — 29-10-2026

- Se estableció `AGENTS.md` como fuente común de instrucciones para agentes compatibles.
- Se añadieron entradas específicas para Claude Code (`CLAUDE.md`), GitHub Copilot (`.github/copilot-instructions.md` y reglas por ruta) y Cursor (`.cursor/rules/`).
- Se creó `docs/DEPENDENCY_MAP.md` para identificar módulos relacionados y efectos colaterales antes de editar.
- Para ChatGPT con conector GitHub, el procedimiento es recuperar expresamente el contexto; no hay garantía universal de inyección automática.
- Se amplió `paths-ignore` del workflow para que archivos de instrucciones y mapas de IA no generen compilaciones; después el workflow quedó manual-only. No se modificó la app ni se generó APK en esa tarea.

## Nota de automatización histórica

- Antes de establecer el workflow manual-only, algunas subidas de reglas Cursor y cambios de código dispararon ejecuciones automáticas y publicaron versiones `v1.0.125` a `v1.0.128`. No confundas esas publicaciones históricas con el comportamiento actual: el workflow actual solo se inicia con `workflow_dispatch`.

## 29-10-2026 — Eliminar envío desde el detalle

- Al confirmar la eliminación desde `renderEnvioDetalle`, se vuelve a la lista normal de Historial mediante una nueva entrada de ruta; el scroll se restaura con `scrollMemory` del router.
- El toast de Deshacer se estableció en 5 segundos para todas las eliminaciones que usan el helper compartido.
- La instantánea anterior a la eliminación restaura el envío, la deuda asociada y todos los saldos. El botón sigue funcionando aunque se navegue a otro menú.
- Archivos: `js/historial.js`, `js/utilidades.js`. No se cambió el modelo persistido.

## 29-10-2026 — Deshacer global y compilación APK bajo autorización

- Todas las eliminaciones que utilizan `eliminarConDeshacer()` muestran el toast durante 5 segundos.
- El workflow `.github/workflows/build-apk.yml` quedó únicamente con `workflow_dispatch`. Los pushes/commits ya no disparan compilaciones ni publicaciones de APK.
- La APK solo se compila/publica cuando la persona usuaria lo solicita expresamente y se lanza el workflow manualmente.
- Archivos principales: `js/utilidades.js`, `js/historial.js`, workflow y documentación de contexto/dependencias.

## Hitos funcionales confirmados

- **27-10-2026 — Balance:** se añadió reordenamiento táctil de divisas; después se ajustaron los controles y el gesto de pulsación larga de 400 ms.
- **24-10-2026 — Entregas:** menú de destinatarios y mensajeros, selección de destinatario en envíos y opción de avisar al mensajero por WhatsApp desde el flujo de deudas.
- **23-10-2026 — Panel y fechas:** selección Hoy/Ayer en el panel y controles para retroceder un día en campos de fecha.
- **20-10-2026 — WhatsApp:** avisos a cliente o trabajador en flujos de entrega inmediata y precio especial.

## Cómo mantener esta memoria

- Añade una entrada cuando se complete una función relevante, se cambie una regla de negocio o se tome una decisión técnica duradera.
- Incluye fecha, breve efecto visible, archivos principales y commit cuando esté disponible.
- No copies solicitudes completas, conversaciones, datos de clientes, contraseñas ni secretos. Mantén el documento breve; el código y Git siguen siendo la fuente de verdad.
