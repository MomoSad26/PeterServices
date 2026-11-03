# Mapa de dependencias y efectos colaterales

Última actualización: 2026-11-03

Este mapa indica dónde empieza una tarea, qué otras áreas pueden verse afectadas y qué conviene comprobar antes de darla por terminada. No es un grafo exhaustivo: confirma referencias y consumidores en el código actual.

**Estado de pruebas:** el repositorio no tiene actualmente una suite automatizada de pruebas. Las indicaciones siguientes son comprobaciones manuales sugeridas, no tests que ya existan ni pruebas ejecutadas.

## Núcleo compartido

| Si cambia… | Revisa también… | Motivo | Qué comprobar |
|---|---|---|---|
| Nombre visible de divisas | `js/db.js`, `js/balance-base.js`, `js/balance.js`, `js/interfaz.js`, `js/envios.js`, `js/historial.js`, `js/movimientos.js`, `js/deudas.js`, `js/transferencias.js`, `js/panel.js`, `js/busqueda.js`, `js/archivo.js`, `js/xlsx.js`, `js/importacion.js` | `nombre` permanece como clave interna de todas las relaciones; `nombre_visible` se usa solo para presentación. El JSON exporta ambos campos y la importación admite respaldos antiguos sin etiqueta visible. | Renombrar una divisa con/sin movimientos; validar vacío, más de 30 caracteres y duplicados ignorando mayúsculas/tildes; revisar cada selector, tarjetas y balance filtrado/general, historial por divisa, deudas, transferencias, Panel, buscador, historial archivado, Excel y respaldos antiguos/nuevos. Confirmar que los valores persistidos y filtros siguen usando `nombre`. |
| Modelo, campos persistidos, IDs o defaults | `js/db.js`, creadores/editores/lectores, `js/respaldos.js` e importación | Los dispositivos ya contienen datos y respaldos históricos. | Abrir datos existentes, crear/editar un registro, cerrar y reabrir; exportar e importar un respaldo de prueba. |
| Guardado, carga o migración | `js/db.js`, IndexedDB/localStorage y `js/respaldos.js` | Puede afectar a todos los módulos y datos históricos. | Arranque con base existente, migración desde formato anterior y comprobación de registros tras reiniciar. |
| Funciones utilitarias globales | `js/utilidades.js` y todos sus llamadores | Un helper puede utilizarse desde muchas pantallas. | Probar cada caller afectado y al menos un flujo completo que use el helper con valores normales y límites. |
| Cálculo o actualización de saldos | `js/balance-base.js`, `js/balance.js`, operaciones de origen, deudas, panel e historial | Un saldo incorrecto se propaga entre operaciones y resúmenes. | Registrar, editar y eliminar una operación de prueba; comparar balance, deuda, historial y panel antes/después y verificar Deshacer. |
| Operaciones Compra/Ventas | `index.html`, `js/router.js`, `js/movimientos.js`, `js/panel.js`, `js/busqueda.js` | Las listas mantienen formularios, estados de paginación y tablas independientes, pero comparten `#/operaciones`; `operacionesTab` vive en memoria y el topbar refleja la pestaña. El buscador conserva secciones Compra y Ventas separadas. | Entrar por menú (Compra por defecto), alternar pestañas, salir y volver (conservar pestaña), abrir desde Compras/Ventas del Panel, probar cada sección de resultados y Ver todos del buscador, y abrir los alias `#/compras` y `#/ventas`. Confirmar que no se altera ninguna tabla ni cálculo de balance. |
| Rutas, menú, modales o Atrás | `index.html`, `js/router.js`, `js/interfaz.js` y pantalla afectada | La navegación y las capas visuales se gestionan de forma compartida. | Abrir la ruta, entrar a un detalle/modal, volver con Atrás del sistema y del navegador y comprobar el estado/scroll. |
| Clases o estructura visual | `styles.css`, HTML generado por el módulo, responsive y modo oscuro | El CSS se comparte entre pantallas. | Revisar la vista afectada en móvil y escritorio, modo claro y oscuro, y estados vacío/con datos. |
| Script nuevo, eliminado o renombrado | `index.html`, `sw.js` y versión `CACHE` | El orden de carga y la caché offline son independientes. | Confirmar carga sin errores, recarga, instalación/actualización del service worker y apertura offline después de cachear. |
| Controles de fecha (date/datetime-local) | `js/fecha-previa.js`, `styles.css`, campos de formularios y filtros | El controlador observa campos existentes y dinámicos; los eventos input/change notifican a validaciones y listeners. | Probar ◀/▶ en formularios y filtros, date y datetime-local, campo vacío, fin de mes/año, bisiesto y cambio DST; verificar que datetime conserve la hora y que se actualicen los listeners. |
| Exportación/importación | `js/respaldos.js`, modelo en `js/db.js`, `js/xlsx.js` y versiones anteriores | Los formatos existentes deben seguir restaurándose. | Exportar datos ficticios, importar en una instalación de prueba y comparar registros, relaciones y totales; probar archivo inválido/contraseña cuando aplique. |
| Apariencia o ajustes | `prefs.js`, `js/ajustes.js`, `index.html` y puente Android | Las preferencias son locales y algunas se reflejan en Android. | Cambiar tema/color, navegar y reiniciar; comprobar persistencia y barra de estado en APK si el puente está implicado. |
| Actualización/publicación de APK | `android/sync-web.sh`, Gradle, `MainActivity.java`, manifest, workflow y chequeo de Releases en `js/db.js` | Empaquetado, identidad, firma, versión y aviso de actualización están conectados. | Sin compilar: revisar que el workflow siga siendo manual y los cambios no alteren firma/ID. Solo tras autorización de APK: verificar firma, versionCode creciente, instalación encima y aviso de versión. |

