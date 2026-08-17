/*
EGGSACT Worker - main app logic

v2: all 5 capture forms (Eggs, Feed, Mortalities, Body Weights, Egg
Quality), tab switching, periodic backup-reminder popup.

STILL NOT IN THIS VERSION (flagged, not hidden):
  - Per-person PIN + house-access permission tiers. Right now it's still
    just "type your name" - no password gate yet. That needs a roster
    synced from the master, which is real, separate work.
*/

/*
EGGSACT Worker - main app logic

v3: server URL now ships baked in below - no per-device setup needed.
Change DEFAULT_SERVER_URL here (and redeploy) if your server address
ever changes; Settings is only an override for a worker who needs to
point at a DIFFERENT server (e.g. Farm instead of Home) than everyone
else.
*/

const DEFAULT_SERVER_URL = "https://purse-delta-humming.ngrok-free.dev";
const HOUSES = ["House Nketlwane", "House Tsholanang"];
let SERVER_URL = localStorage.getItem("eggsact_server_url") || DEFAULT_SERVER_URL;
const BACKUP_REMINDER_MINUTES = Number(localStorage.getItem("eggsact_reminder_minutes") || 10);

let state = { person: null, pin: null, profile: null, house: HOUSES[0] };
let pens = { egg: 1, feed: 1, mortality: 1, bodyweight: 1 };
let bwHenIndex = 0;
const HEN_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];
let eqEggNumber = 1;
let reminderTimer = null;
let entriesSinceLastPrompt = 0;

function $(sel) { return document.querySelector(sel); }
function today() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------------- login
function initLogin() {
  const saved = localStorage.getItem("eggsact_person");
  const savedProfile = localStorage.getItem("eggsact_profile");
  if (saved && savedProfile) {
    state.person = saved;
    state.profile = JSON.parse(savedProfile);
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
  const name = $("#login-name").value.trim();
  const pin = $("#login-pin").value.trim();
  if (!name || !pin) { $("#login-status").textContent = "Enter your name and PIN."; return; }
  $("#login-status").textContent = "Checking…";
  try {
    const resp = await fetch(`${DEFAULT_SERVER_URL}/sync/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin }),
    });
    const body = await resp.json();
    if (!resp.ok || !body.ok) {
      $("#login-status").textContent = body.error || "Wrong name or PIN.";
      return;
    }
    state.person = name;
    state.pin = pin;   // kept in memory only, for the download endpoint - never stored to disk
    state.profile = { forms: body.forms, house_access: body.house_access, recent_days: body.recent_days };
    localStorage.setItem("eggsact_person", name);
    localStorage.setItem("eggsact_profile", JSON.stringify(state.profile));
    showCapture();
  } catch (e) {
    $("#login-status").textContent = "Can't reach the server right now - need internet for first login.";
  }
}
function logout() {
  localStorage.removeItem("eggsact_person");
  localStorage.removeItem("eggsact_profile");
  state.person = null; state.pin = null; state.profile = null;
  clearInterval(reminderTimer);
  showLogin();
}

// ---------------------------------------------------------------- capture screen + tabs
function showCapture() {
  $("#login-screen").classList.add("hidden");
  $("#capture-screen").classList.remove("hidden");
  $("#who").textContent = state.person;
  const houseSel = $("#house-select");
  houseSel.innerHTML = HOUSES.map((h) => `<option value="${h}">${h}</option>`).join("");
  houseSel.value = state.house;
  $("#f-date").value = today();
  refreshStatus();
  focusPen("egg");
  startReminderTimer();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tab}`));
  if (tab === "mydata") { renderMyData(); return; }
  const focusMap = { egg: "#f-pen", feed: "#feed-pen", mortality: "#mort-pen",
                    bodyweight: "#bw-pen", eggquality: "#eq-egg" };
  $(focusMap[tab]).focus();
}

// ---------------------------------------------------------------- My Data
async function renderMyData() {
  const days = (state.profile && state.profile.recent_days) || 3;
  $("#mydata-window-note").textContent = `Showing your own captured entries from the last ${days} day${days === 1 ? "" : "s"}.`;

  const all = await DB.allEntries();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (days - 1)); cutoff.setHours(0, 0, 0, 0);
  const recent = all.filter((e) => new Date(e.date) >= cutoff).sort((a, b) => b.date.localeCompare(a.date));

  const listEl = $("#mydata-list");
  if (recent.length === 0) {
    listEl.innerHTML = `<p class="dim small">Nothing captured in this window yet.</p>`;
  } else {
    listEl.innerHTML = recent.map((e) => {
      const label = { egg: "Eggs", feed: "Feed", mortality: "Death", bodyweight: "Weight", eggquality: "Quality" }[e.type];
      const detail = e.type === "eggquality" ? `egg ${e.egg}` : `pen ${e.pen}`;
      return `<div class="mydata-row"><span>${e.date}</span><span>${label}</span><span>${e.house.replace("House ", "")}</span><span>${detail}</span><span>${e.synced ? "✓ synced" : "pending"}</span></div>`;
    }).join("");
  }

  const houseAccess = (state.profile && state.profile.house_access) || [];
  const dlEl = $("#mydata-downloads");
  if (houseAccess.length === 0) {
    dlEl.innerHTML = `<p class="dim small">You don't have full access to any house's master file.</p>`;
  } else {
    dlEl.innerHTML = houseAccess.map((h) =>
      `<button class="accent mydata-dl-btn" data-house="${h}">Download ${h.replace("House ", "")} master file</button>`
    ).join("");
    dlEl.querySelectorAll(".mydata-dl-btn").forEach((btn) => {
      btn.addEventListener("click", () => downloadMasterFile(btn.dataset.house));
    });
  }

  renderDataSheet();
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stddev(arr, m) { return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length); }

