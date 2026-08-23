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

// The public address of the home PC's sync server.
// This was "http://127.0.0.1:5085", which means "this phone itself" - so
// login, sync, master download, messages and team data could never work on
// any device except the PC running the server. It also has to be https,
// because a page served over https cannot call an http address.
const DEFAULT_SERVER_URL = "https://purse-delta-humming.ngrok-free.dev";
const HOUSES = ["House Nketlwane", "House Tsholanang", "House Judi"];
// A device that used the broken build has "http://127.0.0.1:5085" saved in
// localStorage, which would override the fix above and keep it broken after
// updating. Any saved localhost/http address is discarded once.
const REAL_FETCH = window.fetch.bind(window);
let SERVER_URL = (() => {
  const saved = localStorage.getItem("eggsact_server_url");
  if (!saved || /127\.0\.0\.1|localhost|^http:\/\//i.test(saved)) {
    localStorage.removeItem("eggsact_server_url");
    return DEFAULT_SERVER_URL;
  }
  return saved;
})();

// Captured as early as possible (before login, before anything) so it's
// ready to use the instant login succeeds. Chrome/Edge on Android and
// desktop fire this - Safari (iPhone) NEVER fires it, there's no
// programmatic install API there at all, only the manual Share menu.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});
const BACKUP_REMINDER_MINUTES = Number(localStorage.getItem("eggsact_reminder_minutes") || 40);

let state = { person: null, pin: null, profile: null, house: HOUSES[0], demo: false };
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
  // Demo button - added once, on the login screen only, so a person browsing
  // the app can see what the interface looks like without an account.
  // Everything past this button is view-only: forms render, tabs switch, but
  // no fetch runs and nothing is written to IndexedDB. See enterDemo() below.
  if (!$("#demo-btn")) {
    const btn = document.createElement("button");
    btn.id = "demo-btn";
    btn.className = "text-btn";
    btn.style.cssText = "margin-top:10px;color:#7fb3ff;font-size:13px";
    btn.textContent = "Try a demo (no account, nothing saved)";
    btn.addEventListener("click", enterDemo);
    $("#login-status").after(btn);
  }
}

