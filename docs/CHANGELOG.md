## 2026-11-14 — Reorganización del formulario de envío

- Se reordenaron los campos de alta y edición: fecha/hora, cliente o trabajador, importe enviado, moneda, precio, referencia de entrega, destinatarios, cotización, ganancias y descuento al pagar.
- Se incorporó «Cantidad a entregar» como total de referencia calculado por cantidad enviada × precio, ajustable manualmente y sin divisa. No se suma, valida ni compara con los splits y no se guarda como dato contable.
- El resumen previo al guardado muestra el nuevo orden, todos los destinatarios y las ganancias adicionales. Se actualizó el texto del botón para agregar otra divisa de ganancia.
- Se mantienen las validaciones, fórmulas de ganancia, creación de deudas, switch de descuento y lógica de balance. Caché PWA remesas-v37. No se compiló APK.

## 2026-11-14 — Entregas divididas y ganancias en varias divisas

- **Entregas por destinatario:** un envío puede registrar varias entregas, cada una con destinatario, cantidad, divisa e identificador propio. Con descuento inmediato, cada split afecta su divisa; con descuento pendiente, se crea una deuda independiente por entrega.
- **Pagos de entregas:** cada deuda queda vinculada al split correspondiente. Al pagar o eliminar, el ajuste del balance se calcula con la divisa de esa entrega, evitando repetir el descuento cuando ya está representado por la ganancia principal.
- **Ganancias adicionales:** un envío puede registrar ingresos adicionales por importe, divisa y forma de cobro. Se reflejan en balance general y filtrado, historial de movimientos, Panel, buscador y Excel.
- **Edición y avisos:** editar un envío sincroniza sus deudas sin perder los pagos existentes; las notificaciones de mensajero se guardan por entrega y se limpian al duplicar un envío.
- **Importación:** al fusionar respaldos, se traducen los identificadores de cada entrega junto con el ID del envío, para conservar la relación entre las deudas y sus destinatarios.
- **PWA:** caché actualizada a `remesas-v36`. Se ampliaron las pruebas automáticas para cubrir dos destinatarios, ganancias adicionales y pagos por split. No se compiló APK.

# Historial breve y línea base

## 2026-11-13 — Pruebas automáticas, mejoras de uso y limpieza

- **Pruebas:** nueva carpeta `tests/` (Playwright, datos ficticios) y workflow manual `tests.yml`. Cubre archivos/caché, rutas, envíos, deudas, gastos, ventas, respaldos, Panel y Ajustes.
- **Error corregido en la importación de respaldos** (lo detectaron las pruebas): dos operaciones idénticas del mismo minuto —por ejemplo un envío y su duplicado— se importaban como una sola y la deuda de la segunda quedaba enlazada al envío equivocado. Ahora cada registro local solo se empareja con un registro del archivo; reimportar el mismo respaldo sigue sin duplicar.
- **Mensaje al mensajero (Pagar a):** el monto lleva separador de miles y divisa (`💰 8,200 CUP efectivo`), igual que el de cobros.
- **Ajustes → Acerca de la app:** versión instalada y botón «Buscar actualizaciones», que consulta en el momento sin esperar las 6 horas.
- **Teléfonos:** todo campo `type="tel"` avisa si el número no tiene código de país; solo advierte, no modifica ni bloquea.
- **Panel:** fila «Pendientes de más de 7 días» cuando hay deudas viejas.
- **Limpieza:** `js/movimientos.js` se dividió en `ventas.js`, `compras.js`, `gastos.js` e `in-out.js` sin cambiar lógica; se eliminó la copia muerta de `mergeImport` en `js/archivo.js` (la vigente está en `js/importacion.js`).
- **Documentación:** Deshacer dura 5 s en todos los módulos; se reparó la sección «JavaScript y PWA» de `INVARIANTS.md`. Caché PWA `remesas-v35`. No se compiló ni publicó APK.

## 2026-11-06 (tarde) — Causa real: deudas sin comprador en «Me deben» no abrían su detalle

