/*
EGGSACT Worker - sync client

Pushes unsynced local entries to the master (Home/Farm) via the SAME
/sync/upload_file endpoint the desktop app's push client (sync_push.py)
uses - a worker device is just another device pushing a file, no special
protocol. Marks entries synced locally only after the server confirms.
*/

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
 * bytes. Deliberately never parsed: the master carries thousands of live
 * formulas (weekly rollups, %HDE, FCR) and the bundled SheetJS build cannot
 * read or rewrite them - a parse-and-rewrite round trip would hand back a
 * master with every formula stripped out. Storing bytes keeps the file
 * byte-identical to the one on the home PC.
 */
async function refreshMaster(serverUrl, house, person, pin) {
  const url = `${serverUrl.replace(/\/$/, "")}/sync/master_file` +
              `?name=${encodeURIComponent(person)}` +
              `&pin=${encodeURIComponent(pin)}` +
              `&house=${encodeURIComponent(house)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      let msg = `Server returned ${resp.status}`;
      try { const b = await resp.json(); msg = b.error || msg; } catch (e) {}
      return { status: "error", message: msg };
    }
    const buf = await resp.arrayBuffer();
    if (!buf || buf.byteLength < 1000) {
      return { status: "error", message: "The server sent an empty or unreadable file." };
    }
    await DB.putMaster(house, buf);
    await DB.setMeta("lastMasterAt:" + house, new Date().toISOString());
    return { status: "ok", bytes: buf.byteLength };
  } catch (e) {
    return { status: "error", message: `Network error: ${e.message}` };
  }
}

/**
 * Hands back the stored master file, exactly as downloaded. Formulas,
 * formatting and every other house's synced data are all intact because
 * nothing here touches the bytes.
 *
 * Entries captured on this device SINCE the last refresh are not inside it
 * yet - they go in when you Sync, and appear in the master the next time you
 * Refresh. The caller reports that count so it is never a silent gap.
 */
async function exportMaster(house) {
  const stored = await DB.getMaster(house);
  if (!stored) return { status: "no_master" };
  const unsynced = (await DB.unsyncedEntries()).filter((e) => e.house === house);
  const blob = new Blob([stored.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${house.replace(/^House\s+/, "")}_master_${stored.downloadedAt.slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await DB.setMeta("lastBackedUpAt", new Date().toISOString());
  return {
    status: "ok",
    downloadedAt: stored.downloadedAt,
    pending: unsynced.length,
    bytes: stored.bytes,
  };
}

/** My-entries-only backup. Kept as the secondary action - useful when there
 *  is no master yet, or to hand someone just today's capture. */
/**
 * Downloads this house's master file and stores the RAW bytes. The server
 * checks name + PIN + house access before it sends anything, so this is
 * permission-gated at the source, not by hiding the button.
 */
async function refreshMaster(serverUrl, house, person, pin) {
  const url = `${serverUrl.replace(/\/$/, "")}/sync/master_file` +
              `?name=${encodeURIComponent(person)}` +
              `&pin=${encodeURIComponent(pin)}` +
              `&house=${encodeURIComponent(house)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      let msg = `Server returned ${resp.status}`;
      try { const b = await resp.json(); msg = b.error || msg; } catch (err) {}
      return { status: "error", message: msg };
    }
    const buf = await resp.arrayBuffer();
    if (!buf || buf.byteLength < 1000) {
      return { status: "error", message: "The server sent an empty or unreadable file." };
    }
    await DB.putMaster(house, buf);
    return { status: "ok", bytes: buf.byteLength };
  } catch (e) {
    return { status: "error", message: `Network error: ${e.message}` };
  }
}

/**
 * Exports the local master: the downloaded home-PC file with this device's
 * not-yet-synced entries written into their correct cells. See master.js -
 * cells are patched inside the zip, so all the rollup and FCR formulas
 * survive.
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
           downloadedAt: built.downloadedAt };
}

/** My-entries-only backup: the secondary action, and the fallback when no
 *  master has been downloaded yet. */
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

if (typeof module !== "undefined") module.exports = { syncNow, exportNow, refreshMaster, exportMasterFile };
