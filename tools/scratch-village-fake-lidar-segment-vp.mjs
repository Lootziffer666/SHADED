// SCRATCH -- third evidence channel: the vanishing-point/family-direction fit
// itself (tools/scratch-village-reconstruct-affine.mjs). That solver already
// reduced each house to an orthogonal, world-axis-aligned coordinate system
// (T/scale are expressed directly in world axes, "world-axis index === family
// index") -- so every real face normal in this reconstruction can only be one
// of exactly 3 cardinal directions (+/-X, +/-Y, +/-Z), never anything between.
// This is NOT reading back the per-point ground truth: the per-point normal
// estimate still comes purely from local PCA over neighbours (same noisy
// process, same corner-blending problem as before). The only new thing is
// SNAPPING that noisy continuous estimate to the nearest of the 3 known
// cardinal axes -- a hard categorical decision -- instead of comparing raw
// continuous angles. This is the standard "Manhattan-world" normal-snapping
// technique from real vision literature, made available here specifically
// because the vanishing-point fit is what established the axis-alignment.
//
// Reuses the cached point cloud (with RGB) from
// scratch-village-fake-lidar-segment-color.mjs -- run that first.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimatePointNormalsRobust, geometryNeighbourhood } from '../runtime/spatial-kernel/reconstruction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const cachePath = path.join(OUT, 'village-fake-lidar-points-rgb.json');
if (!fs.existsSync(cachePath)) {
  console.error('Run scratch-village-fake-lidar-segment-color.mjs first to build the cached point cloud.');
  process.exit(1);
}
const points = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
console.log(`Loaded ${points.length} cached points.`);

const CARDINAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function snapAxis(normal) {
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < CARDINAL.length; i++) {
    const d = normal[0] * CARDINAL[i][0] + normal[1] * CARDINAL[i][1] + normal[2] * CARDINAL[i][2];
    if (d > bestDot) { bestDot = d; best = i; }
  }
  return { axisId: best, snapConfidence: bestDot }; // bestDot close to 1 = confident snap, near 0.5-0.7 = ambiguous (near a corner)
}

const normals = estimatePointNormalsRobust(points, { k: 16 });
const snapped = normals.map(n => snapAxis(n.normal));

// How ambiguous is the snap itself, near corners? A perfectly flat-face point
// should snap with dot close to 1; a corner-blended normal should snap much
// weaker (its estimate sits between two cardinal directions).
const conf = snapped.map(s => s.snapConfidence).sort((a, b) => a - b);
console.log(`Snap confidence distribution: p10=${conf[Math.floor(conf.length * 0.1)].toFixed(2)} p50=${conf[Math.floor(conf.length * 0.5)].toFixed(2)} p90=${conf[Math.floor(conf.length * 0.9)].toFixed(2)}`);

