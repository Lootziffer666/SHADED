// SHADED Style Discovery — PreferenceModel (renderer-unabhängiger Kern).
//
// Leichtgewichtig, deterministisch, inspizierbar: pro STYLE_DIMENSIONS-Eintrag
// ein Score + Beobachtungszahl + Konfidenz. Kategoriale Dimensionen laufen
// über ein Elo-artiges Paarupdate zwischen den beiden gesehenen Optionen;
// kontinuierliche Dimensionen über einen gewichteten Online-Mittelwert plus
// Varianz (Welford). Ein einzelner Vote bewegt die Schätzung nur leicht —
// keine Dimension wird durch einen Vote zur Absolutregel.

import { STYLE_DIMENSIONS, dimensionByKey, getDimension } from './style-profile.js';

const ELO_K = 24;
const ELO_INITIAL = 1000;

function newCategoricalState(dim) {
  const options = {};
  for (const opt of dim.options) options[opt] = ELO_INITIAL;
  return { kind: 'categorical', options, observations: 0 };
}

function newContinuousState() {
  return { kind: 'continuous', mean: null, m2: 0, observations: 0 };
}

export class PreferenceModel {
  constructor(state) {
    this.state = state || {};
    for (const dim of STYLE_DIMENSIONS) {
      if (!this.state[dim.key]) {
        this.state[dim.key] = dim.kind === 'categorical' ? newCategoricalState(dim) : newContinuousState();
      } else if (dim.kind === 'categorical') {
        // Hydrate options a saved state predates (e.g. restored from localStorage before
        // 'cellular'/'iridescent' existed as STYLE_DIMENSIONS choices) -- the dimension key
        // itself is already present so the branch above never runs, but s.options is
        // missing the new option entirely. A later vote comparing against it would read
        // undefined, produce NaN through the Elo update, and persist NaN (serialized as
        // null), silently corrupting that entry from then on.
        const options = this.state[dim.key].options;
        for (const opt of dim.options) {
          if (!(opt in options)) options[opt] = ELO_INITIAL;
        }
      }
    }
  }

  // vote: { a: StyleProfile, b: StyleProfile, winner: 'a' | 'b' | 'tie' }
  update(vote) {
    for (const dim of STYLE_DIMENSIONS) {
      const va = getDimension(vote.a, dim.key);
      const vb = getDimension(vote.b, dim.key);
      if (dim.kind === 'categorical') {
        if (va === vb) continue;
        this._updateCategorical(dim.key, va, vb, vote.winner);
      } else {
        if (Math.abs(va - vb) < 1e-9) continue;
        this._updateContinuous(dim.key, va, vb, vote.winner);
      }
    }
    return this;
  }

  _updateCategorical(key, optA, optB, winner) {
    const s = this.state[key];
    s.observations += 1;
    const ra = s.options[optA];
    const rb = s.options[optB];
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    const eb = 1 - ea;
    const sa = winner === 'a' ? 1 : winner === 'b' ? 0 : 0.5;
    const sb = 1 - sa;
    s.options[optA] = ra + ELO_K * (sa - ea);
    s.options[optB] = rb + ELO_K * (sb - eb);
  }

  _updateContinuous(key, va, vb, winner) {
    const s = this.state[key];
    const preferred = winner === 'a' ? va : winner === 'b' ? vb : (va + vb) / 2;
    s.observations += 1;
    if (s.mean === null) s.mean = preferred;
    const n = s.observations;
    const delta = preferred - s.mean;
    s.mean += delta / n;
    const delta2 = preferred - s.mean;
    s.m2 += delta * delta2;
  }

  observations(key) {
    return this.state[key].observations;
  }

  // Aktuell bevorzugter Wert der Dimension (bester Elo-Score bzw. laufender
  // Mittelwert). Fällt auf einen deterministischen Default zurück, solange
  // es noch keine Beobachtung gibt.
  estimate(key) {
    const s = this.state[key];
    if (s.kind === 'categorical') {
      let best = null;
      let bestScore = -Infinity;
      for (const opt of Object.keys(s.options)) {
        if (s.options[opt] > bestScore) { bestScore = s.options[opt]; best = opt; }
      }
      return best;
    }
    if (s.mean !== null) return s.mean;
    const dim = dimensionByKey(key);
    return (dim.min + dim.max) / 2;
  }

  // 0 = sicher, 1 = maximal unsicher. Sinkt monoton mit mehr, konsistenteren
  // Beobachtungen; bleibt hoch, solange Optionen/Werte noch nicht getrennt sind.
  uncertainty(key) {
    const s = this.state[key];
    if (s.observations === 0) return 1;
    if (s.kind === 'categorical') {
      const scores = Object.values(s.options);
      const spread = Math.max(...scores) - Math.min(...scores);
      const obsFactor = 1 / (1 + s.observations);
      const spreadFactor = 1 / (1 + spread / 200);
      return Math.max(obsFactor, spreadFactor);
    }
    if (s.observations < 2) return 1;
    const variance = s.m2 / (s.observations - 1);
    const dim = dimensionByKey(key);
    const range = dim.max - dim.min || 1;
    const varFactor = Math.min(1, Math.sqrt(variance) / (range / 2));
    const obsFactor = 1 / (1 + s.observations);
    return Math.max(varFactor * 0.85, obsFactor);
  }

  confidence(key) {
    return 1 - this.uncertainty(key);
  }

  explain(key) {
    const s = this.state[key];
    const detail = s.kind === 'categorical' ? { ...s.options } : { mean: s.mean, variance: s.observations > 1 ? s.m2 / (s.observations - 1) : null };
    return {
      key,
      kind: s.kind,
      observations: s.observations,
      estimate: this.estimate(key),
      uncertainty: this.uncertainty(key),
      confidence: this.confidence(key),
      detail,
    };
  }

  // Dimensionen sortiert nach absteigender Unsicherheit (für pair-selection).
  rankedByUncertainty() {
    return STYLE_DIMENSIONS.map((d) => d.key).sort((a, b) => {
      const ua = this.uncertainty(a);
      const ub = this.uncertainty(b);
      if (ua !== ub) return ub - ua;
      return a.localeCompare(b); // deterministischer Tie-Break
    });
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.state));
  }

  static fromJSON(state) {
    return new PreferenceModel(JSON.parse(JSON.stringify(state)));
  }
}
