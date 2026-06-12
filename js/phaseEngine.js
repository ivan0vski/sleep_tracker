const PhaseEngine = (() => {

    const PHASE_COLORS = [
        '#5B7B95', '#7A8B58', '#8A6384', '#A09350',
        '#4B8585', '#6B5545'
    ];

    const DEFAULTS = {
        phaseDays: 7,
        targetWake: '06:00',
        targetBed: '21:30',
        desiredSleepHours: 8.5
    };

    const STEP_OPTIONS = [15, 20, 30, 45, 60];

    const PHASE_DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

    const DEFAULT_ROUTINE_STEPS = [
        { id: 'step_1', name: 'Подготовка к ужину',     emoji: '🍽', offsetMinutes: -160, order: 0, isFixed: false },
        { id: 'step_2', name: 'Выключить экраны',       emoji: '📴', offsetMinutes: -120, order: 1, isFixed: false },
        { id: 'step_3', name: 'Ужин',                   emoji: '🥗', offsetMinutes: -110, order: 2, isFixed: false },
        { id: 'step_4', name: 'Отдых / прогулка',       emoji: '🚶', offsetMinutes: -70,  order: 3, isFixed: false },
        { id: 'step_5', name: 'Душ + зубы',             emoji: '🚿', offsetMinutes: -50,  order: 4, isFixed: false },
        { id: 'step_6', name: 'Расслабиться, походить', emoji: '🛋', offsetMinutes: -15,  order: 5, isFixed: false },
        { id: 'step_7', name: 'В кровать',              emoji: '🛏', offsetMinutes: 0,    order: 6, isFixed: true  }
    ];

    function calculatePhases(config) {
        const { currentWake, targetWake, desiredSleepHours, stepMinutes, phaseDays, startDate } = config;

        const currentWakeMin = TimeUtils.parseTime(currentWake);
        const targetWakeMin = TimeUtils.parseTime(targetWake);

        let diff = currentWakeMin - targetWakeMin;
        if (diff <= 0) return [];

        const phaseCount = Math.ceil(diff / stepMinutes);
        const sleepDurationMin = desiredSleepHours * 60;
        const phases = [];

        for (let i = 1; i <= phaseCount; i++) {
            let wakeMin = currentWakeMin - (i * stepMinutes);
            if (wakeMin < targetWakeMin) wakeMin = targetWakeMin;

            const bedMin = wakeMin - sleepDurationMin;
            const phaseStart = TimeUtils.addDays(startDate, (i - 1) * phaseDays);
            const phaseEnd = TimeUtils.addDays(startDate, i * phaseDays - 1);

            phases.push({
                number: i,
                wake: TimeUtils.formatTime(wakeMin),
                bed: TimeUtils.formatTime(bedMin),
                startDate: phaseStart,
                endDate: phaseEnd,
                color: PHASE_COLORS[(i - 1) % PHASE_COLORS.length]
            });
        }

        return phases;
    }

    function getPhaseForDate(phases, dateStr) {
        if (!phases || !phases.length) return null;
        return phases.find(p => dateStr >= p.startDate && dateStr <= p.endDate) || null;
    }

    function calculateProtocolTimes(wake, bed) {
        return {
            caffeineUntil: TimeUtils.addMinutes(wake, 360),
            trainingUntil: TimeUtils.addMinutes(bed, -240),
            screensOff: TimeUtils.addMinutes(bed, -120),
            lastMeal: TimeUtils.addMinutes(bed, -140),
            noExercise: TimeUtils.addMinutes(bed, -120),
            shower: TimeUtils.addMinutes(bed, -75),
            toilet: TimeUtils.addMinutes(bed, -10)
        };
    }

    function calculateRoutineTimes(routineSteps, bed) {
        if (!routineSteps || !routineSteps.length) return [];

        const bedMin = TimeUtils.parseTime(bed);
        const sorted = [...routineSteps].sort((a, b) => a.offsetMinutes - b.offsetMinutes);

        return sorted.map(step => ({
            step: step,
            time: TimeUtils.formatTime(bedMin + step.offsetMinutes)
        }));
    }

    function getDayContext(plan, routineSteps, dateStr) {
        const steps = routineSteps || DEFAULT_ROUTINE_STEPS;

        if (!plan || plan.status !== 'active') {
            const wake = (plan && plan.targetWake) || DEFAULTS.targetWake;
            const bed = (plan && plan.targetWake)
                ? TimeUtils.addMinutes(wake, -(plan.desiredSleepHours || DEFAULTS.desiredSleepHours) * 60)
                : DEFAULTS.targetBed;

            return {
                date: dateStr,
                hasPlan: false,
                phase: null,
                wake: wake,
                bed: bed,
                protocol: calculateProtocolTimes(wake, bed),
                routine: calculateRoutineTimes(steps, bed)
            };
        }

        if (dateStr < plan.startDate) {
            return {
                date: dateStr,
                hasPlan: true,
                phase: null,
                wake: plan.currentWake,
                bed: TimeUtils.addMinutes(plan.currentWake, -plan.desiredSleepHours * 60),
                protocol: calculateProtocolTimes(
                    plan.currentWake,
                    TimeUtils.addMinutes(plan.currentWake, -plan.desiredSleepHours * 60)
                ),
                routine: calculateRoutineTimes(
                    steps,
                    TimeUtils.addMinutes(plan.currentWake, -plan.desiredSleepHours * 60)
                )
            };
        }

        const phase = getPhaseForDate(plan.phases, dateStr);

        if (!phase) {
            const wake = plan.targetWake;
            const bed = TimeUtils.addMinutes(wake, -plan.desiredSleepHours * 60);
            return {
                date: dateStr,
                hasPlan: true,
                phase: null,
                wake: wake,
                bed: bed,
                protocol: calculateProtocolTimes(wake, bed),
                routine: calculateRoutineTimes(steps, bed)
            };
        }

        return {
            date: dateStr,
            hasPlan: true,
            phase: phase,
            wake: phase.wake,
            bed: phase.bed,
            protocol: calculateProtocolTimes(phase.wake, phase.bed),
            routine: calculateRoutineTimes(steps, phase.bed)
        };
    }

    return {
        PHASE_COLORS,
        DEFAULTS,
        STEP_OPTIONS,
        PHASE_DAYS_OPTIONS,
        DEFAULT_ROUTINE_STEPS,
        calculatePhases,
        getPhaseForDate,
        calculateProtocolTimes,
        calculateRoutineTimes,
        getDayContext
    };
})();