function enterDemo() {
  state.person = "Demo user";
  state.pin = null;
  state.profile = { forms: ["egg","feed","mortality","bodyweight","eggquality"],
                    house_access: HOUSES.slice(), recent_days: 30, is_main_admin: false };
  state.demo = true;
  localStorage.removeItem("eggsact_person");   // never persist demo state
  localStorage.removeItem("eggsact_profile");
  showCapture();
  flashStatus("Demo mode - nothing you type here is saved or sent.");
  const banner = document.createElement("div");
  banner.id = "demo-banner";
  banner.style.cssText = "background:#5a3a1a;color:#ffd8a0;text-align:center;padding:6px;font-size:12px;font-weight:600";
  banner.textContent = "DEMO MODE - browse the app, nothing is saved. Sign out to leave.";
  $("#capture-screen").prepend(banner);
}
async function doLogin() {
  const name = $("#login-name").value.trim();
  const pin = $("#login-pin").value.trim();
  if (!name || !pin) { $("#login-status").textContent = "Enter your name and PIN."; return; }
  $("#login-status").textContent = "Checking…";
  try {
    const resp = await fetch(`${SERVER_URL}/sync/login`, {
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
    state.profile = { forms: body.forms, house_access: body.house_access, recent_days: body.recent_days, is_main_admin: body.is_main_admin };
    localStorage.setItem("eggsact_person", name);
    localStorage.setItem("eggsact_profile", JSON.stringify(state.profile));
    showCapture();
  } catch (e) {
    $("#login-status").textContent = "Can't reach the server right now - need internet for first login.";
  }
}
function logout() {
  // Demo cleanup - drop the banner and the fake profile before showing login
  const banner = document.getElementById("demo-banner");
  if (banner) banner.remove();
  state.demo = false;
  localStorage.removeItem("eggsact_person");
  localStorage.removeItem("eggsact_profile");
  state.person = null; state.pin = null; state.profile = null;
  clearInterval(reminderTimer);
  showLogin();
}

// ---------------------------------------------------------------- capture screen + tabs
function showCapture() {
  wireNumericFields();
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
  maybeShowInstallPrompt();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tab}`));
  if (tab === "mydata") { renderMyData(); return; }
  if (tab === "messages") { renderMessages(); return; }
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

  // Full master file, per house. Which houses appear comes from the profile
  // the SERVER issued at login - and the server re-checks access on every
  // master_file request, so this list is convenience, not the security.
  const houseAccess = (state.profile && state.profile.house_access) || [];
  const dlEl = $("#mydata-downloads");
  if (houseAccess.length === 0) {
    dlEl.innerHTML = `<p class="dim small">You don't have full access to any house's master file.</p>`;
  } else {
    const masters = await DB.allMasters();
    const byHouse = {};
    for (const m of masters) byHouse[m.house] = m;
    const pending = (await DB.unsyncedEntries());
    dlEl.innerHTML = houseAccess.map((h) => {
      const short = h.replace("House ", "");
      const held = byHouse[h];
      const mine = pending.filter((e) => e.house === h).length;
      const when = held
        ? `Loaded ${timeAgo(held.downloadedAt)} · ${Math.round(held.bytes / 1024)} KB`
        : `Not loaded on this device yet`;
      const note = held && mine
        ? `<span class="dim small">+ ${mine} of your entries not yet synced will be written in</span>`
        : "";
      return `
        <div class="master-card">
          <div><strong>${short}</strong> <span class="dim small">${when}</span></div>
          ${note}
          <div class="master-actions">
            <button class="accent mydata-dl-btn" data-house="${h}">Load latest</button>
            <button class="mydata-ex-btn" data-house="${h}" ${held ? "" : "disabled"}>Export full file</button>
          </div>
        </div>`;
    }).join("");
    dlEl.querySelectorAll(".mydata-dl-btn").forEach((btn) => {
      btn.addEventListener("click", () => refreshMasterFile(btn.dataset.house));
    });
    dlEl.querySelectorAll(".mydata-ex-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleExportMaster(btn.dataset.house));
    });
  }

  renderDataSheet();
  renderTeam();
}

async function renderTeam() {
  const section = $("#mydata-team-section");
  if (!state.profile || !state.profile.is_main_admin) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  const el = $("#mydata-team");
  el.innerHTML = `<p class="dim small">Loading…</p>`;
  try {
    const url = `${SERVER_URL}/sync/people?name=${encodeURIComponent(state.person)}&pin=${encodeURIComponent(state.pin || "")}`;
    const resp = await fetch(url);
    const body = await resp.json();
    if (!resp.ok || !body.ok) {
      if (resp.status === 401 || resp.status === 403) {
        el.innerHTML = `<p class="dim small">Re-enter your PIN (tap Sync or a download once) to load this.</p>`;
      } else {
        el.innerHTML = `<p class="dim small">${body.error || "Couldn't load."}</p>`;
      }
      return;
    }
    if (body.people.length === 0) {
      el.innerHTML = `<p class="dim small">No one's synced data yet.</p>`;
      return;
    }
    el.innerHTML = body.people.map((p) =>
      `<div class="team-row">
         <span>${p.person}</span>
         <span class="dim">${p.file_count} file${p.file_count === 1 ? "" : "s"} · last ${timeAgo(p.last_synced)}</span>
         <button class="team-dl-btn" data-person="${p.person}">Download</button>
       </div>`
    ).join("");
    el.querySelectorAll(".team-dl-btn").forEach((btn) => {
      btn.addEventListener("click", () => downloadPersonData(btn.dataset.person));
    });
  } catch (e) {
    el.innerHTML = `<p class="dim small">Network error: ${e.message}</p>`;
  }
}

// ---------------------------------------------------------------- messages
let selectedThreadWorker = null;

function ensurePin(promptText) {
  if (state.pin) return state.pin;
  const pin = prompt(promptText);
  if (pin) state.pin = pin;
  return state.pin;
}