## Relaciones por área funcional

| Tarea / área | Archivos de inicio | Dependencias que debes comprobar | Qué comprobar después |
|---|---|---|---|
| Clientes | `js/clientes.js` | `js/db.js`, utilidades, envíos, historial, búsqueda y respaldos | Crear/editar un cliente de prueba; verificar que los envíos e historial sigan mostrando su referencia y que búsqueda lo encuentre. |
| Trabajadores | `js/trabajadores.js` | `js/db.js`, envíos, deudas, búsqueda y respaldos | Crear/editar/desactivar un trabajador; comprobar envíos y deudas históricas vinculadas y búsqueda. |
| Envíos | `js/envios.js`, `js/precio-especial.js` | clientes/trabajadores, destinatarios (`js/entregas.js`), balance-base, deudas, historial y respaldos | Crear y editar un envío de prueba; revisar importe, destinatario, deuda, saldo e historial; eliminar y deshacer. |
| Entregas y Compradores | `js/entregas.js` | envíos, ventas, deudas, compradores, mensajeros y respaldos | Crear/editar/desactivar comprador; verificar búsqueda, datos de contacto históricos y que las ventas/deudas no pierdan su snapshot al desactivarlo. |
| Transferencias Internas | `js/transferencias.js` | `js/db.js`, `js/balance-base.js`, `js/balance.js`, paginación, router, búsqueda, historial por divisa, `js/importacion.js` y `sw.js` | Crear/editar/eliminar con datos ficticios; revisar ambas divisas en balance general/filtrado, dos movimientos en historiales, retorno/scroll, Deshacer de 2 s, búsqueda e importación. Confirmar que una divisa igual o una cantidad no positiva no se guarden y que el origen puede quedar negativo. |
| Ventas, compras, gastos, In/Out | `js/movimientos.js` | db, compradores (`js/entregas.js`), balance-base, deudas, paginación, historial/archivo, panel, búsqueda y respaldos | Crear/editar venta con y sin comprador; verificar snapshot de nombre/contacto, etiqueta en fila, deuda asociada, importes, eliminar y Deshacer; comprobar compras/gastos/In-Out sin regresiones. |
| Deudas | `js/deudas.js` | ventas, compradores, balance-base, mensajeros, WhatsApp, búsqueda e importación | Verificar agrupación solo por comprador + divisa + tipo; deudas sin comprador quedan individuales; una divisa distinta o tipo distinto crea otro grupo; cobro cambia todos los registros una sola vez; eliminación de venta recalcula; préstamo resta al crearse y suma al cobrar; WhatsApp incluye todas las monedas pendientes del comprador y guarda mensajero/fecha. |
| Balance y divisas | `js/balance.js`, `js/balance-base.js`, `js/db.js`, `js/interfaz.js`, `js/importacion.js` | operaciones que registran movimientos, modelo, `js/balance-reorder.js`, panel, historial, reportes y todos los selectores | Editar una divisa desde Balance: cambiar solo el nombre visible con confirmación, comprobar saldo y unicidad; revisar tarjetas generales/filtradas, historial por divisa, envíos, operaciones, gastos, In/Out, deudas, transferencias, Panel, buscador, Excel y respaldos. Confirmar que una relación guardada continúa apuntando al mismo `nombre` interno. |
| Historial y archivo | `js/historial.js`, `js/archivo.js` | envíos/operaciones, deudas, búsqueda, paginación y balance | Archivar/restaurar sin alterar cálculos; eliminar un envío desde detalle, comprobar retorno/scroll y probar Deshacer. |
| Eliminaciones con Deshacer | `eliminarConDeshacer()` y `mostrarToastDeshacer()` en `js/utilidades.js`; callers en clientes, trabajadores, envíos, entregas, deudas y movimientos | cada módulo de origen y efectos en balance/deudas/historial | Eliminar un registro ficticio, usar Deshacer dentro de 5 s y confirmar recuperación íntegra; comprobar que una segunda eliminación respeta la regla documentada. |
| Fechas en formularios y filtros | `js/fecha-previa.js` (control universal) y pantalla que genere el campo | envíos, ventas, compras, gastos, In/Out, deudas, filtro personalizado de Historial y Balance; CSS común | En cada campo, comprobar la disposición ◀ [fecha] ▶ y ambos sentidos; probar date/datetime-local, hora conservada, valores vacíos y fechas límite. |
| Panel Hoy/Ayer | `js/panel.js` | campos/fechas de operaciones, divisas y balance; debe seguir siendo de consulta | Comparar Hoy/Ayer con los registros fuente para ambas fechas y confirmar que abrir el panel no modifica datos. |
| Búsqueda global | `js/busqueda.js` | listados y rutas de clientes, trabajadores, envíos, ventas, compras, gastos y deudas | Buscar registros ficticios por nombre y texto parcial; abrir cada resultado y volver sin perder la navegación. |
| Respaldos e importación | `js/respaldos.js`, `js/importacion.js` | todo el esquema de `js/db.js`, relaciones/IDs, versiones antiguas y `js/xlsx.js` si afecta Excel | Exportar/importar respaldos actuales y antiguos sin las tablas nuevas; comparar registros, compradores, transferencias, IDs relacionados y balance; repetir el mismo respaldo para verificar deduplicación. No usar datos reales en pruebas ni logs. |
| Apariencia | `prefs.js`, `js/ajustes.js` | almacenamiento de preferencias y puente de color Android | Cambiar tema/acento, reiniciar y validar legibilidad en las pantallas principales y en APK si aplica. |

