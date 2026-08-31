// SCRATCH prototype -- NOT part of the verify suite, NOT meant to be
// committed. Pure geometry sanity check, no image, no extraction, no
// SHADED engine at all: can the renderer place 4 IDENTICAL unit cubes at
// an exactly specified arrangement and render them consistently from
// multiple angles? This is deliberately "Schulmathematik" -- the point is
// to prove the camera/projection/lighting math itself is trustworthy
// before trusting it on real, uncertain, image-derived geometry.
//
// CORRECTED AGAIN per maintainer feedback: the first attempt guessed both
// spacing and depth; the second attempt fixed the spacing/depth NUMBERS
// but centered cubes ON grid lines instead of aligning their footprints
// TO grid cells -- so a cube's edges fell at half-integer X (e.g. -2.5),
// straddling two cells of the very grid that already correctly represents
// "1 cell = 1 cube footprint." Nothing here should be guessed: the grid
// IS the ruler, so every cube is placed by grid CELL INDEX, not by a
// hand-picked coordinate -- its edges then land on grid lines by
// construction, not by hoping the arithmetic works out.
//
// Grid cell (i,j) spans X in [i, i+1], Z in [j, j+1]; a cube placed "in"
// cell (i,j) has its footprint centered at (i+0.5, 0, j+0.5), exactly
// filling that one cell -- checked below, not assumed.
//
// Row j=0 (front row), one empty cell between each pair (gap = 1 cube):
//   cube1 -> cell(-3, 0)   cube2 -> cell(-1, 0)   cube3 -> cell(1, 0)
//   (cell(-2,0) and cell(0,0) stay empty -- the two gaps)
// cube4's X is fixed by the same logic: cell column i=0, the gap between
// cube2 and cube3 (pulling it forward to j=0 fills that gap exactly,
// completing cube2-cube4-cube3 as one contiguous 3-block).
//
// CORRECTED A THIRD TIME: cube4's depth (j) is NOT "one row back" by
// convention -- that was still a guess, just a tidier-looking one. The
// maintainer's actual constraint is visibility: the reference photo shows
// cube4 with nothing occluded, which is a real geometric bound on how far
// back it must be from a given camera. That's measured below by ray-casting
// from the camera eye to all 8 corners of cube4 and testing for
// intersection with cube1/cube2/cube3's boxes, scanning j upward until no
// corner is blocked -- not assumed, not eyeballed.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });

const CUBE_SIZE = 1.0; // must equal the grid cell size for "1 cell = 1 footprint"
const cellCenter = (i, j) => [i + CUBE_SIZE / 2, 0, j + CUBE_SIZE / 2];
const cube1 = cellCenter(-3, 0);
const cube2 = cellCenter(-1, 0);
const cube3 = cellCenter(1, 0);