async function renderDataSheet() {
  const type = $("#sheet-type").value;
  const all = await DB.allEntries();
  const rows = all.filter((e) => e.type === type).sort((a, b) => b.date.localeCompare(a.date));
  const el = $("#mydata-sheet");
  if (rows.length === 0) {
    el.innerHTML = `<p class="dim small">No ${type} entries captured on this device yet.</p>`;
    return;
  }

  const numericFields = {
    egg: ["eggs", "weight", "nonlayer", "rejects"],
    feed: ["orts"],
    mortality: ["weight"],
    bodyweight: ["weight"],
    eggquality: ["diameter", "height", "eggweight"],
  }[type];

  // mean/sd per field, across ALL of this device's entries of this type (not just the visible rows)
  const stats = {};
  for (const f of numericFields) {
    const vals = all.filter((e) => e.type === type && typeof e[f] === "number").map((e) => e[f]);
    if (vals.length >= SD_MIN_HISTORY) {
      const m = mean(vals); stats[f] = { mean: m, sd: stddev(vals, m) };
    }
  }

  const keyField = type === "eggquality" ? "egg" : "pen";
  const headers = ["Date", "House", keyField === "egg" ? "Egg" : "Pen", ...numericFields];
  let html = `<table class="sheet-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
  for (const r of rows) {
    html += `<tr><td>${r.date}</td><td>${r.house.replace("House ", "")}</td><td>${r[keyField]}</td>`;
    for (const f of numericFields) {
      const v = r[f];
      let cls = "";
      if (typeof v === "number" && stats[f]) {
        const off = Math.abs(v - stats[f].mean) > SD_FLAG_THRESHOLD * stats[f].sd;
        cls = off ? "cell-flag-red" : "cell-flag-green";
      }
      html += `<td class="${cls}">${v ?? ""}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  el.innerHTML = html;
}

