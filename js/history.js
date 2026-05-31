const History = (() => {

    function render() {
        const container = document.getElementById('history-view');
        DB.getAllEntries().then(entries => {
            if (entries.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__icon">&#x1F4A4;</div>
                        <div class="empty-state__text">Пока нет записей.<br>Заполни форму за сегодня!</div>
                    </div>
                `;
                return;
            }
            container.innerHTML = `<div class="history-list">${entries.map(renderItem).join('')}</div>`;
            bindEvents(container);
        });
    }

    function renderItem(entry) {
        let feelingText = '';
        if (entry.daytimeMental || entry.daytimePhysical) {
            const parts = [];
            if (entry.daytimeMental) parts.push(`${entry.daytimeMental}`);
            if (entry.daytimePhysical) parts.push(`${entry.daytimePhysical}`);
            feelingText = parts.join('/') + '/5';
        } else if (entry.daytimeFeeling) {
            feelingText = `${entry.daytimeFeeling}/5`;
        }

        const summary = buildSummary(entry);

        return `
            <div class="history-item" data-date="${entry.date}">
                <div class="history-item__header">
                    <span class="history-item__date">${formatDate(entry.date)}${entry.closed ? '<span class="history-item__closed">закрыт</span>' : ''}</span>
                    <span class="history-item__feeling">${feelingText}</span>
                </div>
                <div class="history-item__summary">${summary}</div>
                <div class="history-item__details">
                    ${renderDetails(entry)}
                    <div class="history-item__actions">
                        <button class="btn-edit" data-date="${entry.date}">Редактировать</button>
                        <button class="btn-delete" data-date="${entry.date}">Удалить</button>
                    </div>
                </div>
            </div>
        `;
    }

    function buildSummary(entry) {
        const parts = [];
        if (entry.fallAsleepTime && entry.finalWakeTime) {
            let timeRange = `${entry.fallAsleepTime} → ${entry.finalWakeTime}`;
            const dur = TimeUtils.formatDuration(entry.fallAsleepTime, entry.finalWakeTime);
            if (dur) timeRange += ` (${dur})`;
            parts.push(timeRange);
        }
        return parts.join(' • ') || 'Нет данных';
    }

    function renderDetails(entry) {
        const lines = [];
        if (entry.bedTime) lines.push(`Лёг: ${entry.bedTime}`);
        if (entry.fallAsleepTime) lines.push(`Заснул: ${entry.fallAsleepTime}`);
        if (entry.wakeUps && (entry.wakeUps.count || entry.wakeUps.awakeDuration)) {
            lines.push(`Просыпался: ${entry.wakeUps.count} раз, ${entry.wakeUps.awakeDuration} мин без сна`);
        }
        if (entry.finalWakeTime) lines.push(`Проснулся: ${entry.finalWakeTime}`);
        if (entry.outOfBedTime) lines.push(`Встал: ${entry.outOfBedTime}`);
        const dur = TimeUtils.formatDuration(entry.fallAsleepTime, entry.finalWakeTime);
        if (dur) lines.push(`Сон: ${dur}`);
        if (entry.sleepQuality) lines.push(`Качество сна: ${entry.sleepQuality}/5`);
        if (entry.disturbances && entry.disturbances.length) lines.push(`Мешало: ${entry.disturbances.join(', ')}`);
        if (entry.yesterdayFactors && entry.yesterdayFactors.length) lines.push(`Факторы: ${entry.yesterdayFactors.join(', ')}`);
        if (entry.daytimeMental) lines.push(`Душевное: ${entry.daytimeMental}/5`);
        if (entry.daytimePhysical) lines.push(`Физическое: ${entry.daytimePhysical}/5`);
        if (!entry.daytimeMental && !entry.daytimePhysical && entry.daytimeFeeling) lines.push(`Самочувствие: ${entry.daytimeFeeling}/5`);
        if (entry.protocol) {
            const done = Object.values(entry.protocol).filter(Boolean).length;
            lines.push(`Протокол: ${done}/10 выполнено`);
        }
        return lines.map(l => `<div>${l}</div>`).join('');
    }

    function formatDate(isoDate) {
        const [y, m, d] = isoDate.split('-');
        const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
        const date = new Date(isoDate + 'T12:00:00');
        return `${parseInt(d)} ${months[parseInt(m) - 1]}, ${days[date.getDay()]}`;
    }

    function bindEvents(container) {
        container.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.btn-edit') || e.target.closest('.btn-delete')) return;
                item.classList.toggle('history-item--expanded');
            });
        });

        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const date = btn.dataset.date;
                App.setDate(date);
                App.switchTab('form');
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const date = btn.dataset.date;
                if (confirm(`Удалить запись за ${formatDate(date)}?`)) {
                    DB.deleteEntry(date).then(() => render());
                }
            });
        });
    }

    return { render };
})();
