// SCRATCH -- 2D-ONLY cube silhouette extraction. NO 3D work here per
// explicit instruction: "Stop all 3D reconstruction and placement work."
//
// Acceptance criteria:
//  1. exactly one outer silhouette polygon
//  2. exactly 6 structural vertices
//  3. each vertex lies on a true visible contour corner
//  4. edges cluster into 3 dominant direction families
//  5. no extra vertices from soft shading / contrast noise
//  6. same method generalizes across all 4 identical cubes
//
// Method v3, per maintainer steer ("posterize, isolate cleanly, don't
// overthink it"): the earlier attempt tried to rebuild the hexagon from
// clustering many short, noisy DP-fragment angles -- fragile, because a
// short curved shadow-bulge segment's angle is meaningless data, and
// letting it vote in a global cluster corrupted otherwise-good families.
// v3 instead:
//  A. POSTERIZE luminance to coarse bins -- the shadow's smooth gradient
//     now crosses many bin boundaries instead of blending seamlessly with
//     the cube's fairly flat per-face tones, so a same-bin flood fill
//     naturally does NOT pull in the shadow.
//  B. Per-face flood fill on posterized bins (one seed per visible face) +
//     a SMALL dilation (just enough to bridge the few-px antialiased gap
//     between faces, not enough to meaningfully absorb the shadow) union
//     the 3 faces into one clean silhouette blob.
//  C. Convex hull + moderate Douglas-Peucker on that already-clean contour
//     -- because the mask is clean, this alone gets very close to a true
//     hexagon (no fragile clustering needed for criteria 1/2/3/5).
//  D. Refinement for criterion 4: pair up the 6 raw edges into the 3
//     opposite-side direction families (index i / i+3 in hexagon order),
//     average each pair's direction, and recompute all 6 vertices as
//     intersections of the direction-corrected lines. This is a small
//     correction on an already-good hexagon, not a rebuild from noise.
import { chromium } from 'playwright';
import fs from 'fs';

const IMG = '/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/village-b29.png';
const OUT = '/home/user/SHADED/tools/verify-out';

