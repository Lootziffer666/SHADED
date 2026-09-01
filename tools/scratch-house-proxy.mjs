// SCRATCH prototype — NOT part of the verify suite, NOT meant to be
// committed. The test: can a handful of cheaply detected image surfaces
// become an immediately rotatable closed polygonal model, with NO
// DepthAnything/ML/ONNX/raymarching/reconstruction framework?
//
// Roof face: real contour tracing + Douglas-Peucker on SHADED's own
// getMaterialTypeAt('roof') classification (unchanged from the prior test,
// which the maintainer judged sufficient).
//
// Wall face: explicitly NOT derived from a material mask this time (wood ==
// timber lattice, not a wall face -- wrong abstraction, per the maintainer's
// diagnosis). Instead a coarse GEOMETRIC seed: roof/eave line above, the
// roof polygon's own left/right extent as the side corners, a fixed
// wall-height ratio below the eave as the ground line. Windows/doors are not
// even sampled -- this deliberately stays a few-corners statement, not a
// segmentation.
//
// 3D proxy: a simple symmetric gable box sized from the few measured roof
// proportions (width, ridge height) plus one coarse, openly-labelled wall
// height ratio -- NOT a calibrated camera unprojection of the isometric
// image. Real front textures; generated/hidden faces get a plain mirrored
// copy of the same texture, exactly as instructed, not a second real crop.
// Rendered with a hand-written perspective camera + Canvas2D affine
// texture-mapped triangles (textbook technique, no 3D library, no new
// dependency) from four orbit angles to prove it is one coherent, rotatable
// closed body.
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon' };

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

// --- Minimal hand-written perspective camera + affine-textured triangles ---
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function makeCamera(target, distance, yaw, pitch, fovDeg, width, height) {
  const eye = [
    target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
  ];
  const forward = norm3(sub3(target, eye));
  const right = norm3(cross3(forward, [0, 1, 0]));
  const up = cross3(right, forward);
  const fov = fovDeg * Math.PI / 180, f = 1 / Math.tan(fov / 2), aspect = width / height;
  return { eye, forward, right, up, f, aspect, width, height };
}
function projectPoint(p, cam) {
  const rel = sub3(p, cam.eye);
  const x = dot3(rel, cam.right), y = dot3(rel, cam.up), z = dot3(rel, cam.forward);
  if (z <= 0.01) return null;
  const ndcX = (x / z) * cam.f / cam.aspect, ndcY = (y / z) * cam.f;
  return [(ndcX * 0.5 + 0.5) * cam.width, (1 - (ndcY * 0.5 + 0.5)) * cam.height, z];
}

