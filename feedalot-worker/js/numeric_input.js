/*
CLEVITA FeedAlot Worker - forgiving number parsing (JS port of the
desktop's numeric_input.py, same tested comma-for-decimal-point fix).
*/

function parseNumber(text, integer) {
  if (text === null || text === undefined) return null;
  let s = String(text).trim();
  if (!s) return null;   // guards Number("") returning 0 instead of "not a number"
  s = s.replace(",", ".");
  const val = Number(s);   // strict - unlike parseFloat, rejects "32.5.5" instead of truncating it
  if (isNaN(val)) return null;
  return integer ? Math.round(val) : val;
}

if (typeof module !== "undefined") module.exports = { parseNumber };
