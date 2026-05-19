const SleepForm = (() => {
    let currentDate = todayISO();
    let formState = {};

    const DISTURBANCE_TAGS = ['шум', 'свет', 'температура', 'тревога', 'боль', 'партнёр', 'другое'];
    const FACTOR_TAGS = ['кофеин', 'алкоголь', 'спорт', 'экран', 'стресс', 'тяжёлая еда', 'другое'];

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

    function shiftDate(offset) {
        const d = new Date(currentDate + 'T12:00:00');
        d.setDate(d.getDate() + offset);
        currentDate = d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
        render();
    }

    function render() {
        const container = document.getElementById('form-view');
        container.innerHTML = `
            <div class="date-selector">
                <button class="date-selector__btn" id="date-prev">&larr;</button>
                <span class="date-selector__date">${formatDateDisplay(currentDate)}</span>
                <button class="date-selector__btn" id="date-next">&rarr;</button>
            </div>
            <div class="card">
                <div class="card__title">Во сколько лёг в кровать?</div>
                <input type="time" id="q-bedtime" value="${formState.bedTime || ''}">
            </div>
            <div class="card">
                <div class="card__title">Во сколько примерно заснул?</div>
                <input type="time" id="q-fallasleep" value="${formState.fallAsleepTime || ''}">
            </div>
            <div class="card">
                <div class="card__title">Просыпался ночью</div>
                <div class="input-row">
                    <div class="input-row__field">
                        <div class="input-row__label">Сколько раз</div>
                        <input type="number" id="q-wakeups-count" min="0" max="20" value="${formState.wakeUps ? formState.wakeUps.count : ''}">
                    </div>
                    <div class="input-row__field">
                        <div class="input-row__label">Минут без сна</div>
                        <input type="number" id="q-wakeups-duration" min="0" max="480" value="${formState.wakeUps ? formState.wakeUps.awakeDuration : ''}">
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card__title">Во сколько проснулся окончательно?</div>
                <input type="time" id="q-finalwake" value="${formState.finalWakeTime || ''}">
            </div>
            <div class="card">
                <div class="card__title">Во сколько встал с кровати?</div>
                <input type="time" id="q-outofbed" value="${formState.outOfBedTime || ''}">
            </div>
            <div class="card">
                <div class="card__title">Качество сна</div>
                <div class="rating" id="rating-quality">
                    ${[1,2,3,4,5].map(n => `<button class="rating__btn ${formState.sleepQuality === n ? 'rating__btn--active' : ''}" data-value="${n}">${n}</button>`).join('')}
                </div>
            </div>
            <div class="card">
                <div class="card__title">Что мешало спать?</div>
                <div class="tags" id="tags-disturbances">
                    ${renderTags(DISTURBANCE_TAGS, formState.disturbances || [])}
                </div>
                <div class="tag-custom">
                    <input type="text" class="tag-custom__input" id="custom-disturbance" placeholder="Своё...">
                    <button class="tag-custom__btn" id="add-disturbance">+</button>
                </div>
            </div>
            <div class="card">
                <div class="card__title">Вчера: кофеин / нагрузка / факторы</div>
                <div class="tags" id="tags-factors">
                    ${renderTags(FACTOR_TAGS, formState.yesterdayFactors || [])}
                </div>
                <div class="tag-custom">
                    <input type="text" class="tag-custom__input" id="custom-factor" placeholder="Своё...">
                    <button class="tag-custom__btn" id="add-factor">+</button>
                </div>
            </div>
            <div class="card">
                <div class="card__title">Самочувствие днём</div>
                <div class="rating" id="rating-daytime">
                    ${[1,2,3,4,5].map(n => `<button class="rating__btn ${formState.daytimeFeeling === n ? 'rating__btn--active' : ''}" data-value="${n}">${n}</button>`).join('')}
                </div>
            </div>
        `;
        bindEvents();
        loadExisting();
    }

    function renderTags(predefined, active) {
        const allTags = [...new Set([...predefined, ...active])];
        return allTags.map(tag =>
            `<span class="tag ${active.includes(tag) ? 'tag--active' : ''}" data-tag="${tag}">${tag}</span>`
        ).join('');
    }

    let saveTimer = null;

    function scheduleAutoSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 500);
    }

    function bindEvents() {
        document.getElementById('date-prev').addEventListener('click', () => shiftDate(-1));
        document.getElementById('date-next').addEventListener('click', () => shiftDate(1));

        document.querySelectorAll('#form-view input[type="time"], #form-view input[type="number"]').forEach(input => {
            input.addEventListener('change', scheduleAutoSave);
        });

        document.getElementById('rating-quality').addEventListener('click', (e) => {
            const btn = e.target.closest('.rating__btn');
            if (!btn) return;
            formState.sleepQuality = parseInt(btn.dataset.value);
            btn.parentElement.querySelectorAll('.rating__btn').forEach(b => b.classList.remove('rating__btn--active'));
            btn.classList.add('rating__btn--active');
            scheduleAutoSave();
        });

        document.getElementById('rating-daytime').addEventListener('click', (e) => {
            const btn = e.target.closest('.rating__btn');
            if (!btn) return;
            formState.daytimeFeeling = parseInt(btn.dataset.value);
            btn.parentElement.querySelectorAll('.rating__btn').forEach(b => b.classList.remove('rating__btn--active'));
            btn.classList.add('rating__btn--active');
            scheduleAutoSave();
        });

        document.getElementById('tags-disturbances').addEventListener('click', (e) => {
            const tag = e.target.closest('.tag');
            if (!tag) return;
            toggleTag('disturbances', tag.dataset.tag, tag);
            scheduleAutoSave();
        });

        document.getElementById('tags-factors').addEventListener('click', (e) => {
            const tag = e.target.closest('.tag');
            if (!tag) return;
            toggleTag('yesterdayFactors', tag.dataset.tag, tag);
            scheduleAutoSave();
        });

        document.getElementById('add-disturbance').addEventListener('click', () => {
            addCustomTag('disturbances', 'custom-disturbance', 'tags-disturbances', DISTURBANCE_TAGS);
            scheduleAutoSave();
        });

        document.getElementById('add-factor').addEventListener('click', () => {
            addCustomTag('yesterdayFactors', 'custom-factor', 'tags-factors', FACTOR_TAGS);
            scheduleAutoSave();
        });
    }

    function toggleTag(field, tagValue, el) {
        if (!formState[field]) formState[field] = [];
        const idx = formState[field].indexOf(tagValue);
        if (idx === -1) {
            formState[field].push(tagValue);
            el.classList.add('tag--active');
        } else {
            formState[field].splice(idx, 1);
            el.classList.remove('tag--active');
        }
    }

    function addCustomTag(field, inputId, containerId, predefined) {
        const input = document.getElementById(inputId);
        const value = input.value.trim().toLowerCase();
        if (!value) return;
        if (!formState[field]) formState[field] = [];
        if (!formState[field].includes(value)) {
            formState[field].push(value);
        }
        input.value = '';
        const container = document.getElementById(containerId);
        container.innerHTML = renderTags(predefined, formState[field]);
        container.querySelectorAll('.tag').forEach(el => {
            el.addEventListener('click', () => toggleTag(field, el.dataset.tag, el));
        });
    }

    function loadExisting() {
        DB.getEntry(currentDate).then(entry => {
            if (entry) {
                formState = { ...entry };
                document.getElementById('q-bedtime').value = entry.bedTime || '';
                document.getElementById('q-fallasleep').value = entry.fallAsleepTime || '';
                document.getElementById('q-wakeups-count').value = entry.wakeUps ? entry.wakeUps.count : '';
                document.getElementById('q-wakeups-duration').value = entry.wakeUps ? entry.wakeUps.awakeDuration : '';
                document.getElementById('q-finalwake').value = entry.finalWakeTime || '';
                document.getElementById('q-outofbed').value = entry.outOfBedTime || '';
                updateRating('rating-quality', entry.sleepQuality);
                updateRating('rating-daytime', entry.daytimeFeeling);
                updateTags('tags-disturbances', DISTURBANCE_TAGS, entry.disturbances || []);
                updateTags('tags-factors', FACTOR_TAGS, entry.yesterdayFactors || []);
            } else {
                formState = {};
            }
        });
    }

    function updateRating(containerId, value) {
        if (!value) return;
        const container = document.getElementById(containerId);
        container.querySelectorAll('.rating__btn').forEach(btn => {
            btn.classList.toggle('rating__btn--active', parseInt(btn.dataset.value) === value);
        });
    }

    function updateTags(containerId, predefined, active) {
        const container = document.getElementById(containerId);
        container.innerHTML = renderTags(predefined, active);
    }

    function save() {
        DB.getEntry(currentDate).then(existing => {
            const entry = {
                date: currentDate,
                bedTime: document.getElementById('q-bedtime').value || null,
                fallAsleepTime: document.getElementById('q-fallasleep').value || null,
                wakeUps: {
                    count: parseInt(document.getElementById('q-wakeups-count').value) || 0,
                    awakeDuration: parseInt(document.getElementById('q-wakeups-duration').value) || 0
                },
                finalWakeTime: document.getElementById('q-finalwake').value || null,
                outOfBedTime: document.getElementById('q-outofbed').value || null,
                sleepQuality: formState.sleepQuality || null,
                disturbances: formState.disturbances || [],
                yesterdayFactors: formState.yesterdayFactors || [],
                daytimeFeeling: formState.daytimeFeeling || null,
                createdAt: (existing && existing.createdAt) || Date.now()
            };
            if (existing && existing.protocol) {
                entry.protocol = existing.protocol;
            }
            return DB.saveEntry(entry);
        }).then(() => {
            showToast('Сохранено');
        });
    }

    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('toast--visible');
        setTimeout(() => toast.classList.remove('toast--visible'), 2000);
    }

    function getCurrentDate() {
        return currentDate;
    }

    function setDate(isoDate) {
        currentDate = isoDate;
        formState = {};
        render();
    }

    return { render, getCurrentDate, setDate };
})();
