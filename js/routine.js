const Routine = (() => {
    let currentDate = TimeUtils.todayISO();
    let activePlan = null;
    let routineSteps = null;
    let progress = {};

    // Утренний распорядок — фиксированные шаги без времени.
    // Отметки хранятся в том же routineProgress, что и вечерние: id с префиксом
    // morning_ не пересекаются с id вечерних шагов (step_…).
    const MORNING_STEPS = [
        { id: 'morning_wake',     emoji: '⏰', name: 'Подъём' },
        { id: 'morning_tracker',  emoji: '📝', name: 'Заполнить трекер' },
        { id: 'morning_teeth',    emoji: '🪥', name: 'Чистить зубы' },
        { id: 'morning_exercise', emoji: '🏃', name: 'Физическое упражнение — поднять пульс' },
        { id: 'morning_window',   emoji: '🪟', name: 'Открыть окно' },
        { id: 'morning_walk',     emoji: '🚶', name: 'Прогулка — минимум 15 минут' },
        { id: 'morning_bed',      emoji: '🛏', name: 'Заправить кровать' },
        { id: 'morning_prayer',   emoji: '🙏', name: 'Молитва' },
        { id: 'morning_meal',     emoji: '🍳', name: 'Завтрак' },
        { id: 'morning_plan',     emoji: '📋', name: 'Планирование дня' }
    ];

    function getMode() {
        return localStorage.getItem('routineMode') || 'list';
    }

    function setMode(mode) {
        localStorage.setItem('routineMode', mode);
    }

    function setPlan(plan) {
        activePlan = plan;
    }

    function setDate(isoDate) {
        currentDate = isoDate;
        render();
    }

    function render() {
        const container = document.getElementById('routine-view');

        Promise.all([
            DB.getRoutineSteps(),
            DB.getRoutineProgress(currentDate)
        ]).then(([dbSteps, prog]) => {
            routineSteps = dbSteps.length ? dbSteps : PhaseEngine.DEFAULT_ROUTINE_STEPS;
            progress = prog || {};

            const ctx = PhaseEngine.getDayContext(activePlan, routineSteps, currentDate);
            const mode = getMode();
            const isChecklist = mode === 'checklist';
            const isPast = currentDate < App.activeDate();

            const checkableItems = ctx.routine.filter(r => !r.step.isFixed);
            const checked = checkableItems.filter(r => progress[r.step.id]).length;
            const total = checkableItems.length;

            const progressHTML = isChecklist ? buildProgressHTML(checked, total) : '';

            const morningHTML = buildMorningHTML(isChecklist, isPast);

            const itemsHTML = ctx.routine.map(r => {
                if (isChecklist && !r.step.isFixed) {
                    const isChecked = !!progress[r.step.id];
                    const disabled = isPast ? ' disabled' : '';
                    return '<label class="routine-step">' +
                        '<input type="checkbox" class="routine-step__input" data-step-id="' + r.step.id + '"' + (isChecked ? ' checked' : '') + disabled + '>' +
                        '<span class="routine-step__box"></span>' +
                        '<span class="routine-step__time">' + r.time + '</span>' +
                        '<span class="routine-step__emoji">' + r.step.emoji + '</span>' +
                        '<span class="routine-step__name">' + r.step.name + '</span>' +
                    '</label>';
                }

                return '<div class="routine-list-item">' +
                    '<span class="routine-list-item__time">' + r.time + '</span>' +
                    '<span class="routine-list-item__emoji">' + r.step.emoji + '</span>' +
                    '<span class="routine-list-item__name">' + r.step.name + '</span>' +
                '</div>';
            }).join('');

            container.innerHTML =
                morningHTML +
                '<div class="protocol-section" data-routine="evening">' +
                    '<div class="protocol-section__title">🌙 Вечерний распорядок</div>' +
                    progressHTML +
                    itemsHTML +
                '</div>';

            if (isChecklist && !isPast) {
                bindCheckboxes();
            }
        });
    }

    function buildProgressHTML(checked, total) {
        if (total === 0) return '';
        return '<div class="protocol-progress">' +
                '<div class="protocol-progress__bar">' +
                    '<div class="protocol-progress__fill" style="width: ' + (checked / total * 100) + '%"></div>' +
                '</div>' +
                '<div class="protocol-progress__text">' + checked + ' / ' + total + ' выполнено</div>' +
            '</div>';
    }

    function buildMorningHTML(isChecklist, isPast) {
        const checked = MORNING_STEPS.filter(s => progress[s.id]).length;
        const progressHTML = isChecklist ? buildProgressHTML(checked, MORNING_STEPS.length) : '';

        const itemsHTML = MORNING_STEPS.map(s => {
            if (isChecklist) {
                const isChecked = !!progress[s.id];
                const disabled = isPast ? ' disabled' : '';
                return '<label class="routine-step">' +
                    '<input type="checkbox" class="routine-step__input" data-step-id="' + s.id + '"' + (isChecked ? ' checked' : '') + disabled + '>' +
                    '<span class="routine-step__box"></span>' +
                    '<span class="routine-step__emoji">' + s.emoji + '</span>' +
                    '<span class="routine-step__name">' + s.name + '</span>' +
                '</label>';
            }
            return '<div class="routine-list-item">' +
                '<span class="routine-list-item__emoji">' + s.emoji + '</span>' +
                '<span class="routine-list-item__name">' + s.name + '</span>' +
            '</div>';
        }).join('');

        return '<div class="protocol-section" data-routine="morning">' +
                '<div class="protocol-section__title">☀️ Утренний распорядок</div>' +
                progressHTML +
                itemsHTML +
            '</div>';
    }

    function bindCheckboxes() {
        document.querySelectorAll('#routine-view .routine-step__input').forEach(input => {
            input.addEventListener('change', () => {
                const stepId = input.dataset.stepId;
                progress[stepId] = input.checked;
                if (!input.checked) delete progress[stepId];
                DB.toggleRoutineProgress(currentDate, stepId);
                updateProgress();
            });
        });
    }

    function updateSectionProgress(sectionName, steps) {
        const checked = steps.filter(s => progress[s.id]).length;
        const total = steps.length;
        const section = document.querySelector('#routine-view [data-routine="' + sectionName + '"]');
        if (!section) return;
        const fill = section.querySelector('.protocol-progress__fill');
        const text = section.querySelector('.protocol-progress__text');
        if (fill) fill.style.width = (total ? (checked / total * 100) : 0) + '%';
        if (text) text.textContent = checked + ' / ' + total + ' выполнено';
    }

    function updateProgress() {
        updateSectionProgress('morning', MORNING_STEPS);
        updateSectionProgress('evening', routineSteps.filter(s => !s.isFixed));
    }

    return { render, setDate, setPlan, getMode, setMode };
})();
