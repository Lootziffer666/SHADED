// SCRATCH prototype — NOT part of the verify suite, NOT meant to be
// committed. Tests the "recognize the plane before you can replicate it"
// idea from the maintainer's hand-drawn annotation: take a real material
// mask from SHADED's own analyze() (via the real, unmodified
// getMaterialTypeAt() API — no second classification), trace one house's
// roof/wood blob boundary, simplify it down to a handful of dominant
// straight edges (Douglas-Peucker), and draw the result as red/orange lines
// over the real scene image the same way the maintainer did by hand.
// Reuses runtime/hall-plan/plan-analyzer.mjs's connectedComponents() instead
// of reimplementing blob detection (matches the project's established
// "don't reinvent a shared primitive" discipline). Contour tracing and
// Douglas-Peucker themselves are textbook algorithms with no existing
// SHADED implementation to reuse, so they're written here directly.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectedComponents } from '../runtime/hall-plan/plan-analyzer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const SCENE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
const DEPTH_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579_depth.png');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon' };

import http from 'http';
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const data = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

// --- Textbook contour tracing (Moore-neighbor) ------------------------------
function traceContourMoore(labelGrid, width, height, targetLabel) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && labelGrid[y * width + x] === targetLabel;
  let start = null;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (inside(x, y)) { start = [x, y]; break outer; }
  }
  if (!start) return [];
  const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const findDirIndex = (d) => dirs.findIndex(v => v[0] === d[0] && v[1] === d[1]);
  const contour = [start];
  let current = start, backtrack = [-1, 0];
  const maxIterations = width * height * 4;
  for (let iter = 0; iter < maxIterations; iter++) {
    const backIndex = findDirIndex(backtrack);
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const idx = (backIndex + k) % 8;
      const [dx, dy] = dirs[idx], nx = current[0] + dx, ny = current[1] + dy;
      if (inside(nx, ny)) {
        contour.push([nx, ny]);
        backtrack = [current[0] - nx, current[1] - ny];
        current = [nx, ny];
        found = true;
        break;
      }
    }
    if (!found) break;
    if (current[0] === start[0] && current[1] === start[1]) break;
  }
  return contour;
}

// --- Textbook Douglas-Peucker polygon simplification ------------------------
function perpendicularDistance([px, py], [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
}
function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0, index = 0;
  const first = points[0], last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

// Textbook binary dilation (structuring element = 3x3), used only to bridge
// the wood/timber-frame class's naturally sparse individual-beam fragments
// into one connected "wall zone" before tracing -- picking a single raw
// wood component gave a single beam sliver, not the wall outline.
function dilate(mask, w, h, iterations = 1) {
  let cur = mask;
  for (let it = 0; it < iterations; it++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let on = false;
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (cur[ny * w + nx]) on = true;
      }
      next[y * w + x] = on ? 255 : 0;
    }
    cur = next;
  }
  return cur;
}

