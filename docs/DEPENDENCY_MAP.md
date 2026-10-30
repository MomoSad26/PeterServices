# Mapa de dependencias y efectos colaterales

Este mapa responde a dos preguntas: dónde empieza un cambio y qué otras áreas pueden verse afectadas. Es una guía de navegación, no un grafo estático exhaustivo: confirma referencias, llamadas y consumidores en el código antes de cambiar contratos compartidos.

## Núcleo compartido

| Si cambia… | Revisa también… | Motivo |
|---|---|---|
| Modelo, campos persistidos, IDs o defaults | `js/db.js`, creadores/editores/lectores del registro, `js/respaldos.js`, importación de respaldos | Los dispositivos ya tienen datos; los respaldos deben seguir restaurándose. |
| Guardado, carga o migración | `js/db.js`, IndexedDB/localStorage, exportación/importación en `js/respaldos.js` | Un cambio puede afectar a todos los módulos y a datos históricos. |
| Funciones utilitarias globales | `js/utilidades.js` y todos sus llamadores | El mismo helper puede usarse en varias pantallas. Busca sus referencias antes de alterar firma o resultado. |
| Cálculo o actualización de saldos | `js/balance-base.js`, `js/balance.js`, operaciones de origen, deudas, panel e historial | Un saldo incorrecto puede propagarse entre operaciones y resúmenes. |
| Rutas, menú, modales o Atrás | `index.html`, `js/router.js`, `js/interfaz.js`, pantalla afectada | La navegación y las capas visuales se gestionan de forma compartida. |
| Clases o estructura visual | `styles.css`, HTML generado por el módulo, responsive y modo oscuro | El CSS se comparte; valida otras vistas que reutilicen las mismas clases. |
| Script nuevo, eliminado o renombrado | `index.html`, `sw.js`, versión `CACHE` | El orden de carga y la caché offline son independientes y ambos deben actualizarse. |
| Exportación/importación | `js/respaldos.js`, modelo en `js/db.js`, `js/xlsx.js`, compatibilidad con versiones previas | Los formatos existentes y los datos antiguos deben continuar funcionando. |
| Apariencia o ajustes | `prefs.js`, `js/ajustes.js`, `index.html`, puente Android para color de barra | Las preferencias son locales al dispositivo y algunas se reflejan en Android. |
| Actualización/publicación de APK | `android/sync-web.sh`, Gradle, `MainActivity.java`, manifest, workflow, chequeo de Releases en `js/db.js` | Empaquetado web, identidad, firma, versión y aviso de actualización están conectados. |

## Relaciones por área funcional

| Tarea / área | Archivos de inicio | Dependencias que debes comprobar |
|---|---|---|
| Clientes | `js/clientes.js` | `js/db.js`, `js/utilidades.js`, `js/envios.js`, `js/historial.js`, `js/busqueda.js`, respaldos |
| Trabajadores | `js/trabajadores.js` | `js/db.js`, `js/envios.js`, `js/deudas.js`, búsqueda, respaldos |
| Envíos | `js/envios.js`, `js/precio-especial.js` | clientes/trabajadores, destinatarios (`js/entregas.js`), `js/balance-base.js`, `js/deudas.js`, historial, respaldos |
| Entregas | `js/entregas.js` | `js/envios.js`, `js/deudas.js` (aviso al mensajero), modelo y respaldos |
| Ventas, compras, gastos, In/Out | `js/movimientos.js` | `js/db.js`, balance-base, deudas cuando aplique, paginación, historial/archivo, panel y respaldos |
| Deudas | `js/deudas.js` | registros de origen (envíos/ventas y otros), balance-base, trabajadores/mensajeros, WhatsApp, respaldos |
| Balance y divisas | `js/balance.js`, `js/balance-base.js` | módulos que registran operaciones, modelo, `js/balance-reorder.js`, panel e historial |
| Historial y archivo | `js/historial.js`, `js/archivo.js` | envíos y operaciones, deudas, búsqueda, paginación, balance |
| Panel Hoy/Ayer | `js/panel.js` | campos/fechas de operaciones, divisas, balance; debe seguir siendo de consulta |
| Búsqueda global | `js/busqueda.js` | listados y rutas de clientes, trabajadores, envíos, ventas, compras, gastos y deudas |
| Respaldos | `js/respaldos.js` | todo el esquema de `js/db.js`, claves/versiones de formato y `js/xlsx.js` si afecta a Excel |
| Apariencia | `prefs.js`, `js/ajustes.js` | almacenamiento de preferencias y puente de color Android |

## Flujo de cambio seguro

1. Clasifica la tarea por área en `PROJECT_MAP.md`.
2. Lee esta fila del mapa y abre solo los archivos de inicio y dependencias pertinentes.
3. Busca las referencias de las funciones, campos o clases que vas a cambiar. Los scripts globales pueden ser llamados desde cualquier otro módulo.
4. Antes de cerrar, revisa los efectos colaterales: datos persistidos, balance/deudas, historial/búsqueda, respaldos, carga de scripts, caché offline y/o empaquetado Android, según corresponda.
5. Actualiza este mapa o `docs/PROJECT_CONTEXT.md` solo cuando cambie una relación duradera. Registra hitos y decisiones en `docs/CHANGELOG.md`.

## Reglas para no sobredimensionar el contexto

- No leas todos los módulos por rutina. Comienza por el mapa, después por la tarea y sus relaciones.
- Amplía la lectura únicamente cuando una referencia, contrato, efecto colateral o prueba lo justifique.
- No des por hecho que el mapa está completo: el código actual y las referencias encontradas tienen prioridad.
- No copies datos reales, secretos, claves de firma ni claves de respaldo a estos documentos.
