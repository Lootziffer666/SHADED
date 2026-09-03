// SCRATCH -- "fake LiDAR" experiment: build a dense point cloud from the
// already-measured village-cube boxes (3 real faces per house, textured
// from the source photo) plus constructed backsides (3 hidden faces per
// house, parallel-copied per docs/synthetic-visual-reverse-engineering.md
// SS4.6 -- for a box, "mirroring" is the wrong operator, opposite faces are
// parallel-shifted copies), then render that cloud via classical point-
// sprite splatting from several synthetic camera positions swept around
// the scene -- a "fake LiDAR" pseudo-multiview capture, no GPU training,
// no 12-hour ML run. Tests the actual mechanic in minutes: does sweeping
// synthetic viewpoints around a single-image-derived point cloud produce a
// coherent capture, and does adding constructed backside points do
// anything useful or just add plausible-looking noise.
//
// Provenance is tagged per point (measured vs constructed) purely for
// inspection in this script's own debug panel -- not a production
// feature, not shown to any end user, just so the actual question
// ("what did we invent vs what came from the image") stays answerable
// while looking at the result, per this session's own point that losing
// that tag once points are baked into a trained representation is a
// one-way door. Nothing here is trained; it's classical rendering, so the
// tag costs nothing and can be dropped later without regret.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const REPO_ROOT = path.join(__dirname, '..');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { W: imgW, H: imgH, dirF, T, scale, localCoords } = recon;
const houseNames = Object.keys(T);

// World-axis index === family index (see reconstruct-affine.mjs). A box's
// local (a,b,c) in {0,1}^3: (0,0,0) is the fully-hidden corner, (1,1,1) is
// the interior-to-the-hexagon near corner (see localCoordsFor's own
// comment in v3/affine). Every face containing (0,0,0) -- i.e. a=0, b=0,
// c=0 -- is therefore a HIDDEN face; every face containing (1,1,1) instead
// -- a=1, b=1, c=1 -- is one of the 3 MEASURED, visible faces. That's a
// general rule from the topology already established, not a new
// assumption or a camera-direction heuristic.
const FACES = [
  { axis: 0, value: 1, provenance: 'measured' },
  { axis: 1, value: 1, provenance: 'measured' },
  { axis: 2, value: 1, provenance: 'measured' },
  { axis: 0, value: 0, provenance: 'constructed', opposite: 0 },
  { axis: 1, value: 0, provenance: 'constructed', opposite: 1 },
  { axis: 2, value: 0, provenance: 'constructed', opposite: 2 },
];
const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);

function worldPoint(Th, Lh, a, b, c) {
  return [Th[0] + a * Lh[0], Th[1] + b * Lh[1], Th[2] + c * Lh[2]];
}
function screenPoint(p3) {
  let x = 0, y = 0;
  for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; }
  return [x, y];
}

