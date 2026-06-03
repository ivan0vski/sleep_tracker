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
                        resetBtn +
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
                            DB.saveRoutineSteps(newSteps);
                        },
                        onCancel: function () {}
                    });
                });
            });
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
                    if (entry && entry.outOfBedTime) {
                        var diff = Math.abs(TimeUtils.diffMinutes(entry.outOfBedTime, p.wake));
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
                if (entry && entry.outOfBedTime) {
                    totalTracked++;
                    var rawDiff = TimeUtils.diffMinutes(entry.outOfBedTime, p.wake);
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
