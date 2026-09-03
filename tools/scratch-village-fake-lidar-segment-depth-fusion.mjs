// SCRATCH -- round 16, the actual fusion promised at the end of the DA2
// rotation-limit test: DA2's dense depth map as a FIFTH evidence channel in
// the frozen-anchor multi-channel segmentation (rounds 6-11: geometry,
// color, LBP, Gabor, autocorrelation, VP-snap). Same recipe throughout this
// session -- small geometry+color-trusted core, average the channel's value
// over that core, freeze it, compare all further candidates continuously
// against the frozen reference, never a drifting/pairwise comparison (round
// 5 already showed those lose to the frozen-anchor form).
//
// For each of the already-reconstructed 3D points (village-fake-lidar cloud,
// cached with real RGB), recovers its 2D screen position via the SAME
// screenPoint() projection the affine solver itself uses, samples the real
// DA2 depth value there, and uses local depth continuity as a connectivity
// condition -- exactly the kind of channel round 16 was promised to add:
// dense LEARNED depth alongside the sparse MEASURED box geometry, not a
// replacement for either.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimatePointNormalsRobust, geometryNeighbourhood } from '../runtime/spatial-kernel/reconstruction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const REPO_ROOT = path.join(__dirname, '..');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF } = recon;
const cachePath = path.join(OUT, 'village-fake-lidar-points-rgb.json');
if (!fs.existsSync(cachePath)) { console.error('Run scratch-village-fake-lidar-segment-color.mjs first.'); process.exit(1); }
const points = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
console.log(`Loaded ${points.length} cached points.`);

function screenPoint(p3) {
  let x = 0, y = 0;
  for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; }
  return [x, y];
}

console.log('Running Depth Anything V2 Small on the same source image...');
const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const imgPath = path.join(REPO_ROOT, 'file_000000006d188210a9bb1129089a7b29.png');
const { depth } = await depthEstimator(imgPath);
console.log(`DA2 depth map: ${depth.width}x${depth.height}`);

// The DA2 depth map is at its own resolution (1536x1024), NOT the source
// image's native resolution -- need to map screen (sx,sy) in source-image
// pixel space to depth-map pixel space. recon.W/H are the source image dims
// the affine solver itself used.
const { W: imgW, H: imgH } = recon;
function sampleDepth(sx, sy) {
  const dx = Math.max(0, Math.min(depth.width - 1, Math.round((sx / imgW) * depth.width)));
  const dy = Math.max(0, Math.min(depth.height - 1, Math.round((sy / imgH) * depth.height)));
  return depth.data[dy * depth.width + dx];
}

for (const p of points) {
  const [sx, sy] = screenPoint([p.x, p.y, p.z]);
  p.da = sampleDepth(sx, sy);
}
const daVals = points.map((p) => p.da);
console.log(`DA2 depth samples: min=${Math.min(...daVals)} max=${Math.max(...daVals)}`);

function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
function buildBuckets(pts, cellSize) { const buckets = new Map(); for (let i = 0; i < pts.length; i++) { const p = pts[i]; const k = [Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize)].join(':'); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); } return buckets; }
function purityWeighted(components, pts) {
  let purePts = 0, mixedPts = 0, singletonPts = 0;
  for (const comp of components) {
    if (comp.length < 4) { singletonPts += comp.length; continue; }
    const houses = new Set(comp.map((i) => pts[i].house)); const faces = new Set(comp.map((i) => pts[i].faceKey));
    if (houses.size === 1 && faces.size === 1) purePts += comp.length; else mixedPts += comp.length;
  }
  const total = purePts + mixedPts + singletonPts;
  return { components: components.length, purePts, mixedPts, singletonPts, purePct: (100 * purePts / total).toFixed(1) + '%' };
}

