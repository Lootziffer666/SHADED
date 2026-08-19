// SHADED Spatial Kernel — QualityBudget (spec §13/§14, TripoSplat/LiTo donor).
//
// The world is one truth; only its representation changes with the device.
// This module defines device presets and a budget model. It does NOT hardcode
// specific GPUs as product logic — profiles are data, benchmark-tunable.

export const QUALITY = Object.freeze({
  GOLD: 'GOLD', DESKTOP: 'DESKTOP', BROWSER: 'BROWSER', MOBILE: 'MOBILE',
});

// Resource ceilings per profile. Values are orders of magnitude; tune by
// benchmark (spec §14: "Benchmark and determine presets").
export const BUDGET_PRESETS = Object.freeze({
  GOLD:    { pointCount: 50_000_000, triangles: 20_000_000, textureRes: 4096, voxelRes: 512, activeChunks: 2048, shaderComplexity: 1.0, simRate: 60, particles: 200_000, shadowQuality: 1.0 },
  DESKTOP: { pointCount: 12_000_000, triangles: 4_000_000,  textureRes: 2048, voxelRes: 256, activeChunks: 512,  shaderComplexity: 0.8, simRate: 60, particles: 60_000,  shadowQuality: 0.8 },
  BROWSER: { pointCount: 3_000_000,  triangles: 1_000_000,  textureRes: 1024, voxelRes: 128, activeChunks: 128,  shaderComplexity: 0.5, simRate: 30, particles: 20_000,  shadowQuality: 0.5 },
  MOBILE:  { pointCount: 600_000,    triangles: 250_000,    textureRes: 512,  voxelRes: 64,  activeChunks: 32,   shaderComplexity: 0.3, simRate: 20, particles: 5_000,   shadowQuality: 0.25 },
});

export class QualityBudget {
  constructor(profile = QUALITY.BROWSER) {
    this.profile = profile;
    this.limits = { ...BUDGET_PRESETS[profile] };
  }

  static detect(defaultProfile = QUALITY.BROWSER) {
    // Heuristic only; in a browser this can read deviceMemory / hardwareConcurrency.
    const nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (nav && nav.userAgent && /Mobi|Android/i.test(nav.userAgent)) return QUALITY.MOBILE;
    const mem = nav && nav.deviceMemory ? nav.deviceMemory : 8;
    if (mem <= 4) return QUALITY.MOBILE;
    if (mem <= 8) return QUALITY.BROWSER;
    return defaultProfile === QUALITY.GOLD ? QUALITY.GOLD : QUALITY.DESKTOP;
  }

  setProfile(p) { this.profile = p; this.limits = { ...BUDGET_PRESETS[p] }; return this; }

  // Is a usage object within budget? Returns { ok, over: {field: deficit} }.
  within(usage = {}) {
    const over = {};
    for (const k of Object.keys(this.limits)) {
      const u = usage[k];
      if (u != null && u > this.limits[k]) over[k] = u - this.limits[k];
    }
    return { ok: Object.keys(over).length === 0, over };
  }

  // Pick the highest-quality representation (from candidate list ordered
  // best→worst) whose cost estimate fits the budget.
  fit(candidates) {
    for (const c of candidates) {
      const { ok } = this.within(c.cost || {});
      if (ok) return c;
    }
    return candidates.length ? candidates[candidates.length - 1] : null; // worst fallback
  }
}
