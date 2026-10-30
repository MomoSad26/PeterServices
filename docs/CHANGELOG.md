# Historial breve y línea base

Este documento conserva hitos útiles para futuras sesiones; no sustituye el historial Git ni pretende listar cada cambio. Verifica siempre el código actual antes de asumir que una nota histórica sigue vigente.

## Estado de referencia

- Repositorio principal: `MomoSad26/PeterServices`, rama `main`.
- Última APK publicada verificada al documentar este archivo: `v1.0.124` (27-10-2026).
- Último cambio funcional verificado: commit `5f96f2d` (27-10-2026), ajuste del gesto y controles para reordenar divisas en Balance.
- Commit posterior de configuración CI: `adcb0ec` (28-10-2026), tolerancia al fallo de la subida temporal de artefactos y retención de un día. No fue una compilación de la app.

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
