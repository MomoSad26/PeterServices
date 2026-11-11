# Arquitectura real de PeterServices — Remesas

Última revisión del código: 2026-11-10

Este documento representa la estructura y las relaciones observables en la rama principal del repositorio. Se basa en los puntos de entrada, rutas, llamadas entre funciones, almacenamiento y puentes de plataforma existentes. No pretende convertir cada lectura de una variable global en una flecha: los scripts clásicos comparten el ámbito global y acceden directamente al objeto DB.

## 1. Aplicación web: entrada, navegación y módulos funcionales

El usuario entra por index.html. El router interpreta las rutas y llama a los renderizadores. El diagrama agrupa bajo un mismo nodo los archivos que implementan una misma sección, pero conserva los nombres reales y distingue las pantallas de menú de las rutas auxiliares.

~~~mermaid
flowchart TD
  user(("Usuario"))
  index["Entrada y estructura visual<br/>index.html"]
  router["Enrutador y arranque<br/>js/router.js"]

  subgraph screens["Vistas y módulos funcionales"]
    panel["Panel<br/>js/panel.js"]
    search["Buscador general<br/>js/busqueda.js"]
    clients["Clientes<br/>js/clientes.js"]
    workers["Trabajadores<br/>js/trabajadores.js"]
    shipments["Envíos<br/>js/envios.js"]
    special["Precio especial<br/>js/precio-especial.js"]
    deliveries["Entregas<br/>js/entregas.js"]
    history["Historial de envíos<br/>js/historial.js"]
    operations["Operaciones, Gastos e In/Out<br/>js/movimientos.js"]
    transfers["Transferencias internas<br/>js/transferencias.js"]
    balance["Balance y movimientos por divisa<br/>js/balance.js"]
    debts["Deudas<br/>js/deudas.js"]
    backups["Respaldos<br/>js/respaldos.js"]
    settings["Ajustes<br/>js/ajustes.js"]
  end

  subgraph shared["Servicios compartidos"]
    ui["Modales, selectores y componentes de interfaz<br/>js/interfaz.js"]
    utils["Formato, fechas, avisos y deshacer<br/>js/utilidades.js"]
    paging["Paginación común<br/>js/paginacion.js"]
    date["Controles de fecha dinámicos<br/>js/fecha-previa.js"]
    contacts["Botón y callback de contactos<br/>js/contactos.js"]
    balanceCore["Cálculo y actualización de saldos<br/>js/balance-base.js"]
    reorder["Extensión de orden del Balance<br/>js/balance-reorder.js"]
    archive["Archivar / ver / restaurar registros<br/>js/archivo.js"]
    importer["Fusión de respaldos<br/>js/importacion.js"]
    excel["Reporte ejecutivo Excel<br/>js/xlsx.js"]
  end

  db["Datos globales y persistencia<br/>js/db.js"]
  idb[("IndexedDB<br/>almacenamiento principal")]
  ls[("localStorage<br/>compatibilidad y respaldo alternativo")]

  user --> index
  index -->|"hash, menú y contenido"| router

  router -->|"#/panel"| panel
  router -->|"#/busqueda (botón Buscar)"| search
  router -->|"#/clientes y detalles"| clients
  router -->|"#/trabajadores y detalles"| workers
  router -->|"#/envio-trabajador/:id"| workers
  router -->|"#/envio"| shipments
  router -->|"#/precio-especial"| special
  router -->|"#/entregas"| deliveries
  router -->|"#/historial"| history
  router -->|"#/operaciones, #/gastos, #/in-out"| operations
  router -->|"#/transferencias"| transfers
  router -->|"#/balance"| balance
  router -->|"#/deudas"| debts
  router -->|"#/respaldos"| backups
  router -->|"#/ajustes"| settings

  clients -->|"abre formulario con cliente precargado"| shipments
  workers -->|"detalle navega a #/envio-trabajador/:id"| router
  workers -->|"el formulario reutiliza wireEnvioForm"| shipments
  shipments -->|"elige destinatario"| deliveries
  operations -->|"selecciona comprador para una venta"| deliveries
  shipments -->|"crea deuda cuando el cobro queda pendiente"| debts
  operations -->|"puede crear deuda asociada a venta"| debts
  debts -->|"elige mensajero para notificar cobros"| deliveries
  backups -->|"archivar / ver archivados"| archive
  backups -->|"importar y fusionar datos"| importer
  backups -->|"exportar reporte ejecutivo"| excel
  reorder -->|"envuelve y amplía renderBalance"| balance
  contacts -.->|"añade selector a teléfonos en APK"| clients
  contacts -.->|"añade selector a teléfonos en APK"| workers
  contacts -.->|"añade selector a teléfonos en APK"| deliveries
  date -.->|"observa campos de fecha, incluidos los dinámicos"| screens

  panel -.->|"accesos a secciones"| router
  search -.->|"abre resultados y listas filtradas"| router

  clients -->|"lee / guarda"| db
  workers -->|"lee / guarda"| db
  shipments -->|"lee / guarda"| db
  deliveries -->|"lee / guarda"| db
  history -->|"consulta y modifica envíos"| db
  operations -->|"lee / guarda"| db
  transfers -->|"lee / guarda"| db
  balance -->|"calcula a partir de los registros"| db
  debts -->|"lee / guarda"| db
  backups -->|"exporta / importa"| db
  excel -->|"lee datos para el reporte"| db
  special -->|"lee / guarda envíos especiales"| db
  archive -->|"marca o restaura archivado"| db
  importer -->|"fusiona registros y remapea IDs"| db
  panel -.->|"lee indicadores"| db
  search -.->|"busca en varias tablas"| db

  shipments -->|"aplica efectos contables"| balanceCore
  special -->|"aplica efectos del envío especial"| balanceCore
  operations -->|"ajusta saldos"| balanceCore
  transfers -->|"resta origen y suma destino"| balanceCore
  debts -->|"aplica cobros y pagos"| balanceCore
  history -->|"revierte efectos al editar / eliminar envío"| balanceCore
  balance -->|"usa cálculos comunes"| balanceCore

  panel -.-> utils
  search -.-> utils
  history -.-> paging
  operations -.-> paging
  transfers -.-> paging
  debts -.-> paging
  shipments -.-> ui
  deliveries -.-> ui
  clients -.-> ui
  workers -.-> ui

  db -->|"preferido"| idb
  db -->|"fallback y migración"| ls

  click index "https://github.com/MomoSad26/PeterServices/blob/main/index.html" "Abrir index.html"
  click router "https://github.com/MomoSad26/PeterServices/blob/main/js/router.js" "Abrir router.js"
  click panel "https://github.com/MomoSad26/PeterServices/blob/main/js/panel.js" "Abrir panel.js"
  click search "https://github.com/MomoSad26/PeterServices/blob/main/js/busqueda.js" "Abrir busqueda.js"
  click clients "https://github.com/MomoSad26/PeterServices/blob/main/js/clientes.js" "Abrir clientes.js"
  click workers "https://github.com/MomoSad26/PeterServices/blob/main/js/trabajadores.js" "Abrir trabajadores.js"
  click shipments "https://github.com/MomoSad26/PeterServices/blob/main/js/envios.js" "Abrir envios.js"
  click special "https://github.com/MomoSad26/PeterServices/blob/main/js/precio-especial.js" "Abrir precio-especial.js"
  click deliveries "https://github.com/MomoSad26/PeterServices/blob/main/js/entregas.js" "Abrir entregas.js"
  click history "https://github.com/MomoSad26/PeterServices/blob/main/js/historial.js" "Abrir historial.js"
  click operations "https://github.com/MomoSad26/PeterServices/blob/main/js/movimientos.js" "Abrir movimientos.js"
  click transfers "https://github.com/MomoSad26/PeterServices/blob/main/js/transferencias.js" "Abrir transferencias.js"
  click balance "https://github.com/MomoSad26/PeterServices/blob/main/js/balance.js" "Abrir balance.js"
  click debts "https://github.com/MomoSad26/PeterServices/blob/main/js/deudas.js" "Abrir deudas.js"
  click backups "https://github.com/MomoSad26/PeterServices/blob/main/js/respaldos.js" "Abrir respaldos.js"
  click settings "https://github.com/MomoSad26/PeterServices/blob/main/js/ajustes.js" "Abrir ajustes.js"
  click db "https://github.com/MomoSad26/PeterServices/blob/main/js/db.js" "Abrir db.js"
  click balanceCore "https://github.com/MomoSad26/PeterServices/blob/main/js/balance-base.js" "Abrir balance-base.js"
  click reorder "https://github.com/MomoSad26/PeterServices/blob/main/js/balance-reorder.js" "Abrir balance-reorder.js"
  click archive "https://github.com/MomoSad26/PeterServices/blob/main/js/archivo.js" "Abrir archivo.js"
  click importer "https://github.com/MomoSad26/PeterServices/blob/main/js/importacion.js" "Abrir importacion.js"
  click excel "https://github.com/MomoSad26/PeterServices/blob/main/js/xlsx.js" "Abrir xlsx.js"
  click contacts "https://github.com/MomoSad26/PeterServices/blob/main/js/contactos.js" "Abrir contactos.js"
  click idb "https://developer.mozilla.org/docs/Web/API/IndexedDB_API" "Referencia de IndexedDB"
  click ls "https://developer.mozilla.org/docs/Web/API/Window/localStorage" "Referencia de localStorage"

  classDef entry fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#172554
  classDef screen fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f
  classDef support fill:#e0e7ff,stroke:#4f46e5,stroke-width:1.5px,color:#312e81
  classDef storage fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d
  classDef actor fill:#f8fafc,stroke:#334155,stroke-width:1.5px,color:#0f172a
  class user actor
  class index,router entry
  class panel,search,clients,workers,shipments,special,deliveries,history,operations,transfers,balance,debts,backups,settings screen
  class ui,utils,paging,date,contacts,balanceCore,reorder,archive,importer,excel support
  class db,idb,ls storage
