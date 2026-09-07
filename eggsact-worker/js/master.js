/*
EGGSACT Worker - local master file

THE DESIGN
  1. The home PC master is the single source of truth. A phone's file is
     NEVER uploaded - that is what makes two people capturing at once safe.
  2. Refresh  -> this device's workbook becomes a byte-for-byte copy of the
                 home master, including everyone else's synced data.
     No access to that house? The device keeps the embedded blank template
     instead - a real, complete layout with every day column and every pen.
  3. Capture  -> the entry goes into local storage.
  4. Export   -> hands back the stored workbook with this device's
                 not-yet-synced entries written into their correct cells.
  5. Sync     -> unchanged. The ENTRIES are pushed, never the file.
  6. Duplicate rule -> after a refresh the downloaded master already contains
     everything this device has synced, so ONLY unsynced entries are applied.
     Re-applying everything would double-count. Enforced in one place:
     pendingFor().

HOW STEP 4 KEEPS THE FILE INTACT
Writing goes through xlsx-patch.js, which edits the cell's XML inside the zip
rather than rebuilding the workbook. Verified against the real Nketlwane
master: 34,842 formulas before, 34,842 after. Rebuilding it with the bundled
SheetJS would have left zero.

WHAT IT WILL NOT DO
Invent a day column or a feed week block that the workbook doesn't have. The
home PC owns that geometry - a column created on a phone would not line up
with the one the home PC creates, and the weekly Pen FI / Ave Bird FI / FCR
formulas are linked to specific columns. Anything that can't be placed is
listed on the "Not yet placed" sheet, never dropped and never guessed at.
*/

const MASTER_SHEETS = {
  egg: "Egg Data",
  feed: "Feed Data",
  mortality: "Mortalities",
  bodyweight: "Body Weights",
  eggquality: "Egg Quality",
};

// Matches config.json's judi_profile geometry, confirmed against the real
// JUDI_DATA_*.xlsx files: row 1 dates, row 2 week labels, row 3 headers,
// pens from row 4 down column A.
const GEO = {
  dateRow: 1,
  weekRow: 2,
  headerRow: 3,
  firstRow: 4,
  penCol: 1,
  egg: { eggs: 0, weight: 1, avg: 2, nonlayer: 3, rejects: 4, reason: 5 },
  feedFirstRow: 4,
  feed: { bird: 0, alloc: 1, orts: 2 },
};

const MONTHS3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ymd(s) { const [y, m, d] = String(s).split("-").map(Number); return { y, m, d }; }
function ddMon(s) { const { m, d } = ymd(s); return `${String(d).padStart(2, "0")}${MONTHS3[m - 1]}`; }

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------- lookup */

/** Column of a date in the egg sheet, or null. Only REAL date cells count -
 *  the desktop app's as_date() accepts nothing else, so a text date isn't a
 *  day column there either. */
function dayCol(sheet, dateStr) {
  const want = ymd(dateStr);
  const maxCol = sheet.maxCol();
  for (let c = GEO.penCol; c <= maxCol; c++) {
    const v = sheet.read(GEO.dateRow, c);
    if (v instanceof Date &&
        v.getUTCFullYear() === want.y && v.getUTCMonth() + 1 === want.m && v.getUTCDate() === want.d) {
      return c;
    }
  }
  return null;
}

/** {pen: row} by scanning the pen column. Never arithmetic: a pen removed on
 *  the master must stay removed here too. */
function penIndex(sheet, startRow) {
  const idx = {};
  const maxRow = sheet.maxRow();
  let empty = 0;
  for (let r = startRow; r <= maxRow && empty < 100; r++) {
    const v = sheet.read(r, GEO.penCol);
    if (typeof v === "number") { idx[v] = r; empty = 0; } else { empty++; }
  }
  return idx;
}

/**
 * Parses a feed-block header like "18Aug - 24Aug2026" into {start, end} as
 * UTC dates. The year is only written on the end date, so the start takes the
 * same year - unless the block straddles New Year (e.g. "29Dec - 04Jan2027"),
 * where the start belongs to the year before.
 */
