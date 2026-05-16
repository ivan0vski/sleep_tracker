const DB = (() => {
    const DB_NAME = 'SleepTrackerDB';
    const DB_VERSION = 1;
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
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

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

    return { open, saveEntry, getEntry, getAllEntries, deleteEntry };
})();
