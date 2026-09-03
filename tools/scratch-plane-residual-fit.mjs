// SCRATCH -- round 24, the load-bearing missing stage the maintainer's
// pipeline spec named directly: everything built in rounds 17-23 stayed in
// 2D PIXEL SPACE (depth-edge masks, flood-filled blobs, bounding boxes).
// None of it ever back-projected a region to 3D and tested whether it's
// actually geometrically consistent -- a "coarse region" was accepted on
// 2D shape/size alone. The spec's pipeline inserts a real geometric test
// between region growing and volume closing:
//
//   Region Growing im Bildraum
//     -> RANSAC-/Least-Squares-Plane Fit im rueckprojizierten Raum
//     -> Plane Residual Map
//     -> Split, Merge oder Expand
//
// This implements that stage: for each of round 18/23's coarse depth-edge
// regions (found via VP-directional gap-closing), back-project its pixels
// to 3D via a pinhole camera model (same approach as
// scratch-test-depthmap-rotation-limits.mjs), fit a plane by least-squares,
// and compute the residual (perpendicular distance) per point. A real
// house's ROOF or WALL face should fit a plane tightly (low residual); a
// region that's actually two different faces merged (the round 18/19
// failure mode) should show a bimodal/high residual -- this is the first
// real geometric consistency check in this whole pipeline, not a 2D
// shape/size proxy for one.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF, T, scale } = recon;
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
function screenPoint(p3) { let x = 0, y = 0; for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; } return [x, y]; }
const groundTruthCentroids = Object.entries(T).map(([name, pos]) => {
  const sc = scale[name];
  const center = [pos[0] + 0.5 * sc[0], pos[1] + 0.5 * sc[1], pos[2] + 0.5 * sc[2]];
  return { name, screen: screenPoint(center) };
});

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [H, W] = pd.dims;
const rawDepth = Array.from(pd.data);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

