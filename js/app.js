function calcSleepDuration(fallAsleep, finalWake) {
    if (!fallAsleep || !finalWake) return null;
    const [h1, m1] = fallAsleep.split(':').map(Number);
    const [h2, m2] = finalWake.split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins <= 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}ч ${m}мин` : `${h}ч`;
}

const App = (() => {
    let currentDate = todayISO();

    const TAB_ORDER = ['form', 'protocol', 'routine', 'history'];
    let currentIndex = 0;
    let container = null;

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function formatDateDisplay(isoDate) {
        const [y, m, d] = isoDate.split('-');
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
    }

    function updateDateDisplay() {
        document.getElementById('date-display').textContent = formatDateDisplay(currentDate);
    }

    function shiftDate(offset) {
        const d = new Date(currentDate + 'T12:00:00');
        d.setDate(d.getDate() + offset);
        currentDate = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
        updateDateDisplay();
        SleepForm.setDate(currentDate);
        Protocol.setDate(currentDate);
    }

    function getCurrentDate() {
        return currentDate;
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

    function slideTo(index, instant) {
        if (instant) {
            container.classList.add('swipe-container--dragging');
            container.style.transform = `translateX(-${index * 25}%)`;
            container.offsetWidth;
            container.classList.remove('swipe-container--dragging');
        }
        container.style.transform = `translateX(-${index * 25}%)`;
    }

    function setupSwipe() {
        const SNAP_THRESHOLD = 0.15;
        const LOCK_ANGLE_TAN = 0.6;
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
                if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
                if (Math.abs(deltaY) > Math.abs(deltaX) * LOCK_ANGLE_TAN && Math.abs(deltaY) > 10) {
                    isLocked = true;
                    startX = null;
                    return;
                }
                if (Math.abs(deltaX) > 10) {
                    isDragging = true;
                    startX = x;
                    container.classList.add('swipe-container--dragging');
                    return;
                }
            }

            if (isDragging) {
                e.preventDefault();
                const dragDelta = x - startX;
                let offset = baseOffset - dragDelta;
                const maxOffset = (TAB_ORDER.length - 1) * viewWidth;
                offset = Math.max(-viewWidth * 0.15, Math.min(offset, maxOffset + viewWidth * 0.15));
                container.style.transform = `translateX(-${offset}px)`;
            }
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

    function showVersion() {
        fetch('./sw.js').then(r => r.text()).then(text => {
            const m = text.match(/sleep-tracker-(v\d+)/);
            if (m) document.getElementById('app-version').textContent = m[1];
        }).catch(() => {});
    }

    function init() {
        registerServiceWorker();
        initTheme();
        showVersion();
        container = document.getElementById('swipe-container');
        DB.open().then(() => {
            updateDateDisplay();
            SleepForm.render();
            Protocol.render();
            Routine.render();
            History.render();
            setupTabs();
            setupDateSelector();
            setupSwipe();
            slideTo(0);
        });
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .catch(err => console.warn('SW registration failed:', err));
        }
    }

    function setupDateSelector() {
        document.getElementById('date-prev').addEventListener('click', () => shiftDate(-1));
        document.getElementById('date-next').addEventListener('click', () => shiftDate(1));

        const picker = document.getElementById('date-picker');
        document.getElementById('date-display').addEventListener('click', () => {
            picker.value = currentDate;
            picker.showPicker();
        });
        picker.addEventListener('change', () => {
            if (picker.value) setDate(picker.value);
        });
    }

    function setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.tab);
            });
        });
    }

    function switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('tab--active');

        const newIndex = TAB_ORDER.indexOf(tabName);
        const gap = Math.abs(newIndex - currentIndex);
        if (gap > 1) {
            const neighbor = newIndex > currentIndex ? newIndex - 1 : newIndex + 1;
            slideTo(neighbor, true);
        }
        currentIndex = newIndex;
        slideTo(currentIndex);

        if (tabName === 'protocol') {
            Protocol.render();
        } else if (tabName === 'routine') {
            Routine.render();
        } else if (tabName === 'history') {
            History.render();
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    function advanceDate() {
        shiftDate(1);
    }

    function setDate(isoDate) {
        currentDate = isoDate;
        updateDateDisplay();
        SleepForm.setDate(currentDate);
        Protocol.setDate(currentDate);
    }

    return { switchTab, getCurrentDate, advanceDate, setDate };
})();
