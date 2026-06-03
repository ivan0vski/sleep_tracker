const Protocol = (() => {
    let currentDate = TimeUtils.todayISO();
    let protocolState = {};
    let isReadOnly = false;
    let activePlan = null;

    const ALL_KEYS = [
        'morningTracker', 'morningLight', 'caffeineBeforeNoon',
        'noDaytimeSleep', 'exerciseBefore17', 'screensOff',
        'lastMeal', 'noPhysicalLoad', 'warmShower', 'toiletBeforeBed'
    ];

    function getContext() {
        return PhaseEngine.getDayContext(activePlan, null, currentDate);
    }

    function buildSections(ctx) {
        const p = ctx.protocol;
        const wake = ctx.wake;
        const bed = ctx.bed;
        const wakePlus30 = TimeUtils.addMinutes(wake, 30);
        const afternoonReminder = TimeUtils.addMinutes(wake, 540);
        const goHomeNotify = TimeUtils.addMinutes(bed, -165);
        const taxiTime = TimeUtils.addMinutes(bed, -160);
        const homeBy = TimeUtils.addMinutes(bed, -130);
        const dimLights = TimeUtils.addMinutes(bed, -70);

        return [
            {
                id: 'morning',
                title: `☀️ Подъём — ${wake}`,
                items: [
                    { type: 'hint', text: `Подъём в ${wake}, 7 дней в неделю. Будильник не переносить` },
                    { type: 'check', key: 'morningTracker', label: 'Заполнить утренний трекер' },
                    { type: 'check', key: 'morningLight', label: 'Выход на яркий уличный свет — 10–20 мин в первые 60 мин после подъёма' }
                ]
            },
            {
                id: 'firstHalf',
                title: `🌤 Первая половина дня — ${wakePlus30}–${p.caffeineUntil}`,
                items: [
                    { type: 'hint', text: `Максимум естественного света, особенно до ${p.caffeineUntil}` },
                    { type: 'check', key: 'caffeineBeforeNoon', label: `Кофе / чай / шоколад — только до ${p.caffeineUntil}` }
                ]
            },
            {
                id: 'day',
                title: `🕐 День — ${p.caffeineUntil}–${p.trainingUntil}`,
                items: [
                    { type: 'check', key: 'noDaytimeSleep', label: 'Никакого дневного сна' },
                    { type: 'hint', text: `Таймер в ${afternoonReminder} — напоминание, сколько осталось до сна` },
                    { type: 'hint', text: `70–80% дневной нормы воды выпить до ${p.trainingUntil}` },
                    { type: 'hint', text: 'Уставать днём максимально сильно' },
                    { type: 'check', key: 'exerciseBefore17', label: `интенсивные тренировки до ${p.trainingUntil}` }
                ]
            },
            {
                id: 'evening',
                title: `🏠 Вечер: переход — ${p.trainingUntil}–${p.screensOff}`,
                items: [
                    { type: 'hint', text: `Уведомление ${goHomeNotify} «ехать домой». В ${taxiTime} — такси. Дома к ${homeBy}` },
                    { type: 'check', key: 'screensOff', label: `Экраны выключить к ${p.screensOff}` },
                    { type: 'check', key: 'lastMeal', label: `Последний приём пищи не позже ${p.lastMeal}` },
                    { type: 'hint', text: 'не больше 200 мл воды после ужина' }
                ]
            },
            {
                id: 'bedPrep',
                title: `🌙 Подготовка ко сну — ${p.screensOff}–${bed}`,
                items: [
                    { type: 'hint', text: `После ${dimLights} — приглушённый свет тёплого спектра (1800–2200 K)` },
                    { type: 'check', key: 'noPhysicalLoad', label: 'Никакой физической нагрузки, умственная — минимум' },
                    { type: 'check', key: 'warmShower', label: 'Тёплый (не горячий) душ' },
                    { type: 'hint', text: 'Проветрить комнату, довести до 18,3 °C' },
                    { type: 'hint', text: 'Абсолютная темнота: блэкаут-шторы, заклеить LED техники, убрать свет из коридора' },
                    { type: 'hint', text: 'Тишина, шумоизоляция' },
                    { type: 'hint', text: 'Меньше часа до сна — не пить вообще' },
                    { type: 'check', key: 'toiletBeforeBed', label: 'Туалет перед укладыванием' }
                ]
            }
        ];
    }

    function buildTextSections(ctx) {
        return [
            {
                title: `😴 Отбой — ${ctx.bed}`,
                lines: [
                    `В кровати ровно в ${ctx.bed}. Не раньше`,
                    'Выбрал позу — не двигаться',
                    'Не пытаться заснуть. Просто чилить, не заснул — ладно'
                ]
            },
            {
                title: 'Постоянные правила',
                lines: [
                    'Кровать только для сна. Днём не есть, не смотреть видео в кровати',
                    'Ванная и квартира ночью — только красные тусклые лампы',
                    'Заполнять трекер 14 дней подряд без пропусков',
                    'Если SE < 85% — чек протокол. начать лечение'
                ]
            }
        ];
    }

    function setPlan(plan) {
        activePlan = plan;
    }


    function getCheckedCount() {
        return ALL_KEYS.filter(key => protocolState[key]).length;
    }

    function render() {
        const container = document.getElementById('protocol-view');
        const ctx = getContext();
        const sections = buildSections(ctx);
        const textSections = buildTextSections(ctx);

        const sectionsHTML = sections.map(section => {
            const itemsHTML = section.items.map(item => {
                if (item.type === 'check') {
                    return `
                        <label class="protocol-check">
                            <input type="checkbox" class="protocol-check__input" data-key="${item.key}" ${protocolState[item.key] ? 'checked' : ''}>
                            <span class="protocol-check__box"></span>
                            <span class="protocol-check__label">${item.label}</span>
                        </label>
                    `;
                }
                return `<div class="protocol-hint">${item.text}</div>`;
            }).join('');

            return `
                <div class="protocol-section">
                    <div class="protocol-section__title">${section.title}</div>
                    ${itemsHTML}
                </div>
            `;
        }).join('');

        const textSectionsHTML = textSections.map(section => {
            const linesHTML = section.lines.map(line =>
                `<div class="protocol-hint">${line}</div>`
            ).join('');
            return `
                <div class="protocol-section protocol-section--text">
                    <div class="protocol-section__title">${section.title}</div>
                    ${linesHTML}
                </div>
            `;
        }).join('');

        const checked = getCheckedCount();
        const total = ALL_KEYS.length;

        container.innerHTML = `
            <div class="protocol-progress">
                <div class="protocol-progress__bar">
                    <div class="protocol-progress__fill" style="width: ${total ? (checked / total * 100) : 0}%"></div>
                </div>
                <div class="protocol-progress__text">${checked} / ${total} выполнено</div>
            </div>
            ${sectionsHTML}
            ${textSectionsHTML}
        `;

        bindEvents();
        loadExisting();
    }

    function bindEvents() {
        document.querySelectorAll('#protocol-view .protocol-check__input').forEach(input => {
            input.addEventListener('change', () => {
                if (isReadOnly) {
                    input.checked = !input.checked;
                    return;
                }
                protocolState[input.dataset.key] = input.checked;
                updateProgress();
                saveProtocol();
            });
        });
    }

    function updateProgress() {
        const checked = getCheckedCount();
        const total = ALL_KEYS.length;
        const fill = document.querySelector('#protocol-view .protocol-progress__fill');
        const text = document.querySelector('#protocol-view .protocol-progress__text');
        if (fill) fill.style.width = (total ? (checked / total * 100) : 0) + '%';
        if (text) text.textContent = `${checked} / ${total} выполнено`;
    }

    function loadExisting() {
        DB.getEntry(currentDate).then(entry => {
            if (entry && entry.protocol) {
                protocolState = { ...entry.protocol };
                ALL_KEYS.forEach(key => {
                    const input = document.querySelector(`#protocol-view .protocol-check__input[data-key="${key}"]`);
                    if (input) input.checked = !!protocolState[key];
                });
                updateProgress();
            } else {
                protocolState = {};
            }
            isReadOnly = !!(entry && entry.closed);
            applyReadOnlyState();
        });
    }

    function applyReadOnlyState() {
        const container = document.getElementById('protocol-view');
        const existingBanner = container.querySelector('.readonly-banner');

        if (isReadOnly) {
            container.classList.add('protocol-view--readonly');
            container.querySelectorAll('.protocol-check__input').forEach(i => i.disabled = true);
            if (!existingBanner) {
                container.insertAdjacentHTML('afterbegin', `
                    <div class="readonly-banner">
                        <span class="readonly-banner__text">День закрыт</span>
                        <button class="readonly-banner__btn" id="btn-unlock-protocol">Редактировать</button>
                    </div>
                `);
                container.querySelector('#btn-unlock-protocol').addEventListener('click', unlockEdit);
            }
        } else {
            container.classList.remove('protocol-view--readonly');
            container.querySelectorAll('.protocol-check__input').forEach(i => i.disabled = false);
            if (existingBanner) existingBanner.remove();
        }
    }

    function unlockEdit() {
        DB.getEntry(currentDate).then(entry => {
            if (entry) {
                delete entry.closed;
                delete entry.closedAt;
                return DB.saveEntry(entry);
            }
        }).then(() => {
            isReadOnly = false;
            applyReadOnlyState();
        });
    }

    function saveProtocol() {
        DB.getEntry(currentDate).then(entry => {
            const data = entry || { date: currentDate, createdAt: Date.now() };
            data.protocol = {};
            ALL_KEYS.forEach(key => {
                data.protocol[key] = !!protocolState[key];
            });
            return DB.saveEntry(data);
        });
    }

    function setDate(isoDate) {
        currentDate = isoDate;
        protocolState = {};
        isReadOnly = false;
        render();
    }

    function getIncomplete(date) {
        const ctx = PhaseEngine.getDayContext(activePlan, null, date);
        const sections = buildSections(ctx);
        return DB.getEntry(date).then(entry => {
            const protocol = (entry && entry.protocol) || {};
            return sections.flatMap(s =>
                s.items.filter(i => i.type === 'check' && !protocol[i.key])
                    .map(i => ({ key: i.key, label: i.label }))
            );
        });
    }

    function saveChecks(date, checks) {
        return DB.getEntry(date).then(entry => {
            const data = entry || { date, createdAt: Date.now() };
            data.protocol = data.protocol || {};
            Object.keys(checks).forEach(key => {
                data.protocol[key] = checks[key];
            });
            return DB.saveEntry(data);
        });
    }

    return { render, setDate, setPlan, getIncomplete, saveChecks };
})();