## Flujo de cambio seguro

1. Clasifica la tarea en `PROJECT_MAP.md` y toma el nivel de impacto como orientación para la profundidad de revisión, no como permiso para modificar más archivos.
2. Lee las filas relevantes de este mapa y abre los archivos de inicio y dependencias.
3. Busca referencias de las funciones, campos o clases afectados. Los scripts globales pueden ser llamados desde cualquier otro módulo.
4. Ejecuta las comprobaciones manuales pertinentes con datos ficticios y sin comprometer información existente.
5. Revisa persistencia, balance/deudas, historial/búsqueda, respaldos, carga de scripts, caché offline y/o empaquetado Android según corresponda.
6. Actualiza este mapa o `docs/PROJECT_CONTEXT.md` solo cuando cambie una relación duradera; registra hitos confirmados en `docs/CHANGELOG.md`.

## Límites de este mapa

- No leas todos los módulos por rutina. Empieza por el área y amplía cuando una referencia, contrato o efecto lo justifique.
- No des por hecho que el mapa está completo: el código y sus referencias actuales tienen prioridad.
- No inventes pruebas automatizadas. Describe como manual toda comprobación hecha sin un runner de tests.
- No copies datos reales, secretos, claves de firma ni claves de respaldo a estos documentos.


## Aclaración para Compradores y deudas manuales

Una deuda manual de `Me deben` también se asocia al comprador cuando su nombre normalizado coincide exactamente con el de un comprador existente, aunque no se haya elegido desde el selector. La comprobación de consolidación debe cubrir este caso además de las deudas creadas desde ventas. Al eliminar un grupo con ventas vinculadas, se eliminan esas ventas y se revierten sus efectos para no dejar operaciones huérfanas. En préstamos cobrados, el efecto neto de creación y cobro es cero; la eliminación del grupo no debe descontar nuevamente el monto.
