const Protocol = (() => {
    let currentDate = todayISO();
    let protocolState = {};

    const SECTIONS = [
        {
            id: 'morning',
            title: '☀️ Подъём — 6:00',
            checks: [
                { key: 'morningLight', label: 'Выход на яркий уличный свет — 10–20 мин в первые 60 мин после подъёма' }
            ],
            hints: [
                'Подъём в 6:00, 7 дней в неделю. Будильник не переносить',
                'Заполнить утренний трекер'
            ]
        },
        {
            id: 'firstHalf',
            title: '🌤 Первая половина дня — 6:30–12:00',
            checks: [
                { key: 'caffeineBeforeNoon', label: 'Кофе / чай / шоколад — только до 12:00' }
            ],
            hints: [
                'Максимум естественного света, особенно до 12:00'
            ]
        },
        {
            id: 'day',
            title: '🕐 День — 12:00–17:00',
            checks: [
                { key: 'exerciseBefore17', label: 'Интенсивные тренировки до 17:00' },
                { key: 'noDaytimeSleep', label: 'Никакого дневного сна' }
            ],
            hints: [
                'Уставать днём максимально сильно',
                '70–80% дневной нормы воды выпить до 17:00',
                'Таймер в 15:00 — напоминание, сколько осталось до сна'
            ]
        },
        {
            id: 'evening',
            title: '🏠 Вечер: переход — 17:00–19:15',
            checks: [
                { key: 'screensOff', label: 'Экраны выключить к 19:15' },
                { key: 'lastMeal', label: 'Последний приём пищи не позже 19:40' }
            ],
            hints: [
                'Уведомление 18:25 «ехать домой». В 18:30 — такси. Дома к 19:00',
                'Не больше 200 мл воды после ужина'
            ]
        },
        {
            id: 'bedPrep',
            title: '🌙 Подготовка ко сну — 19:15–21:10',
            checks: [
                { key: 'noPhysicalLoad', label: 'Никакой физической нагрузки, умственная — минимум' },
                { key: 'warmShower', label: 'Тёплый (не горячий) душ' },
                { key: 'toiletBeforeBed', label: 'Туалет перед укладыванием' }
            ],
            hints: [
                'После 20:00 — приглушённый свет тёплого спектра (1800–2200 K)',
                'Проветрить комнату, довести до 18,3 °C',
                'Абсолютная темнота: блэкаут-шторы, заклеить LED техники, убрать свет из коридора',
                'Тишина, шумоизоляция',
                'Меньше часа до сна — не пить вообще'
            ]
        }
    ];

    const TEXT_SECTIONS = [
        {
            title: '😴 Отбой — 21:10',
            lines: [
                'В кровати ровно в 21:10. Не раньше',
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
                'Если SE < 85% — чек протокол, начать лечение'
            ]
        }
    ];

    const ALL_KEYS = SECTIONS.flatMap(s => s.checks.map(c => c.key));

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function getCheckedCount() {
        return ALL_KEYS.filter(key => protocolState[key]).length;
    }

    function render() {
        const container = document.getElementById('protocol-view');

        const sectionsHTML = SECTIONS.map(section => {
            const checksHTML = section.checks.map(check => `
                <label class="protocol-check">
                    <input type="checkbox" class="protocol-check__input" data-key="${check.key}" ${protocolState[check.key] ? 'checked' : ''}>
                    <span class="protocol-check__box"></span>
                    <span class="protocol-check__label">${check.label}</span>
                </label>
            `).join('');

            const hintsHTML = section.hints.map(hint =>
                `<div class="protocol-hint">${hint}</div>`
            ).join('');

            return `
                <div class="protocol-section">
                    <div class="protocol-section__title">${section.title}</div>
                    ${checksHTML}
                    ${hintsHTML}
                </div>
            `;
        }).join('');

        const textSectionsHTML = TEXT_SECTIONS.map(section => {
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
        render();
    }

    return { render, setDate };
})();
