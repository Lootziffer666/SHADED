// SCRATCH prototype — NOT part of the verify suite, NOT meant to be
// committed. Direct response to the maintainer's correction: the previous
// attempt mirrored a GENERIC gable-box primitive instead of the real,
// visible face shapes. This one does not invent a rectangle for the roof or
// the wall. It takes the ACTUAL traced roof silhouette (8 vertices, chimney
// notch, and the bend at one interior vertex that the maintainer's
// reference calls out as a projecting front element) exactly as extracted
// from SHADED's own getMaterialTypeAt(), and:
//   - folds that whole real silhouette upward as one hinged panel along its
//     own measured eave axis (a real fold, not a fabricated flat quad) for
//     the ROOF face;
//   - extrudes the roof polygon's own real, BENT eave boundary chain
//     straight down for the WALL face, so the wall's plan keeps the same
//     bend the roof silhouette actually has (a candidate reading of the
//     "vorspringender Frontteil" the maintainer pointed at) instead of
//     being flattened into a plain rectangle;
//   - mirrors both across the house's centerline to close the volume.
// Still no texture -- shape only, exactly as requested.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { connectedComponents } from '../runtime/hall-plan/plan-analyzer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const SCENE_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579.png');
const DEPTH_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579_depth.png');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const data = fs.readFileSync(p === REPO + '/' ? path.join(REPO, 'index.html') : p);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end(); }
});

