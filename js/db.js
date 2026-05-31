const DB = (() => {
    const DB_NAME = 'SleepTrackerDB';
    const DB_VERSION = 2;
    const STORE_NAME = 'entries';
    let db = null;

    function open() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'date' });
                }
                if (!database.objectStoreNames.contains('sleepPlans')) {
                    const plans = database.createObjectStore('sleepPlans', { keyPath: 'id' });
                    plans.createIndex('status', 'status', { unique: false });
                    plans.createIndex('createdAt', 'createdAt', { unique: false });
                }
                if (!database.objectStoreNames.contains('routineSteps')) {
                    const steps = database.createObjectStore('routineSteps', { keyPath: 'id' });
                    steps.createIndex('order', 'order', { unique: false });
                }
                if (!database.objectStoreNames.contains('routineProgress')) {
                    database.createObjectStore('routineProgress', { keyPath: 'date' });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- Entries (записи сна) ---

    function saveEntry(entry) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(entry);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        }));
    }

    function getEntry(date) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(date);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (e) => reject(e.target.error);
        }));
    }

    function getAllEntries() {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const entries = request.result || [];
                entries.sort((a, b) => b.date.localeCompare(a.date));
                resolve(entries);
            };
            request.onerror = (e) => reject(e.target.error);
        }));
    }

    function deleteEntry(date) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(date);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        }));
    }

    // --- Sleep Plans (планы сна) ---

    function savePlan(plan) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('sleepPlans', 'readwrite');
            tx.objectStore('sleepPlans').put(plan);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        }));
    }

    function getActivePlan() {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('sleepPlans', 'readonly');
            const index = tx.objectStore('sleepPlans').index('status');
            const request = index.getAll('active');
            request.onsuccess = () => resolve(request.result[0] || null);
            request.onerror = (e) => reject(e.target.error);
        }));
    }

    function updatePlanStatus(planId, status) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('sleepPlans', 'readwrite');
            const store = tx.objectStore('sleepPlans');
            const request = store.get(planId);
            request.onsuccess = () => {
                const plan = request.result;
                if (plan) {
                    plan.status = status;
                    store.put(plan);
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        }));
    }

    function getArchivedPlans() {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('sleepPlans', 'readonly');
            const index = tx.objectStore('sleepPlans').index('status');
            const request = index.getAll('archived');
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        }));
    }

    // --- Routine Steps (шаги распорядка) ---

    function saveRoutineSteps(steps) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('routineSteps', 'readwrite');
            const store = tx.objectStore('routineSteps');
            store.clear();
            steps.forEach(s => store.put(s));
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        }));
    }

    function getRoutineSteps() {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('routineSteps', 'readonly');
            const request = tx.objectStore('routineSteps').getAll();
            request.onsuccess = () => {
                const steps = request.result || [];
                steps.sort((a, b) => a.order - b.order);
                resolve(steps);
            };
            request.onerror = (e) => reject(e.target.error);
        }));
    }

    // --- Routine Progress (прогресс распорядка) ---

    function toggleRoutineProgress(dateStr, stepId) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('routineProgress', 'readwrite');
            const store = tx.objectStore('routineProgress');
            const request = store.get(dateStr);
            request.onsuccess = () => {
                const entry = request.result || { date: dateStr, steps: {} };
                if (entry.steps[stepId]) {
                    delete entry.steps[stepId];
                } else {
                    entry.steps[stepId] = true;
                }
                store.put(entry);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        }));
    }

    function getRoutineProgress(dateStr) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('routineProgress', 'readonly');
            const request = tx.objectStore('routineProgress').get(dateStr);
            request.onsuccess = () => {
                const entry = request.result;
                resolve(entry ? entry.steps : {});
            };
            request.onerror = (e) => reject(e.target.error);
        }));
    }

    return {
        open, saveEntry, getEntry, getAllEntries, deleteEntry,
        savePlan, getActivePlan, updatePlanStatus, getArchivedPlans,
        saveRoutineSteps, getRoutineSteps,
        toggleRoutineProgress, getRoutineProgress
    };
})();
