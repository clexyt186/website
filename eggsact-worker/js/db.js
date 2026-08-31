/*
EGGSACT Worker - local database (IndexedDB)

Every entry a worker captures is written HERE first, instantly, before
anything else happens - this is what makes the app work fully offline.
Sync and Export both just read FROM here; neither is what makes data safe,
this is.

Store layout (all local, never touches the network on its own):
  entries      - every captured entry, one row per pen+date+type+house
  meta         - small key/value bag: lastSyncedAt, lastBackedUpAt, personName
  masters      - the workbook for a house, as RAW bytes
*/

const DB_NAME = "eggsact_worker";
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("entries")) {
        const store = db.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
        store.createIndex("by_synced", "synced", { unique: false });
        store.createIndex("by_type_date_house", ["type", "date", "house"], { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      // v2: the house workbook, stored as the RAW bytes exactly as they were
      // served or embedded. Never parsed, never rewritten - so every formula,
      // rollup and FCR link survives untouched. Export hands these bytes
      // straight back with the device's entries patched in.
      if (!db.objectStoreNames.contains("masters")) {
        db.createObjectStore("masters", { keyPath: "house" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

const DB = {
  async addEntry(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      entry.savedAt = new Date().toISOString();
      entry.synced = false;
      // Demo captures are stamped here, at the one place every entry passes
      // through. They still export (that is the point of the demo) but they
      // are filtered out of Sync so they can never reach the real master.
      entry.demo = !!(typeof state !== "undefined" && state && state.demo);
      const req = store.add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async allEntries() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readonly");
      const req = tx.objectStore("entries").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteEntry(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      tx.objectStore("entries").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Demo entries stay on the device - they are dummy data and must never
   *  reach the real master. Everything else that isn't synced yet. */
  async unsyncedEntries() {
    const all = await this.allEntries();
    return all.filter((e) => !e.synced && !e.demo);
  },

  async markSynced(ids) {
    const db = await openDB();
    const tx = db.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result;
        if (rec) {
          rec.synced = true;
          store.put(rec);
        }
      };
    }
    return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
  },

  // ------------------------------------------------------------ masters
  /**
   * isTemplate marks a workbook that came from templates.js rather than from
   * the home PC. It changes nothing about how the bytes are stored - it is
   * there so Export can tell the person whether they are holding the real
   * house file or a blank layout, instead of both looking identical.
   */
  async putMaster(house, arrayBuffer, isTemplate) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("masters", "readwrite");
      tx.objectStore("masters").put({
        house,
        data: arrayBuffer,
        downloadedAt: new Date().toISOString(),
        bytes: arrayBuffer.byteLength,
        isTemplate: !!isTemplate,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getMaster(house) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("masters", "readonly");
      const req = tx.objectStore("masters").get(house);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async allMasters() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("masters", "readonly");
      const req = tx.objectStore("masters").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async setMeta(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getMeta(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const req = tx.objectStore("meta").get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  },
};

if (typeof module !== "undefined") module.exports = { DB, openDB };
