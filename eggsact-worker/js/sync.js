/*
EGGSACT Worker - sync client

Pushes unsynced local entries to the master (Home/Farm) via the SAME
/sync/upload_file endpoint the desktop app's push client uses - a worker
device is just another device pushing a file, no special protocol. Entries
are marked synced locally ONLY after the server confirms, so a failed sync
never loses anything.

This file previously defined refreshMaster TWICE and both exportMaster and
exportMasterFile. The second refreshMaster silently won and it was the one
that did not record lastMasterAt, so "Load latest" never updated its own
timestamp. The duplicates are gone; one definition of each remains.
*/

const NGROK_HEADER = { "ngrok-skip-browser-warning": "true" };

async function syncNow(serverUrl, person) {
  const unsynced = await DB.unsyncedEntries();
  if (unsynced.length === 0) {
    return { status: "nothing_new" };
  }
  let blob;
  try {
    blob = buildWorkbookBlob(unsynced, XLSX);
  } catch (e) {
    return { status: "error", message: `Couldn't build export: ${e.message}` };
  }

  const form = new FormData();
  form.append("file", blob, `worker_sync_${Date.now()}.xlsx`);
  if (person) form.append("person", person);

  try {
    const resp = await fetch(`${serverUrl.replace(/\/$/, "")}/sync/upload_file`, {
      method: "POST",
      body: form,
      headers: NGROK_HEADER,
    });
    const body = await resp.json();
    if (resp.ok && body.ok) {
      await DB.markSynced(unsynced.map((e) => e.id));
      await DB.setMeta("lastSyncedAt", new Date().toISOString());
      return { status: "ok", count: unsynced.length, imported: body.imported, skipped: body.skipped };
    }
    return { status: "error", message: body.error || `Server returned ${resp.status}` };
  } catch (e) {
    return { status: "error", message: `Network error: ${e.message} (no internet? server unreachable?)` };
  }
}

/**
 * Downloads this house's master file from the home PC and stores the RAW
 * bytes, replacing any embedded template that was there. The server checks
 * name + PIN + house access before it sends anything, so this is
 * permission-gated at the source, not by hiding a button.
 *
 * Deliberately never parsed: the master carries tens of thousands of live
 * formulas (weekly rollups, %HDE, FCR) and the bundled SheetJS build cannot
 * read them - a parse-and-rewrite round trip would hand back a master with
 * every formula stripped out. Storing bytes keeps it byte-identical.
 */
async function refreshMaster(serverUrl, house, person, pin) {
  const url = `${serverUrl.replace(/\/$/, "")}/sync/master_file` +
              `?name=${encodeURIComponent(person)}` +
              `&pin=${encodeURIComponent(pin)}` +
              `&house=${encodeURIComponent(house)}`;
  try {
    const resp = await fetch(url, { headers: NGROK_HEADER });
    if (!resp.ok) {
      let msg = `Server returned ${resp.status}`;
      try { const b = await resp.json(); msg = b.error || msg; } catch (e) {}
      return { status: "error", message: msg };
    }
    const buf = await resp.arrayBuffer();
    if (!buf || buf.byteLength < 1000) {
      return { status: "error", message: "The server sent an empty or unreadable file." };
    }
    // isTemplate = false: this is the real thing now.
    await DB.putMaster(house, buf, false);
    await DB.setMeta("lastMasterAt:" + house, new Date().toISOString());
    return { status: "ok", bytes: buf.byteLength };
  } catch (e) {
    return { status: "error", message: `Network error: ${e.message}` };
  }
}

/**
 * Exports the stored workbook - the real master if one was downloaded, the
 * embedded blank house layout otherwise - with this device's not-yet-synced
 * entries written into their correct cells. See master.js: cells are patched
 * inside the zip, so every formula and rollup survives.
 */
async function exportMasterFile(house) {
  const built = await buildMasterExport(house);
  if (!built) return { status: "no_master" };
  const url = URL.createObjectURL(built.blob);
  const a = document.createElement("a");
  a.href = url; a.download = built.filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  await DB.setMeta("lastBackedUpAt", new Date().toISOString());
  return { status: "ok", placed: built.placed, problems: built.problems,
           downloadedAt: built.downloadedAt, isTemplate: built.isTemplate };
}

/** My-entries-only backup: the fallback when no workbook is stored at all. */
async function exportNow() {
  const all = await DB.allEntries();
  if (all.length === 0) {
    return { status: "nothing_new" };
  }
  const blob = buildWorkbookBlob(all, XLSX);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `eggsact_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await DB.setMeta("lastBackedUpAt", new Date().toISOString());
  return { status: "ok", count: all.length };
}

if (typeof module !== "undefined") {
  module.exports = { syncNow, exportNow, refreshMaster, exportMasterFile };
}