- La corrección anterior (`remesas-v33`) solo cambió cómo se identifican los **grupos**; el fallo reportado seguía ocurriendo. Causa real: `obtenerGruposMeDebenEstado()` envolvía cada deuda **sin comprador** en un objeto `{key, items, monto, divisa…}` que no copiaba `id`, `fecha`, `estado` ni el resto de campos. `deudaRowHtml()` dibujaba la fila con ese envoltorio, así que salía `data-id="undefined"` y el toque no encontraba ninguna deuda.
- Afectaba a las deudas manuales de «Me deben» de los tres tipos (Informativo, Préstamo, Sumar al cobrar), a las ya cobradas en Historial y a cualquier deuda de venta sin comprador. «Pagar a» no agrupa y por eso funcionaba; las ventas con comprador se muestran como grupo, que tiene su propio identificador.
- Solución: el envoltorio individual lleva todos los campos de la deuda (`{...d, key, items:[d], …}`). La agrupación por comprador + divisa + tipo no cambia.
- Comprobado en navegador con datos ficticios: los tres tipos abren el detalle; cobrar (Sumar al cobrar +monto; Préstamo devuelve lo restado), eliminar con Deshacer, abrir desde Historial y grupos por comprador siguen funcionando; sin errores JS en ninguna ruta. Caché PWA `remesas-v34`. No se compiló ni publicó APK.

## 2026-11-06 — Apertura estable del detalle de deudas agrupadas

- Las filas agrupadas de «Me deben» e Historial identifican el grupo mediante el ID de una deuda integrante, en lugar de depender de reconstruir una clave compuesta guardada en el HTML.
- Al pulsar se vuelve a localizar el grupo desde los registros actuales; si ya no existe como grupo, se abre el detalle del registro individual como alternativa. Se conservan la agrupación, el cobro, la eliminación con Deshacer y el envío al mensajero.
- Se incrementó la caché PWA a `remesas-v33`. No se cambió el esquema persistido, los saldos, la firma Android ni el workflow; no se compiló ni publicó APK.

## 2026-11-03 — Corrección de compilación del selector de contactos

- El primer build de Android tras añadir `READ_CONTACTS` detectó que `pickContact()` estaba dentro de la clase interna `Bridge` y la referencia `this::solicitarPermisoYMostrarAgenda` buscaba el método en `Bridge`, aunque pertenece a `MainActivity`.
- Se corrigió la delegación usando `MainActivity.this` explícitamente. La solicitud runtime del permiso y la consulta local de la agenda permanecen sin cambios.
- Se verificó la referencia y la existencia del método en el código fuente; no se ejecutó una nueva compilación Gradle en esta corrección.


## 2026-11-03 — Corrección del selector: permiso READ_CONTACTS y agenda local

- Se sustituyó el intento de abrir un proveedor externo con `ACTION_PICK` por una consulta de contactos dentro de la APK. Así la selección ya no depende de que el dispositivo tenga una aplicación que resuelva el intent MIME específico de números.
- Se añadió `READ_CONTACTS` al Manifest y su solicitud en tiempo de ejecución al pulsar 👤. Antes de pedirlo se explica el uso; si se deniega permanentemente, se ofrece abrir Ajustes. Los campos siguen permitiendo entrada manual.
- Con autorización, `MainActivity` consulta de forma asíncrona `Phone.CONTENT_URI` y presenta una lista nativa con búsqueda; muestra cada número en una fila separada. Solo consulta nombres y teléfonos para seleccionar, sin subirlos ni guardarlos como datos de la app.
- Se mantiene la normalización del número seleccionado y el retorno al campo activo. Se incrementó la caché PWA a `remesas-v32`.
- No se modificaron el esquema de negocio, la firma, el `applicationId`, el keystore ni el workflow. No se compiló APK; queda pendiente la prueba en un dispositivo Android real.


## 2026-11-03 (noche) — Selector nativo de contactos y corrección de WhatsApp

- Se agregó el botón 👤 a todos los campos `input[type="tel"]`, incluidos los formularios insertados dinámicamente. Solo aparece en la APK cuando está disponible `AndroidBridge.pickContact()`; en la web/PWA sin puente permanece oculto.
- Android abre el selector del sistema con `ACTION_PICK` y `Phone.CONTENT_TYPE`. Se eligió acceso temporal al número seleccionado en lugar de solicitar `READ_CONTACTS`, para no requerir permiso de lectura de la agenda completa.
- El número seleccionado se devuelve al campo activo y se normaliza: solo dígitos; exactamente 8 dígitos reciben el prefijo `53`; cualquier longitud conserva sus dígitos; siempre se agrega `+`. Los valores vacíos/cancelados y la entrada manual quedan intactos.
- Se corrigió `mensajeCobroParaMensajero()`: el separador literal `\\n` se sustituyó por saltos de línea reales. Los otros flujos revisados ya usaban saltos reales y codificaban una sola vez con `encodeURIComponent()`.
- Se agregó `js/contactos.js` a `index.html` y `sw.js`; la caché PWA cambió a `remesas-v31`. No hubo cambios de esquema, datos persistidos, identidad/firma Android ni workflow.
- No se compiló ni publicó APK. Queda pendiente la validación manual del selector, permisos/retornos y apertura de WhatsApp en un teléfono Android real.


