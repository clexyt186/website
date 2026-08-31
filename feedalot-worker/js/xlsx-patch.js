/*
EGGSACT Worker - xlsx-patch.js

WHY THIS EXISTS
The house master file carries thousands of LIVE formulas: weekly rollups,
%HDE, and the FCR chain that links feed to egg mass. The bundled SheetJS
build cannot read them - openpyxl writes formula cells as <f>...</f><v></v>
and SheetJS drops those cells entirely. Verified against the real master:
of 17,420 formula cells it read ZERO. So parsing the workbook and writing it
back would hand you a master with every rollup and every FCR gone.

WHAT THIS DOES INSTEAD
An .xlsx is a zip of XML files. This unzips it, edits ONLY the specific
<c> elements for the cells being written, and rezips. Every byte it does not
touch stays exactly as the home PC wrote it - formulas, number formats,
column widths, merged ranges, everything. Nothing is parsed into a workbook
object and nothing is regenerated.

That is what makes "the phone holds a real master file" safe rather than
lossy, and it is the same approach FeedAlot needs for its merged sheets.

SCOPE
Deliberately small. It can:
  - find a sheet's XML by name (via workbook.xml + rels)
  - read a cell's value
  - write a value into a cell, creating the <c> and its <row> if absent
  - refuse to write over a cell containing a formula
It does not evaluate formulas, reflow anything, or touch shared strings for
existing entries - new text is written as an inline string, which Excel and
Sheets both read natively.
*/

/* ---------------------------------------------------------------- refs */

