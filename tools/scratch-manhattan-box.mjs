// SCRATCH prototype -- NOT part of the verify suite, NOT meant to be
// committed. Implements the maintainer's Manhattan-world / single-view-
// metrology reframing: NOT "find a face, derive its edges" but "find a
// corner and two real edge directions (u, v), assume a third (w = up), and
// construct every other corner algebraically as P + a*u + b*v + c*w." Faces
// are spanned between the resulting corners afterward -- output of the
// solve, not input to it. Still uses ONLY real, already-trusted vertices
// (SHADED's own getMaterialTypeAt() -> contour trace -> Douglas-Peucker),
// no material mask for walls, no ML, no raymarching.
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png' };
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
  await new Promise(r => server.listen(8936, r));
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:8936/index.html', { waitUntil: 'load' });
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
  await browser.close();
  await new Promise(r => server.close(r));

  const roofComps = connectedComponents({ width: gridW, height: gridH }, Uint8Array.from(roofMask), 20);
  roofComps.sort((a, b) => b.pixels - a.pixels);
  const roof = roofComps[0];
  const roofContour = traceContourMoore(roofComps.labelGrid, gridW, gridH, roof.id);
  const roofPoly = douglasPeucker(roofContour, 3.5);

  // --- The only inputs: three REAL corner points from the traced polygon. ---
  const leftCorner = roofPoly.reduce((a, b) => (b[0] < a[0] ? b : a));
  const rightCorner = roofPoly.reduce((a, b) => (b[0] > a[0] ? b : a));
  const frontCorner = roofPoly.reduce((a, b) => (b[1] > a[1] ? b : a));
  console.log('Real corners (grid space):', { frontCorner, leftCorner, rightCorner });

  // u, v: the two real, measured horizontal edge directions from frontCorner.
  const u2D = [leftCorner[0] - frontCorner[0], leftCorner[1] - frontCorner[1]];
  const v2D = [rightCorner[0] - frontCorner[0], rightCorner[1] - frontCorner[1]];
  console.log('u (front->left, real):', u2D, ' v (front->right, real):', v2D);

  // Algebraic prediction of the unobserved back-top corner: P + u + v.
  const predictedBack2D = [frontCorner[0] + u2D[0] + v2D[0], frontCorner[1] + u2D[1] + v2D[1]];
  console.log('PREDICTED back corner (frontCorner + u + v):', predictedBack2D);
  // Cross-check against real traced vertices -- does anything land near it?
  let nearest = null, nearestDist = Infinity;
  for (const p of roofPoly) {
    const d = Math.hypot(p[0] - predictedBack2D[0], p[1] - predictedBack2D[1]);
    if (d < nearestDist) { nearestDist = d; nearest = p; }
  }
  console.log('Nearest REAL traced vertex to that prediction:', nearest, ' distance:', nearestDist.toFixed(1), 'px (grid space)');

  // --- Build the 3D Manhattan box. u and v become the world X/Z edges at
  // eave height; w = straight up (safe convention), height fixed and openly
  // labelled -- deriving THAT robustly is still open, out of scope here per
  // "es geht aktuell ausschliesslich um die Machbarkeit". ---
  const roofWidthPx = Math.max(...roofPoly.map(p => p[0])) - Math.min(...roofPoly.map(p => p[0]));
  const scale = 1.6 / roofWidthPx; // arbitrary world-unit scale, fixed
  const WALL_HEIGHT = 0.85; // fixed, openly-labelled -- not derived this round
  const ROOF_HEIGHT = 0.55; // fixed, openly-labelled

  const toXZ = (p2d) => [(p2d[0] - frontCorner[0]) * scale, (p2d[1] - frontCorner[1]) * scale];
  const [ux, uz] = toXZ(leftCorner), [vx, vz] = toXZ(rightCorner);
  const eaveFront = [0, WALL_HEIGHT, 0];
  const eaveLeft = [ux, WALL_HEIGHT, uz];
  const eaveRight = [vx, WALL_HEIGHT, vz];
  const eaveBack = [ux + vx, WALL_HEIGHT, uz + vz]; // = P + u + v, algebraic, unobserved
  const groundFront = [0, 0, 0], groundLeft = [ux, 0, uz], groundRight = [vx, 0, vz], groundBack = [ux + vx, 0, uz + vz];
  const ridgeMid = [(ux + vx) / 2, WALL_HEIGHT + ROOF_HEIGHT, (uz + vz) / 2]; // simple centred ridge point

  const faces = [
    { name: 'wall front-left', color: [212, 175, 55], corners: [groundFront, groundLeft, eaveLeft, eaveFront] },
    { name: 'wall front-right', color: [58, 92, 168], corners: [groundFront, eaveFront, eaveRight, groundRight] },
    { name: 'wall back-left', color: [150, 120, 40], corners: [groundLeft, groundBack, eaveBack, eaveLeft] },
    { name: 'wall back-right', color: [40, 65, 120], corners: [groundRight, eaveRight, eaveBack, groundBack] },
    { name: 'roof front-left', color: [196, 60, 48], corners: [eaveFront, eaveLeft, ridgeMid] },
    { name: 'roof front-right', color: [196, 60, 48], corners: [eaveFront, ridgeMid, eaveRight] },
    { name: 'roof back-left', color: [150, 45, 36], corners: [eaveLeft, eaveBack, ridgeMid] },
    { name: 'roof back-right', color: [150, 45, 36], corners: [eaveBack, eaveRight, ridgeMid] },
  ];

  const browser2 = await chromium.launch(launchOpts);
  const page2 = await browser2.newPage({ viewport: { width: 1400, height: 900 } });
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
      { label: 'yaw 20°', target: [(ux + vx) / 4, 0.5, (uz + vz) / 4], distance: 3.6, yaw: 20 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 45 },
      { label: 'yaw 110°', target: [(ux + vx) / 4, 0.5, (uz + vz) / 4], distance: 3.6, yaw: 110 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 45 },
      { label: 'yaw 200°', target: [(ux + vx) / 4, 0.5, (uz + vz) / 4], distance: 3.6, yaw: 200 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 45 },
      { label: 'yaw 290°', target: [(ux + vx) / 4, 0.5, (uz + vz) / 4], distance: 3.6, yaw: 290 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 45 },
    ],
  });
  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'manhattan-box.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote manhattan-box.png');
  await browser2.close();
})();