const normals = estimatePointNormalsRobust(points, { k: 16 });
const diag = Math.hypot(
  Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
  Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z)),
);
const spacings = [];
for (let s = 0; s < Math.min(points.length, 64); s++) { const { localScale } = geometryNeighbourhood(points, s, { k: 4 }); if (localScale > 1e-9) spacings.push(localScale); }
spacings.sort((a, b) => a - b);
const nn = spacings[Math.floor(spacings.length / 2)];
const distanceLimit = Math.max(nn * 2.5, diag * 0.01, 1e-4);
const normalCos28 = Math.cos(28 * Math.PI / 180);
const COLOR_THRESHOLD = 40;

// DA depth threshold picked the same way COLOR_THRESHOLD was in round 2:
// from THIS point cloud's own random-pair distribution, not an external
// constant.
const dd = [];
for (let i = 0; i < 3000; i++) { const a = points[Math.floor(Math.random() * points.length)], b = points[Math.floor(Math.random() * points.length)]; dd.push(Math.abs(a.da - b.da)); }
dd.sort((a, b) => a - b);
console.log(`Random-pair |DA depth diff|: p10=${dd[300]} p50=${dd[1500]} p90=${dd[2700]}`);
const DA_THRESHOLD = dd[Math.floor(dd.length * 0.25)];

function segment(pts, opts) {
  const { anchorSize, useDa, useLbpProxy } = opts; // useLbpProxy left off here -- LBP anchor reused from round 6's own cache would need its own resample; this round isolates DA's marginal contribution on top of geometry+color, matching how VP's marginal contribution was isolated in round 7 before the round-8 combination.
  const buckets = buildBuckets(pts, distanceLimit);
  const n = pts.length;
  const visited = new Uint8Array(n), components = [];
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;
    const comp = [seed]; visited[seed] = 1;
    let frozenDa = null, sumDa = pts[seed].da, anchorCount = 1;
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
          const distv = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
          if (distv > distanceLimit) continue;
          const nCur = normals[cur].normal, nNext = normals[next].normal;
          const geomOk = (nCur[0] * nNext[0] + nCur[1] * nNext[1] + nCur[2] * nNext[2]) >= normalCos28;
          if (!geomOk) continue;
          if (colorDist(p, q) > COLOR_THRESHOLD) continue;
          if (useDa && frozenDa != null) { if (Math.abs(frozenDa - q.da) > DA_THRESHOLD) continue; }
          visited[next] = 1; queue.push(next); comp.push(next);
          if (useDa && frozenDa == null && anchorCount < anchorSize) {
            sumDa += q.da; anchorCount++;
            if (anchorCount >= anchorSize) frozenDa = sumDa / anchorCount;
          }
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}

console.log('\n=== geometry+color baseline (no DA) ===');
console.log(purityWeighted(segment(points, { anchorSize: 5, useDa: false }), points));
console.log('\n=== geometry+color+frozen-DA-depth-anchor ===');
console.log(purityWeighted(segment(points, { anchorSize: 5, useDa: true }), points));

// DA-only (no color, no geometry-normal check -- just distance + frozen DA
// depth) to report its standalone strength honestly, same as every other
// channel this session tested alone.
function segmentDaOnly(pts, opts) {
  const { anchorSize } = opts;
  const buckets = buildBuckets(pts, distanceLimit);
  const n = pts.length;
  const visited = new Uint8Array(n), components = [];
  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;
    const comp = [seed]; visited[seed] = 1;
    let frozenDa = null, sumDa = pts[seed].da, anchorCount = 1;
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
          const distv = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
          if (distv > distanceLimit) continue;
          if (frozenDa != null && Math.abs(frozenDa - q.da) > DA_THRESHOLD) continue;
          visited[next] = 1; queue.push(next); comp.push(next);
          if (frozenDa == null && anchorCount < anchorSize) { sumDa += q.da; anchorCount++; if (anchorCount >= anchorSize) frozenDa = sumDa / anchorCount; }
        }
      }
    }
    components.push(comp);
  }
  return components.sort((a, b) => b.length - a.length);
}
console.log('\n=== DA-depth-anchor only (no color, no geometry-normal check) ===');
console.log(purityWeighted(segmentDaOnly(points, { anchorSize: 5 }), points));
