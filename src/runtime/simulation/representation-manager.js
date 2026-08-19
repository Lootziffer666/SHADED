// SHADED Spatial Kernel — RepresentationManager (spec §13).
//
// One world entity may expose several representations (points, point cloud,
// block mesh, optimized mesh, SDF mesh, 3D Gaussian, billboard, photo patch).
// Each carries quality + cost estimates + provenance + fallback. The manager
// picks the representation that fits the active QualityBudget. The world truth
// is unchanged — only the representation varies.
//
// Pure, dependency-free.

import { QUALITY, QualityBudget } from './quality-budget.js';

export class RepresentationManager {
  constructor(opts = {}) {
    this.budget = opts.budget || new QualityBudget(opts.profile || QUALITY.BROWSER);
    // entityId -> array of { kind, quality, source, bounds, cost, provenance, fallback, ref }
    this.reps = new Map();
  }

  // Register a representation for an entity. `quality` ∈ QUALITY (best first).
  // `cost` is an estimate object matching budget fields.
  register(entityId, rep) {
    if (!this.reps.has(entityId)) this.reps.set(entityId, []);
    this.reps.get(entityId).push({
      kind: rep.kind,
      quality: rep.quality || QUALITY.BROWSER,
      source: rep.source || null,
      bounds: rep.bounds || null,
      cost: rep.cost || {},
      provenance: rep.provenance || null,
      fallback: rep.fallback || false,
      ref: rep.ref || null,
    });
    return this;
  }

  list(entityId) { return this.reps.get(entityId) || []; }

  // Highest-quality representation for an entity that fits the budget.
  pick(entityId) {
    const rs = this.reps.get(entityId);
    if (!rs || !rs.length) return null;
    // order best-quality first
    const ordered = [...rs].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    const fit = this.budget.fit(ordered);
    if (fit) return fit;
    // even the cheapest exceeds budget: return the cheapest anyway (fallback)
    return ordered[ordered.length - 1];
  }

  // All entities' chosen representations under the current budget.
  resolveAll() {
    const out = {};
    for (const id of this.reps.keys()) out[id] = this.pick(id);
    return out;
  }

  setBudget(profileOrBudget) {
    if (typeof profileOrBudget === 'string') this.budget.setProfile(profileOrBudget);
    else if (profileOrBudget instanceof QualityBudget) this.budget = profileOrBudget;
    return this;
  }
}

function qualityRank(q) {
  return { GOLD: 3, DESKTOP: 2, BROWSER: 1, MOBILE: 0 }[q] ?? 0;
}
