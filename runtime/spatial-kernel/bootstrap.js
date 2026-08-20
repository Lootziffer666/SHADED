// SHADED Spatial Kernel — bootstrap helpers (spec §0/§3).
//
// `createDefaultKernel()` returns a pre-configured SpatialKernel with the standard
// set of subsystems registered: ObservationStore, SparseField, SceneGraph,
// RecipeManager (with PhotoFirstRecipe + ProceduralLittleWorld + HybridLittleWorld),
// QualityBudget, RepresentationManager, and SpatialMemory.
//
// `installKernel(kernel)` attaches a kernel to the global `window.SHADED`
// namespace, exposing it as `spatialKernel` and the class as `SpatialKernel`
// for inspection-mode consumers.

import { SpatialKernel } from './kernel.js';
import { ObservationStore } from './observation-store.js';
import { SparseField } from './sparse-field.js';
import { SceneGraph } from './scene-graph.js';
import { RecipeManager } from './recipe-manager.js';
import { PhotoFirstRecipe } from './recipes/photo-first-recipe.js';
import { ProceduralLittleWorld } from './recipes/procedural-little-world.js';
import { HybridLittleWorld } from './recipes/hybrid-little-world.js';
import { QualityBudget, QUALITY } from './quality-budget.js';
import { RepresentationManager } from './representation-manager.js';
import { SpatialMemory } from './spatial-memory.js';

export function createDefaultKernel(opts = {}) {
  const kernel = new SpatialKernel({
    worldId: opts.worldId || 'little-world',
    observations: opts.observations || new ObservationStore(),
  });

  const field = new SparseField(opts.fieldOptions || { chunkSize: 16 });
  kernel.registerSubsystem('field', field);

  const graph = new SceneGraph();
  kernel.registerSubsystem('graph', graph);

  const rm = new RecipeManager();
  rm.register('photo-first', new PhotoFirstRecipe(opts.photoFirstOptions || {}));
  rm.register('procedural-little-world', new ProceduralLittleWorld(opts.proceduralOptions || { seed: 1337 }));
  rm.register('hybrid-little-world', new HybridLittleWorld(opts.hybridOptions || { seed: 5 }));
  kernel.registerSubsystem('recipes', rm);

  const budget = new QualityBudget(opts.profile || QUALITY.BROWSER);
  kernel.registerSubsystem('budget', budget);

  const repman = new RepresentationManager({ profile: opts.profile || QUALITY.BROWSER });
  kernel.registerSubsystem('representation', repman);

  const memory = new SpatialMemory({ store: kernel.observations });
  kernel.registerSubsystem('memory', memory);

  return kernel;
}

export function installKernel(kernel, target) {
  const win = target
    || (typeof window !== 'undefined' ? window
    : typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window
    : typeof globalThis !== 'undefined' ? globalThis
    : null);
  if (!win) {
    throw new Error('installKernel: no global target (globalThis / window) available');
  }

  if (!win.SHADED) win.SHADED = {};

  win.SHADED.spatialKernel = kernel;
  win.SHADED.SpatialKernel = SpatialKernel;

  if (kernel.worldId) {
    win.SHADED.worldId = kernel.worldId;
  }

  return kernel;
}
