// Render the reconstructed village from the recovered camera and from novel
// viewpoints. This renderer is deliberately a verifier: it must preserve the
// exact camera/axis conventions serialized by scratch-village-reconstruct-v2.mjs
// instead of silently inventing its own.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-v2.json'), 'utf8'));
const {
  R: axes,
  T,
  W: imgW,
  H: imgH,
  f,
  pp,
  verticalFam = 1,
  scale: perHouseScale,
} = data;

function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function worldFromCam(vCam) { return [dot3(axes[0], vCam), dot3(axes[1], vCam), dot3(axes[2], vCam)]; }

const cubesWorld = {};
for (const [name, Tcam] of Object.entries(T)) {
  const { Lx, Ly, Lz } = perHouseScale[name];
  const scale = [Lx, Ly, Lz];
  // solveJointAnisotropic serializes T as the camera-space position of the
  // local (0,0,0) corner. Do NOT subtract localCoords[0] again here.
  const originWorld = worldFromCam(Tcam);
  const corners = [];
  for (let a = 0; a <= 1; a++) {
    for (let b = 0; b <= 1; b++) {
      for (let c = 0; c <= 1; c++) {
        corners.push([
          originWorld[0] + a * scale[0],
          originWorld[1] + b * scale[1],
          originWorld[2] + c * scale[2],
        ]);
      }
    }
  }
  cubesWorld[name] = { origin: originWorld, corners };
}
console.log('World-space house origins (real units, per-house Lx/Ly/Lz):');
for (const [name, c] of Object.entries(cubesWorld)) console.log(' ', name, c.origin.map(v => v.toFixed(3)), 'scale=', perHouseScale[name]);

// The reconstruction uses image coordinates with +Y downward:
//   py = pp.y + f * camY/camZ
// The canvas camera below uses +up then subtracts it from pixel Y, so the
// recovered camera's up basis must be the NEGATIVE camera-Y direction.
const origCam = {
  pos: [0, 0, 0],
  right: worldFromCam([1, 0, 0]),
  up: worldFromCam([0, -1, 0]),
  forward: worldFromCam([0, 0, 1]),
};

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

const footprintAxes = [0, 1, 2].filter((axis) => axis !== verticalFam);
const originVerticals = Object.values(cubesWorld).map((c) => c.origin[verticalFam]).sort((a, b) => a - b);
const groundCoord = originVerticals[Math.floor(originVerticals.length / 2)] || 0;
function axisMapped(h0, up, h1) {
  const v = [0, 0, 0];
  v[footprintAxes[0]] = h0;
  v[verticalFam] = up;
  v[footprintAxes[1]] = h1;
  return v;
}

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');

  const renderDataUrl = await page.evaluate(async ({ allFaces, cams, verticalFam, footprintAxes, groundCoord }) => {
    const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const axisUnit = (axis) => [0, 1, 2].map((i) => i === axis ? 1 : 0);

    function makeCameraLookAt(eye, target, fovDeg, width, height) {
      const forward = norm3(sub3(target, eye));
      let upHint = axisUnit(verticalFam);
      if (Math.abs(dot3(forward, upHint)) > 0.99) upHint = axisUnit(footprintAxes[1]);
      const right = norm3(cross3(forward, upHint));
      const up = cross3(right, forward);
      const fy = (height * 0.5) / Math.tan(fovDeg * Math.PI / 360);
      return { eye, forward, right, up, fx: fy, fy, cx: width / 2, cy: height / 2, width, height };
    }
    function projectPoint(p, cam) {
      const rel = sub3(p, cam.eye), x = dot3(rel, cam.right), y = dot3(rel, cam.up), z = dot3(rel, cam.forward);
      if (z <= 0.01) return null;
      return [cam.cx + cam.fx * x / z, cam.cy - cam.fy * y / z, z];
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
        const sx = W_PX / camDef.sourceWidth;
        const sy = H_PX / camDef.sourceHeight;
        cam = {
          eye: camDef.eye,
          forward: camDef.basis.forward,
          right: camDef.basis.right,
          up: camDef.basis.up,
          fx: camDef.focal * sx,
          fy: camDef.focal * sy,
          cx: camDef.principal[0] * sx,
          cy: camDef.principal[1] * sy,
          width: W_PX,
          height: H_PX,
        };
      } else {
        cam = makeCameraLookAt(camDef.eye, camDef.target, camDef.fov, W_PX, H_PX);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
      for (let g = -12; g <= 12; g++) {
        const pA1 = [0, 0, 0], pA2 = [0, 0, 0], pB1 = [0, 0, 0], pB2 = [0, 0, 0];
        pA1[footprintAxes[0]] = g; pA1[verticalFam] = groundCoord; pA1[footprintAxes[1]] = -12;
        pA2[footprintAxes[0]] = g; pA2[verticalFam] = groundCoord; pA2[footprintAxes[1]] = 12;
        pB1[footprintAxes[0]] = -12; pB1[verticalFam] = groundCoord; pB1[footprintAxes[1]] = g;
        pB2[footprintAxes[0]] = 12; pB2[verticalFam] = groundCoord; pB2[footprintAxes[1]] = g;
        const a1 = projectPoint(pA1, cam), a2 = projectPoint(pA2, cam);
        const b1 = projectPoint(pB1, cam), b2 = projectPoint(pB2, cam);
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
    allFaces,
    verticalFam,
    footprintAxes,
    groundCoord,
    cams: (() => {
      const centers = Object.values(cubesWorld).map(c => c.origin);
      const center = [0, 0, 0];
      for (const p of centers) for (let i = 0; i < 3; i++) center[i] += p[i] / centers.length;
      center[verticalFam] += 0.5;
      const dist = 16;
      const pos = (h0, up, h1) => {
        const v = center.slice();
        v[footprintAxes[0]] += h0;
        v[verticalFam] += up;
        v[footprintAxes[1]] += h1;
        return v;
      };
      return [
        { label: 'original camera (sanity check)', eye: origCam.pos, basis: { right: origCam.right, up: origCam.up, forward: origCam.forward }, focal: f, principal: pp, sourceWidth: imgW, sourceHeight: imgH },
        { label: 'rotated +60deg yaw', eye: pos(Math.sin(1.05) * dist, 2, -Math.cos(1.05) * dist), target: center, fov: 45 },
        { label: 'rotated -90deg (side)', eye: pos(-dist, 1, 0), target: center, fov: 45 },
        { label: 'top-down (floor plan)', eye: pos(0.01, dist + 4, 0.01), target: center, fov: 50 },
        { label: 'from behind', eye: pos(0, 1, dist), target: center, fov: 45 },
        { label: 'low oblique', eye: pos(dist * 0.7, 4, dist * 0.7), target: center, fov: 45 },
      ];
    })(),
  });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'village-turntable.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote village-turntable.png');
  await browser.close();
})();
