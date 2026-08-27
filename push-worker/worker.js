/**
 * Sleep Tracker — планировщик пуш-уведомлений.
 *
 * Один файл, ноль зависимостей: вставляется прямо в редактор Cloudflare
 * Dashboard, Node/wrangler не нужны.
 *
 * Требует:
 *   KV binding  PUSH_KV
 *   Secret      ADMIN_TOKEN     — общий секрет, его же вводишь в приложении
 *   Variable    APP_URL         — куда открывать по тапу на уведомление
 *   Variable    VAPID_SUBJECT   — mailto:... контакт для push-сервиса
 *   Cron        * * * * *
 *
 * Воркер намеренно ничего не знает про фазы сна: приложение присылает
 * готовый список моментов (абсолютный timestamp + текст), воркер только
 * будит их в нужную минуту. Вся логика фаз остаётся в одном месте — в
 * js/notifications.js.
 */

const VAPID_KV_KEY = 'vapid';
const SUB_PREFIX = 'sub:';

// Насколько опоздавшее напоминание ещё имеет смысл слать.
const MAX_LATE_MS = 5 * 60 * 1000;

/* ── base64url ───────────────────────────────────────────────────────── */

function b64uEncode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function utf8(str) {
    return new TextEncoder().encode(str);
}

function concat() {
    let total = 0;
    for (const a of arguments) total += a.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arguments) { out.set(a, off); off += a.length; }
    return out;
}

function be32(n) {
    return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

/* ── RFC 8291 / RFC 8188: aes128gcm ──────────────────────────────────── */
/* Проверено против тест-вектора RFC 8291 §5 — см. push-worker/README.md */

async function hmacSha256(keyBytes, data) {
    const key = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

async function hkdf(salt, ikm, info, length) {
    const prk = await hmacSha256(salt, ikm);
    const out = await hmacSha256(prk, concat(info, new Uint8Array([1])));
    return out.slice(0, length);
}

async function encryptPayload(plaintext, p256dhB64, authB64, fixed) {
    const uaPub = b64uDecode(p256dhB64);
    const authSecret = b64uDecode(authB64);
    const salt = fixed ? fixed.salt : crypto.getRandomValues(new Uint8Array(16));

    // Эфемерная пара ключей на каждое сообщение
    // (`fixed` подставляется только самопроверкой на тест-векторе).
    const eph = fixed ? fixed.eph : await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    );
    const asPub = fixed ? fixed.asPub : new Uint8Array(
        await crypto.subtle.exportKey('raw', eph.publicKey)
    );

    const uaKey = await crypto.subtle.importKey(
        'raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []
    );
    const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'ECDH', public: uaKey }, eph.privateKey, 256
    ));

    const ikm = await hkdf(
        authSecret,
        ecdhSecret,
        concat(utf8('WebPush: info\0'), uaPub, asPub),
        32
    );
    const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

    const header = concat(salt, be32(4096), new Uint8Array([asPub.length]), asPub);
    const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const body = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        aesKey,
        concat(plaintext, new Uint8Array([2]))   // 0x02 — последняя запись
    ));

    return concat(header, body);
}

/* ── Самопроверка на тест-векторе RFC 8291 §5 ────────────────────────── */

async function selfTest() {
    const PLAINTEXT = 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24';
    const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';
    const AS_PRIV = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
    const AS_PUB = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLoc' +
                   'InmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
    const UA_PUB = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvT' +
                   'BHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
    const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
    const EXPECTED =
        'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
        'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

    const asPub = b64uDecode(AS_PUB);
    const eph = {
        privateKey: await crypto.subtle.importKey(
            'jwk',
            {
                kty: 'EC',
                crv: 'P-256',
                d: AS_PRIV,
                x: b64uEncode(asPub.slice(1, 33)),
                y: b64uEncode(asPub.slice(33, 65)),
                ext: true
            },
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveBits']
        )
    };

    const actual = b64uEncode(await encryptPayload(
        b64uDecode(PLAINTEXT),
        UA_PUB,
        AUTH,
        { salt: b64uDecode(SALT), eph: eph, asPub: asPub }
    ));

    return { pass: actual === EXPECTED, expected: EXPECTED, actual: actual };
}

/* ── VAPID ───────────────────────────────────────────────────────────── */

async function getVapid(env) {
    const stored = await env.PUSH_KV.get(VAPID_KV_KEY, 'json');
    if (stored) return stored;

    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
    );
    const publicKey = b64uEncode(new Uint8Array(
        await crypto.subtle.exportKey('raw', pair.publicKey)
    ));
    const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

    const keys = { publicKey, privateJwk };
    await env.PUSH_KV.put(VAPID_KV_KEY, JSON.stringify(keys));
    return keys;
}

async function vapidAuth(endpoint, keys, subject) {
    const header = { typ: 'JWT', alg: 'ES256' };
    const payload = {
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject
    };
    const signingInput =
        b64uEncode(utf8(JSON.stringify(header))) + '.' +
        b64uEncode(utf8(JSON.stringify(payload)));

    const key = await crypto.subtle.importKey(
        'jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );
    // Web Crypto отдаёт ECDSA-подпись сразу в raw r||s — ровно то, что нужно JWS.
    const sig = new Uint8Array(await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput)
    ));

    const jwt = signingInput + '.' + b64uEncode(sig);
    return 'vapid t=' + jwt + ', k=' + keys.publicKey;
}

/* ── Отправка ────────────────────────────────────────────────────────── */

