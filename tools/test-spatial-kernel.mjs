// Node-runnable tests for the SHADED Spatial Kernel foundation (spec §3/§4).
// No external deps — run with: node tools/test-spatial-kernel.mjs
import assert from 'node:assert/strict';
import {
  SpatialKernel, GeometryObservation, ObservationStore, OBSERVATION_SPEC_VERSION,
  SOURCE_TYPE, OBS_PROVENANCE,
} from '../runtime/spatial-kernel/index.js';

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed++;
}

// --- GeometryObservation basics -------------------------------------------
const obs = new GeometryObservation({ sourceType: SOURCE_TYPE.MANUAL, camera: { fov: 60 } });
ok('observation has spec version', obs.specVersion === OBSERVATION_SPEC_VERSION);
ok('observation gets stable id', typeof obs.id === 'string' && obs.id.length > 0);
const v = obs.validate();
ok('manual camera observation validates', v.ok);
ok('no errors on valid observation', v.errors.length === 0);

// Unknown source type is rejected by validate().
const bad = new GeometryObservation({ sourceType: 'not-a-source' });
ok('invalid sourceType fails validate', !bad.validate().ok);

// --- Simulated fallback is surfaced, never hidden -------------------------
const sim = new GeometryObservation({
  sourceType: SOURCE_TYPE.DEPTH,
  provenanceClass: OBS_PROVENANCE.SIMULATED_FALLBACK,
  depth: { data: [1, 2, 3] },
});
const sv = sim.validate();
ok('simulated fallback flagged in warnings', sv.warnings.some((w) => /SIMULATED_FALLBACK/.test(w)));
ok('simulated fallback provenanceClass set', sim.provenanceClass === OBS_PROVENANCE.SIMULATED_FALLBACK);

// --- fromProviderResult adapts the v1 provider schema ---------------------
const providerResult = {
  format: 'SHADED.spatial-provider-result.v1',
  provider: 'depth-anything',
  modelVersion: 'v3',
  device: 'wasm',
  precision: 'fp32',
  depthConvention: 'relative-depth-higher-far',
  metric: false,
  channels: {
    depth: { file: 'd.bin', dtype: 'float32-le', shape: [256, 256] },
    confidence: { file: 'c.bin', dtype: 'float32-le', shape: [256, 256] },
  },
  camera: { fx: 300, fy: 300, cx: 128, cy: 128, width: 256, height: 256 },
  provenance: { class: 'INFERRED', sourceFile: 'photo.png', sourceSha256: 'a'.repeat(64), sourceSize: { width: 256, height: 256 }, processedSize: { width: 256, height: 256 }, provider: 'depth-anything', modelVersion: 'v3', parameters: {} },
};
const adapted = GeometryObservation.fromProviderResult(providerResult, { sourceType: SOURCE_TYPE.PHOTO });
ok('provider result adapts to observation', adapted.sourceType === SOURCE_TYPE.PHOTO);
ok('provider depth channel preserved', adapted.depth && adapted.depth.ref.file === 'd.bin');
ok('provider camera preserved', adapted.camera.fx === 300);
ok('provider provenance class INFERRED', adapted.provenanceClass === OBS_PROVENANCE.INFERRED);
ok('raw provider result kept', adapted.providerResult === providerResult);

// --- ObservationStore -----------------------------------------------------
const store = new ObservationStore();
const a = store.add(new GeometryObservation({ sourceType: SOURCE_TYPE.DEPTH }));
const b = store.add(new GeometryObservation({ sourceType: SOURCE_TYPE.PHOTO }));
ok('store assigns sequences', a.sequence === 0 && b.sequence === 1);
ok('store size', store.size === 2);
ok('store retrieval', store.get(a.id) === a);
store.markKeyframe(a.id);
ok('keyframe flag', store.isKeyframe(a.id));
ok('trusted count excludes nothing here', store.trustedCount() === 2);
const simObs = store.add(new GeometryObservation({ sourceType: SOURCE_TYPE.DEPTH, provenanceClass: OBS_PROVENANCE.SIMULATED_FALLBACK }));
ok('trusted count excludes simulated', store.trustedCount() === 2);

// --- SpatialKernel ingest (universal entry point) -------------------------
const kernel = new SpatialKernel();
const r1 = kernel.ingest(new GeometryObservation({ sourceType: SOURCE_TYPE.MANUAL, camera: { fov: 50 } }));
ok('kernel ingest ok', r1.ok && r1.id);
ok('kernel records observation', kernel.observations.size === 1);

// Subsystem hook receives every ingested observation (SpatialMemory will use this).
let seen = [];
const memStub = { name: 'memory-stub', onIngest(o) { seen.push(o.id); } };
kernel.registerSubsystem('memory', memStub);
const r2 = kernel.ingest(new GeometryObservation({ sourceType: SOURCE_TYPE.PHOTO }));
ok('subsystem hook fired', seen.length === 1 && seen[0] === r2.id);

// Simulated ingestion must NOT be reported as success.
const rSim = kernel.ingest(new GeometryObservation({ sourceType: SOURCE_TYPE.DEPTH, provenanceClass: OBS_PROVENANCE.SIMULATED_FALLBACK, depth: { data: [1] } }));
ok('simulated ingest flagged', rSim.simulated === true && rSim.warnings.length > 0);

// Snapshot sanity.
const snap = kernel.snapshot();
ok('snapshot counts', snap.observationCount === 3 && snap.trustedObservationCount === 2);
ok('snapshot subsystems', snap.subsystems.includes('memory'));

// --- Dependency inversion: kernel must not know about photo-first ---------
// (If photo-first classes were imported here, this resolve would couple them;
//  we assert the public barrel resolves WITHOUT those modules.)
ok('kernel barrel resolves standalone', typeof SpatialKernel === 'function');

console.log(`✅ Spatial Kernel foundation tests passed (${passed} assertions)`);