function parseWeekRange(text) {
  const s = String(text).replace(/\s+/g, "");
  const m = /^(\d{1,2})([A-Za-z]{3})-(\d{1,2})([A-Za-z]{3})(\d{4})$/.exec(s);
  if (!m) return null;
  const mi = (abbr) => MONTHS3.findIndex((x) => x.toLowerCase() === abbr.toLowerCase());
  const sm = mi(m[2]), em = mi(m[4]);
  if (sm < 0 || em < 0) return null;
  const endYear = Number(m[5]);
  const startYear = sm > em ? endYear - 1 : endYear;
  return {
    start: Date.UTC(startYear, sm, Number(m[1])),
    end: Date.UTC(endYear, em, Number(m[3])),
  };
}

/**
 * Feed week block covering a date, matched on the row-1 DATE RANGE.
 *
 * This used to test `range.startsWith("19Aug")`, which only ever matched the
 * FIRST day of a block - a block reading "18Aug - 24Aug2026" rejected the
 * 19th through the 24th, so six days in seven silently failed to place. It
 * now tests whether the date falls INSIDE the range.
 *
 * The row-2 label is still checked as a fallback, because some blocks are
 * pre-stamped by week number ("10W") and others by date.
 */
function feedWeekCol(sheet, dateStr) {
  const want = ymd(dateStr);
  const t = Date.UTC(want.y, want.m - 1, want.d);
  const target = ddMon(dateStr);
  const maxCol = sheet.maxCol();
  for (let c = 1; c <= maxCol; c++) {
    const hdr = sheet.read(GEO.headerRow, c);
    if (!hdr || String(hdr).trim() !== "Bird #") continue;
    const range = parseWeekRange(sheet.read(GEO.dateRow, c) || "");
    if (range && t >= range.start && t <= range.end) return c;
    const label = sheet.read(GEO.weekRow, c);
    if (label && String(label).trim() === target) return c;   // date-labelled block
  }
  return null;
}

function nextEmptyRow(sheet, startRow) {
  const maxRow = sheet.maxRow();
  for (let r = startRow; r <= maxRow + 1; r++) {
    if (sheet.read(r, 1) === null) return r;
  }
  return maxRow + 1;
}

/* ---------------------------------------------------------------- place */

function placeEgg(book, e, problems) {
  const ws = book.sheet(MASTER_SHEETS.egg);
  if (!ws) { problems.push(`${e.date} pen ${e.pen}: no '${MASTER_SHEETS.egg}' sheet`); return false; }
  const col = dayCol(ws, e.date);
  if (col === null) { problems.push(`${e.date} pen ${e.pen}: that day isn't in this file yet`); return false; }
  const row = penIndex(ws, GEO.firstRow)[Number(e.pen)];
  if (!row) { problems.push(`${e.date} pen ${e.pen}: pen isn't in this file`); return false; }
  const o = GEO.egg;
  const eggs = numOrNull(e.eggs), wt = numOrNull(e.weight);
  ws.write(row, col + o.eggs, eggs);
  ws.write(row, col + o.weight, wt);
  // Average is a stored value in this layout, exactly as the desktop writes it
  ws.write(row, col + o.avg, (eggs && wt) ? Math.round((wt / eggs) * 100) / 100 : null);
  ws.write(row, col + o.nonlayer, numOrNull(e.nonlayer));
  ws.write(row, col + o.rejects, numOrNull(e.rejects));
  ws.write(row, col + o.reason, e.reason || null);
  return true;
}

function placeFeed(book, e, problems) {
  const ws = book.sheet(MASTER_SHEETS.feed);
  if (!ws) { problems.push(`${e.date} pen ${e.pen}: no '${MASTER_SHEETS.feed}' sheet`); return false; }
  const col = feedWeekCol(ws, e.date);
  if (col === null) {
    problems.push(`${e.date} pen ${e.pen}: feed week covering ${ddMon(e.date)} isn't in this file yet`);
    return false;
  }
  const row = penIndex(ws, GEO.feedFirstRow)[Number(e.pen)];
  if (!row) { problems.push(`${e.date} pen ${e.pen}: pen isn't in the feed sheet`); return false; }
  // Orts only. Bird # and Allocation are never written from a worker device.
  ws.write(row, col + GEO.feed.orts, numOrNull(e.orts));
  return true;
}

function placeMortality(book, e, problems) {
  const ws = book.sheet(MASTER_SHEETS.mortality);
  if (!ws) { problems.push(`${e.date} pen ${e.pen}: no '${MASTER_SHEETS.mortality}' sheet`); return false; }
  const r = nextEmptyRow(ws, 2);
  ws.write(r, 1, ddMon(e.date));
  ws.write(r, 2, e.date);
  ws.write(r, 3, Number(e.pen));
  ws.write(r, 4, numOrNull(e.weight));
  ws.write(r, 5, e.reason || null);
  return true;
}