const GRID = 14; // points per face edge -> 196 samples/face, ~1176/house measured+constructed combined

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();

  // Load the source image into the page so we can sample real pixel color
  // for the 3 measured faces per house via canvas getImageData.
  const imgPath = path.join(REPO_ROOT, 'file_000000006d188210a9bb1129089a7b29.png');
  const imgBuf = fs.readFileSync(imgPath);
  const imgDataUrl = 'data:image/png;base64,' + imgBuf.toString('base64');
  await page.setContent('<canvas id="c"></canvas>');

  const points = await page.evaluate(async ({ imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID }) => {
    const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
    const srcCanvas = document.createElement('canvas'); srcCanvas.width = imgW; srcCanvas.height = imgH;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, imgW, imgH).data;
    function samplePixel(x, y) {
      const xi = Math.max(0, Math.min(imgW - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(imgH - 1, Math.round(y)));
      const idx = (yi * imgW + xi) * 4;
      return [srcData[idx], srcData[idx + 1], srcData[idx + 2]];
    }
    function screenPoint(p3) {
      let x = 0, y = 0;
      for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; }
      return [x, y];
    }
    function worldPoint(Th, Lh, a, b, c) { return [Th[0] + a * Lh[0], Th[1] + b * Lh[1], Th[2] + c * Lh[2]]; }

    const out = [];
    for (const name of houseNames) {
      const Th = T[name], Lh = scale[name];
      const local = { 0: 0, 1: 0, 2: 0 };
      for (const face of FACES) {
        local[face.axis] = face.value;
        const [u, v] = otherAxes(face.axis);
        const pts = [];
        for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
          local[u] = i / GRID; local[v] = j / GRID;
          const world = worldPoint(Th, Lh, local[0], local[1], local[2]);
          let color;
          if (face.provenance === 'measured') {
            const [sx, sy] = screenPoint(world);
            color = samplePixel(sx, sy);
          } else {
            // constructed: parallel-copy from the opposite (measured) face
            // at the same (u,v) -- docs/synthetic-visual-reverse-engineering.md
            // SS4.6: for a box, opposite faces are parallel-shifted copies,
            // not mirror images.
            const oppLocal = { ...local, [face.axis]: 1 };
            const oppWorld = worldPoint(Th, Lh, oppLocal[0], oppLocal[1], oppLocal[2]);
            const [sx, sy] = screenPoint(oppWorld);
            color = samplePixel(sx, sy);
          }
          pts.push({ p: world, c: color, prov: face.provenance, house: name });
        }
        out.push(...pts);
      }
    }
    return out;
  }, { imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID });

  console.log(`Built point cloud: ${points.length} points (${points.filter(p => p.prov === 'measured').length} measured, ${points.filter(p => p.prov === 'constructed').length} constructed)`);

  // --- Fake-LiDAR sweep: render the cloud via classical point-sprite
  // splatting from N synthetic camera positions orbiting the scene. No
  // training, no GPU compute -- painter's-algorithm depth sort + alpha
  // sprites, the same technique this session's earlier turntable renderer
  // already used for triangle faces, applied to points instead.
  const renderDataUrl = await page.evaluate(({ points, N }) => {
    const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    function makeCameraLookAt(eye, target, fovDeg, width, height) {
      const forward = norm3(sub3(target, eye));
      let upHint = [0, 1, 0];
      if (Math.abs(dot3(forward, upHint)) > 0.99) upHint = [0, 0, 1];
      const right = norm3(cross3(forward, upHint));
      const up = cross3(right, forward);
      const fov = fovDeg * Math.PI / 180;
      return { eye, forward, right, up, f: 1 / Math.tan(fov / 2), aspect: width / height, width, height };
    }
    function projectPoint(p, cam) {
      const rel = sub3(p, cam.eye), x = dot3(rel, cam.right), y = dot3(rel, cam.up), z = dot3(rel, cam.forward);
      if (z <= 0.01) return null;
      const ndcX = (x / z) * cam.f / cam.aspect, ndcY = (y / z) * cam.f;
      return [(ndcX * 0.5 + 0.5) * cam.width, (1 - (ndcY * 0.5 + 0.5)) * cam.height, z];
    }

    const centers = points.map((p) => p.p);
    const cx = centers.reduce((s, p) => s + p[0], 0) / centers.length;
    const cy = centers.reduce((s, p) => s + p[1], 0) / centers.length;
    const cz = centers.reduce((s, p) => s + p[2], 0) / centers.length;
    const target = [cx, cy, cz];
    const spread = Math.max(...centers.map((p) => Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz))) || 500;
    const dist = spread * 2.2;

    const W_PX = 500, H_PX = 400;
    const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * 3; outCanvas.height = H_PX * Math.ceil((N + 1) / 3);
    const outCtx = outCanvas.getContext('2d');

    function renderPanel(ctx, cam, colorMode, label) {
      ctx.fillStyle = colorMode === 'provenance' ? '#111' : '#ddd';
      ctx.fillRect(0, 0, W_PX, H_PX);
      const projected = points.map((p) => { const s = projectPoint(p.p, cam); return s ? { s, p } : null; }).filter(Boolean);
      projected.sort((a, b) => b.s[2] - a.s[2]); // far to near
      const pointSizePx = Math.max(1.5, (spread / dist) * W_PX * 0.02);
      for (const { s, p } of projected) {
        if (colorMode === 'provenance') {
          ctx.fillStyle = p.prov === 'measured' ? 'rgba(80,220,120,0.85)' : 'rgba(230,70,70,0.85)';
        } else {
          ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},0.9)`;
        }
        ctx.beginPath(); ctx.arc(s[0], s[1], pointSizePx, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = colorMode === 'provenance' ? '#eee' : '#111';
      ctx.font = '13px sans-serif'; ctx.fillText(label, 8, 18);
    }

    // N synthetic "fake LiDAR" sweep positions orbiting the scene at a
    // fixed radius/height variety, plus one dedicated provenance-debug
    // panel (this session's "the tags are for ME to inspect" point, kept
    // as a debug view here, not a rendering feature).
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const heightVariation = Math.sin(i * 1.7) * spread * 0.3;
      const eye = [target[0] + Math.sin(angle) * dist, target[1] - spread * 0.4 + heightVariation, target[2] + Math.cos(angle) * dist];
      const cam = makeCameraLookAt(eye, target, 50, W_PX, H_PX);
      const cnv = document.createElement('canvas'); cnv.width = W_PX; cnv.height = H_PX;
      renderPanel(cnv.getContext('2d'), cam, 'color', `sweep view ${i + 1}/${N}`);
      outCtx.drawImage(cnv, (i % 3) * W_PX, Math.floor(i / 3) * H_PX);
    }
    // Final panel: provenance debug view from one representative angle.
    const debugEye = [target[0] + Math.sin(0.6) * dist, target[1] - spread * 0.2, target[2] + Math.cos(0.6) * dist];
    const debugCam = makeCameraLookAt(debugEye, target, 50, W_PX, H_PX);
    const debugCnv = document.createElement('canvas'); debugCnv.width = W_PX; debugCnv.height = H_PX;
    renderPanel(debugCnv.getContext('2d'), debugCam, 'provenance', 'provenance debug: green=measured red=constructed');
    outCtx.drawImage(debugCnv, (N % 3) * W_PX, Math.floor(N / 3) * H_PX);

    return outCanvas.toDataURL('image/png');
  }, { points, N: 8 });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'village-fake-lidar-sweep.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote village-fake-lidar-sweep.png');
  await browser.close();
})();
