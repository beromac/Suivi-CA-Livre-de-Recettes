// Stockage local (IndexedDB) : missions, dépenses, fichiers (justificatifs), réglages.
const DB_NAME = 'livre-recettes';
const DB_VERSION = 3;
let db;

export function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      // Création « si absent » : fonctionne pour une première installation comme pour une mise à jour (v1 → v2 → v3).
      for (const s of ['missions', 'depenses', 'files', 'releves', 'documents']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const getAll = (s) => wrap(store(s).getAll());
export const get = (s, k) => wrap(store(s).get(k));
export const put = (s, v, k) => wrap(store(s, 'readwrite').put(v, k));
export const del = (s, k) => wrap(store(s, 'readwrite').delete(k));
export const clear = (s) => wrap(store(s, 'readwrite').clear());
