// sw.js — guarda la app y los modelos en el móvil: después de la primera vez, abre sin esperar y sin red.
const CACHE = 'caligrama-v0-3';
const ARCHIVOS = ['./', 'index.html', 'estilo.css', 'manifest.webmanifest', 'icono.svg', 'icono-512.png',
  'js/main.js', 'js/tipos.js', 'js/relatos.js', 'js/render.js', 'js/nombrar.js', 'js/vision.js', 'js/escritura.js', 'js/camara.js', 'js/grabar.js', 'js/vocab.js',
  'vendor/human.esm.js', 'vendor/courier-prime-latin-400-normal.woff2', 'vendor/courier-prime-latin-700-normal.woff2', 'vendor/courier-prime-latin-400-italic.woff2', 'vendor/courier-prime-latin-700-italic.woff2',
  'modelos/centernet.json', 'modelos/centernet.bin', 'modelos/selfie.json', 'modelos/selfie.bin'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// primero la red (así cada cambio llega al momento); si no hay red, lo guardado
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
