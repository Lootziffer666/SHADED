// Render the reconstructed village (from scratch-village-reconstruct-v2.mjs's
// village-reconstructed-v2.json) from the original recovered camera (sanity
// check against the real render) and from novel viewpoints -- the actual
// "turn the scene" deliverable for this attempt. All 6 houses reprojected
// to within 0.00-0.03px of their measured 2D vertices (5 fully measured,
// 1 partial with 2 corners reconstructed purely from the box's rigid
// structure, no 2D measurement at all for those) -- the only legitimate
// proof of correctness for a real render with no ground truth.
//
// T is anchored at whatever local corner localCoords[name][0] happens to
// be (NOT always (0,0,1) -- that was true for the earlier cube dataset's
// specific family pattern, not a general rule), so the (0,0,0) corner is
// recovered by subtracting exactly that offset before building the full
// 8-corner box. Lx/Ly/Lz are now PER-HOUSE (E1 fix in
// scratch-village-reconstruct-v2.mjs -- a shared scale forced every house
// to be exactly the same 3D size, which was the actual cause of the wild
// arrangement; each house keeps its own JSON `scale[name]` entry instead).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-v2.json'), 'utf8'));
const { R: axes, T, W: imgW, H: imgH, f, scale: perHouseScale, localCoords } = data;

function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function worldFromCam(vCam) { return [dot3(axes[0], vCam), dot3(axes[1], vCam), dot3(axes[2], vCam)]; }

const cubesWorld = {};
for (const [name, Tcam] of Object.entries(T)) {
  const { Lx, Ly, Lz } = perHouseScale[name];
  const scale = [Lx, Ly, Lz];
  const [a0, b0, c0] = localCoords[name][0]; // whatever corner T is anchored at for this house
  const origin000cam = [
    Tcam[0] - a0 * scale[0] * axes[0][0] - b0 * scale[1] * axes[1][0] - c0 * scale[2] * axes[2][0],
    Tcam[1] - a0 * scale[0] * axes[0][1] - b0 * scale[1] * axes[1][1] - c0 * scale[2] * axes[2][1],
    Tcam[2] - a0 * scale[0] * axes[0][2] - b0 * scale[1] * axes[1][2] - c0 * scale[2] * axes[2][2],
  ];
  const originWorld = worldFromCam(origin000cam);
  const corners = [];
  for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) for (let c = 0; c <= 1; c++) corners.push([originWorld[0] + a * scale[0], originWorld[1] + b * scale[1], originWorld[2] + c * scale[2]]);
  cubesWorld[name] = { origin: originWorld, corners };
}
console.log('World-space house origins (real units, per-house Lx/Ly/Lz):');
for (const [name, c] of Object.entries(cubesWorld)) console.log(' ', name, c.origin.map(v => v.toFixed(3)), 'scale=', perHouseScale[name]);

const origCam = { pos: [0, 0, 0], right: worldFromCam([1, 0, 0]), up: worldFromCam([0, 1, 0]), forward: worldFromCam([0, 0, 1]) };

