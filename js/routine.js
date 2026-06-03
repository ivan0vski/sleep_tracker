const Routine = (() => {
    let currentDate = TimeUtils.todayISO();
    let activePlan = null;
    let routineSteps = null;
    let progress = {};

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
            const isPast = currentDate < TimeUtils.todayISO();

            const checkableItems = ctx.routine.filter(r => !r.step.isFixed);
            const checked = checkableItems.filter(r => progress[r.step.id]).length;
            const total = checkableItems.length;

            let progressHTML = '';
            if (isChecklist && total > 0) {
                progressHTML =
                    '<div class="protocol-progress">' +
                        '<div class="protocol-progress__bar">' +
                            '<div class="protocol-progress__fill" style="width: ' + (checked / total * 100) + '%"></div>' +
                        '</div>' +
                        '<div class="protocol-progress__text">' + checked + ' / ' + total + ' выполнено</div>' +
                    '</div>';
            }

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
                '<div class="protocol-section">' +
                    '<div class="protocol-section__title">🌙 Вечерний распорядок</div>' +
                    progressHTML +
                    itemsHTML +
                '</div>';

            if (isChecklist && !isPast) {
                bindCheckboxes();
            }
        });
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

    function updateProgress() {
        const checkableItems = routineSteps.filter(s => !s.isFixed);
        const checked = checkableItems.filter(s => progress[s.id]).length;
        const total = checkableItems.length;
        const fill = document.querySelector('#routine-view .protocol-progress__fill');
        const text = document.querySelector('#routine-view .protocol-progress__text');
        if (fill) fill.style.width = (total ? (checked / total * 100) : 0) + '%';
        if (text) text.textContent = checked + ' / ' + total + ' выполнено';
    }

    return { render, setDate, setPlan, getMode, setMode };
})();
