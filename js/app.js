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
    let animating = false;
    let animationId = null;

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
        updateTodayButton();
    }

    function updateTodayButton() {
        const btn = document.getElementById('btn-today');
        if (btn) {
            btn.classList.toggle('btn-today--hidden', currentDate === todayISO());
        }
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

    function updateContainerHeight() {
        if (animating) return;
        const views = container.querySelectorAll('.view');
        const activeView = views[currentIndex];
        if (activeView) {
            container.style.height = activeView.offsetHeight + 'px';
        }
    }

    function animateToTop(targetHeight) {
        if (animationId) cancelAnimationFrame(animationId);
        const startHeight = parseFloat(container.style.height) || targetHeight;
        const startScroll = window.scrollY;
        if (startScroll === 0 && Math.abs(startHeight - targetHeight) < 1) {
            container.style.height = targetHeight + 'px';
            return;
        }
        const startTime = performance.now();
        const duration = 300;
        animating = true;

        function ease(t) {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        }

        function tick(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const e = ease(t);
            container.style.height = (startHeight + (targetHeight - startHeight) * e) + 'px';
            window.scrollTo(0, Math.round(startScroll * (1 - e)));
            if (t < 1) {
                animationId = requestAnimationFrame(tick);
            } else {
                animating = false;
                animationId = null;
            }
        }
        animationId = requestAnimationFrame(tick);
    }

    function setupHeightObserver() {
        const views = container.querySelectorAll('.view');
        const observer = new ResizeObserver(() => updateContainerHeight());
        views.forEach(v => observer.observe(v));
    }

    function setupSwipe() {
        const SNAP_THRESHOLD = 0.075;
        let startX = null;
        let startY = null;
        let isDragging = false;
        let isLocked = false;
        let baseOffset = 0;
        let viewWidth = 0;
        let dragHeights = [];
        let dragScrollY = 0;

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
                dragScrollY = window.scrollY;
                if (animationId) {
                    cancelAnimationFrame(animationId);
                    animating = false;
                    animationId = null;
                }
                dragHeights = Array.from(container.querySelectorAll('.view')).map(v => v.offsetHeight);
                container.classList.add('swipe-container--dragging');
                return;
            }

            if (isDragging) {
                e.preventDefault();
                window.scrollTo(0, dragScrollY);
                const dragDelta = x - startX;
                let offset = baseOffset - dragDelta;
                const maxOffset = (TAB_ORDER.length - 1) * viewWidth;
                offset = Math.max(-viewWidth * 0.15, Math.min(offset, maxOffset + viewWidth * 0.15));
                container.style.transform = `translateX(-${offset}px)`;

                const neighborIdx = dragDelta > 0 ? currentIndex - 1 : currentIndex + 1;
                if (neighborIdx >= 0 && neighborIdx < dragHeights.length) {
                    container.style.height = Math.max(dragHeights[currentIndex], dragHeights[neighborIdx]) + 'px';
                }
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
            setupHeightObserver();
            slideTo(0);
        });
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

        const picker = document.getElementById('date-picker');
        picker.addEventListener('focus', () => {
            picker.value = currentDate;
        });
        picker.addEventListener('change', () => {
            if (picker.value) setDate(picker.value);
            picker.blur();
        });

        document.getElementById('btn-today').addEventListener('click', () => {
            setDate(todayISO());
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

        const views = container.querySelectorAll('.view');
        animateToTop(views[currentIndex].offsetHeight);

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
