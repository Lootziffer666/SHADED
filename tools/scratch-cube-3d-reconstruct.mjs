// SCRATCH -- classical single-view metrology (Caprile & Torre 1990 /
// Criminisi's "Single View Metrology"), built on the already-verified 2D
// hexagon + 3-vanishing-point extraction. All 4 cubes are real 1x1x1
// units. Steps:
//  1. principal point = orthocenter of the VP triangle (exact, no
//     assumption -- classical result for 3 mutually orthogonal VPs)
//  2. focal length from the orthogonality constraint between VP rays
//  3. rotation matrix from the 3 normalized VP ray directions
//  4. per-cube translation (position) from its 6 measured 2D vertices +
//     known unit edge length, via least-squares back-projection
//  5. PROOF: reproject the reconstructed cubes through the reconstructed
//     camera and compare to the real measured 2D vertices -- this is the
//     actual correctness check, not just "the math looks right"
//  6. only after 5 passes: render the scene from a rotated viewpoint
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = '/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/image-17.png';

const CUBES = {
  cube1: { seeds: [[360, 200], [300, 290], [430, 290]] },
  cube2: { seeds: [[650, 260], [580, 360], [720, 360]] },
  cube3: { seeds: [[890, 115], [830, 200], [950, 200]] },
  cube4: { seeds: [[1000, 375], [920, 500], [1090, 500]] },
};

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  page.on('console', msg => console.log('[browser]', msg.text()));
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');

  // ---- Phase 1 (browser): identical, already-verified 2D extraction ----
  const extraction = await page.evaluate(async ({ dataUrl, CUBES }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => { const i = (y * W + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
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
      const inFn = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
      const contour = traceContourMoore(inFn);
      const hull = convexHull(contour);
      const hullClosed = hull.concat([hull[0]]);
      const dpPoly = douglasPeucker(hullClosed, 3.0).slice(0, -1);
      const rawPoly = dpPoly.length > 6 ? reduceToN(dpPoly, 6) : dpPoly;
      if (rawPoly.length !== 6) return { ok: false, rawVertexCount: rawPoly.length };
      const edgeDir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
      const rawEdges = rawPoly.map((p, i) => {
        const b = rawPoly[(i + 1) % 6];
        return { a: p, b, dir: edgeDir(p, b), len: Math.hypot(b[0] - p[0], b[1] - p[1]), mid: [(p[0] + b[0]) / 2, (p[1] + b[1]) / 2] };
      });
      return { ok: true, contour, rawPoly, rawEdges };
    }
    const out = {};
    for (const [name, def] of Object.entries(CUBES)) out[name] = extractCube(def.seeds);

    function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }
    function angularDist(a, b) { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
    const allEdges = [];
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      r.rawEdges.forEach((e, idx) => allEdges.push({ cube: name, idx, angle: angleMod180(e.dir[0], e.dir[1]), len: e.len, mid: e.mid, dir: e.dir, a: e.a, b: e.b }));
    }
    function circularKMeans3(edges) {
      let centers = [edges[0].angle];
      while (centers.length < 3) {
        let best = -1, bestDist = -1;
        for (const e of edges) { const d = Math.min(...centers.map(c => angularDist(e.angle, c))); if (d > bestDist) { bestDist = d; best = e.angle; } }
        centers.push(best);
      }
      let assignment = edges.map(() => -1);
      for (let iter = 0; iter < 10; iter++) {
        assignment = edges.map(e => { let best = 0, bestDist = Infinity; centers.forEach((c, ci) => { const d = angularDist(e.angle, c); if (d < bestDist) { bestDist = d; best = ci; } }); return best; });
        centers = centers.map((c, ci) => {
          const members = edges.filter((_, i) => assignment[i] === ci);
          if (!members.length) return c;
          let sx = 0, sy = 0;
          for (const e of members) { const a2 = e.angle * 2 * Math.PI / 180; sx += Math.cos(a2) * e.len; sy += Math.sin(a2) * e.len; }
          return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
        });
      }
      const groups = [[], [], []];
      assignment.forEach((ci, i) => groups[ci].push(i));
      return groups;
    }
    const top3Clusters = circularKMeans3(allEdges);
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
    const globalFamilies = top3Clusters.map(group => ({ vp: fitVanishingPoint(group), memberCount: group.length }));
    const famOf = new Map();
    top3Clusters.forEach((group, famIdx) => { for (const i of group) famOf.set(allEdges[i].cube + '#' + allEdges[i].idx, famIdx); });

    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      const lines = r.rawEdges.map((e, idx) => {
        const fam = famOf.get(name + '#' + idx);
        const vp = globalFamilies[fam].vp;
        const dx = vp[0] - e.mid[0], dy = vp[1] - e.mid[1], len = Math.hypot(dx, dy);
        return { point: e.mid, dir: [dx / len, dy / len], famIdx: fam };
      });
      const vertices = [];
      for (let i = 0; i < 6; i++) vertices.push(lineIntersect(lines[i], lines[(i + 1) % 6]));
      r.vertices = vertices;
      r.famAssignment = lines.map(l => l.famIdx);
    }
    return { W, H, out, globalFamilies };
  }, { dataUrl, CUBES });

  await browser.close();

  // ---- Phase 2 (Node): classical single-view metrology math ----
  const { W, H, out, globalFamilies } = extraction;
  console.log('Extraction summary:');
  for (const [name, r] of Object.entries(out)) console.log(' ', name, r.ok ? `6 vertices, fam=${r.famAssignment}` : `FAILED (${r.rawVertexCount} verts)`);

  const VP = globalFamilies.map(f => f.vp);
  console.log('\nVanishing points:', VP.map(v => `[${v[0].toFixed(1)},${v[1].toFixed(1)}]`).join(' '));

  // 1. Principal point = orthocenter of triangle(VP[0],VP[1],VP[2]).
  function orthocenter(A, B, C) {
    // Standard formula via altitude intersection.
    function altitudeLine(P, Q, R) {
      // altitude from P, perpendicular to QR, through P
      const dir = [-(R[1] - Q[1]), R[0] - Q[0]]; // perpendicular to QR
      return { point: P, dir };
    }
    const L1 = altitudeLine(A, B, C);
    const L2 = altitudeLine(B, A, C);
    const x1 = L1.point[0], y1 = L1.point[1], dx1 = L1.dir[0], dy1 = L1.dir[1];
    const x2 = L2.point[0], y2 = L2.point[1], dx2 = L2.dir[0], dy2 = L2.dir[1];
    const den = dx1 * dy2 - dy1 * dx2;
    const t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / den;
    return [x1 + t * dx1, y1 + t * dy1];
  }
  const pp = orthocenter(VP[0], VP[1], VP[2]);
  console.log('Principal point (orthocenter):', pp.map(v => v.toFixed(1)));
  console.log('  (image center for reference:', [W / 2, H / 2], ')');

  // 2. Focal length from orthogonality: (V_i - pp) . (V_j - pp) + f^2 = 0
  function focalFromPair(Vi, Vj) {
    const dot = (Vi[0] - pp[0]) * (Vj[0] - pp[0]) + (Vi[1] - pp[1]) * (Vj[1] - pp[1]);
    const f2 = -dot;
    return f2 > 0 ? Math.sqrt(f2) : null;
  }
  const fEstimates = [focalFromPair(VP[0], VP[1]), focalFromPair(VP[1], VP[2]), focalFromPair(VP[0], VP[2])];
  console.log('Focal length estimates from each VP pair:', fEstimates.map(f => f ? f.toFixed(1) : 'invalid'));
  const validF = fEstimates.filter(f => f !== null);
  if (validF.length === 0) throw new Error('No valid focal length -- VPs are not consistent with an orthogonal-axis pinhole camera. Not a placement bug, a calibration failure to report honestly.');
  const f = validF.reduce((s, v) => s + v, 0) / validF.length;
  console.log('Focal length (averaged):', f.toFixed(1), 'px  spread:', (Math.max(...validF) - Math.min(...validF)).toFixed(1), 'px');

  // 3. Rotation: 3 world axes as unit ray directions in camera space,
  // e_k = normalize([Vk.x-pp.x, Vk.y-pp.y, f]) -- classical result, the
  // ray from the camera center through a vanishing point IS that world
  // axis direction, expressed in camera coordinates.
  function normalize3([x, y, z]) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
  const axes = VP.map(v => normalize3([v[0] - pp[0], v[1] - pp[1], f]));
  console.log('\nWorld axis directions in camera space:');
  axes.forEach((e, i) => console.log('  e' + i + ' =', e.map(v => v.toFixed(4))));
  // Sanity check: axes should be mutually orthogonal (dot ~ 0) by
  // construction (that's what the focal-length equation enforced) --
  // verify it actually came out that way, don't just assume it.
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  console.log('  orthogonality check: e0.e1=' + dot3(axes[0], axes[1]).toFixed(4) + ' e1.e2=' + dot3(axes[1], axes[2]).toFixed(4) + ' e0.e2=' + dot3(axes[0], axes[2]).toFixed(4) + '  (should all be ~0)');

  // 4. Per-cube local integer coordinates for its 6 hexagon vertices, via
  // the signed walk around the loop: each edge steps +-1 along its
  // family's axis, sign = whether the edge's actual 2D direction matches
  // "toward that family's VP" (same convention axes[] already uses).
  function projectPoint(camPoint) {
    return [pp[0] + f * camPoint[0] / camPoint[2], pp[1] + f * camPoint[1] / camPoint[2]];
  }
  const reconstructed = {};
  for (const [name, r] of Object.entries(out)) {
    if (!r.ok) continue;
    const localCoords = [[0, 0, 0]];
    for (let i = 0; i < 6; i++) {
      const vA = r.vertices[i], vB = r.vertices[(i + 1) % 6];
      // vertices[i] = intersection(line_i, line_{i+1}), i.e. the corner
      // AFTER edge i / BEFORE edge i+1 -- so the straight run from
      // vertices[i] to vertices[i+1] is edge (i+1)'s family, not edge i's.
      const fam = r.famAssignment[(i + 1) % 6];
      const vp = VP[fam];
      const towardVP = normalize3([vp[0] - vA[0], vp[1] - vA[1], 0]).slice(0, 2);
      const edgeDir2D = [vB[0] - vA[0], vB[1] - vA[1]];
      const sign = Math.sign(edgeDir2D[0] * towardVP[0] + edgeDir2D[1] * towardVP[1]);
      const next = localCoords[i].slice();
      next[fam] += sign;
      if (i < 5) localCoords.push(next);
      else {
        // closing check: walking all 6 edges should return to start
        const closureError = Math.hypot(next[0] - localCoords[0][0], next[1] - localCoords[0][1], next[2] - localCoords[0][2]);
        if (closureError > 1e-6) console.log('  WARNING', name, 'local-coordinate walk did not close:', next, 'vs start', localCoords[0]);
      }
    }
    // Solve for cube translation T (camera-space) via least squares over
    // all 6 vertex correspondences (2 linear equations each, see derivation
    // in the header comment).
    let Sxx = 0, Sxy = 0, Sxz = 0, Syy = 0, Syz = 0, Szz = 0, bx = 0, by = 0, bz = 0;
    const rows = [];
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[i];
      const K = [a * axes[0][0] + b * axes[1][0] + c * axes[2][0], a * axes[0][1] + b * axes[1][1] + c * axes[2][1], a * axes[0][2] + b * axes[1][2] + c * axes[2][2]];
      const px = r.vertices[i][0], py = r.vertices[i][1];
      // row for x: -f*Tx + 0*Ty + (px-ppx)*Tz = f*Kx - (px-ppx)*Kz
      rows.push({ row: [-f, 0, px - pp[0]], rhs: f * K[0] - (px - pp[0]) * K[2] });
      // row for y: 0*Tx - f*Ty + (py-ppy)*Tz = f*Ky - (py-ppy)*Kz
      rows.push({ row: [0, -f, py - pp[1]], rhs: f * K[1] - (py - pp[1]) * K[2] });
    }
    // Normal equations A^T A x = A^T b for the 3 unknowns (Tx,Ty,Tz).
    const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Atb = [0, 0, 0];
    for (const { row, rhs } of rows) {
      for (let i = 0; i < 3; i++) { Atb[i] += row[i] * rhs; for (let j = 0; j < 3; j++) AtA[i][j] += row[i] * row[j]; }
    }
    function solve3x3(A, b) {
      const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
      const Ax = [[b[0], A[0][1], A[0][2]], [b[1], A[1][1], A[1][2]], [b[2], A[2][1], A[2][2]]];
      const Ay = [[A[0][0], b[0], A[0][2]], [A[1][0], b[1], A[1][2]], [A[2][0], b[2], A[2][2]]];
      const Az = [[A[0][0], A[0][1], b[0]], [A[1][0], A[1][1], b[1]], [A[2][0], A[2][1], b[2]]];
      const det3 = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
      return [det3(Ax) / det, det3(Ay) / det, det3(Az) / det];
    }
    const T = solve3x3(AtA, Atb);

    // 5. PROOF: reproject and compare to measured vertices.
    let maxReprojError = 0, sumReprojError = 0;
    const reprojected = [];
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[i];
      const camPoint = [T[0] + a * axes[0][0] + b * axes[1][0] + c * axes[2][0], T[1] + a * axes[0][1] + b * axes[1][1] + c * axes[2][1], T[2] + a * axes[0][2] + b * axes[1][2] + c * axes[2][2]];
      const proj = projectPoint(camPoint);
      reprojected.push(proj);
      const err = Math.hypot(proj[0] - r.vertices[i][0], proj[1] - r.vertices[i][1]);
      maxReprojError = Math.max(maxReprojError, err);
      sumReprojError += err;
    }
    reconstructed[name] = { T, localCoords, maxReprojError, avgReprojError: sumReprojError / 6, reprojected, measured: r.vertices };
    console.log(name, 'T(camera-space)=', T.map(v => v.toFixed(3)), ' maxReprojError=' + maxReprojError.toFixed(2) + 'px avgReprojError=' + (sumReprojError / 6).toFixed(2) + 'px');
  }

  fs.writeFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/svm-full.json', JSON.stringify({ W, H, pp, f, axes, VP, reconstructed }, null, 2));
  console.log('\nWrote svm-full.json');
})();
