// SCRATCH prototype — NOT part of the verify suite, NOT meant to be
// committed. Per explicit instruction: skip detection entirely this round.
// Take the four faces the maintainer hand-marked on the reference image
// (red = main roof slope, yellow = front/gable wall, green = gable
// triangle, blue = side wall) AS GIVEN -- no classGrid, no contour tracing,
// no derived heights, no texture. Build them as four flat 3D polygons that
// share edges consistently, mirror each across the house's centerlines to
// produce the hidden back/opposite faces, and render the result as plain
// coloured (untextured) polygons from an orbit camera. The only question:
// does mirroring these four faces close into a coherent volume?
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

// --- Proportions eyeballed from the maintainer's marked reference image --
// (not measured/derived -- explicitly just "take the faces"). W = gable-end
// width, D = side-wall length (house reads elongated in that direction),
// H_wall = wall height, H_roof = ridge rise above the eave.
const W = 1.4, D = 2.2, H_wall = 1.0, H_roof = 0.7;

const FL = [-W / 2, 0, D / 2], FR = [W / 2, 0, D / 2], BR = [W / 2, 0, -D / 2], BL = [-W / 2, 0, -D / 2];
const FLe = [-W / 2, H_wall, D / 2], FRe = [W / 2, H_wall, D / 2], BRe = [W / 2, H_wall, -D / 2], BLe = [-W / 2, H_wall, -D / 2];
const RF = [0, H_wall + H_roof, D / 2], RB = [0, H_wall + H_roof, -D / 2];

// The four REAL faces, exactly as marked: yellow=front wall, green=gable
// triangle above it, red=one roof slope, blue=the side wall below it.
// Each shares an edge with its neighbour, verified by construction:
// yellow-green share FLe-FRe; yellow-blue share FLe-FL; red-blue share
// FLe-BLe; red-green share RF-FLe.
const realFaces = [
  { name: 'yellow (front wall)', color: [212, 175, 55], corners: [FLe, FRe, FR, FL] },
  { name: 'green (gable triangle)', color: [76, 140, 74], corners: [FLe, RF, FRe] },
  { name: 'red (roof slope)', color: [196, 60, 48], corners: [RF, RB, BLe, FLe] },
  { name: 'blue (side wall)', color: [58, 92, 168], corners: [FLe, BLe, BL, FL] },
];
// Mirrors: yellow/green mirrored across Z=0 (front <-> back gable ends);
// red/blue mirrored across X=0 (the two long sides of the roof/house).
const mirrorZ = p => [p[0], p[1], -p[2]];
const mirrorX = p => [-p[0], p[1], p[2]];
const dim = c => c.map(v => Math.round(v * 0.5));
const generatedFaces = [
  { name: "yellow' (back wall, generated)", color: dim(realFaces[0].color), corners: realFaces[0].corners.map(mirrorZ).reverse() },
  { name: "green' (back gable, generated)", color: dim(realFaces[1].color), corners: realFaces[1].corners.map(mirrorZ).reverse() },
  { name: "red' (other roof slope, generated)", color: dim(realFaces[2].color), corners: realFaces[2].corners.map(mirrorX).reverse() },
  { name: "blue' (other side wall, generated)", color: dim(realFaces[3].color), corners: realFaces[3].corners.map(mirrorX).reverse() },
];
const faces = [...realFaces, ...generatedFaces];

(async () => {
  const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.setContent('<!doctype html><html><body></body></html>');

  const renderDataUrl = await page.evaluate(async ({ faces, cams }) => {
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
        ctx.fillStyle = `rgb(${face.color[0]},${face.color[1]},${face.color[2]})`;
        ctx.beginPath();
        ctx.moveTo(projected[0][0], projected[0][1]);
        for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(c, ci * W_PX, 0);
    });
    return outCanvas.toDataURL('image/png');
  }, {
    faces,
    cams: [
      { label: 'yaw 20°', target: [0, 0.75, 0], distance: 4.2, yaw: 20 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
      { label: 'yaw 110°', target: [0, 0.75, 0], distance: 4.2, yaw: 110 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
      { label: 'yaw 200°', target: [0, 0.75, 0], distance: 4.2, yaw: 200 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
      { label: 'yaw 290°', target: [0, 0.75, 0], distance: 4.2, yaw: 290 * Math.PI / 180, pitch: 22 * Math.PI / 180, fov: 42 },
    ],
  });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'faces-mirror-shape.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote faces-mirror-shape.png');
  await browser.close();
})();
