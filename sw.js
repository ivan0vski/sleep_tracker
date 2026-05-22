const CACHE_NAME = 'sleep-tracker-v18';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/db.js',
    './js/form.js',
    './js/protocol.js',
    './js/routine.js',
    './js/history.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
