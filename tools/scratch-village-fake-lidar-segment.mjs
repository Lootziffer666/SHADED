// SCRATCH -- feeds the fake-LiDAR point cloud (village-cube boxes, measured
// + parallel-copied-constructed faces, see scratch-village-fake-lidar-splat.mjs)
// through runtime/spatial-kernel/reconstruction.js's GENERIC primitive-fitting
// pipeline (estimatePointNormalsRobust -> connectedComponents3D ->
// fitGeometricPrimitivesExtended). That pipeline was built for arbitrary point
// clouds with zero domain knowledge about "house" or "box" -- it only uses
// geometric continuity (distance) and normal continuity (angle). The question:
// does it recover the 6 individual box faces per house from geometry alone, no
// color/material evidence at all -- i.e. is this kernel code a real, reusable
// evidence channel for the cultivation work, or does it just produce mush.
//
// Pure Node, no Playwright: point *positions* don't need canvas/pixel sampling
// (only their RGB color did, and color is irrelevant to this geometric test).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimatePointNormalsRobust, connectedComponents3D, fitGeometricPrimitivesExtended } from '../runtime/spatial-kernel/reconstruction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { T, scale } = recon;
const houseNames = Object.keys(T);

// Same face topology as scratch-village-fake-lidar-splat.mjs: (1,1,1) side is
// measured, (0,0,0) side is constructed (parallel-copy, per synthetic-visual-
// reverse-engineering.md SS4.6). Ground-truth ids are for OUR evaluation only
// -- the pipeline under test never sees them.
const FACES = [
  { axis: 0, value: 1, gt: 'measured' }, { axis: 1, value: 1, gt: 'measured' }, { axis: 2, value: 1, gt: 'measured' },
  { axis: 0, value: 0, gt: 'constructed' }, { axis: 1, value: 0, gt: 'constructed' }, { axis: 2, value: 0, gt: 'constructed' },
];
const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
const GRID = 14;

const points = [];
for (const name of houseNames) {
  const Th = T[name], Lh = scale[name];
  for (const face of FACES) {
    const local = { 0: 0, 1: 0, 2: 0 };
    local[face.axis] = face.value;
    const [u, v] = otherAxes(face.axis);
    for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
      local[u] = i / GRID; local[v] = j / GRID;
      points.push({
        x: Th[0] + local[0] * Lh[0], y: Th[1] + local[1] * Lh[1], z: Th[2] + local[2] * Lh[2],
        house: name, faceKey: `${face.axis}:${face.value}`, gt: face.gt,
      });
    }
  }
}
console.log(`Point cloud: ${points.length} points, ${houseNames.length} houses x ${FACES.length} faces x ${(GRID + 1) ** 2} samples/face`);

const normals = estimatePointNormalsRobust(points, { k: 16 });
const components = connectedComponents3D(points, normals, { normalAngleDegrees: 28 });
console.log(`\nconnectedComponents3D: ${components.length} components (sizes: ${components.slice(0, 20).map(c => c.length).join(', ')}${components.length > 20 ? ', ...' : ''})`);

// Purity check: for each component, does it correspond to exactly one
// (house, face) pair, one house with mixed faces, or multiple houses?
let pureFace = 0, pureHouseMixedFace = 0, mixedHouse = 0;
for (const comp of components) {
  if (comp.length < 4) continue;
  const houses = new Set(comp.map(i => points[i].house));
  const faces = new Set(comp.map(i => points[i].faceKey));
  if (houses.size > 1) mixedHouse++;
  else if (faces.size === 1) pureFace++;
  else pureHouseMixedFace++;
}
console.log(`Purity (components with >=4 points): ${pureFace} pure single-face, ${pureHouseMixedFace} single-house/multi-face, ${mixedHouse} span multiple houses`);

const { primitives } = fitGeometricPrimitivesExtended(points, { normalAngleDegrees: 28, minComponentSize: 6 });
console.log(`\nfitGeometricPrimitivesExtended: ${primitives.length} primitives fitted (min RMSE-complexity score)`);
const byType = {};
for (const p of primitives) byType[p.type] = (byType[p.type] || 0) + 1;
console.log('By type:', byType);

const expectedFaces = houseNames.length * FACES.length;
console.log(`\nExpected face count (ground truth): ${expectedFaces} (${houseNames.length} houses x 6 faces)`);
console.log(`Recovered primitives: ${primitives.length} -- ${primitives.length === expectedFaces ? 'EXACT MATCH' : primitives.length > expectedFaces ? 'over-segmented' : 'under-segmented'}`);

// Show a few example primitives with their dominant ground-truth label, for
// a spot check that "wall"/"floor"/"slab" classification lines up with the
// geometry (a house's "roof"-ish upward face should read as floor/slab given
// this box topology has no actual roof pitch, only axis-aligned faces).
console.log('\nSample primitives (first 8):');
for (const p of primitives.slice(0, 8)) {
  const idxs = p.indices;
  const houses = {}; for (const i of idxs) houses[points[i].house] = (houses[points[i].house] || 0) + 1;
  const dominant = Object.entries(houses).sort((a, b) => b[1] - a[1])[0];
  console.log(`  #${p.id} type=${p.type} n=${idxs.length} rmse=${p.rmse.toFixed(3)} confidence=${p.confidence.toFixed(2)} dominant_house=${dominant[0]} (${dominant[1]}/${idxs.length})`);
}