async function renderMessages() {
  const isAdmin = state.profile && state.profile.is_main_admin;
  const pin = ensurePin("Re-enter your PIN to load messages:");
  if (!pin) { $("#msg-thread").innerHTML = `<p class="dim small">PIN needed to load messages.</p>`; return; }

  if (isAdmin) {
    $("#msg-admin-thread-list").classList.remove("hidden");
    try {
      const resp = await fetch(`${SERVER_URL}/sync/message/all_threads?name=${encodeURIComponent(state.person)}&pin=${encodeURIComponent(pin)}`);
      const body = await resp.json();
      if (!resp.ok || !body.ok) { $("#msg-admin-thread-list").innerHTML = `<p class="dim small">${body.error || "Couldn't load."}</p>`; return; }
      const names = Object.keys(body.threads);
      if (names.length === 0) {
        $("#msg-admin-thread-list").innerHTML = `<p class="dim small">No one's messaged yet.</p>`;
        $("#msg-thread").innerHTML = "";
        return;
      }
      if (!selectedThreadWorker || !names.includes(selectedThreadWorker)) selectedThreadWorker = names[0];
      $("#msg-admin-thread-list").innerHTML = names.map((n) =>
        `<button class="thread-pick-btn ${n === selectedThreadWorker ? "active" : ""}" data-worker="${n}">
           ${n}${body.threads[n].unread ? ` (${body.threads[n].unread})` : ""}
         </button>`
      ).join("");
      $("#msg-admin-thread-list").querySelectorAll(".thread-pick-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          selectedThreadWorker = btn.dataset.worker;
          await fetch(`${SERVER_URL}/sync/message/mark_read`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: state.person, pin: state.pin, worker: selectedThreadWorker }),
          });
          renderMessages();
        });
      });
      renderThreadMessages(body.threads[selectedThreadWorker].messages);
    } catch (e) {
      $("#msg-admin-thread-list").innerHTML = `<p class="dim small">Network error: ${e.message}</p>`;
    }
  } else {
    $("#msg-admin-thread-list").classList.add("hidden");
    try {
      const resp = await fetch(`${SERVER_URL}/sync/message/thread?name=${encodeURIComponent(state.person)}&pin=${encodeURIComponent(pin)}`);
      const body = await resp.json();
      if (!resp.ok || !body.ok) { $("#msg-thread").innerHTML = `<p class="dim small">${body.error || "Couldn't load."}</p>`; return; }
      renderThreadMessages(body.messages);
    } catch (e) {
      $("#msg-thread").innerHTML = `<p class="dim small">Network error: ${e.message}</p>`;
    }
  }
}

function renderThreadMessages(messages) {
  const el = $("#msg-thread");
  if (!messages || messages.length === 0) {
    el.innerHTML = `<p class="dim small">No messages yet.</p>`;
    return;
  }
  el.innerHTML = messages.map((m) =>
    `<div class="msg-row ${m.from === "ADMIN" ? "msg-admin" : "msg-worker"}">
       <span class="msg-from">${m.from === "ADMIN" ? "Admin" : m.from}</span>
       <span class="msg-text">${m.text}</span>
       <span class="msg-ts dim">${m.ts.replace("T", " ")}</span>
     </div>`
  ).join("");
}

