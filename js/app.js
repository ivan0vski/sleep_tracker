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

    function init() {
        registerServiceWorker();
        DB.open().then(() => {
            updateDateDisplay();
            SleepForm.render();
            setupTabs();
            setupDateSelector();
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

        document.querySelectorAll('.view').forEach(v => v.classList.remove('view--active'));
        document.getElementById(`${tabName}-view`).classList.add('view--active');

        if (tabName === 'protocol') {
            Protocol.render();
        } else if (tabName === 'routine') {
            Routine.render();
        } else if (tabName === 'history') {
            History.render();
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return { switchTab, getCurrentDate };
})();
