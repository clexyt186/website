/*
CLEVITA FeedAlot Worker - main app logic

Server URL is the SAME physical server EGGSACT already uses (one ngrok
tunnel, shared Flask process) - FeedAlot's routes just live under
/feedlot/ on that same address.
*/

const DEFAULT_SERVER_URL = "https://purse-delta-humming.ngrok-free.dev";
// A device that once saved a localhost/http address in Settings would keep
// using it forever and never reach the home PC. Any saved localhost or
// plain-http address is discarded once, same guard EGGSACT already has.
let SERVER_URL = (() => {
  const saved = localStorage.getItem("feedalot_server_url");
  if (!saved || /127\.0\.0\.1|localhost|^http:\/\//i.test(saved)) {
    localStorage.removeItem("feedalot_server_url");
    return DEFAULT_SERVER_URL;
  }
  return saved;
})();

let state = { group: null, name: null, password: null, demo: false };

function $(sel) { return document.querySelector(sel); }
function today() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------------- login
function initLogin() {
  const savedGroup = localStorage.getItem("feedalot_group");
  const savedName = localStorage.getItem("feedalot_name");
  const savedPw = localStorage.getItem("feedalot_pw");
  if (savedGroup && savedName && savedPw) {
    state = { group: savedGroup, name: savedName, password: savedPw, demo: false };
    showCapture();
    return;
  }
  showLogin();
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#capture-screen").classList.add("hidden");
  $("#login-name").focus();
  addDemoButton();
}

// Group passwords - same list as FeedAlot's config.json. Checked locally,
// no server needed for login at all - matches the desktop app's own login,
// which also never touches a server. Only syncing needs a connection.
const GROUP_PASSWORDS = {
  "Group 1": "group1", "Group 2": "group2", "Group 3": "group3",
  "Group 4": "group4", "Group 5 - Merino Mob": "group5",
};

function doLogin() {
  const group = $("#group-select").value;
  const name = $("#login-name").value.trim();
  const pw = $("#login-pw").value;
  if (!name || !pw) { $("#login-status").textContent = "Enter your name and this group's password."; return; }
  if (pw.trim().toLowerCase() !== GROUP_PASSWORDS[group].trim().toLowerCase()) {
    $("#login-status").textContent = "Wrong password for this group.";
    return;
  }
  state = { group, name, password: pw, demo: false };
  localStorage.setItem("feedalot_group", group);
  localStorage.setItem("feedalot_name", name);
  localStorage.setItem("feedalot_pw", pw);
  showCapture();
}

function logout() {
  localStorage.removeItem("feedalot_group");
  localStorage.removeItem("feedalot_name");
  localStorage.removeItem("feedalot_pw");
  const _dm = document.getElementById("demo-banner"); if (_dm) _dm.remove();
  state = { group: null, name: null, password: null, demo: false };
  showLogin();
}

