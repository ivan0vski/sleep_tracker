const PhaseCalendar = (() => {
    let overlay = null;
    let currentMonth = null;
    let plan = null;

    const MONTH_NAMES = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    function open(activePlan, selectedDate) {
        if (overlay) close();
        plan = activePlan;
        const [y, m] = selectedDate.split('-').map(Number);
        currentMonth = { year: y, month: m - 1 };
        render(selectedDate);
    }

    function close() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    }

    function render(selectedDate) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'phase-calendar-overlay';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            document.body.appendChild(overlay);
        }

        const { year, month } = currentMonth;
        const firstDay = new Date(year, month, 1);
        let startDow = firstDay.getDay();
        if (startDow === 0) startDow = 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const headerHTML = `
            <div class="phase-cal__header">
                <button class="phase-cal__nav" data-dir="-1">&larr;</button>
                <span class="phase-cal__month">${MONTH_NAMES[month]} ${year}</span>
                <button class="phase-cal__nav" data-dir="1">&rarr;</button>
            </div>
        `;

        const dayNamesHTML = DAY_NAMES.map(d =>
            `<span class="phase-cal__dayname">${d}</span>`
        ).join('');

        let cellsHTML = '';
        for (let i = 1; i < startDow; i++) {
            cellsHTML += '<span class="phase-cal__cell phase-cal__cell--empty"></span>';
        }

        const today = TimeUtils.todayISO();
        for (let d = 1; d <= daysInMonth; d++) {
            const iso = year + '-' +
                String(month + 1).padStart(2, '0') + '-' +
                String(d).padStart(2, '0');

            const phase = plan && plan.phases
                ? PhaseEngine.getPhaseForDate(plan.phases, iso)
                : null;

            const isSelected = iso === selectedDate;
            const isToday = iso === today;

            let cls = 'phase-cal__cell';
            if (isSelected) cls += ' phase-cal__cell--selected';
            if (isToday) cls += ' phase-cal__cell--today';

            let style = '';
            if (phase) {
                style = `background: ${phase.color}22; color: ${phase.color};`;
                if (isSelected) {
                    style = `background: ${phase.color}; color: #fff;`;
                }
            }

            cellsHTML += `<span class="${cls}" data-date="${iso}" style="${style}">${d}</span>`;
        }

        overlay.innerHTML = `
            <div class="phase-cal">
                ${headerHTML}
                <div class="phase-cal__grid">
                    ${dayNamesHTML}
                    ${cellsHTML}
                </div>
                <button class="phase-cal__today-btn" ${today === selectedDate ? 'style="visibility:hidden"' : ''}>Сегодня</button>
            </div>
        `;

        overlay.querySelector('.phase-cal').addEventListener('click', (e) => {
            const nav = e.target.closest('[data-dir]');
            if (nav) {
                const dir = parseInt(nav.dataset.dir);
                currentMonth.month += dir;
                if (currentMonth.month < 0) { currentMonth.month = 11; currentMonth.year--; }
                if (currentMonth.month > 11) { currentMonth.month = 0; currentMonth.year++; }
                render(selectedDate);
                return;
            }

            const cell = e.target.closest('[data-date]');
            if (cell) {
                App.setDate(cell.dataset.date);
                close();
                return;
            }

            if (e.target.closest('.phase-cal__today-btn')) {
                App.setDate(today);
                close();
            }
        });
    }

    return { open, close };
})();