~~~

### Cómo interpretar las conexiones

- Las flechas desde router.js representan los casos de ruta que efectivamente existen en route(). No todas corresponden a una entrada del menú.
- El menú lateral contiene 14 entradas. Buscar abre la ruta auxiliar #/busqueda desde el botón de la barra superior; Precio especial también es una ruta, pero no una entrada independiente del menú.
- Operaciones, Gastos e In/Out comparten movimientos.js. La ruta #/operaciones presenta pestañas Compra y Ventas; las otras dos rutas muestran sus listados correspondientes. Compartir archivo no significa que Compra y Ventas compartan tablas.
- Historial significa Historial de envíos: historial.js lista y abre el detalle de los envíos. No es un historial unificado de todas las operaciones.
- Entregas agrupa tres pestañas internas: Destinatarios, Mensajeros y Compradores. Por eso los formularios de envíos y ventas consultan ese mismo módulo para seleccionar las personas correspondientes.
- Deudas conserva registros individuales; el agrupamiento de Me deben es una presentación virtual. Las deudas pueden relacionarse con envíos, ventas y compradores.
- archivo.js no es una ruta ni una pantalla del menú: aporta los diálogos para archivar y ver/restaurar registros, invocados desde Respaldos.
- Los módulos de negocio trabajan con el objeto global DB y llaman a save() cuando corresponde. Las flechas hacia db.js representan persistencia/consulta local, no peticiones a un servidor.
- balance-base.js contiene operaciones compartidas de cálculo y ajuste; balance.js presenta el balance e historial por divisa. balance-reorder.js amplía el render del Balance.
- interfaz.js, utilidades.js, paginacion.js y fecha-previa.js son infraestructura transversal: varios módulos llaman a sus funciones globales. No se dibujó una flecha por cada llamada para evitar convertir el esquema en un inventario ilegible.

