// Node-runnable tests for §6 reconstruction improvements. Run: node tools/test-spatial-reconstruction-2.mjs
import assert from 'node:assert/strict';
import {
  geometryNeighbourhood, estimatePointNormalsRobust, connectedComponents3D,
  fitGeometricPrimitivesExtended,
} from '../runtime/spatial-kernel/index.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

// ---- §6B geometry-aware neighbourhood rejects far points ----
const plane = [];
for (let x = -5; x <= 5; x += 0.5) for (let z = -5; z <= 5; z += 0.5) plane.push({ x, y: 0, z });
const far = [];
for (let i = 0; i < 10; i++) far.push({ x: (i % 3) - 1, y: 100, z: (i % 2) - 0.5 });
const all = [...plane, ...far];
const idx0 = 0; // a plane point
const nb = geometryNeighbourhood(all, idx0, { k: 16 });
ok('neighbourhood excludes far cluster', nb.neighbours.every((j) => all[j].y < 1));

// ---- §6C confidence-weighted normals on a flat plane ----
const normals = estimatePointNormalsRobust(plane);
const n0 = normals[Math.floor(plane.length / 2)];
ok('plane normal is vertical', Math.abs(n0.normal[1]) > 0.9);
ok('plane normal confidence high', n0.confidence > 0.5);
ok('plane normal reliability high', n0.reliability > 0.5);

// ---- §6D spatial-graph components (two disjoint clusters) ----
const c1 = [], c2 = [];
for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { c1.push({ x, y: 0, z }); c2.push({ x: x + 50, y: 0, z }); }
const clusters = [...c1, ...c2];
const comps = connectedComponents3D(clusters, null, { componentDistanceThreshold: 1 });
ok('two disjoint clusters -> two components', comps.length === 2);

// ---- §6E extended primitive fitting + model selection ----
const sphere = [];
for (let i = 0; i < 240; i++) {
  // Fibonacci sphere
  const t = i / 240, phi = Math.acos(1 - 2 * t), th = Math.PI * (1 + Math.sqrt(5)) * i;
  sphere.push({ x: Math.sin(phi) * Math.cos(th), y: Math.sin(phi) * Math.sin(th), z: Math.cos(phi) });
}
const sFit = fitGeometricPrimitivesExtended(sphere);
ok('sphere fit yields a primitive', sFit.primitives.length >= 1);
ok('sphere detected as sphere', sFit.primitives[0].type === 'sphere');
ok('sphere fit rmse small', sFit.primitives[0].rmse < 0.1);

// floor: flat plane with vertical normal -> classified floor
const floor = [];
for (let x = -3; x <= 3; x += 0.3) for (let z = -3; z <= 3; z += 0.3) floor.push({ x, y: 0, z });
const fFit = fitGeometricPrimitivesExtended(floor);
ok('flat plane classified as floor', fFit.primitives[0] && fFit.primitives[0].type === 'floor');
ok('floor fit rmse small', fFit.primitives[0].rmse < 0.05);

// ---- O(n^2) regression guard: large cloud stays fast ----
const big = [];
for (let i = 0; i < 3000; i++) big.push({ x: (i % 50) * 0.1, y: Math.floor(i / 50) % 50 * 0.1, z: Math.floor(i / 2500) });
const t0 = Date.now();
const bigComps = connectedComponents3D(big, null, { componentDistanceThreshold: 0.2 });
const dt = Date.now() - t0;
ok('3000-point 3D component pass is sub-linear-time (fast)', dt < 2000);
ok('big cloud partitioned', bigComps.length >= 1);

console.log(`✅ §6 reconstruction tests passed (${passed} assertions)`);
