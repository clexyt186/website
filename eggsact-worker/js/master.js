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

function placeEggQuality(book, e, problems) {
  const ws = book.sheet(MASTER_SHEETS.eggquality);
  if (!ws) { problems.push(`egg ${e.egg}: no '${MASTER_SHEETS.eggquality}' sheet`); return false; }
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
    if (Number(ws.read(r, 1)) === Number(e.egg)) { row = r; break; }
  }
  if (!row) { problems.push(`egg ${e.egg}: egg number isn't in this file`); return false; }
  let placed = 0;
  for (const [field, label] of Object.entries(wanted)) {
    const val = numOrNull(e[field]);
    if (val === null) continue;
    const key = Object.keys(headers).find((h) => h.startsWith(label));
    if (key) { ws.write(row, headers[key], val); placed++; }
  }
  if (!placed) problems.push(`egg ${e.egg}: no matching columns in this file`);
  return placed > 0;
}

const PLACERS = {
  egg: placeEgg, feed: placeFeed, mortality: placeMortality,
  bodyweight: placeBodyWeight, eggquality: placeEggQuality,
};

/* ---------------------------------------------------------------- public */

/** THE DUPLICATE RULE lives here: this house, unsynced only, oldest first.
 *  Demo entries ARE included - the demo is meant to produce a real export -
 *  and they are excluded from Sync instead, in DB.unsyncedEntries(). */
function pendingFor(entries, house) {
  return entries
    .filter((e) => e.house === house && !e.synced)
    .sort((a, b) => String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
}

function applyPending(book, entries, house) {
  const problems = [];
  let placed = 0;
  for (const e of pendingFor(entries, house)) {
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
  const { placed, problems } = applyPending(book, entries, house);
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
  };
}
