const History = (() => {

    let activePlan = null;

    function render() {
        const container = document.getElementById('history-view');
        Promise.all([DB.getAllEntries(), DB.getActivePlan()]).then(([entries, plan]) => {
            activePlan = plan;
            if (entries.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__icon">&#x1F4A4;</div>
                        <div class="empty-state__text">Пока нет записей.<br>Заполни форму за сегодня!</div>
                    </div>
                `;
                return;
            }
            container.innerHTML = `<div class="history-list">${entries.map(e => renderItem(e, plan)).join('')}</div>`;
            bindEvents(container);
        });
    }

    function renderItem(entry, plan) {
        const phaseInfo = getPhaseInfo(entry.date, plan);
        const hitHTML = buildHitIndicator(entry, phaseInfo);
        const phaseBadge = phaseInfo
            ? `<span class="history-item__phase" style="color:${phaseInfo.phase.color}">фаза ${phaseInfo.phase.number} день ${phaseInfo.dayInPhase}</span>`
            : '';

        let feelingText = '';
        if (entry.daytimeMental || entry.daytimePhysical) {
            const parts = [];
            if (entry.daytimeMental) parts.push(entry.daytimeMental);
            if (entry.daytimePhysical) parts.push(entry.daytimePhysical);
            feelingText = parts.join(' ') + ' /5';
        } else if (entry.daytimeFeeling) {
            feelingText = entry.daytimeFeeling + ' /5';
        }

        const summary = buildSummary(entry);

        return `
            <div class="history-item" data-date="${entry.date}">
                <div class="history-item__header">
                    <span class="history-item__date">${formatDate(entry.date)}${entry.closed ? '<span class="history-item__closed">закрыт</span>' : ''}${phaseBadge}</span>
                    ${hitHTML}
                </div>
                <div class="history-item__summary">
                    <span>${summary}</span>
                    ${feelingText ? `<span class="history-item__feeling">${feelingText}</span>` : ''}
                </div>
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

    function getPhaseInfo(dateStr, plan) {
        if (!plan || !plan.phases || !plan.phases.length) return null;
        const phase = PhaseEngine.getPhaseForDate(plan.phases, dateStr);
        if (!phase) return null;
        const a = new Date(phase.startDate + 'T12:00:00');
        const b = new Date(dateStr + 'T12:00:00');
        const dayInPhase = Math.round((b - a) / 86400000) + 1;
        return { phase, dayInPhase };
    }

    function buildHitIndicator(entry, phaseInfo) {
        if (!phaseInfo || !entry.finalWakeTime) return '';
        const diff = Math.abs(TimeUtils.diffMinutes(entry.finalWakeTime, phaseInfo.phase.wake));
        const cross = diff > 720 ? 1440 - diff : diff;
        if (cross <= 15) {
            return '<span class="history-item__hit history-item__hit--ok">✓</span>';
        }
        return '<span class="history-item__hit history-item__hit--fail">✕</span>';
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
