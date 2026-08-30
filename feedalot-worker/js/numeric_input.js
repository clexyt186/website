/*
CLEVITA FeedAlot Worker - forgiving number parsing (JS port of the
desktop's numeric_input.py, same tested comma-for-decimal-point fix).
*/

function parseNumber(text, integer) {
  if (text === null || text === undefined) return null;
  let s = String(text).trim();
  if (!s) return null;   // guards Number("") returning 0 instead of "not a number"
  // replaceAll, not replace: String.replace with a plain string only swaps
  // the FIRST match, so "1,234,5" became "1.234,5" and then NaN.
  s = s.replace(/,/g, ".");
  const val = Number(s);   // strict - unlike parseFloat, rejects "32.5.5" instead of truncating it
  if (isNaN(val)) return null;
  return integer ? Math.round(val) : val;
}

if (typeof module !== "undefined") module.exports = { parseNumber };
