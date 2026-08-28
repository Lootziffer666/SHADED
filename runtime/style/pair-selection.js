// SHADED Style Discovery — pair-selection (renderer-unabhängiger Kern).
//
// Adaptive, deterministische Paarauswahl: die aktuell unsicherste Dimension
// wird zuerst geprüft, alle anderen Dimensionen bleiben auf der aktuellen
// Bestschätzung konstant (Isolation ist damit der Normalfall, nicht ein
// Sondermodus). Periodisch wird stattdessen eine bereits „sichere“ Annahme
// erneut getestet. Wiederholte Dimensionen innerhalb eines kurzen Fensters
// werden gedämpft. Die A/B-Seitenzuweisung wechselt strikt pro Runde, damit
// aus einer Bildschirmpositions-Präferenz nie eine gelernte Stilvorliebe wird.

import { STYLE_DIMENSIONS, dimensionByKey, defaultStyleProfile, setDimension, getDimension } from './style-profile.js';

const RETEST_PERIOD = 5;
const REPEAT_WINDOW = 4;

function baselineProfile(model, id) {
  const profile = defaultStyleProfile(id, id);
  for (const dim of STYLE_DIMENSIONS) {
    const [group, field] = dim.key.split('.');
    profile[group][field] = model.estimate(dim.key);
  }
  return profile;
}

// Deterministischer Alternativwert für die isolierte Dimension: kategorial
// rotiert rundenbasiert durch die übrigen Optionen; kontinuierlich springt um
// einen rundenabhängigen Bruchteil des halben Wertebereichs (reflektiert an
// den Grenzen), damit derselbe Seed immer dieselbe Sequenz liefert.
function alternateValue(dim, currentValue, round) {
  if (dim.kind === 'categorical') {
    const others = dim.options.filter((o) => o !== currentValue);
    if (others.length === 0) return currentValue;
    return others[round % others.length];
  }
  const half = (dim.max - dim.min) / 2;
  const fracs = [0.6, -0.6, 0.35, -0.35];
  let v = currentValue + fracs[round % fracs.length] * half;
  if (v < dim.min || v > dim.max) v = currentValue - fracs[round % fracs.length] * half;
  v = Math.max(dim.min, Math.min(dim.max, v));
  if (dim.step) v = Math.round(v / dim.step) * dim.step;
  if (Math.abs(v - currentValue) < 1e-9) v = currentValue === dim.max ? dim.min : dim.max;
  return v;
}

// state: { model: PreferenceModel, round: number, history: Array<{isolatedDimension}> }
export function selectPair({ model, round = 0, history = [] }) {
  const ranked = model.rankedByUncertainty();
  const isRetest = round > 0 && round % RETEST_PERIOD === 0;
  let dimension = isRetest ? ranked[ranked.length - 1] : ranked[0];

  const recentDims = history.slice(-REPEAT_WINDOW).map((h) => h.isolatedDimension);
  if (recentDims.includes(dimension)) {
    const ordered = isRetest ? [...ranked].reverse() : ranked;
    const alt = ordered.find((key) => !recentDims.includes(key));
    if (alt) dimension = alt;
  }

  const dim = dimensionByKey(dimension);
  const baseline = baselineProfile(model, `baseline-r${round}`);
  const currentValue = getDimension(baseline, dimension);
  const altValue = alternateValue(dim, currentValue, round);
  const variant = setDimension(baseline, dimension, altValue);
  variant.id = `variant-r${round}`;
  variant.name = variant.id;

  const baselineIsA = round % 2 === 0;
  const a = baselineIsA ? baseline : variant;
  const b = baselineIsA ? variant : baseline;

  const reason = isRetest
    ? `Periodischer Re-Test: „${dimension}“ galt als sicher genug (Konfidenz ${model.confidence(dimension).toFixed(2)}), wird zur Kontrolle erneut geprüft.`
    : `„${dimension}“ ist aktuell die unsicherste Dimension (Konfidenz ${model.confidence(dimension).toFixed(2)}) — alle anderen Dimensionen bleiben auf der aktuellen Bestschätzung konstant.`;

  return { a, b, reason, isolatedDimension: dimension, round, isRetest };
}
