# Historial breve y línea base

Este documento conserva hitos útiles para futuras sesiones; no sustituye el historial Git ni pretende listar cada cambio. Verifica siempre el código actual antes de asumir que una nota histórica sigue vigente.

## Estado de referencia

- Repositorio principal: `MomoSad26/PeterServices`, rama `main`.
- Última APK publicada verificada al documentar este archivo: `v1.0.124` (27-10-2026).
- Último cambio funcional verificado: commit `5f96f2d` (27-10-2026), ajuste del gesto y controles para reordenar divisas en Balance.
- Commit posterior de configuración CI: `adcb0ec` (28-10-2026), tolerancia al fallo de la subida temporal de artefactos y retención de un día. No fue una compilación de la app.

## Preparación multiagente — 29-10-2026

- Se estableció `AGENTS.md` como fuente común de instrucciones para agentes compatibles.
- Se añadieron entradas específicas para Claude Code (`CLAUDE.md`), GitHub Copilot (`.github/copilot-instructions.md` y reglas por ruta) y Cursor (`.cursor/rules/`).
- Se creó `docs/DEPENDENCY_MAP.md` para identificar los módulos relacionados y los efectos colaterales antes de editar.
- Codex/Cursor/Claude pueden leer sus archivos compatibles. Para ChatGPT con conector GitHub, el procedimiento indicado es recuperar expresamente el contexto; no hay garantía universal de inyección automática.
- Se amplió `paths-ignore` del workflow para que los archivos de instrucciones y mapas de IA (`.md`, `.mdc`, `.cursor/**`, `.github/instructions/**`) no generen compilaciones. No se modificó la app ni se generó APK.

## Nota de automatización

- La primera subida de dos reglas Cursor `.mdc` ocurrió antes de ampliar el filtro y disparó automáticamente las ejecuciones 25 y 26, que publicaron `v1.0.125` y `v1.0.126`. No hubo cambios funcionales en la app. El filtro ampliado quedó guardado después para evitar que los próximos cambios de instrucciones generen APK.

## 29-10-2026 — Eliminar envío desde el detalle

- Al confirmar la eliminación desde `renderEnvioDetalle`, se vuelve a la lista normal de Historial mediante una nueva entrada de ruta; el scroll se restaura con `scrollMemory` del router.
- El toast de Deshacer se estableció en 5 segundos para todas las eliminaciones que usan el helper compartido, en cualquier menú.
- La instantánea anterior a la eliminación restaura el envío, la deuda asociada (incluido su estado original) y todos los saldos. El botón sigue funcionando aunque se navegue a otro menú; otra eliminación reemplaza el deshacer pendiente.
- Archivos: `js/historial.js`, `js/utilidades.js`. No se cambió el modelo persistido ni la configuración del flujo de compilación.
- Nota de CI: los dos archivos JavaScript se guardaron en commits separados y cada push activó Actions automáticamente, pese a que no se solicitó compilar. Las ejecuciones 27 y 28 terminaron correctamente y publicaron `v1.0.127` y `v1.0.128`. Para futuros cambios relacionados, agrupar los archivos de código en un único commit evita ejecuciones duplicadas.

## 29-10-2026 — Deshacer global y compilación APK bajo autorización

- Todas las eliminaciones que utilizan `eliminarConDeshacer()` muestran el toast durante 5 segundos. El detalle del envío usa el mismo valor predeterminado; ya no necesita una excepción.
- El workflow `.github/workflows/build-apk.yml` quedó únicamente con `workflow_dispatch`. Los pushes/commits ya no disparan compilaciones ni publicaciones de APK.
- La APK solo se compila/publica cuando la persona usuaria lo solicita expresamente y se lanza el workflow manualmente. El artefacto temporal conserva retención de un día.
- Archivos principales: `js/utilidades.js`, `js/historial.js`, `.github/workflows/build-apk.yml` y documentación de contexto/dependencias.

## Hitos funcionales confirmados

- **27-10-2026 — Balance:** se añadió reordenamiento táctil de divisas; después se ajustaron los controles y el gesto de pulsación larga de 400 ms. La versión publicada tras esos cambios fue `v1.0.124`.
- **24-10-2026 — Entregas:** menú de destinatarios y mensajeros, selección de destinatario en envíos y opción de avisar al mensajero por WhatsApp desde el flujo de deudas.
- **23-10-2026 — Panel y fechas:** selección Hoy/Ayer en el panel y controles para retroceder un día en campos de fecha.
- **20-10-2026 — WhatsApp:** avisos a cliente o trabajador en flujos de entrega inmediata y precio especial, según las condiciones implementadas.

## Decisiones que se deben preservar

- Mantener la identidad Android y la clave de firma para instalar actualizaciones sin desinstalar ni perder datos.
- Mantener los datos de negocio locales y compatibles entre versiones; respaldos y migraciones deben seguir funcionando.
- No convertir los scripts globales a módulos ni cambiar su orden de carga como parte de una mejora localizada.
- Mantener `Ajustes` como último menú.
- Mantener el aviso de actualización como decisión de la persona usuaria: ni la PWA ni la APK deben reemplazar la interfaz en uso sin el mecanismo de confirmación existente.

## Cómo mantener esta memoria

- Añade una entrada cuando se complete una función relevante, se cambie una regla de negocio o se tome una decisión técnica duradera.
- Incluye fecha, breve efecto visible, archivos principales y commit cuando esté disponible.
- No copies solicitudes completas, conversaciones, datos de clientes, contraseñas ni secretos. Mantén el documento breve; el código y Git siguen siendo la fuente de verdad.
