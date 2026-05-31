# План реализации: Постепенная настройка режима сна

Каждый раздел — отдельная задача для Claude Code.
Выполнять строго по порядку: каждый следующий раздел зависит от предыдущих.

Контекст стека: vanilla JS (IIFE-модули в js/), HTML, CSS, IndexedDB (js/db.js), Python server (server.py), PWA (sw.js, manifest.json).

Паттерн кода: `const X = (() => { ... })()` — все модули в этом стиле, не классы.

Архитектура фичи: см. файл `ARCHITECTURE_SLEEP_PHASES.md`

---

## Раздел 1. TimeUtils + PhaseEngine — ядро расчётов ✅ ВЫПОЛНЕН

**Статус:** реализован, закоммичен, запушен.

**Что сделано:**

Создано два файла вместо одного (утилиты вынесены отдельно для переиспользования):

### js/timeUtils.js — IIFE-модуль `TimeUtils`

```
TimeUtils.parseTime("23:30")              → 1410 (минуты от полуночи)
TimeUtils.formatTime(1410)                → "23:30" (обрабатывает отрицательные и >1440)
TimeUtils.addMinutes("23:30", 90)         → "01:00"
TimeUtils.diffMinutes("09:00", "06:00")   → 180 (с обработкой перехода через полночь)
TimeUtils.formatDuration("23:00", "07:15")→ "8ч 15мин" (замена calcSleepDuration)
TimeUtils.addDays("2026-06-01", 7)        → "2026-06-08"
TimeUtils.todayISO()                      → "2026-05-31"
```

### js/phaseEngine.js — IIFE-модуль `PhaseEngine`

```
PhaseEngine.PHASE_COLORS       — массив 8 цветов (красный → зелёный → синий → фиолетовый)
PhaseEngine.DEFAULTS            — { phaseDays: 7, targetWake: '06:00', targetBed: '21:30', desiredSleepHours: 8.5 }
PhaseEngine.STEP_OPTIONS        — [15, 20, 30, 45, 60]
PhaseEngine.DEFAULT_ROUTINE_STEPS — 7 дефолтных шагов распорядка

PhaseEngine.calculatePhases(config)              → Phase[]
PhaseEngine.getPhaseForDate(phases, dateStr)      → Phase | null
PhaseEngine.calculateProtocolTimes(wake, bed)     → { caffeineUntil, trainingUntil, ... }
PhaseEngine.calculateRoutineTimes(steps, bed)     → [{ step, time }]
PhaseEngine.getDayContext(plan, routineSteps, dateStr) → DayContext
```

### Рефакторинг существующего кода

- Удалён `calcSleepDuration()` из app.js → `TimeUtils.formatDuration()` в form.js и history.js
- Удалены 3 копии `todayISO()` из app.js, form.js, protocol.js → единый `TimeUtils.todayISO()`
- index.html: подключены `js/timeUtils.js` и `js/phaseEngine.js` перед `js/db.js`
- sw.js: v44, оба файла добавлены в ASSETS

### Граничные случаи (обработаны в коде)

- `currentWake === targetWake` → пустой массив фаз
- `diff < stepMinutes` → одна фаза с targetWake
- Нечётное деление (195 / 30 = 6.5) → 7 фаз, последняя = targetWake
- bed через полночь → formatTime корректно оборачивает отрицательные значения
- Больше 8 фаз → цвета циклятся через modulo

---

## Раздел 2. Слой данных — IndexedDB

**Суть:** Расширить js/db.js — добавить хранилища для планов, шагов распорядка и прогресса. CRUD-функции.

**Модифицировать:** `js/db.js`

**Новые object stores:**

```
1. 'sleepPlans' — хранилище планов
   keyPath: 'id'
   Индексы: status, createdAt
   Объект: SleepPlan (см. ARCHITECTURE раздел 2.1)

2. 'routineSteps' — хранилище шагов распорядка
   keyPath: 'id'
   Индекс: order
   Объект: RoutineStep (см. ARCHITECTURE раздел 2.3)

3. 'routineProgress' — прогресс выполнения шагов по дням
   keyPath: 'date'
   Объект: { date: "2026-06-05", steps: { step_1: true, step_3: true } }
```

**Версия IndexedDB:** инкрементировать до 2. В `onupgradeneeded` создавать новые stores через `if (!db.objectStoreNames.contains(...))`.

**CRUD-функции:**

```
// Планы
DB.savePlan(plan) → Promise<void>
DB.getActivePlan() → Promise<SleepPlan | null>
DB.updatePlanStatus(planId, status) → Promise<void>
DB.getArchivedPlans() → Promise<SleepPlan[]>

// Шаги распорядка
DB.saveRoutineSteps(steps[]) → Promise<void>
DB.getRoutineSteps() → Promise<RoutineStep[]>

// Прогресс распорядка
DB.toggleRoutineProgress(dateStr, stepId) → Promise<void>
DB.getRoutineProgress(dateStr) → Promise<{ [stepId]: boolean }>
```

**Инфраструктура:** обновить sw.js версию после изменений.

**Зависимости:** Раздел 1 (типы данных, дефолтные шаги).

---

## Раздел 3. Редактор распорядка

**Суть:** Переиспользуемый UI-компонент для управления шагами вечернего распорядка. Используется в визарде (шаг 5) и в настройках.

**Создать:** `js/routineEditor.js`

**API (IIFE-стиль):**
```javascript
RoutineEditor.open({
  steps: existingSteps,
  previewBed: '23:00',
  onSave: (steps) => { ... },
  onCancel: () => { ... }
});
```

**Функциональность:** список шагов, добавление/удаление/редактирование/порядок (кнопки ↑↓), живой превью, «В кровать» нельзя удалить.

