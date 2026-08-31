// SCRATCH -- minimal Surface Cultivator, RGB-appearance variant.
//
// The grayscale version of this image had a genuine, confirmed limit:
// two real inter-object boundaries (cube2/cube3 ~10-13 luminance units,
// cube3/cube4 ~5-9 units) were comparable to or SMALLER than normal
// within-face shading noise (~8 units) -- no single luminance threshold
// could catch both without also fragmenting faces. The maintainer then
// supplied a colored version of the same scene. Directly measured at
// the exact same pixels that failed before: cube3/cube4 now jumps
// (190,39,39)->(232,96,1) and cube2/cube3 jumps (14,90,177)->(209,32,33)
// -- both are now huge, unambiguous color differences instead of faint
// luminance steps. This variant uses full RGB appearance (Euclidean
// distance) instead of luminance to test whether that removes the leak
// without needing a bounding box, tighter thresholds, or the more
// elaborate persistent-multi-row-edge detector that would otherwise be
// the next step for the grayscale case.
//
// 5-attribute pixel state (doc section 12, kept minimal on purpose):
//   coordinate  -- (x,y), implicit via array index
//   appearance  -- RGB + local running region mean (was luminance-only)
//   gradient    -- gx, gy, strength per channel, combined (was luminance-only)
//   owner       -- 0 = unclaimed, else seed id
//   confidence  -- 0..1, grows with iterations of stable ownership
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = '/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/newtest-color.png';