## 2. Persistencia, PWA, Android y servicios externos

La versión web y la APK utilizan la misma aplicación JavaScript. La PWA instala un Service Worker; la APK empaqueta los archivos web y los abre dentro de un WebView con funciones nativas expuestas mediante AndroidBridge.

~~~mermaid
flowchart TD
  source["Web estática del repositorio<br/>index.html · styles.css · prefs.js · js/"]
  bootstrap["bootstrap() en js/router.js"]
  sw["Service Worker<br/>sw.js"]
  pwaManifest["Metadatos de instalación PWA<br/>manifest.json"]
  cache[("Caché offline de recursos")]
  sync["Sincronización de archivos web<br/>android/sync-web.sh"]
  assets[("Assets web dentro de la APK<br/>assets/www")]
  workflow["GitHub Actions<br/>workflow_dispatch solamente"]
  gradle["Gradle / construcción APK"]
  apk["APK generada<br/>Remesas.apk"]
  publish["Paso de publicación<br/>GitHub CLI"]
  androidManifest["Permisos y Activity<br/>AndroidManifest.xml"]
  android["MainActivity.java<br/>Activity + WebViewAssetLoader"]
  bridge["AndroidBridge<br/>puente JavaScript–Android"]
  nativeContacts["Agenda del dispositivo<br/>READ_CONTACTS"]
  nativeFiles["Selector / guardado de archivos<br/>respaldos locales"]
  whatsapp["WhatsApp u otra app externa"]
  releases["GitHub Releases<br/>APK publicada"]
  releaseApi["GitHub Releases API<br/>consulta de versión"]
  prefs["Preferencias de apariencia<br/>prefs.js"]
  backup["Respaldos<br/>js/respaldos.js"]
  contacts["Selector web de contactos<br/>js/contactos.js"]
  links["Apertura de enlaces externos<br/>router.js · deudas.js · entregas.js"]

  source -->|"PWA en navegador"| bootstrap
  source -->|"declara instalación"| pwaManifest
  bootstrap -->|"registra"| sw
  sw -->|"precarga / actualiza recursos"| cache
  cache -->|"sirve recursos almacenados"| source

  source -->|"fuente web"| sync
  workflow -->|"ejecuta manualmente"| sync
  sync -->|"copia archivos web"| assets
  workflow -->|"construye"| gradle
  assets -->|"se empaquetan con"| gradle
  gradle -->|"genera"| apk
  apk --> publish
  workflow -->|"publica mediante gh release create"| publish
  publish -->|"crea / actualiza Release"| releases
  assets -->|"cargados localmente por"| android
  androidManifest -->|"configura permisos y Activity"| android
  android -->|"contiene"| bridge

  contacts -->|"pickContact()"| bridge
  bridge -->|"solicita permiso y lee"| nativeContacts
  nativeContacts -->|"devuelve número seleccionado / error"| contacts

  prefs -->|"setThemeColor()"| bridge
  backup -->|"saveAutoBackup() / saveFile()"| bridge
  bridge -->|"abre selector y guarda"| nativeFiles

  links -->|"openExternal()"| bridge
  bridge -->|"ACTION_VIEW"| whatsapp

  bootstrap -->|"getVersionCode() + fetch()"| releaseApi
  releaseApi -->|"informa última versión"| bootstrap
  bootstrap -->|"ofrece enlace de descarga"| bridge
  click source "https://github.com/MomoSad26/PeterServices/tree/main" "Ver archivos web"
  click bootstrap "https://github.com/MomoSad26/PeterServices/blob/main/js/router.js" "Abrir router.js"
  click sw "https://github.com/MomoSad26/PeterServices/blob/main/sw.js" "Abrir sw.js"
  click pwaManifest "https://github.com/MomoSad26/PeterServices/blob/main/manifest.json" "Abrir manifest.json"
  click sync "https://github.com/MomoSad26/PeterServices/blob/main/android/sync-web.sh" "Abrir sync-web.sh"
  click workflow "https://github.com/MomoSad26/PeterServices/blob/main/.github/workflows/build-apk.yml" "Abrir workflow"
  click androidManifest "https://github.com/MomoSad26/PeterServices/blob/main/android/app/src/main/AndroidManifest.xml" "Abrir AndroidManifest.xml"
  click android "https://github.com/MomoSad26/PeterServices/blob/main/android/app/src/main/java/com/peterservices/remesas/MainActivity.java" "Abrir MainActivity.java"
  click bridge "https://github.com/MomoSad26/PeterServices/blob/main/android/app/src/main/java/com/peterservices/remesas/MainActivity.java" "Ver AndroidBridge"
  click contacts "https://github.com/MomoSad26/PeterServices/blob/main/js/contactos.js" "Abrir contactos.js"
  click prefs "https://github.com/MomoSad26/PeterServices/blob/main/prefs.js" "Abrir prefs.js"
  click backup "https://github.com/MomoSad26/PeterServices/blob/main/js/respaldos.js" "Abrir respaldos.js"
  click links "https://github.com/MomoSad26/PeterServices/blob/main/js/router.js" "Abrir router.js"
  click releases "https://github.com/MomoSad26/PeterServices/releases" "Ver Releases"
  click releaseApi "https://api.github.com/repos/MomoSad26/PeterServices/releases/latest" "Consultar última Release"

  classDef web fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#172554
  classDef platform fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f
  classDef native fill:#ffe4e6,stroke:#e11d48,stroke-width:1.5px,color:#881337
  classDef external fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d
  classDef store fill:#e0e7ff,stroke:#4f46e5,stroke-width:1.5px,color:#312e81
  class source,bootstrap,sw,contacts,prefs,backup,links,pwaManifest web
  class sync,workflow,gradle,android,bridge,androidManifest,publish platform
  class nativeContacts,nativeFiles native
  class whatsapp,releases,releaseApi,apk external
  class assets,cache store
