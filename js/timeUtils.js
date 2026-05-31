const TimeUtils = (() => {

    function parseTime(str) {
        if (!str) return NaN;
        const [h, m] = str.split(':').map(Number);
        return h * 60 + m;
    }

    function formatTime(minutes) {
        let m = minutes % 1440;
        if (m < 0) m += 1440;
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }

    function addMinutes(timeStr, minutes) {
        return formatTime(parseTime(timeStr) + minutes);
    }

    function diffMinutes(laterTime, earlierTime) {
        let diff = parseTime(laterTime) - parseTime(earlierTime);
        if (diff < 0) diff += 1440;
        return diff;
    }

    function formatDuration(fallAsleep, finalWake) {
        if (!fallAsleep || !finalWake) return null;
        const mins = diffMinutes(finalWake, fallAsleep);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}ч ${m}мин` : `${h}ч`;
    }

    function addDays(isoDate, days) {
        const d = new Date(isoDate + 'T12:00:00');
        d.setDate(d.getDate() + days);
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    return {
        parseTime,
        formatTime,
        addMinutes,
        diffMinutes,
        formatDuration,
        addDays,
        todayISO
    };
})();
