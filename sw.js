const CACHE_NAME = 'sleep-tracker-v65';
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
    './js/notifications.js',
    './js/push.js',
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

// Declarative Web Push: Safari сам покажет уведомление из JSON-пейлоада,
// но свой обработчик нужен для Chrome/Android и как приоритетный путь.
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) {}

    const n = data.notification || {};
    const title = n.title || 'Sleep Tracker';

    event.waitUntil(self.registration.showNotification(title, {
        body: n.body || '',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: n.tag || undefined,
        renotify: !!n.tag,
        data: { url: n.navigate || './index.html' }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || './index.html';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            for (const client of clients) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow(target);
        })
    );
});
