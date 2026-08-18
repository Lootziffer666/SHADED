// SHADED Spatial Kernel — PhotoFirstRecipe (spec §16).
//
// Turns a photo (+ calibration) into GeometryObservation(s) and ingests them.
// It depends on the kernel contract, NOT on the old SpatialSystemIntegrator —
// that is the inversion. Depth comes from a real provider; if none is present
// and fallback is disabled (default), the recipe reports failure instead of
// inventing depth (spec: do not fake provider output).
//
// In the browser, `provider` is a wrapper around MonocularDepthProvider. In
// tests, an honest stub provider is injected.

import { GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE } from '../observation.js';

export class PhotoFirstRecipe {
  constructor(opts = {}) {
    // A provider implementing provide(input) -> { ok, depth, confidence, camera, ... }.
    // May be null (then fallback must be explicitly allowed to yield anything).
    this.provider = opts.provider || null;
    this.providerName = opts.providerName || (this.provider && this.provider.name) || 'unknown';
    this.allowFallback = opts.allowFallback ?? false;
    this.name = 'photo-first';
  }

  onManagerReady() { /* no-op for now */ }

  // Build a camera descriptor from calibration, filling sensible defaults.
  _buildCamera(calibration = {}) {
    return {
      intrinsics: calibration.intrinsics || null,
      extrinsics: calibration.extrinsics || null,
      fx: calibration.fx ?? null,
      fy: calibration.fy ?? null,
      cx: calibration.cx ?? (calibration.width ? calibration.width / 2 : null),
      cy: calibration.cy ?? (calibration.height ? calibration.height / 2 : null),
      width: calibration.width ?? null,
      height: calibration.height ?? null,
      fov: calibration.fov ?? 60,
      principalPoint: calibration.principalPoint ?? [0.5, 0.5],
      lens: calibration.lens ?? { k1: 0, k2: 0 },
      pose: calibration.pose ?? null,
    };
  }

  async run(kernel, input = {}, opts = {}) {
    const allowFallback = opts.allowFallback ?? this.allowFallback;
    const calibration = input.calibration || {};

    // 1) Camera from calibration (or from a passed provider result).
    const camera = this._buildCamera(calibration);

    // 2) Depth source.
    let depth = null, confidence = null, provenanceClass = OBS_PROVENANCE.INFERRED, providerMeta = null;

    if (input.providerResult) {
      // Already a v1 provider result — adapt directly.
      const obs = GeometryObservation.fromProviderResult(input.providerResult, {
        sourceType: SOURCE_TYPE.PHOTO, id: input.id,
      });
      const res = kernel.ingest(obs);
      return { ok: res.ok, id: obs.id, simulated: res.simulated, warnings: res.warnings, errors: res.errors };
    }

    if (this.provider) {
      let prov;
      try {
        prov = await this.provider.provide(input);
      } catch (err) {
        return { ok: false, error: `depth provider failed: ${err && err.message || err}` };
      }
      if (!prov || prov.ok === false) {
        return { ok: false, error: prov && prov.error ? prov.error : 'depth provider returned no result' };
      }
      depth = prov.depth || null;
      confidence = prov.confidence || null;
      if (prov.camera) Object.assign(camera, prov.camera);
      provenanceClass = OBS_PROVENANCE.INFERRED;
      providerMeta = { name: this.providerName, modelVersion: prov.modelVersion || null };
    } else if (allowFallback) {
      // Explicit, clearly-marked fallback. NEVER presented as successful inference.
      depth = input.fallbackDepth || { data: null, note: 'flat synthetic depth' };
      confidence = input.fallbackConfidence || null;
      provenanceClass = OBS_PROVENANCE.SIMULATED_FALLBACK;
    } else {
      return { ok: false, error: 'no depth provider available and fallback disabled' };
    }

    // 3) Build and ingest the observation.
    const obs = new GeometryObservation({
      id: input.id,
      sourceType: SOURCE_TYPE.PHOTO,
      coordinateFrame: 'camera',
      image: input.image || null,
      camera,
      metric: calibration.metric ?? false,
      depth,
      confidence,
      provenanceClass,
      provider: providerMeta,
      sourceRef: input.sourceRef || null,
    });

    const res = kernel.ingest(obs);
    return {
      ok: res.ok,
      id: obs.id,
      simulated: res.simulated,
      warnings: res.warnings,
      errors: res.errors,
      provenanceClass: obs.provenanceClass,
    };
  }
}