function buildBuckets(pts, cellSize) {
  const buckets = new Map();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const k = [Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize)].join(':');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  return buckets;
}
function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
function segment(pts, opts) {
  const { distanceLimit, normalCos, colorThreshold, useVp, mode } = opts;
  const buckets = buildBuckets(pts, distanceLimit);
  const n = pts.length;
  const visited = new Uint8Array(n), components = [];
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;
    const comp = [], queue = [seed]; visited[seed] = 1;
    while (queue.length) {
      const cur = queue.pop(); comp.push(cur);
      const p = pts[cur];
      const c = [Math.floor(p.x / distanceLimit), Math.floor(p.y / distanceLimit), Math.floor(p.z / distanceLimit)];
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const arr = buckets.get((c[0] + dx) + ':' + (c[1] + dy) + ':' + (c[2] + dz));
        if (!arr) continue;
        for (const next of arr) {
          if (visited[next]) continue;
          const q = pts[next];
          const dd = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
          if (dd > distanceLimit) continue;
          const nCur = normals[cur].normal, nNext = normals[next].normal;
          const geomOk = (nCur[0] * nNext[0] + nCur[1] * nNext[1] + nCur[2] * nNext[2]) >= normalCos;
          const colorOk = colorThreshold == null || colorDist(p, q) <= colorThreshold;
          const vpOk = !useVp || snapped[cur].axisId === snapped[next].axisId;
          let connect;
          if (mode === 'geometry-only') connect = geomOk;
          else if (mode === 'geometry+color') connect = geomOk && colorOk;
          else if (mode === 'vp-only') connect = vpOk;
          else if (mode === 'geometry+vp') connect = geomOk && vpOk;
          else if (mode === 'color+vp') connect = colorOk && vpOk;
          else if (mode === 'all-three') connect = geomOk && colorOk && vpOk;
          if (!connect) continue;
          visited[next] = 1; queue.push(next);
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}
function purity(components, pts) {
  let pureFace = 0, mixedFace = 0, mixedHouse = 0, singletons = 0;
  for (const comp of components) {
    if (comp.length < 4) { singletons++; continue; }
    const houses = new Set(comp.map(i => pts[i].house));
    const faces = new Set(comp.map(i => pts[i].faceKey));
    if (houses.size > 1) mixedHouse++;
    else if (faces.size === 1) pureFace++;
    else mixedFace++;
  }
  return { pureFace, mixedFace, mixedHouse, singletons, total: components.length };
}

const diag = Math.hypot(
  Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
  Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
  Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z)),
);
const spacings = [];
for (let s = 0; s < Math.min(points.length, 64); s++) {
  const { localScale } = geometryNeighbourhood(points, s, { k: 4 });
  if (localScale > 1e-9) spacings.push(localScale);
}
spacings.sort((a, b) => a - b);
const nn = spacings[Math.floor(spacings.length / 2)];
const distanceLimit = Math.max(nn * 2.5, diag * 0.01, 1e-4);
const normalCos = Math.cos(28 * Math.PI / 180);
const COLOR_THRESHOLD = 40;

// Point-weighted purity, not just component-count purity: a single big
// impure blob splitting into several smaller still-imperfect pieces counts
// as MORE "mixed components" even if it's an objective improvement, so
// component-count alone can mislead. This reports what fraction of ALL
// points end up in a pure vs. mixed vs. singleton component.
function purityWeighted(components, pts) {
  let purePts = 0, mixedPts = 0, singletonPts = 0;
  for (const comp of components) {
    if (comp.length < 4) { singletonPts += comp.length; continue; }
    const houses = new Set(comp.map(i => pts[i].house));
    const faces = new Set(comp.map(i => pts[i].faceKey));
    if (houses.size === 1 && faces.size === 1) purePts += comp.length;
    else mixedPts += comp.length;
  }
  const total = purePts + mixedPts + singletonPts;
  return { purePts, mixedPts, singletonPts, purePct: (100 * purePts / total).toFixed(1) + '%' };
}

for (const mode of ['geometry-only', 'vp-only', 'geometry+vp', 'geometry+color', 'all-three']) {
  const comps = segment(points, { distanceLimit, normalCos, colorThreshold: COLOR_THRESHOLD, useVp: true, mode });
  console.log(`\n=== ${mode} ===`);
  console.log(`components: ${comps.length}`, purity(comps, points));
  console.log('point-weighted:', purityWeighted(comps, points));
}

// Diagnose WHY vp-only underperforms: the 6-cardinal-axis nearest-snap
// partitions the sphere into wide ~90deg-diameter Voronoi cells (boundary at
// 45deg from each axis) -- far coarser than the 28deg pairwise threshold
// geometry-only uses directly. Two points whose true normals differ by, say,
// 40-60deg (a corner-blend zone) can both fall in the SAME nearest-axis cell
// and therefore "match" under vp-only, even though a direct pairwise 28deg
// check would have rejected them. Quantify how often that happens.
let bothSnapSameAxisButOver28 = 0, checked = 0;
for (let i = 0; i < points.length; i += 7) {
  for (let j = i + 1; j < Math.min(points.length, i + 50); j++) {
    const a = normals[i].normal, b = normals[j].normal;
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    checked++;
    if (snapped[i].axisId === snapped[j].axisId && dot < normalCos) bothSnapSameAxisButOver28++;
  }
}
console.log(`\nDiagnosis: of ${checked} nearby point-pairs sampled, ${bothSnapSameAxisButOver28} snap to the SAME cardinal axis despite their raw normals being >28deg apart -- the coarse ~90deg snap cell is the reason vp-only is more permissive than the direct pairwise angle check, not less.`);
