// Render village-reconstructed-affine.json from the fitted affine camera and
// from novel perspective viewpoints. The serialized verticalFam is the sole
// gravity axis; no renderer path may silently assume world Y.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { W: imgW, H: imgH, dirF, verticalFam, T, scale } = data;
if (![0, 1, 2].includes(verticalFam)) throw new Error(`Invalid verticalFam: ${verticalFam}`);
const footprintAxes = [0, 1, 2].filter((axis) => axis !== verticalFam);

const cubesWorld = {};
for (const [name, Th] of Object.entries(T)) {
  const Lh = scale[name];
  const corners = [];
  for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) for (let c = 0; c <= 1; c++) {
    corners.push([Th[0] + a * Lh[0], Th[1] + b * Lh[1], Th[2] + c * Lh[2]]);
  }
  cubesWorld[name] = { origin: Th, corners };
}

function cubeFaces(corners) {
  const idx = (a, b, c) => corners[a * 4 + b * 2 + c];
  return [
    { c: [idx(0, 0, 0), idx(0, 0, 1), idx(0, 1, 1), idx(0, 1, 0)] },
    { c: [idx(1, 0, 0), idx(1, 1, 0), idx(1, 1, 1), idx(1, 0, 1)] },
    { c: [idx(0, 0, 0), idx(1, 0, 0), idx(1, 0, 1), idx(0, 0, 1)] },
    { c: [idx(0, 1, 0), idx(0, 1, 1), idx(1, 1, 1), idx(1, 1, 0)] },
    { c: [idx(0, 0, 0), idx(0, 1, 0), idx(1, 1, 0), idx(1, 0, 0)] },
    { c: [idx(0, 0, 1), idx(1, 0, 1), idx(1, 1, 1), idx(0, 1, 1)] },
  ];
}
const baseColors = { house1: [200, 90, 90], house2: [90, 180, 100], house3: [90, 130, 210], house4: [220, 150, 60], house5: [190, 90, 190], house6: [90, 190, 190] };
const allFaces = [];
for (const [name, c] of Object.entries(cubesWorld)) for (const fc of cubeFaces(c.corners)) allFaces.push({ cube: name, baseColor: baseColors[name] || [150, 150, 150], corners: fc.c });

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');

  const renderDataUrl = await page.evaluate(({ allFaces, cubesWorld, dirF, verticalFam, footprintAxes, imgW, imgH }) => {
    const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm3 = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
    const axisUnit = (axis) => [0, 1, 2].map((i) => i === axis ? 1 : 0);

    function makeCameraLookAt(eye, target, fovDeg, width, height) {
      const forward = norm3(sub3(target, eye));
      let upHint = axisUnit(verticalFam);
      if (Math.abs(dot3(forward, upHint)) > 0.99) upHint = axisUnit(footprintAxes[1]);
      const right = norm3(cross3(forward, upHint));
      const up = cross3(right, forward);
      const fy = (height * 0.5) / Math.tan(fovDeg * Math.PI / 360);
      return { eye, forward, right, up, fx: fy, fy, cx: width / 2, cy: height / 2 };
    }
    function projectPoint(p, cam) {
      const rel = sub3(p, cam.eye), x = dot3(rel, cam.right), y = dot3(rel, cam.up), z = dot3(rel, cam.forward);
      if (z <= 0.01) return null;
      return [cam.cx + cam.fx * x / z, cam.cy - cam.fy * y / z, z];
    }
    function faceNormal(corners) { return norm3(cross3(sub3(corners[1], corners[0]), sub3(corners[2], corners[0]))); }
    const LIGHT_DIR = norm3([0.4, 1.0, 0.55]);
    function shade(color, normal, viewVec) {
      let n = normal;
      if (dot3(n, viewVec) < 0) n = n.map((v) => -v);
      const intensity = 0.45 + 0.55 * Math.max(0, dot3(n, LIGHT_DIR));
      return color.map((cc) => Math.min(255, Math.round(cc * intensity)));
    }
    function orthoProject2D(p3) {
      let x = 0, y = 0;
      for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; }
      return [x, y];
    }

    const W_PX = 700, H_PX = 560;
    const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * 3; outCanvas.height = H_PX * 2;
    const outCtx = outCanvas.getContext('2d');

    const origins = Object.values(cubesWorld).map((c) => c.origin);
    const target = [0, 0, 0];
    for (const p of origins) for (let i = 0; i < 3; i++) target[i] += p[i] / origins.length;
    const extents = [0, 1, 2].map((axis) => {
      const vals = Object.values(cubesWorld).flatMap((c) => c.corners.map((p) => p[axis]));
      return Math.max(...vals) - Math.min(...vals);
    });
    const sceneSize = Math.max(...extents, 1);
    const dist = sceneSize * 3.2;
    const pos = (h0, up, h1) => {
      const v = target.slice();
      v[footprintAxes[0]] += h0;
      v[verticalFam] += up;
      v[footprintAxes[1]] += h1;
      return v;
    };
    const cams = [
      { label: 'orthographic reprojection (source camera)', kind: 'ortho' },
      { label: 'rotated +60deg yaw', eye: pos(Math.sin(1.05) * dist, sceneSize * 0.8, -Math.cos(1.05) * dist), target, fov: 45 },
      { label: 'rotated -90deg (side)', eye: pos(-dist, sceneSize * 0.5, 0), target, fov: 45 },
      { label: 'top-down (floor plan)', eye: pos(0.01, dist, 0.01), target, fov: 55 },
      { label: 'from behind', eye: pos(0, sceneSize * 0.5, dist), target, fov: 45 },
      { label: 'low oblique', eye: pos(dist * 0.7, sceneSize * 0.65, dist * 0.7), target, fov: 45 },
    ];

    const groundVals = origins.map((p) => p[verticalFam]).sort((a, b) => a - b);
    const groundCoord = groundVals[Math.floor(groundVals.length / 2)] || 0;

    cams.forEach((camDef, ci) => {
      const cnv = document.createElement('canvas'); cnv.width = W_PX; cnv.height = H_PX;
      const ctx = cnv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, H_PX); bg.addColorStop(0, '#f2f2ef'); bg.addColorStop(1, '#dcdcd6');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W_PX, H_PX);

      if (camDef.kind === 'ortho') {
        const pts2d = Object.values(cubesWorld).flatMap((c) => c.corners.map(orthoProject2D));
        const xs = pts2d.map((p) => p[0]), ys = pts2d.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const scalePx = Math.min((W_PX - 60) / (maxX - minX || 1), (H_PX - 60) / (maxY - minY || 1));
        const originPx = [30 - minX * scalePx, 30 - minY * scalePx];
        for (const face of allFaces) {
          const projected = face.corners.map((p) => { const [x, y] = orthoProject2D(p); return [x * scalePx + originPx[0], y * scalePx + originPx[1]]; });
          const normal = faceNormal(face.corners);
          const [r, g, b] = shade(face.baseColor, normal, [0, 0, -1]);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.beginPath(); ctx.moveTo(...projected[0]); for (let i = 1; i < projected.length; i++) ctx.lineTo(...projected[i]); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.stroke();
        }
      } else {
        const cam = makeCameraLookAt(camDef.eye, camDef.target, camDef.fov, W_PX, H_PX);
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        const span = sceneSize * 2;
        for (let step = -10; step <= 10; step++) {
          const g = step * span / 10;
          const a1 = target.slice(), a2 = target.slice(), b1 = target.slice(), b2 = target.slice();
          a1[footprintAxes[0]] += g; a1[footprintAxes[1]] -= span; a1[verticalFam] = groundCoord;
          a2[footprintAxes[0]] += g; a2[footprintAxes[1]] += span; a2[verticalFam] = groundCoord;
          b1[footprintAxes[0]] -= span; b1[footprintAxes[1]] += g; b1[verticalFam] = groundCoord;
          b2[footprintAxes[0]] += span; b2[footprintAxes[1]] += g; b2[verticalFam] = groundCoord;
          const pa1 = projectPoint(a1, cam), pa2 = projectPoint(a2, cam), pb1 = projectPoint(b1, cam), pb2 = projectPoint(b2, cam);
          if (pa1 && pa2) { ctx.beginPath(); ctx.moveTo(pa1[0], pa1[1]); ctx.lineTo(pa2[0], pa2[1]); ctx.stroke(); }
          if (pb1 && pb2) { ctx.beginPath(); ctx.moveTo(pb1[0], pb1[1]); ctx.lineTo(pb2[0], pb2[1]); ctx.stroke(); }
        }
        const drawable = allFaces.map((face) => {
          const projected = face.corners.map((p) => projectPoint(p, cam));
          if (projected.some((p) => !p)) return null;
          const avgZ = projected.reduce((s, p) => s + p[2], 0) / projected.length;
          const centroid = face.corners.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
          return { face, projected, avgZ, normal: faceNormal(face.corners), viewVec: norm3(sub3(cam.eye, centroid)) };
        }).filter(Boolean).sort((a, b) => b.avgZ - a.avgZ);
        for (const { face, projected, normal, viewVec } of drawable) {
          const [r, g, b] = shade(face.baseColor, normal, viewVec);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.beginPath(); ctx.moveTo(projected[0][0], projected[0][1]); for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.stroke();
        }
      }
      ctx.fillStyle = '#222'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(cnv, (ci % 3) * W_PX, Math.floor(ci / 3) * H_PX);
    });
    return outCanvas.toDataURL('image/png');
  }, { allFaces, cubesWorld, dirF, verticalFam, footprintAxes, imgW, imgH });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'village-turntable-affine.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote village-turntable-affine.png');
  await browser.close();
})();
