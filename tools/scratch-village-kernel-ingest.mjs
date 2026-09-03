// SCRATCH -- bridges the affine village-cube reconstruction (this session's
// own tools/scratch-village-reconstruct-affine.mjs output) into the REAL,
// tested runtime/spatial-kernel/ instead of leaving it as an isolated
// tools/scratch-* artifact. Builds one GeometryObservation per house from the
// 3 MEASURED faces only (constructed/backside points are deliberately left
// out here -- an OBSERVED-tagged observation must not carry invented data),
// runs createDefaultKernel(), and tries two paths:
//   1) plain kernel.ingest(obs) per house -- proves the affine output is a
//      valid GeometryObservation the kernel accepts.
//   2) kernel.runRecipe('hybrid-little-world', {observations}) -- the same
//      recipe test-hybrid-world.mjs exercises on a synthetic 4-point fixture,
//      here fed REAL reconstructed geometry, to see whether its gap-fill
//      logic (which has hardcoded metric-scale worldBounds) does anything
//      useful at the affine solver's pixel-space coordinate scale.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDefaultKernel } from '../runtime/spatial-kernel/index.js';
import { GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE } from '../runtime/spatial-kernel/observation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { T, scale } = recon;
const houseNames = Object.keys(T);

const MEASURED_FACES = [{ axis: 0, value: 1 }, { axis: 1, value: 1 }, { axis: 2, value: 1 }];
const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
const GRID = 14;

function measuredPointsFor(name) {
  const Th = T[name], Lh = scale[name];
  const pts = [];
  for (const face of MEASURED_FACES) {
    const local = { 0: 0, 1: 0, 2: 0 };
    local[face.axis] = face.value;
    const [u, v] = otherAxes(face.axis);
    for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
      local[u] = i / GRID; local[v] = j / GRID;
      pts.push({ x: Th[0] + local[0] * Lh[0], y: Th[1] + local[1] * Lh[1], z: Th[2] + local[2] * Lh[2] });
    }
  }
  return pts;
}

console.log('=== Path 1: plain kernel.ingest() per house ===');
const kernel1 = createDefaultKernel({ worldId: 'village-affine' });
const field1 = kernel1.getSubsystem('field');
for (const name of houseNames) {
  const positions = measuredPointsFor(name);
  const obs = new GeometryObservation({
    sourceType: SOURCE_TYPE.POINT_CLOUD,
    coordinateFrame: 'world',
    provenanceClass: OBS_PROVENANCE.OBSERVED,
    metric: false,
    points: { positions, count: positions.length },
    sourceRef: `village-reconstructed-affine.json:${name}`,
  });
  const res = kernel1.ingest(obs);
  const imported = field1.importPoints(positions, { provenance: 'OBSERVED', confidence: 1, sourceObs: obs.id });
  console.log(`  ${name}: ok=${res.ok} points=${positions.length} warnings=${JSON.stringify(res.warnings)} voxelsImported=${imported}`);
}
console.log(`  kernel.observations total: ${kernel1.observations.size ?? '?'}`);
console.log(`  field chunks: ${field1.chunks.size}`);

console.log('\n=== Path 2: hybrid-little-world recipe on real geometry ===');
const kernel2 = createDefaultKernel({ worldId: 'village-affine-hybrid', hybridOptions: { seed: 5 } });
const observations = houseNames.map((name) => {
  const positions = measuredPointsFor(name);
  return new GeometryObservation({
    sourceType: SOURCE_TYPE.POINT_CLOUD,
    coordinateFrame: 'world',
    provenanceClass: OBS_PROVENANCE.OBSERVED,
    metric: false,
    points: { positions, count: positions.length },
    sourceRef: `village-reconstructed-affine.json:${name}`,
  });
});
// Report the coordinate range vs the recipe's hardcoded worldBounds
// (min:[-16,0,-16], max:[16,8,16]) before running it, so the result is
// legible instead of a silent "0 generated".
let allPts = [];
for (const o of observations) allPts.push(...o.points.positions);
const rng = (k) => [Math.min(...allPts.map(p => p[k])), Math.max(...allPts.map(p => p[k]))];
console.log(`  reconstructed coordinate range: x=${rng('x').map(v => v.toFixed(0))} y=${rng('y').map(v => v.toFixed(0))} z=${rng('z').map(v => v.toFixed(0))}`);
console.log(`  HybridLittleWorld's hardcoded worldBounds: x=[-16,16] y=[0,8] z=[-16,16]`);

const result = await kernel2.runRecipe('hybrid-little-world', { observations });
console.log('  recipe result:', JSON.stringify({ ok: result.ok, error: result.error, observedIds: result.observedIds, observedVoxelCount: result.observedVoxelCount, generatedVoxelCount: result.generatedVoxelCount }, null, 2));
