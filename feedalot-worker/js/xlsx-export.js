/*
CLEVITA FeedAlot Worker - export builder

Sheet naming MUST match feedlot_import.py exactly: "<Type> <DDMonYYYY>
<Group>". Group codes here are short ("Group3") rather than the full
name ("Group 3") purely to stay under Excel's 31-character sheet-name
limit - the server's fuzzy group-name matching (confirmed working
against the real server) resolves the short code back to the full name.
*/

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ddMonYYYY(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}${MONTH_ABBR[m - 1]}${y}`;
}

// matches feedlot_import.py's TYPE_ALIASES keys exactly (case-insensitive on the server)
const TYPE_CODE = {
  processing: "Processing", weighing: "Weighing", famacha: "Famacha",
  feeding: "Feeding", feedstock: "FeedStock", obs_am: "ObsAM", obs_pm: "ObsPM", sick: "Sick",
};

// short codes - must each resolve uniquely via the server's substring match
const GROUP_SHORT_CODES = {
  "Group 1": "Group1", "Group 2": "Group2", "Group 3": "Group3",
  "Group 4": "Group4", "Group 5 - Merino Mob": "Group5",
};

// matches feedlot_import.py's HEADER_ALIASES exactly (header text, not internal keys)
const HEADERS = {
  processing: ["EID", "Sheep ID", "Weight", "BCS", "Status"],
  weighing: ["Sheep ID", "Date", "Weight"],
  famacha: ["Sheep ID", "Date", "Score"],
  feeding: ["Date", "AM Feeders", "AM Out", "AM In", "PM Feeders", "PM Out", "PM In", "Notes"],
  feedstock: ["Date", "Fed AM", "Fed PM", "Removed AM", "Removed PM"],
  obs_am: ["Date", "Behaviour", "Water", "Dung", "Pen Condition", "Notes", "Weather"],
  obs_pm: ["Date", "Behaviour", "Water", "Dung", "Pen Condition", "Notes", "Weather"],
  sick: ["Sheep ID", "Date", "Symptoms", "Treatment", "Condition After"],
};

function fieldsFor(type, e) {
  switch (type) {
    case "processing": return [e.eid, e.sheepId, e.weight, e.bcs, e.status];
    case "weighing": return [e.sheepId, e.date, e.weight];
    case "famacha": return [e.sheepId, e.date, e.score];
    case "feeding": return [e.date, e.amFeeders, e.amOut, e.amIn, e.pmFeeders, e.pmOut, e.pmIn, e.notes || ""];
    case "feedstock": return [e.date, e.fedAm || 0, e.fedPm || 0, e.removedAm || 0, e.removedPm || 0];
    case "obs_am": case "obs_pm": return [e.date, e.behaviour, e.water, e.dung, e.penCondition, e.notes, e.weather];
    case "sick": return [e.sheepId, e.date, e.symptoms, e.treatment, e.conditionAfter];
    default: throw new Error(`unknown entry type '${type}'`);
  }
}

/** Groups entries by (type, date, group) - one sheet per group, matching
 * the same "one dated sheet per batch" pattern already proven in EGGSACT. */
function buildSheets(entries) {
  const groups = {};
  for (const e of entries) {
    const key = `${e.type}|${e.date}|${e.group}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  const sheets = {};
  for (const key of Object.keys(groups)) {
    const [type, dateStr, group] = key.split("|");
    const groupCode = GROUP_SHORT_CODES[group];
    if (!groupCode) throw new Error(`Unknown group '${group}' - no short code defined for it.`);
    const sheetName = `${TYPE_CODE[type]} ${ddMonYYYY(dateStr)} ${groupCode}`;
    if (sheetName.length > 31) throw new Error(`Sheet name '${sheetName}' exceeds Excel's 31-char limit`);
    const rows = [HEADERS[type]];
    for (const e of groups[key]) rows.push(fieldsFor(type, e));
    sheets[sheetName] = rows;
  }
  return sheets;
}

function buildWorkbookBlob(entries, XLSX) {
  const sheets = buildSheets(entries);
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], { type: "application/octet-stream" });
}

if (typeof module !== "undefined") {
  module.exports = { buildSheets, buildWorkbookBlob, ddMonYYYY, TYPE_CODE, GROUP_SHORT_CODES, HEADERS };
}
