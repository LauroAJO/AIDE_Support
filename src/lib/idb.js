// Minimal IndexedDB wrapper with localStorage fallback.
// DB: "aide-idb", store: "state", key: "aide-v1"

const DB_NAME = 'aide-idb';
const STORE = 'state';
const KEY = 'aide-v1';
const LS_FALLBACK_KEY = `${DB_NAME}:${STORE}:${KEY}`;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSave(data) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(data));
    } catch {
      // give up silently — persistence is best-effort
    }
  }
}

export async function idbLoad() {
  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    try {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function idbClear() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      localStorage.removeItem(LS_FALLBACK_KEY);
    } catch {
      // ignore
    }
  }
}