function colToLetters(col) {
  let s = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

function lettersToCol(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function cellRef(row, col) {
  return colToLetters(col) + row;
}

function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? { col: lettersToCol(m[1]), row: Number(m[2]) } : null;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/* ---------------------------------------------------------------- book */

class XlsxPatcher {
  /** bytes: ArrayBuffer or Uint8Array of the .xlsx */
  constructor(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.files = fflate.unzipSync(u8);
    this.dec = new TextDecoder();
    this.enc = new TextEncoder();
    this._sheetPaths = null;
    this._shared = null;
    this._dirty = new Set();
  }

  text(path) {
    const f = this.files[path];
    return f ? this.dec.decode(f) : null;
  }

  setText(path, str) {
    this.files[path] = this.enc.encode(str);
    this._dirty.add(path);
  }

  /** {sheetName: 'xl/worksheets/sheetN.xml'} resolved through the rels, not
   *  by assuming sheet order matches file numbering (it often doesn't). */
  sheetPaths() {
    if (this._sheetPaths) return this._sheetPaths;
    const wbXml = this.text("xl/workbook.xml") || "";
    const relsXml = this.text("xl/_rels/workbook.xml.rels") || "";
    const rels = {};
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0]);
      const target = /Target="([^"]+)"/.exec(m[0]);
      if (id && target) {
        let t = target[1].replace(/^\/?xl\//, "").replace(/^\.\//, "");
        rels[id[1]] = t.startsWith("worksheets/") ? "xl/" + t : "xl/" + t;
      }
    }
    const out = {};
    for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
      const name = /name="([^"]*)"/.exec(m[0]);
      const rid = /r:id="([^"]+)"/.exec(m[0]);
      if (name && rid && rels[rid[1]]) {
        out[name[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")] = rels[rid[1]];
      }
    }
    this._sheetPaths = out;
    return out;
  }

  sheetNames() {
    return Object.keys(this.sheetPaths());
  }

  /** Shared-string table, needed to READ existing text cells (t="s"). */
  sharedStrings() {
    if (this._shared) return this._shared;
    const xml = this.text("xl/sharedStrings.xml");
    const out = [];
    if (xml) {
      for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
        let s = "";
        for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
        out.push(s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
      }
    }
    this._shared = out;
    return out;
  }

  sheet(name) {
    const path = this.sheetPaths()[name];
    return path ? new SheetPatcher(this, name, path) : null;
  }

  /** Rezips. STORE for the small XML we rewrote is not used - everything is
   *  deflated, same as the original, so the file stays a normal .xlsx. */
  toBytes() {
    return fflate.zipSync(this.files, { level: 6 });
  }

  toBlob() {
    return new Blob([this.toBytes()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
}

/* ---------------------------------------------------------------- sheet */

class SheetPatcher {
  constructor(book, name, path) {
    this.book = book;
    this.name = name;
    this.path = path;
    this.xml = book.text(path) || "";
    this._cellCache = null;
  }

  /** {ref: {start,end,inner,attrs}} for every <c> in the sheet, built once. */
  cells() {
    if (this._cellCache) return this._cellCache;
    const map = {};
    const re = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = re.exec(this.xml)) !== null) {
      const attrs = m[1];
      const refM = /r="([A-Z]+\d+)"/.exec(attrs);
      if (!refM) continue;
      map[refM[1]] = {
        start: m.index,
        end: m.index + m[0].length,
        attrs,
        inner: m[3] === undefined ? "" : m[3],
        selfClosing: m[2] === "/>",
      };
    }
    this._cellCache = map;
    return map;
  }

  hasFormula(row, col) {
    const c = this.cells()[cellRef(row, col)];
    return !!(c && /<f[\s>]/.test(c.inner));
  }

  /** Value of a cell: number, string, JS Date for a serial date, or null. */
  read(row, col) {
    const c = this.cells()[cellRef(row, col)];
    if (!c || c.selfClosing) return null;
    const t = (/t="([^"]+)"/.exec(c.attrs) || [])[1];
    if (t === "inlineStr") {
      const m = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c.inner);
      return m ? m[1] : null;
    }
    const vm = /<v>([\s\S]*?)<\/v>/.exec(c.inner);
    if (!vm || vm[1] === "") return null;
    if (t === "s") {
      const arr = this.book.sharedStrings();
      const i = Number(vm[1]);
      return arr[i] === undefined ? null : arr[i];
    }
    if (t === "str") return vm[1];
    if (t === "b") return vm[1] === "1";
    const n = Number(vm[1]);
    if (!Number.isFinite(n)) return vm[1];
    if (this._isDateStyled(c.attrs)) return excelSerialToDate(n);
    return n;
  }

  /** Reads a cell as a raw number, ignoring date styling. */
  readNumber(row, col) {
    const v = this.read(row, col);
    if (v instanceof Date) return dateToExcelSerial(v);
    return typeof v === "number" ? v : null;
  }

  _dateStyles() {
    if (this.book._dateStyles) return this.book._dateStyles;
    const xml = this.book.text("xl/styles.xml") || "";
    // Built-in date/time formats plus any custom numFmt whose code contains a
    // date token. Needed only so a date column reads back as a real date.
    const builtinDate = new Set([14,15,16,17,18,19,20,21,22,45,46,47]);
    const customDate = new Set();
    for (const m of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
      if (/[dmyhs]/i.test(m[2]) && !/^[#0.,%\s]*$/.test(m[2])) customDate.add(Number(m[1]));
    }
    const cellXfs = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(xml);
    const styles = [];
    if (cellXfs) {
      for (const xf of cellXfs[0].matchAll(/<xf\b[^>]*>/g)) {
        const id = /numFmtId="(\d+)"/.exec(xf[0]);
        const n = id ? Number(id[1]) : 0;
        styles.push(builtinDate.has(n) || customDate.has(n));
      }
    }
    this.book._dateStyles = styles;
    return styles;
  }

  _isDateStyled(attrs) {
    const s = /s="(\d+)"/.exec(attrs);
    if (!s) return false;
    return !!this._dateStyles()[Number(s[1])];
  }

  /**
   * Writes a value. NEVER overwrites a formula cell - the same guard as
   * safe_set() in engine.py, and the reason the FCR chain survives.
   * Returns true if written, false if it refused.
   */
  write(row, col, value) {
    if (this.hasFormula(row, col)) return false;
    const ref = cellRef(row, col);
    const cells = this.cells();
    const existing = cells[ref];

    let body, tAttr;
    if (value === null || value === undefined || value === "") {
      body = ""; tAttr = "";
    } else if (typeof value === "number" && Number.isFinite(value)) {
      body = `<v>${value}</v>`; tAttr = "";
    } else {
      // inline string: no shared-string table surgery, read natively by
      // Excel, Sheets and LibreOffice alike
      body = `<is><t xml:space="preserve">${xmlEscape(value)}</t></is>`;
      tAttr = ' t="inlineStr"';
    }

    if (existing) {
      const keptStyle = (/\ss="\d+"/.exec(existing.attrs) || [""])[0];
      const cellXml = `<c r="${ref}"${keptStyle}${tAttr}>${body}</c>`;
      this.xml = this.xml.slice(0, existing.start) + cellXml + this.xml.slice(existing.end);
    } else {
      this._insertCell(ref, row, col, `<c r="${ref}"${tAttr}>${body}</c>`);
    }
    this._cellCache = null;
    this.book.setText(this.path, this.xml);
    return true;
  }

  /** Places a new <c> in column order inside its <row>, creating the row in
   *  row order if it doesn't exist. Excel tolerates a lot, but out-of-order
   *  cells are exactly the kind of thing that makes a file "repair". */
  _insertCell(ref, row, col, cellXml) {
    const rowRe = new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*?(\\/>|>([\\s\\S]*?)<\\/row>)`);
    const rm = rowRe.exec(this.xml);
    if (rm) {
      if (rm[1] === "/>") {
        const open = rm[0].slice(0, -2) + ">";
        this.xml = this.xml.slice(0, rm.index) + open + cellXml + "</row>" +
                   this.xml.slice(rm.index + rm[0].length);
        return;
      }
      const inner = rm[2];
      let insertAt = inner.length;
      const re = /<c\b[^>]*r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
      let m;
      while ((m = re.exec(inner)) !== null) {
        if (lettersToCol(m[1]) > col) { insertAt = m.index; break; }
      }
      const newInner = inner.slice(0, insertAt) + cellXml + inner.slice(insertAt);
      const rebuilt = rm[0].replace(inner, newInner);
      this.xml = this.xml.slice(0, rm.index) + rebuilt + this.xml.slice(rm.index + rm[0].length);
      return;
    }
    // no such row yet - insert before the first row with a higher number
    const newRow = `<row r="${row}">${cellXml}</row>`;
    const rowsRe = /<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
    let m, insertAt = -1;
    while ((m = rowsRe.exec(this.xml)) !== null) {
      if (Number(m[1]) > row) { insertAt = m.index; break; }
    }
    if (insertAt === -1) {
      const close = this.xml.lastIndexOf("</sheetData>");
      insertAt = close === -1 ? this.xml.length : close;
    }
    this.xml = this.xml.slice(0, insertAt) + newRow + this.xml.slice(insertAt);
    this._growDimension(row, col);
  }

  _growDimension(row, col) {
    const dm = /<dimension\s+ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\s*\/>/.exec(this.xml);
    if (!dm) return;
    const endCol = Math.max(lettersToCol(dm[3]), col);
    const endRow = Math.max(Number(dm[4]), row);
    this.xml = this.xml.replace(dm[0],
      `<dimension ref="${dm[1]}${dm[2]}:${colToLetters(endCol)}${endRow}"/>`);
  }

  /** Set of every cell ref covered by a merged range, e.g. {"B4","B5"}.
   *  FeedAlot's weighing sheet stacks blocks with the SAME sheep IDs and
   *  separates them with a merged label row, so "where does this block end"
   *  needs this as well as "where is the first blank". */
  mergedRefs() {
    if (this._merged) return this._merged;
    const set = new Set();
    for (const m of this.xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
      const a = parseRef(m[1]), b = parseRef(m[2]);
      if (!a || !b) continue;
      for (let r = a.row; r <= b.row; r++) {
        for (let c = a.col; c <= b.col; c++) set.add(cellRef(r, c));
      }
    }
    this._merged = set;
    return set;
  }

  isMerged(row, col) {
    return this.mergedRefs().has(cellRef(row, col));
  }

  /** Last row index that has any cell, for append-style sheets. */
  maxRow() {
    let max = 0;
    for (const m of this.xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
    return max;
  }

  maxCol() {
    let max = 0;
    for (const ref of Object.keys(this.cells())) {
      const p = parseRef(ref);
      if (p && p.col > max) max = p.col;
    }
    return max;
  }
}

/* ---------------------------------------------------------------- dates */

function excelSerialToDate(serial) {
  // Excel's 1900 system, including its deliberate 1900-leap-year bug
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

function dateToExcelSerial(d) {
  return d.getTime() / 86400000 + 25569;
}

if (typeof module !== "undefined") {
  module.exports = { XlsxPatcher, SheetPatcher, cellRef, parseRef, colToLetters, lettersToCol };
}
