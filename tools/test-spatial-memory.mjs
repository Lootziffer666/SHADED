// Node-runnable tests for SpatialMemory (spec §5). Run: node tools/test-spatial-memory.mjs
import assert from 'node:assert/strict';
import { SpatialKernel, SpatialMemory, ObservationStore, GeometryObservation, SOURCE_TYPE } from '../runtime/spatial-kernel/index.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

// A deterministic registrar stub: it knows the TRUE world poses of observations
// (in a real system PatchRegistrar computes this). It returns the exact relative
// transform plus a small residual, simulating good registration.
function makeRegistrar(truePoses) {
  return {
    register(a, b) {
      const pa = truePoses[a.id], pb = truePoses[b.id];
      // rel = inv(pa) * pb  (reuse memory's own math via exported helper would
      // create a cycle, so compute a simple delta here)
      const dx = pb.x - pa.x, dz = pb.z - pa.z;
      const c = Math.cos(-pa.yaw), s = Math.sin(-pa.yaw);
      const rx = (dx * c - dz * s) / pa.scale;
      const rz = (dx * s + dz * c) / pa.scale;
      return { rel: { x: rx, y: pb.y - pa.y, z: rz, yaw: pb.yaw - pa.yaw, scale: pb.scale / pa.scale }, residual: 0.01, overlap: 0.8 };
    },
  };
}

// Four cameras walking a 10m square, then returning to the origin (loop).
const truePoses = {
  o0: { x: 0, y: 0, z: 0, yaw: 0, scale: 1 },
  o1: { x: 10, y: 0, z: 0, yaw: 0, scale: 1 },
  o2: { x: 10, y: 0, z: 10, yaw: 0, scale: 1 },
  o3: { x: 0, y: 0, z: 10, yaw: 0, scale: 1 },
  o4: { x: 0, y: 0, z: 0, yaw: 0, scale: 1 }, // back to origin = loop closure
};

const store = new ObservationStore();
const registrar = makeRegistrar(truePoses);
const mem = new SpatialMemory({ store, registrar, localWindowSize: 3 });
const kernel = new SpatialKernel({ observations: store });
kernel.registerSubsystem('memory', mem);

// Ingest the sequence; onIngest integrates each against the local reference.
const ids = ['o0', 'o1', 'o2', 'o3', 'o4'];
for (const id of ids) {
  kernel.ingest(new GeometryObservation({ id, sourceType: SOURCE_TYPE.MANUAL, camera: { fov: 60 } }));
}

ok('origin pose at world origin', approx(mem.worldPoseOf('o0'), { x: 0, y: 0, z: 0 }));
ok('o1 integrated at x=10', approx(mem.worldPoseOf('o1'), { x: 10 }));
ok('o2 integrated at (10,10)', approx(mem.worldPoseOf('o2'), { x: 10, z: 10 }));
ok('o3 integrated at (0,10)', approx(mem.worldPoseOf('o3'), { x: 0, z: 10 }));
ok('origin promoted to anchor', mem.hasAnchor('o0'));

// Without loop closure, o4's incremental chain (o3->o4) already lands at origin,
// so drift is ~0. Now exercise loopClose explicitly against the origin anchor.
const lc = mem.loopClose('o4', 'o0');
ok('loop closure accepted (low residual)', lc.ok === true);
ok('loop closure correction small', lc.ok && lc.corrected < 1e-6);

// Bounded memory: window must not exceed localWindowSize + protected anchors.
ok('local window bounded', mem.window.length <= 3 + 1);

// Drift monitoring: a deliberately BAD registration is rejected for correction.
const registrarBad = {
  register() { return { rel: { x: 999, y: 0, z: 999, yaw: 0, scale: 1 }, residual: 0.9, overlap: 0.1 }; },
};
const memBad = new SpatialMemory({ store: new ObservationStore(), registrar: registrarBad, localWindowSize: 3 });
memBad.onKernelReady(new SpatialKernel());
memBad.onIngest(new GeometryObservation({ id: 'a', sourceType: SOURCE_TYPE.MANUAL }));
const badLc = memBad.loopClose('a', 'a', { rel: { x: 999, yaw: 0, scale: 1 }, residual: 0.9 });
ok('high-residual loop closure rejected', badLc.ok === false && /residual too high/.test(badLc.reason || ''));

console.log(`✅ SpatialMemory tests passed (${passed} assertions)`);

function approx(pose, target, eps = 1e-6) {
  if (!pose) return false;
  return Math.abs(pose.x - (target.x || 0)) < eps &&
         Math.abs(pose.y - (target.y || 0)) < eps &&
         Math.abs(pose.z - (target.z || 0)) < eps;
}
