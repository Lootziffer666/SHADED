// SHADED Spatial Kernel — orchestration shell (spec §0/§3).
//
// The kernel is the ONLY thing that owns the spatial truth. It knows NOTHING
// about photo-first, reverse-viewfinder, or hall-plan. Those become Recipes
// (§16/§17) that call `kernel.ingest(observation)`.
//
// This shell is intentionally thin and dependency-free at construction time:
// subsystem implementations are injected (or lazily defaulted), so existing
// working modules are consolidated rather than replaced, and no parallel
// prototype is built beside the app.
//
// Public surface (this file + observation.js + observation-store.js):
//   import { SpatialKernel, GeometryObservation, ObservationStore } from './spatial-kernel/index.js'

import { GeometryObservation } from './observation.js';
import { ObservationStore } from './observation-store.js';

export class SpatialKernel {
  constructor(opts = {}) {
    // Subsystems are slots. Defaults are the minimal, safe implementations;
    // richer ones (SpatialMemory, SceneGraph, SparseField, ...) register later.
    this.observations = opts.observations || new ObservationStore();
    this.subsystems = new Map();
    this.recipes = new Map();

    // onIngest hooks: registered subsystems get each validated observation.
    this._ingestHooks = [];

    // World identity — a Little World is the persistent output of the kernel.
    this.worldId = opts.worldId || 'little-world';
    this.createdAt = opts.createdAt ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  // --- Subsystem registry -------------------------------------------------
  registerSubsystem(name, impl) {
    this.subsystems.set(name, impl);
    if (typeof impl?.onKernelReady === 'function') impl.onKernelReady(this);
    if (typeof impl?.onIngest === 'function') this._ingestHooks.push(impl);
    return impl;
  }

  getSubsystem(name) {
    return this.subsystems.get(name) || null;
  }

  // --- Recipe registry (§16/§17) -----------------------------------------
  registerRecipe(name, recipe) {
    this.recipes.set(name, recipe);
    return recipe;
  }

  hasRecipe(name) {
    return this.recipes.has(name);
  }

  // Run a registered recipe. If a RecipeManager subsystem is registered it is
  // the authority; otherwise fall back to the kernel's own recipe map. The
  // recipe is expected to call `kernel.ingest(...)` itself.
  async runRecipe(name, input, opts = {}) {
    const manager = this.subsystems.get('recipes');
    if (manager && typeof manager.run === 'function') {
      return manager.run(this, name, input, opts);
    }
    const recipe = this.recipes.get(name);
    if (!recipe) {
      return { ok: false, error: `unknown recipe: ${name}` };
    }
    return recipe.run(this, input, opts);
  }

  // --- Universal ingest (replaces SpatialSystemIntegrator.processPhoto) --
  // Accepts a GeometryObservation or a plain object. Validates, stores, and
  // fans out to subsystems. Returns a structured result — never throws on a
  // bad observation; callers decide. Faked/simulated output is surfaced via
  // warnings and provenanceClass, never relabelled as success.
  ingest(observation) {
    const obs = observation instanceof GeometryObservation
      ? observation
      : new GeometryObservation(observation);

    const v = obs.validate();
    this.observations.add(obs);

    const hookResults = [];
    for (const sub of this._ingestHooks) {
      try {
        const r = sub.onIngest(obs, this);
        if (r !== undefined) hookResults.push(r);
      } catch (err) {
        hookResults.push({ subsystem: sub.name || '?', error: String(err && err.message || err) });
      }
    }

    return {
      ok: v.ok,
      id: obs.id,
      sequence: obs.sequence,
      errors: v.errors,
      warnings: v.warnings,
      provenanceClass: obs.provenanceClass,
      simulated: obs.provenanceClass === 'SIMULATED_FALLBACK',
      subsystemResults: hookResults,
    };
  }

  // Convenience: ingest many (streaming sequence).
  ingestAll(observations) {
    return observations.map((o) => this.ingest(o));
  }

  // Snapshot of kernel state for debugging / inspection mode (§round-8).
  snapshot() {
    return {
      worldId: this.worldId,
      observationCount: this.observations.size,
      trustedObservationCount: this.observations.trustedCount(),
      keyframes: this.observations.list().filter((o) => this.observations.isKeyframe(o.id)).map((o) => o.id),
      anchors: this.observations.list().filter((o) => this.observations.isAnchor(o.id)).map((o) => o.id),
      subsystems: Array.from(this.subsystems.keys()),
      recipes: Array.from(this.recipes.keys()),
    };
  }
}
