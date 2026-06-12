const SetupWizard = (() => {

    const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    let overlay = null;
    let currentStep = 1;
    let config = {};
    let routineSteps = [];
    let onComplete = null;

    function open(opts) {
        currentStep = 1;
        config = {
            currentWake: '09:00',
            targetWake: '06:00',
            stepMinutes: null,
            phaseDays: null,
            desiredSleepHours: null
        };
        routineSteps = PhaseEngine.DEFAULT_ROUTINE_STEPS.map(s => ({ ...s }));
        onComplete = (opts && opts.onComplete) || null;
        render();
    }

    function close() {
        if (overlay) { overlay.remove(); overlay = null; }
    }

    function render() {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'wizard-overlay';
            document.body.appendChild(overlay);
        }

        const renderers = [null, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];
        const content = renderers[currentStep]();
        const canNext = validate();

        let footerHTML = '';
        if (currentStep > 1) {
            footerHTML += '<button class="wizard__btn wizard__btn--back">Назад</button>';
        } else {
            footerHTML += '<div></div>';
        }
        if (currentStep < 7) {
            footerHTML += '<button class="wizard__btn wizard__btn--next"' + (canNext ? '' : ' disabled') + '>Далее</button>';
        }
        if (currentStep === 7) {
            footerHTML += '<button class="wizard__btn wizard__btn--start">Начать</button>';
        }

        overlay.innerHTML =
            '<div class="wizard">' +
                '<div class="wizard__header">' +
                    '<button class="wizard__close">&times;</button>' +
                    '<span class="wizard__indicator">Шаг ' + currentStep + ' из 7</span>' +
                '</div>' +
                '<div class="wizard__body">' + content + '</div>' +
                '<div class="wizard__footer">' + footerHTML + '</div>' +
            '</div>';

        bindEvents();
    }

    function bindEvents() {
        overlay.querySelector('.wizard__close').addEventListener('click', close);

        var backBtn = overlay.querySelector('.wizard__btn--back');
        if (backBtn) backBtn.addEventListener('click', function () { currentStep--; render(); });

        var nextBtn = overlay.querySelector('.wizard__btn--next');
        if (nextBtn) nextBtn.addEventListener('click', function () {
            readCurrentStep();
            if (validate()) { currentStep++; render(); }
        });

        var startBtn = overlay.querySelector('.wizard__btn--start');
        if (startBtn) startBtn.addEventListener('click', createPlan);

        if (currentStep === 1) bindStep1();
        if (currentStep === 2) bindStep2();
        if (currentStep === 3) bindStep3();
        if (currentStep === 4) bindStep4();
        if (currentStep === 5) bindStep5();
        if (currentStep === 6) bindStep6();
    }

    // --- Step renderers ---

    function renderStep1() {
        return '<h2 class="wizard__title">Во сколько ты обычно встаёшь?</h2>' +
            '<p class="wizard__hint">Выбери текущее время подъёма</p>' +
            '<select class="wizard__select" id="wiz-currentWake">' +
                buildTimeOptions(config.currentWake) +
            '</select>';
    }

    function renderStep2() {
        return '<h2 class="wizard__title">Во сколько хочешь вставать?</h2>' +
            '<p class="wizard__hint">Выбери целевое время подъёма</p>' +
            '<select class="wizard__select" id="wiz-targetWake">' +
                buildTimeOptions(config.targetWake) +
            '</select>' +
            '<div class="wizard__error" id="wiz-error"></div>';
    }

    function renderStep3() {
        var btns = PhaseEngine.STEP_OPTIONS.map(function (v) {
            var cls = 'wizard__option' + (config.stepMinutes === v ? ' wizard__option--active' : '');
            return '<button class="' + cls + '" data-value="' + v + '">' + v + ' мин</button>';
        }).join('');

        return '<h2 class="wizard__title">На сколько сдвигать за фазу?</h2>' +
            '<p class="wizard__hint">Выбери шаг сдвига в минутах</p>' +
            '<div class="wizard__options" id="wiz-stepMinutes">' + btns + '</div>' +
            '<div class="wizard__preview" id="wiz-step-preview">' + buildStepPreview() + '</div>';
    }

    function renderStep4() {
        var btns = PhaseEngine.PHASE_DAYS_OPTIONS.map(function (v) {
            var cls = 'wizard__option' + (config.phaseDays === v ? ' wizard__option--active' : '');
            var label = v === 1 ? '1 день' : v + ' ' + pluralize(v, 'день', 'дня', 'дней');
            return '<button class="' + cls + '" data-value="' + v + '">' + label + '</button>';
        }).join('');

        return '<h2 class="wizard__title">Сколько дней на каждую фазу?</h2>' +
            '<p class="wizard__hint">Чем меньше — тем быстрее сдвиг</p>' +
            '<div class="wizard__options" id="wiz-phaseDays">' + btns + '</div>' +
            '<div class="wizard__preview" id="wiz-phase-preview">' + buildPhaseDaysPreview() + '</div>';
    }

    function renderStep5() {
        var options = [7, 7.5, 8, 8.5, 9];
        var btns = options.map(function (v) {
            var cls = 'wizard__option' + (config.desiredSleepHours === v ? ' wizard__option--active' : '');
            return '<button class="' + cls + '" data-value="' + v + '">' + v + '</button>';
        }).join('');

        return '<h2 class="wizard__title">Сколько часов сна тебе нужно?</h2>' +
            '<p class="wizard__hint">Большинству взрослых нужно 7.5–9 часов</p>' +
            '<div class="wizard__options" id="wiz-sleepHours">' + btns + '</div>';
    }

    function renderStep6() {
        var phases = getPreviewPhases();
        var bed = phases.length ? phases[0].bed : PhaseEngine.DEFAULTS.targetBed;
        var bedMin = TimeUtils.parseTime(bed);
        var sorted = routineSteps.slice().sort(function (a, b) { return a.offsetMinutes - b.offsetMinutes; });

        var items = sorted.map(function (s) {
            var time = TimeUtils.formatTime(bedMin + s.offsetMinutes);
            return '<div class="wizard__routine-item">' +
                '<span class="wizard__routine-emoji">' + s.emoji + '</span>' +
                '<span class="wizard__routine-name">' + s.name + '</span>' +
                '<span class="wizard__routine-time">' + time + '</span>' +
            '</div>';
        }).join('');

        return '<h2 class="wizard__title">Твой вечерний распорядок</h2>' +
            '<p class="wizard__hint">Времена для первой фазы (отбой ' + bed + ')</p>' +
            '<div class="wizard__routine-list">' + items + '</div>' +
            '<button class="wizard__edit-routine" id="wiz-edit-routine">Редактировать</button>';
    }

    function renderStep7() {
        var phases = getPreviewPhases();
        var phaseDays = config.phaseDays || PhaseEngine.DEFAULTS.phaseDays;
        var totalDays = phases.length * phaseDays;
        var prepDate = TimeUtils.todayISO();
        var startDate = TimeUtils.addDays(prepDate, 1);
        var finishDate = phases.length ? phases[phases.length - 1].endDate : startDate;

        var rows = phases.map(function (p) {
            return '<div class="wizard__phase-row">' +
                '<span class="wizard__phase-dot" style="background:' + p.color + '"></span>' +
                '<span class="wizard__phase-num">Фаза ' + p.number + '</span>' +
                '<span class="wizard__phase-times">' + p.wake + ' / ' + p.bed + '</span>' +
                '<span class="wizard__phase-dates">' + formatDateShort(p.startDate) + ' — ' + formatDateShort(p.endDate) + '</span>' +
            '</div>';
        }).join('');

        return '<h2 class="wizard__title">Твой план</h2>' +
            '<div class="wizard__summary">' +
                '<div class="wizard__summary-line wizard__summary-accent">' +
                    phases.length + ' ' + pluralize(phases.length, 'фаза', 'фазы', 'фаз') +
                    ' · ' + totalDays + ' ' + pluralize(totalDays, 'день', 'дня', 'дней') +
                '</div>' +
                '<div class="wizard__summary-line">' + formatDateRu(prepDate) + ' — день подготовки</div>' +
                '<div class="wizard__summary-line">Старт фазы 1: ' + formatDateRu(startDate) + '</div>' +
                '<div class="wizard__summary-line">Финиш: ' + formatDateRu(finishDate) + '</div>' +
            '</div>' +
            '<div class="wizard__phase-table">' + rows + '</div>';
    }

    // --- Step bindings ---

    function bindStep1() {
        overlay.querySelector('#wiz-currentWake').addEventListener('change', function (e) {
            config.currentWake = e.target.value;
        });
    }

    function bindStep2() {
        var sel = overlay.querySelector('#wiz-targetWake');
        sel.addEventListener('change', function (e) {
            config.targetWake = e.target.value;
            showStep2Validation();
        });
        showStep2Validation();
    }

    function bindStep3() {
        overlay.querySelectorAll('#wiz-stepMinutes .wizard__option').forEach(function (btn) {
            btn.addEventListener('click', function () {
                config.stepMinutes = +btn.dataset.value;
                overlay.querySelectorAll('#wiz-stepMinutes .wizard__option').forEach(function (b) {
                    b.classList.toggle('wizard__option--active', +b.dataset.value === config.stepMinutes);
                });
                var preview = overlay.querySelector('#wiz-step-preview');
                if (preview) preview.innerHTML = buildStepPreview();
                updateNextButton();
            });
        });
    }

    function bindStep4() {
        overlay.querySelectorAll('#wiz-phaseDays .wizard__option').forEach(function (btn) {
            btn.addEventListener('click', function () {
                config.phaseDays = +btn.dataset.value;
                overlay.querySelectorAll('#wiz-phaseDays .wizard__option').forEach(function (b) {
                    b.classList.toggle('wizard__option--active', +b.dataset.value === config.phaseDays);
                });
                var preview = overlay.querySelector('#wiz-phase-preview');
                if (preview) preview.innerHTML = buildPhaseDaysPreview();
                updateNextButton();
            });
        });
    }

    function bindStep5() {
        overlay.querySelectorAll('#wiz-sleepHours .wizard__option').forEach(function (btn) {
            btn.addEventListener('click', function () {
                config.desiredSleepHours = +btn.dataset.value;
                overlay.querySelectorAll('#wiz-sleepHours .wizard__option').forEach(function (b) {
                    b.classList.toggle('wizard__option--active', +b.dataset.value === config.desiredSleepHours);
                });
                updateNextButton();
            });
        });
    }

    function bindStep6() {
        overlay.querySelector('#wiz-edit-routine').addEventListener('click', function () {
            var phases = getPreviewPhases();
            var bed = phases.length ? phases[0].bed : PhaseEngine.DEFAULTS.targetBed;
            RoutineEditor.open({
                steps: routineSteps,
                previewBed: bed,
                onSave: function (newSteps) {
                    routineSteps = newSteps;
                    render();
                },
                onCancel: function () {}
            });
        });
    }

    // --- Validation ---

    function showStep2Validation() {
        var errEl = overlay.querySelector('#wiz-error');
        if (!errEl) return;
        var cw = TimeUtils.parseTime(config.currentWake);
        var tw = TimeUtils.parseTime(config.targetWake);
        if (tw === cw) {
            errEl.textContent = 'Ты уже на целевом режиме!';
            errEl.className = 'wizard__error wizard__error--warn';
        } else if (tw > cw) {
            errEl.textContent = 'Целевой подъём должен быть раньше текущего';
            errEl.className = 'wizard__error wizard__error--err';
        } else {
            errEl.textContent = '';
            errEl.className = 'wizard__error';
        }
        updateNextButton();
    }

    function validate() {
        if (currentStep === 2) {
            return TimeUtils.parseTime(config.targetWake) < TimeUtils.parseTime(config.currentWake);
        }
        if (currentStep === 3) return config.stepMinutes !== null;
        if (currentStep === 4) return config.phaseDays !== null;
        if (currentStep === 5) return config.desiredSleepHours !== null;
        return true;
    }

    function updateNextButton() {
        var btn = overlay.querySelector('.wizard__btn--next');
        if (btn) btn.disabled = !validate();
    }

    function readCurrentStep() {
        if (currentStep === 1) {
            var sel = overlay.querySelector('#wiz-currentWake');
            if (sel) config.currentWake = sel.value;
        }
        if (currentStep === 2) {
            var sel2 = overlay.querySelector('#wiz-targetWake');
            if (sel2) config.targetWake = sel2.value;
        }
    }

    // --- Helpers ---

    function getPreviewPhases() {
        if (!config.stepMinutes) return [];
        return PhaseEngine.calculatePhases({
            currentWake: config.currentWake,
            targetWake: config.targetWake,
            desiredSleepHours: config.desiredSleepHours || PhaseEngine.DEFAULTS.desiredSleepHours,
            stepMinutes: config.stepMinutes,
            phaseDays: config.phaseDays || PhaseEngine.DEFAULTS.phaseDays,
            startDate: TimeUtils.addDays(TimeUtils.todayISO(), 1)
        });
    }

    function buildStepPreview() {
        if (!config.stepMinutes) return '';
        var cw = TimeUtils.parseTime(config.currentWake);
        var tw = TimeUtils.parseTime(config.targetWake);
        var diff = cw - tw;
        if (diff <= 0) return '';
        var phaseCount = Math.ceil(diff / config.stepMinutes);
        return '<span class="wizard__preview-text">' +
            phaseCount + ' ' + pluralize(phaseCount, 'фаза', 'фазы', 'фаз') +
            '</span>';
    }

    function buildPhaseDaysPreview() {
        if (!config.stepMinutes || !config.phaseDays) return '';
        var phases = getPreviewPhases();
        if (!phases.length) return '';
        var totalDays = phases.length * config.phaseDays;
        var finishDate = phases[phases.length - 1].endDate;
        return '<span class="wizard__preview-text">' +
            phases.length + ' ' + pluralize(phases.length, 'фаза', 'фазы', 'фаз') +
            ' · ' + totalDays + ' ' + pluralize(totalDays, 'день', 'дня', 'дней') +
            '<br>Финиш: ' + formatDateRu(finishDate) + '</span>';
    }

    function buildTimeOptions(selected) {
        var html = '';
        for (var m = 0; m < 1440; m += 15) {
            var val = TimeUtils.formatTime(m);
            html += '<option value="' + val + '"' + (val === selected ? ' selected' : '') + '>' + val + '</option>';
        }
        return html;
    }

    function formatDateRu(isoDate) {
        var d = new Date(isoDate + 'T12:00:00');
        return d.getDate() + ' ' + MONTHS[d.getMonth()];
    }

    function formatDateShort(isoDate) {
        var d = new Date(isoDate + 'T12:00:00');
        return d.getDate() + ' ' + MONTHS[d.getMonth()].substring(0, 3);
    }

    function pluralize(n, one, few, many) {
        var mod10 = n % 10;
        var mod100 = n % 100;
        if (mod100 >= 11 && mod100 <= 19) return many;
        if (mod10 === 1) return one;
        if (mod10 >= 2 && mod10 <= 4) return few;
        return many;
    }

    async function createPlan() {
        var activePlan = await DB.getActivePlan();
        if (activePlan) await DB.updatePlanStatus(activePlan.id, 'archived');

        var prepDate = TimeUtils.todayISO();
        var startDate = TimeUtils.addDays(prepDate, 1);
        var phases = PhaseEngine.calculatePhases({
            currentWake: config.currentWake,
            targetWake: config.targetWake,
            desiredSleepHours: config.desiredSleepHours,
            stepMinutes: config.stepMinutes,
            phaseDays: config.phaseDays,
            startDate: startDate
        });

        var plan = {
            id: 'plan_' + Date.now(),
            status: 'active',
            currentWake: config.currentWake,
            targetWake: config.targetWake,
            desiredSleepHours: config.desiredSleepHours,
            stepMinutes: config.stepMinutes,
            phaseDays: config.phaseDays,
            prepDate: prepDate,
            startDate: startDate,
            phases: phases,
            createdAt: new Date().toISOString()
        };

        await DB.savePlan(plan);
        await DB.saveRoutineSteps(routineSteps);
        close();
        if (onComplete) onComplete(plan);
    }

    return { open, close };
})();