const result = await page.evaluate(({ rawDepth, W, H, familyAnglesDeg, groundTruthCentroids }) => {
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return rawDepth[yi * W + xi]; }
  const gradMag = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    gradMag[y * W + x] = Math.hypot(gx, gy);
  }
  const sorted = Array.from(gradMag).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.90)];
  const baseMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) baseMask[i] = gradMag[i] > threshold ? 1 : 0;
  function directionalClose(mask, angleDeg, gapLength) {
    const rad = angleDeg * Math.PI / 180, ux = Math.cos(rad), uy = Math.sin(rad);
    const out = mask.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (let t = -gapLength; t <= gapLength; t++) {
        const nx = Math.round(x + ux * t), ny = Math.round(y + uy * t);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        out[ny * W + nx] = 1;
      }
    }
    return out;
  }
  let mask = baseMask;
  for (const angle of familyAnglesDeg) mask = directionalClose(mask, angle, 8);

  const visited = new Uint8Array(W * H);
  const comps = [];
  const MIN_SIZE = Math.round(W * H * 0.0005);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (visited[idx] || mask[idx]) continue;
    const stack = [[x, y]]; visited[idx] = 1;
    const pixels = [];
    let minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const [cx, cy] = stack.pop(); pixels.push([cx, cy]);
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nidx = ny * W + nx;
        if (visited[nidx] || mask[nidx]) continue;
        visited[nidx] = 1; stack.push([nx, ny]);
      }
    }
    if (pixels.length >= MIN_SIZE) comps.push({ pixels, bbox: [minX, minY, maxX, maxY], count: pixels.length });
  }
  comps.sort((a, b) => b.count - a.count);

  // Match ground truth to identify WHICH regions are real houses, so the
  // plane-fit test runs on genuinely relevant regions (not random ground
  // fragments).
  const houseRegions = [];
  for (const gt of groundTruthCentroids) {
    const [gx, gy] = gt.screen;
    const hit = comps.slice(1).find((c) => gx >= c.bbox[0] && gx <= c.bbox[2] && gy >= c.bbox[1] && gy <= c.bbox[3]);
    if (hit) houseRegions.push({ name: gt.name, region: hit });
  }

  // Pinhole back-projection, same model as scratch-test-depthmap-rotation-limits.mjs.
  const FOV_DEG = 50, NEAR = 200, FAR = 900;
  const aspect = W / H;
  const fRad = FOV_DEG * Math.PI / 180;
  function backProject(x, y) {
    const gray = at(x, y);
    const z = NEAR + (255 - gray) / 255 * (FAR - NEAR);
    const ndcX = (x / W) * 2 - 1, ndcY = 1 - (y / H) * 2;
    const camX = ndcX * Math.tan(fRad / 2) * z * aspect;
    const camY = ndcY * Math.tan(fRad / 2) * z;
    return [camX, camY, z];
  }

  // Least-squares plane fit via PCA (normal = eigenvector of smallest
  // eigenvalue of the covariance matrix) -- the standard method, no
  // external library needed for 3x3.
  function fitPlane(points3d) {
    const n = points3d.length;
    let cx = 0, cy = 0, cz = 0;
    for (const p of points3d) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= n; cy /= n; cz /= n;
    let sxx = 0, syy = 0, szz = 0, sxy = 0, sxz = 0, syz = 0;
    for (const p of points3d) {
      const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
      sxx += dx * dx; syy += dy * dy; szz += dz * dz;
      sxy += dx * dy; sxz += dx * dz; syz += dy * dz;
    }
    const cov = [[sxx / n, sxy / n, sxz / n], [sxy / n, syy / n, syz / n], [sxz / n, syz / n, szz / n]];
    // Jacobi eigenvalue sweep for a symmetric 3x3 (small, few iterations suffice).
    let a = cov.map((r) => r.slice());
    let v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 30; sweep++) {
      let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
      if (off < 1e-9) break;
      for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-12) continue;
        const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
        const c = Math.cos(phi), s = Math.sin(phi);
        for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
      }
    }
    const eigVals = [a[0][0], a[1][1], a[2][2]];
    let minIdx = 0; for (let i = 1; i < 3; i++) if (eigVals[i] < eigVals[minIdx]) minIdx = i;
    const normal = [v[0][minIdx], v[1][minIdx], v[2][minIdx]];
    const nlen = Math.hypot(...normal) || 1;
    const normUnit = normal.map((c) => c / nlen);
    return { center: [cx, cy, cz], normal: normUnit, planarity: 1 - eigVals[minIdx] / (eigVals[0] + eigVals[1] + eigVals[2]) };
  }

  const houseResults = houseRegions.map(({ name, region }) => {
    // Subsample for speed if the region is large.
    const step = Math.max(1, Math.floor(region.pixels.length / 3000));
    const sampled = region.pixels.filter((_, i) => i % step === 0);
    const points3d = sampled.map(([x, y]) => backProject(x, y));
    const plane = fitPlane(points3d);
    const residuals = points3d.map((p) => {
      const d = [p[0] - plane.center[0], p[1] - plane.center[1], p[2] - plane.center[2]];
      return Math.abs(d[0] * plane.normal[0] + d[1] * plane.normal[1] + d[2] * plane.normal[2]);
    });
    residuals.sort((a, b) => a - b);
    const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
    const median = residuals[Math.floor(residuals.length / 2)];
    const p90 = residuals[Math.floor(residuals.length * 0.9)];
    const max = residuals[residuals.length - 1];
    return { name, regionSize: region.count, sampledN: sampled.length, planarity: plane.planarity, residual: { mean, median, p90, max } };
  });

  return { houseResults };
}, { rawDepth, W, H, familyAnglesDeg, groundTruthCentroids });

console.log('Plane fit + residual per matched house region (LOD0, real dirF, real ground truth):\n');
for (const r of result.houseResults) {
  console.log(`${r.name}: regionSize=${r.regionSize}px sampled=${r.sampledN} planarity=${r.planarity.toFixed(4)}`);
  console.log(`  residual: mean=${r.residual.mean.toFixed(2)} median=${r.residual.median.toFixed(2)} p90=${r.residual.p90.toFixed(2)} max=${r.residual.max.toFixed(2)} (world units)`);
}
fs.writeFileSync(path.join(OUT, 'plane-residual-fit-result.json'), JSON.stringify(result, null, 2));
await browser.close();
