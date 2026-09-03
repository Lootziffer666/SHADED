// SCRATCH -- round 18, the actual gap-completion procedure requested after
// round 17 validated its premise (depth-edge silhouette boundaries align
// with the 3 known VP family directions to ~9.1deg average error, far
// better than the ~45% baseline expected from unrelated edges).
//
// Technique: DIRECTIONAL morphological closing, not isotropic dilation
// (round 17's isotropic dilate=1/2/3 either did too little or started
// re-introducing noise). For each of the 3 known family angles (dirF, from
// the affine solver), every existing edge pixel gets a short line segment
// drawn THROUGH it in that specific direction (length capped at GAP_LENGTH
// px). This bridges genuine gaps that run along a known wall direction
// without smearing edges in unrelated directions -- the "Grenzen den
// Operatoren bewusst machen" idea, implemented as: complete the boundary
// using the known geometric prior, THEN flood-fill within it.
//
// Validated against real ground truth: re-runs the color-mask extractor
// (scratch-village-extract-v2.mjs's own logic, known to produce 6 correct
// houses) to get real house centroids, then checks how many of the 6 are
// recovered as distinct components before vs. after gap-closing.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF, T } = recon;
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
console.log('Known VP family angles:', familyAnglesDeg.map((a) => a.toFixed(1)));

// Ground-truth house centroids: re-derive from the affine reconstruction's
// own box geometry via the same screenPoint projection, so this is exact,
// not eyeballed. NOTE: T[name] is the box's LOCAL (0,0,0) corner, which this
// session's own earlier notes establish is the fully-HIDDEN corner -- its
// projection does not fall inside the visible silhouette. Use the box
// CENTER (local (0.5,0.5,0.5): T + 0.5*scale) instead, which does.
const { scale } = recon;
function screenPoint(p3) { let x = 0, y = 0; for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; } return [x, y]; }
const groundTruthCentroids = Object.entries(T).map(([name, pos]) => {
  const sc = scale[name];
  const center = [pos[0] + 0.5 * sc[0], pos[1] + 0.5 * sc[1], pos[2] + 0.5 * sc[2]];
  return { name, screen: screenPoint(center) };
});
console.log('Ground-truth house centroids (screen space):', groundTruthCentroids.map((h) => `${h.name}=[${h.screen[0].toFixed(0)},${h.screen[1].toFixed(0)}]`).join(' '));

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
    const rad = angleDeg * Math.PI / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
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

  function coarseComponents(isEdge) {
    const visited = new Uint8Array(W * H);
    const comps = [];
    const MIN_SIZE = Math.round(W * H * 0.0005);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx] || isEdge[idx]) continue;
      const stack = [[x, y]]; visited[idx] = 1;
      let count = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop(); count++; sx += cx; sy += cy;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nidx = ny * W + nx;
          if (visited[nidx] || isEdge[nidx]) continue;
          visited[nidx] = 1; stack.push([nx, ny]);
        }
      }
      if (count >= MIN_SIZE) comps.push({ bbox: [minX, minY, maxX, maxY], count, cx: sx / count, cy: sy / count });
    }
    return comps.sort((a, b) => b.count - a.count);
  }

  function matchGroundTruth(comps) {
    // Skip the largest component (ground). For each ground-truth house
    // centroid, find the nearest OTHER component whose bbox actually
    // contains that centroid (a real match, not just "nearest by distance"
    // which could match the giant ground blob).
    const candidates = comps.slice(1);
    let matched = 0;
    const details = [];
    for (const gt of groundTruthCentroids) {
      const [gx, gy] = gt.screen;
      const hit = candidates.find((c) => gx >= c.bbox[0] && gx <= c.bbox[2] && gy >= c.bbox[1] && gy <= c.bbox[3]);
      if (hit) { matched++; details.push(`${gt.name}: MATCHED (component size=${hit.count})`); }
      else { details.push(`${gt.name}: not separated (still merged with ground or missing)`); }
    }
    return { matched, details };
  }

  // Baseline: no gap-closing (round 17's best raw-depth result).
  let mask1 = baseMask.slice();
  for (let r = 0; r < 1; r++) {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (mask1[idx]) { next[idx] = 1; continue; }
      let hit = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (mask1[ny * W + nx]) { hit = 1; break; } }
      next[idx] = hit;
    }
    mask1 = next;
  }
  const baselineComps = coarseComponents(mask1);
  const baselineMatch = matchGroundTruth(baselineComps);

  // Gap-closed: directional closing along all 3 known VP angles.
  const sweepResults = [];
  for (const gapLength of [8, 15, 25, 40]) {
    let mask2 = baseMask;
    for (const angle of familyAnglesDeg) mask2 = directionalClose(mask2, angle, gapLength);
    const comps2 = coarseComponents(mask2);
    const match2 = matchGroundTruth(comps2);
    sweepResults.push({ gapLength, nComponents: comps2.length, largestFrac: comps2[0].count / (W * H), matched: match2.matched, details: match2.details });
  }

  return { baseline: { nComponents: baselineComps.length, largestFrac: baselineComps[0].count / (W * H), matched: baselineMatch.matched, details: baselineMatch.details }, sweepResults };
}, { rawDepth, W, H, familyAnglesDeg, groundTruthCentroids });

console.log('\n=== Baseline (no gap-closing, round 17 result) ===');
console.log(`nComponents=${result.baseline.nComponents} largestFrac=${(result.baseline.largestFrac * 100).toFixed(1)}% matched=${result.baseline.matched}/6`);
console.log(result.baseline.details.join('\n'));

console.log('\n=== Gap-closing sweep (directional closing along 3 VP angles) ===');
for (const s of result.sweepResults) {
  console.log(`\ngapLength=${s.gapLength}px: nComponents=${s.nComponents} largestFrac=${(s.largestFrac * 100).toFixed(1)}% matched=${s.matched}/6`);
  console.log(s.details.join('\n'));
}
await browser.close();