## 2026-11-03 — Operaciones unificadas y nombres visibles de divisas

- Compras y Ventas comparten el menú y la ruta `#/operaciones` con pestañas en memoria; sus tablas, formularios, efectos de balance, historial y secciones del buscador permanecen separados. Se conservan alias para enlaces `#/compras` y `#/ventas`.
- Las divisas distinguen `nombre` interno fijo de `nombre_visible` editable. Los selectores conservan el nombre interno en el valor y presentan el nombre visible; el cambio se confirma desde Balance → Editar divisa.
- Las bases locales anteriores reciben `nombre_visible = nombre` al cargarse. La importación respeta el nombre visible del respaldo si no existe personalización local ni colisión; el respaldo JSON incluye ambos campos sin cambiar su formato.
- Se incrementó la caché PWA a `remesas-v30`. No se modificaron datos de operaciones, identidad/firma Android ni workflow; no se compiló APK.
- Se alinearon `README.md`, `docs/INVARIANTS.md`, `PROJECT_MAP.md`, `docs/DEPENDENCY_MAP.md` y `docs/PROJECT_CONTEXT.md` con la navegación y el modelo de nombres visible/interno.
- Commit funcional publicado en `main`: `afb58505d2c48e8ea6693c1f77e974f90ffa6ab8`.


## 2026-11-01 — Compradores, deudas consolidadas y Transferencias Internas

- Entregas incorpora la pestaña Compradores con ficha, búsqueda y desactivación reversible; Ventas permite asignar/cambiar comprador y conserva una copia histórica de los datos de contacto.
- «Me deben» agrupa visualmente por comprador + divisa + tipo, conserva cada deuda individual y permite cobrar el grupo completo. WhatsApp al mensajero incluye todas las divisas pendientes del comprador y registra la última notificación.
- Se añadió Transferencias Internas con cantidades introducidas manualmente, validación de divisas distintas, paginación, detalle/edición/eliminación con Deshacer de 2 segundos y reflejo en balance, historial por divisa y búsqueda.
- Se implementó `js/importacion.js` para la fusión JSON/RMB, que faltaba en el código previo aunque la pantalla de Respaldos ya la invocaba. Soporta tablas nuevas opcionales, remapeo de IDs y deduplicación sin reemplazar la base local.
- Se incrementó la caché PWA a `remesas-v29`. No se modificaron la firma Android, el identificador de aplicación ni el workflow; no se compiló APK.

Este documento conserva hitos útiles para futuras sesiones; no sustituye el historial Git ni pretende listar cada cambio. Verifica siempre el código actual antes de asumir que una nota histórica sigue vigente.

## Estado de referencia

- Repositorio principal: `MomoSad26/PeterServices`, rama `main`.
- Última APK publicada verificada durante esta actualización: `v1.0.129`.
- Último cambio funcional verificado: commit `5f96f2d` (27-10-2026), ajuste del gesto y controles para reordenar divisas en Balance.
- Commit posterior de configuración CI: `e1951c7` (29-10-2026). El workflow conserva únicamente `workflow_dispatch`.

## 2026-10-30 — Adelantar un día en todos los campos de fecha

- Se añadió el botón `▶` a la derecha de cada campo `date` y `datetime-local`, manteniendo `◀` a la izquierda.
- El controlador universal también cubre campos insertados dinámicamente, como formularios y filtros personalizados de Historial y Balance.
- Ambos sentidos usan `Date.setDate()` en calendario local, sin sumar milisegundos; `datetime-local` conserva la hora y los botones notifican mediante eventos `input` y `change`.
- Los campos vacíos parten de la fecha/hora local actual; no se aplican límites para avanzar ni retroceder.
- Se actualizó el estilo táctil común y la caché PWA a `remesas-v27`.
- Archivos: `js/fecha-previa.js`, `styles.css`, `sw.js` y mapas/contexto de documentación.

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
