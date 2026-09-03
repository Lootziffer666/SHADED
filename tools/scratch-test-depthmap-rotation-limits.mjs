// SCRATCH -- answers the concrete question "reicht diese Depthmap, um die
// Szene zu drehen?" with a real reprojection test instead of a claim.
// Back-projects the real transformers.js Depth Anything V2 output (already
// produced by scratch-test-transformersjs-depth.mjs) into a 3D point cloud
// via a simple pinhole camera assumption, then renders it from several
// synthetic viewpoints -- small angular offsets (should look mostly intact,
// classic "2.5D parallax" effect, matching SHADED's existing relative-depth
// convention) and large rotations (should show holes/stretching at depth
// discontinuities, because a single-view depth map has ZERO information
// about occluded/backside geometry -- the same OBSERVED-vs-GENERATED gap
// this whole session's affine-box work has been explicit about).
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const REPO_ROOT = path.join(__dirname, '..');

console.log('Running Depth Anything V2 Small on the village-cube fixture...');
const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const imgPath = path.join(REPO_ROOT, 'file_000000006d188210a9bb1129089a7b29.png');
const output = await depthEstimator(imgPath);
const { depth } = output;
console.log(`Depth map: ${depth.width}x${depth.height}`);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(imgPath).toString('base64');
await page.setContent('<canvas id="c"></canvas>');

const renderDataUrl = await page.evaluate(async ({ imgDataUrl, depthValues, depthW, depthH }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
  const srcCanvas = document.createElement('canvas'); srcCanvas.width = img.naturalWidth; srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d'); srcCtx.drawImage(img, 0, 0);
  const srcW = srcCanvas.width, srcH = srcCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

  // Back-project to a 3D point cloud via a simple pinhole model. Depth map
  // brightness convention (checked visually against the rendered PNG):
  // near = bright/high value, far = dark/low value -- so distance-from-camera
  // is inversely related to gray value.
  const FOV_DEG = 50, NEAR = 200, FAR = 900;
  const aspect = srcW / srcH;
  const fRad = FOV_DEG * Math.PI / 180;
  const STRIDE = 2; // subsample for point count / render speed
  const points = [];
  for (let y = 0; y < srcH; y += STRIDE) {
    for (let x = 0; x < srcW; x += STRIDE) {
      const dx = Math.floor(x * depthW / srcW), dy = Math.floor(y * depthH / srcH);
      const gray = depthValues[dy * depthW + dx];
      const z = NEAR + (255 - gray) / 255 * (FAR - NEAR); // distance from camera
      const ndcX = (x / srcW) * 2 - 1, ndcY = 1 - (y / srcH) * 2;
      const camX = ndcX * Math.tan(fRad / 2) * z * aspect;
      const camY = ndcY * Math.tan(fRad / 2) * z;
      const idx = (y * srcW + x) * 4;
      points.push({ x: camX, y: camY, z, r: srcData[idx], g: srcData[idx + 1], b: srcData[idx + 2] });
    }
  }

  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
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
    const rel = [p.x - cam.eye[0], p.y - cam.eye[1], p.z - cam.eye[2]];
    const px = dot3(rel, cam.right), py = dot3(rel, cam.up), pz = dot3(rel, cam.forward);
    if (pz <= 1) return null;
    const ndcX = (px / pz) * cam.f / cam.aspect, ndcY = (py / pz) * cam.f;
    return [(ndcX * 0.5 + 0.5) * cam.width, (1 - (ndcY * 0.5 + 0.5)) * cam.height, pz];
  }

  const centerZ = (NEAR + FAR) / 2;
  const target = [0, 0, centerZ];
  const originalEye = [0, 0, 0];

  const W_PX = 480, H_PX = 320;
  const panels = [
    { label: 'original view (0deg)', angleDeg: 0 },
    { label: '10deg rotation', angleDeg: 10 },
    { label: '25deg rotation', angleDeg: 25 },
    { label: '45deg rotation', angleDeg: 45 },
    { label: '90deg (side view)', angleDeg: 90 },
    { label: '180deg (behind)', angleDeg: 180 },
  ];
  const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * 3; outCanvas.height = H_PX * 2;
  const outCtx = outCanvas.getContext('2d');

  panels.forEach((panel, i) => {
    const angle = panel.angleDeg * Math.PI / 180;
    const radius = centerZ * 0.9;
    const eye = [Math.sin(angle) * radius, 0, centerZ - Math.cos(angle) * radius];
    const cam = makeCameraLookAt(eye, target, 55, W_PX, H_PX);
    const cnv = document.createElement('canvas'); cnv.width = W_PX; cnv.height = H_PX;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W_PX, H_PX);
    const projected = points.map((p) => { const s = projectPoint(p, cam); return s ? { s, p } : null; }).filter(Boolean);
    projected.sort((a, b) => b.s[2] - a.s[2]);
    const pointSizePx = 2.2;
    for (const { s, p } of projected) {
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},0.95)`;
      ctx.fillRect(s[0], s[1], pointSizePx, pointSizePx);
    }
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(panel.label, 8, 20);
    outCtx.drawImage(cnv, (i % 3) * W_PX, Math.floor(i / 3) * H_PX);
  });

  return outCanvas.toDataURL('image/png');
}, { imgDataUrl, depthValues: Array.from(depth.data), depthW: depth.width, depthH: depth.height });

const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync(path.join(OUT, 'depthmap-rotation-limits.png'), Buffer.from(b64, 'base64'));
console.log('Wrote depthmap-rotation-limits.png');
await browser.close();
