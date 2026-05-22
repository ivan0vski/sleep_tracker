const SleepForm = (() => {
    let currentDate = todayISO();
    let formState = {};
    let isReadOnly = false;

    const DISTURBANCE_TAGS = ['шум', 'свет', 'температура', 'тревога', 'боль', 'партнёр', 'другое'];
    const FACTOR_TAGS = ['кофеин', 'алкоголь', 'спорт', 'экран', 'стресс', 'тяжёлая еда', 'другое'];

    const TRACKER_FIELDS = [
        { key: 'bedTime', label: 'Во сколько лёг в кровать', inputId: 'q-bedtime', type: 'time' },
        { key: 'fallAsleepTime', label: 'Во сколько заснул', inputId: 'q-fallasleep', type: 'time' },
        { key: 'wakeUpsCount', label: 'Просыпался — сколько раз', inputId: 'q-wakeups-count', type: 'number' },
        { key: 'wakeUpsDuration', label: 'Просыпался — минут без сна', inputId: 'q-wakeups-duration', type: 'number' },
        { key: 'finalWakeTime', label: 'Во сколько проснулся', inputId: 'q-finalwake', type: 'time' },
        { key: 'outOfBedTime', label: 'Во сколько встал', inputId: 'q-outofbed', type: 'time' },
        { key: 'sleepQuality', label: 'Качество сна', type: 'rating' }
    ];

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function render() {
        const container = document.getElementById('form-view');
        container.innerHTML = `
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
                <div class="sleep-duration" id="sleep-duration"></div>
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
            <button class="btn-close-day-main" id="btn-close-day-main">Закрыть день</button>
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
        if (isReadOnly) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 500);
    }

    function updateSleepDuration() {
        const fallAsleep = document.getElementById('q-fallasleep').value;
        const finalWake = document.getElementById('q-finalwake').value;
        const el = document.getElementById('sleep-duration');
        const dur = calcSleepDuration(fallAsleep, finalWake);
        el.textContent = dur ? `Сон: ${dur}` : '';
    }

    function bindEvents() {
        document.querySelectorAll('#form-view input[type="time"], #form-view input[type="number"]').forEach(input => {
            input.addEventListener('change', () => {
                scheduleAutoSave();
                if (input.id === 'q-fallasleep' || input.id === 'q-finalwake') {
                    updateSleepDuration();
                }
            });
        });

        document.getElementById('rating-quality').addEventListener('click', (e) => {
            if (isReadOnly) return;
            const btn = e.target.closest('.rating__btn');
            if (!btn) return;
            formState.sleepQuality = parseInt(btn.dataset.value);
            btn.parentElement.querySelectorAll('.rating__btn').forEach(b => b.classList.remove('rating__btn--active'));
            btn.classList.add('rating__btn--active');
            scheduleAutoSave();
        });

        document.getElementById('rating-daytime').addEventListener('click', (e) => {
            if (isReadOnly) return;
            const btn = e.target.closest('.rating__btn');
            if (!btn) return;
            formState.daytimeFeeling = parseInt(btn.dataset.value);
            btn.parentElement.querySelectorAll('.rating__btn').forEach(b => b.classList.remove('rating__btn--active'));
            btn.classList.add('rating__btn--active');
            scheduleAutoSave();
        });

        document.getElementById('btn-close-day-main').addEventListener('click', () => {
            if (isReadOnly) return;
            clearTimeout(saveTimer);
            save().then(() => showCloseDayModal());
        });

        document.getElementById('tags-disturbances').addEventListener('click', (e) => {
            if (isReadOnly) return;
            const tag = e.target.closest('.tag');
            if (!tag) return;
            toggleTag('disturbances', tag.dataset.tag, tag);
            scheduleAutoSave();
        });

        document.getElementById('tags-factors').addEventListener('click', (e) => {
            if (isReadOnly) return;
            const tag = e.target.closest('.tag');
            if (!tag) return;
            toggleTag('yesterdayFactors', tag.dataset.tag, tag);
            scheduleAutoSave();
        });

        document.getElementById('add-disturbance').addEventListener('click', () => {
            if (isReadOnly) return;
            addCustomTag('disturbances', 'custom-disturbance', 'tags-disturbances', DISTURBANCE_TAGS);
            scheduleAutoSave();
        });

        document.getElementById('add-factor').addEventListener('click', () => {
            if (isReadOnly) return;
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
            updateSleepDuration();
            isReadOnly = !!(entry && entry.closed);
            applyReadOnlyState();
        });
    }

    function applyReadOnlyState() {
        const container = document.getElementById('form-view');
        const existingBanner = container.querySelector('.readonly-banner');

        if (isReadOnly) {
            container.classList.add('form-view--readonly');
            container.querySelectorAll('input').forEach(i => i.disabled = true);
            if (!existingBanner) {
                container.insertAdjacentHTML('afterbegin', `
                    <div class="readonly-banner">
                        <span class="readonly-banner__text">День закрыт</span>
                        <button class="readonly-banner__btn" id="btn-unlock-form">Редактировать</button>
                    </div>
                `);
                container.querySelector('#btn-unlock-form').addEventListener('click', unlockEdit);
            }
        } else {
            container.classList.remove('form-view--readonly');
            container.querySelectorAll('input').forEach(i => i.disabled = false);
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
        return DB.getEntry(currentDate).then(existing => {
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
        });
    }

    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('toast--visible');
        setTimeout(() => toast.classList.remove('toast--visible'), 2000);
    }

    function showCloseDayModal() {
        const existing = document.querySelector('.close-day-overlay');
        if (existing) existing.remove();

        const missingTracker = TRACKER_FIELDS.filter(f => {
            if (f.inputId) return !document.getElementById(f.inputId).value;
            if (f.type === 'rating') return !formState[f.key];
            return false;
        });

        Protocol.getIncomplete(currentDate).then(missingProtocol => {
            renderCloseDayModal(missingTracker, missingProtocol);
        });
    }

    function renderCloseDayModal(missingTracker, missingProtocol) {
        const allComplete = missingTracker.length === 0 && missingProtocol.length === 0;

        let trackerHTML = '';
        if (missingTracker.length > 0) {
            const fieldsHTML = missingTracker.map(f => {
                if (f.type === 'time' || f.type === 'number') {
                    return `<div class="close-day-field">
                        <div class="close-day-field__label">${f.label}</div>
                        <input type="${f.type}" class="close-day-field__input" data-tracker-key="${f.key}" data-input-id="${f.inputId}" ${f.type === 'number' ? 'min="0"' : ''}>
                    </div>`;
                }
                if (f.type === 'rating') {
                    return `<div class="close-day-field">
                        <div class="close-day-field__label">${f.label}</div>
                        <div class="rating close-day-rating" data-tracker-key="${f.key}">
                            ${[1,2,3,4,5].map(n => `<button class="rating__btn" data-value="${n}">${n}</button>`).join('')}
                        </div>
                    </div>`;
                }
                return '';
            }).join('');

            trackerHTML = `
                <div class="close-day-section">
                    <div class="close-day-section__title">Трекер</div>
                    ${fieldsHTML}
                </div>
            `;
        }

        let protocolHTML = '';
        if (missingProtocol.length > 0) {
            const checksHTML = missingProtocol.map(c => `
                <label class="protocol-check">
                    <input type="checkbox" class="protocol-check__input close-day-protocol-check" data-key="${c.key}">
                    <span class="protocol-check__box"></span>
                    <span class="protocol-check__label">${c.label}</span>
                </label>
            `).join('');

            protocolHTML = `
                <div class="close-day-section">
                    <div class="close-day-section__title">Протокол</div>
                    ${checksHTML}
                </div>
            `;
        }

        const statusText = allComplete
            ? 'Вы всё проверили? День сейчас закроем.'
            : 'Вы всё проверили? День сейчас закроем. Отмечай невыполненное:';

        const overlay = document.createElement('div');
        overlay.className = 'close-day-overlay';
        overlay.innerHTML = `
            <div class="close-day-modal">
                <div class="close-day-modal__title">Закрыть день</div>
                <div class="close-day-modal__status ${allComplete ? 'close-day-modal__status--ok' : ''}">${statusText}</div>
                ${trackerHTML}
                ${protocolHTML}
                <div class="close-day-modal__actions">
                    <button class="btn-close-day">Закрыть день</button>
                    <button class="btn-later">Отмена</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        overlay.querySelector('.btn-later').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.btn-close-day').addEventListener('click', () => closeDay(overlay));

        overlay.querySelectorAll('.close-day-rating .rating__btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.rating__btn').forEach(b => b.classList.remove('rating__btn--active'));
                btn.classList.add('rating__btn--active');
            });
        });
    }

    function closeDay(overlay) {
        clearTimeout(saveTimer);

        overlay.querySelectorAll('.close-day-field__input[data-tracker-key]').forEach(input => {
            if (input.value) {
                document.getElementById(input.dataset.inputId).value = input.value;
            }
        });

        overlay.querySelectorAll('.close-day-rating').forEach(div => {
            const active = div.querySelector('.rating__btn--active');
            if (active) {
                formState.sleepQuality = parseInt(active.dataset.value);
                updateRating('rating-quality', formState.sleepQuality);
            }
        });

        const newChecks = {};
        overlay.querySelectorAll('.close-day-protocol-check:checked').forEach(input => {
            newChecks[input.dataset.key] = true;
        });

        save().then(() => {
            if (Object.keys(newChecks).length > 0) {
                return Protocol.saveChecks(currentDate, newChecks);
            }
        }).then(() => {
            return DB.getEntry(currentDate);
        }).then(entry => {
            if (entry) {
                entry.closed = true;
                entry.closedAt = Date.now();
                return DB.saveEntry(entry);
            }
        }).then(() => {
            overlay.remove();
            App.advanceDate();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    function setDate(isoDate) {
        currentDate = isoDate;
        formState = {};
        isReadOnly = false;
        render();
    }

    return { render, setDate };
})();