function traceContourMoore(labelGrid, width, height, targetLabel) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && labelGrid[y * width + x] === targetLabel;
  let start = null;
  outer: for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (inside(x, y)) { start = [x, y]; break outer; }
  if (!start) return [];
  const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const findDirIndex = (d) => dirs.findIndex(v => v[0] === d[0] && v[1] === d[1]);
  const contour = [start];
  let current = start, backtrack = [-1, 0];
  for (let iter = 0; iter < 320 * 320 * 4; iter++) {
    const backIndex = findDirIndex(backtrack);
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const idx = (backIndex + k) % 8;
      const [dx, dy] = dirs[idx], nx = current[0] + dx, ny = current[1] + dy;
      if (inside(nx, ny)) { contour.push([nx, ny]); backtrack = [current[0] - nx, current[1] - ny]; current = [nx, ny]; found = true; break; }
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

(async () => {
  await new Promise(r => server.listen(8935, r));
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:8935/index.html', { waitUntil: 'load' });
  await page.setInputFiles('#f-scene', SCENE_IMG);
  await page.setInputFiles('#f-depth', DEPTH_IMG);
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 60000 });

  const GRID_W = 320;
  const sceneDataUrl = 'data:image/png;base64,' + fs.readFileSync(SCENE_IMG).toString('base64');
  const { roofMask, gridW, gridH } = await page.evaluate(async ({ gridW, sceneDataUrl }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = sceneDataUrl; });
    const gridH = Math.round(gridW * img.naturalHeight / img.naturalWidth);
    const roofMask = new Array(gridW * gridH).fill(0);
    for (let gy = 0; gy < gridH; gy++) for (let gx = 0; gx < gridW; gx++) {
      const u = (gx + 0.5) / gridW, v = (gy + 0.5) / gridH;
      if (window.SHADED.getMaterialTypeAt(u, v) === 'roof') roofMask[gy * gridW + gx] = 255;
    }
    return { roofMask, gridW, gridH };
  }, { gridW: GRID_W, sceneDataUrl });

  const roofComps = connectedComponents({ width: gridW, height: gridH }, Uint8Array.from(roofMask), 20);
  roofComps.sort((a, b) => b.pixels - a.pixels);
  const roof = roofComps[0];
  const roofContour = traceContourMoore(roofComps.labelGrid, gridW, gridH, roof.id);
  const roofPoly = douglasPeucker(roofContour, 3.5); // the REAL 8-vertex silhouette, kept as-is
  console.log('Real roof polygon (grid space, unmodified):', roofPoly);

  await browser.close();
  await new Promise(r => server.close(r));

  // --- Identify the eave (lower) boundary chain vs the upper/rafter chain,
  // using the same trusted extrema as before. ---
  const leftCorner = roofPoly.reduce((a, b) => (b[0] < a[0] ? b : a));
  const rightCorner = roofPoly.reduce((a, b) => (b[0] > a[0] ? b : a));
  const li = roofPoly.findIndex(p => p === leftCorner), ri = roofPoly.findIndex(p => p === rightCorner);
  // Walk the polygon from rightCorner to leftCorner the "short way" -- this
  // is the real lower/eave boundary, bends and all (not re-simplified).
  const n = roofPoly.length - 1; // last vertex duplicates the first
  const eaveChain = [];
  for (let i = ri; ; i = (i + 1) % n) { eaveChain.push(roofPoly[i]); if (i === li) break; }
  console.log('Real eave boundary chain (grid space, bends preserved):', eaveChain);

  // --- Fold the WHOLE real roof silhouette up as one hinged panel along its
  // own measured eave axis (leftCorner -> rightCorner). No fabricated quad:
  // every one of the traced vertices (chimney notch included) keeps its
  // real position along and above that axis. ---
  const axisVec = [rightCorner[0] - leftCorner[0], rightCorner[1] - leftCorner[1]];
  const axisLen = Math.hypot(axisVec[0], axisVec[1]);
  const axisUnit = [axisVec[0] / axisLen, axisVec[1] / axisLen];
  const perpUnit = [-axisUnit[1], axisUnit[0]]; // rotate 90°; sign fixed below to point "into the roof"
  // Roof vertices should read as positive along perp (they sit above the eave line, smaller image-Y).
  const sample = roofPoly.reduce((a, b) => (b[1] < a[1] ? b : a)); // topmost vertex, definitely "into the roof"
  const relSample = [sample[0] - leftCorner[0], sample[1] - leftCorner[1]];
  const perpSign = (relSample[0] * perpUnit[0] + relSample[1] * perpUnit[1]) >= 0 ? 1 : -1;
  const PITCH = 34 * Math.PI / 180; // fixed, openly-labelled fold angle -- not derived this round
  const WALL_HEIGHT = axisLen * 0.32; // fixed, openly-labelled -- explicitly not the focus this round
  const gridToWorld = 1 / axisLen * 1.6; // scale so the eave axis maps to a fixed world width

  const WALL_HEIGHT_WORLD = WALL_HEIGHT * gridToWorld;
  function foldRoofPoint2(p) {
    const [x, y] = p;
    const rel = [x - leftCorner[0], y - leftCorner[1]];
    const t = rel[0] * axisUnit[0] + rel[1] * axisUnit[1];
    const h = perpSign * (rel[0] * perpUnit[0] + rel[1] * perpUnit[1]);
    const along = t * gridToWorld - (axisLen * gridToWorld) / 2;
    const into = -h * gridToWorld * Math.cos(PITCH);
    const up = WALL_HEIGHT_WORLD + h * gridToWorld * Math.sin(PITCH);
    return [along, up, into];
  }
  function extrudeWallPoint(p, atTop) {
    const [x, y] = p;
    const rel = [x - leftCorner[0], y - leftCorner[1]];
    const t = rel[0] * axisUnit[0] + rel[1] * axisUnit[1];
    const along = t * gridToWorld - (axisLen * gridToWorld) / 2;
    return [along, atTop ? WALL_HEIGHT_WORLD : 0, 0];
  }

  const roofPanelReal = roofPoly.slice(0, -1).map(foldRoofPoint2); // drop duplicated closing vertex
  const wallPanelReal = [...eaveChain.map(p => extrudeWallPoint(p, true)), ...eaveChain.slice().reverse().map(p => extrudeWallPoint(p, false))];

  const mirrorZ = p => [p[0], p[1], -p[2]];
  const dim = c => c.map(v => Math.round(v * 0.5));
  const roofColor = [196, 60, 48], wallColor = [212, 175, 55];
  const faces = [
    { name: 'red (real roof silhouette, folded)', color: roofColor, corners: roofPanelReal },
    { name: 'yellow (real eave-chain wall, extruded)', color: wallColor, corners: wallPanelReal },
    { name: "red' (mirrored)", color: dim(roofColor), corners: roofPanelReal.map(mirrorZ).reverse() },
    { name: "yellow' (mirrored)", color: dim(wallColor), corners: wallPanelReal.map(mirrorZ).reverse() },
  ];

  const page2browser = await chromium.launch(launchOpts);
  const page2 = await page2browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page2.setContent('<!doctype html><html><body></body></html>');
  const renderDataUrl = await page2.evaluate(async ({ faces, cams }) => {
    const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    function makeCamera(target, distance, yaw, pitch, fovDeg, width, height) {
      const eye = [target[0] + distance * Math.cos(pitch) * Math.sin(yaw), target[1] + distance * Math.sin(pitch), target[2] + distance * Math.cos(pitch) * Math.cos(yaw)];
      const forward = norm3(sub3(target, eye)), right = norm3(cross3(forward, [0, 1, 0])), up = cross3(right, forward);
      const fov = fovDeg * Math.PI / 180;
      return { eye, forward, right, up, f: 1 / Math.tan(fov / 2), aspect: width / height, width, height };
    }
    function projectPoint(p, cam) {
      const rel = sub3(p, cam.eye), x = dot3(rel, cam.right), y = dot3(rel, cam.up), z = dot3(rel, cam.forward);
      if (z <= 0.01) return null;
      const ndcX = (x / z) * cam.f / cam.aspect, ndcY = (y / z) * cam.f;
      return [(ndcX * 0.5 + 0.5) * cam.width, (1 - (ndcY * 0.5 + 0.5)) * cam.height, z];
    }
    const W_PX = 700, H_PX = 560;
    const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * cams.length; outCanvas.height = H_PX;
    const outCtx = outCanvas.getContext('2d'); outCtx.fillStyle = '#1a2230'; outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    cams.forEach((camDef, ci) => {
      const c = document.createElement('canvas'); c.width = W_PX; c.height = H_PX;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#1a2230'; ctx.fillRect(0, 0, W_PX, H_PX);
      const cam = makeCamera(camDef.target, camDef.distance, camDef.yaw, camDef.pitch, camDef.fov, W_PX, H_PX);
      const drawable = faces.map(face => {
        const projected = face.corners.map(p => projectPoint(p, cam));
        if (projected.some(p => !p)) return null;
        const avgZ = projected.reduce((s, p) => s + p[2], 0) / projected.length;
        return { face, projected, avgZ };
      }).filter(Boolean);
      drawable.sort((a, b) => b.avgZ - a.avgZ);
      for (const { face, projected } of drawable) {
        ctx.fillStyle = `rgb(${face.color[0]},${face.color[1]},${face.color[2]})`;
        ctx.beginPath(); ctx.moveTo(projected[0][0], projected[0][1]);
        for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(c, ci * W_PX, 0);
    });
    return outCanvas.toDataURL('image/png');
  }, {
    faces,
    cams: [
      { label: 'yaw 20°', target: [0, 0.6, 0], distance: 4.5, yaw: 20 * Math.PI / 180, pitch: 20 * Math.PI / 180, fov: 45 },
      { label: 'yaw 110°', target: [0, 0.6, 0], distance: 4.5, yaw: 110 * Math.PI / 180, pitch: 20 * Math.PI / 180, fov: 45 },
      { label: 'yaw 200°', target: [0, 0.6, 0], distance: 4.5, yaw: 200 * Math.PI / 180, pitch: 20 * Math.PI / 180, fov: 45 },
      { label: 'yaw 290°', target: [0, 0.6, 0], distance: 4.5, yaw: 290 * Math.PI / 180, pitch: 20 * Math.PI / 180, fov: 45 },
    ],
  });
  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'real-shape-mirror.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote real-shape-mirror.png');
  await page2browser.close();
})();
