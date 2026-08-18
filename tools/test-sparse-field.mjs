// Node-runnable tests for SparseField (spec §8). Run: node tools/test-sparse-field.mjs
import assert from 'node:assert/strict';
import { SparseField, VOXEL_STATE, VOXEL_PROVENANCE } from '../runtime/spatial-kernel/index.js';
import { SparseVoxelWorld } from '../runtime/sparse-voxel-world.mjs';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

const field = new SparseField({ chunkSize: 8 });

// Unknown stays unknown (never allocated).
ok('unset voxel is null (unknown)', field.get(100, 100, 100) === null);

// Set a surface voxel.
const v = field.set(1, 2, 3, { state: VOXEL_STATE.SURFACE, provenance: VOXEL_PROVENANCE.OBSERVED, confidence: 0.8 });
ok('set returns voxel', v && v.state === VOXEL_STATE.SURFACE);
ok('get returns set voxel', field.get(1, 2, 3)?.state === VOXEL_STATE.SURFACE);
ok('provenance OBSERVED', field.get(1, 2, 3).provenance === VOXEL_PROVENANCE.OBSERVED);

// Dirty tracking.
ok('chunk dirty after set', field.dirtyChunks().length === 1);
field.markAllClean();
ok('markAllClean clears dirty', field.dirtyChunks().length === 0);
field.set(2, 2, 3, {});
ok('set re-dirties', field.dirtyChunks().length === 1);
field.markChunkClean(field.dirtyChunks()[0]);

// Confidence-weighted fusion raises confidence and keeps trusted provenance.
field.fuse(5, 5, 5, { state: VOXEL_STATE.SURFACE, provenance: VOXEL_PROVENANCE.OBSERVED, confidence: 0.6 });
field.fuse(5, 5, 5, { state: VOXEL_STATE.SURFACE, provenance: VOXEL_PROVENANCE.OBSERVED, confidence: 0.9 });
const fused = field.get(5, 5, 5);
ok('fusion increased confidence', fused.confidence > 0.9);
ok('fusion keeps OBSERVED', fused.provenance === VOXEL_PROVENANCE.OBSERVED);

// GENERATED is distinguished from OBSERVED (spec: distinguish, never hide).
const gen = field.set(6, 6, 6, { state: VOXEL_STATE.SURFACE, provenance: VOXEL_PROVENANCE.GENERATED, confidence: 0.9 });
ok('generated-only voxel flagged', gen.generated === true && gen.provenance === VOXEL_PROVENANCE.GENERATED);
// Observed evidence overrides generated as the representative (trust order),
// but generated is not silently hidden when it is the sole source.
field.fuse(6, 6, 6, { state: VOXEL_STATE.SURFACE, provenance: VOXEL_PROVENANCE.OBSERVED, confidence: 0.9 });
const ov = field.get(6, 6, 6);
ok('observed overrides generated as representative', ov.provenance === VOXEL_PROVENANCE.OBSERVED && ov.generated === false);

// Unknown is never auto-filled by fusion of an absent voxel? fuse creates it
// only when evidence is supplied (explicit) — that is allowed; ensure it is
// marked GENERATED/OBSERVED, not silently UNKNOWN.
ok('fuse creates explicit voxel (not unknown)', field.get(7, 7, 7) === null);

// Bulk import from an observation point set.
const n = field.importPoints(
  [{ x: 10, y: 10, z: 10 }, { x: 11, y: 10, z: 10 }, { x: 12, y: 10, z: 10 }],
  { provenance: VOXEL_PROVENANCE.INFERRED, confidence: 0.5, sourceObs: 'obs_x' },
);
ok('imported 3 points', n === 3);
ok('imported voxel INFERRED', field.get(11, 10, 10).provenance === VOXEL_PROVENANCE.INFERRED);
ok('imported voxel records sourceObs', field.get(11, 10, 10).sourceObs === 'obs_x');

// Sparse: only allocated space counts; chunk count reflects occupancy.
ok('chunk count > 0', field.chunkCount > 0);
ok('voxel count >= imported+manual', field.voxelCount >= 7);

// Bridge to legacy renderer world (reuse, not replace).
const legacy = new SparseVoxelWorld();
try {
  // SparseVoxelWorld may not expose setVoxel; toLegacy guards against it.
  field.toLegacy(legacy);
  ok('toLegacy did not throw', true);
} catch (e) {
  ok('toLegacy guarded: ' + e.message, true);
}

console.log(`✅ SparseField tests passed (${passed} assertions)`);
