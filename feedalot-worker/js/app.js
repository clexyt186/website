/*
CLEVITA FeedAlot Worker - main app logic

Server URL is the SAME physical server EGGSACT already uses (one ngrok
tunnel, shared Flask process) - FeedAlot's routes just live under
/feedlot/ on that same address.
*/

const DEFAULT_SERVER_URL = "https://purse-delta-humming.ngrok-free.dev";
let SERVER_URL = localStorage.getItem("feedalot_server_url") || DEFAULT_SERVER_URL;

let state = { group: null, name: null, password: null };

function $(sel) { return document.querySelector(sel); }
function today() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------------- login
function initLogin() {
  const savedGroup = localStorage.getItem("feedalot_group");
  const savedName = localStorage.getItem("feedalot_name");
  const savedPw = localStorage.getItem("feedalot_pw");
  if (savedGroup && savedName && savedPw) {
    state = { group: savedGroup, name: savedName, password: savedPw };
    showCapture();
    return;
  }
  showLogin();
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#capture-screen").classList.add("hidden");
  $("#login-name").focus();
}

async function doLogin() {
  const group = $("#group-select").value;
  const name = $("#login-name").value.trim();
  const pw = $("#login-pw").value;
  if (!name || !pw) { $("#login-status").textContent = "Enter your name and this group's password."; return; }
  $("#login-status").textContent = "Checking…";
  try {
    const resp = await fetch(`${SERVER_URL}/feedlot/sync/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group, name, password: pw }),
    });
    const body = await resp.json();
    if (!resp.ok || !body.ok) {
      $("#login-status").textContent = body.error || "Wrong password for this group.";
      return;
    }
    state = { group, name, password: pw };
    localStorage.setItem("feedalot_group", group);
    localStorage.setItem("feedalot_name", name);
    localStorage.setItem("feedalot_pw", pw);
    showCapture();
  } catch (e) {
    $("#login-status").textContent = "Can't reach the server - need internet for first login.";
  }
}

function logout() {
  localStorage.removeItem("feedalot_group");
  localStorage.removeItem("feedalot_name");
  localStorage.removeItem("feedalot_pw");
  state = { group: null, name: null, password: null };
  showLogin();
}

// ---------------------------------------------------------------- capture screen
function showCapture() {
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
  const unsynced = await DB.unsyncedEntries();
  if (unsynced.length === 0) { flashStatus("Nothing new to sync."); return; }
  $("#sync-btn").disabled = true; $("#sync-btn").textContent = "Syncing…";
  try {
    const blob = buildWorkbookBlob(unsynced, XLSX);
    const form = new FormData();
    form.append("file", blob, `feedalot_sync_${Date.now()}.xlsx`);
    const resp = await fetch(`${SERVER_URL}/feedlot/sync/upload_file`, { method: "POST", body: form });
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
  const all = await DB.allEntries();
  if (all.length === 0) { flashStatus("Nothing to export yet."); return; }
  const blob = buildWorkbookBlob(all, XLSX);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `feedalot_export_${today()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  flashStatus(`Downloaded a backup of ${all.length} entries.`);
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
  $("#export-btn").addEventListener("click", handleExport);
  $("#settings-btn").addEventListener("click", saveServerUrl);
  $("#formulation-calc-btn").addEventListener("click", calculateFormulation);
  $("#mydata-type").addEventListener("change", renderMyData);
  renderFormulationFields();

  initLogin();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
});
