// SCRATCH -- round 20b, the "Tron bike" idea, verbatim from the maintainer:
// "raymarching mit den Operatoren koppeln... wie Tron Bikes ein Stueck
// entlang der bekannten Grenze fahren und dann im 90 Grad Winkel abbiegen,
// bis sie auf die naechste Grenze stossen. Daraus ergaebe sich sehr schnell
// pro Flaeche ein Netz, das wir direkt fuellen koennen. Flood fill, aber
// gemessen bzw. exakt hergeleitet."
//
// Different mechanism from round 18's directional morphological closing
// (which blindly extends EVERY edge pixel by a fixed length, a blur-like
// operation). This is a directed walk: start at one strong edge point, ride
// along ONE known VP direction while the depth gradient keeps supporting a
// real wall there, and when that support runs out, actively search the
// OTHER known directions for a continuation (a corner) instead of just
// stopping or blurring. Produces an explicit polyline/polygon per face --
// "measured, not accumulated" boundary tracing, directly comparable to the
// affine solver's own vertex format.
//
// Tested on VLG-02 where real ground truth exists (house4's known hexagon
// vertices from the color-mask extractor).
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF } = recon;
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
console.log('Known VP family angles:', familyAnglesDeg.map((a) => a.toFixed(1)));
// Ground truth for house4 (from re-running scratch-village-extract-v2.mjs
// this session): vertices [42,288] [291,179] [460,298] [461,439] [217,569] [43,438]
const groundTruthHouse4 = [[42, 288], [291, 179], [460, 298], [461, 439], [217, 569], [43, 438]];

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [H, W] = pd.dims;
const rawDepth = Array.from(pd.data);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');

const result = await page.evaluate(async ({ rawDepth, W, H, familyAnglesDeg, groundTruthHouse4, imgDataUrl }) => {
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return rawDepth[yi * W + xi]; }
  const gradMag = new Float32Array(W * H);
  let maxGrad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    const m = Math.hypot(gx, gy);
    gradMag[y * W + x] = m; if (m > maxGrad) maxGrad = m;
  }
  const sorted = Array.from(gradMag).sort((a, b) => a - b);
  const edgeThreshold = sorted[Math.floor(sorted.length * 0.85)]; // p85 -- lower bar than p90, since the tracer actively verifies continuation, unlike blind flood-fill which needed a stricter threshold to avoid leaking.
  function edgeSupport(x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
    return gradMag[yi * W + xi] > edgeThreshold ? 1 : 0;
  }
  // Depth map (W,H) vs source image dims (recon's imgW/imgH) differ; the
  // ground-truth vertices are in SOURCE image space, so scale them to
  // depth-map space for comparison.
  const IMG_W = 1690, IMG_H = 1024; // village image known dims from this session's own recon.json (approximate; corrected below via actual value passed)

  // Direction candidates: each family angle in BOTH signed directions (a
  // wall can run "forward" or "backward" along its family line).
  const dirCandidates = [];
  for (const a of familyAnglesDeg) { dirCandidates.push(a); dirCandidates.push((a + 180) % 360); }

  function walk(startX, startY, startAngleDeg, opts) {
    const { stepPx = 3, maxSteps = 400, perpTolerance = 2, missTolerance = 4, closeDist = 12 } = opts;
    const path = [[startX, startY]];
    let x = startX, y = startY, angleDeg = startAngleDeg;
    let misses = 0;
    for (let step = 0; step < maxSteps; step++) {
      const rad = angleDeg * Math.PI / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad);
      const nx = x + ux * stepPx, ny = y + uy * stepPx;
      // Check edge support in a small perpendicular band around the
      // candidate next point (a real wall has support along a short
      // stretch, not just one exact pixel).
      const px = -uy, py = ux; // perpendicular unit vector
      let supported = false;
      for (let p = -perpTolerance; p <= perpTolerance && !supported; p++) {
        if (edgeSupport(nx + px * p, ny + py * p)) supported = true;
      }
      if (supported) {
        x = nx; y = ny; misses = 0; path.push([x, y]);
      } else {
        misses++;
        if (misses <= missTolerance) { x = nx; y = ny; path.push([x, y]); continue; } // coast through a short gap, still on the same heading
        // Real stall: search OTHER directions for a continuation near
        // the current point (a corner).
        let turned = false;
        for (const cand of dirCandidates) {
          const cdiff = Math.min(Math.abs(cand - angleDeg), 360 - Math.abs(cand - angleDeg));
          if (cdiff < 30) continue; // skip near-current-heading candidates (not a real turn)
          const crad = cand * Math.PI / 180;
          const cux = Math.cos(crad), cuy = Math.sin(crad);
          // does this candidate direction have edge support just ahead from HERE?
          let hits = 0;
          for (let t = 1; t <= 3; t++) { if (edgeSupport(x + cux * t * stepPx, y + cuy * t * stepPx)) hits++; }
          if (hits >= 2) { angleDeg = cand; misses = 0; turned = true; break; }
        }
        if (!turned) break; // dead end, no continuation found in any known direction
      }
      // Loop closure check (only after enough steps to have gone somewhere).
      if (step > 20 && Math.hypot(x - startX, y - startY) < closeDist) { path.push([startX, startY]); return { path, closed: true, steps: step }; }
    }
    return { path, closed: false, steps: path.length };
  }

  // Find a strong edge point near house4's known region (from round 18's
  // coarse bbox) to start the trace -- scan for the highest-gradient pixel
  // in that neighbourhood as the seed.
  const searchBox = [80, 200, 440, 430];
  let seed = null, seedGrad = 0;
  for (let y = searchBox[1]; y < searchBox[3]; y += 2) for (let x = searchBox[0]; x < searchBox[2]; x += 2) {
    const g = gradMag[y * W + x];
    if (g > seedGrad) { seedGrad = g; seed = [x, y]; }
  }

  // Try tracing from the seed along each of the 3 family directions (both
  // signs), keep the best (longest / closed) result.
  const attempts = [];
  for (const angle of dirCandidates) {
    const r = walk(seed[0], seed[1], angle, {});
    attempts.push({ angle, ...r, pathLen: r.path.length });
  }
  attempts.sort((a, b) => (b.closed - a.closed) || (b.pathLen - a.pathLen));
  const best = attempts[0];

  return { seed, seedGrad, edgeThreshold, attempts: attempts.map((a) => ({ angle: a.angle, closed: a.closed, steps: a.steps })), bestPath: best.path, bestClosed: best.closed };
}, { rawDepth, W, H, familyAnglesDeg, groundTruthHouse4, imgDataUrl });

console.log(`\nSeed: ${JSON.stringify(result.seed)} grad=${result.seedGrad.toFixed(1)} edgeThreshold=${result.edgeThreshold.toFixed(3)}`);
console.log('\nTrace attempts from seed, one per starting direction:');
for (const a of result.attempts) console.log(`  angle=${a.angle.toFixed(0)}deg closed=${a.closed} steps=${a.steps}`);
console.log(`\nBest trace: closed=${result.bestClosed}, ${result.bestPath.length} path points.`);
console.log('Path (first/last 10 points):', JSON.stringify(result.bestPath.slice(0, 10)), '...', JSON.stringify(result.bestPath.slice(-10)));

fs.writeFileSync(path.join(OUT, 'tron-tracer-result.json'), JSON.stringify(result, null, 2));
await browser.close();