// ---------------------------------------------------------------- capture screen
function showCapture() {
  // Install the embedded template for this group so a real layout exists on
  // this device from install - no server call needed.
  if (typeof ensureFeedalotTemplate === "function" && state.group) {
    ensureFeedalotTemplate(state.group).catch(() => {});
  }
  $("#login-screen").classList.add("hidden");
  $("#capture-screen").classList.remove("hidden");
  $("#who").textContent = state.name;
  $("#group-label").textContent = state.group;
  $("#f-date").value = today();
  refreshStatus();
  $("#p-eid").focus();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tab}`));
  if (tab === "mydata") renderMyData();
}

function chainEnter(fromId, toId, onLast) {
  $(fromId).addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (toId) { $(toId).focus(); if ($(toId).select) $(toId).select(); }
    else if (onLast) onLast();
  });
}

function flashStatus(msg, isError) {
  const el = $("#flash");
  el.textContent = msg;
  el.className = isError ? "flash error" : "flash ok";
  setTimeout(() => { el.textContent = ""; el.className = "flash"; }, 2500);
}

async function afterSave() { await refreshStatus(); }

// ---------------------------------------------------------------- Processing
async function saveProcessing() {
  const sheepId = $("#p-sheepid").value.trim();
  if (!sheepId) { flashStatus("Enter a Sheep ID.", true); return; }
  const weight = parseNumber($("#p-weight").value);
  if ($("#p-weight").value.trim() && weight === null) { flashStatus("Weight isn't a valid number.", true); return; }
  const bcs = parseNumber($("#p-bcs").value);
  if ($("#p-bcs").value.trim() && bcs === null) { flashStatus("BCS isn't a valid number.", true); return; }
  await DB.addEntry({
    type: "processing", group: state.group, date: $("#f-date").value || today(),
    eid: $("#p-eid").value.trim(), sheepId, weight, bcs, status: $("#p-status").value.trim(),
  });
  flashStatus(`Registered ${sheepId}.`);
  for (const id of ["#p-eid", "#p-sheepid", "#p-weight", "#p-bcs", "#p-status"]) $(id).value = "";
  $("#p-eid").focus();
  afterSave();
}

// ---------------------------------------------------------------- Weighing
async function saveWeighing() {
  const sheepId = $("#w-sheepid").value.trim();
  if (!sheepId) { flashStatus("Enter a Sheep ID.", true); return; }
  const weight = parseNumber($("#w-weight").value);
  const famacha = parseNumber($("#w-famacha").value, true);
  if ($("#w-weight").value.trim() && weight === null) { flashStatus("Weight isn't a valid number.", true); return; }
  if ($("#w-famacha").value.trim() && famacha === null) { flashStatus("FAMACHA isn't a valid number.", true); return; }
  const dateVal = $("#f-date").value || today();
  if (weight !== null) {
    await DB.addEntry({ type: "weighing", group: state.group, date: dateVal, sheepId, weight });
  }
  if (famacha !== null) {
    await DB.addEntry({ type: "famacha", group: state.group, date: dateVal, sheepId, score: famacha });
  }
  flashStatus(`Saved ${sheepId}.`);
  $("#w-weight").value = ""; $("#w-famacha").value = "";
  $("#w-sheepid").focus(); $("#w-sheepid").select();
  afterSave();
}

// ---------------------------------------------------------------- Feeding + Feed Stock
async function saveFeeding() {
  const dateVal = $("#f-date").value || today();
  await DB.addEntry({
    type: "feeding", group: state.group, date: dateVal,
    amFeeders: $("#fd-am-feeders").value, amOut: $("#fd-am-out").value, amIn: $("#fd-am-in").value,
    pmFeeders: $("#fd-pm-feeders").value, pmOut: $("#fd-pm-out").value, pmIn: $("#fd-pm-in").value,
    notes: $("#fd-notes").value,
  });
  flashStatus("Feeding log saved.");
  for (const id of ["#fd-am-feeders", "#fd-am-out", "#fd-am-in", "#fd-pm-feeders", "#fd-pm-out", "#fd-pm-in", "#fd-notes"]) $(id).value = "";
  $("#fd-am-feeders").focus();
  afterSave();
}

async function saveFeedStock() {
  const fedAm = parseNumber($("#fs-am").value) || 0;
  const fedPm = parseNumber($("#fs-pm").value) || 0;
  if ($("#fs-am").value.trim() && parseNumber($("#fs-am").value) === null) { flashStatus("AM amount isn't a valid number.", true); return; }
  if ($("#fs-pm").value.trim() && parseNumber($("#fs-pm").value) === null) { flashStatus("PM amount isn't a valid number.", true); return; }
  await DB.addEntry({
    type: "feedstock", group: state.group, date: $("#f-date").value || today(),
    fedAm, fedPm,
  });
  flashStatus("Feed stock updated.");
  $("#fs-am").value = ""; $("#fs-pm").value = "";
  $("#fs-am").focus();
  afterSave();
}

// ---------------------------------------------------------------- Observations
async function saveObservation() {
  const session = $("#o-session").value;
  await DB.addEntry({
    type: session === "AM" ? "obs_am" : "obs_pm", group: state.group, date: $("#f-date").value || today(),
    behaviour: $("#o-behaviour").value, water: $("#o-water").value, dung: $("#o-dung").value,
    penCondition: $("#o-pen").value, notes: $("#o-notes").value, weather: $("#o-weather").value,
  });
  flashStatus(`${session} observation saved.`);
  for (const id of ["#o-behaviour", "#o-water", "#o-dung", "#o-pen", "#o-notes", "#o-weather"]) $(id).value = "";
  $("#o-behaviour").focus();
  afterSave();
}

// ---------------------------------------------------------------- Sick
async function saveSick() {
  const sheepId = $("#s-sheepid").value.trim();
  if (!sheepId) { flashStatus("Enter a Sheep ID.", true); return; }
  await DB.addEntry({
    type: "sick", group: state.group, date: $("#f-date").value || today(),
    sheepId, symptoms: $("#s-symptoms").value, treatment: $("#s-treatment").value, conditionAfter: $("#s-after").value,
  });
  flashStatus(`Sick log saved for ${sheepId}.`);
  for (const id of ["#s-sheepid", "#s-symptoms", "#s-treatment", "#s-after"]) $(id).value = "";
  $("#s-sheepid").focus();
  afterSave();
}

// ---------------------------------------------------------------- status / sync / export
async function refreshStatus() {
  const unsynced = await DB.unsyncedEntries();
  const all = await DB.allEntries();
  const lastSynced = await DB.getMeta("lastSyncedAt");
  $("#pending-count").textContent = unsynced.length;
  $("#total-count").textContent = all.length;
  $("#last-synced").textContent = lastSynced ? timeAgo(lastSynced) : "never";
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

async function handleSync() {
  // Demo data is dummy data. It stays on the device and never goes to the
  // real server, or it would land in the real group file.
  if (state.demo) { flashStatus("Demo mode - nothing is sent to the server. Export still works.", true); return; }
  const unsynced = await DB.unsyncedEntries();
  if (unsynced.length === 0) { flashStatus("Nothing new to sync."); return; }
  $("#sync-btn").disabled = true; $("#sync-btn").textContent = "Syncing…";
  try {
    const blob = buildWorkbookBlob(unsynced, XLSX);
    const form = new FormData();
    form.append("file", blob, `feedalot_sync_${Date.now()}.xlsx`);
    const resp = await fetch(`${SERVER_URL}/feedlot/sync/upload_file`, {
      method: "POST",
      body: form,
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    const body = await resp.json();
    if (resp.ok && body.ok) {
      await DB.markSynced(unsynced.map((e) => e.id));
      await DB.setMeta("lastSyncedAt", new Date().toISOString());
      flashStatus(`Synced ${unsynced.length} entr${unsynced.length === 1 ? "y" : "ies"}.`);
    } else {
      flashStatus(body.error || `Server returned ${resp.status}`, true);
    }
  } catch (e) {
    flashStatus(`Network error: ${e.message}`, true);
  }
  $("#sync-btn").disabled = false; $("#sync-btn").textContent = "Sync";
  refreshStatus();
}

async function handleExport() {
  // The FULL group file whenever this device holds one - that is the point
  // of Refresh. Without one it falls back to a my-entries-only file, which
  // is clearly labelled as such rather than pretending to be the master.
  const held = await DB.getMaster(state.group);
  if (held) {
    flashStatus("Building the group file…");
    const built = await buildGroupExport(state.group);
    const url = URL.createObjectURL(built.blob);
    const a2 = document.createElement("a");
    a2.href = url; a2.download = built.filename;
    document.body.appendChild(a2); a2.click(); a2.remove();
    URL.revokeObjectURL(url);
    let msg = `Group file downloaded (${built.placed} of your entries written in).`;
    if (built.problems.length) msg += ` ${built.problems.length} couldn't be placed.`;
    flashStatus(msg);
    return;
  }
  const all = await DB.allEntries();
  if (all.length === 0) { flashStatus("Nothing to export yet."); return; }
  const blob = buildWorkbookBlob(all, XLSX);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `feedalot_my_entries_${today()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  flashStatus(`No group file loaded yet - downloaded your ${all.length} entries only. ` +
              `Use "Refresh full group data" in My Data to get the real file.`);
}

function saveServerUrl() {
  const url = prompt("Server address:", SERVER_URL);
  if (url) { SERVER_URL = url.trim(); localStorage.setItem("feedalot_server_url", SERVER_URL); flashStatus("Server address saved."); }
}

// ---------------------------------------------------------------- My Data
const TYPE_LABELS = {
  processing: "Processing", weighing: "Weighing", famacha: "FAMACHA",
  feeding: "Feeding Log", feedstock: "Feed Stock", obs_am: "Observation (AM)",
  obs_pm: "Observation (PM)", sick: "Sick",
};

function summarizeEntry(e) {
  switch (e.type) {
    case "processing": return `${e.sheepId} - ${e.weight ?? "?"}kg, BCS ${e.bcs ?? "?"}, ${e.status || ""}`;
    case "weighing": return `${e.sheepId} - ${e.weight}kg`;
    case "famacha": return `${e.sheepId} - score ${e.score}`;
    case "feeding": return `AM out ${e.amOut || "-"} / in ${e.amIn || "-"}, PM out ${e.pmOut || "-"} / in ${e.pmIn || "-"}`;
    case "feedstock": return `Fed AM: ${e.fedAm}kg, Fed PM: ${e.fedPm}kg`;
    case "obs_am": case "obs_pm": return `${e.behaviour || ""} - water: ${e.water || "-"}, dung: ${e.dung || "-"}`;
    case "sick": return `${e.sheepId} - ${e.symptoms || ""}`;
    default: return "";
  }
}

async function renderMyData() {
  const filter = $("#mydata-type").value;
  const all = await DB.allEntries();
  const filtered = (filter === "all" ? all : all.filter((e) => e.type === filter))
    .sort((a, b) => (b.date + (b.id || 0)) > (a.date + (a.id || 0)) ? 1 : -1);
  const listEl = $("#mydata-list");
  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="dim small">Nothing captured here yet.</p>`;
    return;
  }
  listEl.innerHTML = filtered.map((e) =>
    `<div class="mydata-row">
      <span>${e.date}</span>
      <span>${TYPE_LABELS[e.type] || e.type}</span>
      <span>${summarizeEntry(e)}</span>
      <span>${e.synced ? "✓ synced" : "pending"}</span>
    </div>`
  ).join("");
}

