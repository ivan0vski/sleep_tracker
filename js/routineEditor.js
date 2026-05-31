const RoutineEditor = (() => {

    let overlay = null;
    let steps = [];
    let previewBed = '23:00';
    let onSave = null;
    let onCancel = null;
    let editingIndex = -1;

    function open(opts) {
        steps = (opts.steps || PhaseEngine.DEFAULT_ROUTINE_STEPS).map(s => ({ ...s }));
        previewBed = opts.previewBed || '23:00';
        onSave = opts.onSave || null;
        onCancel = opts.onCancel || null;
        editingIndex = -1;
        renderOverlay();
    }

    function close() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    }

    function renderOverlay() {
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.className = 'routine-editor-overlay';
        overlay.innerHTML = buildHTML();
        document.body.appendChild(overlay);

        overlay.querySelector('.routine-editor__close').addEventListener('click', () => {
            close();
            if (onCancel) onCancel();
        });

        overlay.querySelector('.routine-editor__add').addEventListener('click', addStep);
        overlay.querySelector('.routine-editor__save').addEventListener('click', () => {
            close();
            if (onSave) onSave(steps);
        });

        bindList();
    }

    function buildHTML() {
        return `
            <div class="routine-editor">
                <div class="routine-editor__header">
                    <button class="routine-editor__close">&times;</button>
                    <span class="routine-editor__title">Вечерний распорядок</span>
                </div>
                <div class="routine-editor__list">${buildList()}</div>
                <button class="routine-editor__add">+ Добавить шаг</button>
                <button class="routine-editor__save">Сохранить</button>
            </div>
        `;
    }

    function buildList() {
        const bedMin = TimeUtils.parseTime(previewBed);
        return steps.map((s, i) => {
            const time = TimeUtils.formatTime(bedMin + s.offsetMinutes);
            const isEditing = i === editingIndex;
            const offsetH = Math.floor(Math.abs(s.offsetMinutes) / 60);
            const offsetM = Math.abs(s.offsetMinutes) % 60;

            let html = `<div class="routine-editor__item" data-index="${i}">`;
            html += `<div class="routine-editor__row">`;
            html += `<span class="routine-editor__emoji">${s.emoji}</span>`;
            html += `<span class="routine-editor__name">${s.name}</span>`;
            html += `<span class="routine-editor__time">${time}</span>`;
            html += `<div class="routine-editor__actions">`;
            if (i > 0) html += `<button class="routine-editor__btn routine-editor__up" data-i="${i}">&uarr;</button>`;
            if (i < steps.length - 1) html += `<button class="routine-editor__btn routine-editor__down" data-i="${i}">&darr;</button>`;
            html += `<button class="routine-editor__btn routine-editor__edit" data-i="${i}">&#9998;</button>`;
            if (!s.isFixed) html += `<button class="routine-editor__btn routine-editor__del" data-i="${i}">&times;</button>`;
            html += `</div></div>`;

            if (isEditing) {
                html += `<div class="routine-editor__edit-form">`;
                html += `<div class="routine-editor__field">`;
                html += `<label>Эмодзи</label>`;
                html += `<input type="text" class="routine-editor__input re-emoji" value="${s.emoji}" maxlength="4">`;
                html += `</div>`;
                html += `<div class="routine-editor__field">`;
                html += `<label>Название</label>`;
                html += `<input type="text" class="routine-editor__input re-name" value="${s.name}">`;
                html += `</div>`;
                html += `<div class="routine-editor__offset-row">`;
                html += `<div class="routine-editor__field">`;
                html += `<label>Часы до отбоя</label>`;
                html += `<select class="routine-editor__select re-hours">`;
                for (let h = 0; h <= 5; h++) {
                    html += `<option value="${h}"${h === offsetH ? ' selected' : ''}>${h}</option>`;
                }
                html += `</select></div>`;
                html += `<div class="routine-editor__field">`;
                html += `<label>Минуты</label>`;
                html += `<select class="routine-editor__select re-minutes">`;
                for (let m = 0; m <= 55; m += 5) {
                    html += `<option value="${m}"${m === offsetM ? ' selected' : ''}>${String(m).padStart(2, '0')}</option>`;
                }
                html += `</select></div>`;
                html += `</div>`;
                html += `<button class="routine-editor__btn-done">Готово</button>`;
                html += `</div>`;
            }

            html += `</div>`;
            return html;
        }).join('');
    }

    function refreshList() {
        const list = overlay.querySelector('.routine-editor__list');
        list.innerHTML = buildList();
        bindList();
    }

    function bindList() {
        const list = overlay.querySelector('.routine-editor__list');

        list.querySelectorAll('.routine-editor__up').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = +btn.dataset.i;
                if (i > 0) swap(i, i - 1);
            });
        });

        list.querySelectorAll('.routine-editor__down').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = +btn.dataset.i;
                if (i < steps.length - 1) swap(i, i + 1);
            });
        });

        list.querySelectorAll('.routine-editor__edit').forEach(btn => {
            btn.addEventListener('click', () => {
                editingIndex = editingIndex === +btn.dataset.i ? -1 : +btn.dataset.i;
                refreshList();
            });
        });

        list.querySelectorAll('.routine-editor__del').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = +btn.dataset.i;
                steps.splice(i, 1);
                reindex();
                if (editingIndex === i) editingIndex = -1;
                else if (editingIndex > i) editingIndex--;
                refreshList();
            });
        });

        list.querySelectorAll('.routine-editor__btn-done').forEach(btn => {
            btn.addEventListener('click', () => {
                applyEdit();
            });
        });
    }

    function applyEdit() {
        if (editingIndex < 0) return;
        const form = overlay.querySelector('.routine-editor__edit-form');
        if (!form) return;

        const emoji = form.querySelector('.re-emoji').value.trim() || steps[editingIndex].emoji;
        const name = form.querySelector('.re-name').value.trim() || steps[editingIndex].name;
        const hours = +form.querySelector('.re-hours').value;
        const minutes = +form.querySelector('.re-minutes').value;

        steps[editingIndex].emoji = emoji;
        steps[editingIndex].name = name;
        if (!steps[editingIndex].isFixed) {
            steps[editingIndex].offsetMinutes = -(hours * 60 + minutes);
        }

        editingIndex = -1;
        refreshList();
    }

    function addStep() {
        const newStep = {
            id: 'step_' + Date.now(),
            name: 'Новый шаг',
            emoji: '📌',
            offsetMinutes: -30,
            order: steps.length,
            isFixed: false
        };
        const fixedIdx = steps.findIndex(s => s.isFixed);
        if (fixedIdx >= 0) {
            steps.splice(fixedIdx, 0, newStep);
        } else {
            steps.push(newStep);
        }
        reindex();
        editingIndex = fixedIdx >= 0 ? fixedIdx : steps.length - 1;
        refreshList();
    }

    function swap(a, b) {
        [steps[a], steps[b]] = [steps[b], steps[a]];
        reindex();
        if (editingIndex === a) editingIndex = b;
        else if (editingIndex === b) editingIndex = a;
        refreshList();
    }

    function reindex() {
        steps.forEach((s, i) => { s.order = i; });
    }

    return { open, close };
})();
