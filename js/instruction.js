const Instruction = (() => {
    let currentDate = TimeUtils.todayISO();
    let activePlan = null;

    function setPlan(plan) {
        activePlan = plan;
    }

    function setDate(isoDate) {
        currentDate = isoDate;
        render();
    }

    function buildSections(ctx) {
        const firstRoutineTime = ctx.routine.length ? ctx.routine[0].time : ctx.protocol.screensOff;
        const screensOff = ctx.protocol.screensOff;

        return [
            {
                title: 'Вечер 20 — когда лёг спать',
                items: [
                    { type: 'badge', text: 'Трекер' },
                    { type: 'text', text: 'Заполни «во сколько лёг в кровать» на странице 21' }
                ]
            },
            {
                title: 'Утро 21 — как проснулся',
                items: [
                    { type: 'badge', text: 'Трекер' },
                    { type: 'text', text: 'Заполнить: во сколько заснул, просыпался ли, во сколько проснулся, во сколько встал, качество сна, факторы' },
                    { type: 'badge', text: 'Протокол' },
                    { type: 'text', text: 'Отметить: утренний трекер заполнен, выход на свет' }
                ]
            },
            {
                title: `Вечер — ${firstRoutineTime}`,
                items: [
                    { type: 'text', text: 'Подготовка к ужину' }
                ]
            },
            {
                title: `Вечер — ${screensOff}`,
                items: [
                    { type: 'badge', text: 'Распорядок' },
                    { type: 'text', text: 'Посмотреть вечерний распорядок' },
                    { type: 'accent', text: 'Действуешь по распорядку наизусть' },
                    { type: 'badge', text: 'Трекер' },
                    { type: 'text', text: 'Отметить самочувствие за день' },
                    { type: 'text', text: 'Закрыть день 21' }
                ]
            },
            {
                title: 'Вечер — когда лёг спать',
                items: [
                    { type: 'badge', text: 'Протокол' },
                    { type: 'text', text: 'Отметить: экраны выключены, последний приём пищи, душ, туалет, никакой нагрузки' },
                    { type: 'accent', text: 'Переключится на 22-е' },
                    { type: 'badge', text: 'Трекер 22' },
                    { type: 'text', text: 'Записать «во сколько лёг в кровать»' },
                    { type: 'accent', text: 'Убрать телефон. Спать.' }
                ]
            }
        ];
    }

    function render() {
        const ctx = PhaseEngine.getDayContext(activePlan, null, currentDate);
        const sections = buildSections(ctx);
        const container = document.getElementById('instruction-view');
        const sectionsHTML = sections.map(section => {
            const itemsHTML = section.items.map(item => {
                if (item.type === 'badge') {
                    return `<div class="instruction-badge">${item.text}</div>`;
                }
                if (item.type === 'accent') {
                    return `<div class="instruction-accent">${item.text}</div>`;
                }
                return `<div class="instruction-text">${item.text}</div>`;
            }).join('');

            return `
                <div class="protocol-section">
                    <div class="protocol-section__title">${section.title}</div>
                    ${itemsHTML}
                </div>
            `;
        }).join('');

        container.innerHTML = sectionsHTML;
    }

    return { render, setPlan, setDate };
})();
