// Node-runnable tests for the second kernel batch (spec §7,§10,§11,§12,§13,§14,§15,§18).
// Run: node tools/test-spatial-kernel-2.mjs
import assert from 'node:assert/strict';
import {
  SdfScene, prim, xform, op, ConstraintGraph, QualityBudget, QUALITY, RepresentationManager,
  CompletionProvider, CompletionProviderRegistry, SpatialKernel, aStarGrid, inflateObstacles,
  hasLineOfSight, lineOfSightShortcut, invalidatePaths, WorldFields, WorldLawSolver,
  registerReferenceLaws, optimizeMesh,
} from '../runtime/spatial-kernel/index.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

// ===== §7 SDF =====
const sph = prim.sphere(1);
ok('sdf sphere center negative', Math.abs(sph(0, 0, 0) + 1) < 1e-9);
ok('sdf sphere surface zero', Math.abs(sph(1, 0, 0)) < 1e-9);
ok('sdf sphere outside positive', Math.abs(sph(2, 0, 0) - 1) < 1e-9);
const box = prim.box(0.5, 0.5, 0.5);
ok('sdf box inside negative', box(0, 0, 0) < 0);
ok('sdf box surface zero', Math.abs(box(0.5, 0, 0)) < 1e-9);
const union = op.union(prim.sphere(1), xform.translate(prim.sphere(1), [4, 0, 0]));
ok('sdf union midpoint outside', union(2, 0, 0) > 0);
const scene = new SdfScene().set(prim.box(0.5)).subtract(prim.sphere(1));
ok('sdf difference carves interior', scene.distance(0, 0, 0) > 0 && box(0, 0, 0) < 0);
const surf = new SdfScene().set(prim.sphere(1)).surfacePoints([[-1.5, -1.5, -1.5], [1.5, 1.5, 1.5]], 0.2);
ok('sdf surface sampler finds shell', surf.length > 20 && surf.every((p) => Math.abs(p.d) < 0.2));

// ===== §10 ConstraintGraph =====
const cg = new ConstraintGraph({ groundY: 0 });
cg.addNode('floor_box', { min: [-1, 0, -1], max: [1, 1, 1] });
ok('box on floor supported', cg.isSupported('floor_box'));
ok('box on floor rests', cg.restsPlausibly('floor_box'));
cg.addNode('float_box', { min: [-1, 3, -1], max: [1, 4, 1] });
ok('floating box unsupported', !cg.isSupported('float_box'));
const a = cg.analyze();
ok('floating box flagged unstable', a.unstable.some((u) => u.id === 'float_box'));

// overlap + penetration correction
const og = new ConstraintGraph({ groundY: 0 });
og.addNode('a', { min: [0, 0, 0], max: [1, 1, 1] });
og.addNode('b', { min: [0.5, 0, 0], max: [1.5, 1, 1] }); // overlaps a
ok('overlap detected', og.overlaps().length === 1);
const applied = og.resolve();
ok('penetration correction applied', applied.length === 2);
ok('overlap resolved after', og.overlaps().length === 0);

// fixed node not moved
const fg = new ConstraintGraph({ groundY: 0 });
fg.addNode('fixed', { min: [0, 0, 0], max: [1, 1, 1] }, { fixed: true });
fg.addNode('movable', { min: [0.5, 0, 0], max: [1.5, 1, 1] });
fg.resolve();
ok('fixed node position unchanged', fg.get('fixed').box.min[0] === 0);

// ===== §14/§13 QualityBudget + RepresentationManager =====
const mob = new QualityBudget(QUALITY.MOBILE);
ok('mobile budget rejects huge points', mob.within({ pointCount: 1e9 }).ok === false);
const rm = new RepresentationManager({ profile: QUALITY.MOBILE });
rm.register('tree', { kind: 'mesh', quality: QUALITY.GOLD, cost: { pointCount: 10_000_000, triangles: 5_000_000 } });
rm.register('tree', { kind: 'billboard', quality: QUALITY.MOBILE, cost: { pointCount: 1000, triangles: 2 } });
ok('mobile picks cheap rep', rm.pick('tree').quality === QUALITY.MOBILE);
rm.setBudget(QUALITY.GOLD);
ok('gold picks best rep', rm.pick('tree').quality === QUALITY.GOLD);