// --- MEASURE cube4's depth, don't guess it. Maintainer's point: the
// reference photo shows cube4 fully unoccluded by the front row, so its
// depth is bounded below by an actual visibility constraint, not a "one
// row back" convention. Solve it: cast a ray from the camera eye to each
// of cube4's 8 corners and test for intersection with cube1/cube2/cube3's
// boxes (slab method); increase j until no corner is blocked.
function cornersOf(center) {
  const h = CUBE_SIZE / 2, [cx, cy, cz] = center;
  const p = (dx, dy, dz) => [cx + dx * h, cy + (dy < 0 ? 0 : CUBE_SIZE), cz + dz * h];
  return [p(-1, -1, -1), p(1, -1, -1), p(-1, -1, 1), p(1, -1, 1), p(-1, 1, -1), p(1, 1, -1), p(-1, 1, 1), p(1, 1, 1)];
}
function aabbOf(center) {
  const h = CUBE_SIZE / 2, [cx, cy, cz] = center;
  return { min: [cx - h, cy, cz - h], max: [cx + h, cy + CUBE_SIZE, cz + h] };
}
function rayAABBEntry(origin, dir, boxMin, boxMax) {
  let tmin = 0, tmax = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] < boxMin[i] || origin[i] > boxMax[i]) return null;
      continue;
    }
    let t1 = (boxMin[i] - origin[i]) / dir[i], t2 = (boxMax[i] - origin[i]) / dir[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
function isOccluded(eye, target, boxes) {
  const dir = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  return boxes.some(b => { const t = rayAABBEntry(eye, dir, b.min, b.max); return t !== null && t > 1e-6 && t < 1 - 1e-6; });
}
function eyeFor(target, distance, yawDeg, pitchDeg) {
  const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180;
  return [target[0] + distance * Math.cos(pitch) * Math.sin(yaw), target[1] + distance * Math.sin(pitch), target[2] + distance * Math.cos(pitch) * Math.cos(yaw)];
}
// Same camera parameters as the "yaw 20deg" render panel below (the most
// front-on, most reference-photo-like view) -- target recomputed from the
// actual 4-cube centroid at each candidate j, so the measurement matches
// the camera that will actually render it, not a stand-in.
const HERO_YAW = 20, HERO_PITCH = 26, HERO_DIST = 10;
function clearanceAt(j) {
  const c4 = cellCenter(0, j);
  const centers = [cube1, cube2, cube3, c4];
  const cx = centers.reduce((s, p) => s + p[0], 0) / 4, cz = centers.reduce((s, p) => s + p[2], 0) / 4;
  const eye = eyeFor([cx, 0.4, cz], HERO_DIST, HERO_YAW, HERO_PITCH);
  const boxes = [aabbOf(cube1), aabbOf(cube2), aabbOf(cube3)];
  const occludedCorners = cornersOf(c4).filter(pt => isOccluded(eye, pt, boxes));
  return occludedCorners.length;
}
let measuredJ = null;
for (let j = 1.0; j <= 8.0; j += 0.02) {
  if (clearanceAt(j) === 0) { measuredJ = Math.round(j * 100) / 100; break; }
}
if (measuredJ === null) throw new Error('No unoccluded depth found up to j=8 -- geometry assumption is wrong, not a tuning problem.');
console.log(`MEASURED (not guessed): cube4 needs j >= ${measuredJ} to be fully unoccluded by cube1/2/3 from the yaw=${HERO_YAW}deg reference camera.`);
console.log(`  (occluded-corner-count at j=${(measuredJ - 0.02).toFixed(2)}: ${clearanceAt(measuredJ - 0.02)}, at j=${measuredJ}: ${clearanceAt(measuredJ)})`);
const cube4 = cellCenter(0, measuredJ);
console.log(`  cube4 placed at cell(0, ${measuredJ}) -> center`, cube4, ` (gap to front row's back edge (Z=1) = ${(cube4[2] - CUBE_SIZE / 2 - 1).toFixed(2)} cells)`);

function footprintBounds(center) {
  const h = CUBE_SIZE / 2;
  return { xMin: center[0] - h, xMax: center[0] + h, zMin: center[2] - h, zMax: center[2] + h };
}
console.log('Cube centers (ground-contact, y=base):');
for (const [name, c] of [['cube1', cube1], ['cube2', cube2], ['cube3', cube3], ['cube4', cube4]]) {
  const b = footprintBounds(c);
  const onGrid = Number.isInteger(b.xMin) && Number.isInteger(b.xMax) && Number.isInteger(b.zMin) && Number.isInteger(b.zMax);
  console.log(`  ${name} = [${c}]  footprint X[${b.xMin},${b.xMax}] Z[${b.zMin},${b.zMax}]  edges-on-gridlines=${onGrid}`);
}
console.log('  gap cell between cube1/cube2 = X[-2,-1] (empty, width 1 = one cube-width)');
console.log('  gap cell between cube2/cube3 = X[0,1] (empty in row 0) -- cube4\'s X=0.5 sits centered in that same column');
console.log('  cube4 pulled to j=0 -> cell(0,0) == the cube2/cube3 gap cell exactly -> contiguous cube2-cube4-cube3 3-block (X-alignment only; Z is the measured, not integer, depth above)');

function unitCube(center, size, label) {
  const h = size / 2;
  const [cx, cy, cz] = center;
  // 8 corners, y from cy (ground contact) to cy+size (top).
  const p = (dx, dy, dz) => [cx + dx * h, cy + (dy < 0 ? 0 : size), cz + dz * h];
  const bfl = p(-1, -1, -1), bfr = p(1, -1, -1), bbl = p(-1, -1, 1), bbr = p(1, -1, 1);
  const tfl = p(-1, 1, -1), tfr = p(1, 1, -1), tbl = p(-1, 1, 1), tbr = p(1, 1, 1);
  return {
    label,
    center: [cx, cy + size / 2, cz],
    faces: [
      { name: 'front', corners: [bfl, bfr, tfr, tfl] },
      { name: 'back', corners: [bbr, bbl, tbl, tbr] },
      { name: 'left', corners: [bbl, bfl, tfl, tbl] },
      { name: 'right', corners: [bfr, bbr, tbr, tfr] },
      { name: 'top', corners: [tfl, tfr, tbr, tbl] },
    ],
  };
}

const cubes = [
  unitCube(cube1, CUBE_SIZE, '1'),
  unitCube(cube2, CUBE_SIZE, '2'),
  unitCube(cube3, CUBE_SIZE, '3'),
  unitCube(cube4, CUBE_SIZE, '4'),
];
const BASE_COLOR = [196, 194, 190];

(async () => {
  const launchOpts = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.setContent('<!doctype html><html><body></body></html>');

  const renderDataUrl = await page.evaluate(async ({ cubes, baseColor, cams }) => {
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
      return norm3(cross3(sub3(b, a), sub3(c, a)));
    }
    const LIGHT_DIR = norm3([0.4, 1.0, 0.55]);
    const AMBIENT = 0.45, DIFFUSE = 0.55;
    function shade(color, normal) {
      const intensity = AMBIENT + DIFFUSE * Math.max(0, dot3(normal, LIGHT_DIR));
      return color.map(c => Math.min(255, Math.round(c * intensity)));
    }

    // Flat ground grid, world XZ plane at y=0, so absolute spacing is
    // directly checkable by eye against the grid lines (1 cell = 1 unit).
    function groundGridFaces(halfExtent, step) {
      const lines = [];
      for (let x = -halfExtent; x <= halfExtent + 1e-6; x += step) lines.push([[x, 0, -halfExtent], [x, 0, halfExtent]]);
      for (let z = -halfExtent; z <= halfExtent + 1e-6; z += step) lines.push([[-halfExtent, 0, z], [halfExtent, 0, z]]);
      return lines;
    }
    const gridLines = groundGridFaces(5, 1);

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

      // Ground grid first (always behind the cubes -- it's flat on y=0).
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      for (const [a, b] of gridLines) {
        const pa = projectPoint(a, cam), pb = projectPoint(b, cam);
        if (!pa || !pb) continue;
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      }

      // Soft contact shadow per cube.
      cubes.forEach(cube => {
        const groundCenter = [cube.center[0], 0, cube.center[2]];
        const p0 = projectPoint(groundCenter, cam);
        if (!p0) return;
        const corner = projectPoint([groundCenter[0] + 0.5, 0, groundCenter[2] + 0.5], cam);
        const rPx = corner ? Math.hypot(corner[0] - p0[0], corner[1] - p0[1]) * 1.3 : 20;
        ctx.save(); ctx.filter = 'blur(6px)';
        const grad = ctx.createRadialGradient(p0[0], p0[1], 0, p0[0], p0[1], rPx);
        grad.addColorStop(0, 'rgba(20,18,15,0.30)'); grad.addColorStop(1, 'rgba(20,18,15,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(p0[0], p0[1], rPx, rPx * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      const drawable = [];
      for (const cube of cubes) {
        for (const face of cube.faces) {
          const projected = face.corners.map(p => projectPoint(p, cam));
          if (projected.some(p => !p)) continue;
          const avgZ = projected.reduce((s, p) => s + p[2], 0) / projected.length;
          let normal = faceNormal(face.corners);
          const faceCenter = face.corners.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
          const viewVec = norm3(sub3(cam.eye, faceCenter));
          if (dot3(normal, viewVec) < 0) normal = normal.map(v => -v);
          drawable.push({ projected, avgZ, normal, cube });
        }
      }
      drawable.sort((a, b) => b.avgZ - a.avgZ);
      for (const { projected, normal } of drawable) {
        const [r, g, b] = shade(baseColor, normal);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath(); ctx.moveTo(projected[0][0], projected[0][1]);
        for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i][0], projected[i][1]);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // Label each cube above its top face for direct auditability.
      cubes.forEach(cube => {
        const topCenter = [cube.center[0], cube.center[1] + 0.75, cube.center[2]];
        const p = projectPoint(topCenter, cam);
        if (!p) return;
        ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(cube.label, p[0], p[1]);
      });
      ctx.textAlign = 'left';
      ctx.fillStyle = '#333'; ctx.font = '14px sans-serif'; ctx.fillText(camDef.label, 10, 20);
      outCtx.drawImage(c, ci * W_PX, 0);
    });
    return outCanvas.toDataURL('image/png');
  }, {
    cubes,
    baseColor: BASE_COLOR,
    cams: (() => {
      const centers = cubes.map(c => c.center);
      const cx = centers.reduce((s, p) => s + p[0], 0) / centers.length;
      const cz = centers.reduce((s, p) => s + p[2], 0) / centers.length;
      const target = [cx, 0.4, cz], distance = 10, pitch = 26 * Math.PI / 180, fov = 45;
      const orbit = [20, 110, 200, 290].map(yaw => ({ label: `yaw ${yaw}°`, target, distance, yaw: yaw * Math.PI / 180, pitch, fov }));
      const top = { label: 'top-down', target: [cx, 0, cz], distance: 10.5, yaw: 20 * Math.PI / 180, pitch: 68 * Math.PI / 180, fov: 50 };
      return [...orbit, top];
    })(),
  });

  const b64 = renderDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'four-cubes-test.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote four-cubes-test.png');
  await browser.close();
})();
