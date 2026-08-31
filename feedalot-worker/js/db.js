/*
CLEVITA FeedAlot Worker - local database (IndexedDB)

Every entry a worker captures is written HERE first, instantly, before
anything else happens - this is what makes the app work fully offline.
Sync and Export both just read FROM here; neither is what makes data safe,
this is.

Store layout (all local, never touches the network on its own):
  entries      - every captured entry, one row per pen+date+type+house
  meta         - small key/value bag: lastSyncedAt, lastBackedUpAt, personName
*/

const DB_NAME = "feedalot_worker";
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
      // v2: the group master file, stored as the RAW bytes the server sent.
      // Never parsed, never rebuilt - so all 65 merged ranges and the 211
      // feed-ledger formulas survive untouched.
      if (!db.objectStoreNames.contains("masters")) {
        db.createObjectStore("masters", { keyPath: "group" });
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
      // Demo captures are stamped at the one place every entry passes
      // through. They still export, but they are filtered out of Sync so
      // they can never reach the real group file.
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

  async putMaster(group, arrayBuffer) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("masters", "readwrite");
      tx.objectStore("masters").put({
        group, data: arrayBuffer,
        downloadedAt: new Date().toISOString(), bytes: arrayBuffer.byteLength,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getMaster(group) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("masters", "readonly");
      const req = tx.objectStore("masters").get(group);
      req.onsuccess = () => resolve(req.result || null);
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
