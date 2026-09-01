// SCRATCH -- round 23: the rigorous cross-image test this session has been
// trying to reach since round 13. LOD0/LOD1/LOD2 (file_000000006d188210a9bb1129089a7b29.png,
// file_00000000e96c8243b8a6e17ae2ac3bf2.png, file_000000008390820abdec286d1496006f.png)
// are confirmed (maintainer) to be the SAME scene composition at increasing
// render detail, same 1536x1024 framing. That means the REAL, measured VP
// fit (dirF) and house-center ground truth from LOD0's affine reconstruction
// apply DIRECTLY to LOD1/LOD2 -- no generic angle assumption (round 20's
// weakness), no rescaling needed (unlike LOD3/4 at a different resolution).
//
// Runs round 18's depth-edge + VP-directional-gap-closing pipeline,
// unmodified in method, against LOD0 (repro baseline), LOD1, LOD2 in turn.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF, T, scale } = recon;
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
function screenPoint(p3) { let x = 0, y = 0; for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; } return [x, y]; }
const groundTruthCentroids = Object.entries(T).map(([name, pos]) => {
  const sc = scale[name];
  const center = [pos[0] + 0.5 * sc[0], pos[1] + 0.5 * sc[1], pos[2] + 0.5 * sc[2]];
  return { name, screen: screenPoint(center) };
});
console.log('Known VP family angles (from LOD0):', familyAnglesDeg.map((a) => a.toFixed(1)));
console.log('Ground-truth house centroids (from LOD0, reused as-is for LOD1/2):', groundTruthCentroids.map((h) => `${h.name}=[${h.screen[0].toFixed(0)},${h.screen[1].toFixed(0)}]`).join(' '));

const LODS = [
  { name: 'LOD0 (flat box, baseline)', file: 'file_000000006d188210a9bb1129089a7b29.png' },
  { name: 'LOD1 (low-poly gable)', file: 'file_00000000e96c8243b8a6e17ae2ac3bf2.png' },
  { name: 'LOD2 (low-poly detailed gable)', file: 'file_000000008390820abdec286d1496006f.png' },
];

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

for (const lod of LODS) {
  const imgPath = path.join(__dirname, '..', lod.file);
  console.log(`\n=== ${lod.name} (${lod.file}) ===`);
  const output = await depthEstimator(imgPath);
  const pd = output.predicted_depth;
  const [H, W] = pd.dims;
  const rawDepth = Array.from(pd.data);

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
    function coarseComponents(isEdge) {
      const visited = new Uint8Array(W * H);
      const comps = [];
      const MIN_SIZE = Math.round(W * H * 0.0005);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx] || isEdge[idx]) continue;
        const stack = [[x, y]]; visited[idx] = 1;
        let count = 0, minX = x, maxX = x, minY = y, maxY = y;
        while (stack.length) {
          const [cx, cy] = stack.pop(); count++;
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
        if (count >= MIN_SIZE) comps.push({ bbox: [minX, minY, maxX, maxY], count });
      }
      return comps.sort((a, b) => b.count - a.count);
    }
    function matchGroundTruth(comps) {
      const candidates = comps.slice(1);
      let matched = 0;
      const details = [];
      for (const gt of groundTruthCentroids) {
        const [gx, gy] = gt.screen;
        const hit = candidates.find((c) => gx >= c.bbox[0] && gx <= c.bbox[2] && gy >= c.bbox[1] && gy <= c.bbox[3]);
        if (hit) { matched++; details.push(`${gt.name}: MATCHED (size=${hit.count})`); }
        else details.push(`${gt.name}: not separated`);
      }
      return { matched, details };
    }

    const baselineComps = coarseComponents(baseMask);
    const baselineMatch = matchGroundTruth(baselineComps);

    const sweepResults = [];
    for (const gapLength of [8, 15]) {
      let mask2 = baseMask;
      for (const angle of familyAnglesDeg) mask2 = directionalClose(mask2, angle, gapLength);
      const comps2 = coarseComponents(mask2);
      const match2 = matchGroundTruth(comps2);
      sweepResults.push({ gapLength, nComponents: comps2.length, matched: match2.matched, details: match2.details });
    }
    return { baseline: { nComponents: baselineComps.length, matched: baselineMatch.matched, details: baselineMatch.details }, sweepResults };
  }, { rawDepth, W, H, familyAnglesDeg, groundTruthCentroids });

  console.log(`  Baseline (no gap-closing): matched=${result.baseline.matched}/6`);
  for (const s of result.sweepResults) console.log(`  Gap-closed (gapLength=${s.gapLength}px): matched=${s.matched}/6`);
}

await browser.close();
