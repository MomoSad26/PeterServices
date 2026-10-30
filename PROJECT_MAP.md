# Mapa del proyecto Remesas

Última actualización: 2026-10-29

Índice de navegación. Lee la sección pertinente; no abras todos los archivos por defecto. Las reglas obligatorias están en `docs/INVARIANTS.md` y las relaciones entre módulos en `docs/DEPENDENCY_MAP.md`.

## Archivos de orientación

- `README.md`: entrada principal para personas y agentes; describe el producto, ejecución local y APK.
- `AGENTS.md`: procedimiento común de trabajo para agentes de IA.
- `docs/INVARIANTS.md`: reglas no negociables de datos, cálculos, PWA, Android y publicación.
- `CLAUDE.md`: entrada de Claude Code que importa `AGENTS.md`.
- `.github/copilot-instructions.md`: instrucciones generales de GitHub Copilot.
- `.github/instructions/`: indicaciones Copilot específicas por tipo de archivo.
- `.cursor/rules/`: indicaciones Cursor específicas por ruta.
- `docs/PROJECT_CONTEXT.md`: contexto técnico duradero.
- `docs/DEPENDENCY_MAP.md`: relaciones, efectos colaterales y validaciones sugeridas.
- `docs/CHANGELOG.md`: hitos y decisiones históricas resumidas.

## Entradas y estructura

- `index.html`: punto de entrada web, menú, rutas visibles y orden de carga de scripts.
- `styles.css`: estilos globales, componentes, temas y diseño adaptable.
- `prefs.js`: preferencias locales de apariencia; se carga en el `head`.
- `js/`: lógica funcional en scripts clásicos que comparten el ámbito global.
- `sw.js`: caché offline/PWA; mantiene su propia lista de archivos y versión de caché.
- `manifest.json`, `icons/`: metadatos e iconos de la PWA.
- `android/`: contenedor Android WebView y configuración de APK.
- `.github/workflows/build-apk.yml`: compilación y publicación manual de APK.

## Mapa funcional de JavaScript

El impacto indica la consecuencia típica de una regresión, no una prioridad para ejecutar tareas. Úsalo para decidir cuánto ampliar la revisión y las comprobaciones.

| Área | Archivo(s) | Empezar aquí cuando… | Impacto típico |
|---|---|---|---|
| Persistencia y modelo | `js/db.js` | cambie esquema, carga, guardado o migración | Crítico: pérdida o corrupción de datos |
| Utilidades | `js/utilidades.js` | cambien formato, búsqueda común, fechas o diálogos | Alto: afecta muchos módulos |
| Cálculo de saldos | `js/balance-base.js`, `js/balance.js` | cambien divisas, saldos o vista Balance | Crítico: importes y resultados del negocio |
| Reordenar divisas | `js/balance-reorder.js` | cambie gesto táctil, orden o controles | Medio: interacción y persistencia del orden |
| Navegación | `js/router.js`, `js/interfaz.js` | cambien rutas, overlays, modales o Atrás | Alto: acceso y estado de pantallas |
| Clientes y trabajadores | `js/clientes.js`, `js/trabajadores.js` | cambien fichas, listados o formularios | Alto: referencias históricas |
| Envíos | `js/envios.js`, `js/precio-especial.js` | cambien formularios o reglas de creación | Crítico: saldos, deudas e historial |
| Entregas | `js/entregas.js` | cambien destinatarios, mensajeros o sus datos | Alto: asignaciones y deudas asociadas |
| Historial | `js/historial.js`, `js/paginacion.js`, `js/archivo.js` | cambien filtros, páginas o archivado | Alto: consulta y recuperación de operaciones |
| Operaciones | `js/movimientos.js` | cambien ventas, compras, gastos o In/Out | Crítico: saldos y deudas |
| Deudas | `js/deudas.js` | cambien creación, cierre, cobro o pago | Crítico: obligaciones y saldos |
| Respaldo y exportación | `js/respaldos.js`, `js/xlsx.js` | cambien importación, exportación, cifrado o Excel | Crítico: recuperación y portabilidad de datos |
| Panel | `js/panel.js` | cambie el resumen operativo Hoy/Ayer | Medio: consistencia de indicadores |
| Búsqueda | `js/busqueda.js` | cambie el buscador global | Medio: acceso a registros |
| Fechas | `js/fecha-previa.js` | cambie control universal para retroceder fechas | Medio: fecha de imputación |
| Apariencia | `js/ajustes.js`, `prefs.js` | cambien ajustes, modo oscuro o color principal | Bajo/medio: presentación y preferencias |

## Orden de carga

Los scripts se cargan en `index.html`, no usan `import/export`. Consulta la secuencia exacta antes de insertar o mover un script.

**Regla de archivos nuevos:** actualizar tanto `index.html` como `sw.js`. Comprueba si corresponde incrementar `CACHE`.

## Navegación principal

Las rutas se declaran en `index.html` y se resuelven en `js/router.js`: Panel, Clientes, Envío, Trabajadores, Entregas, Historial, Compras, Ventas, Gastos, In/Out, Balance, Deudas, Respaldos y Ajustes. `Ajustes` debe permanecer como último elemento.

## Android y publicación

- `android/app/src/main/java/com/peterservices/remesas/MainActivity.java`: WebView y puente JavaScript-Android.
- `android/app/build.gradle.kts`: identidad, versión y firma de la app.
- `android/sync-web.sh`: copia la web raíz a los assets incluidos en la APK.
- `android/README.md`: actualización y compilación local de Android.
- `.github/workflows/build-apk.yml`: JDK/Gradle, construcción y GitHub Release manual.

Para relaciones cruzadas, consulta `docs/DEPENDENCY_MAP.md`. Para contexto técnico y reglas duraderas, consulta `docs/PROJECT_CONTEXT.md` y `docs/INVARIANTS.md`.
