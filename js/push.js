/**
 * Пуш-уведомления на iOS.
 *
 * iOS не умеет планировать локальные уведомления, поэтому расписание
 * считается здесь (тем же кодом, что рисует вкладку «Распорядок»),
 * а затем целиком заливается на Cloudflare Worker, который будит
 * нужный момент. См. push-worker/README.md.
 */
const PushSync = (() => {

    const LS_CONFIG = 'pushConfig';    // { url, token }
    const LS_DEVICE = 'pushDeviceId';
    const LS_ENABLED = 'pushEnabled';
    const SYNC_DEBOUNCE_MS = 1500;
    const NET_RETRIES = 2;
    const RETRY_DELAY_MS = 600;

    let syncTimer = null;
    let lastError = null;

    /* ── Конфиг ── */

    function getConfig() {
        try {
            const raw = localStorage.getItem(LS_CONFIG);
            if (!raw) return { url: '', token: '' };
            const c = JSON.parse(raw);
            return { url: c.url || '', token: c.token || '' };
        } catch (e) {
            return { url: '', token: '' };
        }
    }

    function setConfig(cfg) {
        localStorage.setItem(LS_CONFIG, JSON.stringify({
            url: (cfg.url || '').trim().replace(/\/+$/, ''),
            token: (cfg.token || '').trim()
        }));
    }

    function isConfigured() {
        const c = getConfig();
        return !!(c.url && c.token);
    }

    function deviceId() {
        let id = localStorage.getItem(LS_DEVICE);
        if (!id) {
            id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem(LS_DEVICE, id);
        }
        return id;
    }

    function isEnabled() {
        return localStorage.getItem(LS_ENABLED) === '1';
    }

    function setEnabledFlag(on) {
        if (on) localStorage.setItem(LS_ENABLED, '1');
        else localStorage.removeItem(LS_ENABLED);
    }

    function getLastError() {
        return lastError;
    }

    /* ── Окружение ── */

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isStandalone() {
        return window.navigator.standalone === true ||
            (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    }

    function isSupported() {
        return 'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window;
    }

    // На iOS подписка на пуш возможна только из приложения,
    // добавленного на домашний экран.
    function needsHomeScreen() {
        return isIOS() && !isStandalone();
    }

    /* ── HTTP ── */

    // Первый запрос из только что развёрнутого приложения на iOS регулярно
    // отваливается с «Load failed»: сеть ещё не поднялась. Сам запрос при этом
    // до сервера не доходит, поэтому повтор безопасен — и почти всегда проходит.
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function fetchRetry(url, options, attempt) {
        const n = attempt || 0;
        return fetch(url, options).catch(() => {
            if (n >= NET_RETRIES) throw new Error('Нет связи с сервером');
            return wait(RETRY_DELAY_MS * (n + 1)).then(() => fetchRetry(url, options, n + 1));
        });
    }

    function api(path, body) {
        const cfg = getConfig();
        if (!cfg.url) return Promise.reject(new Error('Не задан адрес воркера'));

        return fetchRetry(cfg.url + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + cfg.token
            },
            body: JSON.stringify(body || {})
        }).then(res => res.json().then(data => {
            if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
            return data;
        }));
    }

    function fetchPublicKey() {
        const cfg = getConfig();
        return fetchRetry(cfg.url + '/key', {}).then(res => {
            if (!res.ok) throw new Error('Воркер не отвечает (HTTP ' + res.status + ')');
            return res.json();
        }).then(data => {
            if (!data.publicKey) throw new Error('Воркер не вернул VAPID-ключ');
            return data.publicKey;
        });
    }

    function urlBase64ToUint8Array(base64) {
        const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }

    /* ── Подписка ── */

    function getSubscription() {
        return navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription());
    }

    function enable() {
        lastError = null;

        if (!isSupported()) {
            return Promise.reject(new Error('Браузер не поддерживает push'));
        }
        if (needsHomeScreen()) {
            return Promise.reject(new Error('Сначала добавь приложение на домашний экран'));
        }
        if (!isConfigured()) {
            return Promise.reject(new Error('Не заданы адрес воркера и токен'));
        }

        // requestPermission обязан вызываться из жеста пользователя.
        return Notification.requestPermission().then(perm => {
            if (perm !== 'granted') throw new Error('Разрешение не выдано');
            return fetchPublicKey();
        }).then(publicKey => {
            return navigator.serviceWorker.ready.then(reg => {
                return reg.pushManager.getSubscription().then(existing => {
                    if (existing) return existing;
                    return reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(publicKey)
                    });
                });
            });
        }).then(sub => {
            setEnabledFlag(true);
            return pushSchedule(sub);
        }).catch(err => {
            lastError = err.message || String(err);
            setEnabledFlag(false);
            throw err;
        });
    }

    function disable() {
        setEnabledFlag(false);
        lastError = null;

        return getSubscription().then(sub => {
            const done = sub ? sub.unsubscribe() : Promise.resolve();
            return done.then(() => api('/unregister', { deviceId: deviceId() }));
        }).catch(err => {
            // Отписаться локально важнее, чем достучаться до воркера.
            lastError = err.message || String(err);
        });
    }

    function pushSchedule(sub) {
        const items = Notifications.fullSchedule();
        return api('/register', {
            deviceId: deviceId(),
            subscription: sub.toJSON(),
            items: items,
            tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || null
        });
    }

    /* ── Синхронизация расписания ── */

    function sync() {
        if (!isEnabled() || !isConfigured()) return Promise.resolve(null);

        return getSubscription().then(sub => {
            if (!sub) {
                // Подписку отозвала система — пусть UI покажет, что надо переподключить.
                setEnabledFlag(false);
                lastError = 'Подписка отозвана, подключи заново';
                return null;
            }
            return pushSchedule(sub);
        }).then(res => {
            if (res) lastError = null;
            return res;
        }).catch(err => {
            lastError = err.message || String(err);
            return null;
        });
    }

    // Настройки меняются пачками (перерисовка списка шагов) — не дёргаем сеть на каждый чих.
    function syncSoon() {
        if (!isEnabled() || !isConfigured()) return;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => { syncTimer = null; sync(); }, SYNC_DEBOUNCE_MS);
    }

    function status() {
        if (!isConfigured()) return Promise.resolve({ registered: false });
        return api('/status', { deviceId: deviceId() }).catch(err => {
            lastError = err.message || String(err);
            return { registered: false, error: lastError };
        });
    }

    function test() {
        return api('/test', { deviceId: deviceId() });
    }

    function init() {
        if (isEnabled() && isConfigured()) sync();
    }

    return {
        getConfig, setConfig, isConfigured,
        isSupported, isIOS, isStandalone, needsHomeScreen,
        isEnabled, getLastError,
        enable, disable, sync, syncSoon, status, test, init
    };
})();
