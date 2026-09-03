// SCRATCH -- round 17 continued, testing the premise behind the maintainer's
// proposed fix ("erst Fluchtpunkte, dann flood fill... die Grenzen den
// Operatoren bewusst machen, oder wir schneiden da sauber ab"): before
// building a full VP-direction gap-completion algorithm (a bigger piece of
// work), check whether the boundaries of the depth-edge coarse regions that
// DID separate cleanly (orange/blue/pink/purple/teal in
// depth-edge-raw-diagnostic.png) actually align with the 3 known
// vanishing-point family directions (dirF, from the affine solver). If they
// do, that validates using dirF-constrained lines to bridge the gaps in the
// houses that leaked into the ground -- if they don't, the fix needs
// rethinking before being built.
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
// dirF[f] is a 2D screen-space direction vector for family f (from the
// affine solver itself) -- convert to angles for comparison with the
// depth-edge regions' own edge-direction signature.
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
console.log('Known VP family angles (from the affine solver, dirF):', familyAnglesDeg.map((a) => a.toFixed(1)));

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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    gradMag[y * W + x] = Math.hypot(gx, gy);
  }
  const sorted = Array.from(gradMag).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.90)];
  let mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = gradMag[i] > threshold ? 1 : 0;
  for (let r = 0; r < 1; r++) {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (mask[idx]) { next[idx] = 1; continue; }
      let hit = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; if (mask[ny * W + nx]) { hit = 1; break; } }
      next[idx] = hit;
    }
    mask = next;
  }
  const visited = new Uint8Array(W * H);
  const comps = [];
  const MIN_SIZE = Math.round(W * H * 0.0005);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (visited[idx] || mask[idx]) continue;
    const stack = [[x, y]]; visited[idx] = 1;
    const pixels = [];
    while (stack.length) {
      const [cx, cy] = stack.pop(); pixels.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nidx = ny * W + nx;
        if (visited[nidx] || mask[nidx]) continue;
        visited[nidx] = 1; stack.push([nx, ny]);
      }
    }
    if (pixels.length >= MIN_SIZE) comps.push({ pixels, count: pixels.length });
  }
  comps.sort((a, b) => b.count - a.count);
  const candidateHouses = comps.slice(1, 8); // skip [0] = the big ground component

  // Convex hull + Douglas-Peucker + edge-direction-family signature, reused
  // from earlier rounds (fixture-taxonomie.md's polyedrisch-N test).
  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = []; for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop(); return lower.concat(upper);
  }
  function perpDist([px, py], [x1, y1], [x2, y2]) { const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy); if (len === 0) return Math.hypot(px - x1, py - y1); return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len; }
  function douglasPeucker(points, epsilon) {
    if (points.length < 3) return points;
    let maxDist = 0, index = 0; const first = points[0], last = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) { const d = perpDist(points[i], first, last); if (d > maxDist) { maxDist = d; index = i; } }
    if (maxDist > epsilon) { const l = douglasPeucker(points.slice(0, index + 1), epsilon), r = douglasPeucker(points.slice(index), epsilon); return l.slice(0, -1).concat(r); }
    return [first, last];
  }
  function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }

  const analyzed = candidateHouses.map((comp) => {
    const hull = convexHull(comp.pixels);
    const hullClosed = hull.concat([hull[0]]);
    const dp = douglasPeucker(hullClosed, 3.0).slice(0, -1);
    const edges = [];
    for (let i = 0; i < dp.length; i++) {
      const a = dp[i], b = dp[(i + 1) % dp.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 4) continue;
      edges.push({ angle: angleMod180(b[0] - a[0], b[1] - a[1]), len });
    }
    // For each edge, distance to the NEAREST known VP family angle.
    const angleDists = edges.map((e) => {
      const dists = familyAnglesDeg.map((fa) => Math.min(Math.abs(fa - e.angle), 180 - Math.abs(fa - e.angle)));
      return Math.min(...dists);
    });
    const totalLen = edges.reduce((s, e) => s + e.len, 0);
    const weightedAlignErr = edges.reduce((s, e, i) => s + angleDists[i] * e.len, 0) / (totalLen || 1);
    return { count: comp.count, vertexCount: dp.length, edgeAngles: edges.map((e) => Math.round(e.angle)), weightedAlignErrDeg: weightedAlignErr };
  });

  return { nCoarseComponents: comps.length, analyzed };
}, { rawDepth, W, H, familyAnglesDeg });

console.log(`\n${result.nCoarseComponents} coarse components found (excluding the largest = ground).`);
console.log('\nEdge-direction alignment with known VP family angles, for each candidate house region:');
for (const a of result.analyzed) {
  console.log(`  size=${a.count} vertices=${a.vertexCount} edgeAngles=${JSON.stringify(a.edgeAngles)} weightedAlignErr=${a.weightedAlignErrDeg.toFixed(1)}deg`);
}
const avgErr = result.analyzed.reduce((s, a) => s + a.weightedAlignErrDeg, 0) / result.analyzed.length;
console.log(`\nAverage weighted alignment error across regions: ${avgErr.toFixed(1)}deg`);
await browser.close();
