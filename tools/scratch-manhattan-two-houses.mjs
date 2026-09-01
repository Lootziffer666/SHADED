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
  console.log(`Found ${roofComps.length} roof components. Top 2 pixel counts:`, roofComps.slice(0, 2).map(c => c.pixels));

  function extractCorners(comp) {
    const contour = traceContourMoore(roofComps.labelGrid, gridW, gridH, comp.id);
    const poly = douglasPeucker(contour, 3.5);
    const leftCorner = poly.reduce((a, b) => (b[0] < a[0] ? b : a));
    const rightCorner = poly.reduce((a, b) => (b[0] > a[0] ? b : a));
    const frontCorner = poly.reduce((a, b) => (b[1] > a[1] ? b : a));
    const u2D = [leftCorner[0] - frontCorner[0], leftCorner[1] - frontCorner[1]];
    const v2D = [rightCorner[0] - frontCorner[0], rightCorner[1] - frontCorner[1]];
    const predictedBack2D = [frontCorner[0] + u2D[0] + v2D[0], frontCorner[1] + u2D[1] + v2D[1]];
    let nearest = null, nearestDist = Infinity;
    for (const p of poly) { const d = Math.hypot(p[0] - predictedBack2D[0], p[1] - predictedBack2D[1]); if (d < nearestDist) { nearestDist = d; nearest = p; } }
    const roofWidthPx = Math.max(...poly.map(p => p[0])) - Math.min(...poly.map(p => p[0]));
    return { poly, leftCorner, rightCorner, frontCorner, u2D, v2D, predictedBack2D, nearest, nearestDist, roofWidthPx };
  }

  const house1 = extractCorners(roofComps[0]);
  console.log('HOUSE 1 real corners:', { frontCorner: house1.frontCorner, leftCorner: house1.leftCorner, rightCorner: house1.rightCorner });
  console.log('HOUSE 1 predicted back corner:', house1.predictedBack2D, ' nearest real vertex:', house1.nearest, ' dist:', house1.nearestDist.toFixed(1), 'px');

  if (roofComps.length < 2) throw new Error('Only one roof component found -- no second house to test against.');
  const house2 = extractCorners(roofComps[1]);
  console.log('HOUSE 2 real corners:', { frontCorner: house2.frontCorner, leftCorner: house2.leftCorner, rightCorner: house2.rightCorner });
  console.log('HOUSE 2 predicted back corner:', house2.predictedBack2D, ' nearest real vertex:', house2.nearest, ' dist:', house2.nearestDist.toFixed(1), 'px');

  // --- SHARED coordinate system: house 1's frontCorner and scale define the
  // world origin/unit for BOTH houses, so their relative position and size
  // are directly comparable -- not each independently re-centred. ---
  const scale = 1.6 / house1.roofWidthPx;
  const sharedOrigin = house1.frontCorner;
  const toXZ = (p2d) => [(p2d[0] - sharedOrigin[0]) * scale, (p2d[1] - sharedOrigin[1]) * scale];
  const WALL_HEIGHT = 0.85, ROOF_HEIGHT = 0.55; // fixed, openly-labelled, shared by both -- not derived this round

  function buildBox(house, colorSet) {
    const [ux, uz] = toXZ(house.leftCorner), [vx, vz] = toXZ(house.rightCorner), [fx, fz] = toXZ(house.frontCorner);
    const P = [fx, fz];
    const E = (dx, dz) => [P[0] + dx, WALL_HEIGHT, P[1] + dz];
    const G = (dx, dz) => [P[0] + dx, 0, P[1] + dz];
    const uRel = [ux - fx, uz - fz], vRel = [vx - fx, vz - fz];
    const eF = E(0, 0), eL = E(uRel[0], uRel[1]), eR = E(vRel[0], vRel[1]), eB = E(uRel[0] + vRel[0], uRel[1] + vRel[1]);
    const gF = G(0, 0), gL = G(uRel[0], uRel[1]), gR = G(vRel[0], vRel[1]), gB = G(uRel[0] + vRel[0], uRel[1] + vRel[1]);
    const ridgeMid = [(eL[0] + eR[0]) / 2, WALL_HEIGHT + ROOF_HEIGHT, (eL[2] + eR[2]) / 2];
    return [
      { name: 'wall front-left', color: colorSet[0], corners: [gF, gL, eL, eF] },
      { name: 'wall front-right', color: colorSet[1], corners: [gF, eF, eR, gR] },
      { name: 'wall back-left', color: colorSet[2], corners: [gL, gB, eB, eL] },
      { name: 'wall back-right', color: colorSet[3], corners: [gR, eR, eB, gB] },
      { name: 'roof front-left', color: colorSet[4], corners: [eF, eL, ridgeMid] },
      { name: 'roof front-right', color: colorSet[4], corners: [eF, ridgeMid, eR] },
      { name: 'roof back-left', color: colorSet[5], corners: [eL, eB, ridgeMid] },
      { name: 'roof back-right', color: colorSet[5], corners: [eB, eR, ridgeMid] },
    ];
  }
  const faces = [
    ...buildBox(house1, [[212, 175, 55], [58, 92, 168], [150, 120, 40], [40, 65, 120], [196, 60, 48], [150, 45, 36]]),
    ...buildBox(house2, [[120, 200, 140], [90, 150, 220], [80, 140, 95], [60, 100, 155], [230, 150, 60], [180, 110, 40]]),
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
    cams: (() => {
      const allPts = faces.flatMap(f => f.corners);
      const cx = allPts.reduce((s, p) => s + p[0], 0) / allPts.length;
      const cz = allPts.reduce((s, p) => s + p[2], 0) / allPts.length;
      const target = [cx, 0.5, cz], distance = 6.5, pitch = 26 * Math.PI / 180, fov = 48;
      return [20, 110, 200, 290].map(yaw => ({ label: `yaw ${yaw}°`, target, distance, yaw: yaw * Math.PI / 180, pitch, fov }));
    })(),
  });
  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'manhattan-two-houses.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote manhattan-two-houses.png');
  await browser2.close();
})();