(async () => {
  await new Promise(r => server.listen(8933, r));
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto('http://localhost:8933/index.html', { waitUntil: 'load' });
  await page.setInputFiles('#f-scene', SCENE_IMG);
  await page.setInputFiles('#f-depth', DEPTH_IMG);
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 60000 });

  const GRID_W = 320;
  const { roofMask, woodMask, gridW, gridH, imgW, imgH } = await page.evaluate(async ({ gridW, sceneDataUrl }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = sceneDataUrl; });
    const imgW = img.naturalWidth, imgH = img.naturalHeight;
    const gridH = Math.round(gridW * imgH / imgW);
    const roofMask = new Array(gridW * gridH).fill(0);
    const woodMask = new Array(gridW * gridH).fill(0);
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const u = (gx + 0.5) / gridW, v = (gy + 0.5) / gridH;
        const cls = window.SHADED.getMaterialTypeAt(u, v);
        const i = gy * gridW + gx;
        if (cls === 'roof') roofMask[i] = 255;
        else if (cls === 'wood') woodMask[i] = 255;
      }
    }
    return { roofMask, woodMask, gridW, gridH, imgW, imgH };
  }, { gridW: GRID_W, sceneDataUrl: 'data:image/png;base64,' + fs.readFileSync(SCENE_IMG).toString('base64') });

  const imageDims = { width: gridW, height: gridH };
  const roofComps = connectedComponents(imageDims, Uint8Array.from(roofMask), 20);
  const woodComps = connectedComponents(imageDims, Uint8Array.from(woodMask), 20);
  console.log(`Roof components: ${roofComps.length}, Wood components: ${woodComps.length}`);
  if (!roofComps.length) throw new Error('No roof component found — cannot proceed.');

  roofComps.sort((a, b) => b.pixels - a.pixels);
  const roof = roofComps[0];
  console.log('Chosen roof component:', { pixels: roof.pixels, bbox: [roof.minX, roof.minY, roof.maxX, roof.maxY] });

  // Wood/timber-frame class pixels are individual beam lines, naturally
  // fragmented by the plaster between them -- dilate to bridge them into one
  // connected "wall zone" before picking a component, instead of picking a
  // single raw (and likely tiny) beam fragment. Restrict to a local window
  // below the chosen roof first: tree trunks are ALSO 'wood'-classified, and
  // an unrestricted dilation bridges the wall to nearby trees into one
  // meaningless blob.
  const marginX = 6, marginBelow = 22;
  const winMinX = Math.max(0, roof.minX - marginX), winMaxX = Math.min(gridW - 1, roof.maxX + marginX);
  const winMinY = roof.minY, winMaxY = Math.min(gridH - 1, roof.maxY + marginBelow);
  const woodLocal = new Uint8Array(gridW * gridH);
  for (let y = winMinY; y <= winMaxY; y++) for (let x = winMinX; x <= winMaxX; x++) {
    const i = y * gridW + x;
    if (woodMask[i]) woodLocal[i] = 255;
  }
  const woodDilated = dilate(woodLocal, gridW, gridH, 2);
  const woodDilatedComps = connectedComponents(imageDims, woodDilated, 20);
  let wood = null, bestPixels = 0;
  for (const w of woodDilatedComps) {
    const horizontalOverlap = Math.max(0, Math.min(roof.maxX, w.maxX) - Math.max(roof.minX, w.minX));
    if (horizontalOverlap <= 0) continue;
    if (w.maxY < roof.maxY) continue; // must extend at/below the roof's bottom edge
    if (w.pixels > bestPixels) { bestPixels = w.pixels; wood = w; }
  }
  console.log('Chosen wood-zone component (post-dilation):', wood ? { pixels: wood.pixels, bbox: [wood.minX, wood.minY, wood.maxX, wood.maxY] } : null);

  const roofContour = traceContourMoore(roofComps.labelGrid, gridW, gridH, roof.id);
  const roofSimplified = douglasPeucker(roofContour, 3.5);
  console.log(`Roof contour: ${roofContour.length} px -> ${roofSimplified.length} vertices after simplification`);

  let woodSimplified = [];
  if (wood) {
    const woodContour = traceContourMoore(woodDilatedComps.labelGrid, gridW, gridH, wood.id);
    woodSimplified = douglasPeucker(woodContour, 3.5);
    console.log(`Wood-zone contour: ${woodContour.length} px -> ${woodSimplified.length} vertices after simplification`);
  }

  const scaleX = imgW / gridW, scaleY = imgH / gridH;
  const toImageSpace = pts => pts.map(([x, y]) => [x * scaleX, y * scaleY]);
  const roofImg = toImageSpace(roofSimplified);
  const woodImg = toImageSpace(woodSimplified);

  const dataUrl = await page.evaluate(async ({ sceneDataUrl, roofImg, woodImg }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = sceneDataUrl; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const drawPoly = (pts, color, width) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    };
    drawPoly(roofImg, '#ff2222', 4);
    drawPoly(woodImg, '#ff9900', 4);
    return c.toDataURL('image/png');
  }, { sceneDataUrl: 'data:image/png;base64,' + fs.readFileSync(SCENE_IMG).toString('base64'), roofImg, woodImg });

  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'contour-simplify-overlay.png'), Buffer.from(b64, 'base64'));

  await browser.close();
  await new Promise(r => server.close(r));
})();
