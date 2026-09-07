/*
EGGSACT Worker - export builder

Produces a REAL .xlsx file, sheet-named exactly the way the master app's
sync_import.py expects: "<Type> <DDMonYYYY> <House>" e.g.
"Egg 15Jun2026 Nketlwane". Column headers match EGG_HEADER_ALIASES etc in
that same file. This is the ONE place naming has to stay in lockstep with
the master app - if either side changes the convention, update both.

MONTH ABBREVIATIONS: must be exactly 3 letters, first capital, matching
Python's %b for English locale (Jan Feb Mar Apr May Jun Jul Aug Sep Oct
Nov Dec) - NOT a locale-dependent JS date format, which could differ.

MONTHLY SAMPLING TYPES (eggquality, slaughter, defeathering)
These carry a Month + Pen + Egg/Bird key and then whatever parameters were
measured. The parameter columns are NOT fixed: the header row is built from
the union of the labels actually captured, so a new organ measured for the
first time simply appears as a new column. The importer matches on the same
labels, which is what keeps "add a parameter" from being a code change.
*/

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ddMonYYYY(dateStr) {
  // dateStr: "YYYY-MM-DD" -> "15Jun2026"
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}${MONTH_ABBR[m - 1]}${y}`;
}

function houseShort(houseName) {
  return houseName.replace(/^House\s+/, "").trim();
}

const TYPE_CODE = {
  egg: "Egg", feed: "Feed", bodyweight: "BW", mortality: "Mort",
  eggquality: "EQ", slaughter: "Slaughter", defeathering: "Defeather",
};

/** The three monthly sampling types share one shape. */
const SAMPLING_TYPES = ["eggquality", "slaughter", "defeathering"];
const UNIT_LABEL = { eggquality: "Egg", slaughter: "Bird", defeathering: "Bird" };

const HEADERS = {
  egg: ["Pen Number", "Number of Eggs", "Weight", "Non Layer", "Number of Rejects", "Reason"],
  // Feed: ONLY Pen + Orts. Bird#/Allocation are never included from a worker
  // device - it has no reliable way to know the current correct values, and
  // the master's importer is built to only touch the Orts cell when those
  // two columns are absent (never risks wiping them).
  feed: ["Pen Number", "Feed Orts"],
  bodyweight: ["Pen Number", "Hen", "Weight"],
  mortality: ["Pen Number", "Weight", "Reason"],
};

function fieldsFor(type, entry) {
  switch (type) {
    case "egg":
      return [entry.pen, entry.eggs, entry.weight, entry.nonlayer, entry.rejects, entry.reason || ""];
    case "feed":
      return [entry.pen, entry.orts];
    case "bodyweight":
      return [entry.pen, entry.hen, entry.weight];
    case "mortality":
      return [entry.pen, entry.weight || "", entry.reason || ""];
    default:
      throw new Error(`unknown entry type '${type}'`);
  }
}

/** Union of parameter labels across a batch, in first-seen order, so the
 *  sheet's columns are stable and readable rather than alphabetised. */
function samplingLabels(entries) {
  const seen = [];
  for (const e of entries) {
    for (const label of Object.keys(e.values || {})) {
      if (!seen.includes(label)) seen.push(label);
    }
  }
  return seen;
}

function samplingRows(type, entries) {
  const labels = samplingLabels(entries);
  const header = ["Month", "Date", "Pen", UNIT_LABEL[type], ...labels];
  const rows = [header];
  for (const e of entries) {
    const unit = e.unit || e.egg || e.bird || "";
    const row = [e.month || "", e.date || "", e.pen, unit];
    for (const label of labels) {
      const v = (e.values || {})[label];
      row.push(v === undefined || v === null ? "" : v);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Groups entries by (type, date, house) - one sheet per group, exactly
 * matching how the master app expects one dated sheet per capture batch.
 * Returns a plain map: sheetName -> array of row arrays (header row first).
 */
function buildSheets(entries) {
  const groups = {};
  for (const e of entries) {
    const key = `${e.type}|${e.date}|${e.house}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  const sheets = {};
  for (const key of Object.keys(groups)) {
    const [type, date, house] = key.split("|");
    const sheetName = `${TYPE_CODE[type]} ${ddMonYYYY(date)} ${houseShort(house)}`;
    if (sheetName.length > 31) {
      throw new Error(`Sheet name '${sheetName}' exceeds Excel's 31-char limit`);
    }
    if (SAMPLING_TYPES.includes(type)) {
      sheets[sheetName] = samplingRows(type, groups[key]);
      continue;
    }
    const rows = [HEADERS[type]];
    for (const e of groups[key]) {
      rows.push(fieldsFor(type, e));
    }
    sheets[sheetName] = rows;
  }
  return sheets;
}

/** Builds the actual .xlsx Blob (browser) using the bundled SheetJS lib. */
function buildWorkbookBlob(entries, XLSX) {
  const sheets = buildSheets(entries);
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], { type: "application/octet-stream" });
}

if (typeof module !== "undefined") {
  module.exports = { buildSheets, buildWorkbookBlob, ddMonYYYY, houseShort,
                     TYPE_CODE, HEADERS, SAMPLING_TYPES, samplingLabels };
}
