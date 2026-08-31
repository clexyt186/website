/*
CLEVITA FeedAlot Worker - local master file

WHAT CHANGED AND WHY
"Refresh full group data" used to download the group file and hand it
straight to the browser as a download - the app kept nothing. So Export gave
you only what THIS phone had typed, a loose sheet of fragments, while the
real file was somewhere in your Downloads folder. That's backwards: the
obvious button gave the file that isn't real, and the real one was buried.

Now Refresh STORES the group file on the device, and Export returns that
whole file with this phone's not-yet-synced entries written into their
correct cells.

WHY IT PATCHES THE FILE INSTEAD OF REBUILDING IT
The group workbook is heavily merged (65 merged ranges - the Daily
Observations sheet alone has 43) and the Daily Feeding sheet carries 211
live formulas for the feed-stock ledger. Rebuilding it with SheetJS destroys
all of that. xlsx-patch.js edits the individual cells inside the .xlsx zip
and leaves every other byte exactly as the home PC wrote it. Verified on the
real Group 5 file: 65 merges and 211 formulas before, 65 and 211 after.

THE DUPLICATE RULE
A freshly refreshed master already contains everything this device has
synced, so only UNSYNCED entries are applied. Re-applying the whole local
ledger would double-count. Enforced in one place: pendingFor().

BLOCK BOUNDARIES MATTER HERE
The weighing sheet stacks blocks vertically with the SAME sheep IDs in each:
weights (rows 4-15), then ADG, then FAMACHA and BCS side by side. A lookup
that scans past the end of its block finds the right sheep in the WRONG
block and writes live weights into the ADG table. Every lookup below stops
at the first blank or merged cell - that is the block's end.
*/

const FA_SHEETS = {
  processing: "Processing",
  weighing: "weighing",
  feeding: "Daily Feeding",
  observations: "Daily Obervations ",   // the real sheet name has a trailing space
  sick: "Sick ewes",
};

const FA = {
  procHeaderRow: 3, procDataStart: 4, procIdCol: 2,
  weighHeaderRow: 3, weighDataStart: 4, weighIdCol: 1, weighFirstCol: 2,
  feedHeaderRow: 2, feedDataStart: 4,
  obsDataStart: 6, obsAmFirstCol: 2, obsPmFirstCol: 8,
  sickDataStart: 5,
  // feed-stock ledger columns, confirmed against the real template
  ledgerRemovedAm: 20, ledgerFedAm: 21, ledgerRemovedPm: 22, ledgerFedPm: 23,
};

function faNorm(id) {
  return String(id === null || id === undefined ? "" : id).trim().toUpperCase().replace(/\s+/g, "");
}

function faYmd(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return { y, m, d };
}

/** True when a cell value is the same calendar day as a "YYYY-MM-DD" string.
 *  Dates in this template are sometimes real dates and sometimes the text
 *  "30/07/2026", so both are handled. */
function faSameDay(cellVal, dateStr) {
  const want = faYmd(dateStr);
  if (cellVal instanceof Date) {
    return cellVal.getUTCFullYear() === want.y &&
           cellVal.getUTCMonth() + 1 === want.m &&
           cellVal.getUTCDate() === want.d;
  }
  if (typeof cellVal === "string") {
    const m = cellVal.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return Number(m[3]) === want.y && Number(m[2]) === want.m && Number(m[1]) === want.d;
    const iso = cellVal.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return Number(iso[1]) === want.y && Number(iso[2]) === want.m && Number(iso[3]) === want.d;
  }
  return false;
}

/** Last row of the block starting at dataStart - stops at the first blank
 *  cell. This is what keeps a write inside its own block. */
function faBlockLastRow(sheet, idCol, dataStart) {
  const maxRow = sheet.maxRow();
  let r = dataStart;
  while (r <= maxRow) {
    // A merged cell here is the NEXT block's label, not another sheep.
    // Stopping only at a blank let a scan run straight into the ADG or BCS
    // block below, find the right sheep ID in the wrong block, and write a
    // live weight into a derived column.
    if (typeof sheet.isMerged === "function" && sheet.isMerged(r, idCol)) break;
    const v = sheet.read(r, idCol);
    if (v === null || v === "") break;
    r += 1;
  }
  return r - 1;
}

function faFindInBlock(sheet, id, idCol, dataStart) {
  const target = faNorm(id);
  const last = faBlockLastRow(sheet, idCol, dataStart);
  for (let r = dataStart; r <= last; r++) {
    if (faNorm(sheet.read(r, idCol)) === target) return r;
  }
  return null;
}