function placeBodyWeight(book, e, problems) {
  const ws = book.sheet(MASTER_SHEETS.bodyweight);
  if (!ws) { problems.push(`${e.date} pen ${e.pen}: no '${MASTER_SHEETS.bodyweight}' sheet`); return false; }
  const maxRow = ws.maxRow();
  for (const [pc, hc, wc] of [[1, 2, 3], [6, 7, 8]]) {
    for (let r = 2; r <= maxRow; r++) {
      if (Number(ws.read(r, pc)) === Number(e.pen) && String(ws.read(r, hc)) === String(e.hen)) {
        ws.write(r, wc, numOrNull(e.weight));
        return true;
      }
    }
  }
  problems.push(`${e.date} pen ${e.pen} hen ${e.hen}: not in the body-weight grid`);
  return false;
}

/** The original flat Egg Quality placement, kept for old entries and old
 *  masters. When the sheet is the NEW long format but the entry is old, the
 *  egg number is filed under the current month so it still lands somewhere
 *  findable rather than being dropped. */
function placeEggQualityFlat(book, e, problems, oldSheet) {
  if (!oldSheet) {
    const month = e.month || String(e.date || "").slice(0, 7);
    return placeSampling(book, {
      ...e, month, unit: String(e.egg ?? e.unit ?? "").trim(),
      pen: e.pen || 0,
      values: e.values || {
        "Individual Egg weight": e.eggweight, Diameter: e.diameter, Height: e.height,
        top: e.top, bottom: e.bottom, equater: e.equater,
        "Force at Break (Standard)": e.force,
        "Displacement at Break (Standard)": e.displacement,
      },
    }, problems, "eggquality");
  }
  return placeEggQualityLegacy(book, e, problems);
}

function placeEggQualityLegacy(book, e, problems) {
  const ws = book.sheet(MASTER_SHEETS.eggquality);
  if (!ws) { problems.push(`egg ${e.egg}: no '${MASTER_SHEETS.eggquality}' sheet`); return false; }
  // Accept either shape: an old entry keyed by e.egg with flat fields, or a
  // new one keyed by e.unit with a values map. The old sheet has no pen or
  // month column, so those are simply not recorded there.
  const eggNo = e.egg !== undefined && e.egg !== null && e.egg !== "" ? e.egg : e.unit;
  const src = e.values ? {
    diameter: e.values["Diameter"], height: e.values["Height"],
    top: e.values["top"], bottom: e.values["bottom"], equater: e.values["equater"],
    force: e.values["Force at Break (Standard)"],
    displacement: e.values["Displacement at Break (Standard)"],
    eggweight: e.values["Individual Egg weight"],
  } : e;
  // Matched on header TEXT, so moving or renaming a column on the master
  // can't silently put readings in the wrong place.
  const wanted = {
    diameter: "diameter", height: "height", top: "top", bottom: "bottom",
    equater: "equater", force: "force at break",
    displacement: "displacement at break", eggweight: "individual egg weight",
  };
  const headers = {};
  const maxCol = ws.maxCol();
  for (let c = 1; c <= maxCol; c++) {
    const h = ws.read(1, c);
    if (h) headers[String(h).trim().toLowerCase()] = c;
  }
  let row = null;
  const maxRow = ws.maxRow();
  for (let r = 3; r <= maxRow; r++) {
    if (Number(ws.read(r, 1)) === Number(eggNo)) { row = r; break; }
  }
  if (!row) { problems.push(`egg ${eggNo}: egg number isn't in this file`); return false; }
  let placed = 0;
  for (const [field, label] of Object.entries(wanted)) {
    const val = numOrNull(src[field]);
    if (val === null) continue;
    const key = Object.keys(headers).find((h) => h.startsWith(label));
    if (key) { ws.write(row, headers[key], val); placed++; }
  }
  if (!placed) problems.push(`egg ${eggNo}: no matching columns in this file`);
  return placed > 0;
}


