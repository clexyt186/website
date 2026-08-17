/*
EGGSACT Worker - autocorrect + flagging (JS port of the desktop's autocorrect.py)

Same idea as the desktop: reject-reason typos get quietly standardized to a
canonical term when confident, and flagged for confirmation when not. Terms
mirror config.json's autocorrect.reason_terms - if you add terms there,
add them here too (REASON_TERMS below) to keep both apps in sync.

Also ports the desktop's average-weight bounds and the standard-deviation
outlier check, so the SAME kind of flagging happens whether someone's
typing into the desktop app or the phone. One real difference, worth being
upfront about: the desktop's SD check compares against the WHOLE house's
history in the master file; this one can only compare against what THIS
DEVICE has captured locally (it has no access to the full master file
without a server round-trip) - fewer points, a rougher signal, but still
catches an obviously-wrong value like an 8g egg.
*/

const AVG_WEIGHT_MIN = 45;   // grams - matches config.json's judi_profile.min_avg_weight
const AVG_WEIGHT_MAX = 75;   // matches judi_profile.max_avg_weight
const SD_FLAG_THRESHOLD = 2; // matches judi_profile.sd_flag_threshold
const SD_MIN_HISTORY = 10;   // matches engine.py's sd_check - need this many local points before judging

const REASON_TERMS = {
  "dirty":     ["dirty", "dinty", "drty", "diry", "dirt"],
  "rough":     ["rough", "ruff", "rgh", "rouh", "rough shell"],
  "deformed":  ["deformed", "deform", "defrmed", "misshapen", "deformd"],
  "mem":       ["mem", "membrane", "membrain", "memb", "membraine", "menbrane"],
  "soft":      ["soft", "softshell", "soft shell", "sft", "soft-shell"],
  "too small": ["too small", "to small", "small", "smal", "tsmall", "2 small"],
  "too big":   ["too big", "to big", "big", "tbig", "2 big", "large"],
  "NW":        ["nw", "not weighed", "notweighed", "no weigh", "not weight", "n/w"],
  "broken":    ["broken", "brokn", "brkn", "broke", "cracked", "crack", "brokrn"],
  "blood":     ["blood", "bloody", "blood spot", "bloodspot"],
};

const VARIANT_INDEX = {};
for (const [canonical, variants] of Object.entries(REASON_TERMS)) {
  VARIANT_INDEX[canonical.toLowerCase()] = canonical;
  for (const v of variants) VARIANT_INDEX[v.toLowerCase()] = canonical;
}
const VARIANTS_SORTED = Object.keys(VARIANT_INDEX).sort((a, b) => b.length - a.length);

/** Simple Levenshtein distance -> similarity ratio in [0,1], same spirit as Python's difflib.get_close_matches. */
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  const dist = dp[a.length][b.length];
  return 1 - dist / Math.max(a.length, b.length);
}

function matchWord(token, cutoff = 0.72) {
  const t = token.trim().toLowerCase();
  if (!t) return { canonical: null, confident: true };
  if (VARIANT_INDEX[t]) return { canonical: VARIANT_INDEX[t], confident: true };
  let best = null, bestScore = 0;
  for (const v of VARIANTS_SORTED) {
    const s = similarity(t, v);
    if (s > bestScore) { bestScore = s; best = v; }
  }
  if (best && bestScore >= cutoff) return { canonical: VARIANT_INDEX[best], confident: true };
  return { canonical: token.trim(), confident: false };
}

function standardizePart(part) {
  part = part.trim();
  if (!part) return { text: "", uncertain: [] };
  const m = part.match(/^(\d+)\s*(.*)$/);
  let count = null, rest = part;
  if (m) { count = m[1]; rest = m[2].trim(); }

  const words = rest.split(/\s+/).filter(Boolean);
  const canonWords = []; const uncertain = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (const span of [3, 2, 1]) {
      if (i + span <= words.length) {
        const phrase = words.slice(i, i + span).join(" ").toLowerCase();
        if (VARIANT_INDEX[phrase]) { canonWords.push(VARIANT_INDEX[phrase]); i += span; matched = true; break; }
      }
    }
    if (matched) continue;
    const { canonical, confident } = matchWord(words[i]);
    if (canonical) canonWords.push(canonical);
    if (!confident) uncertain.push(words[i]);
    i += 1;
  }
  const body = canonWords.length ? canonWords.join(" ") : rest;
  const out = (count ? `${count} ${body}` : body).trim();
  return { text: out, uncertain };
}

/** Returns {text, uncertain} - same contract as the desktop's standardize_reason. */
function standardizeReason(text) {
  if (!text || !String(text).trim()) return { text: text || "", uncertain: [] };
  const parts = String(text).split(",");
  const outParts = []; const uncertain = [];
  for (const p of parts) {
    const { text: s, uncertain: u } = standardizePart(p);
    if (s) outParts.push(s);
    uncertain.push(...u);
  }
  return { text: outParts.join(", "), uncertain };
}

/** Average-weight bounds check - matches the desktop's warning exactly. */
function checkAvgWeight(eggs, weight) {
  if (!eggs || !weight) return null;
  const avg = weight / eggs;
  if (avg < AVG_WEIGHT_MIN || avg > AVG_WEIGHT_MAX) {
    return `Average weight ${avg.toFixed(2)}g is outside the normal ${AVG_WEIGHT_MIN}-${AVG_WEIGHT_MAX}g range.`;
  }
  return null;
}

/** Mean/stddev outlier check against this DEVICE's own local history for
 * this house+type+field. Needs SD_MIN_HISTORY points before it judges
 * anything - same "don't flag on too little data" rule the desktop uses. */
function checkOutlier(history, value, label) {
  if (typeof value !== "number" || history.length < SD_MIN_HISTORY) return null;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null;
  if (Math.abs(value - mean) > SD_FLAG_THRESHOLD * sd) {
    return `${label} ${value} is more than ${SD_FLAG_THRESHOLD} standard deviations from this device's recent average (${mean.toFixed(1)} ± ${sd.toFixed(1)}).`;
  }
  return null;
}

if (typeof module !== "undefined") {
  module.exports = { standardizeReason, checkAvgWeight, checkOutlier, similarity, matchWord };
}