// ---------------------------------------------------------------- Scanner Import
/*
Same real format confirmed against an actual XR5000 export: a single
column of comma-joined CSV lines - EID,VID,Weight,Date,Time,Adg,Days,Lwg.
Each row becomes a normal weighing entry, saved locally exactly like the
manual Weighing tab would - it flows through the same sync path already
built and tested, no new server work needed.
*/
function parseScannerFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const lines = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell && cell.v) lines.push(String(cell.v));
  }
  if (lines.length === 0) throw new Error("File appears to be empty.");
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;
    rows.push({
      eid: cols[idx("EID")].trim(),
      vid: cols[idx("VID")].trim(),
      weight: Number(cols[idx("Weight")]),
      date: cols[idx("Date")].trim(),
    });
  }
  return rows;
}

async function handleScannerFile(file) {
  const resultEl = $("#scanner-result");
  resultEl.innerHTML = `<p class="dim small">Reading file…</p>`;
  try {
    const buffer = await file.arrayBuffer();
    const rows = parseScannerFile(buffer);
    for (const row of rows) {
      await DB.addEntry({ type: "weighing", group: state.group, date: row.date, sheepId: row.vid, weight: row.weight });
    }
    resultEl.innerHTML = `<p class="flash ok" style="text-align:left">Queued ${rows.length} readings as weighing entries - hit Sync to send them in.</p>`;
    afterSave();
  } catch (e) {
    resultEl.innerHTML = `<p class="flash error" style="text-align:left">Couldn't read that file: ${e.message}</p>`;
  }
}