/* ------------------------------------------------- monthly sampling sheets

Egg Quality, Slaughter and Defeathering are all the SAME shape: one row per
sampled egg or bird, keyed by Month + Pen + Egg/Bird. That is what makes
"1 egg this month, 3 next month" work without a mode switch - three eggs is
simply three rows, labelled 1a, 1b, 1c.

The old Egg Quality sheet was keyed by egg number alone, with no pen, no
month and no date, so a second month's readings overwrote the first.

ADDING A NEW PARAMETER
The header row is the source of truth. A value is written under the column
whose label matches; if no such column exists one is APPENDED with that
label. So measuring intestines for the first time is typing "Intestines (g)"
once - it lands correctly labelled here, in the export and on the master.
*/

const SAMPLING_SHEETS = {
  eggquality: "Egg Quality",
  slaughter: "Slaughter",
  defeathering: "Defeathering",
};

/** {normalised label: column} for row 1. */
function headerMap(ws) {
  const map = {};
  const maxCol = ws.maxCol();
  for (let c = 1; c <= maxCol; c++) {
    const h = ws.read(1, c);
    if (h !== null && String(h).trim() !== "") map[String(h).trim().toLowerCase()] = c;
  }
  return map;
}

/** Column for a label, appending a new labelled column if it isn't there. */
function columnFor(ws, label) {
  const key = String(label).trim().toLowerCase();
  const map = headerMap(ws);
  if (map[key]) return map[key];
  const c = ws.maxCol() + 1;
  ws.write(1, c, String(label).trim());
  return c;
}

/** Row for this month+pen+unit, or null. Never matches across months. */
function samplingRow(ws, month, pen, unit) {
  const h = headerMap(ws);
  const cM = h["month"], cP = h["pen"];
  const cU = h["egg"] !== undefined ? h["egg"] : h["bird"];
  if (!cM || !cP || !cU) return null;
  const maxRow = ws.maxRow();
  for (let r = 2; r <= maxRow; r++) {
    if (String(ws.read(r, cM) || "").trim() === String(month) &&
        Number(ws.read(r, cP)) === Number(pen) &&
        String(ws.read(r, cU) || "").trim().toLowerCase() === String(unit).trim().toLowerCase()) {
      return r;
    }
  }
  return null;
}

function nextSamplingRow(ws) {
  const h = headerMap(ws);
  const cM = h["month"] || 1;
  const maxRow = ws.maxRow();
  for (let r = 2; r <= maxRow + 1; r++) {
    if (ws.read(r, cM) === null) return r;
  }
  return maxRow + 1;
}

/**
 * One placer for all three sheets. e.unit is the egg or bird label ("1",
 * "1a"). e.values is {label: value} - anything at all, including labels the
 * sheet has never seen.
 */
function placeSampling(book, e, problems, sheetKey) {
  const sheetName = SAMPLING_SHEETS[sheetKey];
  const ws = book.sheet(sheetName);
  if (!ws) { problems.push(`${e.month} pen ${e.pen}: no '${sheetName}' sheet in this file`); return false; }

  // BACKWARD COMPATIBILITY. Two things can still be in the old shape:
  //   - an entry captured before this update (egg number, no month, no pen)
  //   - a master whose Egg Quality sheet is still the old flat table
  // Either one falls back to the original placement rather than being
  // reported as a failure, so nothing already on a phone is stranded.
  if (sheetKey === "eggquality") {
    const h = headerMap(ws);
    const oldSheet = h["month"] === undefined && h["egg number"] !== undefined;
    const oldEntry = !e.month || !e.unit;
    if (oldSheet || oldEntry) return placeEggQualityFlat(book, e, problems, oldSheet);
  }

  const unit = String(e.unit || e.egg || e.bird || "").trim();
  if (!e.month || !e.pen || !unit) {
    problems.push(`${sheetName}: an entry was missing its month, pen or label`); return false;
  }
  let row = samplingRow(ws, e.month, e.pen, unit);
  const isNew = row === null;
  if (isNew) row = nextSamplingRow(ws);

  // Key columns are written once, on the row's first pass, and never
  // rewritten - so the lab pass a week later cannot move the row.
  if (isNew) {
    ws.write(row, columnFor(ws, "Month"), e.month);
    ws.write(row, columnFor(ws, "Pen"), Number(e.pen));
    ws.write(row, columnFor(ws, sheetKey === "eggquality" ? "Egg" : "Bird"), unit);
  }
  if (e.date) ws.write(row, columnFor(ws, "Date"), e.date);

  let wrote = 0;
  for (const [label, value] of Object.entries(e.values || {})) {
    if (value === null || value === undefined || value === "") continue;
    const n = numOrNull(value);
    if (ws.write(row, columnFor(ws, label), n === null ? String(value) : n)) wrote++;
  }
  if (!wrote && !isNew) {
    problems.push(`${sheetName} ${e.month} pen ${e.pen} ${unit}: nothing to write`);
    return false;
  }
  return true;
}