// ===== §18 CompletionProvider =====
const reg = new CompletionProviderRegistry();
class StubCompleter extends CompletionProvider {
  provide() { return { sourceType: 'hybrid', points: { positions: [{ x: 0, y: 0, z: 0 }], count: 1 }, provenanceClass: 'INFERRED' }; }
}
reg.register(new StubCompleter('stub-completer'));
const cr = reg.run('stub-completer', {});
ok('completion provider returns hypothesis', cr.ok && cr.hypothesis.isCompletion === true);
ok('hypothesis is INFERRED', cr.hypothesis.provenanceClass === 'INFERRED');
const k2 = new SpatialKernel();
const ci = reg.ingest(k2, 'stub-completer', {});
ok('hypothesis ingested as completion', k2.observations.get(ci.ingest.id).isCompletion === true);
ok('unknown completion provider fails', reg.run('nope', {}).ok === false);

// ===== §12 Navigation =====
const size = 7;
const cells = new Uint8Array(size * size);
const cost = new Float32Array(size * size).fill(1);
for (let z = 0; z < size; z++) if (z !== 3) cells[z * size + 3] = 1; // wall with gap at z=3
const grid = { size, cells, cost };
const path = aStarGrid(grid, [1, 3], [5, 3]);
ok('aStar finds path through gap', path.length > 1 && path[path.length - 1][0] === 5);
ok('aStar path avoids walls', path.every(([x, z]) => cells[z * size + x] === 0));
const inf = inflateObstacles(grid, 1);
ok('inflation blocks neighbour of wall', inf[3 * size + 2] === 1);
const straight = [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]];
const shortP = lineOfSightShortcut({ size, cells: new Uint8Array(size * size) }, straight);
ok('LOS shortcut collapses straight path', shortP.length === 2);
const paths = new Map([['p1', [[1, 1], [2, 2], [3, 3]]]]);
const inval = invalidatePaths(paths, new Set([2 * size + 2]), size);
ok('path through dirty cell invalidated', inval.includes('p1'));

// ===== §11 WorldFields + Solver =====
const w1 = new WorldFields(8, 7); w1.ensure('moisture').fill(1); w1.ensure('water'); w1.ensure('ice'); w1.ensure('fuelMass').fill(1); w1.ensure('fire').fill(1); w1.ensure('heat'); w1.ensure('smoke'); w1.ensure('soot'); w1.ensure('mud');
const w2 = w1.clone();
const solver = new WorldLawSolver(); registerReferenceLaws(solver);
const params = { rain: 0.5, temperature: 0.5, dt: 0.1 };
for (let i = 0; i < 20; i++) { solver.step(w1, params); solver.step(w2, params); }
ok('world sim deterministic (same crc)', w1.crc() === w2.crc());

const cold = new WorldFields(8, 3); cold.ensure('moisture').fill(1); cold.ensure('water'); cold.ensure('ice');
const hot = new WorldFields(8, 3); hot.ensure('moisture').fill(1); hot.ensure('water'); hot.ensure('ice');
const s2 = new WorldLawSolver(); registerReferenceLaws(s2);
for (let i = 0; i < 30; i++) { s2.step(cold, { temperature: 0.1, dt: 0.1 }); s2.step(hot, { temperature: 0.9, dt: 0.1 }); }
const avg = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
ok('hot evaporates moisture faster than cold', avg(hot.get('moisture')) < avg(cold.get('moisture')));

// ===== §15 Mesh pipeline =====
const quad = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
const m = optimizeMesh(quad, { tol: 0.001, bits: 14, simplifyRatio: 1 });
ok('mesh weld -> 4 unique verts', m.positions.length === 12);
ok('mesh keeps 2 triangles', m.triangleCount === 2);
ok('mesh quantized present', m.quantized.length === 12);

console.log(`✅ Spatial Kernel batch-2 tests passed (${passed} assertions)`);