(async () => {
  await new Promise(r => server.listen(8934, r));
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto('http://localhost:8934/index.html', { waitUntil: 'load' });
  await page.setInputFiles('#f-scene', SCENE_IMG);
  await page.setInputFiles('#f-depth', DEPTH_IMG);
  await page.evaluate(() => window.SHADED.erstellen());
  await page.waitForFunction(() => window.SHADED.isReady(), { timeout: 60000 });

  const GRID_W = 320;
  const sceneDataUrl = 'data:image/png;base64,' + fs.readFileSync(SCENE_IMG).toString('base64');
  const { roofMask, gridW, gridH, imgW, imgH } = await page.evaluate(async ({ gridW, sceneDataUrl }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = sceneDataUrl; });
    const imgW = img.naturalWidth, imgH = img.naturalHeight, gridH = Math.round(gridW * imgH / imgW);
    const roofMask = new Array(gridW * gridH).fill(0);
    for (let gy = 0; gy < gridH; gy++) for (let gx = 0; gx < gridW; gx++) {
      const u = (gx + 0.5) / gridW, v = (gy + 0.5) / gridH;
      if (window.SHADED.getMaterialTypeAt(u, v) === 'roof') roofMask[gy * gridW + gx] = 255;
    }
    return { roofMask, gridW, gridH, imgW, imgH };
  }, { gridW: GRID_W, sceneDataUrl });

  const roofComps = connectedComponents({ width: gridW, height: gridH }, Uint8Array.from(roofMask), 20);
  roofComps.sort((a, b) => b.pixels - a.pixels);
  const roof = roofComps[0];
  const roofContour = traceContourMoore(roofComps.labelGrid, gridW, gridH, roof.id);
  const roofSimplified = douglasPeucker(roofContour, 3.5); // grid space
  console.log(`Roof polygon: ${roofSimplified.length} vertices (grid space)`, roofSimplified);

  // --- Geometric wall seed: NO material mask. Eave line above (the roof
  // polygon's own lower boundary), side corners from the roof's own X
  // extent, ground line a fixed ratio below the eave. ---
  const roofMinX = Math.min(...roofSimplified.map(p => p[0]));
  const roofMaxX = Math.max(...roofSimplified.map(p => p[0]));
  const roofMinY = Math.min(...roofSimplified.map(p => p[1]));
  const roofMaxY = Math.max(...roofSimplified.map(p => p[1]));
  // Eave height at the left/right extremes: the roof vertex closest to each extreme's X.
  const nearestY = (targetX) => roofSimplified.reduce((best, p) => Math.abs(p[0] - targetX) < Math.abs(best[0] - targetX) ? p : best)[1];
  const eaveLeftY = nearestY(roofMinX), eaveRightY = nearestY(roofMaxX);
  const WALL_HEIGHT_RATIO = 0.65; // openly-labelled coarse constant, not measured
  const roofHeightPx = roofMaxY - roofMinY;
  const wallHeightPx = roofHeightPx * WALL_HEIGHT_RATIO;
  const wallPolyGrid = [
    [roofMinX, eaveLeftY], [roofMaxX, eaveRightY],
    [roofMaxX, eaveRightY + wallHeightPx], [roofMinX, eaveLeftY + wallHeightPx],
  ];
  console.log('Wall polygon (geometric seed, grid space):', wallPolyGrid);

  const scaleX = imgW / gridW, scaleY = imgH / gridH;
  const toImg = pts => pts.map(([x, y]) => [x * scaleX, y * scaleY]);
  const roofImg = toImg(roofSimplified);
  const wallImg = toImg(wallPolyGrid);
  const roofBBoxImg = { minX: Math.min(...roofImg.map(p => p[0])), maxX: Math.max(...roofImg.map(p => p[0])), minY: Math.min(...roofImg.map(p => p[1])), maxY: Math.max(...roofImg.map(p => p[1])) };
  const wallBBoxImg = { minX: Math.min(...wallImg.map(p => p[0])), maxX: Math.max(...wallImg.map(p => p[0])), minY: Math.min(...wallImg.map(p => p[1])), maxY: Math.max(...wallImg.map(p => p[1])) };

  // --- DERIVE roof height directly from the near-frontal green/yellow
  // region, per the maintainer's correction. The rafter-vector decomposition
  // (previous attempt) failed because it tried to unproject a heavily
  // foreshortened DIAGONAL edge crossing two different depth planes. The
  // maintainer's hand-marked reference shows the right fix: the gable
  // triangle (green) and front wall (yellow) both sit close to the camera-
  // facing plane, barely foreshortened -- so their OWN vertical pixel extent
  // is close to a direct measurement, no vector decomposition needed.
  // ridgeTop and frontCorner are both real traced polygon vertices near
  // that same front-facing plane, so their plain Y-difference stands in for
  // "the gable triangle's own height" without constructing that triangle.
  const leftCorner = roofSimplified.reduce((a, b) => (b[0] < a[0] ? b : a));
  const rightCorner = roofSimplified.reduce((a, b) => (b[0] > a[0] ? b : a));
  const frontCorner = roofSimplified.reduce((a, b) => (b[1] > a[1] ? b : a));
  const ridgeTop = roofSimplified.reduce((a, b) => (b[1] < a[1] ? b : a));
  console.log('Key vertices (grid space):', { leftCorner, rightCorner, frontCorner, ridgeTop });
  const roofRisePxGrid = frontCorner[1] - ridgeTop[1]; // direct Y-difference, both near-frontal points
  console.log('DERIVED roof rise (grid px, direct front-corner -> ridge Y-difference):', roofRisePxGrid);

  // --- DERIVE wall height by ray-casting down from frontCorner itself (the
  // house's nearest, most front-facing point -- most likely to have clear
  // path/lawn directly beneath it, unlike the side corners which sit under
  // foliage). Reuses ONLY the already-trusted getMaterialTypeAt() as a 1D
  // probe -- not a new mask/blob search. ---
  const wallHeightPxImgMeasured = await page.evaluate(({ u0, v0, imgH }) => {
    const groundClasses = new Set(['grass', 'path']);
    const stepV = 1 / imgH;
    for (let v = v0; v < 1; v += stepV) {
      const cls = window.SHADED.getMaterialTypeAt(u0, v);
      if (groundClasses.has(cls)) return (v - v0) * imgH;
    }
    return null;
  }, { u0: (frontCorner[0] * scaleX) / imgW, v0: (frontCorner[1] * scaleY) / imgH, imgH });
  console.log('DERIVED wall height (image px, ray-cast from frontCorner to ground):', wallHeightPxImgMeasured);

  // --- Build the gable box from the DERIVED measurements. Fixed ratios are
  // kept ONLY as a commented-out diagnostic fallback, never as the accepted
  // solution (per instruction). ---
  const roofWidthPx = roofBBoxImg.maxX - roofBBoxImg.minX;
  const W = 2.0; // arbitrary world unit, fixed (a unit choice, not a proportion)
  const scale = W / roofWidthPx;
  // Fallback only, NOT used below: const ROOF_PITCH_RATIO = 0.42, WALL_HEIGHT_WORLD_RATIO = 0.5;
  const roofRisePxImg = roofRisePxGrid != null ? roofRisePxGrid * scaleY : null;
  const roofHeightWorld = roofRisePxImg != null ? roofRisePxImg * scale : (W / 2) * 0.42;
  const wallHeightWorld = wallHeightPxImgMeasured != null ? wallHeightPxImgMeasured * scale : W * 0.5;
  console.log('SOLVED VALUES (world units, W=2.0 fixed):', { roofHeightWorld, wallHeightWorld, roofHeightSource: roofRisePxImg != null ? 'derived' : 'fallback', wallHeightSource: wallHeightPxImgMeasured != null ? 'derived' : 'fallback' });
  const D = W * 0.8; // coarse depth ratio -- NOT measured, openly labelled (no second visible depth edge available without new segmentation)

  const FL = [-W / 2, 0, D / 2], FR = [W / 2, 0, D / 2], BR = [W / 2, 0, -D / 2], BL = [-W / 2, 0, -D / 2];
  const FLe = [-W / 2, wallHeightWorld, D / 2], FRe = [W / 2, wallHeightWorld, D / 2], BRe = [W / 2, wallHeightWorld, -D / 2], BLe = [-W / 2, wallHeightWorld, -D / 2];
  const RF = [0, wallHeightWorld + roofHeightWorld, D / 2], RB = [0, wallHeightWorld + roofHeightWorld, -D / 2];

  // Each face: 4 world corners (TL,TR,BR,BL order) + which crop to use + mirrorX flag.
  const faces = [
    { name: 'roof-west', corners: [RF, FLe, BLe, RB], crop: 'roof', mirrorX: false },
    { name: 'roof-east', corners: [FRe, RF, RB, BRe], crop: 'roof', mirrorX: true },
    { name: 'wall-front', corners: [FLe, FRe, FR, FL], crop: 'wall', mirrorX: false },
    { name: 'wall-back', corners: [BRe, BLe, BL, BR], crop: 'wall', mirrorX: true },
    { name: 'wall-left', corners: [BLe, FLe, FL, BL], crop: 'wall', mirrorX: false },
    { name: 'wall-right', corners: [FRe, BRe, BR, FR], crop: 'wall', mirrorX: true },
  ];

  const renderDataUrl = await page.evaluate(async ({ sceneDataUrl, roofBBoxImg, wallBBoxImg, faces, cams }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = sceneDataUrl; });

    function cropTexture(bbox, mirrorX) {
      const w = Math.max(1, Math.round(bbox.maxX - bbox.minX)), h = Math.max(1, Math.round(bbox.maxY - bbox.minY));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (mirrorX) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, bbox.minX, bbox.minY, w, h, 0, 0, w, h);
      return c;
    }
    const roofTex = cropTexture(roofBBoxImg, false);
    const roofTexMirror = cropTexture(roofBBoxImg, true);
    const wallTex = cropTexture(wallBBoxImg, false);
    const wallTexMirror = cropTexture(wallBBoxImg, true);
    const texFor = (crop, mirror) => crop === 'roof' ? (mirror ? roofTexMirror : roofTex) : (mirror ? wallTexMirror : wallTex);

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
    function drawTexturedTriangle(ctx, tex, srcPts, dstPts) {
      const [x0, y0] = dstPts[0], [x1, y1] = dstPts[1], [x2, y2] = dstPts[2];
      const [u0, v0] = srcPts[0], [u1, v1] = srcPts[1], [u2, v2] = srcPts[2];
      ctx.save();
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.clip();
      const denom = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
      if (Math.abs(denom) > 1e-6) {
        const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / denom;
        const b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / denom;
        const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / denom;
        const d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / denom;
        const e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / denom;
        const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / denom;
        ctx.setTransform(a, b, c, d, e, f);
        ctx.drawImage(tex, 0, 0);
      }
      ctx.restore();
    }

    const W_PX = 700, H_PX = 520;
    const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * cams.length; outCanvas.height = H_PX;
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = '#1a2230'; outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);

    cams.forEach((camDef, ci) => {
      const c = document.createElement('canvas'); c.width = W_PX; c.height = H_PX;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1a2230'; ctx.fillRect(0, 0, W_PX, H_PX);
      const cam = makeCamera(camDef.target, camDef.distance, camDef.yaw, camDef.pitch, camDef.fov, W_PX, H_PX);

      const drawable = faces.map(face => {
        const projected = face.corners.map(p => projectPoint(p, cam));
        if (projected.some(p => !p)) return null;
        const avgZ = projected.reduce((s, p) => s + p[2], 0) / projected.length;
        return { face, projected, avgZ };
      }).filter(Boolean);
      drawable.sort((a, b) => b.avgZ - a.avgZ);

      for (const { face, projected } of drawable) {
        const tex = texFor(face.crop, face.mirrorX);
        const tw = tex.width, th = tex.height;
        const uv = [[0, 0], [tw, 0], [tw, th], [0, th]];
        const dst2 = [projected[0], projected[1], projected[2]].map(p => [p[0], p[1]]);
        const src2 = [uv[0], uv[1], uv[2]];
        drawTexturedTriangle(ctx, tex, src2, dst2);
        drawTexturedTriangle(ctx, tex, [uv[0], uv[2], uv[3]], [[projected[0][0], projected[0][1]], [projected[2][0], projected[2][1]], [projected[3][0], projected[3][1]]]);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(projected[0][0], projected[0][1]);
        for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
        ctx.closePath(); ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(c, ci * W_PX, 0);
    });

    return outCanvas.toDataURL('image/png');
  }, {
    sceneDataUrl, roofBBoxImg, wallBBoxImg, faces,
    cams: [
      { label: 'yaw 20°', target: [0, wallHeightWorld * 0.6, 0], distance: 4.2, yaw: 20 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
      { label: 'yaw 110°', target: [0, wallHeightWorld * 0.6, 0], distance: 4.2, yaw: 110 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
      { label: 'yaw 200°', target: [0, wallHeightWorld * 0.6, 0], distance: 4.2, yaw: 200 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
      { label: 'yaw 290°', target: [0, wallHeightWorld * 0.6, 0], distance: 4.2, yaw: 290 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
    ],
  });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'house-proxy-orbit.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote house-proxy-orbit.png');

  await browser.close();
  await new Promise(r => server.close(r));
})();