**Ввод смещения:** два поля — часы (0–5) + минуты (0–55, шаг 5).

**Инфраструктура:** добавить `<script>` в index.html, файл в sw.js ASSETS.

**Зависимости:** Разделы 1 (TimeUtils, PhaseEngine), 2 (DB).

---

## Раздел 4. Визард настройки плана

**Суть:** Полноэкранный оверлей — пошаговый визард из 6 шагов.

**Создать:** `js/setupWizard.js`

**Точка входа:** кнопка «Новый план» в настройках → ввод "новый план" → визард.

**6 шагов:**

```
Шаг 1: currentWake (time picker, шаг 15 мин, дефолт 09:00)
Шаг 2: targetWake (time picker, шаг 15 мин, дефолт 06:00)
Шаг 3: stepMinutes (кнопки 15/20/30/45/60, без дефолта, живой превью фаз)
Шаг 4: desiredSleepHours (кнопки 7/7.5/8/8.5/9, без дефолта)
Шаг 5: распорядок (RoutineEditor из Раздела 3)
Шаг 6: финальный превью (таблица фаз, кнопка «Начать»)
```

**Валидация:** targetWake >= currentWake → ошибка. stepMinutes не выбран → Далее неактивна.

**Инфраструктура:** добавить `<script>` в index.html, файл в sw.js ASSETS.

**Зависимости:** Разделы 1, 2, 3.

---

## Раздел 5. Настройки — выезжающая панель

**Суть:** Новый экран, заменяющий иконку версии на ⚙️.

**Создать:** `js/settings.js`

**UI:** выезжающая панель на весь экран с крестиком ✕.

**Содержание:**
- Статус плана (Фаза N из M / нет плана)
- Кнопка «Новый план» → ввод "новый план" → визард
- Кнопка «Вечерний распорядок» → RoutineEditor
- Кнопка «Сбросить план» → подтверждение → архивация
- Версия приложения внизу

**Модифицировать:** index.html (убрать `#app-version`), app.js (⚙️ вместо showVersion).

**Инфраструктура:** добавить `<script>` в index.html, файл в sw.js ASSETS.

**Зависимости:** Разделы 1, 2, 3, 4 (визард).

---

## Раздел 6. Шапка: прогрессбар фаз + подпись

**Суть:** Добавить цветную полосу прогресса и подпись фазы в шапку. Мини-календарь по тапу.

**Модифицировать:** index.html, css/style.css, app.js

**Ключевое:** app.js — shiftDate/setDate должны уведомлять прогрессбар.

**Зависимости:** Разделы 1, 2.

---

## Раздел 7. Протокол — динамические времена

**Суть:** Заменить хардкоженные времена в protocol.js на рассчитанные из DayContext.

**Модифицировать:** `js/protocol.js`

**Ключевое:** SECTIONS с заголовками и метками — сделать функциями, которые принимают DayContext. Подсказки (тексты «зачем») — оставить как есть.

**Также:** добавить `Protocol.setDate()` уведомление в app.js (уже есть).

**Зависимости:** Разделы 1, 2.

---

## Раздел 8. Распорядок — рендер с динамическими временами

**Суть:** Переработать routine.js — динамический рендер пользовательских шагов + чекбоксы.

**Модифицировать:** `js/routine.js`

**Ключевое:**
- Добавить `Routine.setDate(dateStr)` — вызывается из app.js при смене даты
- Загружать шаги из DB, считать времена через PhaseEngine
- Чекбоксы с автосохранением
- Кнопка ✏️ → RoutineEditor

**Зависимости:** Разделы 1, 2, 3.

---

## Раздел 9. app.js — интеграция модулей

**Суть:** Обновить app.js чтобы все модули получали текущую дату и DayContext.

**Модифицировать:** `js/app.js`

**Ключевое:**
- `shiftDate()` и `setDate()` → уведомлять Routine.setDate() и Instruction.setDate()
- `init()` → вызвать checkPlanCompletion() после DB.open()
- checkPlanCompletion() → если today > lastPhase.endDate → completed + поздравление

**Зависимости:** все предыдущие разделы.

---

## Раздел 10. Трекер — плашка фазы и индикатор попадания

**Суть:** Добавить плашку фазы и индикатор попадания в форму трекера.

**Модифицировать:** `js/form.js`

**Зависимости:** Разделы 1, 2.

---

## Раздел 11. История — метки фаз

**Суть:** Цветные метки фаз в истории + строка «цель vs факт».

**Модифицировать:** `js/history.js`

**Зависимости:** Разделы 1, 2.

---

## Сводка: порядок выполнения

```
Раздел   Название                              Размер     Зависит от   Статус
─────────────────────────────────────────────────────────────────────────────────
  1      TimeUtils + PhaseEngine               средний    —            ✅ ВЫПОЛНЕН
  2      Слой данных (IndexedDB)               средний    1
  3      Редактор распорядка                   большой    1, 2
  4      Визард настройки                      большой    1, 2, 3
  5      Настройки (панель + ⚙️)               средний    1, 2, 3, 4
  6      Шапка: прогрессбар + подпись          средний    1, 2
  7      Протокол: динамические времена        средний    1, 2
  8      Распорядок: рендер с временами        средний    1, 2, 3
  9      app.js: интеграция модулей            средний    все
  10     Трекер: плашка + индикатор            маленький  1, 2
  11     История: метки фаз                    маленький  1, 2
```

**Инфраструктура (при каждом разделе):**
- Новые JS-файлы → `<script>` в index.html (порядок важен)
- Новые JS-файлы → ASSETS в sw.js
- Поднять версию кэша в sw.js
- Commit + push после каждого раздела