/** Column for a date within a dated block, or null if that day isn't there
 *  yet. Never creates one: a new dated column on the phone would not match
 *  the column the home PC creates, and the two would drift apart. */
function faDateCol(sheet, headerRow, firstCol, dateStr) {
  const maxCol = sheet.maxCol();
  for (let c = firstCol; c <= maxCol; c++) {
    if (faSameDay(sheet.read(headerRow, c), dateStr)) return c;
  }
  return null;
}

/** The FAMACHA block sits to the right of the weight block with its own ID
 *  column and its date headers one row LOWER than the weight block's. */
function faFamachaCols(sheet) {
  const maxCol = sheet.maxCol();
  for (let c = 1; c <= maxCol; c++) {
    const v = sheet.read(FA.weighHeaderRow, c);
    if (v && String(v).trim().toUpperCase() === "FAMACHA") {
      return { idCol: c - 1, firstDateCol: c,
               headerRow: FA.weighHeaderRow + 1, dataStart: FA.weighDataStart + 1 };
    }
  }
  return null;
}

function faRowForDate(sheet, dateStr, dataStart, dateCol = 1) {
  const maxRow = sheet.maxRow();
  for (let r = dataStart; r <= maxRow; r++) {
    if (faSameDay(sheet.read(r, dateCol), dateStr)) return r;
  }
  return null;
}

function faNextFreeRow(sheet, dataStart, col = 1) {
  const maxRow = sheet.maxRow();
  for (let r = dataStart; r <= maxRow + 1; r++) {
    const v = sheet.read(r, col);
    if (v === null || v === "") return r;
  }
  return maxRow + 1;
}

/* ---------------------------------------------------------------- placers */

function faPlaceWeighing(book, e, problems) {
  const ws = book.sheet(FA_SHEETS.weighing);
  if (!ws) { problems.push(`${e.date}: no weighing sheet`); return false; }
  const row = faFindInBlock(ws, e.sheepId, FA.weighIdCol, FA.weighDataStart);
  if (!row) { problems.push(`${e.date} ${e.sheepId}: not in the weighing sheet`); return false; }
  const col = faDateCol(ws, FA.weighHeaderRow, FA.weighFirstCol, e.date);
  if (!col) { problems.push(`${e.date} ${e.sheepId}: no column for that date yet`); return false; }
  ws.write(row, col, Number(e.weight));
  return true;
}

function faPlaceFamacha(book, e, problems) {
  const ws = book.sheet(FA_SHEETS.weighing);
  if (!ws) { problems.push(`${e.date}: no weighing sheet`); return false; }
  const b = faFamachaCols(ws);
  if (!b) { problems.push(`${e.date}: no FAMACHA block found`); return false; }
  const row = faFindInBlock(ws, e.sheepId, b.idCol, b.dataStart);
  if (!row) { problems.push(`${e.date} ${e.sheepId}: not in the FAMACHA block`); return false; }
  const col = faDateCol(ws, b.headerRow, b.firstDateCol, e.date);
  if (!col) { problems.push(`${e.date} ${e.sheepId}: no FAMACHA column for that date yet`); return false; }
  ws.write(row, col, Number(e.score));
  return true;
}

function faPlaceProcessing(book, e, problems) {
  const ws = book.sheet(FA_SHEETS.processing);
  if (!ws) { problems.push(`${e.sheepId}: no Processing sheet`); return false; }
  let row = faFindInBlock(ws, e.sheepId, FA.procIdCol, FA.procDataStart);
  if (!row) row = faNextFreeRow(ws, FA.procDataStart, FA.procIdCol);
  ws.write(row, 1, e.eid || null);
  ws.write(row, 2, e.sheepId);
  if (e.weight !== null && e.weight !== undefined && e.weight !== "") ws.write(row, 3, Number(e.weight));
  if (e.bcs !== null && e.bcs !== undefined && e.bcs !== "") ws.write(row, 4, Number(e.bcs));
  if (e.status) ws.write(row, 17, e.status);
  return true;
}

function faPlaceFeeding(book, e, problems) {
  const ws = book.sheet(FA_SHEETS.feeding);
  if (!ws) { problems.push(`${e.date}: no Daily Feeding sheet`); return false; }
  let row = faRowForDate(ws, e.date, FA.feedDataStart);
  if (!row) row = faNextFreeRow(ws, FA.feedDataStart);
  ws.write(row, 1, e.date);
  ws.write(row, 2, e.amFeeders || null);
  ws.write(row, 3, e.amOut || null);
  ws.write(row, 4, e.amIn || null);
  ws.write(row, 5, e.pmFeeders || null);
  ws.write(row, 6, e.pmOut || null);
  ws.write(row, 7, e.pmIn || null);
  ws.write(row, 8, e.notes || null);
  return true;
}

