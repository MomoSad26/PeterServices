# Mapa del proyecto Remesas

Índice de navegación. Lee la sección pertinente; no abras todos los archivos por defecto. El mapa de relaciones entre módulos está en `docs/DEPENDENCY_MAP.md`.

## Archivos de orientación para IA

- `AGENTS.md`: instrucciones comunes, invariantes y procedimiento de trabajo. Primera lectura para Codex, Cursor y agentes compatibles.
- `CLAUDE.md`: entrada de Claude Code que importa `AGENTS.md`.
- `.github/copilot-instructions.md`: instrucciones generales de GitHub Copilot.
- `.github/instructions/`: indicaciones Copilot específicas por tipo de archivo.
- `.cursor/rules/`: indicaciones Cursor específicas por ruta.
- `docs/PROJECT_CONTEXT.md`: contexto técnico duradero.
- `docs/DEPENDENCY_MAP.md`: relaciones y efectos colaterales entre áreas.
- `docs/CHANGELOG.md`: hitos y decisiones históricas resumidas.
- ChatGPT con acceso GitHub debe leer `AGENTS.md` explícitamente; el conector no garantiza que el archivo se inyecte por sí solo.

## Entradas y estructura

- `index.html`: punto de entrada web, menú, rutas visibles y orden de carga de scripts.
- `styles.css`: estilos globales, componentes, temas y diseño adaptable.
- `prefs.js`: preferencias locales de apariencia; se carga en el `<head>`.
- `js/`: lógica funcional en scripts clásicos que comparten el ámbito global.
- `sw.js`: caché offline/PWA; mantiene su propia lista de archivos y versión de caché.
- `manifest.json`, `icons/`: metadatos e iconos de la PWA.
- `android/`: contenedor Android WebView y configuración de APK.
- `.github/workflows/build-apk.yml`: compilación y publicación automatizadas.

## Mapa funcional de JavaScript

| Área | Archivo(s) | Empezar aquí cuando… |
|---|---|---|
| Persistencia y modelo | `js/db.js` | cambie el esquema, carga, guardado o migración de datos |
| Utilidades | `js/utilidades.js` | cambien formato, búsqueda común, fechas o diálogos reutilizables |
| Cálculo de saldos | `js/balance-base.js`, `js/balance.js` | cambien divisas, saldos o vista Balance |
| Reordenar divisas | `js/balance-reorder.js` | cambie el gesto táctil, orden o controles de divisas |
| Navegación | `js/router.js`, `js/interfaz.js` | cambien rutas, overlays, modales o navegación Atrás |
| Clientes y trabajadores | `js/clientes.js`, `js/trabajadores.js` | cambien sus fichas, listados o formularios |
| Envíos | `js/envios.js`, `js/precio-especial.js` | cambien formularios o reglas de creación de envíos |
| Entregas | `js/entregas.js` | cambien destinatarios, mensajeros o sus datos |
| Historial | `js/historial.js`, `js/paginacion.js`, `js/archivo.js` | cambien filtros, páginas o archivado |
| Operaciones | `js/movimientos.js` | cambien ventas, compras, gastos o In/Out |
| Deudas | `js/deudas.js` | cambien creación, cierre, cobro o pago de deudas |
| Respaldo y exportación | `js/respaldos.js`, `js/xlsx.js` | cambien importación, exportación, cifrado o Excel |
| Panel | `js/panel.js` | cambien el resumen operativo Hoy/Ayer |
| Búsqueda | `js/busqueda.js` | cambie el buscador global |
| Fechas | `js/fecha-previa.js` | cambie el control universal para retroceder fechas |
| Apariencia | `js/ajustes.js`, `prefs.js` | cambien ajustes, modo oscuro o color principal |

## Orden de carga

Los scripts se cargan en `index.html`, no usan `import/export`. El orden actual comienza con `db.js`, utilidades, balance-base, interfaz y router; después carga los módulos de cada área. Consulta la lista exacta en `index.html` antes de insertar o mover un script.

**Regla de archivos nuevos:** actualizar tanto `index.html` como `sw.js`. Comprueba si corresponde incrementar el identificador `CACHE` del service worker.

## Navegación principal

Las rutas de menú se declaran en `index.html` y se resuelven en `js/router.js`: Panel, Clientes, Envío, Trabajadores, Entregas, Historial, Compras, Ventas, Gastos, In/Out, Balance, Deudas, Respaldos y Ajustes. La regla visible en `index.html` es mantener Ajustes como último elemento.

## Android y publicación

- `android/app/src/main/java/com/peterservices/remesas/MainActivity.java`: WebView y puente JavaScript-Android.
- `android/app/build.gradle.kts`: identidad, versión y firma de la app.
- `android/sync-web.sh`: copia la web raíz a los assets incluidos en la APK.
- `.github/workflows/build-apk.yml`: JDK/Gradle, construcción y GitHub Release.

Para relaciones cruzadas, consulta `docs/DEPENDENCY_MAP.md`. Para reglas de compatibilidad, datos, firma y publicación, consulta `docs/PROJECT_CONTEXT.md`.
