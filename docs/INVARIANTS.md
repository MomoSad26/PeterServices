# Invariantes del proyecto Remesas

Última actualización: 2026-11-03

Estas reglas protegen datos existentes, cálculos del negocio y la capacidad de instalar actualizaciones. Se deben revisar antes de modificar código funcional, persistencia, navegación, PWA o Android. Si una tarea exige cambiar una de ellas, debe tratarse como una decisión técnica explícita, no como un efecto secundario.

## Datos y compatibilidad

- Los datos del negocio viven en el dispositivo, principalmente en IndexedDB. `js/db.js` conserva compatibilidad con localStorage y realiza las migraciones previstas.
- Nunca borres, reinicies ni sustituyas datos existentes para resolver un defecto. No cambies nombres de campos, IDs o estructuras persistidas sin una migración compatible y reversible.
- Mantén compatibles los respaldos antiguos. Antes de cambiar el esquema o los formatos, revisa exportación/importación y datos ya guardados.
- Las preferencias visuales guardadas por `prefs.js` están separadas del respaldo general; no asumas que se exportan con la base de datos.
- Archivar historial no equivale a eliminar. Los registros archivados siguen participando en cálculos y relaciones.
- Las divisas tienen dos nombres con responsabilidades distintas: `nombre` es la clave interna fija usada en todas las relaciones y `nombre_visible` es la etiqueta que se muestra al usuario. Nunca guardes `nombre_visible` en operaciones, deudas, filtros ni relaciones internas; un renombrado solo cambia `nombre_visible`.
- Las bases locales anteriores sin `nombre_visible` deben migrarse asignando `nombre_visible = nombre`. Los respaldos JSON incluyen ambos campos; al importar archivos antiguos se aplica el mismo valor de respaldo. Un conflicto de etiqueta visible no puede cambiar la clave interna ni sobrescribir una etiqueta local personalizada.

## Integridad funcional

- Operaciones de envíos, ventas, compras, gastos e In/Out pueden afectar saldos, deudas, historial, panel y búsqueda. Las transferencias internas restan de la divisa origen y suman a la destino, sin ganancia ni conversión automática. Una edición o eliminación debe revertir exactamente los efectos previos.
- La consolidación de `Me deben` es solo visual: no fusiona ni reemplaza los registros individuales. Se agrupa por comprador (nombre normalizado) + divisa + tipo de deuda; nunca se mezclan divisas ni tipos. El cobro de un grupo marca cada registro una vez y aplica su efecto de balance correspondiente.
- Una venta y su deuda conservan un snapshot del nombre y los datos de contacto del comprador. Desactivar/eliminar un comprador de Entregas no puede borrar la referencia histórica.
- El envío a mensajero es una invitación a WhatsApp con texto preparado, no un envío automático. Al notificar un grupo se incluyen todas las divisas pendientes del comprador y se persiste el último mensajero/fecha en las deudas afectadas.
- La importación debe tolerar respaldos antiguos sin `compradores` ni `transferencias`, remapear IDs referenciados y deduplicar operaciones antes de aplicar efectos incrementales al balance. No cambies la clave/formato de cifrado para añadir tablas.
- Clientes, trabajadores, destinatarios y mensajeros pueden tener referencias históricas. Comprueba desactivación y eliminación antes de cambiar su comportamiento.
- Mantén `Ajustes` como último elemento del menú principal.
- El menú principal tiene 14 entradas; Compras y Ventas se presentan bajo **Operaciones** en la ruta `#/operaciones`, con `operacionesTab` en memoria (`compra` o `ventas`). Sus tablas, lógica, balances y secciones del buscador siguen separadas. Los enlaces heredados `#/compras` y `#/ventas` deben abrir la pestaña correspondiente.
- Mantén el aviso de actualización como decisión de la persona usuaria. Ni la PWA ni la APK deben reemplazar la interfaz en uso sin la confirmación prevista.
- No amplíes la superficie del puente `AndroidBridge` ni expongas métodos nativos a JavaScript sin revisar el impacto de seguridad del WebView.

## JavaScript y PWA
## Navegación y presentación de divisas

- **Operaciones** es una agrupación visual, no una fusión de datos: Compra y Ventas conservan sus registros, formularios, historiales y efectos contables separados. Al entrar por primera vez se selecciona Compra; al alternar pestañas se conserva el estado en memoria de la sesión. El título superior refleja la pestaña activa.
- El nombre visible de una divisa se puede modificar únicamente desde Balance → Editar divisa. Debe ser obligatorio, tener como máximo 30 caracteres y no duplicar otra etiqueta tras normalizar mayúsculas, tildes y espacios. El cambio requiere confirmación explícita.
- Los valores de los selectores y las comparaciones/filtros internos usan siempre `nombre`; las etiquetas, listados, paneles, historiales, búsqueda y reportes muestran `nombre_visible`.


- Los archivos `js/*.js` son scripts clásicos que comparten ámbito global. Conserva el orden de carga en `index.html`; no conviertas módulos a `import/export` como parte de una mejora localizada.
- Todo script nuevo, eliminado o renombrado debe reflejarse en `index.html` y en la lista `FILES` de `sw.js`. Los módulos nuevos deben cargarse después de sus dependencias o usar funciones globales solo después de que el arranque haya cargado todos los scripts.
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


## Compradores, deudas y transferencias (2026-11-01)

- Los snapshots de comprador guardados en ventas/deudas prevalecen sobre datos editados posteriormente en la ficha y mantienen una referencia legible aunque el comprador se desactive.
- Las deudas manuales cuyo nombre normalizado coincide con un comprador se incorporan al mismo grupo comprador + divisa + tipo. No se permite que la agrupación mezcle divisas o tipos distintos.
- Al cobrar una deuda agrupada se procesa cada registro una sola vez. Al eliminar, se revierten los efectos netos: un Préstamo ya cobrado no debe generar un segundo descuento porque su débito inicial y su cobro se compensan.
- Una transferencia interna siempre afecta dos divisas diferentes: resta del origen y suma al destino; los cambios y eliminaciones revierten esos mismos efectos. Nunca produce ganancia ni tasa implícita.
- Los respaldos anteriores que no tengan tablas `compradores` o `transferencias` siguen siendo válidos; la fusión no reemplaza los datos locales ni reutiliza IDs.
