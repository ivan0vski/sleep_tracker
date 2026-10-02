const History = (() => {

    let activePlan = null;
    // Записи с последней отрисовки: экспорт собирает файл из них сразу по нажатию,
    // без похода в базу — иначе iOS сочтёт вызов «Поделиться» не пользовательским.
    let loadedEntries = [];

    // Порядок и названия колонок протокола в таблице.
    const PROTOCOL_COLUMNS = [
        ['caffeineBeforeNoon', 'Кофеин вовремя'],
        ['noDaytimeSleep', 'Без дневного сна'],
        ['exerciseBefore17', 'Тренировка вовремя'],
        ['screensOff', 'Экраны выключены'],
        ['lastMeal', 'Ужин вовремя'],
        ['noPhysicalLoad', 'Без нагрузки вечером'],
        ['warmShower', 'Тёплый душ'],
        ['toiletBeforeBed', 'Туалет перед сном']
    ];

    // Считаем только текущие пункты: в старых записях остались отметки
    // убранных из протокола пунктов (утренний трекер, свет, упражнение).
    function protocolDone(protocol) {
        return PROTOCOL_COLUMNS.filter(([key]) => protocol[key]).length;
    }

    function render() {
        const container = document.getElementById('history-view');
        Promise.all([DB.getAllEntries(), DB.getActivePlan()]).then(([entries, plan]) => {
            activePlan = plan;
            loadedEntries = entries;
            if (entries.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state__icon">&#x1F4A4;</div>
                        <div class="empty-state__text">Пока нет записей.<br>Заполни форму за сегодня!</div>
                    </div>
                `;
                return;
            }
            container.innerHTML =
                '<button class="history-export" id="btn-history-export">Экспорт в таблицу</button>' +
                `<div class="history-list">${entries.map(e => renderItem(e, plan)).join('')}</div>`;
            bindEvents(container);
        });
    }

    function renderItem(entry, plan) {
        const phaseInfo = getPhaseInfo(entry.date, plan);
        const hitHTML = buildHitIndicator(entry, phaseInfo);
        const phaseBadge = phaseInfo
            ? `<span class="history-item__phase" style="color:${phaseInfo.phase.color}">фаза ${phaseInfo.phase.number}${phaseInfo.phase.repeat ? ' повтор' : ''} день ${phaseInfo.dayInPhase}</span>`
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

    function isWakeHit(entry, phaseInfo) {
        const diff = Math.abs(TimeUtils.diffMinutes(entry.finalWakeTime, phaseInfo.phase.wake));
        const cross = diff > 720 ? 1440 - diff : diff;
        return cross <= 15;
    }

    function buildHitIndicator(entry, phaseInfo) {
        if (!phaseInfo || !entry.finalWakeTime) return '';
        if (isWakeHit(entry, phaseInfo)) {
            return '<span class="history-item__hit history-item__hit--ok">✓</span>';
        }
        return '<span class="history-item__hit history-item__hit--fail">✕</span>';
    }

    function awakeMinutes(entry) {
        return entry.wakeUps ? entry.wakeUps.awakeDuration : 0;
    }

    function buildSummary(entry) {
        const parts = [];
        if (entry.fallAsleepTime && entry.finalWakeTime) {
            let timeRange = `${entry.fallAsleepTime} → ${entry.finalWakeTime}`;
            const dur = TimeUtils.formatDuration(entry.fallAsleepTime, entry.finalWakeTime, awakeMinutes(entry));
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
        const dur = TimeUtils.formatDuration(entry.fallAsleepTime, entry.finalWakeTime, awakeMinutes(entry));
        if (dur) lines.push(`Сон: ${dur}`);
        if (entry.sleepQuality) lines.push(`Качество сна: ${entry.sleepQuality}/5`);
        if (entry.disturbances && entry.disturbances.length) lines.push(`Мешало: ${entry.disturbances.join(', ')}`);
        if (entry.yesterdayFactors && entry.yesterdayFactors.length) lines.push(`Факторы: ${entry.yesterdayFactors.join(', ')}`);
        if (entry.daytimeMental) lines.push(`Душевное: ${entry.daytimeMental}/5`);
        if (entry.daytimePhysical) lines.push(`Физическое: ${entry.daytimePhysical}/5`);
        if (!entry.daytimeMental && !entry.daytimePhysical && entry.daytimeFeeling) lines.push(`Самочувствие: ${entry.daytimeFeeling}/5`);
        if (entry.protocol) {
            const done = protocolDone(entry.protocol);
            lines.push(`Протокол: ${done}/${PROTOCOL_COLUMNS.length} выполнено`);
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

    /* ── Экспорт ── */

    function buildCsvRow(entry) {
        const phaseInfo = getPhaseInfo(entry.date, activePlan);
        let hit = '';
        if (phaseInfo && entry.finalWakeTime) {
            hit = isWakeHit(entry, phaseInfo) ? 'да' : 'нет';
        }

        const sleepMinutes = TimeUtils.sleepMinutes(entry.fallAsleepTime, entry.finalWakeTime, awakeMinutes(entry));

        // Старые записи хранят одну общую оценку самочувствия вместо двух —
        // форма при открытии так же подставляет её в оба поля.
        const legacy = !entry.daytimeMental && !entry.daytimePhysical ? entry.daytimeFeeling : null;
        const wakeUps = entry.wakeUps || {};
        const protocol = entry.protocol;

        return [
            entry.date,
            phaseInfo ? PhaseEngine.phaseName(phaseInfo.phase) : '',
            phaseInfo ? phaseInfo.dayInPhase : '',
            phaseInfo ? phaseInfo.phase.wake : '',
            hit,
            entry.bedTime,
            entry.fallAsleepTime,
            wakeUps.count,
            wakeUps.awakeDuration,
            entry.finalWakeTime,
            entry.outOfBedTime,
            TimeUtils.formatDuration(entry.fallAsleepTime, entry.finalWakeTime, awakeMinutes(entry)),
            sleepMinutes,
            entry.sleepQuality,
            entry.daytimeMental || legacy,
            entry.daytimePhysical || legacy,
            (entry.disturbances || []).join(', '),
            (entry.yesterdayFactors || []).join(', '),
            protocol ? protocolDone(protocol) : '',
            ...PROTOCOL_COLUMNS.map(([key]) => protocol ? (protocol[key] ? 'да' : 'нет') : ''),
            entry.closed ? 'да' : 'нет'
        ];
    }

    function csvCell(value) {
        if (value === null || value === undefined) return '';
        let s = String(value);
        // Свой тег, начинающийся с «=», «+», «-» или «@», таблица приняла бы за формулу.
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    function buildCsv(entries) {
        const header = [
            'Дата', 'Фаза', 'День фазы', 'Цель подъёма', 'Подъём в цель',
            'Лёг', 'Заснул', 'Просыпался, раз', 'Без сна, мин', 'Проснулся', 'Встал',
            'Сон', 'Сон, мин', 'Качество сна', 'Душевное', 'Физическое',
            'Мешало', 'Факторы', 'Протокол, выполнено',
            ...PROTOCOL_COLUMNS.map(([, title]) => title),
            'День закрыт'
        ];
        // В таблице удобнее идти от старых ночей к новым.
        const rows = entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(buildCsvRow);
        // Точка с запятой и метка кодировки в начале — чтобы русский Excel
        // сам разложил колонки и не превратил кириллицу в кракозябры.
        return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
    }

    function downloadFile(file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function exportHistory() {
        if (!loadedEntries.length) return;
        const name = 'sleep-history-' + TimeUtils.todayISO() + '.csv';
        const file = new File([buildCsv(loadedEntries)], name, { type: 'text/csv' });

        // На телефоне — через меню «Поделиться» (сохранить в Файлы, отправить себе):
        // в приложении с экрана «Домой» обычное скачивание на iOS не работает.
        // На компьютере файл просто скачивается.
        const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: name }).catch(err => {
                if (err && err.name === 'AbortError') return;
                downloadFile(file);
            });
            return;
        }
        downloadFile(file);
    }

    function bindEvents(container) {
        const exportBtn = container.querySelector('#btn-history-export');
        if (exportBtn) exportBtn.addEventListener('click', exportHistory);

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
