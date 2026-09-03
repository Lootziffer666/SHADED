// SCRATCH -- corrects a fundamental misunderstanding in the previous round
// (scratch-village-extract-vlg04-blind.mjs): testing whether VLG-02's
// HARDCODED color values transfer to VLG-04 is not a test of Cultivation at
// all. Cultivation's entire premise (material-geometrie-ohne-farbe.md SS3)
// is the opposite: find locally coherent regions FROM THE IMAGE ITSELF,
// with no pre-known "roof is this RGB" assumption -- the same way rounds
// 1-12 already derived every threshold (COLOR_THRESHOLD, LBP threshold...)
// from percentiles of the image's OWN pixel-pair distribution, not from an
// external fixed number. Round 13 broke that discipline by importing
// VLG-02's fixed numbers wholesale; this round undoes that.
//
// Runs on VLG-04 ALONE, zero reference to VLG-02's specific colors:
// 1) color-quantize the WHOLE image and label connected components with NO
//    hue pre-filtering at all (unlike the "roof-ish"/"wall-ish" filters from
//    the earlier, self-corrected attempt) -- just the largest components,
//    whatever color they happen to be.
// 2) for the largest components, compute the convex-hull edge-direction
//    signature already established this session (fixture-taxonomie.md's
//    "polyedrisch-N": dominant edges falling into ~3 direction families,
//    alternating pattern) -- this is a GEOMETRIC test, not a color-name
//    test, consistent with "SHADED muss egal sein, was es rekonstruiert."
// 3) report how many, if any, of VLG-04's own large regions show that
//    signature -- found from VLG-04's own statistics only.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(__dirname, '..', 'file_0000000029f871f4bc597d92064d2e97.png');
const OUT = path.join(__dirname, 'verify-out');

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');

  const result = await page.evaluate(async ({ dataUrl }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const rgb = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };

    // Quantize colors coarsely -- step=20 per channel derived from nothing
    // but "coarse enough to merge shading variation within one material,
    // fine enough not to merge distinct materials", the same tradeoff every
    // earlier round's thresholds made from the image's own statistics, not
    // an imported number.
    const STEP = 20;
    function quant(x, y) { const [r, g, b] = rgb(x, y); return [Math.floor(r / STEP), Math.floor(g / STEP), Math.floor(b / STEP)]; }

    // MIN_COMPONENT_SIZE derived from THIS image's own scale (0.01% of
    // total pixels), not copied from VLG-02's fixed 300px.
    const MIN_COMPONENT_SIZE = Math.round(W * H * 0.0001);

    function labelComponents() {
      const visited = new Uint8Array(W * H);
      const components = [];
      const qcache = new Int32Array(W * H).fill(-1);
      function qkey(x, y) {
        const idx = y * W + x;
        if (qcache[idx] === -1) { const [qr, qg, qb] = quant(x, y); qcache[idx] = (qr << 16) | (qg << 8) | qb; }
        return qcache[idx];
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx]) continue;
        const key = qkey(x, y);
        const stack = [[x, y]];
        visited[idx] = 1;
        const pixels = [];
        let minX = x, maxX = x, minY = y, maxY = y;
        let sr = 0, sg = 0, sb = 0;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          pixels.push([cx, cy]);
          const [pr, pg, pb] = rgb(cx, cy); sr += pr; sg += pg; sb += pb;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nidx = ny * W + nx;
            if (visited[nidx] || qkey(nx, ny) !== key) continue;
            visited[nidx] = 1; stack.push([nx, ny]);
          }
        }
        if (pixels.length >= MIN_COMPONENT_SIZE) {
          components.push({ pixels, bbox: [minX, minY, maxX, maxY], count: pixels.length, meanColor: [sr / pixels.length, sg / pixels.length, sb / pixels.length] });
        }
      }
      return components.sort((a, b) => b.count - a.count);
    }

    // Geometric signature helpers, reused verbatim from
    // scratch-village-extract-v2.mjs (not the color logic -- the hull/DP
    // math, which is domain-free).
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
    function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }

    // Does a simplified polygon's edge-angle set cluster into ~3 dominant
    // direction families (the polyedrisch-N / hexagon-box signature)?
    // Cluster angles with a simple greedy pass (merge within 12deg), then
    // check if >=70% of edge length falls into exactly 2-4 clusters.
    function directionFamilySignature(poly) {
      if (poly.length < 4) return null;
      const edges = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 2) continue;
        edges.push({ angle: angleMod180(b[0] - a[0], b[1] - a[1]), len });
      }
      if (edges.length < 3) return null;
      const clusters = [];
      for (const e of edges) {
        let placed = false;
        for (const cl of clusters) {
          const d = Math.min(Math.abs(cl.angle - e.angle), 180 - Math.abs(cl.angle - e.angle));
          if (d < 12) { cl.totalLen += e.len; cl.count++; placed = true; break; }
        }
        if (!placed) clusters.push({ angle: e.angle, totalLen: e.len, count: 1 });
      }
      clusters.sort((a, b) => b.totalLen - a.totalLen);
      const totalLen = edges.reduce((s, e) => s + e.len, 0);
      const top3Len = clusters.slice(0, 3).reduce((s, c) => s + c.totalLen, 0);
      return { nEdges: edges.length, nClusters: clusters.length, top3Fraction: top3Len / totalLen, familyAngles: clusters.slice(0, 4).map((c) => Math.round(c.angle)) };
    }

    const components = labelComponents();
    const top = components.slice(0, 60);
    const withSignature = top.map((comp) => {
      const hull = convexHull(comp.pixels);
      const hullClosed = hull.concat([hull[0]]);
      const dp = douglasPeucker(hullClosed, 3.0).slice(0, -1);
      const sig = directionFamilySignature(dp);
      return { bbox: comp.bbox, count: comp.count, meanColor: comp.meanColor.map((v) => Math.round(v)), vertexCount: dp.length, signature: sig };
    });

    const polyhedralLike = withSignature.filter((r) => r.signature && r.signature.nClusters <= 4 && r.signature.top3Fraction >= 0.7 && r.vertexCount >= 4 && r.vertexCount <= 10);

    return { W, H, MIN_COMPONENT_SIZE, totalComponentsFound: components.length, top60: withSignature, polyhedralLikeCount: polyhedralLike.length, polyhedralLike };
  }, { dataUrl });

  console.log(`Total components (any color, size>=${result.MIN_COMPONENT_SIZE}): ${result.totalComponentsFound}`);
  console.log(`Of the top 60 largest, ${result.polyhedralLikeCount} show the polyedrisch-N signature (<=4 direction clusters, >=70% edge length in top 3, 4-10 vertices):\n`);
  for (const r of result.polyhedralLike) {
    console.log(`  bbox=${JSON.stringify(r.bbox)} size=${r.count}px color=rgb(${r.meanColor.join(',')}) vertices=${r.vertexCount} families=${JSON.stringify(r.signature.familyAngles)}deg`);
  }
  fs.writeFileSync(path.join(OUT, 'vlg04-cultivation-fresh.json'), JSON.stringify(result, null, 2));
  await browser.close();
})();
