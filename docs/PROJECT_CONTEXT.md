# Contexto técnico del proyecto Remesas

Última actualización: 2026-11-03

## Producto y arquitectura

Remesas es una aplicación local de gestión de un negocio de remesas: clientes, trabajadores, envíos, entregas, compradores, historial, ventas, compras, gastos, In/Out, transferencias internas, divisas, balance, deudas, respaldos y ajustes.

- Aplicación web estática en la raíz: HTML, CSS y JavaScript clásico, sin framework ni proceso de empaquetado.
- Los archivos de `js/` comparten ámbito global y se cargan en el orden declarado en `index.html`.
- La PWA usa `sw.js` para precargar recursos y funcionar offline después de la carga inicial.
- La APK contiene una copia de la web en un WebView. `android/sync-web.sh` actualiza los assets empaquetados; la raíz del repositorio es la fuente web.
- El negocio funciona localmente. Android consulta GitHub Releases para detectar nuevas APK, por lo que ese chequeo necesita conexión.

## Datos y reglas funcionales

- La base principal se guarda en IndexedDB; `js/db.js` conserva compatibilidad y migración desde localStorage.
- Las preferencias visuales se guardan aparte mediante `prefs.js` y no forman parte del respaldo general.
- Envíos, ventas, compras, gastos, In/Out y transferencias internas pueden afectar saldos; los cambios se reflejan en balance, historial por divisa y búsqueda.
- Las transferencias internas registran cantidades origen/destino introducidas manualmente, sin tasa automática ni ganancia. Se reflejan como una salida y una entrada, respectivamente.
- Entregas contiene Destinatarios, Mensajeros y Compradores. Las ventas pueden guardar `comprador_id` y un snapshot histórico de nombre y contacto.
- `js/deudas.js` agrupa virtualmente las deudas pendientes por comprador (nombre normalizado), divisa y tipo. Las filas individuales siguen en `DB.deudas`; cobrar un grupo cambia todos sus integrantes y aplica su efecto de balance una sola vez por registro.
- La notificación a un mensajero desde un grupo de cobro prepara un WhatsApp con todas las divisas pendientes del comprador; la persona usuaria confirma el envío desde WhatsApp. Los mensajes de cobro, entrega y aviso de pago deben usar saltos de línea reales y una sola codificación URL.
- `js/contactos.js` decora automáticamente todos los `input[type="tel"]`, incluso los insertados dinámicamente, con un botón 👤 visible solo cuando existe el puente Android. Conserva el campo activo y recibe `window.onContactoSeleccionado(numero)`. La denegación del permiso no bloquea la entrada manual.
- La normalización aplicada exclusivamente a números seleccionados elimina caracteres no numéricos, convierte exactamente 8 dígitos en `+53` seguido del número, conserva los demás largos y siempre antepone `+`. Una selección vacía o cancelada no cambia el valor; la escritura manual no se normaliza.
- Los registros archivados se mantienen para cálculos y relaciones.
- `js/fecha-previa.js` añade controles ◀/▶ de día a todos los campos editables `date` y `datetime-local`, incluidos los que aparecen dinámicamente en formularios y filtros. Emite eventos `input` y `change`; `datetime-local` conserva su hora y usa aritmética de calendario local.
- El menú lateral contiene 14 entradas. Operaciones ocupa la antigua posición de Compras y usa una sola ruta: `#/operaciones`. `operacionesTab` (`compra`/`ventas`) vive en memoria; Compra abre por defecto y el topbar refleja la pestaña. Los alias `#/compras` y `#/ventas` llevan a la pestaña respectiva. El Panel enlaza cada indicador con su pestaña y el buscador conserva secciones separadas; las tablas y reglas de Compra y Ventas no se fusionan.
- Cada divisa conserva `nombre` como clave interna inmutable y `nombre_visible` como etiqueta editable únicamente desde Balance → Editar divisa. Todas las relaciones, comparaciones y filtros persistidos usan `nombre`; toda presentación usa `nombre_visible`. Las divisas nuevas nacen con ambos nombres iguales y la carga local completa `nombre_visible` ausente con `nombre`.
- Los respaldos JSON incluyen ambos campos de la tabla `divisas`. Al importar respaldos antiguos se asigna `nombre_visible = nombre`; una etiqueta personalizada local prevalece sobre una importada para la misma divisa y las colisiones visibles se evitan sin modificar las claves internas.
- Los respaldos cifrados manuales/automáticos se generan en `js/respaldos.js`; `js/importacion.js` implementa la fusión por tabla, remapeo de IDs y actualización incremental del balance. Las tablas ausentes en respaldos antiguos se ignoran y los formatos antiguos siguen siendo importables.

## Android y publicación

- `MainActivity.java` expone `AndroidBridge.pickContact()`: solicita `READ_CONTACTS` en tiempo de ejecución y, con autorización, consulta `ContactsContract.CommonDataKinds.Phone.CONTENT_URI` para presentar una lista nativa filtrable de nombres y números. Cada número es seleccionable por separado. La consulta se ejecuta localmente y solo lee nombre/teléfono; no guarda copias ni transmite la agenda.
- `applicationId`: `com.peterservices.remesas`.
- Keystore de firma existente: `android/remesas.keystore`. La misma clave debe firmar las actualizaciones; no la reemplaces ni reveles credenciales.
- `versionCode`/`versionName` se derivan del número de ejecución de GitHub Actions; una versión nueva debe poder instalarse encima de la anterior.
- Workflow: `.github/workflows/build-apk.yml`. Tiene únicamente `workflow_dispatch`: no compila por push, pull request ni calendario.
- Al autorizar una compilación manual, el flujo sincroniza la web, usa JDK 17 y Gradle 8.14.3, compila y publica `Remesas.apk` en Releases.
- Descarga directa: `https://github.com/MomoSad26/PeterServices/releases/latest/download/Remesas.apk`.

## Dónde buscar más detalle

- Reglas no negociables y seguridad: `docs/INVARIANTS.md`.
- Archivo inicial por área: `PROJECT_MAP.md`.
- Relaciones, efectos colaterales y comprobaciones manuales: `docs/DEPENDENCY_MAP.md`.
- Instrucciones y procedimiento para agentes: `AGENTS.md`.
- Historial de hitos: `docs/CHANGELOG.md`.

## Validación

El repositorio no contiene actualmente una suite automatizada de pruebas. La validación funcional se realiza con comprobaciones manuales enfocadas al área afectada; consulta `docs/DEPENDENCY_MAP.md` y registra qué se verificó realmente.


## Compradores, deuda virtual y transferencias (2026-11-01)

- La pestaña Compradores se incorpora a Entregas; las ventas y deudas guardan snapshots de nombre, nombre completo, teléfono y dirección para conservar los datos históricos después de desactivar el contacto.
- `Me deben` se agrupa en pantalla por comprador + divisa + tipo, sin convertir los grupos en nuevos registros persistidos. Las deudas manuales se asocian por selección o por coincidencia exacta de nombre normalizado. La notificación a mensajero prepara un único WhatsApp con todas las divisas pendientes del comprador.
- `js/transferencias.js` mantiene movimientos origen/destino como operaciones independientes; el balance filtrado y el historial por divisa reflejan la salida y la entrada con el signo correspondiente. No se calcula tasa ni ganancia.
- `js/importacion.js` implementa la fusión de respaldos, porque la interfaz existente invocaba `mergeImport` sin que estuviera definida en el repositorio. Las tablas nuevas son opcionales para admitir archivos anteriores; los IDs relacionados se remapean y las operaciones se deduplican antes de aplicar importes.
