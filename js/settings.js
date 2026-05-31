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
            if (plan) {
                var phase = PhaseEngine.getPhaseForDate(plan.phases, TimeUtils.todayISO());
                var phaseText = phase
                    ? 'Фаза ' + phase.number + ' из ' + plan.phases.length
                    : 'План завершён';
                statusHTML =
                    '<div class="settings__status">' +
                        '<div class="settings__status-line">' + phaseText + '</div>' +
                        '<div class="settings__status-sub">Цель: подъём ' + plan.targetWake + '</div>' +
                    '</div>';
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

        overlay.querySelector('#settings-new-plan').addEventListener('click', function () {
            var input = prompt('Для создания нового плана введите "новый план":');
            if (input && input.trim().toLowerCase() === 'новый план') {
                close();
                SetupWizard.open({
                    onComplete: function () {
                        window.location.reload();
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
                        window.location.reload();
                    });
                }
            });
        }
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