async function handleRefreshGroup() {
  $("#refresh-group-btn").disabled = true;
  $("#refresh-status").textContent = "Downloading…";
  try {
    const url = `${SERVER_URL}/feedlot/sync/group_file?group=${encodeURIComponent(state.group)}&password=${encodeURIComponent(state.password)}`;
    const resp = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      $("#refresh-status").textContent = body.error || `Failed (${resp.status}).`;
      $("#refresh-group-btn").disabled = false;
      return;
    }
    // STORE it rather than dumping it straight into Downloads. Keeping the
    // raw bytes is what lets Export hand back a real, complete group file
    // later - with this phone's own entries written into it - and it works
    // offline from then on.
    const buf = await resp.arrayBuffer();
    if (!buf || buf.byteLength < 1000) {
      $("#refresh-status").textContent = "The server sent an empty or unreadable file.";
      $("#refresh-group-btn").disabled = false;
      return;
    }
    await DB.putMaster(state.group, buf);
    localStorage.setItem("feedalot_last_refresh", new Date().toISOString());
    const kb = Math.round(buf.byteLength / 1024);
    $("#refresh-status").textContent =
      `Loaded (${kb} KB) - includes everyone's synced data as of now. ` +
      `Export now gives you this whole file.`;
    refreshStatus();
  } catch (e) {
    $("#refresh-status").textContent = `Network error: ${e.message}`;
  }
  $("#refresh-group-btn").disabled = false;
}