async function sendMessage() {
  const text = $("#msg-input").value.trim();
  if (!text) return;
  const pin = ensurePin("Re-enter your PIN to send:");
  if (!pin) return;
  const isAdmin = state.profile && state.profile.is_main_admin;
  const body = { name: state.person, pin, text };
  if (isAdmin) {
    if (!selectedThreadWorker) { flashStatus("Pick a worker to message first.", true); return; }
    body.to = selectedThreadWorker;
  }
  try {
    const resp = await fetch(`${SERVER_URL}/sync/message/send`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const r = await resp.json();
    if (!resp.ok || !r.ok) { flashStatus(r.error || "Couldn't send.", true); return; }
    $("#msg-input").value = "";
    renderMessages();
  } catch (e) {
    flashStatus(`Network error: ${e.message}`, true);
  }
}

/* Opportunistic unread check - piggybacks on refreshStatus's existing
   cadence rather than a new timer. Best-effort: fails silently offline,
   matching how the rest of the app treats no-connectivity moments. */
async function checkUnreadMessages() {
  if (!state.person || !state.pin) return;
  try {
    const isAdmin = state.profile && state.profile.is_main_admin;
    const url = isAdmin
      ? `${SERVER_URL}/sync/message/all_threads?name=${encodeURIComponent(state.person)}&pin=${encodeURIComponent(state.pin)}`
      : `${SERVER_URL}/sync/message/thread?name=${encodeURIComponent(state.person)}&pin=${encodeURIComponent(state.pin)}`;
    const resp = await fetch(url);
    const body = await resp.json();
    if (!resp.ok || !body.ok) return;
    let unread = 0;
    if (isAdmin) {
      for (const t of Object.values(body.threads)) unread += t.unread;
    } else {
      unread = (body.messages || []).filter((m) => m.from === "ADMIN" && !m.read_by_worker).length;
    }
    $("#msg-unread-dot").classList.toggle("hidden", unread === 0);
  } catch (e) { /* offline or server down - stay quiet, this is best-effort only */ }
}

async function downloadPersonData(person) {
  if (!state.pin) {
    const pin = prompt(`Re-enter your PIN to download ${person}'s synced files:`);
    if (!pin) return;
    state.pin = pin;
  }
  flashStatus(`Downloading ${person}'s data…`);
  try {
    const url = `${SERVER_URL}/sync/person_download?name=${encodeURIComponent(state.person)}` +
               `&pin=${encodeURIComponent(state.pin)}&person=${encodeURIComponent(person)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      state.pin = null;
      flashStatus(body.error || `Download failed (${resp.status}).`, true);
      return;
    }
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl; a.download = `${person}_synced_files.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(objUrl);
    flashStatus(`Downloaded ${person}'s synced files.`);
  } catch (e) {
    flashStatus(`Network error: ${e.message}`, true);
  }
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

async function refreshMasterFile(house) {
  if (!state.pin) {
    const pin = prompt(`Re-enter your PIN to load ${house.replace("House ", "")}'s full data:`);
    if (!pin) return;
    state.pin = pin;
  }
  flashStatus(`Loading ${house.replace("House ", "")}…`);
  const result = await refreshMaster(SERVER_URL, house, state.person, state.pin);
  if (result.status !== "ok") {
    state.pin = null;   // stale PIN - re-prompt next time instead of failing the same way
    flashStatus(result.message, true);
    return;
  }
  const kb = Math.round(result.bytes / 1024);
  flashStatus(`${house.replace("House ", "")} loaded (${kb} KB). Export now gives the full file.`);
  renderMyData();
}

async function handleExportMaster(house) {
  flashStatus("Building the master file…");
  const result = await exportMasterFile(house);
  if (result.status === "no_master") {
    flashStatus("Tap 'Load latest' first to get this house's file.", true);
    return;
  }
  let msg = `Master file downloaded (${result.placed} of your entries included).`;
  if (result.problems.length) {
    msg += ` ${result.problems.length} couldn't be placed - see the 'Not yet placed' notes.`;
  }
  flashStatus(msg);
  refreshStatus();
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
    orts: parseNum(orts), capturedBy: state.person,
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
    pen, hen, weight: parseNum(weight), capturedBy: state.person,
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

/**
 * Reads a numeric field, accepting a COMMA as the decimal point.
 *
 * The fields were type="number", which on most Android keyboards silently
 * discards a comma - so "29,5" arrived as blank or 295 depending on the
 * phone. They are now type="text" with inputmode="decimal", which shows the
 * same numeric keypad but lets the character through, and it is normalised
 * here. Matches autocorrect.py's fix_number() on the desktop, so "29,5"
 * means 29.5 on both.
 */
function parseNum(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  s = s.replace(/,/g, ".");        // 29,5 -> 29.5
  s = s.replace(/\.{2,}/g, ".");   // 2..3 -> 2.3
  s = s.replace(/\s+/g, "");
  s = s.replace(/[^0-9.\-]/g, "");
  if ((s.match(/\./g) || []).length > 1) return NaN;   // 1.2.3 - ambiguous
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function numOrNull(id) {
  return parseNum($(id).value);
}

/** Rewrites a comma to a dot as the person types, so the field shows what
 *  will actually be saved rather than correcting it silently on submit. */
function wireNumericFields() {
  document.querySelectorAll("input.numeric").forEach((el) => {
    el.addEventListener("input", () => {
      if (el.value.includes(",")) {
        const at = el.selectionStart;
        el.value = el.value.replace(/,/g, ".");
        try { el.setSelectionRange(at, at); } catch (e) {}
      }
    });
  });
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
  checkUnreadMessages();
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
  // Export gives the FULL master file whenever this device holds one for the
  // current house - that is the whole point of the local-master design.
  // Without one it falls back to a my-entries-only backup, which is better
  // than nothing but is clearly labelled as such.
  const house = $("#house-select").value;
  const held = await DB.getMaster(house);
  if (held) return handleExportMaster(house);
  const result = await exportNow();
  if (result.status === "ok") {
    flashStatus(`No master file loaded for ${house.replace("House ", "")} - ` +
                `downloaded your ${result.count} entries only.`);
  } else {
    flashStatus("Nothing to export yet.");
  }
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
  if (unsynced.length === 0) { entriesSinceLastPrompt = 0; return; }   // already synced - nothing at risk, stay quiet
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

// ---------------------------------------------------------------- install prompt
function isAlreadyInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/*
Shown once, right after the FIRST successful login - so the very next time
they open it (no internet needed) they're already offline-capable, instead
of "visit the site, sign in" being something they repeat every day.

Real limitation, not something fixable from here: only Chrome/Edge give a
website a button that actually TRIGGERS install. Safari on iPhone has no
such API at all - the manual Share -> Add to Home Screen is the only path
there, so that's what gets shown on iOS instead of a fake button.
*/
function showInstallModal() {
  const actionBtn = $("#install-modal-action");
  if (deferredInstallPrompt) {
    $("#install-modal-text").textContent =
      "Add it to your home screen now, so tomorrow you can open it straight away - fully offline, no need to visit the site or sign in again first.";
    actionBtn.textContent = "Install now";
    actionBtn.onclick = async () => {
      $("#install-modal").classList.add("hidden");
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    };
  } else if (isIOS()) {
    $("#install-modal-text").textContent =
      "Tap the Share icon at the bottom of Safari, then \"Add to Home Screen\". Do this now, so tomorrow you can open it straight away - fully offline, no need to visit the site or sign in again first.";
    actionBtn.textContent = "Got it";
    actionBtn.onclick = () => $("#install-modal").classList.add("hidden");
  } else {
    $("#install-modal-text").textContent =
      "Look for \"Install app\" or \"Add to Home Screen\" in your browser's menu. Do this now, so tomorrow you can open it straight away - fully offline, no need to visit the site or sign in again first.";
    actionBtn.textContent = "Got it";
    actionBtn.onclick = () => $("#install-modal").classList.add("hidden");
  }
  $("#install-modal").classList.remove("hidden");
}

function maybeShowInstallPrompt() {
  if (isAlreadyInstalled()) return;
  if (localStorage.getItem("eggsact_install_prompted")) return;
  localStorage.setItem("eggsact_install_prompted", "1");
  showInstallModal();
}

function handleInstallButton() {
  if (isAlreadyInstalled()) { flashStatus("Already installed on this device."); return; }
  showInstallModal();
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
  $("#install-btn").addEventListener("click", handleInstallButton);
  $("#install-modal-later").addEventListener("click", () => $("#install-modal").classList.add("hidden"));
  $("#backup-modal-yes").addEventListener("click", () => dismissBackupModal(true));
  $("#backup-modal-later").addEventListener("click", () => dismissBackupModal(false));
  $("#sheet-type").addEventListener("change", renderDataSheet);
  $("#msg-send-btn").addEventListener("click", sendMessage);
  $("#msg-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } });

  initLogin();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
});