function cubeFaces(corners) {
  const idx = (a, b, c) => corners[a * 4 + b * 2 + c];
  return [
    { name: 'a=0', c: [idx(0, 0, 0), idx(0, 0, 1), idx(0, 1, 1), idx(0, 1, 0)] },
    { name: 'a=1', c: [idx(1, 0, 0), idx(1, 1, 0), idx(1, 1, 1), idx(1, 0, 1)] },
    { name: 'b=0', c: [idx(0, 0, 0), idx(1, 0, 0), idx(1, 0, 1), idx(0, 0, 1)] },
    { name: 'b=1', c: [idx(0, 1, 0), idx(0, 1, 1), idx(1, 1, 1), idx(1, 1, 0)] },
    { name: 'c=0', c: [idx(0, 0, 0), idx(0, 1, 0), idx(1, 1, 0), idx(1, 0, 0)] },
    { name: 'c=1', c: [idx(0, 0, 1), idx(1, 0, 1), idx(1, 1, 1), idx(0, 1, 1)] },
  ];
}
const allFaces = [];
const baseColors = { house1: [200, 90, 90], house2: [90, 180, 100], house3: [90, 130, 210], house4: [220, 150, 60], house5: [190, 90, 190], house6: [90, 190, 190] };
for (const [name, c] of Object.entries(cubesWorld)) for (const fc of cubeFaces(c.corners)) allFaces.push({ cube: name, baseColor: baseColors[name] || [150, 150, 150], corners: fc.c });

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');

  const renderDataUrl = await page.evaluate(async ({ allFaces, cubesWorld, cams }) => {
    const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
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
    function faceNormal(corners) { const [a, b, c] = corners; return norm3(cross3(sub3(b, a), sub3(c, a))); }
    const LIGHT_DIR = norm3([0.4, 1.0, 0.55]);
    function shade(color, normal, viewVec) {
      let n = normal;
      if (dot3(n, viewVec) < 0) n = n.map(v => -v);
      const intensity = 0.45 + 0.55 * Math.max(0, dot3(n, LIGHT_DIR));
      return color.map(cc => Math.min(255, Math.round(cc * intensity)));
    }

    const W_PX = 700, H_PX = 560;
    const outCanvas = document.createElement('canvas'); outCanvas.width = W_PX * 3; outCanvas.height = H_PX * 2;
    const outCtx = outCanvas.getContext('2d');
    cams.forEach((camDef, ci) => {
      const cnv = document.createElement('canvas'); cnv.width = W_PX; cnv.height = H_PX;
      const ctx = cnv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, 0, H_PX); bg.addColorStop(0, '#f2f2ef'); bg.addColorStop(1, '#dcdcd6');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W_PX, H_PX);
      let cam;
      if (camDef.basis) {
        const fovRad = camDef.fov * Math.PI / 180;
        cam = { eye: camDef.eye, forward: camDef.basis.forward, right: camDef.basis.right, up: camDef.basis.up, f: 1 / Math.tan(fovRad / 2), aspect: W_PX / H_PX, width: W_PX, height: H_PX };
      } else {
        cam = makeCameraLookAt(camDef.eye, camDef.target, camDef.fov, W_PX, H_PX);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
      for (let g = -12; g <= 12; g++) {
        const a1 = projectPoint([g, 0, -12], cam), a2 = projectPoint([g, 0, 12], cam);
        const b1 = projectPoint([-12, 0, g], cam), b2 = projectPoint([12, 0, g], cam);
        if (a1 && a2) { ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke(); }
        if (b1 && b2) { ctx.beginPath(); ctx.moveTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); }
      }

      const drawable = allFaces.map(face => {
        const projected = face.corners.map(p => projectPoint(p, cam));
        if (projected.some(p => !p)) return null;
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
      ctx.fillStyle = '#222'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(cnv, (ci % 3) * W_PX, Math.floor(ci / 3) * H_PX);
    });
    return outCanvas.toDataURL('image/png');
  }, {
    allFaces, cubesWorld,
    cams: (() => {
      const centers = Object.values(cubesWorld).map(c => c.origin);
      const cx = centers.reduce((s, p) => s + p[0], 0) / centers.length + 0.5;
      const cy = centers.reduce((s, p) => s + p[1], 0) / centers.length + 0.5;
      const cz = centers.reduce((s, p) => s + p[2], 0) / centers.length + 0.5;
      const target = [cx, cy, cz];
      const trueFovY = 2 * Math.atan((imgH / 2) / f) * 180 / Math.PI;
      const dist = 16;
      return [
        { label: 'original camera (sanity check)', eye: origCam.pos, basis: { right: origCam.right, up: origCam.up, forward: origCam.forward }, fov: trueFovY },
        { label: 'rotated +60deg yaw', eye: [target[0] + Math.sin(1.05) * dist, target[1] - 2, target[2] - Math.cos(1.05) * dist + 4], target, fov: 45 },
        { label: 'rotated -90deg (side)', eye: [target[0] - dist, target[1] - 1, target[2]], target, fov: 45 },
        { label: 'top-down (floor plan)', eye: [target[0], target[1] + dist + 4, target[2] + 0.01], target, fov: 50 },
        { label: 'from behind', eye: [target[0], target[1] - 1, target[2] + dist], target, fov: 45 },
        { label: 'low oblique', eye: [target[0] + dist * 0.7, target[1] - 4, target[2] + dist * 0.7], target, fov: 45 },
      ];
    })(),
  });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'village-turntable.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote village-turntable.png');
  await browser.close();
})();