// ---------------------------------------------------------------- Formulation
function safeId(name) {
  return name.replace(/[^a-zA-Z0-9]/g, "_");   // spaces in ingredient names broke raw CSS ID selectors
}

function renderFormulationFields() {
  const container = $("#formulation-fields");
  const byCat = ingredientsByCategory();
  let html = "";
  for (const cat of CATEGORIES) {
    html += `<h3 style="color:var(--accent);font-size:13px;margin:14px 0 6px">${CATEGORY_LABELS[cat]}</h3>`;
    for (const name of byCat[cat]) {
      const info = INGREDIENTS[name];
      const id = safeId(name);
      const note = (info.me || info.cp) ? `~${info.me} MJ/kg, ~${info.cp.toFixed(0)}% CP${info.estimated ? " (estimated)" : ""}` : "";
      html += `
        <div class="row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <label style="flex:1;margin:0" for="fk-${id}">${name}</label>
          <input id="fk-${id}" type="text" inputmode="decimal" placeholder="kg" style="width:70px">
          <span class="dim small" style="width:110px">${note}</span>
        </div>`;
    }
  }
  container.innerHTML = html;
}

function calculateFormulation() {
  const mix = {};
  for (const name of Object.keys(INGREDIENTS)) {
    const el = $(`#fk-${safeId(name)}`);
    if (!el) continue;
    const val = parseNumber(el.value);
    if (val && val > 0) mix[name] = val;
  }
  if (Object.keys(mix).length === 0) { flashStatus("Enter at least one ingredient amount.", true); return; }
  let result;
  try {
    result = calculateRation(mix, {});
  } catch (e) {
    flashStatus(e.message, true); return;
  }
  const box = $("#formulation-result");
  let html = `
    <p><strong>Batch size:</strong> ${result.totalKg} kg</p>
    <p><strong>Energy:</strong> ${result.avgMe} MJ/kg DM &nbsp; <strong>Protein:</strong> ${result.avgCp}% DM</p>
    <p><strong>Roughage:</strong> ${result.roughagePct}% &nbsp; <strong>Concentrate:</strong> ${result.concentratePct}%</p>
    <p><strong>Cost:</strong> R${result.totalCost} total (R${result.costPerKg}/kg)</p>`;
  if (result.warnings.length) {
    html += result.warnings.map((w) => `<p class="flash error" style="text-align:left">⚠ ${w}</p>`).join("");
  } else {
    html += `<p class="flash ok" style="text-align:left">Looks like a reasonable, balanced mix - no warnings.</p>`;
  }
  box.innerHTML = html;
}

