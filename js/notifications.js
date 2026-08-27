const Notifications = (() => {

    const LS_SETTINGS = 'notifSettings';
    const LS_FIRED = 'notifFired';

    const LEAD_OPTIONS = [0, 5, 10, 15, 30];
    const TICK_MS = 20000;
    const STALE_MS = 5 * 60 * 1000;
    const TRIGGER_DAYS = 7;

    const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

    let plan = null;
    let steps = null;
    let tickTimer = null;

    /* ── Settings storage ── */

    function defaults() {
        return { enabled: false, steps: {} };
    }

    function getSettings() {
        try {
            const raw = localStorage.getItem(LS_SETTINGS);
            if (!raw) return defaults();
            const s = JSON.parse(raw);
            return { enabled: !!s.enabled, steps: s.steps || {} };
        } catch (e) {
            return defaults();
        }
    }

    function saveSettings(s) {
        localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
        reschedule();
    }

    function getStepSetting(stepId) {
        const cfg = getSettings().steps[stepId];
        return {
            on: !!(cfg && cfg.on),
            lead: (cfg && typeof cfg.lead === 'number') ? cfg.lead : 0
        };
    }

    function setStepSetting(stepId, patch) {
        const s = getSettings();
        const cur = s.steps[stepId] || { on: false, lead: 0 };
        s.steps[stepId] = Object.assign(cur, patch);
        saveSettings(s);
    }

    function isEnabled() {
        return getSettings().enabled;
    }

    function setEnabled(on) {
        const s = getSettings();
        s.enabled = !!on;
        saveSettings(s);
    }

    /* ── Capability / permission ── */

    function isSupported() {
        return typeof window !== 'undefined' && 'Notification' in window;
    }

    function permission() {
        return isSupported() ? Notification.permission : 'unsupported';
    }

    function supportsTriggers() {
        return isSupported() &&
            typeof window.TimestampTrigger === 'function' &&
            'showTrigger' in Notification.prototype;
    }

    function requestPermission() {
        if (!isSupported()) return Promise.resolve('unsupported');
        if (Notification.permission === 'granted') return Promise.resolve('granted');
        if (Notification.permission === 'denied') return Promise.resolve('denied');
        try {
            return Promise.resolve(Notification.requestPermission());
        } catch (e) {
            return new Promise(res => Notification.requestPermission(res));
        }
    }

    /* ── Time resolution (phase-aware) ── */

    function routineSteps() {
        return steps && steps.length ? steps : PhaseEngine.DEFAULT_ROUTINE_STEPS;
    }

    function protocolSteps() {
        return PhaseEngine.PROTOCOL_NOTIF_STEPS;
    }

    // Напоминать можно и по шагам распорядка, и по пунктам протокола:
    // и те и другие привязаны к отбою, поэтому считаются одинаково.
    function activeSteps() {
        return routineSteps().concat(protocolSteps());
    }

    function contextFor(dateStr) {
        return PhaseEngine.getDayContext(plan, routineSteps(), dateStr);
    }

    // Clock time a step's notification fires on the given wake-date.
    function notifTimeForDate(step, dateStr, lead) {
        const ctx = contextFor(dateStr);
        return TimeUtils.formatTime(
            TimeUtils.parseTime(ctx.bed) + step.offsetMinutes - (lead || 0)
        );
    }

    function stepTimeForDate(step, dateStr) {
        const ctx = contextFor(dateStr);
        return TimeUtils.formatTime(TimeUtils.parseTime(ctx.bed) + step.offsetMinutes);
    }

    // All enabled notifications for the routine belonging to wake-date `dateStr`.
    function scheduleForDate(dateStr) {
        const settings = getSettings();
        if (!settings.enabled) return [];

        const ctx = contextFor(dateStr);
        // Момент отбоя считает PhaseEngine — тем же расчётом, что и порог смены суток.
        const bedTs = PhaseEngine.bedTimestamp(plan, dateStr);
        const out = [];

        activeSteps().forEach(step => {
            const cfg = settings.steps[step.id];
            if (!cfg || !cfg.on) return;
            const lead = cfg.lead || 0;
            const stepTime = TimeUtils.formatTime(TimeUtils.parseTime(ctx.bed) + step.offsetMinutes);

            out.push({
                key: dateStr + '|' + step.id,
                stepId: step.id,
                ts: bedTs + step.offsetMinutes * 60000 - lead * 60000,
                title: step.emoji + ' ' + step.name,
                body: lead > 0 ? ('Через ' + lead + ' мин · в ' + stepTime) : ('Сейчас · ' + stepTime)
            });
        });

        return out;
    }

    function upcoming(days) {
        const now = Date.now();
        const today = TimeUtils.todayISO();
        const list = [];
        for (let i = 0; i <= days; i++) {
            scheduleForDate(TimeUtils.addDays(today, i)).forEach(n => list.push(n));
        }
        return list.filter(n => n.ts > now).sort((a, b) => a.ts - b.ts);
    }

    // Сколько дней вперёд имеет смысл считать: до конца последней фазы,
    // чтобы залитое на сервер расписание не кончилось само по себе.
    function horizonDays() {
        const today = TimeUtils.todayISO();
        let last = TimeUtils.addDays(today, 14);
        if (plan && plan.phases && plan.phases.length) {
            const end = plan.phases[plan.phases.length - 1].endDate;
            if (end > last) last = end;
        }
        const a = new Date(today + 'T12:00:00');
        const b = new Date(last + 'T12:00:00');
        const days = Math.round((b - a) / 86400000) + 1;
        return Math.max(1, Math.min(120, days));
    }

    // Плоский список моментов для пуш-планировщика: абсолютное время + текст.
    // Сервер не знает про фазы — вся логика остаётся здесь.
    function fullSchedule() {
        return upcoming(horizonDays()).map(n => ({
            ts: n.ts,
            title: n.title,
            body: n.body,
            tag: n.stepId
        }));
    }

    /* ── Fired bookkeeping ── */

    function getFired() {
        try {
            return JSON.parse(localStorage.getItem(LS_FIRED)) || {};
        } catch (e) {
            return {};
        }
    }

    function markFired(map, key) {
        map[key] = Date.now();
        const cutoff = Date.now() - 3 * 86400000;
        Object.keys(map).forEach(k => { if (map[k] < cutoff) delete map[k]; });
        try { localStorage.setItem(LS_FIRED, JSON.stringify(map)); } catch (e) {}
    }

    /* ── Delivery ── */

    function show(title, options) {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            return navigator.serviceWorker.ready
                .then(reg => reg.showNotification(title, options))
                .catch(() => { try { new Notification(title, options); } catch (e) {} });
        }
        try { new Notification(title, options); } catch (e) {}
        return Promise.resolve();
    }

    function fire(n) {
        show(n.title, {
            body: n.body,
            tag: n.key,
            renotify: true,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
            data: { stepId: n.stepId }
        });
    }

    function test() {
        return requestPermission().then(p => {
            if (p !== 'granted') return p;
            show('🔔 Проверка', {
                body: 'Уведомления работают',
                tag: 'notif-test',
                icon: './icons/icon-192.png',
                badge: './icons/icon-192.png'
            });
            return 'granted';
        });
    }

    /* ── Foreground ticker (fires while the app is open) ── */

    function tick() {
        if (!isEnabled() || permission() !== 'granted') return;

        const now = Date.now();
        const fired = getFired();
        const today = TimeUtils.todayISO();

        [TimeUtils.addDays(today, -1), today, TimeUtils.addDays(today, 1)].forEach(d => {
            scheduleForDate(d).forEach(n => {
                if (fired[n.key]) return;
                if (n.ts <= now && now - n.ts < STALE_MS) {
                    fire(n);
                    markFired(fired, n.key);
                }
            });
        });
    }

    function startTicker() {
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(tick, TICK_MS);
        tick();
    }

    /* ── Background scheduling (Notification Triggers, where available) ── */

    function scheduleTriggers() {
        if (!supportsTriggers() || !navigator.serviceWorker) return;

        navigator.serviceWorker.ready.then(reg => {
            let pending;
            try {
                pending = reg.getNotifications({ includeTriggered: true });
            } catch (e) {
                pending = reg.getNotifications();
            }
            return Promise.resolve(pending).then(existing => {
                (existing || []).forEach(n => {
                    if (n.data && n.data.scheduled) n.close();
                });

                if (!isEnabled() || permission() !== 'granted') return;

                upcoming(TRIGGER_DAYS).forEach(n => {
                    reg.showNotification(n.title, {
                        body: n.body,
                        tag: n.key,
                        icon: './icons/icon-192.png',
                        badge: './icons/icon-192.png',
                        showTrigger: new TimestampTrigger(n.ts),
                        data: { scheduled: true, stepId: n.stepId }
                    });
                });
            });
        }).catch(() => {});
    }

    function reschedule() {
        startTicker();
        scheduleTriggers();
        // План/распорядок/настройки поменялись — перезаливаем расписание на сервер.
        if (typeof PushSync !== 'undefined') PushSync.syncSoon();
    }

    /* ── Settings-screen helpers ── */

    function formatDateRu(iso) {
        const p = iso.split('-');
        return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1];
    }

    // Rows demonstrating how the time moves with each phase.
    function previewRows(step) {
        const cfg = getStepSetting(step.id);
        const tonight = TimeUtils.addDays(TimeUtils.todayISO(), 1);
        const rows = [{
            label: 'Сегодня вечером',
            time: notifTimeForDate(step, tonight, cfg.lead)
        }];

        if (plan && plan.phases && plan.phases.length) {
            const cur = PhaseEngine.getPhaseForDate(plan.phases, tonight);
            const from = cur ? plan.phases.indexOf(cur) + 1 : 0;
            for (let i = from; i < Math.min(from + 2, plan.phases.length); i++) {
                const p = plan.phases[i];
                rows.push({
                    label: 'Фаза ' + p.number + ' (с ' + formatDateRu(p.startDate) + ')',
                    time: notifTimeForDate(step, p.startDate, cfg.lead)
                });
            }
        }

        return rows;
    }

    function leadLabel(lead) {
        return lead === 0 ? 'в момент' : 'за ' + lead + ' мин';
    }

    /* ── Lifecycle ── */

    function loadSteps() {
        return DB.getRoutineSteps().then(dbSteps => {
            steps = dbSteps.length ? dbSteps : PhaseEngine.DEFAULT_ROUTINE_STEPS;
            return steps;
        });
    }

    function setPlan(p) {
        plan = p;
        reschedule();
    }

    function reloadSteps() {
        return loadSteps().then(() => { reschedule(); });
    }

    function init(p) {
        plan = p;
        return loadSteps().then(() => {
            reschedule();
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) reschedule();
            });
        });
    }

    return {
        LEAD_OPTIONS,
        init, setPlan, reloadSteps, reschedule,
        isSupported, supportsTriggers, permission, requestPermission,
        isEnabled, setEnabled,
        getSettings, getStepSetting, setStepSetting,
        getSteps: activeSteps,
        getRoutineSteps: routineSteps,
        getProtocolSteps: protocolSteps,
        notifTimeForDate, stepTimeForDate, previewRows, leadLabel,
        upcoming, fullSchedule, test
    };
})();
