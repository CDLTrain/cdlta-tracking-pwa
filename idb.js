// Minimal IndexedDB helper (no dependencies)
(function () {
  const DB_NAME = "cdlta_tracker_db";
  const DB_VER = 1;

  const STORE_STUDENTS = "students";
  const STORE_QUEUE = "queue";
  const STORE_META = "meta";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(STORE_STUDENTS)) {
          const s = db.createObjectStore(STORE_STUDENTS, { keyPath: "student_id" });
          s.createIndex("full_name", "full_name", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "txn_id" });
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, storeName, mode = "readonly") {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function put(storeName, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = tx(db, storeName, "readwrite");
      const req = store.put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(storeName, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = tx(db, storeName, "readonly");
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function del(storeName, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = tx(db, storeName, "readwrite");
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = tx(db, storeName, "readonly");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function clear(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = tx(db, storeName, "readwrite");
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // Public API
  window.CDLTA_IDB = {
    STORE_STUDENTS,
    STORE_QUEUE,
    STORE_META,
    put,
    get,
    del,
    getAll,
    clear,
  };
})();