// ---------------------------------------------------------------- wire up
document.addEventListener("DOMContentLoaded", () => {
  $("#login-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#login-pw").focus(); });
  $("#login-pw").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  $("#login-btn").addEventListener("click", doLogin);
  $("#logout-btn").addEventListener("click", logout);

  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  chainEnter("#p-eid", "#p-sheepid"); chainEnter("#p-sheepid", "#p-weight");
  chainEnter("#p-weight", "#p-bcs"); chainEnter("#p-bcs", "#p-status");
  chainEnter("#p-status", null, saveProcessing);
  $("#save-processing-btn").addEventListener("click", saveProcessing);

  chainEnter("#w-sheepid", "#w-weight"); chainEnter("#w-weight", "#w-famacha");
  chainEnter("#w-famacha", null, saveWeighing);
  $("#save-weighing-btn").addEventListener("click", saveWeighing);

  chainEnter("#fd-am-feeders", "#fd-am-out"); chainEnter("#fd-am-out", "#fd-am-in");
  chainEnter("#fd-am-in", "#fd-pm-feeders"); chainEnter("#fd-pm-feeders", "#fd-pm-out");
  chainEnter("#fd-pm-out", "#fd-pm-in"); chainEnter("#fd-pm-in", "#fd-notes");
  chainEnter("#fd-notes", null, saveFeeding);
  $("#save-feeding-btn").addEventListener("click", saveFeeding);
  chainEnter("#fs-am", "#fs-pm"); chainEnter("#fs-pm", null, saveFeedStock);
  $("#save-feedstock-btn").addEventListener("click", saveFeedStock);

  chainEnter("#o-behaviour", "#o-water"); chainEnter("#o-water", "#o-dung");
  chainEnter("#o-dung", "#o-pen"); chainEnter("#o-pen", "#o-notes");
  chainEnter("#o-notes", "#o-weather"); chainEnter("#o-weather", null, saveObservation);
  $("#save-obs-btn").addEventListener("click", saveObservation);

  chainEnter("#s-sheepid", "#s-symptoms"); chainEnter("#s-symptoms", "#s-treatment");
  chainEnter("#s-treatment", "#s-after"); chainEnter("#s-after", null, saveSick);
  $("#save-sick-btn").addEventListener("click", saveSick);

  $("#sync-btn").addEventListener("click", handleSync);
  // Emergency Recovery button - added next to Sync/Export so it's always
  // reachable even when everything else is broken.
  if (!document.getElementById("recover-btn") && document.querySelector(".action-row")) {
    const btn = document.createElement("button");
    btn.id = "recover-btn";
    btn.textContent = "Recover all data";
    btn.style.cssText = "background:#8a3a1a;color:#ffd8a0;border:none;font-weight:600";
    btn.title = "Download every captured entry from this device as a file. Use when Sync isn't working.";
    btn.addEventListener("click", emergencyDump);
    document.querySelector(".action-row").appendChild(btn);
  }

  $("#export-btn").addEventListener("click", handleExport);
  $("#settings-btn").addEventListener("click", saveServerUrl);
  $("#formulation-calc-btn").addEventListener("click", calculateFormulation);
  $("#mydata-type").addEventListener("change", renderMyData);
  $("#refresh-group-btn").addEventListener("click", handleRefreshGroup);
  $("#scanner-file").addEventListener("change", (e) => {
    if (e.target.files.length) handleScannerFile(e.target.files[0]);
  });
  renderFormulationFields();

  initLogin();
  setupAutoUpdate();
});

/* ---------------------------------------------------------------- emergency recovery
   Dumps EVERY captured entry from IndexedDB straight to the phone as a JSON
   file. No server, no permissions, no sync needed - the person taps the
   button and their browser saves the file. Send it to the master PC and it
   can be imported back into the ledger.

   This is the ONLY reliable way to get data off a phone whose sync is
   broken. It always works because it never leaves the device.  */