function faPlaceFeedStock(book, e, problems) {
  const ws = book.sheet(FA_SHEETS.feeding);
  if (!ws) { problems.push(`${e.date}: no Daily Feeding sheet`); return false; }
  let row = faRowForDate(ws, e.date, FA.feedDataStart);
  if (!row) {
    row = faNextFreeRow(ws, FA.feedDataStart);
    ws.write(row, 1, e.date);
  }
  // Only the raw input columns. The SUM totals and the running balance are
  // formulas and are never touched - write() refuses a formula cell anyway.
  ws.write(row, FA.ledgerFedAm, Number(e.fedAm || 0));
  ws.write(row, FA.ledgerFedPm, Number(e.fedPm || 0));
  ws.write(row, FA.ledgerRemovedAm, Number(e.removedAm || 0));
  ws.write(row, FA.ledgerRemovedPm, Number(e.removedPm || 0));
  return true;
}

function faPlaceObs(book, e, problems, session) {
  const ws = book.sheet(FA_SHEETS.observations);
  if (!ws) { problems.push(`${e.date}: no Daily Observations sheet`); return false; }
  let row = faRowForDate(ws, e.date, FA.obsDataStart);
  if (!row) row = faNextFreeRow(ws, FA.obsDataStart);
  const first = session === "AM" ? FA.obsAmFirstCol : FA.obsPmFirstCol;
  ws.write(row, 1, e.date);
  const vals = [e.behaviour, e.water, e.dung, e.penCondition, e.notes, e.weather];
  vals.forEach((v, i) => ws.write(row, first + i, v || null));
  return true;
}

function faPlaceSick(book, e, problems) {
  const ws = book.sheet(FA_SHEETS.sick);
  if (!ws) { problems.push(`${e.sheepId}: no Sick ewes sheet`); return false; }
  const row = faNextFreeRow(ws, FA.sickDataStart);
  ws.write(row, 1, e.sheepId);
  ws.write(row, 2, e.date);
  ws.write(row, 3, e.symptoms || null);
  ws.write(row, 4, e.treatment || null);
  ws.write(row, 5, e.conditionAfter || null);
  return true;
}

const FA_PLACERS = {
  weighing: faPlaceWeighing,
  famacha: faPlaceFamacha,
  processing: faPlaceProcessing,
  feeding: faPlaceFeeding,
  feedstock: faPlaceFeedStock,
  obs_am: (b, e, p) => faPlaceObs(b, e, p, "AM"),
  obs_pm: (b, e, p) => faPlaceObs(b, e, p, "PM"),
  sick: faPlaceSick,
};

/* ---------------------------------------------------------------- public */

/** THE DUPLICATE RULE: this group, unsynced only, oldest first. */
function pendingFor(entries, group) {
  return entries
    .filter((e) => e.group === group && !e.synced)
    .sort((a, b) => String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
}

function applyPending(book, entries, group) {
  const problems = [];
  let placed = 0;
  for (const e of pendingFor(entries, group)) {
    const fn = FA_PLACERS[e.type];
    if (!fn) { problems.push(`${e.date}: unknown entry type '${e.type}'`); continue; }
    try {
      if (fn(book, e, problems)) placed += 1;
    } catch (err) {
      problems.push(`${e.date} ${e.type}: ${err.message}`);
    }
  }
  return { placed, problems };
}

/**
 * The export: the stored group master with this device's unsynced entries
 * placed into it. Returns null when nothing has been downloaded yet.
 */
async function buildGroupExport(group) {
  const stored = await DB.getMaster(group);
  if (!stored) return null;
  const book = new XlsxPatcher(stored.data);
  const entries = await DB.allEntries();
  const { placed, problems } = applyPending(book, entries, group);
  return {
    blob: book.toBlob(),
    filename: `${group.replace(/\s+/g, "_")}_master_${new Date().toISOString().slice(0, 10)}.xlsx`,
    placed,
    problems,
    downloadedAt: stored.downloadedAt,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    buildGroupExport, applyPending, pendingFor, faFindInBlock, faBlockLastRow,
    faDateCol, faFamachaCols, faSameDay, FA_SHEETS, FA,
  };
}
