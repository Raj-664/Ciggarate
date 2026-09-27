/* IndexedDB storage layer for Cig Diary */
(function () {
  'use strict';

  const DB_NAME = 'cig_diary';
  const DB_VERSION = 1;
  const STORES = { brands: 'brands', cigarettes: 'cigarettes', packs: 'packs' };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is not supported in this browser.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORES.brands)) {
          db.createObjectStore(STORES.brands, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.cigarettes)) {
          const s = db.createObjectStore(STORES.cigarettes, { keyPath: 'id' });
          s.createIndex('brand_id', 'brand_id');
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains(STORES.packs)) {
          const s = db.createObjectStore(STORES.packs, { keyPath: 'id' });
          s.createIndex('brand_id', 'brand_id');
          s.createIndex('date', 'date');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function run(storeName, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let request;
      try {
        request = fn(store);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  const DB = {
    STORES,
    uid() {
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    },
    all(store) {
      return run(store, 'readonly', (s) => s.getAll());
    },
    get(store, id) {
      return run(store, 'readonly', (s) => s.get(id));
    },
    put(store, value) {
      return run(store, 'readwrite', (s) => s.put(value));
    },
    remove(store, id) {
      return run(store, 'readwrite', (s) => s.delete(id));
    },
    clear(store) {
      return run(store, 'readwrite', (s) => s.clear());
    },
    bulkPut(store, values) {
      return open().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        values.forEach((v) => os.put(v));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    },
  };

  window.DB = DB;
})();
