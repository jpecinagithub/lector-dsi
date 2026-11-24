const CACHE = 'lector-dsi-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/','/manifest.webmanifest','/icon.svg','/cover.jpg'])).catch(()=>{})); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{}); return res;
  }).catch(() => caches.match('/'))));
});