async function emergencyDump() {
  try {
    const all = await DB.allEntries();
    if (!all.length) { flashStatus("Nothing captured on this device."); return; }
    const payload = {
      app: "feedalot-worker",
      exported_at: new Date().toISOString(),
      device: navigator.userAgent,
      entry_count: all.length,
      entries: all,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedalot_captures_${new Date().toISOString().slice(0,10)}_${all.length}entries.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    flashStatus(`Downloaded ${all.length} entries. Send that file to the master PC.`);
  } catch (e) {
    flashStatus(`Recovery failed: ${e.message}`);
  }
}

/* ---------------------------------------------------------------- demo mode
   Login-screen button that lets someone browse the app with no account.  */
function addDemoButton() {
  if (document.getElementById("demo-btn")) return;
  const host = document.getElementById("login-status") || document.getElementById("login-screen");
  if (!host) return;
  const btn = document.createElement("button");
  btn.id = "demo-btn";
  btn.type = "button";
  btn.textContent = "Try a demo (no account, nothing saved)";
  btn.style.cssText = "display:block;margin:14px auto 0;padding:8px 14px;background:transparent;border:1px solid #7fb3ff;color:#7fb3ff;border-radius:8px;font-size:13px;cursor:pointer";
  btn.addEventListener("click", enterDemo);
  host.parentNode.insertBefore(btn, host.nextSibling);
}
function enterDemo() {
  state = { group: "Group 5 - Merino Mob", name: "Demo user", password: null, demo: true };
  localStorage.removeItem("feedalot_group");
  localStorage.removeItem("feedalot_name");
  localStorage.removeItem("feedalot_pw");
  showCapture();
  if (typeof flashStatus === "function") flashStatus("Demo mode - nothing you type here is saved or sent.");
  if (!document.getElementById("demo-banner")) {
    const b = document.createElement("div");
    b.id = "demo-banner";
    b.style.cssText = "background:#5a3a1a;color:#ffd8a0;text-align:center;padding:6px;font-size:12px;font-weight:600";
    b.textContent = "DEMO MODE - browse the app, nothing is saved. Sign out to leave.";
    document.getElementById("capture-screen").prepend(b);
  }
}

/* ------------------------------------------------------------ auto-update

A PWA only picks up a new build when it is opened with a connection, and
even then the page keeps running the old code until it is reloaded. That is
why a phone could take a deploy and still behave like the old version.

This does three things:
  - re-checks for a new service worker every 15 minutes and every time the
    app comes back to the foreground, not only on a cold start
  - when a new build takes over, reloads the page so the new code is the
    code that is running
  - refuses to reload while someone is mid-entry. A half-typed pen would be
    lost. In that case it shows a banner and waits for them to tap it.

Nothing here can touch captured data: entries live in IndexedDB, which is
untouched by a code update, and every SAVE has already written to it before
any of this can run.
*/
const APP_VERSION = "2026.08.31-1";
let _reloading = false;

function _hasUnsavedInput() {
  const fields = document.querySelectorAll("#capture-screen input[type=text], #capture-screen input[type=date]");
  for (const f of fields) {
    if (f.id === "f-date" || f.id === "msg-input") continue;
    if (f.value && String(f.value).trim() !== "") return true;
  }
  return false;
}

function _updateBanner() {
  if (document.getElementById("update-banner")) return;
  const b = document.createElement("div");
  b.id = "update-banner";
  b.textContent = "New version ready - tap to update";
  b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:200;padding:14px;" +
    "text-align:center;background:#00e5c7;color:#06251f;font-weight:600;cursor:pointer";
  b.addEventListener("click", () => { _reloading = true; location.reload(); });
  document.body.appendChild(b);
}

function _applyUpdate() {
  if (_reloading) return;
  if (_hasUnsavedInput()) { _updateBanner(); return; }
  _reloading = true;
  location.reload();
}

function setupAutoUpdate() {
  const el = document.getElementById("login-status");
  if (el && el.parentNode && !document.getElementById("app-version")) {
    const v = document.createElement("p");
    v.id = "app-version";
    v.className = "dim small";
    v.textContent = "v" + APP_VERSION;
    el.parentNode.appendChild(v);
  }
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("service-worker.js").then((reg) => {
    // A new worker takes over as soon as it installs (the worker calls
    // skipWaiting), so this fires exactly when the new build is live.
    navigator.serviceWorker.addEventListener("controllerchange", _applyUpdate);
    const check = () => { reg.update().catch(() => {}); };
    setInterval(check, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
    window.addEventListener("online", check);
    check();
  }).catch(() => {});
}
