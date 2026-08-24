const Settings = (() => {

    let overlay = null;

    function open() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        renderContent();
        document.body.appendChild(overlay);
    }

    function close() {
        if (overlay) { overlay.remove(); overlay = null; }
    }

    function renderContent() {
        DB.getActivePlan().then(function (plan) {
            var statusHTML = '';
            var planBtn = '';
            if (plan) {
                planBtn = '<button class="settings__btn" id="settings-plan-detail">Текущий план</button>';
            } else {
                statusHTML = '<div class="settings__status"><div class="settings__status-line">Нет активного плана</div></div>';
            }

            var resetBtn = plan
                ? '<button class="settings__btn settings__btn--danger" id="settings-reset">Сбросить план</button>'
                : '';

            var routineMode = Routine.getMode();
            var routineModeHTML =
                '<div class="settings__toggle-row">' +
                    '<span class="settings__toggle-label">Чекбоксы в распорядке</span>' +
                    '<label class="settings__toggle">' +
                        '<input type="checkbox" id="settings-routine-mode"' + (routineMode === 'checklist' ? ' checked' : '') + '>' +
                        '<span class="settings__toggle-slider"></span>' +
                    '</label>' +
                '</div>';

            overlay.innerHTML =
                '<div class="settings-panel">' +
                    '<div class="settings__header">' +
                        '<button class="settings__close">&times;</button>' +
                        '<span class="settings__title">Настройки</span>' +
                    '</div>' +
                    '<div class="settings__section">' +
                        '<div class="settings__section-title">Режим сна</div>' +
                        statusHTML +
                        planBtn +
                        '<button class="settings__btn" id="settings-new-plan">Новый план</button>' +
                        '<button class="settings__btn" id="settings-routine">Вечерний распорядок</button>' +
                        routineModeHTML +
                        resetBtn +
                    '</div>' +
                    '<div class="settings__section">' +
                        '<div class="settings__section-title">Уведомления</div>' +
                        '<button class="settings__btn" id="settings-notifications">' +
                            '🔔 Напоминания о распорядке' +
                            '<span class="settings__btn-sub">' + notifSummary() + '</span>' +
                        '</button>' +
                        '<button class="settings__btn" id="settings-push">' +
                            '📲 Пуши на телефон' +
                            '<span class="settings__btn-sub">' + pushSummary() + '</span>' +
                        '</button>' +
                    '</div>' +
                    '<div class="settings__version" id="settings-version"></div>' +
                '</div>';

            bindEvents(plan);
            loadVersion();
        });
    }

    function bindEvents(plan) {
        overlay.querySelector('.settings__close').addEventListener('click', close);

        var planDetailBtn = overlay.querySelector('#settings-plan-detail');
        if (planDetailBtn && plan) {
            planDetailBtn.addEventListener('click', function () {
                renderPlanDetail(plan);
            });
        }

        overlay.querySelector('#settings-new-plan').addEventListener('click', function () {
            var input = prompt('Для создания нового плана введите "новый план":');
            if (input && input.trim().toLowerCase() === 'новый план') {
                close();
                SetupWizard.open({
                    onComplete: function () {
                        App.refreshPlan();
                    }
                });
            }
        });

        overlay.querySelector('#settings-routine').addEventListener('click', function () {
            DB.getRoutineSteps().then(function (steps) {
                var useSteps = steps.length ? steps : PhaseEngine.DEFAULT_ROUTINE_STEPS;
                DB.getActivePlan().then(function (activePlan) {
                    var bed = PhaseEngine.DEFAULTS.targetBed;
                    if (activePlan) {
                        var phase = PhaseEngine.getPhaseForDate(activePlan.phases, TimeUtils.todayISO());
                        if (phase) bed = phase.bed;
                    }
                    RoutineEditor.open({
                        steps: useSteps,
                        previewBed: bed,
                        onSave: function (newSteps) {
                            DB.saveRoutineSteps(newSteps).then(function () {
                                Notifications.reloadSteps();
                                Routine.render();
                            });
                        },
                        onCancel: function () {}
                    });
                });
            });
        });

        overlay.querySelector('#settings-notifications').addEventListener('click', function () {
            renderNotifications();
        });

        overlay.querySelector('#settings-push').addEventListener('click', function () {
            renderPush();
        });

        overlay.querySelector('#settings-routine-mode').addEventListener('change', function (e) {
            Routine.setMode(e.target.checked ? 'checklist' : 'list');
            Routine.render();
        });

        var resetBtn = overlay.querySelector('#settings-reset');
        if (resetBtn && plan) {
            resetBtn.addEventListener('click', function () {
                if (confirm('Сбросить текущий план? Данные будут сохранены в архиве.')) {
                    DB.updatePlanStatus(plan.id, 'archived').then(function () {
                        App.refreshPlan();
                        close();
                    });
                }
            });
        }
    }

    /* ── Notifications ── */

    function notifSummary() {
        if (!Notifications.isSupported()) return 'Не поддерживается браузером';
        if (Notifications.permission() === 'denied') return 'Запрещены в браузере';
        if (!Notifications.isEnabled()) return 'Выключены';

        var settings = Notifications.getSettings();
        var count = Notifications.getSteps().filter(function (s) {
            var cfg = settings.steps[s.id];
            return cfg && cfg.on;
        }).length;

        if (!count) return 'Включены · ни один шаг не выбран';
        return 'Включены · ' + count + ' ' + plural(count, 'шаг', 'шага', 'шагов');
    }

    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
        return many;
    }

    function renderNotifications() {
        var supported = Notifications.isSupported();
        var perm = Notifications.permission();
        var enabled = Notifications.isEnabled() && supported && perm !== 'denied';

        var hint;
        if (!supported) {
            hint = 'Этот браузер не умеет показывать уведомления. Открой приложение в Chrome или добавь его на домашний экран.';
        } else if (perm === 'denied') {
            hint = 'Уведомления запрещены в настройках браузера для этого сайта. Разреши их там, затем вернись сюда.';
        } else if (Notifications.supportsTriggers()) {
            hint = 'Напоминания планируются в фоне на неделю вперёд — приложение может быть закрыто.';
        } else {
            hint = 'Этот браузер не умеет будить приложение в фоне: напоминания приходят, пока приложение открыто или свёрнуто, но не выгружено. Время всё равно пересчитывается по текущей фазе.';
        }

        var toggleHTML =
            '<div class="settings__toggle-row">' +
                '<span class="settings__toggle-label">Включить напоминания</span>' +
                '<label class="settings__toggle">' +
                    '<input type="checkbox" id="notif-master"' + (enabled ? ' checked' : '') +
                        (supported && perm !== 'denied' ? '' : ' disabled') + '>' +
                    '<span class="settings__toggle-slider"></span>' +
                '</label>' +
            '</div>';

        var listHTML = '';
        if (enabled) {
            listHTML = Notifications.getSteps().map(buildNotifItem).join('');
            listHTML =
                '<div class="settings__section-title notif-list-title">Шаги распорядка</div>' +
                '<div class="notif-list">' + listHTML + '</div>' +
                '<button class="settings__btn" id="notif-test">Отправить тестовое уведомление</button>';
        }

        overlay.querySelector('.settings-panel').innerHTML =
            '<div class="settings__header">' +
                '<button class="settings__close" id="notif-back">&larr;</button>' +
                '<span class="settings__title">Уведомления</span>' +
            '</div>' +
            toggleHTML +
            '<div class="notif-hint">' + hint + '</div>' +
            listHTML;

        bindNotifEvents();
    }

    function buildNotifItem(step) {
        var cfg = Notifications.getStepSetting(step.id);
        var tonight = TimeUtils.addDays(TimeUtils.todayISO(), 1);
        var time = Notifications.notifTimeForDate(step, tonight, cfg.lead);

        var html =
            '<div class="notif-item' + (cfg.on ? ' notif-item--on' : '') + '">' +
                '<div class="notif-item__row">' +
                    '<span class="notif-item__emoji">' + step.emoji + '</span>' +
                    '<span class="notif-item__name">' + step.name + '</span>' +
                    '<span class="notif-item__time">' + (cfg.on ? time : Notifications.stepTimeForDate(step, tonight)) + '</span>' +
                    '<label class="settings__toggle">' +
                        '<input type="checkbox" class="notif-item__toggle" data-step="' + step.id + '"' + (cfg.on ? ' checked' : '') + '>' +
                        '<span class="settings__toggle-slider"></span>' +
                    '</label>' +
                '</div>';

        if (cfg.on) {
            var opts = Notifications.LEAD_OPTIONS.map(function (l) {
                return '<option value="' + l + '"' + (l === cfg.lead ? ' selected' : '') + '>' +
                    Notifications.leadLabel(l) + '</option>';
            }).join('');

            var preview = Notifications.previewRows(step).map(function (r) {
                return '<div class="notif-item__preview-row">' +
                    '<span>' + r.label + '</span>' +
                    '<span class="notif-item__preview-time">' + r.time + '</span>' +
                '</div>';
            }).join('');

            html +=
                '<div class="notif-item__detail">' +
                    '<div class="notif-item__lead">' +
                        '<label>Напомнить</label>' +
                        '<select class="notif-item__select" data-step="' + step.id + '">' + opts + '</select>' +
                    '</div>' +
                    '<div class="notif-item__preview">' + preview + '</div>' +
                '</div>';
        }

        return html + '</div>';
    }

    function bindNotifEvents() {
        overlay.querySelector('#notif-back').addEventListener('click', renderContent);

        var master = overlay.querySelector('#notif-master');
        master.addEventListener('change', function (e) {
            if (!e.target.checked) {
                Notifications.setEnabled(false);
                renderNotifications();
                return;
            }
            Notifications.requestPermission().then(function (perm) {
                Notifications.setEnabled(perm === 'granted');
                renderNotifications();
            });
        });

        overlay.querySelectorAll('.notif-item__toggle').forEach(function (input) {
            input.addEventListener('change', function () {
                Notifications.setStepSetting(input.dataset.step, { on: input.checked });
                renderNotifications();
            });
        });

        overlay.querySelectorAll('.notif-item__select').forEach(function (select) {
            select.addEventListener('change', function () {
                Notifications.setStepSetting(select.dataset.step, { lead: +select.value });
                renderNotifications();
            });
        });

        var testBtn = overlay.querySelector('#notif-test');
        if (testBtn) {
            testBtn.addEventListener('click', function () {
                Notifications.test();
            });
        }
    }

    /* ── Push ── */

    function pushSummary() {
        if (!PushSync.isSupported()) return 'Браузер не поддерживает';
        if (!PushSync.isConfigured()) return 'Не настроено';
        if (!PushSync.isEnabled()) return 'Отключены';
        return 'Подключены';
    }

    function escapeAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function renderPush() {
        var cfg = PushSync.getConfig();
        var checks = [
            ['Push в браузере', PushSync.isSupported()],
            ['Добавлено на домашний экран', !PushSync.needsHomeScreen()],
            ['Воркер настроен', PushSync.isConfigured()],
            ['Подписка активна', PushSync.isEnabled()]
        ];

        var checksHTML = checks.map(function (c) {
            return '<div class="push-check">' +
                '<span class="push-check__mark' + (c[1] ? ' push-check__mark--ok' : '') + '">' +
                    (c[1] ? '✓' : '·') +
                '</span>' +
                '<span>' + c[0] + '</span>' +
            '</div>';
        }).join('');

        var err = PushSync.getLastError();
        var errHTML = err ? '<div class="push-error">' + err + '</div>' : '';

        var canToggle = PushSync.isSupported() && !PushSync.needsHomeScreen() && PushSync.isConfigured();

        overlay.querySelector('.settings-panel').innerHTML =
            '<div class="settings__header">' +
                '<button class="settings__close" id="push-back">&larr;</button>' +
                '<span class="settings__title">Пуши на телефон</span>' +
            '</div>' +

            '<div class="notif-hint">' +
                'Уведомления приходят на экран блокировки, даже когда приложение закрыто. ' +
                'Расписание считается здесь и заливается на твой Cloudflare Worker — ' +
                'при смене фазы времена едут автоматически. Инструкция по развёртыванию — ' +
                'в push-worker/README.md.' +
            '</div>' +

            '<div class="push-checks">' + checksHTML + '</div>' +
            errHTML +

            '<div class="settings__section-title">Воркер</div>' +
            '<div class="push-field">' +
                '<label>Адрес</label>' +
                '<input type="url" id="push-url" class="push-input" placeholder="https://sleep-push.xxx.workers.dev" value="' + escapeAttr(cfg.url) + '">' +
            '</div>' +
            '<div class="push-field">' +
                '<label>Токен</label>' +
                '<input type="password" id="push-token" class="push-input" placeholder="ADMIN_TOKEN" value="' + escapeAttr(cfg.token) + '">' +
            '</div>' +
            '<button class="settings__btn" id="push-save">Сохранить</button>' +

            '<div class="settings__toggle-row">' +
                '<span class="settings__toggle-label">Подключить пуши</span>' +
                '<label class="settings__toggle">' +
                    '<input type="checkbox" id="push-toggle"' +
                        (PushSync.isEnabled() ? ' checked' : '') +
                        (canToggle ? '' : ' disabled') + '>' +
                    '<span class="settings__toggle-slider"></span>' +
                '</label>' +
            '</div>' +

            '<div class="push-status" id="push-status"></div>' +
            (PushSync.isEnabled()
                ? '<button class="settings__btn" id="push-test">Отправить тестовый пуш</button>'
                : '') +

            '<div class="settings__version" id="settings-version"></div>';

        bindPushEvents();
        loadPushStatus();
        loadVersion();
    }

    function bindPushEvents() {
        overlay.querySelector('#push-back').addEventListener('click', renderContent);

        overlay.querySelector('#push-save').addEventListener('click', function () {
            PushSync.setConfig({
                url: overlay.querySelector('#push-url').value,
                token: overlay.querySelector('#push-token').value
            });
            renderPush();
        });

        var toggle = overlay.querySelector('#push-toggle');
        toggle.addEventListener('change', function (e) {
            var statusEl = overlay.querySelector('#push-status');
            if (e.target.checked) {
                statusEl.textContent = 'Подключаю…';
                PushSync.enable().then(function () {
                    renderPush();
                }).catch(function () {
                    renderPush();
                });
            } else {
                statusEl.textContent = 'Отключаю…';
                PushSync.disable().then(function () {
                    renderPush();
                });
            }
        });

        var testBtn = overlay.querySelector('#push-test');
        if (testBtn) {
            testBtn.addEventListener('click', function () {
                var statusEl = overlay.querySelector('#push-status');
                statusEl.textContent = 'Отправляю…';
                PushSync.test().then(function (res) {
                    statusEl.textContent = res.ok
                        ? 'Отправлено, ждём на телефоне'
                        : ('Push-сервис ответил ' + res.status);
                }).catch(function (err) {
                    statusEl.textContent = 'Ошибка: ' + (err.message || err);
                });
            });
        }
    }

    function loadPushStatus() {
        if (!PushSync.isEnabled() || !PushSync.isConfigured()) return;
        var el = overlay.querySelector('#push-status');
        if (!el) return;
        el.textContent = 'Проверяю…';

        PushSync.status().then(function (st) {
            var target = overlay && overlay.querySelector('#push-status');
            if (!target) return;
            if (!st.registered) {
                target.textContent = st.error ? ('Ошибка: ' + st.error) : 'Не зарегистрировано на воркере';
                return;
            }
            if (!st.pending) {
                target.textContent = 'Запланировано: ничего. Включи шаги в «Напоминания о распорядке».';
                return;
            }
            var next = new Date(st.next.ts);
            target.textContent = 'Запланировано: ' + st.pending + ' · ближайшее ' +
                next.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) +
                ' — ' + st.next.title;
        });
    }

    function renderPlanDetail(plan) {
        var today = TimeUtils.todayISO();
        var phases = plan.phases;
        var currentPhase = PhaseEngine.getPhaseForDate(phases, today);
        var entries = App.getPhaseBarEntries();

        var totalDays = daysSpan(phases[0].startDate, phases[phases.length - 1].endDate);
        var daysPassed = Math.max(0, daysSpan(phases[0].startDate, today) - 1);
        var daysLeft = Math.max(0, totalDays - daysPassed);
        var startFmt = formatDateRu(plan.startDate);
        var endFmt = formatDateRu(phases[phases.length - 1].endDate);

        var stats = calcStats(phases, entries, today);

        var summaryHTML =
            '<div class="plan-detail__summary">' +
                '<div class="plan-detail__row">' +
                    '<span class="plan-detail__label">Текущий подъём → цель</span>' +
                    '<span class="plan-detail__value">' + plan.currentWake + ' → ' + plan.targetWake + '</span>' +
                '</div>' +
                '<div class="plan-detail__row">' +
                    '<span class="plan-detail__label">Сдвиг за фазу</span>' +
                    '<span class="plan-detail__value">' + plan.stepMinutes + ' мин</span>' +
                '</div>' +
                '<div class="plan-detail__row">' +
                    '<span class="plan-detail__label">Дней на фазу</span>' +
                    '<span class="plan-detail__value">' + (plan.phaseDays || 7) + '</span>' +
                '</div>' +
                '<div class="plan-detail__row">' +
                    '<span class="plan-detail__label">Фаз</span>' +
                    '<span class="plan-detail__value">' + phases.length + '</span>' +
                '</div>' +
                '<div class="plan-detail__row">' +
                    '<span class="plan-detail__label">Период</span>' +
                    '<span class="plan-detail__value">' + startFmt + ' — ' + endFmt + '</span>' +
                '</div>' +
                '<div class="plan-detail__row">' +
                    '<span class="plan-detail__label">Пройдено / осталось</span>' +
                    '<span class="plan-detail__value">' + daysPassed + ' / ' + daysLeft + ' дн.</span>' +
                '</div>' +
                (stats.totalTracked > 0 ?
                    '<div class="plan-detail__row">' +
                        '<span class="plan-detail__label">Попаданий в цель</span>' +
                        '<span class="plan-detail__value">' + stats.hits + ' из ' + stats.totalTracked + ' (' + Math.round(stats.hits / stats.totalTracked * 100) + '%)</span>' +
                    '</div>' +
                    '<div class="plan-detail__row">' +
                        '<span class="plan-detail__label">Среднее отклонение</span>' +
                        '<span class="plan-detail__value">' + (stats.avgDiff > 0 ? '+' : '') + stats.avgDiff + ' мин</span>' +
                    '</div>'
                : '') +
            '</div>';

        var phasesHTML = phases.map(function (p) {
            var pDays = daysSpan(p.startDate, p.endDate);
            var isCurrent = currentPhase && currentPhase.number === p.number;

            var cellsHTML = '';
            for (var d = 0; d < pDays; d++) {
                var dayDate = TimeUtils.addDays(p.startDate, d);
                var isToday = dayDate === today;
                var isPast = dayDate < today;

                var cls = 'plan-detail__cell';
                if (isToday) cls += ' plan-detail__cell--today';

                var icon = '';
                if (isPast) {
                    var entry = entries[dayDate];
                    if (entry && entry.finalWakeTime) {
                        var diff = Math.abs(TimeUtils.diffMinutes(entry.finalWakeTime, p.wake));
                        var cross = diff > 720 ? 1440 - diff : diff;
                        icon = cross <= 15 ? '✓' : '✕';
                        cls += cross <= 15 ? ' plan-detail__cell--ok' : ' plan-detail__cell--fail';
                    }
                }

                cellsHTML += '<span class="' + cls + '" style="background:' + p.color + '">' + icon + '</span>';
            }

            return '<div class="plan-detail__phase' + (isCurrent ? ' plan-detail__phase--current' : '') + '">' +
                '<div class="plan-detail__phase-header">' +
                    '<span class="plan-detail__phase-dot" style="background:' + p.color + '"></span>' +
                    '<span class="plan-detail__phase-name">Фаза ' + p.number + '</span>' +
                    '<span class="plan-detail__phase-times">подъём ' + p.wake + ' · отбой ' + p.bed + '</span>' +
                '</div>' +
                '<div class="plan-detail__phase-dates">' + formatDateShort(p.startDate) + ' — ' + formatDateShort(p.endDate) + '</div>' +
                '<div class="plan-detail__cells">' + cellsHTML + '</div>' +
            '</div>';
        }).join('');

        overlay.querySelector('.settings-panel').innerHTML =
            '<div class="settings__header">' +
                '<button class="settings__close" id="plan-detail-back">&larr;</button>' +
                '<span class="settings__title">Текущий план</span>' +
            '</div>' +
            summaryHTML +
            '<div class="plan-detail__phases">' + phasesHTML + '</div>';

        overlay.querySelector('#plan-detail-back').addEventListener('click', function () {
            renderContent();
        });
    }

    function calcStats(phases, entries, today) {
        var hits = 0;
        var totalTracked = 0;
        var totalDiff = 0;

        phases.forEach(function (p) {
            var pDays = daysSpan(p.startDate, p.endDate);
            for (var d = 0; d < pDays; d++) {
                var dayDate = TimeUtils.addDays(p.startDate, d);
                if (dayDate >= today) continue;
                var entry = entries[dayDate];
                if (entry && entry.finalWakeTime) {
                    totalTracked++;
                    var rawDiff = TimeUtils.diffMinutes(entry.finalWakeTime, p.wake);
                    var signedDiff = rawDiff > 720 ? rawDiff - 1440 : rawDiff;
                    totalDiff += signedDiff;
                    var absDiff = Math.abs(signedDiff);
                    if (absDiff <= 15) hits++;
                }
            }
        });

        return {
            hits: hits,
            totalTracked: totalTracked,
            avgDiff: totalTracked > 0 ? Math.round(totalDiff / totalTracked) : 0
        };
    }

    function daysSpan(startISO, endISO) {
        var a = new Date(startISO + 'T12:00:00');
        var b = new Date(endISO + 'T12:00:00');
        return Math.round((b - a) / 86400000) + 1;
    }

    function formatDateRu(iso) {
        var parts = iso.split('-');
        var months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return parseInt(parts[2]) + ' ' + months[parseInt(parts[1]) - 1];
    }

    function formatDateShort(iso) {
        var parts = iso.split('-');
        return parseInt(parts[2]) + '.' + parts[1];
    }

    function loadVersion() {
        fetch('./sw.js').then(function (r) { return r.text(); }).then(function (text) {
            var m = text.match(/sleep-tracker-(v\d+)/);
            var el = overlay && overlay.querySelector('#settings-version');
            if (m && el) el.textContent = 'Версия: ' + m[1];
        }).catch(function () {});
    }

    return { open, close };
})();
