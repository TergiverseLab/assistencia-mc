// sw.js — la app guardada en el móvil.
//  · lo pequeño (páginas, código): primero la red, para que cada cambio llegue al momento; sin red, lo guardado;
//  · lo grande (motor y modelos en vendor/ y modelos/): primero lo guardado, para no descargarlo dos veces.
// Los pesos del ojo que vienen de Hugging Face los guarda segmentar.js en su propia caché.
const CACHE = 'caligrama-v1-0', MODELOS = 'caligrama-modelos';
const BASICOS = ['./', 'index.html', 'estilo.css', 'manifest.webmanifest', 'icono.svg', 'icono-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== MODELOS).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const grande = /\/(vendor|modelos)\//.test(url.pathname);
  const guardar = (r) => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return r; };
  e.respondWith(grande
    ? caches.match(e.request).then((r) => r || fetch(e.request).then(guardar))
    : fetch(e.request).then(guardar).catch(() => caches.match(e.request)));
});
