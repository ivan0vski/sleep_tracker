const App = (() => {
    function init() {
        registerServiceWorker();
        DB.open().then(() => {
            SleepForm.render();
            setupTabs();
        });
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .catch(err => console.warn('SW registration failed:', err));
        }
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

        if (tabName === 'history') {
            History.render();
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return { switchTab };
})();
