import { chromium } from 'playwright';
import fs from 'fs';

const IMG = '/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/image-17.png';

// Rough per-cube, per-face seed points, picked by eye from the rendered
// image (naming faces top/left/right by their apparent position).
const CUBES = {
  cube1: { seeds: [[360, 200], [300, 290], [430, 290]] },   // front-left
  cube2: { seeds: [[650, 260], [580, 360], [720, 360]] },   // front-center (largest of the 3-row)
  cube3: { seeds: [[890, 115], [830, 200], [950, 200]] },   // back small one, top-right
  cube4: { seeds: [[1000, 375], [920, 500], [1090, 500]] }, // front-right (biggest overall)
};

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
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

    function traceContourMoore(inFn, width, height) {
      let start = null;
      outer: for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (inFn(x, y)) { start = [x, y]; break outer; }
      if (!start) return [];
      const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
      const findDirIndex = (d) => dirs.findIndex(v => v[0] === d[0] && v[1] === d[1]);
      const contour = [start];
      let current = start, backtrack = [-1, 0];
      for (let iter = 0; iter < width * height * 4; iter++) {
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
    function floodFillTol(seedX, seedY, tol) {
      const seedVal = lum(seedX, seedY);
      const visited = new Uint8Array(W * H);
      const stack = [[seedX, seedY]];
      visited[seedY * W + seedX] = 1;
      const pixels = [];
      while (stack.length) {
        const [x, y] = stack.pop();
        pixels.push([x, y]);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const idx = ny * W + nx;
          if (visited[idx]) continue;
          if (Math.abs(lum(nx, ny) - seedVal) < tol) { visited[idx] = 1; stack.push([nx, ny]); }
        }
      }
      return { pixels, visited };
    }

    const out = {};
    for (const [name, def] of Object.entries(CUBES)) {
      const combined = new Uint8Array(W * H);
      let totalPixels = 0;
      const seedVals = [];
      const perSeedCounts = [];
      for (const [sx, sy] of def.seeds) {
        seedVals.push(Math.round(lum(sx, sy)));
        const { visited } = floodFillTol(sx, sy, 14);
        let count = 0;
        for (let i = 0; i < visited.length; i++) if (visited[i]) { combined[i] = 1; count++; }
        perSeedCounts.push(count);
        totalPixels += count;
      }
      // The 3 per-face flood fills are separated by a few px of antialiased
      // transition pixels that neither face's tolerance window claims --
      // without closing that gap, the 3 faces stay disjoint blobs and the
      // contour trace only finds whichever one the raster scan hits first
      // (always the top face). Dilate a few rounds to bridge it.
      let mask = combined;
      for (let round = 0; round < 4; round++) {
        const next = new Uint8Array(mask);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (mask[y * W + x]) continue;
          if ((x > 0 && mask[y * W + x - 1]) || (x < W - 1 && mask[y * W + x + 1]) ||
              (y > 0 && mask[(y - 1) * W + x]) || (y < H - 1 && mask[(y + 1) * W + x])) next[y * W + x] = 1;
        }
        mask = next;
      }
      const inFn = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
      const contour = traceContourMoore(inFn, W, H);
      // Cube silhouettes are convex -- take the convex hull of the traced
      // boundary (kills antialiasing jaggies) THEN simplify, instead of
      // simplifying the noisy raw contour directly.
      const hull = convexHull(contour);
      const hullClosed = hull.concat([hull[0]]);
      const poly = douglasPeucker(hullClosed, 9.0);
      // bounding box + pixel count as sanity metrics
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, pixCount = 0;
      for (let i = 0; i < combined.length; i++) if (combined[i]) {
        pixCount++;
        const x = i % W, y = (i / W) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      out[name] = { seedVals, perSeedCounts, pixCount, bbox: { minX, maxX, minY, maxY }, contourLen: contour.length, poly };
    }
    // overlay: redraw the image, stroke each cube's traced polygon + vertex dots
    ctx.drawImage(img, 0, 0);
    const colors = { cube1: '#ff3333', cube2: '#33cc33', cube3: '#3388ff', cube4: '#ff9900' };
    for (const [name, r] of Object.entries(out)) {
      ctx.strokeStyle = colors[name]; ctx.lineWidth = 3;
      ctx.beginPath();
      r.poly.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
      ctx.stroke();
      r.poly.forEach(p => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); });
    }
    const overlayUrl = c.toDataURL('image/png');
    return { W, H, out, overlayUrl };
  }, { dataUrl, CUBES });

  fs.writeFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/measure-result.json', JSON.stringify({ W: result.W, H: result.H, out: result.out }, null, 2));
  const b64 = result.overlayUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('/home/user/SHADED/tools/verify-out/cube-measure-overlay.png', Buffer.from(b64, 'base64'));
  for (const [name, r] of Object.entries(result.out)) {
    console.log(name, 'seedVals=', r.seedVals, 'perSeedCounts=', r.perSeedCounts, 'pixCount=', r.pixCount, 'bbox=', r.bbox, 'poly verts=', r.poly.length, JSON.stringify(r.poly));
  }
  await browser.close();
})();
