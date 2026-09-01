// SCRATCH v2 -- 2D house silhouette extraction via the "magic wand" /
// color-mask + connected-component-labeling principle (maintainer's
// explicit steer, replacing the v1 seed+bounding-box approach entirely):
// classify EVERY pixel in the whole image against a few known material
// colors, label connected components, and let those components themselves
// BE the operating region -- no hand-placed seed points, no hand-drawn
// bounding boxes, no per-house tuning at all.
//
// This directly fixes the two real bugs v1 kept hitting one house at a
// time: a bad hand-guessed seed landing on the wrong material (house3),
// and a bounding box reaching far enough to swallow a connecting path
// spur (house4) -- both are structurally impossible here, since a
// connected component is exactly "the maximal connected patch of a single
// material," full stop, independent of any manually chosen anchor point
// or crop window.
//
// It also sidesteps a problem v1 never actually solved cleanly: roof and
// wall are separated by a ~13-14px dark trim band (measured earlier this
// session), which is too wide to bridge with a couple of dilation rounds
// without also leaking into whatever else happens to touch the wall (the
// path spur). Here, roof and wall are left as two SEPARATE components on
// purpose -- their union's convex hull doesn't require them to be
// 4-connected, it only needs their point sets, so the trim gap is simply
// irrelevant instead of something to bridge.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Repo-relative paths -- NOT the /tmp session scratchpad these scripts
// originally used (that only ever existed inside one live agent session
// and does not travel with the repo/branch/PR). The source image is
// committed as a repo fixture; outputs go to tools/verify-out/ like every
// other verify script in this repo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const OUT = path.join(__dirname, 'verify-out');

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[browser]', msg.text()));
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  if (process.env.DEBUG_MASK_ONLY === '1') await page.evaluate(() => { window.__DEBUG_MASK_ONLY__ = true; });

  const result = await page.evaluate(async ({ dataUrl }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const rgb = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // Measured this session, directly from pixel samples across all 6
    // houses (lighting direction is shared, so these are stable): roof
    // (uniform orange, well-separated from everything else -- generous
    // tolerance is safe), wallLight (the visible/sunlit wall face) and
    // wallDark (the shaded wall face). wallLight sits only 27-38 RGB units
    // from the path's own tan tone (measured directly), so its tolerance
    // must stay under that gap -- unlike v1, this is no longer a
    // trade-off against connectivity, since roof/wall don't need to touch.
    const MATERIALS = {
      roof: { color: [225, 126, 69], tol: 35 },
      wallLight: { color: [198, 166, 109], tol: 22 },
      wallDark: { color: [141, 125, 81], tol: 22 },
    };
    const MIN_COMPONENT_SIZE = 300; // rejects antialiasing speckle / noise, not real faces

    function labelComponents(matchFn) {
      const visited = new Uint8Array(W * H);
      const components = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx] || !matchFn(x, y)) continue;
        const stack = [[x, y]];
        visited[idx] = 1;
        const pixels = [];
        let minX = x, maxX = x, minY = y, maxY = y;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          pixels.push([cx, cy]);
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nidx = ny * W + nx;
            if (visited[nidx] || !matchFn(nx, ny)) continue;
            visited[nidx] = 1; stack.push([nx, ny]);
          }
        }
        if (pixels.length >= MIN_COMPONENT_SIZE) {
          components.push({ pixels, bbox: [minX, minY, maxX, maxY], cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, count: pixels.length });
        }
      }
      return components;
    }

    const componentsByMaterial = {};
    for (const [name, { color, tol }] of Object.entries(MATERIALS)) {
      componentsByMaterial[name] = labelComponents((x, y) => rgbDist(rgb(x, y), color) <= tol);
    }

    // --- geometry helpers (unchanged from v1: hull/DP/contour math is not
    // the part being replaced, only the mask-acquisition front end is) ---
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
    function lineIntersect(L1, L2) {
      const [x1, y1] = L1.point, [dx1, dy1] = L1.dir, [x2, y2] = L2.point, [dx2, dy2] = L2.dir;
      const den = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(den) < 1e-9) return null;
      const t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / den;
      return [x1 + t * dx1, y1 + t * dy1];
    }
    function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }
    function angularDist(a, b) { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }

    // --- house grouping: roof components are the anchor (one per house,
    // they never touch each other), then attach whichever wallLight/
    // wallDark component sits directly below and within the roof's own
    // x-range -- purely spatial, no manual per-house data at all. A
    // missing wall component (house5's shaded wall is off-canvas) is not
    // an error, it just means that house gets fewer known vertices. ---
    function findAttachedWall(roof, wallComponents) {
      // NOT "wall's top must sit right at the roof's overall bbox bottom"
      // -- that bbox-bottom is just the roof's single FRONT corner (its
      // lowest point), while a wall's own top edge runs along the roof's
      // LEFT or RIGHT corner (which sits higher up), so a real wall's
      // bbox top is routinely well above the roof's bbox bottom. Confirmed
      // by direct pixel sampling: the first version of this check rejected
      // every real wall match on every house. Centroid proximity (wall
      // below-ish and horizontally overlapping the roof) is the robust
      // signal, not a specific vertical offset.
      const [rx0, ry0, rx1, ry1] = roof.bbox;
      const rw = rx1 - rx0, rh = ry1 - ry0;
      let best = null, bestDist = Infinity;
      for (const w of wallComponents) {
        const [wx0, , wx1] = w.bbox;
        const xOverlap = Math.min(rx1, wx1) - Math.max(rx0, wx0);
        if (xOverlap < rw * 0.15) continue; // must share a meaningful chunk of the roof's width
        if (w.cy < roof.cy) continue; // a wall's centroid is below the roof's centroid, always
        const d = Math.hypot(w.cx - roof.cx, w.cy - roof.cy);
        if (d < bestDist && d < Math.max(rw, rh) * 3) { bestDist = d; best = w; }
      }
      return best;
    }

    const roofs = componentsByMaterial.roof;
    const houses = [];
    roofs.forEach((roof, i) => {
      const wallLight = findAttachedWall(roof, componentsByMaterial.wallLight);
      const wallDark = findAttachedWall(roof, componentsByMaterial.wallDark);
      houses.push({ name: `house${i + 1}`, roof, wallLight, wallDark });
    });

    function hullOf(pixels) { return convexHull(pixels); }
    function extractHouse(house) {
      const parts = [house.roof, house.wallLight, house.wallDark].filter(Boolean);
      // Union each part's OWN convex hull points (not every raw pixel --
      // any point strictly inside a part's own hull cannot possibly be on
      // the union's hull either, so this is a lossless size reduction).
      const unionPoints = parts.flatMap(p => hullOf(p.pixels));
      const hull = convexHull(unionPoints);
      const hullClosed = hull.concat([hull[0]]);
      const dpPoly = douglasPeucker(hullClosed, 3.0).slice(0, -1);
      const targetN = parts.length === 3 ? 6 : (parts.length === 2 ? 5 : 4);
      const rawPoly = dpPoly.length > targetN ? reduceToN(dpPoly, targetN) : dpPoly;
      const partsSummary = { roof: !!house.roof, wallLight: !!house.wallLight, wallDark: !!house.wallDark };
      if (rawPoly.length !== targetN) return { ok: false, name: house.name, rawVertexCount: rawPoly.length, rawPoly, partsSummary };
      return { ok: true, name: house.name, rawVertexCount: rawPoly.length, rawPoly, partsSummary, complete: parts.length === 3 };
    }

    const out = {};
    for (const house of houses) out[house.name] = extractHouse(house);
    // Mark image-edge clipping artifacts NOW (a wall component truncated
    // by the frame boundary produces a vertex sitting exactly on it) --
    // this must happen before the global family fit below, otherwise a
    // clipped house's garbage boundary edge pollutes the shared
    // vanishing-point fit for every other house too.
    for (const r of Object.values(out)) { if (r.ok) r.clipped = r.rawPoly.some(([x]) => x >= W - 2); }

    // DEBUG visualization: color each material's components directly (no
    // seeds/bboxes exist anymore to draw).
    const debugCanvas = document.createElement('canvas'); debugCanvas.width = W; debugCanvas.height = H;
    const dctx = debugCanvas.getContext('2d');
    dctx.drawImage(img, 0, 0);
    const matColor = { roof: [255, 0, 0], wallLight: [0, 200, 0], wallDark: [0, 100, 255] };
    const imgData = dctx.getImageData(0, 0, W, H);
    for (const [mat, comps] of Object.entries(componentsByMaterial)) {
      const [cr, cg, cb] = matColor[mat];
      for (const comp of comps) for (const [x, y] of comp.pixels) {
        const p = (y * W + x) * 4;
        imgData.data[p] = (imgData.data[p] + cr) / 2; imgData.data[p + 1] = (imgData.data[p + 1] + cg) / 2; imgData.data[p + 2] = (imgData.data[p + 2] + cb) / 2;
      }
    }
    dctx.putImageData(imgData, 0, 0);
    dctx.strokeStyle = '#fff'; dctx.lineWidth = 2;
    for (const r of Object.values(out)) {
      if (!r.rawPoly || !r.rawPoly.length) continue;
      dctx.beginPath(); r.rawPoly.forEach((p, i) => i === 0 ? dctx.moveTo(p[0], p[1]) : dctx.lineTo(p[0], p[1])); dctx.closePath(); dctx.stroke();
    }
    const debugUrl = debugCanvas.toDataURL('image/png');
    if (window.__DEBUG_MASK_ONLY__) {
      return {
        W, H, debugUrl,
        componentCounts: Object.fromEntries(Object.entries(componentsByMaterial).map(([k, v]) => [k, v.map(c => c.count)])),
        summary: Object.fromEntries(Object.entries(out).map(([n, r]) => [n, { ok: r.ok, rawVertexCount: r.rawVertexCount, rawPoly: r.rawPoly, partsSummary: r.partsSummary, complete: r.complete }])),
      };
    }

    // --- Global family fitting (unchanged approach from v1): pool edges
    // from every COMPLETE house (6-vertex) into 3 direction families via
    // circular k-means + per-house opposite-pair bipartite correction,
    // then fit one shared vanishing point per family via TLS. ---
    const allEdges = [];
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok || r.rawVertexCount !== 6 || r.clipped) continue;
      for (let i = 0; i < 6; i++) {
        const a = r.rawPoly[i], b = r.rawPoly[(i + 1) % 6];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        allEdges.push({ cube: name, idx: i, angle: angleMod180(dx, dy), len, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dir: [dx / len, dy / len], a, b });
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
      for (let iter = 0; iter < 10; iter++) {
        let changed = false;
        assignment = edges.map(e => { let best = 0, bestDist = Infinity; centers.forEach((c, ci) => { const d = angularDist(e.angle, c); if (d < bestDist) { bestDist = d; best = ci; } }); return best; });
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
    function pairAngle(e1, e2) {
      const a2a = e1.angle * 2 * Math.PI / 180, a2b = e2.angle * 2 * Math.PI / 180;
      const sx = Math.cos(a2a) * e1.len + Math.cos(a2b) * e2.len, sy = Math.sin(a2a) * e1.len + Math.sin(a2b) * e2.len;
      return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
    }
    function permutations3() { return [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]; }
    const famOfEdge = new Map();
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok || r.rawVertexCount !== 6 || r.clipped) continue;
      const cubeEdges = allEdges.filter(e => e.cube === name);
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
    const globalFamilies = top3Clusters.map(group => {
      const vp = fitVanishingPoint(group);
      return { vp, memberCount: group.length, members: group.map(i => `${allEdges[i].cube}#${allEdges[i].idx}`) };
    });
    const famOf = new Map();
    top3Clusters.forEach((group, famIdx) => { for (const i of group) famOf.set(allEdges[i].cube + '#' + allEdges[i].idx, famIdx); });
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok || r.rawVertexCount !== 6 || r.clipped) continue;
      r.famAssignment = [0, 1, 2, 3, 4, 5].map(i => famOf.get(name + '#' + i));
    }

    // --- Image-edge clipping (e.g. house5, nearest the right border): a
    // wall component truncated by the frame boundary produces one or more
    // vertices sitting exactly ON that boundary (x>=W-2) -- these are
    // clipping ARTIFACTS, not real corners, regardless of whether the
    // house otherwise looked "complete" (found all 3 parts) or not. Per
    // the maintainer's steer: don't fake a 2D position for what's missing
    // -- drop every clipped vertex, keep only the edges that were
    // originally adjacent in the hexagon AND have neither endpoint
    // clipped, and hand the 3D solver `null` for every dropped corner so
    // it gets reconstructed from the box's own rigid structure instead
    // (its projection can legitimately land beyond the frame, x>W).
    // Works uniformly whether 1 vertex is clipped (a corner sits exactly
    // at the boundary) or 2 adjacent ones are (a whole edge does).
    for (const [name, r] of Object.entries(out)) {
      if (!r.ok) continue;
      const poly = r.rawPoly;
      const n = poly.length;
      const clipped = poly.map(([x]) => x >= W - 2);
      if (!clipped.some(Boolean)) { r.vertices = poly; continue; } // nothing clipped -- use as-is
      if (n !== 6) { r.ok = false; r.reason = `clipped vertex on a non-hexagon (${n} vertices) -- not handled`; continue; }
      const edgeAngleOf = (a, b) => angleMod180(b[0] - a[0], b[1] - a[1]);
      const realFamByEdge = {}; // edge index i (connecting i,(i+1)%6) -> family, only where both endpoints survive
      for (let i = 0; i < 6; i++) {
        if (clipped[i] || clipped[(i + 1) % 6]) continue;
        const a = edgeAngleOf(poly[i], poly[(i + 1) % 6]);
        const dists = famCenters.map(c => angularDist(a, c));
        realFamByEdge[i] = dists.indexOf(Math.min(...dists));
      }
      const realFamValues = new Set(Object.values(realFamByEdge));
      if (realFamValues.size < 3) { r.ok = false; r.reason = `only ${realFamValues.size} distinct real families survived clipping (need 3)`; continue; }
      // famAssignment still needs a value at every position 0-5 (localCoords
      // is purely combinatorial over the family PATTERN) -- fill missing
      // slots from their opposite pair (i, i+3 share a family, always).
      const famAssignment = new Array(6).fill(null);
      for (const [i, fam] of Object.entries(realFamByEdge)) { famAssignment[i] = fam; famAssignment[(Number(i) + 3) % 6] = fam; }
      if (famAssignment.some(f => f === null)) { r.ok = false; r.reason = 'could not fill famAssignment from surviving real edges'; continue; }
      r.vertices = poly.map((p, i) => (clipped[i] ? null : p));
      r.famAssignment = famAssignment;
      r.partial = true;
      r.complete = false;
    }

    return { W, H, out, globalFamilies, allEdgesCount: allEdges.length, componentCounts: Object.fromEntries(Object.entries(componentsByMaterial).map(([k, v]) => [k, v.map(c => c.count)])) };
  }, { dataUrl });

  if (process.env.DEBUG_MASK_ONLY === '1') {
    console.log('Component counts by material:', JSON.stringify(result.componentCounts, null, 1));
    console.log(JSON.stringify(result.summary, null, 2));
    const b64d = result.debugUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(`${OUT}/village-v2-debugmask.png`, Buffer.from(b64d, 'base64'));
    console.log('Wrote village-v2-debugmask.png');
    await browser.close();
    return;
  }

  console.log('Component counts by material:', JSON.stringify(result.componentCounts));
  console.log('\nGLOBAL vanishing points:');
  result.globalFamilies.forEach((f, i) => console.log('  family ' + i + ': VP=' + (f.vp ? `[${f.vp[0].toFixed(0)},${f.vp[1].toFixed(0)}]` : 'null') + ' members=' + f.memberCount));
  for (const [name, r] of Object.entries(result.out)) {
    if (!r.ok) { console.log(name, 'FAILED:', r.reason || ('vertex count ' + r.rawVertexCount)); continue; }
    console.log(name, r.complete ? 'COMPLETE (6/6)' : 'PARTIAL (' + r.vertices.filter(v => v).length + '/6)', 'parts=', JSON.stringify(r.partsSummary), 'famAssignment=', r.famAssignment);
    console.log('  vertices:', r.vertices.map(v => v ? `[${v[0].toFixed(1)},${v[1].toFixed(1)}]` : 'null').join(' '));
  }

  const dump = {
    W: result.W, H: result.H,
    cubes: Object.fromEntries(Object.entries(result.out).filter(([, r]) => r.ok).map(([name, r]) => [name, { rawPoly: r.vertices, famAssignment: r.famAssignment }])),
  };
  fs.writeFileSync(path.join(OUT, 'village-raw2d-v2.json'), JSON.stringify(dump, null, 2));
  console.log('Wrote village-raw2d-v2.json');
  await browser.close();
})();