async function sendPush(subscription, item, keys, env) {
    const notification = {
        title: item.title,
        body: item.body || '',
        navigate: env.APP_URL || 'https://example.com/',
        lang: 'ru'
    };
    // Declarative Web Push: магическое число 8030 обязательно, как и navigate.
    const payload = utf8(JSON.stringify({ web_push: 8030, notification: notification }));

    const body = await encryptPayload(
        payload,
        subscription.keys.p256dh,
        subscription.keys.auth
    );

    const auth = await vapidAuth(
        subscription.endpoint,
        keys,
        env.VAPID_SUBJECT || 'mailto:nobody@example.com'
    );

    const headers = {
        'Authorization': auth,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // Напоминание бессмысленно, если доставлено сильно позже.
        'TTL': '180',
        'Urgency': 'high'
    };
    if (item.tag) headers['Topic'] = String(item.tag).slice(0, 32);

    const res = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: headers,
        body: body
    });

    return res.status;
}

/* ── Cron ────────────────────────────────────────────────────────────── */

async function runSchedule(env, scheduledTime) {
    // Окна ровно по минуте и встык, поэтому каждый момент попадает
    // ровно в один запуск — и не нужно писать курсор в KV каждую минуту
    // (на бесплатном тарифе всего 1000 записей в сутки).
    const windowEnd = scheduledTime;
    const windowStart = scheduledTime - 60000;

    const listed = await env.PUSH_KV.list({ prefix: SUB_PREFIX });
    if (!listed.keys.length) return;

    const keys = await getVapid(env);

    for (const entry of listed.keys) {
        const rec = await env.PUSH_KV.get(entry.name, 'json');
        if (!rec || !rec.subscription || !Array.isArray(rec.items)) continue;

        const due = rec.items.filter(i =>
            i.ts > windowStart &&
            i.ts <= windowEnd &&
            Date.now() - i.ts < MAX_LATE_MS
        );
        if (!due.length) continue;

        for (const item of due) {
            try {
                const status = await sendPush(rec.subscription, item, keys, env);
                // Подписка отозвана — чистим, иначе будем долбиться вечно.
                if (status === 404 || status === 410) {
                    await env.PUSH_KV.delete(entry.name);
                    break;
                }
            } catch (e) {
                // Один сбойный момент не должен ронять остальные.
            }
        }
    }
}

/* ── HTTP ────────────────────────────────────────────────────────────── */

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: Object.assign({ 'Content-Type': 'application/json' }, CORS)
    });
}

function authorized(request, env) {
    const header = request.headers.get('Authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '');
    return env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

async function handleRequest(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
    }

    // Публичный VAPID-ключ нужен приложению до всякой авторизации,
    // он и так не секретный.
    if (url.pathname === '/key' && request.method === 'GET') {
        const keys = await getVapid(env);
        return json({ publicKey: keys.publicKey });
    }

    if (url.pathname === '/health') {
        return json({ ok: true, time: new Date().toISOString() });
    }

    // Прогоняет шифрование на официальном тест-векторе RFC 8291 §5
    // прямо в этом рантайме. Должно вернуть pass: true.
    if (url.pathname === '/selftest') {
        const result = await selfTest();
        return json(result, result.pass ? 200 : 500);
    }

    if (!authorized(request, env)) {
        return json({ error: 'unauthorized' }, 401);
    }

    if (url.pathname === '/register' && request.method === 'POST') {
        const body = await request.json();
        if (!body.deviceId || !body.subscription) {
            return json({ error: 'deviceId and subscription required' }, 400);
        }

        const now = Date.now();
        const items = (body.items || [])
            .filter(i => i && typeof i.ts === 'number' && i.ts > now - MAX_LATE_MS)
            .sort((a, b) => a.ts - b.ts);

        await env.PUSH_KV.put(SUB_PREFIX + body.deviceId, JSON.stringify({
            subscription: body.subscription,
            items: items,
            tz: body.tz || null,
            updatedAt: now
        }));

        return json({ ok: true, scheduled: items.length, next: items.length ? items[0] : null });
    }

    if (url.pathname === '/unregister' && request.method === 'POST') {
        const body = await request.json();
        if (!body.deviceId) return json({ error: 'deviceId required' }, 400);
        await env.PUSH_KV.delete(SUB_PREFIX + body.deviceId);
        return json({ ok: true });
    }

    if (url.pathname === '/status' && request.method === 'POST') {
        const body = await request.json();
        const rec = await env.PUSH_KV.get(SUB_PREFIX + body.deviceId, 'json');
        if (!rec) return json({ registered: false });
        const now = Date.now();
        const pending = rec.items.filter(i => i.ts > now);
        return json({
            registered: true,
            updatedAt: rec.updatedAt,
            pending: pending.length,
            next: pending.length ? pending[0] : null
        });
    }

    if (url.pathname === '/test' && request.method === 'POST') {
        const body = await request.json();
        const rec = await env.PUSH_KV.get(SUB_PREFIX + body.deviceId, 'json');
        if (!rec) return json({ error: 'not registered' }, 404);
        const keys = await getVapid(env);
        // Без tag и с временем в тексте: одинаковые проверки подряд
        // push-сервис схлопывает в одну, и кажется, что вторая не дошла.
        const stamp = new Date().toLocaleTimeString('ru-RU', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: rec.tz || 'UTC'
        });
        const status = await sendPush(rec.subscription, {
            title: '🔔 Проверка',
            body: 'Пуши работают · ' + stamp
        }, keys, env);
        return json({ ok: status >= 200 && status < 300, status: status });
    }

    return json({ error: 'not found' }, 404);
}

export default {
    async fetch(request, env) {
        try {
            return await handleRequest(request, env);
        } catch (e) {
            return json({ error: String(e && e.message || e) }, 500);
        }
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(runSchedule(env, event.scheduledTime));
    }
};