~~~

### Comportamiento real de cada plataforma

- **PWA:** router.js registra sw.js durante el arranque. El Service Worker mantiene su propia lista de archivos y versión de caché; precarga recursos y usa caché con actualización desde red. Si encuentra una versión nueva, la interfaz solicita confirmación antes de activarla.
- **APK:** el workflow, activado solo por workflow_dispatch, ejecuta android/sync-web.sh para copiar los archivos de la web raíz a los assets de Android; después Gradle construye la APK y el propio workflow la publica en GitHub Releases. MainActivity.java carga los assets con WebViewAssetLoader. AndroidManifest.xml declara los permisos necesarios y la Activity exportada.
- **Puente Android:** AndroidBridge expone, entre otros, setThemeColor(), getVersionCode(), openExternal(), pickContact(), saveAutoBackup() y saveFile(). Los módulos web usan esos métodos cuando están disponibles; en varios flujos existe alternativa de navegador.
- **Agenda:** contactos.js registra el campo telefónico activo y solicita pickContact(). MainActivity.java gestiona READ_CONTACTS, consulta la agenda local y devuelve el número elegido a la página. No se copia la agenda a la base de datos ni se transmite a un servidor.
- **Archivos:** respaldos.js solicita respaldos automáticos o manuales. En Android, MainActivity escribe el respaldo automático en Descargas/Remesas y recibe los archivos descargados/seleccionados mediante el puente y el selector del sistema.
- **Actualización Android:** router.js obtiene la versión instalada mediante getVersionCode() y consulta GitHub Releases API desde JavaScript. MainActivity.java aporta el puente y abre enlaces externos, pero no consulta GitHub directamente.
- **WhatsApp:** deudas.js y entregas.js preparan enlaces wa.me y los abren mediante AndroidBridge.openExternal() en APK o window.open() en navegador. La aplicación prepara el mensaje; la persona confirma el envío en la app externa.

