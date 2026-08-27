const CACHE_NAME = 'sleep-tracker-v69';
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
                    fetch(url, { cache: 'no-cache' }).then(res => {
                        // Класть в кэш 404 нельзя: он переживёт деплой
                        // и приложение навсегда останется с битым файлом.
                        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
                        return cache.put(url, res);
                    })
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
    const req = event.request;

    // Кэш — только для собственных файлов приложения.
    // Запросы к пуш-воркеру (чужой домен, POST) проходят мимо: перехватывать
    // их незачем, а сорвавшийся здесь запрос Safari превращает в
    // «FetchEvent.respondWith received an error» вместо нормальной ошибки сети.
    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== self.location.origin) return;

    event.respondWith(
        caches.match(req).then(cached => {
            if (cached) return cached;
            return fetch(req).catch(() =>
                // Офлайн и файла нет в кэше: отвечаем пустышкой, а не отказом,
                // иначе в консоли снова всплывёт ошибка respondWith.
                new Response('', { status: 504, statusText: 'Offline' })
            );
        })
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
