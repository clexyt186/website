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

if (typeof module !== "undefined") module.exports = { syncNow, exportNow };