const PLACERS = {
  egg: placeEgg, feed: placeFeed, mortality: placeMortality,
  bodyweight: placeBodyWeight,
  eggquality: (b, e, p) => placeSampling(b, e, p, "eggquality"),
  slaughter: (b, e, p) => placeSampling(b, e, p, "slaughter"),
  defeathering: (b, e, p) => placeSampling(b, e, p, "defeathering"),
};

/* ---------------------------------------------------------------- public */

/**
 * THE DUPLICATE RULE lives here, and it depends on WHICH workbook is stored.
 *
 * Real master (downloaded via Load latest): unsynced only. A fresh download
 * already contains everything this device has synced, so re-applying it
 * would write the same numbers twice.
 *
 * Template (no access to the real file): EVERYTHING, synced or not. Nothing
 * ever back-fills a template, so filtering out synced entries handed the
 * person a blank workbook the moment their first Sync succeeded - Sync
 * working was what broke Export. There is no double-count risk here because
 * the template starts empty and is never refreshed from the server.
 *
 * Demo entries are included either way - the demo is meant to produce a real
 * export - and they are excluded from Sync instead, in DB.unsyncedEntries().
 */
function pendingFor(entries, house, includeSynced) {
  return entries
    .filter((e) => e.house === house && (includeSynced || !e.synced))
    .sort((a, b) => String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
}

function applyPending(book, entries, house, includeSynced) {
  const problems = [];
  let placed = 0;
  for (const e of pendingFor(entries, house, includeSynced)) {
    const fn = PLACERS[e.type];
    if (!fn) { problems.push(`${e.date}: unknown entry type '${e.type}'`); continue; }
    try {
      if (fn(book, e, problems)) placed++;
    } catch (err) {
      problems.push(`${e.date} ${e.type}: ${err.message}`);
    }
  }
  return { placed, problems };
}

/** Anything that couldn't be placed is written into the file itself, so a
 *  person looking at their export can see what's missing and why. The sheet
 *  is created in the embedded templates; on a real master it only exists if
 *  the home PC put one there. */
function writeNotPlacedSheet(book, problems, placed) {
  const ws = book.sheet("Not yet placed");
  if (!ws) return;
  let r = 1;
  ws.write(r++, 1, `Export built ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  ws.write(r++, 1, `${placed} entr${placed === 1 ? "y" : "ies"} written into this file.`);
  r++;
  if (!problems.length) {
    ws.write(r++, 1, "Everything captured on this device was placed.");
    return;
  }
  ws.write(r++, 1, "These entries are on the device but could NOT be written into a cell:");
  ws.write(r++, 1, "They are still saved on the phone and still go in when you Sync.");
  r++;
  for (const p of problems) ws.write(r++, 1, p);
}

/**
 * Builds the export blob: the stored workbook with this device's unsynced
 * entries placed into it.
 * Returns {blob, filename, placed, problems, downloadedAt, isTemplate} or
 * null when nothing has been stored for this house yet.
 */
async function buildMasterExport(house) {
  const stored = await DB.getMaster(house);
  if (!stored) return null;
  const book = new XlsxPatcher(stored.data);
  const entries = await DB.allEntries();
  // See pendingFor(): a template needs every entry, a real master only the
  // ones the server hasn't got yet.
  const { placed, problems } = applyPending(book, entries, house, !!stored.isTemplate);
  writeNotPlacedSheet(book, problems, placed);
  const short = house.replace(/^House\s+/, "");
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    blob: book.toBlob(),
    filename: `${short}${stored.isTemplate ? "_capture" : "_master"}_${stamp}.xlsx`,
    placed,
    problems,
    downloadedAt: stored.downloadedAt,
    isTemplate: !!stored.isTemplate,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    buildMasterExport, applyPending, pendingFor, dayCol, penIndex,
    feedWeekCol, parseWeekRange, writeNotPlacedSheet, ddMon, MASTER_SHEETS, GEO,
    placeSampling, columnFor, samplingRow, headerMap, SAMPLING_SHEETS,
  };
}
