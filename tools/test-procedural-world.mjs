// Node-runnable tests for ProceduralLittleWorld (spec §17). Run: node tools/test-procedural-world.mjs
import assert from 'node:assert/strict';
import {
  SpatialKernel, RecipeManager, ProceduralLittleWorld, SparseField, SceneGraph,
  OBS_PROVENANCE, NODE_FAMILY,
} from '../runtime/spatial-kernel/index.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

// --- determinism: same seed => identical world -----------------------------
const a = new ProceduralLittleWorld({ seed: 42 });
const b = new ProceduralLittleWorld({ seed: 42 });
const ga = a.generate(), gb = b.generate();
ok('same seed => same point count', ga.points.length === gb.points.length);
ok('same seed => identical first point', JSON.stringify(ga.points[0]) === JSON.stringify(gb.points[0]));
ok('same seed => identical structures', JSON.stringify(ga.structures) === JSON.stringify(gb.structures));

const c = new ProceduralLittleWorld({ seed: 7 });
ok('different seed => different world', JSON.stringify(c.generate().points[0]) !== JSON.stringify(ga.points[0]));

// --- run through the kernel with field + graph sinks -----------------------
const kernel = new SpatialKernel();
const rm = new RecipeManager();
kernel.registerSubsystem('recipes', rm);
kernel.registerSubsystem('field', new SparseField({ chunkSize: 8 }));
kernel.registerSubsystem('graph', new SceneGraph());
rm.register('procedural-little-world', new ProceduralLittleWorld({ seed: 99 }));

const r = await kernel.runRecipe('procedural-little-world', {});
ok('recipe ok', r.ok === true);
ok('observation ingested', kernel.observations.has(r.observationId));
ok('observation is PROCEDURAL/GENERATED', kernel.observations.get(r.observationId).provenanceClass === OBS_PROVENANCE.GENERATED);
ok('field persisted voxels', r.voxelCount > r.pointCount); // points + structure columns
ok('field voxel count matches', kernel.getSubsystem('field').voxelCount === r.voxelCount);
ok('scene graph world node created', r.worldNodeId !== null);
ok('scene graph structure nodes created', r.structNodeIds.length === r.structureCount);
const graph = kernel.getSubsystem('graph');
ok('graph has terrain region', graph.queryByFamily(NODE_FAMILY.REGION).length === 1);
ok('graph has structures', graph.queryByFamily(NODE_FAMILY.STRUCTURE).length === r.structureCount);

console.log(`✅ ProceduralLittleWorld tests passed (${passed} assertions)`);