// Real demo-village test (flat-roof simplification, 1536x1024), 6 houses --
// unlike the gray cubes (one material, 3 different SHADES by face
// orientation), roof (orange) and wall (beige) here are genuinely
// different MATERIALS -- a wall-face flood fill will never reach the roof
// regardless of tolerance. Needs 3 seeds per house (roof, left wall,
// right wall), same as the very first cube extraction, not the 2-seed
// newtest.png variant (that one only dropped the 3rd seed because one
// specific cube's top face was degenerately thin, not the general case).
// Seeds re-derived by measurement, not eyeballing: roof blobs found via
// connected-component color threshold on the (uniform, orange) roof tone
// gave exact per-house bounding boxes and centroids; wall seeds placed at
// 20% of roof-height below the roof bbox at 22%/78% of roof width, then
// EVERY seed value was verified by direct pixel sampling (roof ~(200,145,
// 70), left wall ~(197,167,109), right/shaded wall ~(139,123,80) -- all
// stable across houses since lighting direction is shared). The original
// hand-guessed coordinates for house3's left-wall seed landed on grass,
// which is what caused the whole-bbox leak even after the RGB-distance
// fix -- a bad seed is not something a better appearance metric can
// rescue. house5 (the house nearest the right image edge) is dropped
// entirely: its bbox runs to x=1535, the frame's last column, so its
// shaded right wall is off-canvas and no seed can reach it -- it would
// yield an incomplete (5-vertex, not 6-vertex) silhouette by construction,
// not a bug to fix. 5 fully-visible houses remain, comfortably enough for
// the multi-start calibration.
const CUBES = {
  house1: { seeds: [[251, 300], [134, 468], [368, 468]], bbox: [2, 159, 500, 537] },
  house2: { seeds: [[505, 87], [425, 181], [584, 181]], bbox: [313, 5, 696, 242] },
  house3: { seeds: [[1009, 155], [918, 280], [1100, 280]], bbox: [796, 45, 1221, 333] },
  // bbox bottom tightened from 476 to 430: at 476 it reached far enough
  // down to swallow part of the path spur that connects directly to this
  // house's front door (confirmed visually -- the leak produced 2 bogus
  // vertices sitting ON the path instead of the true BL/F corners, which
  // wrecked this house's 3D reconstruction while all 5 others were near-
  // perfect). 430 sits just below the true wall bottom (~y420) but above
  // where the spur visibly continues.
  house4: { seeds: [[1356, 221], [1271, 347], [1440, 347]], bbox: [1154, 110, 1535, 430] },
  house6: { seeds: [[1050, 863], [997, 1010], [1100, 1005]], bbox: [820, 716, 1280, 1023] },
};

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[browser]', msg.text()));
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  if (process.env.DEBUG_MASK_ONLY === '1') await page.evaluate(() => { window.__DEBUG_MASK_ONLY__ = true; });

  const result = await page.evaluate(async ({ dataUrl, CUBES }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => { const i = (y * W + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
    const rgb = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // A. Posterize to coarse bins.
    const POSTER_STEP = 18;
    const poster = (x, y) => Math.floor(lum(x, y) / POSTER_STEP);

    function traceContourMoore(inFn) {
      let start = null;
      outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inFn(x, y)) { start = [x, y]; break outer; }
      if (!start) return [];
      const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
      const findDirIndex = (d) => dirs.findIndex(v => v[0] === d[0] && v[1] === d[1]);
      const contour = [start];
      let current = start, backtrack = [-1, 0];
      for (let iter = 0; iter < W * H * 4; iter++) {
        const backIndex = findDirIndex(backtrack);
        let found = false;
        for (let k = 1; k <= 8; k++) {
          const idx = (backIndex + k) % 8;
          const [dx, dy] = dirs[idx], nx = current[0] + dx, ny = current[1] + dy;
          if (inFn(nx, ny)) { contour.push([nx, ny]); backtrack = [current[0] - nx, current[1] - ny]; current = [nx, ny]; found = true; break; }
        }
        if (!found) break;
        if (current[0] === start[0] && current[1] === start[1]) break;
      }
      return contour;
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
    function reduceToN(polygon, targetN) {
      // Visvalingam-Whyatt: repeatedly drop the vertex whose removal
      // changes the polygon least (smallest triangle area with its
      // neighbours), until exactly targetN vertices remain. Deterministic,
      // no epsilon to tune per cube -- directly targets "exactly 6".
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
    function lineIntersect(L1, L2) {
      const [x1, y1] = L1.point, [dx1, dy1] = L1.dir, [x2, y2] = L2.point, [dx2, dy2] = L2.dir;
      const den = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(den) < 1e-9) return null;
      const t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / den;
      return [x1 + t * dx1, y1 + t * dy1];
    }

    function extractCube(seeds, bbox, targetN = 6) {
      // B. Per-face flood fill within a TIGHT LUMINANCE TOLERANCE of the
      // seed's own value (matches the ~8-unit flat range measured on a
      // real face), clipped to the cube's bounding box -- coarse
      // posterize-bin matching leaked straight through into the floor on
      // this image (floor-in-shadow reads within a few units of the cube
      // faces; confirmed via direct pixel sampling, not assumed), and
      // there is no bin width that fixes that without ALSO fragmenting
      // faces elsewhere. Union across faces, then a small dilation (2
      // rounds) to bridge the antialiased gap between faces.
      // Luminance-only tolerance leaked ~89% of each house's bbox into
      // the surrounding grass: orange roof (lum 137.3) vs. green grass
      // (lum 119-123.7) is only ~14-18 luminance units apart despite
      // being an obviously different hue -- the same "similar brightness,
      // different color" trap already solved once this session for the
      // cube case. Fix: RGB Euclidean distance from the seed's own color,
      // not luminance difference.
      const TOL = 40;
      const [bx0, by0, bx1, by1] = bbox;
      const combined = new Uint8Array(W * H);
      for (const [sx, sy] of seeds) {
        const seedRgb = rgb(sx, sy);
        const stack = [[sx, sy]];
        const visited = new Uint8Array(W * H);
        visited[sy * W + sx] = 1;
        while (stack.length) {
          const [x, y] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue;
            const idx = ny * W + nx;
            if (visited[idx]) continue;
            if (rgbDist(rgb(nx, ny), seedRgb) <= TOL) { visited[idx] = 1; stack.push([nx, ny]); }
          }
        }
        for (let i = 0; i < visited.length; i++) if (visited[i]) combined[i] = 1;
      }
      // Maintainer correction: the darkness-gated bridge (tried at TOL=25)
      // was a regression, not an improvement -- it produced MORE visible
      // fringe leakage into cast shadow at several houses than the plain
      // approach below, even though vertex count was nominally 6 for all.
      // Reverted to the simple, original 2-round topological dilation at
      // TOL=40. This does leave a known, accepted imperfection (a thin
      // spike toward the path on house1/house4's bottom edge, where the
      // wall directly abuts the connecting path spur with no gap) -- worse
      // in that one respect, but a cleaner, more faithful hexagon overall.
      let mask = combined;
      for (let round = 0; round < 2; round++) {
        const next = new Uint8Array(mask);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (mask[y * W + x]) continue;
          if ((x > 0 && mask[y * W + x - 1]) || (x < W - 1 && mask[y * W + x + 1]) ||
              (y > 0 && mask[(y - 1) * W + x]) || (y < H - 1 && mask[(y + 1) * W + x])) next[y * W + x] = 1;
        }
        mask = next;
      }

      // C. Convex hull + moderate DP on the already-clean contour.
      const inFn = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
      const contour = traceContourMoore(inFn);
      const hull = convexHull(contour);
      const hullClosed = hull.concat([hull[0]]);
      // Generous DP first (kills near-duplicate/collinear antialiasing
      // points cheaply), then reduce to EXACTLY 6 via smallest-triangle-
      // area removal -- targets the vertex count directly instead of
      // hoping one epsilon value works for every cube's noise level.
      const dpPoly = douglasPeucker(hullClosed, 3.0).slice(0, -1);
      const rawPoly = dpPoly.length > targetN ? reduceToN(dpPoly, targetN) : dpPoly;

      // Stop here at the raw hexagon -- direction-family fitting now
      // happens GLOBALLY across all 4 cubes (see below), not per cube.
      // targetN=5 is the one deliberate exception (house5, see below):
      // its shaded right wall is off-canvas, so its true silhouette is a
      // pentagon (one hexagon edge pair collapsed into a single bypass
      // edge), not a measurement failure.
      if (rawPoly.length !== targetN) {
        return { W, H, ok: false, rawVertexCount: rawPoly.length, rawPoly, mask, contour };
      }
      const edgeDir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
      const rawEdges = rawPoly.map((p, i) => {
        const b = rawPoly[(i + 1) % rawPoly.length];
        return { a: p, b, dir: edgeDir(p, b), len: Math.hypot(b[0] - p[0], b[1] - p[1]), mid: [(p[0] + b[0]) / 2, (p[1] + b[1]) / 2] };
      });
      return { W, H, ok: true, contour, contourLen: contour.length, rawVertexCount: rawPoly.length, rawPoly, rawEdges, maskPixels: mask.reduce((s, v) => s + v, 0), mask };
    }

    const out = {};
    for (const [name, def] of Object.entries(CUBES)) {
      if (!def || !def.seeds || !def.bbox) throw new Error(`bad def for ${name}: ${JSON.stringify(def)}`);
      out[name] = extractCube(def.seeds, def.bbox);
    }

    // DEBUG: visualize each cube's raw mask + raw (pre-correction) polygon
    // before any of the risky global-family-fitting logic runs, so a
    // failure downstream doesn't cost the diagnostic image too.
    const debugCanvas = document.createElement('canvas'); debugCanvas.width = W; debugCanvas.height = H;
    const dctx = debugCanvas.getContext('2d');
    dctx.drawImage(img, 0, 0);
    const maskColorList = [[255, 0, 0], [0, 200, 0], [0, 100, 255], [255, 150, 0], [200, 0, 200], [0, 200, 200]];
    const maskColors = Object.fromEntries(Object.keys(CUBES).map((name, i) => [name, maskColorList[i % maskColorList.length]]));
    for (const [name, r] of Object.entries(out)) {
      if (!r.mask) continue;
      const imgData = dctx.getImageData(0, 0, W, H);
      const [cr, cg, cb] = maskColors[name];
      for (let i = 0; i < r.mask.length; i++) {
        if (r.mask[i]) { const p = i * 4; imgData.data[p] = (imgData.data[p] + cr) / 2; imgData.data[p + 1] = (imgData.data[p + 1] + cg) / 2; imgData.data[p + 2] = (imgData.data[p + 2] + cb) / 2; }
      }
      dctx.putImageData(imgData, 0, 0);
      if (r.rawPoly) {
        dctx.strokeStyle = '#fff'; dctx.lineWidth = 2;
        dctx.beginPath(); r.rawPoly.forEach((p, i) => i === 0 ? dctx.moveTo(p[0], p[1]) : dctx.lineTo(p[0], p[1])); dctx.closePath(); dctx.stroke();
      }
    }
    const debugUrl = debugCanvas.toDataURL('image/png');
    if (window.__DEBUG_MASK_ONLY__) {
      return { W, H, debugUrl, summary: Object.fromEntries(Object.entries(out).map(([n, r]) => [n, { ok: r.ok, rawVertexCount: r.rawVertexCount, maskPixels: r.mask ? r.mask.reduce((s, v) => s + v, 0) : 0, rawPoly: r.rawPoly }])) };
    }

    // --- Maintainer's correction: don't fit a direction per cube (that's
    // "one vanishing point per edge" in effect, 4 slightly different
    // estimates of what should be ONE real-world direction). All 4 cubes
    // are identically oriented -- pool ALL cubes' edges (6 each = 24
    // total, forming 3 groups of 8) and fit exactly 3 GLOBAL directions,
    // shared by every cube. Only each edge's own position (offset) stays
    // per-cube; direction never does.
    function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }
    function angularDist(a, b) { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
    const allEdges = [];
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      r.rawEdges.forEach((e, idx) => allEdges.push({ cube: name, idx, angle: angleMod180(e.dir[0], e.dir[1]), len: e.len, mid: e.mid, dir: e.dir, a: e.a, b: e.b }));
    }
    // K=3 is not a guess to tune a threshold around -- it's a known fact
    // (3 real-world axes), so cluster with fixed K=3 (circular k-means on
    // angle mod 180deg) instead of a distance-threshold that can fragment
    // one family into two if its spread happens to exceed the cutoff
    // (exactly what happened on the first attempt at this new image).
    function circularKMeans3(edges) {
      let centers = [edges[0].angle];
      while (centers.length < 3) {
        let best = -1, bestDist = -1;
        for (const e of edges) {
          const d = Math.min(...centers.map(c => angularDist(e.angle, c)));
          if (d > bestDist) { bestDist = d; best = e.angle; }
        }
        centers.push(best);
      }
      let assignment = edges.map(() => -1);
      for (let iter = 0; iter < 10; iter++) {
        let changed = false;
        assignment = edges.map(e => {
          let best = 0, bestDist = Infinity;
          centers.forEach((c, ci) => { const d = angularDist(e.angle, c); if (d < bestDist) { bestDist = d; best = ci; } });
          return best;
        });
        const newCenters = centers.map((c, ci) => {
          const members = edges.filter((_, i) => assignment[i] === ci);
          if (!members.length) return c;
          let sx = 0, sy = 0;
          for (const e of members) { const a2 = e.angle * 2 * Math.PI / 180; sx += Math.cos(a2) * e.len; sy += Math.sin(a2) * e.len; }
          return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
        });
        if (newCenters.some((c, i) => Math.abs(c - centers[i]) > 1e-6)) changed = true;
        centers = newCenters;
        if (!changed) break;
      }
      const groups = [[], [], []];
      assignment.forEach((ci, i) => groups[ci].push(i));
      return { groups, centers };
    }
    const { groups: kmeansGroups, centers: famCenters } = circularKMeans3(allEdges);

    // Per-edge nearest-centroid k-means can still misclassify an
    // individual edge when two families' centroids are close together
    // relative to one cube's own angular noise -- confirmed on this image
    // (cube4's edges 0 and 1, ADJACENT edges that must belong to
    // DIFFERENT families, both got pulled into the same global cluster).
    // A hexagon's structure is a hard constraint the raw per-edge
    // clustering doesn't know about: edges (0,3), (1,4), (2,5) are
    // opposite sides and MUST land in 3 DISTINCT families. Enforce that
    // directly: for each cube, compute each opposite-pair's own average
    // direction, then find the 1-1 assignment of its 3 pairs to the 3
    // global centroids (all 3! permutations -- trivial to brute-force)
    // that minimizes total angular distance. This can only improve on
    // the unconstrained per-edge labels, never make them worse, since the
    // unconstrained global centroids are still what every cube is matched
    // against.
    function pairAngle(e1, e2) {
      const a2a = e1.angle * 2 * Math.PI / 180, a2b = e2.angle * 2 * Math.PI / 180;
      const sx = Math.cos(a2a) * e1.len + Math.cos(a2b) * e2.len, sy = Math.sin(a2a) * e1.len + Math.sin(a2b) * e2.len;
      return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
    }
    function permutations3() { return [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]; }
    const famOfEdge = new Map(); // "cube#idx" -> family index
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      const cubeEdges = allEdges.filter(e => e.cube === name); // already in index order 0..5
      const pairs = [[0, 3], [1, 4], [2, 5]].map(([i, j]) => pairAngle(cubeEdges[i], cubeEdges[j]));
      let bestPerm = null, bestCost = Infinity;
      for (const perm of permutations3()) {
        const cost = pairs.reduce((s, pAngle, pi) => s + angularDist(pAngle, famCenters[perm[pi]]), 0);
        if (cost < bestCost) { bestCost = cost; bestPerm = perm; }
      }
      [[0, 3], [1, 4], [2, 5]].forEach(([i, j], pi) => { famOfEdge.set(`${name}#${i}`, bestPerm[pi]); famOfEdge.set(`${name}#${j}`, bestPerm[pi]); });
    }
    const top3Clusters = [[], [], []];
    allEdges.forEach((e, i) => { top3Clusters[famOfEdge.get(`${e.cube}#${e.idx}`)].push(i); });

    // Maintainer's correction: this is a true 3-point perspective render.
    // Same-direction 3D edges do NOT project to parallel image lines --
    // they converge to one real (if far off-canvas) vanishing point per
    // axis. Fit that vanishing point via total-least-squares over all 8
    // member edges' lines (minimize summed squared perpendicular distance
    // from the candidate point to every line) -- well-conditioned now
    // because the 8 lines span 4 different cube positions/depths, unlike
    // the earlier failed attempt that only had 2-4 lines from mismatched
    // edges.
    function fitVanishingPoint(edgeIdxs) {
      let Sxx = 0, Sxy = 0, Syy = 0, Sxb = 0, Syb = 0;
      for (const i of edgeIdxs) {
        const [ux, uy] = allEdges[i].dir, P = allEdges[i].mid;
        const a = uy, b2 = -ux, rhs = uy * P[0] - ux * P[1];
        Sxx += a * a; Sxy += a * b2; Syy += b2 * b2; Sxb += a * rhs; Syb += b2 * rhs;
      }
      const det = Sxx * Syy - Sxy * Sxy;
      if (Math.abs(det) < 1e-9) return null;
      return [(Sxb * Syy - Syb * Sxy) / det, (Sxx * Syb - Sxy * Sxb) / det];
    }
    function perpResidual(vp, i) {
      const [ux, uy] = allEdges[i].dir, P = allEdges[i].mid;
      return Math.abs(uy * (vp[0] - P[0]) - ux * (vp[1] - P[1]));
    }
    const globalFamilies = top3Clusters.map(group => {
      const vp = fitVanishingPoint(group);
      const residuals = group.map(i => perpResidual(vp, i));
      return { vp, memberCount: group.length, avgResidual: residuals.reduce((s, r) => s + r, 0) / residuals.length, maxResidual: Math.max(...residuals), members: group.map(i => `${allEdges[i].cube}#${allEdges[i].idx}`) };
    });
    const famOf = new Map();
    top3Clusters.forEach((group, famIdx) => { for (const i of group) famOf.set(allEdges[i].cube + '#' + allEdges[i].idx, famIdx); });

    // Rebuild every cube's 6 vertices: each edge's line now passes through
    // its OWN measured point AND the shared vanishing point for its
    // family -- direction is therefore no longer fixed globally, it
    // correctly varies per edge position exactly as true perspective
    // convergence requires.
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      const lines = r.rawEdges.map((e, idx) => {
        const fam = famOf.get(name + '#' + idx);
        if (fam === undefined) throw new Error(`${name} edge ${idx} did not land in any of the 3 global direction families -- angle clustering failed, not a placement bug.`);
        const vp = globalFamilies[fam].vp;
        const dx = vp[0] - e.mid[0], dy = vp[1] - e.mid[1], len = Math.hypot(dx, dy);
        return { point: e.mid, dir: [dx / len, dy / len], famIdx: fam };
      });
      const vertices = [];
      for (let i = 0; i < 6; i++) vertices.push(lineIntersect(lines[i], lines[(i + 1) % 6]));
      let maxNearestDist = 0;
      for (const v of vertices) {
        let best = Infinity;
        for (const p of r.contour) { const d = Math.hypot(p[0] - v[0], p[1] - v[1]); if (d < best) best = d; }
        if (best > maxNearestDist) maxNearestDist = best;
      }
      r.vertices = vertices;
      r.maxNearestDist = maxNearestDist;
      r.famAssignment = lines.map(l => l.famIdx);
    }

    // Maintainer correction (twice): first, don't drop house5 just because
    // its shaded right wall is off-canvas -- its visible lines determine
    // the rest. Second, and more precisely: don't try to force a closed,
    // fully-measured 2D hexagon out of it at all -- the vertex nearest the
    // image's right edge (x>=W-2) is a clipping ARTIFACT of the mask
    // hitting the frame boundary, not a real corner, and "completing" it
    // in 2D via intersection turned out underdetermined (2 unknown 2D
    // points, only 3 independent direction constraints -- a real missing
    // degree of freedom, not a bug to code around). The right fix is what
    // the maintainer pointed at directly: let the missing corners be
    // reconstructed IN 3D, continued past the image edge, rather than
    // forced into a fake 2D position. So: extract only the 4 GENUINELY
    // measured, unclipped vertices (T,L,BL,F) via 2 seeds (roof, left
    // wall), drop the clipped artifact vertex entirely, and hand the
    // downstream 3D solver an open chain of 3 real edges (T-L, L-BL,
    // BL-F) instead of a fabricated closed hexagon. The 2 unmeasured
    // corners (BR, R) get `null` 2D positions -- solveTranslation/energy/
        // reprojection in the reconstruction script skip them; their 3D
    // position still comes out of the box's rigid local-coordinate
    // structure once T is solved from the 4 real correspondences.
    const house5Def = { seeds: [[1437, 541], [1381, 696]], bbox: [1298, 410, 1536, 900] };
    const house5Raw = extractCube(house5Def.seeds, house5Def.bbox, 5);
    if (house5Raw.ok && house5Raw.rawVertexCount === 5) {
      const poly = house5Raw.rawPoly;
      const clippedIdx = poly.findIndex(([x]) => x >= W - 2);
      if (clippedIdx === -1) {
        console.log('  [house5] WARNING: expected one vertex clipped at the image edge (x>=W-2), found none -- skipping house5.');
      } else {
        // Drop the clipped vertex, keep the other 4 in their original
        // cyclic order -- this leaves exactly 3 REAL, fully unclipped
        // edges chained through them (no artificial-edge guessing).
        const kept = poly.filter((_, i) => i !== clippedIdx); // 4 points, cyclic order preserved
        const edgeAngleOf = (a, b) => angleMod180(b[0] - a[0], b[1] - a[1]);
        // Only 3 of the 4 consecutive pairs are real edges: the one that
        // would connect kept[3] back to kept[0] actually jumps across the
        // dropped vertex (a fake shortcut), so it is deliberately excluded.
        const realEdgeFams = [0, 1, 2].map(i => {
          const a = edgeAngleOf(kept[i], kept[i + 1]);
          const dists = famCenters.map(c => angularDist(a, c));
          return dists.indexOf(Math.min(...dists));
        });
        console.log('  [house5] kept=' + JSON.stringify(kept) + ' realEdgeFams=' + JSON.stringify(realEdgeFams));
        // realEdgeFams must be 3 DIFFERENT values (3 consecutive real
        // hexagon edges always cycle through all 3 families with no
        // repeat) -- if not, the family fit itself is too unreliable here.
        if (new Set(realEdgeFams).size !== 3) {
          console.log('  [house5] WARNING: the 3 real edges did not match 3 distinct families (' + realEdgeFams.join(',') + ') -- skipping house5.');
        } else {
          const vertices = [kept[0], kept[1], kept[2], kept[3], null, null]; // T,L,BL,F,BR(unmeasured),R(unmeasured)
          const famAssignment = [...realEdgeFams, ...realEdgeFams]; // opposite-pair convention, same as every other house
          out.house5 = { ok: true, rawVertexCount: 4, rawPoly: vertices, vertices, famAssignment, maxNearestDist: null, partial: true, droppedClippedVertex: poly[clippedIdx] };
          console.log('  [house5] kept 4 real vertices (T,L,BL,F), dropped clipped artifact at [' + poly[clippedIdx] + '], famAssignment=' + famAssignment.join(','));
        }
      }
    } else {
      console.log('  [house5] extraction did not yield a clean pentagon (got ' + house5Raw.rawVertexCount + ' vertices) -- skipping house5.');
    }

    ctx.drawImage(img, 0, 0);
    const colorList2 = ['#ff3333', '#33cc33', '#3388ff', '#ff9900', '#cc00cc', '#00cccc'];
    const colors = Object.fromEntries(Object.keys(out).map((name, i) => [name, colorList2[i % colorList2.length]]));
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      const known = r.vertices.filter(p => p);
      ctx.strokeStyle = colors[name]; ctx.lineWidth = 3;
      ctx.beginPath();
      known.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
      if (!r.partial) ctx.closePath();
      ctx.stroke();
      known.forEach(p => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); });
    }
    // Verification: for each family, draw the line through EVERY member
    // edge's own point AND the shared vanishing point, extended across
    // the canvas. True 3-point perspective (not weak/parallel) -- if the
    // VP fit is right, all 8 lines per family should visually converge
    // toward the same far-off point, not run parallel.
    const famColors = ['#ffd400', '#0033ff', '#00c800'];
    const bigL = 4000;
    top3Clusters.forEach((group, fi) => {
      const vp = globalFamilies[fi].vp;
      ctx.strokeStyle = famColors[fi]; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
      for (const i of group) {
        const P = allEdges[i].mid;
        const dx = vp[0] - P[0], dy = vp[1] - P[1], len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        ctx.beginPath(); ctx.moveTo(P[0] - ux * bigL, P[1] - uy * bigL); ctx.lineTo(P[0] + ux * bigL, P[1] + uy * bigL); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    const overlayUrl = c.toDataURL('image/png');
    return { W, H, out, overlayUrl, globalFamilies, allEdgesCount: allEdges.length };
  }, { dataUrl, CUBES });

  if (process.env.DEBUG_MASK_ONLY === '1') {
    console.log(JSON.stringify(result.summary, null, 2));
    const b64d = result.debugUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(`${OUT}/cube-silhouette-2d-debugmask.png`, Buffer.from(b64d, 'base64'));
    console.log('Wrote cube-silhouette-2d-debugmask.png');
    await browser.close();
    return;
  }

  console.log('GLOBAL vanishing points (true 3-point perspective, fit from ' + result.globalFamilies.reduce((s, f) => s + f.memberCount, 0) + '/' + result.allEdgesCount + ' edges):');
  result.globalFamilies.forEach((f, i) => console.log('  family ' + i + ': VP=[' + f.vp[0].toFixed(0) + ',' + f.vp[1].toFixed(0) + '] avgResidual=' + f.avgResidual.toFixed(2) + 'px maxResidual=' + f.maxResidual.toFixed(2) + 'px members=' + f.members.join(', ')));
  for (const [name, r] of Object.entries(result.out)) {
    if (!r.ok) { console.log(name, 'FAILED -- raw vertex count', r.rawVertexCount, '!= 6:', JSON.stringify(r.rawPoly)); continue; }
    console.log(name, 'contourLen=', r.contourLen, 'rawVertexCount=', r.rawVertexCount, 'maskPixels=', r.maskPixels, 'famAssignment=', r.famAssignment, r.partial ? '(PARTIAL -- BR/R unmeasured, off-canvas)' : '');
    console.log('  vertices:', r.vertices.map(v => v ? `[${v[0].toFixed(1)},${v[1].toFixed(1)}]` : 'null').join(' '));
    if (r.maxNearestDist !== null) console.log('  max distance of any vertex to nearest raw contour point:', r.maxNearestDist.toFixed(2) + 'px  (criterion 3)');
  }
  const b64 = result.overlayUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(`${OUT}/cube-silhouette-2d.png`, Buffer.from(b64, 'base64'));
  console.log('Wrote cube-silhouette-2d.png');

  // Dump the RAW hexagons (pre-line-correction) + corrected famAssignment
  // for downstream feeding into the validated two-phase (v3e) operator
  // pipeline -- the raw hexagon is a real noisy 2D measurement, exactly
  // the kind of input that architecture was built and validated for; the
  // fragile closed-form-only line-intersection rebuild above is not.
  const dump = {
    W: result.W, H: result.H,
    cubes: Object.fromEntries(Object.entries(result.out).filter(([, r]) => r.ok).map(([name, r]) => [name, { rawPoly: r.rawPoly, famAssignment: r.famAssignment }])),
  };
  fs.writeFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/village-raw2d.json', JSON.stringify(dump, null, 2));
  console.log('Wrote village-raw2d.json');
  await browser.close();
})();
