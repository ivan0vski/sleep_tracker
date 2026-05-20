const Routine = (() => {
    const ITEMS = [
        { time: '18:30', text: 'подготовка к ужину' },
        { time: '18:45', text: 'будильник «сохранить всё»' },
        { time: '19:15', text: 'будильник «выключить»' },
        { time: '19:20', text: 'ужин' },
        { time: null, text: 'убрать со стола, подготовка к молитве' },
        { time: '20:00', text: 'молитва' },
        { time: null, text: 'душ + зубы (тёплый, не горячий)' },
        { time: '20:55', text: 'выйти из душа, походить по дому, расслабиться' },
        { time: '21:10', text: 'в кровать' }
    ];

    function render() {
        const container = document.getElementById('routine-view');
        const itemsHTML = ITEMS.map((item, i) => `
            <div class="routine-item">
                <span class="routine-item__num">${i + 1}</span>
                <span class="routine-item__text">${item.time ? `<strong>${item.time}</strong> — ` : ''}${item.text}</span>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="protocol-section">
                <div class="protocol-section__title">🌙 Вечерний распорядок</div>
                ${itemsHTML}
            </div>
        `;
    }

    return { render };
})();