// SCRATCH -- round 7: applies the frozen-anchor fix that worked dramatically
// well for LBP (73.0% pure, see scratch-village-fake-lidar-segment-texture-region.mjs)
// to the VP-snap channel. Round 3 found naive per-point VP-snap (nearest of 6
// cardinal axes) was WORSE than geometry alone, because the ~90deg-wide snap
// cells are coarser than the 28deg pairwise angle check. This tests whether
// the same fix that helped LBP -- freeze a small trusted anchor's answer
// instead of deciding fresh per point/pair -- also fixes VP: grow a small
// geometry+color-trusted core first, average ITS normal, snap that ONE
// average to the nearest cardinal axis, freeze it, then check all further
// candidates' raw (un-snapped) normal against that single frozen axis via a
// continuous dot-product threshold (same style as the frozen LBP histogram
// comparison -- continuous distance to a fixed reference, not a fresh
// categorical decision per candidate).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimatePointNormalsRobust, geometryNeighbourhood } from '../runtime/spatial-kernel/reconstruction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const cachePath = path.join(OUT, 'village-fake-lidar-points-rgb.json');
if (!fs.existsSync(cachePath)) { console.error('Run scratch-village-fake-lidar-segment-color.mjs first.'); process.exit(1); }
const points = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
console.log(`Loaded ${points.length} cached points.`);

const CARDINAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function nearestAxis(v) {
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < CARDINAL.length; i++) { const d = v[0] * CARDINAL[i][0] + v[1] * CARDINAL[i][1] + v[2] * CARDINAL[i][2]; if (d > bestDot) { bestDot = d; best = i; } }
  return best;
}
function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
function buildBuckets(pts, cellSize) {
  const buckets = new Map();
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; const k = [Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize)].join(':'); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); }
  return buckets;
}
function purityWeighted(components, pts) {
  let purePts = 0, mixedPts = 0, singletonPts = 0;
  for (const comp of components) {
    if (comp.length < 4) { singletonPts += comp.length; continue; }
    const houses = new Set(comp.map(i => pts[i].house));
    const faces = new Set(comp.map(i => pts[i].faceKey));
    if (houses.size === 1 && faces.size === 1) purePts += comp.length; else mixedPts += comp.length;
  }
  const total = purePts + mixedPts + singletonPts;
  return { components: components.length, purePts, mixedPts, singletonPts, purePct: (100 * purePts / total).toFixed(1) + '%' };
}

const normals = estimatePointNormalsRobust(points, { k: 16 });
const diag = Math.hypot(
  Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
  Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
  Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z)),
);
const spacings = [];
for (let s = 0; s < Math.min(points.length, 64); s++) { const { localScale } = geometryNeighbourhood(points, s, { k: 4 }); if (localScale > 1e-9) spacings.push(localScale); }
spacings.sort((a, b) => a - b);
const nn = spacings[Math.floor(spacings.length / 2)];
const distanceLimit = Math.max(nn * 2.5, diag * 0.01, 1e-4);
const normalCos28 = Math.cos(28 * Math.PI / 180);
const COLOR_THRESHOLD = 40;

function segmentFrozenVp(pts, opts) {
  const { anchorSize, vpCos, useColor } = opts;
  const buckets = buildBuckets(pts, distanceLimit);
  const n = pts.length;
  const visited = new Uint8Array(n), components = [];
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;
    const comp = [seed]; visited[seed] = 1;
    let anchorAxisVec = null, sumNormal = [...normals[seed].normal], anchorCount = 1;
    const queue = [seed];
    while (queue.length) {
      const cur = queue.pop();
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
          const geomOk = (nCur[0] * nNext[0] + nCur[1] * nNext[1] + nCur[2] * nNext[2]) >= normalCos28;
          if (!geomOk) continue;
          if (useColor && colorDist(p, q) > COLOR_THRESHOLD) continue;
          if (anchorAxisVec) {
            const nq = normals[next].normal;
            const dot = nq[0] * anchorAxisVec[0] + nq[1] * anchorAxisVec[1] + nq[2] * anchorAxisVec[2];
            if (dot < vpCos) continue;
          }
          visited[next] = 1; queue.push(next); comp.push(next);
          if (!anchorAxisVec && anchorCount < anchorSize) {
            const nq = normals[next].normal;
            sumNormal[0] += nq[0]; sumNormal[1] += nq[1]; sumNormal[2] += nq[2];
            anchorCount++;
            if (anchorCount >= anchorSize) {
              const len = Math.hypot(sumNormal[0], sumNormal[1], sumNormal[2]) || 1;
              const avgNormal = [sumNormal[0] / len, sumNormal[1] / len, sumNormal[2] / len];
              anchorAxisVec = CARDINAL[nearestAxis(avgNormal)];
            }
          }
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}

console.log('\n=== frozen-anchor VP (geometry+color+frozen-VP) ===');
for (const anchorSize of [5, 20, 50]) {
  for (const vpCosDeg of [28, 45, 60]) {
    const comps = segmentFrozenVp(points, { anchorSize, vpCos: Math.cos(vpCosDeg * Math.PI / 180), useColor: true });
    console.log(`  anchorSize=${anchorSize} vpMargin=${vpCosDeg}deg:`, purityWeighted(comps, points));
  }
}
console.log('\n=== frozen-anchor VP without color (geometry+frozen-VP only) ===');
for (const anchorSize of [5, 20]) {
  const comps = segmentFrozenVp(points, { anchorSize, vpCos: Math.cos(45 * Math.PI / 180), useColor: false });
  console.log(`  anchorSize=${anchorSize}:`, purityWeighted(comps, points));
}
