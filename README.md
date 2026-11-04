# Remesas — PeterServices

Última actualización: 2026-11-03

Aplicación local para administrar un negocio de remesas. Incluye una interfaz web progresiva (PWA) y una APK Android que presenta la misma aplicación dentro de un WebView.

## Qué permite gestionar

Clientes, trabajadores, envíos, destinatarios, mensajeros y compradores; **Operaciones** (pestañas Compra y Ventas), gastos, In/Out y transferencias internas; historial, divisas, balance, deudas y respaldos.

## Arquitectura en breve

- **Web:** HTML, CSS y JavaScript clásico, sin framework ni proceso de empaquetado.
- **Datos:** se guardan localmente en el dispositivo mediante IndexedDB, con compatibilidad/migración desde localStorage. Las tablas nuevas de Compradores y Transferencias se incorporan mediante defaults sin reiniciar datos existentes.
- **Operaciones:** el menú lateral reúne Compra y Ventas en la ruta `#/operaciones`, con dos pestañas internas. Las compras y las ventas siguen siendo tablas y procesos separados: se conservan sus formularios, historiales y efectos de balance. Los accesos del Panel y la opción «Ver todos» del buscador abren la pestaña correspondiente; las secciones de búsqueda siguen separadas y cada resultado individual abre su detalle en un modal.
- **Divisas:** cada registro conserva `nombre` como clave interna fija para relaciones y `nombre_visible` como etiqueta editable desde Balance → Editar divisa. Los selectores muestran la etiqueta visible, pero guardan el nombre interno. Los respaldos incluyen ambos campos y los respaldos antiguos se completan usando `nombre` como nombre visible.
- **Cobros:** desde el detalle de un grupo pendiente se puede preparar un mensaje de WhatsApp para un mensajero con todas las divisas pendientes de ese comprador. El envío final se confirma en WhatsApp.
- **PWA:** el service worker precarga los recursos para permitir el uso offline después de la carga inicial.
- **Android:** un WebView carga una copia de los archivos web empaquetada dentro de la APK.
- **Contactos en Android:** los campos de teléfono muestran el botón 👤 dentro del control y abren el selector nativo de números. Solo el número elegido vuelve al campo activo. La normalización se aplica únicamente a contactos seleccionados: elimina caracteres que no sean dígitos, agrega el prefijo `53` a los números que quedan con exactamente 8 dígitos y antepone `+`; la entrada manual permanece intacta.
- **WhatsApp:** los mensajes preparados para cobros y entregas utilizan saltos de línea reales y se codifican una sola vez al construir el enlace.
- **Actualizaciones:** los datos del negocio no se sincronizan con un servidor. La comprobación de nuevas APK consulta GitHub Releases y necesita conexión.

## Documentos para orientarse

| Documento | Para qué sirve |
|---|---|
| [AGENTS.md](AGENTS.md) | Procedimiento común que deben seguir los agentes de IA antes de editar. |
| [docs/INVARIANTS.md](docs/INVARIANTS.md) | Reglas no negociables para proteger datos, navegación, PWA y firma Android. |
| [PROJECT_MAP.md](PROJECT_MAP.md) | Índice de archivos y módulos para encontrar dónde comenzar. |
| [docs/DEPENDENCY_MAP.md](docs/DEPENDENCY_MAP.md) | Dependencias, efectos colaterales y comprobaciones recomendadas. |
| [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) | Resumen técnico duradero de la arquitectura y publicación. |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Hitos confirmados y decisiones técnicas. |

Para Claude Code, Copilot y Cursor también existen entradas compatibles en `CLAUDE.md`, `.github/` y `.cursor/`. Todas remiten a las instrucciones comunes para evitar duplicaciones.

## Ejecutar la versión web localmente

Se necesita Python 3 o cualquier servidor HTTP estático. Desde la raíz del repositorio:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000` en un navegador moderno. `localhost` permite probar el service worker como contexto seguro. Los datos de esa instalación se guardan en el almacenamiento local de ese navegador; no son los datos de la APK ni los de otro dispositivo.

## Compilar e instalar la APK Android

La APK se compila y publica **solo mediante ejecución manual autorizada**. Los commits y pushes no inician compilaciones.

1. Abre [GitHub Actions](https://github.com/MomoSad26/PeterServices/actions/workflows/build-apk.yml).
2. Selecciona **Build APK**.
3. Pulsa **Run workflow**, deja la rama `main` y confirma con el botón verde.
4. Espera a que la nueva ejecución termine correctamente.
5. Descarga `Remesas.apk` desde [la última Release](https://github.com/MomoSad26/PeterServices/releases/latest).

También puedes descargar el artefacto temporal de esa ejecución desde Actions, pero la Release es la opción recomendada para instalar.

Para compilar localmente, con JDK 17 y Gradle 8.14.3 disponibles:

```bash
cd android
./sync-web.sh
gradle assembleRelease
```

La APK local se genera en `android/app/build/outputs/apk/release/app-release.apk`.

## Menú y navegación

El menú lateral contiene 14 entradas. **Operaciones** ocupa la antigua posición de Compras y reúne las pestañas **Compra** y **Ventas** sin unificar sus tablas. Los enlaces antiguos `#/compras` y `#/ventas` se redirigen a `#/operaciones` con la pestaña respectiva.

## Actualizaciones y conservación de datos

Instala la APK nueva encima de la anterior. Para que Android acepte la actualización deben conservarse el identificador `com.peterservices.remesas` y la misma clave de firma; el `versionCode` debe aumentar. No desinstales la aplicación como método normal de actualización: la base de datos vive en el dispositivo y la desinstalación puede borrarla.

Usa **Ajustes → Respaldos** para exportar una copia antes de cambios importantes o de migrar entre instalaciones. La PWA y la APK mantienen sus propios almacenamientos locales; para pasar datos entre ellas utiliza exportar e importar un respaldo.

## Privacidad y seguridad

El funcionamiento del negocio y sus datos son locales. El repositorio contiene actualmente el keystore de firma Android, por lo que debe permanecer **privado**. No publiques el repositorio, no compartas credenciales ni claves, y no incluyas datos reales de clientes, envíos o saldos en issues, documentación o logs.

## Pruebas y validación

Actualmente no hay una suite automatizada de pruebas en el repositorio. Para cambios funcionales, sigue las comprobaciones manuales sugeridas en [docs/DEPENDENCY_MAP.md](docs/DEPENDENCY_MAP.md) y registra con claridad qué se probó realmente. No afirmes que se ejecutaron pruebas automáticas si no existen o no se ejecutaron.