async function downloadMasterFile(house) {
  if (!state.pin) {
    const pin = prompt(`Re-enter your PIN to download ${house.replace("House ", "")}'s master file:`);
    if (!pin) return;
    state.pin = pin;
  }
  flashStatus(`Downloading ${house}…`);
  try {
    const url = `${DEFAULT_SERVER_URL}/sync/master_file?name=${encodeURIComponent(state.person)}` +
               `&pin=${encodeURIComponent(state.pin)}&house=${encodeURIComponent(house)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      state.pin = null;   // wrong/stale PIN - clear it so the next attempt re-prompts instead of repeating the same failure
      flashStatus(body.error || `Download failed (${resp.status}).`, true);
      return;
    }
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl; a.download = `${house.replace("House ", "")}_master.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(objUrl);
    flashStatus(`Downloaded ${house} master file.`);
  } catch (e) {
    flashStatus(`Network error: ${e.message}`, true);
  }
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

async function afterSave() {
  entriesSinceLastPrompt += 1;
  await refreshStatus();
}

// ---------------------------------------------------------------- Eggs
function focusPen(which) {
  if (which === "egg") { $("#f-pen").value = pens.egg; $("#f-pen").focus(); $("#f-pen").select(); }
}

async function saveEgg() {
  const pen = parseInt($("#f-pen").value, 10);
  if (!pen) { flashStatus("Enter a pen number.", true); return; }
  const house = $("#house-select").value;
  const dateVal = $("#f-date").value || today();
  const eggs = numOrNull("#f-eggs");
  const weight = numOrNull("#f-weight");

  // overwrite check - same pen/date/house/type already captured?
  const all = await DB.allEntries();
  const dup = all.find((e) => e.type === "egg" && e.house === house && e.date === dateVal && e.pen === pen);
  if (dup) {
    if (!confirm(`Pen ${pen} already has an entry for ${dateVal}. Replace it?`)) return;
  }

  // reason autocorrect - standardize known typos, ask about anything unrecognized
  let reason = $("#f-reason").value || "";
  if (reason.trim()) {
    const { text, uncertain } = standardizeReason(reason);
    if (uncertain.length) {
      const ok = confirm(`Didn't recognize "${uncertain.join(", ")}" as a known reason. Save it exactly as typed?`);
      if (!ok) { $("#f-reason").focus(); return; }
    } else if (text !== reason) {
      reason = text; $("#f-reason").value = text;
    }
  }

  // flagging - average weight bounds + outlier vs this device's own recent history
  const warnings = [];
  const avgWarn = checkAvgWeight(eggs, weight);
  if (avgWarn) warnings.push(avgWarn);
  const eggsHistory = all.filter((e) => e.type === "egg" && e.house === house && typeof e.eggs === "number").map((e) => e.eggs);
  const weightHistory = all.filter((e) => e.type === "egg" && e.house === house && typeof e.weight === "number").map((e) => e.weight);
  const eggsWarn = checkOutlier(eggsHistory, eggs, "Eggs");
  if (eggsWarn) warnings.push(eggsWarn);
  const weightWarn = checkOutlier(weightHistory, weight, "Weight");
  if (weightWarn) warnings.push(weightWarn);
  if (warnings.length) {
    if (!confirm(warnings.join("\n\n") + "\n\nSave anyway?")) return;
  }

  if (dup) {
    await DB.deleteEntry(dup.id);
  }
  await DB.addEntry({
    type: "egg", house, date: dateVal, pen,
    eggs, weight, nonlayer: numOrNull("#f-nonlayer"),
    rejects: numOrNull("#f-rejects"), reason, capturedBy: state.person,
  });
  flashStatus(`Saved pen ${pen}.`);
  for (const id of ["#f-eggs", "#f-weight", "#f-nonlayer", "#f-rejects", "#f-reason"]) $(id).value = "";
  pens.egg = pen + 1;
  $("#f-pen").value = pens.egg; $("#f-pen").focus(); $("#f-pen").select();
  afterSave();
}

// ---------------------------------------------------------------- Feed
async function saveFeed() {
  const pen = parseInt($("#feed-pen").value, 10);
  const orts = $("#feed-orts").value;
  if (!pen) { flashStatus("Enter a pen number.", true); return; }
  if (orts === "") { flashStatus("Enter an orts value.", true); return; }
  const house = $("#house-select").value;
  const dateVal = $("#f-date").value || today();
  const all = await DB.allEntries();
  const dup = all.find((e) => e.type === "feed" && e.house === house && e.date === dateVal && e.pen === pen);
  if (dup) {
    if (!confirm(`Pen ${pen} already has feed orts for ${dateVal}. Replace it?`)) return;
    await DB.deleteEntry(dup.id);
  }
  await DB.addEntry({
    type: "feed", house, date: dateVal, pen,
    orts: Number(orts), capturedBy: state.person,
  });
  flashStatus(`Saved pen ${pen} orts.`);
  pens.feed = pen + 1;
  $("#feed-pen").value = pens.feed; $("#feed-orts").value = "";
  $("#feed-pen").focus(); $("#feed-pen").select();
  afterSave();
}

// ---------------------------------------------------------------- Mortalities
async function saveMortality() {
  const pen = parseInt($("#mort-pen").value, 10);
  if (!pen) { flashStatus("Enter a pen number.", true); return; }
  await DB.addEntry({
    type: "mortality", house: $("#house-select").value, date: $("#f-date").value || today(), pen,
    weight: numOrNull("#mort-weight"), reason: $("#mort-reason").value || "", capturedBy: state.person,
  });
  flashStatus(`Logged pen ${pen}.`);
  $("#mort-pen").value = ""; $("#mort-weight").value = ""; $("#mort-reason").value = "";
  $("#mort-pen").focus();
  afterSave();
}

// ---------------------------------------------------------------- Body Weights
async function saveBodyWeight() {
  const pen = parseInt($("#bw-pen").value, 10);
  const weight = $("#bw-weight").value;
  const hen = $("#bw-hen").value;
  if (!pen) { flashStatus("Enter a pen number.", true); return; }
  if (weight === "") { flashStatus("Enter a weight.", true); return; }
  const house = $("#house-select").value;
  const dateVal = $("#f-date").value || today();
  const all = await DB.allEntries();
  const dup = all.find((e) => e.type === "bodyweight" && e.house === house && e.date === dateVal && e.pen === pen && e.hen === hen);
  if (dup) {
    if (!confirm(`Pen ${pen} hen ${hen} already has a weight for ${dateVal}. Replace it?`)) return;
    await DB.deleteEntry(dup.id);
  }
  await DB.addEntry({
    type: "bodyweight", house, date: dateVal,
    pen, hen, weight: Number(weight), capturedBy: state.person,
  });
  flashStatus(`Saved pen ${pen} hen ${hen}.`);
  $("#bw-weight").value = "";
  bwHenIndex += 1;
  if (bwHenIndex < HEN_LETTERS.length) {
    $("#bw-hen").value = HEN_LETTERS[bwHenIndex];
  } else {
    bwHenIndex = 0;
    $("#bw-hen").value = HEN_LETTERS[0];
    pens.bodyweight = pen + 1;
    $("#bw-pen").value = pens.bodyweight;
  }
  $("#bw-weight").focus();
  afterSave();
}

// ---------------------------------------------------------------- Egg Quality
async function saveEggQuality() {
  const egg = parseInt($("#eq-egg").value, 10);
  if (!egg) { flashStatus("Enter an egg number.", true); return; }
  const house = $("#house-select").value;
  const dateVal = $("#f-date").value || today();
  const all = await DB.allEntries();
  const dup = all.find((e) => e.type === "eggquality" && e.house === house && e.date === dateVal && e.egg === egg);
  if (dup) {
    if (!confirm(`Egg ${egg} already has quality data for ${dateVal}. Replace it?`)) return;
    await DB.deleteEntry(dup.id);
  }
  await DB.addEntry({
    type: "eggquality", house, date: dateVal,
    egg, diameter: numOrNull("#eq-diameter"), height: numOrNull("#eq-height"),
    top: numOrNull("#eq-top"), bottom: numOrNull("#eq-bottom"), equater: numOrNull("#eq-equater"),
    force: numOrNull("#eq-force"), displacement: numOrNull("#eq-displacement"),
    eggweight: numOrNull("#eq-eggweight"), capturedBy: state.person,
  });
  flashStatus(`Saved egg ${egg}.`);
  for (const id of ["#eq-diameter", "#eq-height", "#eq-top", "#eq-bottom", "#eq-equater",
                    "#eq-force", "#eq-displacement", "#eq-eggweight"]) $(id).value = "";
  eqEggNumber = egg + 1;
  $("#eq-egg").value = eqEggNumber;
  $("#eq-egg").focus(); $("#eq-egg").select();
  afterSave();
}

function numOrNull(id) {
  const v = $(id).value;
  return v === "" ? null : Number(v);
}

// ---------------------------------------------------------------- status / sync / export
let hasUnsyncedData = false;   // kept in sync (not async) so beforeunload can read it instantly

async function refreshStatus() {
  const unsynced = await DB.unsyncedEntries();
  const all = await DB.allEntries();
  const lastSynced = await DB.getMeta("lastSyncedAt");
  const lastBackedUp = await DB.getMeta("lastBackedUpAt");
  $("#pending-count").textContent = unsynced.length;
  $("#total-count").textContent = all.length;
  $("#last-synced").textContent = lastSynced ? timeAgo(lastSynced) : "never";
  $("#last-backed-up").textContent = lastBackedUp ? timeAgo(lastBackedUp) : "never";
  hasUnsyncedData = unsynced.length > 0;
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

async function handleSync() {
  if (!SERVER_URL) { flashStatus("No server address - tap Settings to set one.", true); return; }
  $("#sync-btn").disabled = true; $("#sync-btn").textContent = "Syncing…";
  const result = await syncNow(SERVER_URL, state.person);
  $("#sync-btn").disabled = false; $("#sync-btn").textContent = "Sync";
  if (result.status === "ok") flashStatus(`Synced ${result.count} entr${result.count === 1 ? "y" : "ies"}.`);
  else if (result.status === "nothing_new") flashStatus("Nothing new to sync.");
  else flashStatus(result.message, true);
  refreshStatus();
}

async function handleExport() {
  const result = await exportNow();
  if (result.status === "ok") flashStatus(`Downloaded a backup of ${result.count} entries.`);
  else flashStatus("Nothing to export yet.");
  refreshStatus();
}

function saveServerUrl() {
  const url = prompt("Server address - only change this if you need to point at a DIFFERENT server than the default:", SERVER_URL);
  if (url) { SERVER_URL = url.trim(); localStorage.setItem("eggsact_server_url", SERVER_URL); flashStatus("Server address saved."); }
}

// ---------------------------------------------------------------- periodic backup reminder
function startReminderTimer() {
  clearInterval(reminderTimer);
  reminderTimer = setInterval(maybePromptBackup, BACKUP_REMINDER_MINUTES * 60 * 1000);
}

async function maybePromptBackup() {
  if (entriesSinceLastPrompt === 0) return;   // nothing new captured - don't nag for no reason
  const unsynced = await DB.unsyncedEntries();
  $("#backup-modal-text").textContent =
    `You've captured ${entriesSinceLastPrompt} new entr${entriesSinceLastPrompt === 1 ? "y" : "ies"} ` +
    `since the last check (${unsynced.length} not yet synced). Download a backup now, just in case?`;
  $("#backup-modal").classList.remove("hidden");
}

function dismissBackupModal(download) {
  $("#backup-modal").classList.add("hidden");
  entriesSinceLastPrompt = 0;
  if (download) handleExport();
}

// ---------------------------------------------------------------- close/leave warning
/*
No website can truly FORCE a download before closing - browsers deliberately
don't allow that. What's actually available:

  - Desktop (Chrome/Edge): the browser's own native "Leave site? Changes you
    made may not be saved" confirmation - same one Gmail/Docs use. Browsers
    control the wording themselves (a site can't customize the text), but it
    DOES appear and let the person cancel closing. Reliable on desktop.

  - Mobile: beforeunload is NOT reliably fired when a phone browser tab or
    an installed PWA gets closed/swiped away - this is a real platform gap,
    not something fixable from here. The closest reliable substitute: catch
    the moment the app is backgrounded (switching away/minimizing) and show
    OUR OWN modal immediately, since that's the point right before someone
    would actually close it. Not a true block either, but the most reliable
    nudge the mobile web platform allows.
*/
window.addEventListener("beforeunload", (e) => {
  if (!hasUnsyncedData) return;
  e.preventDefault();
  e.returnValue = "";   // browsers ignore custom text and show their own message
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && hasUnsyncedData) {
    $("#backup-modal-text").textContent =
      "You still have entries that haven't been synced yet. Download a backup now, just in case?";
    $("#backup-modal").classList.remove("hidden");
  }
});

// ---------------------------------------------------------------- wire up
document.addEventListener("DOMContentLoaded", () => {
  $("#login-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#login-pin").focus(); } });
  $("#login-pin").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  $("#login-btn").addEventListener("click", doLogin);
  $("#logout-btn").addEventListener("click", logout);
  $("#house-select").addEventListener("change", (e) => { state.house = e.target.value; });

  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // Eggs
  chainEnter("#f-pen", "#f-eggs"); chainEnter("#f-eggs", "#f-weight");
  chainEnter("#f-weight", "#f-nonlayer"); chainEnter("#f-nonlayer", "#f-rejects");
  chainEnter("#f-rejects", "#f-reason"); chainEnter("#f-reason", null, saveEgg);
  $("#save-egg-btn").addEventListener("click", saveEgg);

  // Feed
  chainEnter("#feed-pen", "#feed-orts"); chainEnter("#feed-orts", null, saveFeed);
  $("#save-feed-btn").addEventListener("click", saveFeed);

  // Mortalities
  chainEnter("#mort-pen", "#mort-weight"); chainEnter("#mort-weight", "#mort-reason");
  chainEnter("#mort-reason", null, saveMortality);
  $("#save-mort-btn").addEventListener("click", saveMortality);

  // Body Weights
  chainEnter("#bw-pen", "#bw-hen");
  $("#bw-hen").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#bw-weight").focus(); } });
  chainEnter("#bw-weight", null, saveBodyWeight);
  $("#save-bw-btn").addEventListener("click", saveBodyWeight);

  // Egg Quality
  chainEnter("#eq-egg", "#eq-diameter"); chainEnter("#eq-diameter", "#eq-height");
  chainEnter("#eq-height", "#eq-top"); chainEnter("#eq-top", "#eq-bottom");
  chainEnter("#eq-bottom", "#eq-equater"); chainEnter("#eq-equater", "#eq-force");
  chainEnter("#eq-force", "#eq-displacement"); chainEnter("#eq-displacement", "#eq-eggweight");
  chainEnter("#eq-eggweight", null, saveEggQuality);
  $("#save-eq-btn").addEventListener("click", saveEggQuality);

  $("#sync-btn").addEventListener("click", handleSync);
  $("#export-btn").addEventListener("click", handleExport);
  $("#settings-btn").addEventListener("click", saveServerUrl);
  $("#backup-modal-yes").addEventListener("click", () => dismissBackupModal(true));
  $("#backup-modal-later").addEventListener("click", () => dismissBackupModal(false));
  $("#sheet-type").addEventListener("change", renderDataSheet);

  initLogin();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
});
