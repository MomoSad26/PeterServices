# Mapa de dependencias y efectos colaterales

Última actualización: 2026-10-29

Este mapa indica dónde empieza una tarea, qué otras áreas pueden verse afectadas y qué conviene comprobar antes de darla por terminada. No es un grafo exhaustivo: confirma referencias y consumidores en el código actual.

**Estado de pruebas:** el repositorio no tiene actualmente una suite automatizada de pruebas. Las indicaciones siguientes son comprobaciones manuales sugeridas, no tests que ya existan ni pruebas ejecutadas.

## Núcleo compartido

| Si cambia… | Revisa también… | Motivo | Qué comprobar |
|---|---|---|---|
| Modelo, campos persistidos, IDs o defaults | `js/db.js`, creadores/editores/lectores, `js/respaldos.js` e importación | Los dispositivos ya contienen datos y respaldos históricos. | Abrir datos existentes, crear/editar un registro, cerrar y reabrir; exportar e importar un respaldo de prueba. |
| Guardado, carga o migración | `js/db.js`, IndexedDB/localStorage y `js/respaldos.js` | Puede afectar a todos los módulos y datos históricos. | Arranque con base existente, migración desde formato anterior y comprobación de registros tras reiniciar. |
| Funciones utilitarias globales | `js/utilidades.js` y todos sus llamadores | Un helper puede utilizarse desde muchas pantallas. | Probar cada caller afectado y al menos un flujo completo que use el helper con valores normales y límites. |
| Cálculo o actualización de saldos | `js/balance-base.js`, `js/balance.js`, operaciones de origen, deudas, panel e historial | Un saldo incorrecto se propaga entre operaciones y resúmenes. | Registrar, editar y eliminar una operación de prueba; comparar balance, deuda, historial y panel antes/después y verificar Deshacer. |
| Rutas, menú, modales o Atrás | `index.html`, `js/router.js`, `js/interfaz.js` y pantalla afectada | La navegación y las capas visuales se gestionan de forma compartida. | Abrir la ruta, entrar a un detalle/modal, volver con Atrás del sistema y del navegador y comprobar el estado/scroll. |
| Clases o estructura visual | `styles.css`, HTML generado por el módulo, responsive y modo oscuro | El CSS se comparte entre pantallas. | Revisar la vista afectada en móvil y escritorio, modo claro y oscuro, y estados vacío/con datos. |
| Script nuevo, eliminado o renombrado | `index.html`, `sw.js` y versión `CACHE` | El orden de carga y la caché offline son independientes. | Confirmar carga sin errores, recarga, instalación/actualización del service worker y apertura offline después de cachear. |
| Exportación/importación | `js/respaldos.js`, modelo en `js/db.js`, `js/xlsx.js` y versiones anteriores | Los formatos existentes deben seguir restaurándose. | Exportar datos ficticios, importar en una instalación de prueba y comparar registros, relaciones y totales; probar archivo inválido/contraseña cuando aplique. |
| Apariencia o ajustes | `prefs.js`, `js/ajustes.js`, `index.html` y puente Android | Las preferencias son locales y algunas se reflejan en Android. | Cambiar tema/color, navegar y reiniciar; comprobar persistencia y barra de estado en APK si el puente está implicado. |
| Actualización/publicación de APK | `android/sync-web.sh`, Gradle, `MainActivity.java`, manifest, workflow y chequeo de Releases en `js/db.js` | Empaquetado, identidad, firma, versión y aviso de actualización están conectados. | Sin compilar: revisar que el workflow siga siendo manual y los cambios no alteren firma/ID. Solo tras autorización de APK: verificar firma, versionCode creciente, instalación encima y aviso de versión. |

## Relaciones por área funcional

| Tarea / área | Archivos de inicio | Dependencias que debes comprobar | Qué comprobar después |
|---|---|---|---|
| Clientes | `js/clientes.js` | `js/db.js`, utilidades, envíos, historial, búsqueda y respaldos | Crear/editar un cliente de prueba; verificar que los envíos e historial sigan mostrando su referencia y que búsqueda lo encuentre. |
| Trabajadores | `js/trabajadores.js` | `js/db.js`, envíos, deudas, búsqueda y respaldos | Crear/editar/desactivar un trabajador; comprobar envíos y deudas históricas vinculadas y búsqueda. |
| Envíos | `js/envios.js`, `js/precio-especial.js` | clientes/trabajadores, destinatarios (`js/entregas.js`), balance-base, deudas, historial y respaldos | Crear y editar un envío de prueba; revisar importe, destinatario, deuda, saldo e historial; eliminar y deshacer. |
| Entregas | `js/entregas.js` | envíos, deudas (aviso al mensajero), modelo y respaldos | Asignar/cambiar destinatario o mensajero, probar aviso WhatsApp cuando aplique y revisar vínculos tras deshacer. |
| Ventas, compras, gastos, In/Out | `js/movimientos.js` | db, balance-base, deudas cuando aplique, paginación, historial/archivo, panel y respaldos | Registrar, editar y eliminar cada tipo afectado; comparar saldos, deudas, panel e historial. |
| Deudas | `js/deudas.js` | operaciones de origen, balance-base, trabajadores/mensajeros, WhatsApp y respaldos | Crear deuda de prueba, registrar cobro/pago y cerrar; revisar saldo, estado, persona vinculada e historial. |
| Balance y divisas | `js/balance.js`, `js/balance-base.js` | operaciones que registran movimientos, modelo, `js/balance-reorder.js`, panel e historial | Comparar totales por divisa antes/después de operaciones; reordenar divisas, navegar y reabrir para confirmar persistencia. |
| Historial y archivo | `js/historial.js`, `js/archivo.js` | envíos/operaciones, deudas, búsqueda, paginación y balance | Archivar/restaurar sin alterar cálculos; eliminar un envío desde detalle, comprobar retorno/scroll y probar Deshacer. |
| Eliminaciones con Deshacer | `eliminarConDeshacer()` y `mostrarToastDeshacer()` en `js/utilidades.js`; callers en clientes, trabajadores, envíos, entregas, deudas y movimientos | cada módulo de origen y efectos en balance/deudas/historial | Eliminar un registro ficticio, usar Deshacer dentro de 5 s y confirmar recuperación íntegra; comprobar que una segunda eliminación respeta la regla documentada. |
| Panel Hoy/Ayer | `js/panel.js` | campos/fechas de operaciones, divisas y balance; debe seguir siendo de consulta | Comparar Hoy/Ayer con los registros fuente para ambas fechas y confirmar que abrir el panel no modifica datos. |
| Búsqueda global | `js/busqueda.js` | listados y rutas de clientes, trabajadores, envíos, ventas, compras, gastos y deudas | Buscar registros ficticios por nombre y texto parcial; abrir cada resultado y volver sin perder la navegación. |
| Respaldos | `js/respaldos.js` | todo el esquema de `js/db.js`, claves/versiones de formato y `js/xlsx.js` si afecta Excel | Exportar, importar en perfil de prueba y comparar registros/relaciones; no usar datos reales en pruebas ni logs. |
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