## 3. Archivos y responsabilidades que suelen confundirse

| Elemento | Responsabilidad exacta |
|---|---|
| index.html | Entrada web, estructura visual, menú, botones globales y orden de carga de scripts. |
| js/router.js | Arranque, lectura de hash, navegación, bootstrap de DB, registro del Service Worker y comprobación de Releases en Android. |
| js/movimientos.js | Implementa Compra, Ventas, Gastos e In/Out; Compra y Ventas comparten la ruta Operaciones, no sus datos. |
| js/historial.js | Historial de envíos y detalles/edición de envíos. No reemplaza el historial de cada módulo. |
| js/entregas.js | Pestañas Destinatarios, Mensajeros y Compradores; proporciona selectores usados por envíos, ventas y deudas. |
| js/balance-base.js | Funciones contables compartidas: cálculo/ajuste de saldos y efectos de operaciones. |
| js/balance.js + js/balance-reorder.js | Vista de Balance, historial de movimientos por divisa y extensión para ordenar sus divisas. |
| js/archivo.js | Archivado no destructivo y restauración visual; sus diálogos se abren desde Respaldos. |
| js/importacion.js | Función de fusión de respaldos, remapeo de identificadores y aplicación de efectos de balance de registros importados. |
| js/xlsx.js | Generación del reporte ejecutivo Excel, accesible desde Respaldos. |
| sw.js | Caché y estrategia offline de la PWA; no es la base de datos del negocio. |
| MainActivity.java | Activity Android que aloja el WebView y proporciona el puente nativo; no contiene la lógica de negocio web. |

**Detalle de implementación que conviene conocer:** actualmente existe una definición de mergeImport() tanto en js/archivo.js como en js/importacion.js. Según el orden real de index.html, importacion.js se carga después y su definición queda como la función global utilizada por la importación desde Respaldos. Este documento refleja esa ruta efectiva; no se modificó esa duplicidad porque el alcance solicitado es documental.

## 4. Alcance y mantenimiento del diagrama

- El diagrama describe las relaciones verificadas en el código consultado en main a la fecha indicada. No es una lista de todas las funciones ni de todas las lecturas posibles de DB.
- Los nombres de rutas, tablas y archivos se conservan tal como existen en el proyecto. Las flechas etiquetadas como navegación son rutas; las que indican consulta/guardado son acceso a la base local; las líneas discontinuas se usan para relaciones auxiliares o transversales.
- Si se agrega, elimina o renombra un módulo, actualiza este documento junto con index.html, sw.js, PROJECT_MAP.md y docs/DEPENDENCY_MAP.md cuando corresponda. No cambies la lógica de la aplicación solo para hacer coincidir el diagrama.
