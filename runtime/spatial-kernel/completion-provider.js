// SHADED Spatial Kernel — CompletionProvider (spec §18+, TRELLIS/Zero123 donor).
//
// Completion providers (image-to-3D, alternative views, fill-in hypotheses)
// are OPTIONAL. Their output is a HYPOTHESIS, never canonical world truth. A
// hypothesis is ingested as a GeometryObservation flagged isCompletion with
// INFERRED/GENERATED provenance; the SparseField's trust-ordered fusion keeps
// it from overwriting trusted OBSERVED/MEASURED data (spec: no invisible
// alternate truth).
//
// Pure, dependency-free.

import { GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE } from './observation.js';

export class CompletionProvider {
  constructor(name) { this.name = name; }
  // Return either null (cannot complete) or a partial observation payload:
  // { sourceType, depth?, points?, confidence?, provenanceClass? , ... }
  // Subclasses override. Never throw on "can't";
  provide(_context) { return null; }
}

// Build a hypothesis observation from a provider payload.
export function makeHypothesis(providerName, payload = {}, opts = {}) {
  const obs = new GeometryObservation({
    sourceType: payload.sourceType || SOURCE_TYPE.HYBRID,
    provenanceClass: payload.provenanceClass || OBS_PROVENANCE.INFERRED,
    depth: payload.depth || null,
    points: payload.points || null,
    confidence: payload.confidence || null,
    provider: { name: providerName, completion: true },
    sourceRef: opts.sourceRef || null,
  });
  obs.isCompletion = true;
  return obs;
}

export class CompletionProviderRegistry {
  constructor() { this.providers = new Map(); }
  register(provider) { this.providers.set(provider.name, provider); return provider; }
  has(name) { return this.providers.has(name); }
  list() { return Array.from(this.providers.keys()); }

  // Run a provider against a context; returns { ok, hypothesis?, error? }.
  run(name, context = {}) {
    const p = this.providers.get(name);
    if (!p) return { ok: false, error: `unknown completion provider: ${name}` };
    let payload;
    try { payload = p.provide(context); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    if (!payload) return { ok: false, error: 'provider declined (insufficient context)' };
    const hypothesis = makeHypothesis(name, payload, { sourceRef: context.sourceRef });
    return { ok: true, hypothesis, simulated: hypothesis.provenanceClass === OBS_PROVENANCE.SIMULATED_FALLBACK };
  }

  // Convenience: ingest a hypothesis into the kernel (marked completion).
  ingest(kernel, name, context = {}) {
    const r = this.run(name, context);
    if (!r.ok) return r;
    const res = kernel.ingest(r.hypothesis);
    return { ...r, ingest: res };
  }
}
