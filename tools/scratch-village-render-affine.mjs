// Render village-reconstructed-affine.json from novel viewpoints -- the
// actual "rotatable 3D geometry" deliverable, and the direct visual check
// for whether the arrangement now reads as plausible (the original ask:
// "the first attempt to turn those measurements into rotatable 3D geometry
// produces cubes and an incorrect spatial arrangement").
//
// World axis index == family index throughout (see reconstruct-affine.mjs):
// T[name] is already the literal (0,0,0)-corner world position (no R/f to
// project through, unlike v2/v3's render.mjs, so no extra origin-recovery
// step is needed here). Reused as-is from render.mjs: the perspective
// look-at camera + flat-shaded quad rasterizer for the novel-view panels
// (that machinery renders arbitrary 3D points regardless of how they were
// reconstructed). One panel is new: an ORTHOGRAPHIC reprojection using the
// same dirF the solver itself fit, directly comparable to the source photo,
// in place of v2/v3's "original camera" perspective panel (there is no
// perspective camera here to sanity-check against).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { W: imgW, H: imgH, dirF, T, scale, localCoords } = data;

const cubesWorld = {};
for (const [name, Th] of Object.entries(T)) {
  const Lh = scale[name];
  const corners = [];
  for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) for (let c = 0; c <= 1; c++) {
    corners.push([Th[0] + a * Lh[0], Th[1] + b * Lh[1], Th[2] + c * Lh[2]]);
  }
  cubesWorld[name] = { origin: Th, corners };
}
console.log('World-space house origins (world axis index = family index):');
for (const [name, c] of Object.entries(cubesWorld)) console.log(' ', name, c.origin.map((v) => v.toFixed(2)), 'scale=', scale[name].map((v) => v.toFixed(2)));

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

  const renderDataUrl = await page.evaluate(async ({ allFaces, cubesWorld, dirF, imgW, imgH }) => {
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
      return { eye, forward, right, up, f: 1 / Math.tan(fov / 2), aspect: width / height, width, height, ortho: false };
    }
    function projectPoint(p, cam) {
      const rel = sub3(p, cam.eye), x = dot3(rel, cam.right), y = dot3(rel, cam.up), z = dot3(rel, cam.forward);
      if (cam.ortho) return [cam.width / 2 + x * cam.scale, cam.height / 2 - y * cam.scale, z];
      if (z <= 0.01) return null;
      const ndcX = (x / z) * cam.f / cam.aspect, ndcY = (y / z) * cam.f;
      return [(ndcX * 0.5 + 0.5) * cam.width, (1 - (ndcY * 0.5 + 0.5)) * cam.height, z];
    }
    function faceNormal(corners) { const [a, b, c] = corners; return norm3(cross3(sub3(b, a), sub3(c, a))); }
    const LIGHT_DIR = norm3([0.4, 1.0, 0.55]);
    function shade(color, normal, viewVec) {
      let n = normal;
      if (dot3(n, viewVec) < 0) n = n.map((v) => -v);
      const intensity = 0.45 + 0.55 * Math.max(0, dot3(n, LIGHT_DIR));
      return color.map((cc) => Math.min(255, Math.round(cc * intensity)));
    }

    const W_PX = 700, H_PX = 560;
    const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * 3; outCanvas.height = H_PX * 2;
    const outCtx = outCanvas.getContext('2d');

    // Orthographic panel: reproject with the SAME dirF the solver fit, i.e.
    // screen = sum_f (T[f]+lc*L[f]) * dirF[f] -- literally the equation the
    // linear solve satisfied, drawn instead of computed, as a direct visual
    // cross-check against the source photo's own house layout.
    function orthoProject2D(p3) {
      let x = 0, y = 0;
      for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; }
      return [x, y];
    }

    const centers = Object.values(cubesWorld).map((c) => c.origin);
    const cx = centers.reduce((s, p) => s + p[0], 0) / centers.length + 0.5 * 200;
    const cy = centers.reduce((s, p) => s + p[1], 0) / centers.length + 0.5 * 100;
    const cz = centers.reduce((s, p) => s + p[2], 0) / centers.length + 0.5 * 200;
    const target = [cx, cy, cz];
    const dist = 1200;
    const cams = [
      { label: 'orthographic reprojection (matches source photo)', kind: 'ortho' },
      { label: 'rotated +60deg yaw', eye: [target[0] + Math.sin(1.05) * dist, target[1] - 300, target[2] - Math.cos(1.05) * dist + 400], target, fov: 45 },
      { label: 'rotated -90deg (side)', eye: [target[0] - dist, target[1] - 200, target[2]], target, fov: 45 },
      { label: 'top-down (floor plan)', eye: [target[0], target[1] + dist + 400, target[2] + 0.01], target, fov: 55 },
      { label: 'from behind', eye: [target[0], target[1] - 200, target[2] + dist], target, fov: 45 },
      { label: 'low oblique', eye: [target[0] + dist * 0.7, target[1] - 400, target[2] + dist * 0.7], target, fov: 45 },
    ];

    cams.forEach((camDef, ci) => {
      const cnv = document.createElement('canvas'); cnv.width = W_PX; cnv.height = H_PX;
      const ctx = cnv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, H_PX); bg.addColorStop(0, '#f2f2ef'); bg.addColorStop(1, '#dcdcd6');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W_PX, H_PX);

      if (camDef.kind === 'ortho') {
        // Fit all house corners into the panel.
        const pts2d = [];
        for (const c of Object.values(cubesWorld)) for (const p of c.corners) pts2d.push(orthoProject2D(p));
        const xs = pts2d.map((p) => p[0]), ys = pts2d.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const scalePx = Math.min((W_PX - 60) / (maxX - minX || 1), (H_PX - 60) / (maxY - minY || 1));
        const originPx = [30 - minX * scalePx, 30 - minY * scalePx];
        const drawable = allFaces.map((face) => {
          const projected = face.corners.map((p) => { const [x, y] = orthoProject2D(p); return [x * scalePx + originPx[0], y * scalePx + originPx[1]]; });
          const centroid = face.corners.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
          const normal = faceNormal(face.corners);
          return { face, projected, normal, centroid };
        });
        // painter's order: back-to-front along the family index whose ortho
        // direction most points "toward camera" isn't well-defined for a
        // parallel projection -- draw roofs (top faces) last per house via
        // a simple face-normal-y-based heuristic (good enough for a sanity
        // panel, not a claim of correctness).
        drawable.sort((a, b) => dot3(a.normal, [0, 0, 1]) - dot3(b.normal, [0, 0, 1]));
        for (const { face, projected, normal } of drawable) {
          const [r, g, b] = shade(face.baseColor, normal, [0, 0, -1]);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.beginPath(); ctx.moveTo(projected[0][0], projected[0][1]);
          for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke();
        }
      } else {
        const cam = makeCameraLookAt(camDef.eye, camDef.target, camDef.fov, W_PX, H_PX);
        ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
        for (let g = -2000; g <= 2000; g += 200) {
          const a1 = projectPoint([g, target[1] - dist * 0.02, target[2] - 2000], cam), a2 = projectPoint([g, target[1] - dist * 0.02, target[2] + 2000], cam);
          const b1 = projectPoint([target[0] - 2000, target[1] - dist * 0.02, g], cam), b2 = projectPoint([target[0] + 2000, target[1] - dist * 0.02, g], cam);
          if (a1 && a2) { ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke(); }
          if (b1 && b2) { ctx.beginPath(); ctx.moveTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); }
        }
        const drawable = allFaces.map((face) => {
          const projected = face.corners.map((p) => projectPoint(p, cam));
          if (projected.some((p) => !p)) return null;
          const avgZ = projected.reduce((s, p) => s + p[2], 0) / projected.length;
          const centroid = face.corners.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
          const viewVec = norm3(sub3(cam.eye, centroid));
          const normal = faceNormal(face.corners);
          return { face, projected, avgZ, normal, viewVec };
        }).filter(Boolean);
        drawable.sort((a, b) => b.avgZ - a.avgZ);
        for (const { face, projected, normal, viewVec } of drawable) {
          const [r, g, b] = shade(face.baseColor, normal, viewVec);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.beginPath(); ctx.moveTo(projected[0][0], projected[0][1]);
          for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      ctx.fillStyle = '#222'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(cnv, (ci % 3) * W_PX, Math.floor(ci / 3) * H_PX);
    });
    return outCanvas.toDataURL('image/png');
  }, { allFaces, cubesWorld, dirF, imgW, imgH });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'village-turntable-affine.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote village-turntable-affine.png');
  await browser.close();
})();
