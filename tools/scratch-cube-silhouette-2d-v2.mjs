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

const IMG = '/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/simplified-cubes.png';
const OUT = '/home/user/SHADED/tools/verify-out';

// Generalization test: second, higher-res, even-softer-shadow reference
// image (1698x926) of the same 4-cube arrangement. New seed points only
// (different resolution/composition) -- pipeline itself is untouched.
const CUBES = {
  cube1: { seeds: [[420, 230], [350, 340], [500, 340]] },
  cube2: { seeds: [[770, 350], [680, 470], [860, 470]] },
  cube3: { seeds: [[1060, 150], [990, 250], [1130, 250]] },
  cube4: { seeds: [[1200, 470], [1090, 620], [1300, 620]] },
};

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  page.on('console', msg => console.log('[browser]', msg.text()));
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');

  const result = await page.evaluate(async ({ dataUrl, CUBES }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => { const i = (y * W + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };

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

    function extractCube(seeds) {
      // B. Per-face flood fill on posterized bins (same bin as seed only --
      // no tolerance window, so no arbitrary parameter), union across
      // faces, then a SMALL dilation (2 rounds) to bridge the antialiased
      // gap between faces without meaningfully eating into the shadow.
      const combined = new Uint8Array(W * H);
      for (const [sx, sy] of seeds) {
        const bin = poster(sx, sy);
        const stack = [[sx, sy]];
        const visited = new Uint8Array(W * H);
        visited[sy * W + sx] = 1;
        while (stack.length) {
          const [x, y] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const idx = ny * W + nx;
            if (visited[idx]) continue;
            if (poster(nx, ny) === bin) { visited[idx] = 1; stack.push([nx, ny]); }
          }
        }
        for (let i = 0; i < visited.length; i++) if (visited[i]) combined[i] = 1;
      }
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
      const rawPoly = dpPoly.length > 6 ? reduceToN(dpPoly, 6) : dpPoly;

      // Stop here at the raw hexagon -- direction-family fitting now
      // happens GLOBALLY across all 4 cubes (see below), not per cube.
      if (rawPoly.length !== 6) {
        return { W, H, ok: false, rawVertexCount: rawPoly.length, rawPoly, mask: null };
      }
      const edgeDir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
      const rawEdges = rawPoly.map((p, i) => {
        const b = rawPoly[(i + 1) % 6];
        return { a: p, b, dir: edgeDir(p, b), len: Math.hypot(b[0] - p[0], b[1] - p[1]), mid: [(p[0] + b[0]) / 2, (p[1] + b[1]) / 2] };
      });
      return { W, H, ok: true, contour, contourLen: contour.length, rawVertexCount: rawPoly.length, rawPoly, rawEdges, maskPixels: mask.reduce((s, v) => s + v, 0) };
    }

    const out = {};
    for (const [name, def] of Object.entries(CUBES)) out[name] = extractCube(def.seeds);

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
    // one family into two if its spread happens to exceed the cutoff.
    function circularKMeans3(edges) {
      // seed from 3 well-separated angles (greedy farthest-point init)
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
      return groups;
    }
    const top3Clusters = circularKMeans3(allEdges);
    // DIAGNOSTIC (temporary): surface per-cube ok/vertex-count and every
    // cluster's size before the rebuild loop can throw, so a failure is
    // debuggable instead of just a stack trace.
    const diag = {
      perCube: Object.fromEntries(Object.entries(out).map(([n, r]) => [n, { ok: r.ok, rawVertexCount: r.rawVertexCount }])),
      top3Sizes: top3Clusters.map(g => g.length),
    };
    console.log('DIAG', JSON.stringify(diag));

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

    ctx.drawImage(img, 0, 0);
    const colors = { cube1: '#ff3333', cube2: '#33cc33', cube3: '#3388ff', cube4: '#ff9900' };
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      ctx.strokeStyle = colors[name]; ctx.lineWidth = 3;
      ctx.beginPath();
      r.vertices.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
      ctx.closePath(); ctx.stroke();
      r.vertices.forEach(p => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); });
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

  console.log('GLOBAL vanishing points (true 3-point perspective, fit from ' + result.globalFamilies.reduce((s, f) => s + f.memberCount, 0) + '/' + result.allEdgesCount + ' edges):');
  result.globalFamilies.forEach((f, i) => console.log('  family ' + i + ': VP=[' + f.vp[0].toFixed(0) + ',' + f.vp[1].toFixed(0) + '] avgResidual=' + f.avgResidual.toFixed(2) + 'px maxResidual=' + f.maxResidual.toFixed(2) + 'px members=' + f.members.join(', ')));
  for (const [name, r] of Object.entries(result.out)) {
    if (!r.ok) { console.log(name, 'FAILED -- raw vertex count', r.rawVertexCount, '!= 6:', JSON.stringify(r.rawPoly)); continue; }
    console.log(name, 'contourLen=', r.contourLen, 'rawVertexCount=', r.rawVertexCount, 'maskPixels=', r.maskPixels, 'famAssignment=', r.famAssignment);
    console.log('  vertices:', r.vertices.map(v => `[${v[0].toFixed(1)},${v[1].toFixed(1)}]`).join(' '));
    console.log('  max distance of any vertex to nearest raw contour point:', r.maxNearestDist.toFixed(2) + 'px  (criterion 3)');
  }
  const b64 = result.overlayUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(`${OUT}/cube-silhouette-2d-v2.png`, Buffer.from(b64, 'base64'));
  console.log('Wrote cube-silhouette-2d-v2.png');
  await browser.close();
})();
