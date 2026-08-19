// Node-runnable test for HybridLittleWorld (spec §17) + kernel bootstrap.
import assert from 'node:assert/strict';
import {
  SpatialKernel, ObservationStore, SparseField, SceneGraph, RecipeManager, HybridLittleWorld,
  GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE, createDefaultKernel, installKernel,
} from '../runtime/spatial-kernel/index.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

const kernel = new SpatialKernel({ observations: new ObservationStore() });
kernel.registerSubsystem('field', new SparseField({ chunkSize: 8 }));
kernel.registerSubsystem('graph', new SceneGraph());
const rm = new RecipeManager();
rm.register('hybrid-little-world', new HybridLittleWorld({ seed: 5 }));
kernel.registerSubsystem('recipes', rm);

// Observed seed geometry: a small cluster of points (photo-derived).
const observedObs = new GeometryObservation({
  sourceType: SOURCE_TYPE.PHOTO,
  provenanceClass: OBS_PROVENANCE.OBSERVED,
  points: { positions: [{ x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }, { x: 2, y: 0, z: 2 }] },
});

const r = await kernel.runRecipe('hybrid-little-world', { observations: [observedObs] });
ok('hybrid recipe ok', r.ok === true);
ok('observed ids recorded', r.observedIds.length === 1);
ok('hybrid observation ingested', kernel.observations.has(r.hybridObservationId));

const field = kernel.getSubsystem('field');
let obsCount = 0, genCount = 0;
for (const c of field.chunks.values()) {
  for (const v of c.voxels.values()) {
    if (v.provenance === OBS_PROVENANCE.OBSERVED) obsCount++;
    else if (v.provenance === OBS_PROVENANCE.GENERATED) genCount++;
  }
}
ok('field has observed voxels', obsCount >= 4);
ok('field has generated (procedural) voxels', genCount > 4);

global.window = { SHADED: {} };
const k = installKernel(createDefaultKernel());
ok('bootstrap attached spatialKernel to window.SHADED', global.window.SHADED.spatialKernel === k);
ok('bootstrap attached SpatialKernel class', typeof global.window.SHADED.SpatialKernel === 'function');
delete global.window;

console.log(`hybrid + bootstrap tests passed (${passed} assertions)`);
