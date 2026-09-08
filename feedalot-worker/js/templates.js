/*
CLEVITA FeedAlot Worker - group templates

Each group's blank workbook, identical in structure to the real Group 5:
all 211 feed-ledger formulas and all 65 merged ranges intact, with every
captured value cleared. Verified 211/65 on each of the five.

Served as real .xlsx files rather than base64 inside this script, so the
service worker caches them once and replacing a template is replacing a
file. Offline behaviour is unchanged - they are part of the cached shell.

Groups 1-4 also have the sheep ID column cleared, because Group 5's sheep
are not theirs. Group 5 keeps its IDs. See the note in DOMAINS/README about
what that means for the Weighing tab.
*/

const TEMPLATE_FILES = {
  "Group 1": "templates/Group_1.xlsx",
  "Group 2": "templates/Group_2.xlsx",
  "Group 3": "templates/Group_3.xlsx",
  "Group 4": "templates/Group_4.xlsx",
  "Group 5 - Merino Mob": "templates/Group_5.xlsx",
};

const TEMPLATE_VERSION = 3;

/**
 * Ensures this group has a usable stored workbook.
 *   - a REAL group file (isTemplate === false) is never touched.
 *   - a template already at the current version is left alone.
 *   - anything else is fetched and stored.
 * A fetch failure is not fatal: the person keeps what they had and the next
 * launch tries again.
 */
async function ensureFeedalotTemplate(group) {
  if (!TEMPLATE_FILES[group]) return 0;
  let held = null;
  try { held = await DB.getMaster(group); } catch (e) { held = null; }

  let stamped = null;
  try { stamped = await DB.getMeta("templatesVersion"); } catch (e) {}
  const migrating = Number(stamped || 0) < TEMPLATE_VERSION;

  if (held) {
    if (held.isTemplate === false) return 0;
    if (held.isTemplate === true &&
        Number(held.templateVersion || 0) >= TEMPLATE_VERSION) return 0;
    if (held.isTemplate === undefined && !migrating) return 0;
  }

  try {
    const resp = await fetch(TEMPLATE_FILES[group], { cache: "no-cache" });
    if (!resp.ok) throw new Error(`server returned ${resp.status}`);
    const buf = await resp.arrayBuffer();
    if (!buf || buf.byteLength < 1000) throw new Error("empty template file");
    await DB.putMaster(group, buf, true, TEMPLATE_VERSION);
    if (migrating) {
      try { await DB.setMeta("templatesVersion", TEMPLATE_VERSION); } catch (e) {}
    }
    return 1;
  } catch (e) {
    console.warn("template install failed for", group, e);
    return 0;
  }
}

if (typeof module !== "undefined") {
  module.exports = { TEMPLATE_FILES, TEMPLATE_VERSION, ensureFeedalotTemplate };
}
