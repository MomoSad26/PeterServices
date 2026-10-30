# Contexto técnico del proyecto Remesas

Última actualización: 2026-10-29

## Producto y arquitectura

Remesas es una aplicación local de gestión de un negocio de remesas: clientes, trabajadores, envíos, entregas, historial, operaciones, divisas, balance, deudas, respaldos y ajustes.

- Aplicación web estática en la raíz: HTML, CSS y JavaScript clásico, sin framework ni proceso de empaquetado.
- Los archivos de `js/` comparten ámbito global y se cargan en el orden declarado en `index.html`.
- La PWA usa `sw.js` para precargar recursos y funcionar offline después de la carga inicial.
- La APK contiene una copia de la web en un WebView. `android/sync-web.sh` actualiza los assets empaquetados; la raíz del repositorio es la fuente web.
- El negocio funciona localmente. Android consulta GitHub Releases para detectar nuevas APK, por lo que ese chequeo necesita conexión.

## Datos y reglas funcionales

- La base principal se guarda en IndexedDB; `js/db.js` conserva compatibilidad y migración desde localStorage.
- Las preferencias visuales se guardan aparte mediante `prefs.js` y no forman parte del respaldo general.
- Envíos, ventas, compras, gastos e In/Out pueden afectar saldos y deudas; sus cambios se reflejan también en historial, panel y búsqueda.
- Los registros archivados se mantienen para cálculos y relaciones.
- La navegación se define en `index.html` y `js/router.js`; Ajustes permanece como último menú.
- Los respaldos manuales/automáticos se gestionan en `js/respaldos.js`. Preserva compatibilidad con los formatos antiguos y no expongas las claves heredadas de respaldo.

## Android y publicación

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