// All 4 cubes, 3 seeds each (top/left/right) -- full end-to-end test:
// let all 12 regions compete simultaneously, no bounding box anywhere,
// then feed each cube's resulting hexagon into the same validated
// closed-form + two-phase reconstruction pipeline used on the flood-fill
// extraction earlier. id encodes cube*10+face (1=top,2=left,3=right) so
// results can be grouped back into 4 cubes afterward.
const SEEDS = [
  { id: 11, cube: 'cube1', x: 350, y: 345, label: 'top' },
  { id: 12, cube: 'cube1', x: 310, y: 430, label: 'left' },
  { id: 13, cube: 'cube1', x: 390, y: 430, label: 'right' },
  { id: 21, cube: 'cube2', x: 550, y: 280, label: 'top' },
  { id: 22, cube: 'cube2', x: 480, y: 420, label: 'left' },
  { id: 23, cube: 'cube2', x: 650, y: 420, label: 'right' },
  { id: 31, cube: 'cube3', x: 1000, y: 160, label: 'top' },
  { id: 32, cube: 'cube3', x: 850, y: 420, label: 'left' },
  { id: 33, cube: 'cube3', x: 1150, y: 420, label: 'right' },
  { id: 41, cube: 'cube4', x: 1400, y: 337, label: 'top' },
  { id: 42, cube: 'cube4', x: 1370, y: 430, label: 'left' },
  { id: 43, cube: 'cube4', x: 1500, y: 430, label: 'right' },
];

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  const BASE_TOL_PARAM = Number(process.env.CULT_TOL || 10);
  const MAX_DRIFT_PARAM = Number(process.env.CULT_DRIFT || 18);

  const result = await page.evaluate(async ({ dataUrl, SEEDS, BASE_TOL_PARAM, MAX_DRIFT_PARAM }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    // appearance = RGB vector, not luminance -- luminance collapses e.g.
    // (190,39,39) red and (232,96,1) orange toward similar brightness
    // even though the colors are wildly different; RGB distance keeps
    // that difference visible.
    const rgbAt = (i) => { const p = i * 4; return [data[p], data[p + 1], data[p + 2]]; };
    const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const lumOf = (rgb) => (rgb[0] + rgb[1] + rgb[2]) / 3;

    // gradient: still luminance-based central differences (cheap, only
    // used as a soft brake, not the primary discriminator now).
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = lumOf(rgbAt(i));
    const gradMag = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = lum[i + 1] - lum[i - 1], gy = lum[i + W] - lum[i - W];
      gradMag[i] = Math.hypot(gx, gy);
    }

    const owner = new Int32Array(W * H); // 0 = unclaimed
    const confidence = new Float32Array(W * H);
    const regionSeedValue = new Map(SEEDS.map(s => [s.id, rgbAt(s.y * W + s.x)]));
    const regionMean = new Map(SEEDS.map(s => [s.id, rgbAt(s.y * W + s.x)]));
    const regionCount = new Map(SEEDS.map(s => [s.id, 1]));
    for (const s of SEEDS) owner[s.y * W + s.x] = s.id;

    // APPEARANCE compatibility: within an adaptive tolerance of the
    // region's CURRENT running mean (not the fixed seed value) -- allows
    // slow drift across genuine shading, same spirit as the doc's
    // "kein hartes gleiche-Farbe" rule.
    //
    // BUT a free-drifting running mean has a real failure mode, found by
    // actually running this: green leaked all the way across the gap to
    // an entirely different cube (visible as a blob + speckle pattern on
    // cube2), because a long chain of individually-small compatible steps
    // walked the mean far enough from its origin to eventually accept
    // pixels the ORIGINAL seed value would have rejected outright --
    // "boiling frog" region growing. Fix: a hard DRIFT BUDGET -- every
    // candidate must ALSO stay within MAX_DRIFT of the region's original
    // seed value, not just the local running mean. This still allows
    // gradual local adaptation (the running-mean check) while capping how
    // far the region's identity can wander in total.
    const BASE_TOL = BASE_TOL_PARAM;
    const MAX_DRIFT = MAX_DRIFT_PARAM;
    // GRADIENT brake: a strong local edge sharply reduces (never fully
    // forbids on its own -- appearance still the primary gate) a pixel's
    // eligibility to be claimed this step, per the doc's "Gradient allein
    // ist kein Stoppschild" -- it slows growth, appearance/competition
    // decide the rest.
    function gradientPenalty(g) { return Math.min(1, g / 40); } // 0 = no brake, 1 = full brake

    let frontier = SEEDS.map(s => s.y * W + s.x);
    const NEI = [1, -1, W, -W];
    let iter = 0;
    const MAX_ITERS = 400;
    for (; iter < MAX_ITERS; iter++) {
      if (!frontier.length) break;
      // Each unclaimed neighbor of the current frontier collects BIDS
      // from every adjacent owned region this step -- true COMPETITION,
      // not first-come-first-served: if 2+ regions bid on the same
      // pixel in the same step, it is left CONTESTED (unclaimed), which
      // is exactly how the doc says boundaries should emerge as a
      // byproduct rather than being searched for directly.
      const bids = new Map(); // pixel index -> Set of region ids bidding
      for (const idx of frontier) {
        const rid = owner[idx];
        for (const d of NEI) {
          const nIdx = idx + d;
          if (nIdx < 0 || nIdx >= W * H) continue;
          // reject wraparound on horizontal neighbors
          if ((d === 1 || d === -1) && Math.floor(nIdx / W) !== Math.floor(idx / W)) continue;
          if (owner[nIdx] !== 0) continue;
          const mean = regionMean.get(rid);
          const nRgb = rgbAt(nIdx);
          const tol = BASE_TOL * (1 - 0.5 * gradientPenalty(gradMag[nIdx]));
          if (rgbDist(nRgb, mean) > tol) continue; // appearance gate (local, running mean)
          if (rgbDist(nRgb, regionSeedValue.get(rid)) > MAX_DRIFT) continue; // drift budget (global, vs original seed)
          if (!bids.has(nIdx)) bids.set(nIdx, new Set());
          bids.get(nIdx).add(rid);
        }
      }
      const newFrontier = [];
      for (const [idx, bidders] of bids) {
        if (bidders.size > 1) continue; // contested -- becomes boundary, stays unclaimed
        const rid = [...bidders][0];
        owner[idx] = rid;
        confidence[idx] = 0.1;
        newFrontier.push(idx);
        const n = regionCount.get(rid), m = regionMean.get(rid), px = rgbAt(idx);
        regionMean.set(rid, [(m[0] * n + px[0]) / (n + 1), (m[1] * n + px[1]) / (n + 1), (m[2] * n + px[2]) / (n + 1)]);
        regionCount.set(rid, n + 1);
      }
      // confidence grows for pixels that keep the same owner (simplified:
      // just age everything already-owned by a small amount each step).
      for (let i = 0; i < confidence.length; i++) if (owner[i] !== 0 && confidence[i] < 1) confidence[i] = Math.min(1, confidence[i] + 0.02);
      frontier = newFrontier;
    }

    // Boundary extraction: any owned pixel with a differently-owned
    // (including "contested/unclaimed") neighbor.
    const regionPixelCounts = Object.fromEntries(SEEDS.map(s => [s.id, 0]));
    for (let i = 0; i < owner.length; i++) if (owner[i]) regionPixelCounts[owner[i]]++;

    // --- Per-cube hexagon extraction from the cultivated owner map,
    // reusing the exact contour/hull/reduce pipeline already validated
    // on the flood-fill masks (scratch-cube-silhouette-2d-newtest.mjs).
    function traceContourMoore(inFn) {
      let start = null;
      outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inFn(x, y)) { start = [x, y]; break outer; }
      if (!start) return [];
      const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
      const findDirIndex = (d) => dirs.findIndex(v => v[0] === d[0] && v[1] === d[1]);
      const contour = [start];
      let current = start, backtrack = [-1, 0];
      for (let iter2 = 0; iter2 < W * H * 4; iter2++) {
        const backIndex = findDirIndex(backtrack);
        let found = false;
        for (let k = 1; k <= 8; k++) {
          const idx2 = (backIndex + k) % 8;
          const [dx, dy] = dirs[idx2], nx = current[0] + dx, ny = current[1] + dy;
          if (inFn(nx, ny)) { contour.push([nx, ny]); backtrack = [current[0] - nx, current[1] - ny]; current = [nx, ny]; found = true; break; }
        }
        if (!found) break;
        if (current[0] === start[0] && current[1] === start[1]) break;
      }
      return contour;
    }
    function convexHull(points) {
      const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower = [];
      for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
      const upper = [];
      for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
      lower.pop(); upper.pop();
      return lower.concat(upper);
    }
    function perpDist([px, py], [x1, y1], [x2, y2]) {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      if (len === 0) return Math.hypot(px - x1, py - y1);
      return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
    }
    function douglasPeucker(points, epsilon) {
      if (points.length < 3) return points;
      let maxDist = 0, index = 0;
      const first = points[0], last = points[points.length - 1];
      for (let i = 1; i < points.length - 1; i++) { const d = perpDist(points[i], first, last); if (d > maxDist) { maxDist = d; index = i; } }
      if (maxDist > epsilon) { const l = douglasPeucker(points.slice(0, index + 1), epsilon), r = douglasPeucker(points.slice(index), epsilon); return l.slice(0, -1).concat(r); }
      return [first, last];
    }
    function reduceToN(polygon, targetN) {
      let poly = polygon.slice();
      const triArea = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      while (poly.length > targetN) {
        let minArea = Infinity, minIdx = -1;
        for (let i = 0; i < poly.length; i++) {
          const prev = poly[(i - 1 + poly.length) % poly.length], cur = poly[i], next = poly[(i + 1) % poly.length];
          const area = triArea(prev, cur, next);
          if (area < minArea) { minArea = area; minIdx = i; }
        }
        poly.splice(minIdx, 1);
      }
      return poly;
    }
    const cubeNamesList = [...new Set(SEEDS.map(s => s.cube))];
    const cubeResults = {};
    for (const cubeName of cubeNamesList) {
      const idsForCube = new Set(SEEDS.filter(s => s.cube === cubeName).map(s => s.id));
      const inFn = (x, y) => x >= 0 && y >= 0 && x < W && y < H && idsForCube.has(owner[y * W + x]);
      const contour = traceContourMoore(inFn);
      if (contour.length < 3) { cubeResults[cubeName] = { ok: false, reason: 'empty contour' }; continue; }
      const hull = convexHull(contour);
      const hullClosed = hull.concat([hull[0]]);
      const dpPoly = douglasPeucker(hullClosed, 3.0).slice(0, -1);
      const rawPoly = dpPoly.length > 6 ? reduceToN(dpPoly, 6) : dpPoly;
      cubeResults[cubeName] = { ok: rawPoly.length === 6, rawVertexCount: rawPoly.length, rawPoly, pixelCount: contour.length };
    }

    // --- Direction-family assignment: same global K=3 circular k-means +
    // per-cube bipartite opposite-pair matching validated on the
    // flood-fill extraction (fixes cube4-style adjacent-edge
    // misclassification).
    function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }
    function angularDist(a, b) { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
    const okCubes = Object.entries(cubeResults).filter(([, r]) => r.ok);
    const allEdges2 = [];
    for (const [name, r] of okCubes) {
      for (let i = 0; i < 6; i++) {
        const a = r.rawPoly[i], b = r.rawPoly[(i + 1) % 6];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        allEdges2.push({ cube: name, idx: i, angle: angleMod180(dx, dy), len, a, b });
      }
    }
    function circularKMeans3(edges) {
      let centers = [edges[0].angle];
      while (centers.length < 3) {
        let best = -1, bestDist = -1;
        for (const e of edges) { const d = Math.min(...centers.map(c => angularDist(e.angle, c))); if (d > bestDist) { bestDist = d; best = e.angle; } }
        centers.push(best);
      }
      let assignment = edges.map(() => -1);
      for (let iterK = 0; iterK < 10; iterK++) {
        assignment = edges.map(e => { let best = 0, bestDist = Infinity; centers.forEach((c, ci) => { const d = angularDist(e.angle, c); if (d < bestDist) { bestDist = d; best = ci; } }); return best; });
        const newCenters = centers.map((c, ci) => {
          const members = edges.filter((_, i) => assignment[i] === ci);
          if (!members.length) return c;
          let sx = 0, sy = 0;
          for (const e of members) { const a2 = e.angle * 2 * Math.PI / 180; sx += Math.cos(a2) * e.len; sy += Math.sin(a2) * e.len; }
          return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
        });
        centers = newCenters;
      }
      return centers;
    }
    const famCenters = circularKMeans3(allEdges2);
    function pairAngle(e1, e2) {
      const a2a = e1.angle * 2 * Math.PI / 180, a2b = e2.angle * 2 * Math.PI / 180;
      const sx = Math.cos(a2a) * e1.len + Math.cos(a2b) * e2.len, sy = Math.sin(a2a) * e1.len + Math.sin(a2b) * e2.len;
      return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
    }
    function permutations3() { return [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]; }
    for (const [name, r] of okCubes) {
      const edgesForCube = allEdges2.filter(e => e.cube === name);
      const pairs = [[0, 3], [1, 4], [2, 5]].map(([i, j]) => pairAngle(edgesForCube[i], edgesForCube[j]));
      let bestPerm = null, bestCost = Infinity;
      for (const perm of permutations3()) {
        const cost = pairs.reduce((s, pAngle, pi) => s + angularDist(pAngle, famCenters[perm[pi]]), 0);
        if (cost < bestCost) { bestCost = cost; bestPerm = perm; }
      }
      const famAssignment = new Array(6);
      [[0, 3], [1, 4], [2, 5]].forEach(([i, j], pi) => { famAssignment[i] = bestPerm[pi]; famAssignment[j] = bestPerm[pi]; });
      r.famAssignment = famAssignment;
    }

    // Visualize: colored owners + white boundary pixels.
    const outCanvas = document.createElement('canvas'); outCanvas.width = W; outCanvas.height = H;
    const octx = outCanvas.getContext('2d');
    octx.drawImage(img, 0, 0);
    const imgData = octx.getImageData(0, 0, W, H);
    const cubeColors = { cube1: [255, 60, 60], cube2: [255, 200, 0], cube3: [180, 60, 220], cube4: [0, 200, 200] };
    const colors = Object.fromEntries(SEEDS.map(s => [s.id, cubeColors[s.cube]]));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!owner[i]) continue;
      const [cr, cg, cb] = colors[owner[i]];
      const p = i * 4;
      imgData.data[p] = (imgData.data[p] + cr) / 2;
      imgData.data[p + 1] = (imgData.data[p + 1] + cg) / 2;
      imgData.data[p + 2] = (imgData.data[p + 2] + cb) / 2;
    }
    octx.putImageData(imgData, 0, 0);
    // boundary overlay pass (after putImageData so it isn't blended away)
    octx.fillStyle = '#ffff00';
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!owner[i]) continue;
      const o = owner[i];
      if (owner[i - 1] && owner[i - 1] !== o || owner[i + 1] && owner[i + 1] !== o || owner[i - W] && owner[i - W] !== o || owner[i + W] && owner[i + W] !== o) {
        octx.fillRect(x, y, 1, 1);
      }
    }
    const overlayUrl = outCanvas.toDataURL('image/png');
    return { W, H, iterations: iter, regionPixelCounts, overlayUrl, cubeResults };
  }, { dataUrl, SEEDS, BASE_TOL_PARAM, MAX_DRIFT_PARAM });

  console.log('Cultivator stopped after', result.iterations, 'iterations.');
  console.log('Region pixel counts:', result.regionPixelCounts);
  for (const [name, r] of Object.entries(result.cubeResults)) {
    if (!r.ok) { console.log(name, 'FAILED:', r.reason || `rawVertexCount=${r.rawVertexCount}`); continue; }
    console.log(name, 'rawPoly=', JSON.stringify(r.rawPoly), 'famAssignment=', r.famAssignment);
  }
  const b64 = result.overlayUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'surface-cultivator.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote surface-cultivator.png');

  const dump = {
    W: result.W, H: result.H,
    cubes: Object.fromEntries(Object.entries(result.cubeResults).filter(([, r]) => r.ok).map(([name, r]) => [name, { rawPoly: r.rawPoly, famAssignment: r.famAssignment }])),
  };
  fs.writeFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/newtest-raw2d-cultivated.json', JSON.stringify(dump, null, 2));
  console.log('Wrote newtest-raw2d-cultivated.json');
  await browser.close();
})();
