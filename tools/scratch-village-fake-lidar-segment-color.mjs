// SCRATCH -- follow-up to scratch-village-fake-lidar-segment.mjs. That script
// showed connectedComponents3D (distance + normal-angle only, no color) leaks
// across a box's 90deg corners: normal estimation blends near edges, so the
// angle check doesn't cut cleanly. This script adds a SECOND evidence channel
// -- per-point RGB, real-sampled for measured faces, parallel-copied for
// constructed faces (same as scratch-village-fake-lidar-splat.mjs) -- and
// fuses it with geometry via a local (not runtime/spatial-kernel/) copy of
// the same connected-components idea, to test the multimodal claim directly:
// does requiring BOTH geometric AND color continuity close the leaks that
// geometry alone couldn't, and does it leave open exactly the leaks a
// same-colored corner (e.g. wall wrapping into wall) would predict?
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimatePointNormalsRobust, geometryNeighbourhood } from '../runtime/spatial-kernel/reconstruction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const REPO_ROOT = path.join(__dirname, '..');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { W: imgW, H: imgH, dirF, T, scale } = recon;
const houseNames = Object.keys(T);

const FACES = [
  { axis: 0, value: 1, gt: 'measured' }, { axis: 1, value: 1, gt: 'measured' }, { axis: 2, value: 1, gt: 'measured' },
  { axis: 0, value: 0, gt: 'constructed', opposite: 0 }, { axis: 1, value: 0, gt: 'constructed', opposite: 1 }, { axis: 2, value: 0, gt: 'constructed', opposite: 2 },
];
const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
const GRID = 14;

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const imgPath = path.join(REPO_ROOT, 'file_000000006d188210a9bb1129089a7b29.png');
  const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(imgPath).toString('base64');
  await page.setContent('<canvas id="c"></canvas>');

  const points = await page.evaluate(async ({ imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID }) => {
    const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
    const srcCanvas = document.createElement('canvas'); srcCanvas.width = imgW; srcCanvas.height = imgH;
    const srcCtx = srcCanvas.getContext('2d'); srcCtx.drawImage(img, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, imgW, imgH).data;
    function samplePixel(x, y) {
      const xi = Math.max(0, Math.min(imgW - 1, Math.round(x))), yi = Math.max(0, Math.min(imgH - 1, Math.round(y)));
      const idx = (yi * imgW + xi) * 4;
      return [srcData[idx], srcData[idx + 1], srcData[idx + 2]];
    }
    function screenPoint(p3) { let x = 0, y = 0; for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; } return [x, y]; }
    function worldPoint(Th, Lh, a, b, c) { return [Th[0] + a * Lh[0], Th[1] + b * Lh[1], Th[2] + c * Lh[2]]; }
    const out = [];
    for (const name of houseNames) {
      const Th = T[name], Lh = scale[name];
      for (const face of FACES) {
        const local = { 0: 0, 1: 0, 2: 0 }; local[face.axis] = face.value;
        const [u, v] = otherAxes(face.axis);
        for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
          local[u] = i / GRID; local[v] = j / GRID;
          const world = worldPoint(Th, Lh, local[0], local[1], local[2]);
          let color;
          if (face.gt === 'measured') { const [sx, sy] = screenPoint(world); color = samplePixel(sx, sy); }
          else { const oppLocal = { ...local, [face.axis]: 1 }; const oppWorld = worldPoint(Th, Lh, oppLocal[0], oppLocal[1], oppLocal[2]); const [sx, sy] = screenPoint(oppWorld); color = samplePixel(sx, sy); }
          out.push({ x: world[0], y: world[1], z: world[2], r: color[0], g: color[1], b: color[2], house: name, faceKey: `${face.axis}:${face.value}`, gt: face.gt });
        }
      }
    }
    return out;
  }, { imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID });
  await browser.close();

  console.log(`Point cloud: ${points.length} points (with real/parallel-copied RGB)`);
  fs.writeFileSync(path.join(OUT, 'village-fake-lidar-points-rgb.json'), JSON.stringify(points));

  // --- Local (scratch-only) connected components with an optional color
  // channel. Deliberately NOT modifying runtime/spatial-kernel/reconstruction.js
  // -- this is one candidate fusion rule to test, not a replacement.
  function buildBuckets(pts, cellSize) {
    const buckets = new Map();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const k = [Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize)].join(':');
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    }
    return buckets;
  }
  function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
  function segment(pts, normals, opts) {
    const { distanceLimit, normalCos, colorThreshold, mode } = opts;
    const cell = distanceLimit;
    const buckets = buildBuckets(pts, cell);
    const n = pts.length;
    const visited = new Uint8Array(n), components = [];
    for (let seed = 0; seed < n; seed++) {
      if (visited[seed]) continue;
      const comp = [], queue = [seed]; visited[seed] = 1;
      while (queue.length) {
        const cur = queue.pop(); comp.push(cur);
        const p = pts[cur];
        const c = [Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell)];
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const arr = buckets.get((c[0] + dx) + ':' + (c[1] + dy) + ':' + (c[2] + dz));
          if (!arr) continue;
          for (const next of arr) {
            if (visited[next]) continue;
            const q = pts[next];
            const dd = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
            if (dd > distanceLimit) continue;
            const geomOk = !normals || !normals[next] || !normals[cur] ||
              (normals[cur].normal[0] * normals[next].normal[0] + normals[cur].normal[1] * normals[next].normal[1] + normals[cur].normal[2] * normals[next].normal[2]) >= normalCos;
            const colorOk = colorThreshold == null || colorDist(p, q) <= colorThreshold;
            let connect;
            if (mode === 'geometry-only') connect = geomOk;
            else if (mode === 'color-only') connect = colorOk;
            else if (mode === 'and') connect = geomOk && colorOk;
            else connect = geomOk || colorOk; // 'or' -- not used here, kept for completeness
            if (!connect) continue;
            visited[next] = 1; queue.push(next);
          }
        }
      }
      components.push(comp);
    }
    return components.sort((a, b) => b.length - a.length);
  }
  function purity(components, pts) {
    let pureFace = 0, mixedFace = 0, mixedHouse = 0, singletons = 0;
    for (const comp of components) {
      if (comp.length < 4) { singletons++; continue; }
      const houses = new Set(comp.map(i => pts[i].house));
      const faces = new Set(comp.map(i => pts[i].faceKey));
      if (houses.size > 1) mixedHouse++;
      else if (faces.size === 1) pureFace++;
      else mixedFace++;
    }
    return { pureFace, mixedFace, mixedHouse, singletons, total: components.length };
  }

  const normals = estimatePointNormalsRobust(points, { k: 16 });
  // Same distanceLimit derivation reconstruction.js uses internally, done
  // manually here since buildBuckets/distance-limit logic isn't exported.
  const diag = Math.hypot(
    Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
    Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z)),
  );
  // Same density-aware derivation reconstruction.js's connectedComponents3D
  // uses internally (median nearest-neighbour spacing, not a fixed diagonal
  // fraction -- a fixed fraction is what produced ~all-singleton components
  // on the first attempt here, since this cloud's point spacing varies a lot
  // between the small per-face grid step and the large inter-house gaps).
  const spacings = [];
  for (let s = 0; s < Math.min(points.length, 64); s++) {
    const { localScale } = geometryNeighbourhood(points, s, { k: 4 });
    if (localScale > 1e-9) spacings.push(localScale);
  }
  spacings.sort((a, b) => a - b);
  const nn = spacings.length ? spacings[Math.floor(spacings.length / 2)] : diag * 0.05;
  const distanceLimit = Math.max(nn * 2.5, diag * 0.01, 1e-4);
  const normalCos = Math.cos(28 * Math.PI / 180);
  console.log(`distanceLimit=${distanceLimit.toFixed(2)} (nn=${nn.toFixed(2)}, diag=${diag.toFixed(0)})`);

  const colorDists = [];
  for (let i = 0; i < 3000; i++) { const a = points[Math.floor(Math.random() * points.length)], b = points[Math.floor(Math.random() * points.length)]; colorDists.push(colorDist(a, b)); }
  colorDists.sort((a, b) => a - b);
  console.log(`\nRandom-pair color-distance sample: p10=${colorDists[300].toFixed(1)} p50=${colorDists[1500].toFixed(1)} p90=${colorDists[2700].toFixed(1)}`);
  const COLOR_THRESHOLD = 40; // same-material tolerance guess, see distribution above

  console.log('\n=== geometry-only (baseline, matches reconstruction.js behaviour) ===');
  const geomOnly = segment(points, normals, { distanceLimit, normalCos, colorThreshold: null, mode: 'geometry-only' });
  console.log(`components: ${geomOnly.length}`, purity(geomOnly, points));

  console.log('\n=== color-only (no geometry check at all) ===');
  const colorOnly = segment(points, normals, { distanceLimit, normalCos, colorThreshold: COLOR_THRESHOLD, mode: 'color-only' });
  console.log(`components: ${colorOnly.length}`, purity(colorOnly, points));

  console.log(`\n=== fused: geometry AND color (threshold=${COLOR_THRESHOLD}) ===`);
  const fused = segment(points, normals, { distanceLimit, normalCos, colorThreshold: COLOR_THRESHOLD, mode: 'and' });
  console.log(`components: ${fused.length}`, purity(fused, points));

  // Spot-check: of the components that are STILL mixed-face under fusion,
  // are they cases where the two faces genuinely have near-identical color
  // (same wood wall wrapping a corner) -- the predicted residual leak?
  console.log('\nStill-mixed components under fusion (up to 5), with the color gap between their faces:');
  let shown = 0;
  for (const comp of fused) {
    if (comp.length < 4) continue;
    const houses = new Set(comp.map(i => points[i].house));
    const faces = [...new Set(comp.map(i => points[i].faceKey))];
    if (houses.size === 1 && faces.length > 1) {
      const byFace = {};
      for (const i of comp) { (byFace[points[i].faceKey] ||= []).push(i); }
      const faceAvgColor = {};
      for (const [fk, idxs] of Object.entries(byFace)) {
        const avg = idxs.reduce((s, i) => [s[0] + points[i].r, s[1] + points[i].g, s[2] + points[i].b], [0, 0, 0]).map(v => v / idxs.length);
        faceAvgColor[fk] = avg;
      }
      const fks = Object.keys(faceAvgColor);
      const gaps = [];
      for (let a = 0; a < fks.length; a++) for (let b = a + 1; b < fks.length; b++) {
        const [r1, g1, b1] = faceAvgColor[fks[a]], [r2, g2, b2] = faceAvgColor[fks[b]];
        gaps.push(`${fks[a]}<->${fks[b]}: ${Math.hypot(r1 - r2, g1 - g2, b1 - b2).toFixed(1)}`);
      }
      console.log(`  house=${[...houses][0]} faces=${fks.join(',')} n=${comp.length} colorGaps=[${gaps.join('; ')}]`);
      shown++;
      if (shown >= 5) break;
    }
  }
})();
