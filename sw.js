const CACHE = 'remesas-v14';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './js/db.js',
  './js/utilidades.js',
  './js/balance-base.js',
  './js/interfaz.js',
  './js/router.js',
  './js/clientes.js',
  './js/envios.js',
  './js/trabajadores.js',
  './js/precio-especial.js',
  './js/paginacion.js',
  './js/historial.js',
  './js/movimientos.js',
  './js/balance.js',
  './js/respaldos.js',
  './js/ajustes.js',
  './js/archivo.js',
  './js/deudas.js',
  './js/xlsx.js',
  './prefs.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache.addAll() es "todo o nada": si un solo archivo falla (ej. un ícono
  // que no existe), toda la instalación fallaba y el modo offline no
  // quedaba listo. Ahora cada archivo se cachea por separado, así uno que
  // falle no arrastra a los demás.
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(FILES.map(url =>
        cache.add(url).catch(err => console.warn('SW: no se pudo cachear', url, err))
      ))
    )
    // Ya no se llama self.skipWaiting() aquí: la nueva versión se instala en
    // segundo plano pero espera confirmación del usuario (ver app.js) antes
    // de tomar el control, para no reemplazar archivos a mitad de una sesión
    // en uso.
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Estrategia: "stale-while-revalidate" — sirve la copia guardada al instante
// (así funciona sin conexión de forma inmediata y confiable, sin depender de
// que una petición de red falle primero), y en segundo plano busca la versión
// más nueva para dejarla lista la próxima vez que se abra la app.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const networkUpdate = fetch(e.request).then(res => {
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);
      // Si ya hay copia guardada, se entrega de inmediato (offline garantizado).
      // Si no hay copia (primera visita a ese archivo), se espera la red.
      return cached || (await networkUpdate) || Response.error();
    })
  );
});
