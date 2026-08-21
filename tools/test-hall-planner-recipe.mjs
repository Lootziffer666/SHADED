// Node-runnable test for HallPlannerRecipe (exp-041).
// Run: node tools/test-hall-planner-recipe.mjs

import assert from 'node:assert/strict';
import {
  SpatialKernel, ObservationStore, SparseField, SceneGraph, RecipeManager,
  GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE,
  createDefaultKernel, installKernel,
} from '../runtime/spatial-kernel/index.js';
import { NODE_FAMILY } from '../runtime/spatial-kernel/scene-graph.js';
import { VOXEL_PROVENANCE } from '../runtime/spatial-kernel/sparse-field.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

// ------------------------------------------------------------------
// 1) Recipe registers in createDefaultKernel
// ------------------------------------------------------------------
const kernel = createDefaultKernel({
  fieldOptions: { chunkSize: 8 },
  hallPlannerOptions: {},
});
ok('kernel has recipes subsystem', kernel.getSubsystem('recipes') !== null);
ok('hall-planner recipe registered', kernel.getSubsystem('recipes')?.has('hall-planner') === true);

// ------------------------------------------------------------------
// 2) Floor plan -> FLOOR_PLAN observation -> SceneGraph nodes
// ------------------------------------------------------------------
const W = 300, H = 300;
const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
  const x = 30 + c * 60, y = 30 + r * 60;
  for (let yy = y; yy < y + 14; yy++) for (let xx = x; xx < x + 14; xx++) {
    const i = (yy * W + xx) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
  }
}

const r = await kernel.runRecipe('hall-planner', {
  image: rgba,
  width: W,
  height: H,
  calibration: { planId: 'test-plan-001', metersPerPixel: 0.25 },
});

ok('recipe returned ok', r.ok === true);
ok('observation id returned', typeof r.observationId === 'string');
ok('observation ingested into kernel', kernel.observations.has(r.observationId));

// Check SceneGraph has nodes
const graph = kernel.getSubsystem('graph');
ok('graph has hall node', graph?.has(r.hallNodeId));
ok('graph has anchor nodes', r.anchorNodeIds.length > 0);
if (r.anchorNodeIds.length > 0) {
  const anchorNode = graph.get(r.anchorNodeIds[0]);
  ok('anchor node family is ANCHOR', anchorNode?.family === NODE_FAMILY.ANCHOR);
}

// Check SparseField has voxels
const field = kernel.getSubsystem('field');
ok('field has voxels from colliders', field?.voxelCount > 0);

// ------------------------------------------------------------------
// 3) Source type is FLOOR_PLAN and provenance is OBSERVED
// ------------------------------------------------------------------
const obs = kernel.observations.get(r.observationId);
ok('observation sourceType is floor-plan', obs?.sourceType === SOURCE_TYPE.FLOOR_PLAN);
ok('observation provenanceClass is OBSERVED', obs?.provenanceClass === OBS_PROVENANCE.OBSERVED);
ok('observation has constraints', obs?.constraints && obs.constraints.anchors.length > 0);

// ------------------------------------------------------------------
// 4) Graceful failure on missing image
// ------------------------------------------------------------------
const r2 = await kernel.runRecipe('hall-planner', {});
ok('recipe fails gracefully on missing image', r2.ok === false);
ok('error message present', typeof r2.error === 'string');

// ------------------------------------------------------------------
// 5) installKernel / window.SHADED bootstrap
// ------------------------------------------------------------------
global.window = { SHADED: {} };
const k2 = installKernel(createDefaultKernel({ hallPlannerOptions: {} }));
ok('bootstrap attached spatialKernel', global.window.SHADED.spatialKernel === k2);
ok('hall-planner registered via bootstrap', k2.getSubsystem('recipes')?.has('hall-planner') === true);
delete global.window;

console.log(`hall-planner recipe tests passed (${passed} assertions)`);
