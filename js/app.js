const App = (() => {
    let currentDate = TimeUtils.todayISO();
    let activePlan = null;

    const TAB_ORDER = ['form', 'protocol', 'routine', 'instruction', 'history'];
    let currentIndex = 0;
    let container = null;

    function formatDateDisplay(isoDate) {
        const [y, m, d] = isoDate.split('-');
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
    }

    function updateDateDisplay() {
        document.getElementById('date-display').textContent = formatDateDisplay(currentDate);
        updateTodayButton();
    }

    function updateTodayButton() {
        const btn = document.getElementById('btn-today');
        if (btn) {
            btn.classList.toggle('btn-today--hidden', currentDate === TimeUtils.todayISO());
        }
    }

    let phaseBarEntries = {};

    function renderPhaseBar() {
        const wrap = document.getElementById('phase-bar-wrap');
        if (!activePlan || !activePlan.phases || !activePlan.phases.length) {
            wrap.innerHTML = '';
            wrap.style.display = 'none';
            return;
        }

        const phase = PhaseEngine.getPhaseForDate(activePlan.phases, currentDate);
        if (!phase) {
            wrap.innerHTML = '';
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = '';

        const phaseDays = daysBetween(phase.startDate, phase.endDate) + 1;
        const today = TimeUtils.todayISO();

        let cellsHTML = '';
        for (let d = 0; d < phaseDays; d++) {
            const dayDate = TimeUtils.addDays(phase.startDate, d);
            const isSelected = dayDate === currentDate;
            const isToday = dayDate === today;
            const isPast = dayDate < today;

            let cls = 'phase-bar__cell';
            if (isSelected) cls += ' phase-bar__cell--selected';
            if (isToday) cls += ' phase-bar__cell--today';

            let icon = '';
            if (isPast) {
                const entry = phaseBarEntries[dayDate];
                if (entry && entry.finalWakeTime) {
                    const diff = Math.abs(TimeUtils.diffMinutes(entry.finalWakeTime, phase.wake));
                    const crossMidnight = diff > 720 ? 1440 - diff : diff;
                    icon = crossMidnight <= 15
                        ? '<span class="phase-bar__icon phase-bar__icon--ok">✓</span>'
                        : '<span class="phase-bar__icon phase-bar__icon--fail">✕</span>';
                }
            }

            cellsHTML += `<div class="${cls}" style="background:${phase.color}" data-date="${dayDate}">${icon}</div>`;
        }

        wrap.innerHTML = `<div class="phase-bar">${cellsHTML}</div>`;
    }

    function loadPhaseBarEntries() {
        if (!activePlan || !activePlan.phases || !activePlan.phases.length) {
            phaseBarEntries = {};
            return Promise.resolve();
        }
        return DB.getAllEntries().then(entries => {
            phaseBarEntries = {};
            entries.forEach(e => { phaseBarEntries[e.date] = e; });
        });
    }

    function renderPhaseLabel() {
        const el = document.getElementById('phase-label');
        if (!activePlan || !activePlan.phases || !activePlan.phases.length) {
            el.innerHTML = '';
            el.style.display = 'none';
            return;
        }

        const phase = PhaseEngine.getPhaseForDate(activePlan.phases, currentDate);
        if (!phase) {
            el.innerHTML = '';
            el.style.display = 'none';
            return;
        }

        const dayInPhase = daysBetween(phase.startDate, currentDate) + 1;
        el.style.display = '';
        el.innerHTML = `
            <span class="phase-label__dot" style="background:${phase.color}"></span>
            <span class="phase-label__text">Фаза ${phase.number} · день ${dayInPhase} · подъём ${phase.wake} · отбой ${phase.bed}</span>
        `;
    }

    function daysBetween(isoA, isoB) {
        const a = new Date(isoA + 'T12:00:00');
        const b = new Date(isoB + 'T12:00:00');
        return Math.round((b - a) / 86400000);
    }

    function loadActivePlan() {
        return DB.getActivePlan().then(plan => {
            activePlan = plan;
        });
    }

    function shiftDate(offset) {
        const d = new Date(currentDate + 'T12:00:00');
        d.setDate(d.getDate() + offset);
        currentDate = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
        updateDateDisplay();
        renderPhaseBar();
        renderPhaseLabel();
        SleepForm.setDate(currentDate);
        Protocol.setDate(currentDate);
        Routine.setDate(currentDate);
        Instruction.setDate(currentDate);
        container.querySelectorAll('.view').forEach(v => v.scrollTop = 0);
    }

    function initTheme() {
        const saved = localStorage.getItem('theme');
        if (saved) {
            applyTheme(saved);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(prefersDark ? 'dark' : 'light');
        }
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            applyTheme(next);
            localStorage.setItem('theme', next);
        });
    }

    function applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        document.getElementById('theme-toggle').textContent = theme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.content = theme === 'light' ? '#f0f0f5' : '#1a1a2e';
    }

    /* ── Navigation ── */

    function slideTo(index, instant) {
        if (instant) {
            container.classList.add('swipe-container--dragging');
            container.style.transform = `translateX(-${index * 20}%)`;
            container.offsetWidth;
            container.classList.remove('swipe-container--dragging');
        }
        container.style.transform = `translateX(-${index * 20}%)`;
    }

    function setupSwipe() {
        const SNAP_THRESHOLD = 0.075;
        let startX = null;
        let startY = null;
        let isDragging = false;
        let isLocked = false;
        let baseOffset = 0;
        let viewWidth = 0;

        document.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = false;
            isLocked = false;
            viewWidth = container.parentElement.offsetWidth;
            baseOffset = currentIndex * viewWidth;
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (startX === null || isLocked) return;
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const deltaX = x - startX;
            const deltaY = y - startY;

            if (!isDragging) {
                if (Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) return;
                if (Math.abs(deltaY) > Math.abs(deltaX)) {
                    isLocked = true;
                    startX = null;
                    return;
                }
                e.preventDefault();
                isDragging = true;
                startX = x;
                container.querySelectorAll('.view').forEach((v, i) => {
                    if (i !== currentIndex) v.scrollTop = 0;
                });
                container.classList.add('swipe-container--dragging');
                return;
            }

            e.preventDefault();
            const dragDelta = x - startX;
            let offset = baseOffset - dragDelta;
            const maxOffset = (TAB_ORDER.length - 1) * viewWidth;
            offset = Math.max(-viewWidth * 0.15, Math.min(offset, maxOffset + viewWidth * 0.15));
            container.style.transform = `translateX(-${offset}px)`;
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!isDragging) {
                startX = null;
                isLocked = false;
                return;
            }
            container.classList.remove('swipe-container--dragging');
            const deltaX = e.changedTouches[0].clientX - startX;
            startX = null;
            isDragging = false;
            isLocked = false;

            const swipeRatio = Math.abs(deltaX) / viewWidth;
            if (swipeRatio > SNAP_THRESHOLD && deltaX > 0 && currentIndex > 0) {
                switchTab(TAB_ORDER[currentIndex - 1]);
            } else if (swipeRatio > SNAP_THRESHOLD && deltaX < 0 && currentIndex < TAB_ORDER.length - 1) {
                switchTab(TAB_ORDER[currentIndex + 1]);
            } else {
                slideTo(currentIndex);
            }
        }, { passive: true });
    }

    function switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('tab--active');

        const newIndex = TAB_ORDER.indexOf(tabName);
        const gap = Math.abs(newIndex - currentIndex);
        if (gap > 1) {
            slideTo(newIndex > currentIndex ? newIndex - 1 : newIndex + 1, true);
        }
        currentIndex = newIndex;
        slideTo(currentIndex);
        container.querySelectorAll('.view')[currentIndex].scrollTop = 0;

        if (tabName === 'protocol') Protocol.render();
        else if (tabName === 'routine') Routine.render();
        else if (tabName === 'instruction') Instruction.render();
        else if (tabName === 'history') History.render();
    }

    /* ── Init ── */

    function setupSettingsButton() {
        const btn = document.getElementById('settings-btn');
        btn.textContent = '⚙️';
        btn.addEventListener('click', () => Settings.open());
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .catch(err => console.warn('SW registration failed:', err));
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        }
    }

    function setupDateSelector() {
        document.getElementById('date-prev').addEventListener('click', () => shiftDate(-1));
        document.getElementById('date-next').addEventListener('click', () => shiftDate(1));

        document.getElementById('date-display').addEventListener('click', () => {
            PhaseCalendar.open(activePlan, currentDate);
        });

        document.getElementById('btn-today').addEventListener('click', () => {
            setDate(TimeUtils.todayISO());
        });
    }

    function setupTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });
    }

    function init() {
        registerServiceWorker();
        initTheme();
        setupSettingsButton();
        container = document.getElementById('swipe-container');
        DB.open().then(() => {
            return loadActivePlan();
        }).then(() => {
            return loadPhaseBarEntries();
        }).then(() => {
            updateDateDisplay();
            renderPhaseBar();
            renderPhaseLabel();
            SleepForm.setPlan(activePlan);
            Protocol.setPlan(activePlan);
            Routine.setPlan(activePlan);
            Instruction.setPlan(activePlan);
            checkPlanCompletion();
            SleepForm.render();
            Protocol.render();
            Routine.render();
            Instruction.render();
            History.render();
            setupTabs();
            setupDateSelector();
            setupSwipe();
            slideTo(0);
        });
    }

    document.addEventListener('DOMContentLoaded', init);

    function advanceDate() {
        shiftDate(1);
    }

    function setDate(isoDate) {
        currentDate = isoDate;
        updateDateDisplay();
        renderPhaseBar();
        renderPhaseLabel();
        SleepForm.setDate(currentDate);
        Protocol.setDate(currentDate);
        Routine.setDate(currentDate);
        Instruction.setDate(currentDate);
        container.querySelectorAll('.view').forEach(v => v.scrollTop = 0);
    }

    function refreshPlan() {
        return loadActivePlan().then(() => {
            SleepForm.setPlan(activePlan);
            Protocol.setPlan(activePlan);
            Routine.setPlan(activePlan);
            Instruction.setPlan(activePlan);
            renderPhaseBar();
            renderPhaseLabel();
        });
    }

    function checkPlanCompletion() {
        if (!activePlan || !activePlan.phases || !activePlan.phases.length) return;
        const lastPhase = activePlan.phases[activePlan.phases.length - 1];
        const today = TimeUtils.todayISO();
        if (today <= lastPhase.endDate) return;

        DB.updatePlanStatus(activePlan.id, 'completed').then(() => {
            activePlan = null;
            SleepForm.setPlan(null);
            Protocol.setPlan(null);
            Routine.setPlan(null);
            Instruction.setPlan(null);
            renderPhaseBar();
            renderPhaseLabel();
            showCompletionMessage();
        });
    }

    function showCompletionMessage() {
        const overlay = document.createElement('div');
        overlay.className = 'completion-overlay';
        overlay.innerHTML =
            '<div class="completion-modal">' +
                '<div class="completion-modal__icon">🎉</div>' +
                '<div class="completion-modal__title">План завершён!</div>' +
                '<div class="completion-modal__text">Ты достиг целевого подъёма. Продолжай в том же духе!</div>' +
                '<button class="completion-modal__btn">Отлично</button>' +
            '</div>';
        document.body.appendChild(overlay);
        overlay.querySelector('.completion-modal__btn').addEventListener('click', () => {
            overlay.remove();
        });
    }

    function getPhaseBarEntries() { return phaseBarEntries; }

    return { switchTab, advanceDate, setDate, refreshPlan, getPhaseBarEntries };
})();
