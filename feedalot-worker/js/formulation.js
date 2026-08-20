/*
CLEVITA FeedAlot Worker - ration builder (JS port of formulation.py).
Same ingredients, same values, same risk-warning thresholds as desktop -
cross-checked to match exactly, not independently re-derived.
*/

const CATEGORIES = ["roughage", "energy", "protein", "minerals"];

const INGREDIENTS = {
  "Teff hay": { category: "roughage", me: 7.5, cp: 6.0 },
  "Eragrostis hay": { category: "roughage", me: 7.8, cp: 6.5 },
  "Lucerne hay": { category: "roughage", me: 9.0, cp: 18.0 },
  "Maize silage": { category: "roughage", me: 10.5, cp: 8.0 },
  "Wheat straw": { category: "roughage", me: 6.0, cp: 3.5 },

  "Maize meal": { category: "energy", me: 13.0, cp: 9.0 },
  "Molasses meal": { category: "energy", me: 12.5, cp: 4.0 },
  "HPC 82": { category: "energy", me: 10.5, cp: 82.0, estimated: true },
  "Hominy chop": { category: "energy", me: 13.5, cp: 10.0 },
  "Wheat bran": { category: "energy", me: 10.5, cp: 15.0 },

  "Soyabean oilcake": { category: "protein", me: 13.0, cp: 44.0 },
  "Sunflower oilcake": { category: "protein", me: 9.5, cp: 32.0 },
  "Canola oilcake": { category: "protein", me: 11.5, cp: 36.0 },
  "Cottonseed oilcake": { category: "protein", me: 10.0, cp: 38.0 },
  "Fishmeal": { category: "protein", me: 13.5, cp: 62.0 },

  "Salt": { category: "minerals", me: 0, cp: 0 },
  "Feed lime": { category: "minerals", me: 0, cp: 0 },
  "Ammonium sulphate": { category: "minerals", me: 0, cp: 0 },
  "Mineral premix": { category: "minerals", me: 0, cp: 0 },
  "Urea": { category: "minerals", me: 0, cp: 281.0 },
};

const CATEGORY_LABELS = { roughage: "Roughage", energy: "Energy", protein: "Protein", minerals: "Minerals / Additives" };

function ingredientsByCategory() {
  const out = {}; for (const c of CATEGORIES) out[c] = [];
  for (const [name, info] of Object.entries(INGREDIENTS)) out[info.category].push(name);
  return out;
}

/** mix: {name: kg}. Same thresholds as formulation.py, cross-checked to match. */
function calculateRation(mix, prices) {
  const names = Object.keys(mix);
  const totalKg = names.reduce((a, n) => a + mix[n], 0);
  if (totalKg <= 0) throw new Error("Add at least some kg to at least one ingredient.");

  let totalMe = 0, totalCpKg = 0, totalCost = 0;
  let roughageKg = 0, energyKg = 0, proteinKg = 0, saltKg = 0, ureaKg = 0;

  for (const name of names) {
    const kg = mix[name];
    const info = INGREDIENTS[name];
    if (!info) throw new Error(`'${name}' isn't a known ingredient.`);
    totalMe += kg * info.me;
    totalCpKg += kg * (info.cp / 100);
    totalCost += kg * (prices[name] || 0);
    if (info.category === "roughage") roughageKg += kg;
    else if (info.category === "energy") energyKg += kg;
    else if (info.category === "protein") proteinKg += kg;
    if (name === "Salt") saltKg += kg;
    if (name === "Urea") ureaKg += kg;
  }

  const roughagePct = roughageKg / totalKg;
  const concentratePct = (energyKg + proteinKg) / totalKg;
  const saltPct = saltKg / totalKg;
  const ureaPct = ureaKg / totalKg;

  const warnings = [];
  if (roughagePct < 0.15) {
    warnings.push(`Roughage is only ${(roughagePct * 100).toFixed(0)}% of this batch - real acidosis risk. Add more roughage or cut back the grain/concentrate side.`);
  } else if (roughagePct > 0.55) {
    warnings.push(`Roughage is ${(roughagePct * 100).toFixed(0)}% of this batch - quite high. Animals may not get enough energy to finish well; consider more concentrate.`);
  }
  if (concentratePct > 0.80) {
    warnings.push(`Grain/concentrate is ${(concentratePct * 100).toFixed(0)}% of this batch - high acidosis risk. Make sure animals are properly adapted before feeding this much, or add more roughage.`);
  }
  if (saltPct > 0.02) {
    warnings.push(`Salt is ${(saltPct * 100).toFixed(1)}% of this batch - that's more than usual (typically under 1-2%). Double check this amount.`);
  }
  if (ureaPct > 0) {
    warnings.push(`This batch includes urea (${(ureaPct * 100).toFixed(2)}% of total) - a real poisoning risk if introduced too fast or overdosed. Never exceed the supplier's guidance, and introduce gradually with plenty of roughage.`);
  }

  return {
    totalKg: Math.round(totalKg * 10) / 10,
    avgMe: Math.round((totalMe / totalKg) * 100) / 100,
    avgCp: Math.round((totalCpKg / totalKg) * 100 * 100) / 100,
    roughagePct: Math.round(roughagePct * 1000) / 10,
    concentratePct: Math.round(concentratePct * 1000) / 10,
    totalCost: Math.round(totalCost * 100) / 100,
    costPerKg: Math.round((totalCost / totalKg) * 100) / 100,
    warnings,
  };
}

if (typeof module !== "undefined") {
  module.exports = { INGREDIENTS, CATEGORIES, CATEGORY_LABELS, ingredientsByCategory, calculateRation };
}
