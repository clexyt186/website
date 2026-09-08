/*
EGGSACT Worker - house templates

WHAT CHANGED
These used to be base64 blobs inside this file. Once the templates carried
the full weekly rollup and FCR chain they came to ~500 KB each, which is
~1.7 MB of JavaScript that every phone re-downloads and re-parses on every
app update. They are now real .xlsx files under templates/, listed in the
service worker's shell, so they are cached once and work offline exactly the
same way - and replacing a template is replacing a file, not regenerating a
blob.

DATE COVERAGE - THE REASON FOR v4
A template can only hold a date it has a column for; master.js deliberately
never invents one. The v3 templates were built from the rebuilt masters,
which start at the trial's week 1 (1 November), so anything captured BEFORE
that date had nowhere to go - Eggs and Feed silently failed to place while
Weights and Deaths worked, because those two need no date column.

The template is a capture surface, not the trial's calendar. It now runs
03 Aug 2026 to 11 Apr 2027, so today's captures land and the whole November
trial is covered. The MASTER still starts at week 1 on 1 November - that is
the trial's own numbering and it is unchanged.

WHAT A TEMPLATE IS
The house workbook with nothing captured in it: every day column, every
weekly rollup, all 192 pens with their treatment numbers, the body-weight
grid, and the monthly sampling sheets. Someone with no access to the real
master still gets a complete, correct layout to write into.

"Load latest" replaces a template with the real master and never the other
way round - see the isTemplate check below.
*/

const TEMPLATE_FILES = {
  "House Nketlwane": "templates/Nketlwane.xlsx",
  "House Tsholanang": "templates/Tsholanang.xlsx",
  "House Judi": "templates/Judi.xlsx",
};

/*
Bump this whenever the template files change. A phone that already had a
template stored would otherwise keep it forever: ensureTemplatesInstalled()
used to skip any house that had ANY workbook stored, so an existing device
took every code update and still held the old layout.
*/
const TEMPLATE_VERSION = 4;

/**
 * Ensures every house this device can reach has a usable stored workbook.
 *
 * Rules, in order:
 *   - a REAL master (isTemplate === false) is never touched. Load latest wins.
 *   - a template already at the current version is left alone.
 *   - anything else is fetched and stored.
 *
 * A workbook stored by a build older than v2 has no isTemplate flag at all,
 * so it cannot be told apart from a real master. Those are replaced once, on
 * migration. Nothing is lost by that: captured entries live in a separate
 * store and are untouched, and a real master is one tap of "Load latest"
 * away.
 *
 * A fetch failure is not fatal - the person keeps whatever they had and the
 * next launch tries again.
 */
async function ensureTemplatesInstalled(houseAccess) {
  const houses = (houseAccess && houseAccess.length ? houseAccess : Object.keys(TEMPLATE_FILES));
  let stamped = null;
  try { stamped = await DB.getMeta("templatesVersion"); } catch (e) {}
  const migrating = Number(stamped || 0) < TEMPLATE_VERSION;
  let installed = 0;

  for (const h of houses) {
    if (!TEMPLATE_FILES[h]) continue;
    let held = null;
    try { held = await DB.getMaster(h); } catch (e) { held = null; }

    if (held) {
      if (held.isTemplate === false) continue;                              // real master
      if (held.isTemplate === true &&
          Number(held.templateVersion || 0) >= TEMPLATE_VERSION) continue;  // current
      if (held.isTemplate === undefined && !migrating) continue;            // already migrated
    }

    try {
      const resp = await fetch(TEMPLATE_FILES[h], { cache: "no-cache" });
      if (!resp.ok) throw new Error(`server returned ${resp.status}`);
      const buf = await resp.arrayBuffer();
      if (!buf || buf.byteLength < 1000) throw new Error("empty template file");
      await DB.putMaster(h, buf, true, TEMPLATE_VERSION);
      installed++;
    } catch (e) {
      console.warn("template install failed for", h, e);
    }
  }

  if (migrating && installed) {
    try { await DB.setMeta("templatesVersion", TEMPLATE_VERSION); } catch (e) {}
  }
  return installed;
}

if (typeof module !== "undefined") {
  module.exports = { TEMPLATE_FILES, TEMPLATE_VERSION, ensureTemplatesInstalled };
}
