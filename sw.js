const CACHE_NAME = 'sleep-tracker-v50';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/timeUtils.js',
    './js/phaseEngine.js',
    './js/phaseCalendar.js',
    './js/app.js',
    './js/db.js',
    './js/routineEditor.js',
    './js/setupWizard.js',
    './js/settings.js',
    './js/form.js',
    './js/protocol.js',
    './js/routine.js',
    './js/instruction.js',
    './js/history.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(
                ASSETS.map(url =>
                    fetch(url, { cache: 'no-cache' }).then(res => cache.put(url, res))
                )
            ))
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
