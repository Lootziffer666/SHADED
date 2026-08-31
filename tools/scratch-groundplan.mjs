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
  await new Promise(r => server.listen(8937, r));
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:8937/index.html', { waitUntil: 'load' });
  await page.setInputFiles('#f-scene', SCENE_IMG);
  await page.setInputFiles('#f-depth', DEPTH_IMG);
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 60000 });

  const GRID_W = 320;
  const sceneDataUrl = 'data:image/png;base64,' + fs.readFileSync(SCENE_IMG).toString('base64');
  const { roofMask, pathMask, gridW, gridH } = await page.evaluate(async ({ gridW, sceneDataUrl }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = sceneDataUrl; });
    const gridH = Math.round(gridW * img.naturalHeight / img.naturalWidth);
    const roofMask = new Array(gridW * gridH).fill(0);
    const pathMask = new Array(gridW * gridH).fill(0);
    for (let gy = 0; gy < gridH; gy++) for (let gx = 0; gx < gridW; gx++) {
      const u = (gx + 0.5) / gridW, v = (gy + 0.5) / gridH;
      const cls = window.SHADED.getMaterialTypeAt(u, v);
      if (cls === 'roof') roofMask[gy * gridW + gx] = 255;
      else if (cls === 'path') pathMask[gy * gridW + gx] = 255;
    }
    return { roofMask, pathMask, gridW, gridH };
  }, { gridW: GRID_W, sceneDataUrl });
  await browser.close();
  await new Promise(r => server.close(r));

  const roofComps = connectedComponents({ width: gridW, height: gridH }, Uint8Array.from(roofMask), 20);
  roofComps.sort((a, b) => b.pixels - a.pixels);
  console.log(`Found ${roofComps.length} roof components. Pixel counts (top 8):`, roofComps.slice(0, 8).map(c => c.pixels));

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

  // Real village roof blobs are far larger than DP-simplification noise
  // fragments -- keep components with at least 15% of the largest roof's
  // pixel count, cap at 4 houses (matches what's visibly in this scene).
  const MIN_PIXELS = roofComps[0].pixels * 0.15;
  const candidates = roofComps.filter(c => c.pixels >= MIN_PIXELS).slice(0, 4);
  const houses = candidates.map((c, i) => {
    const h = extractCorners(c);
    console.log(`HOUSE ${i + 1} (pixels=${c.pixels}) real corners:`, { frontCorner: h.frontCorner, leftCorner: h.leftCorner, rightCorner: h.rightCorner });
    console.log(`HOUSE ${i + 1} predicted back corner:`, h.predictedBack2D, ' nearest real vertex:', h.nearest, ' dist:', h.nearestDist.toFixed(1), 'px', ` (${(h.nearestDist / h.roofWidthPx * 100).toFixed(0)}% of roof width)`);
    return h;
  });
  console.log(`Using ${houses.length} houses.`);

  // --- SHARED coordinate system: house 1's frontCorner and scale define the
  // world origin/unit for ALL houses, so their relative position and size
  // are directly comparable -- not each independently re-centred. ---
  const scale = 1.6 / houses[0].roofWidthPx;
  const sharedOrigin = houses[0].frontCorner;
  const toXZ = (p2d) => [(p2d[0] - sharedOrigin[0]) * scale, (p2d[1] - sharedOrigin[1]) * scale];
  const WALL_HEIGHT = 0.55; // fixed, openly-labelled -- NO roof this round, per instruction: ground plan first

  // Ground-plan-only box: 4 walls + a flat top cap. Deliberately NO roof
  // faces -- "bevor wir den Grundriss nicht kennen, macht ein Dach keinen
  // Sinn." This validates position/size/footprint only.
  // Single neutral base color per house (shading/lighting does the rest in
  // the render pass, matching the maintainer's reference: plain gray boxes,
  // no per-face rainbow) so a bad result can't be blamed on the palette.
  function buildBox(house, baseColor) {
    const [ux, uz] = toXZ(house.leftCorner), [vx, vz] = toXZ(house.rightCorner), [fx, fz] = toXZ(house.frontCorner);
    const P = [fx, fz];
    const E = (dx, dz) => [P[0] + dx, WALL_HEIGHT, P[1] + dz];
    const G = (dx, dz) => [P[0] + dx, 0, P[1] + dz];
    const uRel = [ux - fx, uz - fz], vRel = [vx - fx, vz - fz];
    const eF = E(0, 0), eL = E(uRel[0], uRel[1]), eR = E(vRel[0], vRel[1]), eB = E(uRel[0] + vRel[0], uRel[1] + vRel[1]);
    const gF = G(0, 0), gL = G(uRel[0], uRel[1]), gR = G(vRel[0], vRel[1]), gB = G(uRel[0] + vRel[0], uRel[1] + vRel[1]);
    const faces = [
      { name: 'wall front-left', baseColor, corners: [gF, gL, eL, eF] },
      { name: 'wall front-right', baseColor, corners: [gF, eF, eR, gR] },
      { name: 'wall back-left', baseColor, corners: [gL, gB, eB, eL] },
      { name: 'wall back-right', baseColor, corners: [gR, eR, eB, gB] },
      { name: 'flat top', baseColor, corners: [eF, eL, eB, eR] },
    ];
    return { faces, footprint: [gF, gL, gB, gR] };
  }
  // Subtle neutral tint per house (still visibly "gray boxes", not a
  // rainbow) purely so the 4 footprints stay distinguishable.
  const houseBaseColors = [[196, 194, 190], [190, 196, 192], [192, 190, 196], [196, 192, 188]];
  const houseFootprints = [];
  const houseFaces = houses.flatMap((h, i) => {
    const { faces, footprint } = buildBox(h, houseBaseColors[i % houseBaseColors.length]);
    houseFootprints.push(footprint);
    return faces;
  });

  // --- Real path network, same trusted contour->simplify pipeline as the
  // roofs, so house footprints can be checked against real path positions
  // ("Bevor wir den Grundriss nicht kennen, macht ein Dach keinen Sinn" --
  // the path IS part of that ground plan, not decoration). Flat, y~=0
  // polygons in the SAME shared coordinate system as the houses.
  const pathComps = connectedComponents({ width: gridW, height: gridH }, Uint8Array.from(pathMask), 20);
  pathComps.sort((a, b) => b.pixels - a.pixels);
  console.log(`Found ${pathComps.length} path components. Pixel counts (top 6):`, pathComps.slice(0, 6).map(c => c.pixels));
  const PATH_MIN_PIXELS = Math.max(30, (pathComps[0]?.pixels || 0) * 0.04);
  const pathCandidates = pathComps.filter(c => c.pixels >= PATH_MIN_PIXELS).slice(0, 6);
  const PATH_Y = 0.01; // just above y=0 house ground, avoids exact-plane ties
  const PATH_COLOR = [206, 198, 182]; // neutral, muted -- matches the plain-gray reference look
  const pathPolys2D = [];
  const pathFaces = pathCandidates.map((c, i) => {
    const contour = traceContourMoore(pathComps.labelGrid, gridW, gridH, c.id);
    const poly = douglasPeucker(contour, 4.5);
    console.log(`PATH ${i + 1} (pixels=${c.pixels}) vertices after simplify: ${poly.length}`);
    if (poly.length < 3) return null;
    pathPolys2D.push(poly);
    const corners = poly.map(p => { const [x, z] = toXZ(p); return [x, PATH_Y, z]; });
    return { name: `path ${i + 1}`, baseColor: PATH_COLOR, corners };
  }).filter(Boolean);
  console.log(`Using ${pathFaces.length} path polygons.`);

  // --- Direct honesty check: draw the extracted roof/path polygons straight
  // onto the real source photo, in image pixel space -- no camera, no
  // projection, nothing that could itself be wrong. This is the real test
  // of "do we know the ground plan," independent of the 3D proxy render.
  {
    const overlayBrowser = await chromium.launch(launchOpts);
    const overlayPage = await overlayBrowser.newPage({ viewport: { width: 1400, height: 900 } });
    await overlayPage.setContent('<!doctype html><html><body></body></html>');
    const overlayDataUrl = await overlayPage.evaluate(async ({ sceneDataUrl, gridW, gridH, housePolys, pathPolys, houseColors, pathColor }) => {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = sceneDataUrl; });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const sx = img.naturalWidth / gridW, sy = img.naturalHeight / gridH;
      const toImg = (p) => [p[0] * sx, p[1] * sy];
      const strokePoly = (poly, color, lineWidth) => {
        if (poly.length < 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
        ctx.beginPath();
        const [x0, y0] = toImg(poly[0]); ctx.moveTo(x0, y0);
        for (let i = 1; i < poly.length; i++) { const [x, y] = toImg(poly[i]); ctx.lineTo(x, y); }
        ctx.closePath(); ctx.stroke();
      };
      pathPolys.forEach(poly => strokePoly(poly, pathColor, 3));
      housePolys.forEach((h, i) => {
        strokePoly(h.poly, houseColors[i % houseColors.length], 2.5);
        const dot = (p, fill) => { const [x, y] = toImg(p); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); };
        dot(h.frontCorner, '#ffffff'); dot(h.leftCorner, '#ffff00'); dot(h.rightCorner, '#00ffff'); dot(h.predictedBack2D, '#ff00ff');
      });
      return canvas.toDataURL('image/png');
    }, {
      sceneDataUrl, gridW, gridH,
      housePolys: houses.map(h => ({ poly: h.poly, frontCorner: h.frontCorner, leftCorner: h.leftCorner, rightCorner: h.rightCorner, predictedBack2D: h.predictedBack2D })),
      pathPolys: pathPolys2D,
      houseColors: ['#ff4444', '#44ff44', '#4488ff', '#ffaa22'],
      pathColor: '#ffffff',
    });
    const overlayB64 = overlayDataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(OUT, 'groundplan-overlay.png'), Buffer.from(overlayB64, 'base64'));
    console.log('Wrote groundplan-overlay.png');
    await overlayBrowser.close();
  }

  const faces = [...pathFaces, ...houseFaces];

  // Maintainer's reference: plain neutral-gray boxes, soft ground contact
  // shadow, plain light studio background, no rainbow, no heavy outline.
  // This isolates "is the geometry itself plausible" from "is the debug
  // rendering ugly/confusing" -- if it still looks wrong here, that's the
  // geometry, not the paint job.
  const browser2 = await chromium.launch(launchOpts);
  const page2 = await browser2.newPage({ viewport: { width: 1400, height: 900 } });
  await page2.setContent('<!doctype html><html><body></body></html>');
  const renderDataUrl = await page2.evaluate(async ({ faces, footprints, cams }) => {
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
    function faceNormal(corners) {
      const [a, b, c] = corners;
      const u = sub3(b, a), v = sub3(c, a);
      return norm3(cross3(u, v));
    }
    const LIGHT_DIR = norm3([0.4, 1.0, 0.55]);
    const AMBIENT = 0.42, DIFFUSE = 0.58;
    function shade(baseColor, normal) {
      const intensity = AMBIENT + DIFFUSE * Math.max(0, dot3(normal, LIGHT_DIR));
      return baseColor.map(c => Math.min(255, Math.round(c * intensity)));
    }
    const W_PX = 700, H_PX = 560;
    const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * cams.length; outCanvas.height = H_PX;
    const outCtx = outCanvas.getContext('2d');
    cams.forEach((camDef, ci) => {
      const c = document.createElement('canvas'); c.width = W_PX; c.height = H_PX;
      const ctx = c.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, H_PX);
      bg.addColorStop(0, '#f2f2ef'); bg.addColorStop(1, '#dcdcd6');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W_PX, H_PX);
      const cam = makeCamera(camDef.target, camDef.distance, camDef.yaw, camDef.pitch, camDef.fov, W_PX, H_PX);

      // Soft screen-space contact shadow per house footprint, drawn first.
      footprints.forEach(fp => {
        const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length;
        const cz = fp.reduce((s, p) => s + p[2], 0) / fp.length;
        const center = projectPoint([cx, 0, cz], cam);
        if (!center) return;
        const rPx = Math.max(...fp.map(p => { const pr = projectPoint(p, cam); return pr ? Math.hypot(pr[0] - center[0], pr[1] - center[1]) : 0; }));
        ctx.save();
        ctx.filter = 'blur(7px)';
        const grad = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], rPx * 1.15);
        grad.addColorStop(0, 'rgba(20,18,15,0.32)');
        grad.addColorStop(1, 'rgba(20,18,15,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(center[0], center[1], rPx * 1.15, rPx * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      const drawable = faces.map(face => {
        const projected = face.corners.map(p => projectPoint(p, cam));
        if (projected.some(p => !p)) return null;
        const avgZ = projected.reduce((s, p) => s + p[2], 0) / projected.length;
        let normal = faceNormal(face.corners);
        // Corner winding order isn't consistent across faces (front/back/top
        // built by hand above) -- flip so the normal used for shading always
        // points toward the camera, i.e. the side actually being looked at.
        const faceCenter = face.corners.reduce((s, p) => [s[0] + p[0] / face.corners.length, s[1] + p[1] / face.corners.length, s[2] + p[2] / face.corners.length], [0, 0, 0]);
        const viewVec = norm3(sub3(cam.eye, faceCenter));
        if (dot3(normal, viewVec) < 0) normal = normal.map(v => -v);
        return { face, projected, avgZ, normal };
      }).filter(Boolean);
      drawable.sort((a, b) => b.avgZ - a.avgZ);
      for (const { face, projected, normal } of drawable) {
        const [r, g, b] = shade(face.baseColor, normal);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath(); ctx.moveTo(projected[0][0], projected[0][1]);
        for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.fillStyle = '#333'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(c, ci * W_PX, 0);
    });
    return outCanvas.toDataURL('image/png');
  }, {
    faces,
    footprints: houseFootprints,
    cams: (() => {
      const allPts = faces.flatMap(f => f.corners);
      const cx = allPts.reduce((s, p) => s + p[0], 0) / allPts.length;
      const cz = allPts.reduce((s, p) => s + p[2], 0) / allPts.length;
      const target = [cx, 0.3, cz], distance = 7.5, pitch = 26 * Math.PI / 180, fov = 52;
      const orbit = [20, 110, 200, 290].map(yaw => ({ label: `yaw ${yaw}°`, target, distance, yaw: yaw * Math.PI / 180, pitch, fov }));
      // Extra near-top-down view -- footprint/path layout is what this round
      // is actually validating, so judge it from above too, not only orbits.
      const top = { label: 'top-down', target: [cx, 0, cz], distance: 8.5, yaw: 35 * Math.PI / 180, pitch: 68 * Math.PI / 180, fov: 55 };
      return [...orbit, top];
    })(),
  });
  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'groundplan-clean.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote groundplan-clean.png');
  await browser2.close();
})();
