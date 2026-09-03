// SCRATCH -- round 22, direct implementation of the crossing rule specified
// in docs/billige-raumhypothesen-tiefengrenzen.md ("Tron-Bike / Boundary
// Tracing", step 5): at a crossing/stall, the tracer should not just check
// "does this candidate direction have edge support a few steps ahead"
// (round 20's rule, scratch-tron-boundary-tracer.mjs) -- it should follow
// the branch whose LOCAL SIDE carries the strongest connected COMPATIBLE
// MASS. Implemented as: for each candidate direction, run a small bounded
// flood-fill on the interior side (depth-compatible pixels within a local
// tolerance, capped radius) and pick the direction with the largest
// reachable mass, not just "some edge pixels ahead."
//
// Tested on VLG-02 (real dirF fit, real ground truth for house4), same seed
// region as round 20, to give a direct, comparable result.
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

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [H, W] = pd.dims;
const rawDepth = Array.from(pd.data);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

const result = await page.evaluate(({ rawDepth, W, H, familyAnglesDeg }) => {
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
  const edgeThreshold = sorted[Math.floor(sorted.length * 0.85)];
  function isEdge(x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return true; // treat out-of-bounds as a wall
    return gradMag[yi * W + xi] > edgeThreshold;
  }
  function edgeSupport(x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
    return gradMag[yi * W + xi] > edgeThreshold ? 1 : 0;
  }

  // Bounded local mass: from a starting point just to one side of a
  // candidate direction, flood-fill depth-compatible (within tolerance),
  // non-edge pixels up to a capped radius/budget. Returns the mass size --
  // the crossing rule's "staerkste zusammenhaengende kompatible Masse."
  function localMass(startX, startY, radius, budget) {
    const baseDepth = at(startX, startY);
    const tol = 8; // depth-compatibility tolerance, small relative to the 0-255-ish DA2 range
    const visited = new Set();
    const stack = [[Math.round(startX), Math.round(startY)]];
    let count = 0;
    while (stack.length && count < budget) {
      const [cx, cy] = stack.pop();
      const key = cx + ':' + cy;
      if (visited.has(key)) continue;
      visited.add(key);
      if (Math.hypot(cx - startX, cy - startY) > radius) continue;
      if (isEdge(cx, cy)) continue;
      if (Math.abs(at(cx, cy) - baseDepth) > tol) continue;
      count++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (cx + dx) + ':' + (cy + dy);
        if (!visited.has(nk)) stack.push([cx + dx, cy + dy]);
      }
    }
    return count;
  }

  const dirCandidates = [];
  for (const a of familyAnglesDeg) { dirCandidates.push(a); dirCandidates.push((a + 180) % 360); }

  function walkWithMassRule(startX, startY, startAngleDeg, opts) {
    const { stepPx = 3, maxSteps = 400, perpTolerance = 2, missTolerance = 4, closeDist = 12, massRadius = 10, massBudget = 120 } = opts;
    const path = [[startX, startY]];
    const turns = [];
    let x = startX, y = startY, angleDeg = startAngleDeg;
    let misses = 0;
    for (let step = 0; step < maxSteps; step++) {
      const rad = angleDeg * Math.PI / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad);
      const nx = x + ux * stepPx, ny = y + uy * stepPx;
      const px = -uy, py = ux;
      let supported = false;
      for (let p = -perpTolerance; p <= perpTolerance && !supported; p++) {
        if (edgeSupport(nx + px * p, ny + py * p)) supported = true;
      }
      if (supported) { x = nx; y = ny; misses = 0; path.push([x, y]); continue; }
      misses++;
      if (misses <= missTolerance) { x = nx; y = ny; path.push([x, y]); continue; }

      // Stall: apply the MASS-COMPATIBILITY crossing rule instead of round
      // 20's "any edge support ahead" rule. For each candidate direction
      // (excluding near-current heading), measure the local compatible mass
      // just off to its interior side and pick the strongest.
      let best = null, bestMass = -1;
      for (const cand of dirCandidates) {
        const cdiff = Math.min(Math.abs(cand - angleDeg), 360 - Math.abs(cand - angleDeg));
        if (cdiff < 30) continue;
        const crad = cand * Math.PI / 180;
        const cux = Math.cos(crad), cuy = Math.sin(crad);
        const cpx = -cuy, cpy = cux;
        // Sample the mass a few px to one perpendicular side of the
        // candidate line, a few steps ahead -- the "interior" a real
        // boundary walk would keep on one fixed hand.
        const probeX = x + cux * stepPx * 2 + cpx * 6, probeY = y + cuy * stepPx * 2 + cpy * 6;
        const mass = localMass(probeX, probeY, massRadius, massBudget);
        if (mass > bestMass) { bestMass = mass; best = cand; }
      }
      if (best !== null && bestMass > 5) {
        angleDeg = best; misses = 0; turns.push({ step, at: [x, y], newAngle: best, mass: bestMass });
      } else {
        break; // no candidate direction has a meaningful local mass -- real dead end
      }
      if (step > 20 && Math.hypot(x - startX, y - startY) < closeDist) { path.push([startX, startY]); return { path, turns, closed: true, steps: step }; }
    }
    return { path, turns, closed: false, steps: path.length };
  }

  const searchBox = [80, 200, 440, 430];
  let seed = null, seedGrad = 0;
  for (let y = searchBox[1]; y < searchBox[3]; y += 2) for (let x = searchBox[0]; x < searchBox[2]; x += 2) {
    const g = gradMag[y * W + x];
    if (g > seedGrad) { seedGrad = g; seed = [x, y]; }
  }

  const attempts = [];
  for (const angle of dirCandidates) {
    const r = walkWithMassRule(seed[0], seed[1], angle, {});
    attempts.push({ angle, closed: r.closed, steps: r.steps, turns: r.turns, path: r.path });
  }
  attempts.sort((a, b) => (b.closed - a.closed) || (b.steps - a.steps));
  const best = attempts[0];

  return {
    seed, seedGrad, edgeThreshold,
    summary: attempts.map((a) => ({ angle: a.angle, closed: a.closed, steps: a.steps, nTurns: a.turns.length })),
    bestPath: best.path, bestClosed: best.closed, bestTurns: best.turns,
  };
}, { rawDepth, W, H, familyAnglesDeg });

console.log(`\nSeed: ${JSON.stringify(result.seed)} grad=${result.seedGrad.toFixed(1)} edgeThreshold=${result.edgeThreshold.toFixed(3)}`);
console.log('\nTrace attempts (mass-compatibility crossing rule):');
for (const a of result.summary) console.log(`  angle=${a.angle.toFixed(0)}deg closed=${a.closed} steps=${a.steps} turns=${a.nTurns}`);
console.log(`\nBest trace: closed=${result.bestClosed}, ${result.bestPath.length} path points, ${result.bestTurns.length} turns.`);
for (const t of result.bestTurns) console.log(`  turn at step ${t.step}, pos=${JSON.stringify(t.at.map((v) => Math.round(v)))}, newAngle=${t.newAngle.toFixed(0)}deg, mass=${t.mass}`);

fs.writeFileSync(path.join(OUT, 'tron-tracer-mass-rule-result.json'), JSON.stringify(result, null, 2));
await browser.close();
