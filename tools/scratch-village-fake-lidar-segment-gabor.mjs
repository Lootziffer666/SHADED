// SCRATCH -- round 10: Gabor filter bank, the second of the three "Mikrotextur-
// Signatur" operators named in material-geometrie-ohne-farbe.md SS2 (LBP done
// in round 4/6, autocorrelation still untested). Uses the frozen-anchor
// recipe established in round 6-8 (small geometry+color-trusted core ->
// average feature vector -> freeze -> compare all further candidates against
// the fixed reference, never updated again) from the start, since round 5
// already showed the naive continuously-updated/pairwise version is a dead
// end for this fixture.
//
// 8-orientation Gabor filter bank (single scale: lambda=5px, sigma=2px,
// gamma=0.5), magnitude response per orientation averaged over a 9x9 patch ->
// an 8-dim feature vector per point, compared via Euclidean distance.
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
  { axis: 0, value: 0, gt: 'constructed' }, { axis: 1, value: 0, gt: 'constructed' }, { axis: 2, value: 0, gt: 'constructed' },
];
const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
const GRID = 14, PATCH_R = 4, N_ORIENT = 8;

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const imgPath = path.join(REPO_ROOT, 'file_000000006d188210a9bb1129089a7b29.png');
  const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(imgPath).toString('base64');
  await page.setContent('<canvas id="c"></canvas>');

  const points = await page.evaluate(async ({ imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID, PATCH_R, N_ORIENT }) => {
    const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
    const srcCanvas = document.createElement('canvas'); srcCanvas.width = imgW; srcCanvas.height = imgH;
    const srcCtx = srcCanvas.getContext('2d'); srcCtx.drawImage(img, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, imgW, imgH).data;
    function gray(x, y) { const xi = Math.max(0, Math.min(imgW - 1, x)), yi = Math.max(0, Math.min(imgH - 1, y)); const idx = (yi * imgW + xi) * 4; return 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2]; }
    function samplePixel(x, y) { const xi = Math.max(0, Math.min(imgW - 1, Math.round(x))), yi = Math.max(0, Math.min(imgH - 1, Math.round(y))); const idx = (yi * imgW + xi) * 4; return [srcData[idx], srcData[idx + 1], srcData[idx + 2]]; }

    // Precompute N_ORIENT Gabor kernels (real part), each (2*PATCH_R+1)^2.
    const sigma = 2, lambda = 5, gamma = 0.5, psi = 0;
    const kernels = [];
    for (let k = 0; k < N_ORIENT; k++) {
      const theta = (k / N_ORIENT) * Math.PI;
      const kern = [];
      for (let dy = -PATCH_R; dy <= PATCH_R; dy++) {
        for (let dx = -PATCH_R; dx <= PATCH_R; dx++) {
          const xp = dx * Math.cos(theta) + dy * Math.sin(theta);
          const yp = -dx * Math.sin(theta) + dy * Math.cos(theta);
          const g = Math.exp(-(xp * xp + gamma * gamma * yp * yp) / (2 * sigma * sigma)) * Math.cos(2 * Math.PI * xp / lambda + psi);
          kern.push(g);
        }
      }
      kernels.push(kern);
    }
    function gaborFeature(cx, cy) {
      const patch = [];
      for (let dy = -PATCH_R; dy <= PATCH_R; dy++) for (let dx = -PATCH_R; dx <= PATCH_R; dx++) patch.push(gray(Math.round(cx) + dx, Math.round(cy) + dy));
      const feat = new Array(N_ORIENT).fill(0);
      for (let k = 0; k < N_ORIENT; k++) {
        let s = 0;
        for (let i = 0; i < patch.length; i++) s += patch[i] * kernels[k][i];
        feat[k] = Math.abs(s) / patch.length;
      }
      return feat;
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
          let sx, sy;
          if (face.gt === 'measured') { [sx, sy] = screenPoint(world); }
          else { const oppLocal = { ...local, [face.axis]: 1 }; const oppWorld = worldPoint(Th, Lh, oppLocal[0], oppLocal[1], oppLocal[2]); [sx, sy] = screenPoint(oppWorld); }
          const color = samplePixel(sx, sy);
          out.push({ x: world[0], y: world[1], z: world[2], r: color[0], g: color[1], b: color[2], gabor: gaborFeature(sx, sy), house: name, faceKey: `${face.axis}:${face.value}`, gt: face.gt });
        }
      }
    }
    return out;
  }, { imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID, PATCH_R, N_ORIENT });
  await browser.close();
  console.log(`Point cloud with Gabor features: ${points.length} points, ${N_ORIENT}-dim feature`);

  function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
  function gaborDist(a, b) { let s = 0; for (let i = 0; i < N_ORIENT; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
  function buildBuckets(pts, cellSize) { const buckets = new Map(); for (let i = 0; i < pts.length; i++) { const p = pts[i]; const k = [Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize)].join(':'); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); } return buckets; }
  function purityWeighted(components, pts) {
    let purePts = 0, mixedPts = 0, singletonPts = 0;
    for (const comp of components) {
      if (comp.length < 4) { singletonPts += comp.length; continue; }
      const houses = new Set(comp.map(i => pts[i].house)); const faces = new Set(comp.map(i => pts[i].faceKey));
      if (houses.size === 1 && faces.size === 1) purePts += comp.length; else mixedPts += comp.length;
    }
    const total = purePts + mixedPts + singletonPts;
    return { components: components.length, purePts, mixedPts, singletonPts, purePct: (100 * purePts / total).toFixed(1) + '%' };
  }

  const normals = estimatePointNormalsRobust(points, { k: 16 });
  const diag = Math.hypot(
    Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
    Math.max(...points.map(p => p.z)) - Math.min(...points.map(p => p.z)),
  );
  const spacings = [];
  for (let s = 0; s < Math.min(points.length, 64); s++) { const { localScale } = geometryNeighbourhood(points, s, { k: 4 }); if (localScale > 1e-9) spacings.push(localScale); }
  spacings.sort((a, b) => a - b);
  const nn = spacings[Math.floor(spacings.length / 2)];
  const distanceLimit = Math.max(nn * 2.5, diag * 0.01, 1e-4);
  const normalCos28 = Math.cos(28 * Math.PI / 180);
  const COLOR_THRESHOLD = 40;

  // Distribution of random-pair Gabor distance to pick sensible thresholds,
  // same method as color/LBP earlier.
  const gd = [];
  for (let i = 0; i < 3000; i++) { const a = points[Math.floor(Math.random() * points.length)], b = points[Math.floor(Math.random() * points.length)]; gd.push(gaborDist(a.gabor, b.gabor)); }
  gd.sort((a, b) => a - b);
  console.log(`Random-pair Gabor L2-distance: p10=${gd[300].toFixed(2)} p50=${gd[1500].toFixed(2)} p90=${gd[2700].toFixed(2)}`);

  function segmentFrozenGabor(pts, opts) {
    const { anchorSize, gaborThreshold, useColor } = opts;
    const buckets = buildBuckets(pts, distanceLimit);
    const n = pts.length;
    const visited = new Uint8Array(n), components = [];
    for (let seed = 0; seed < n; seed++) {
      if (visited[seed]) continue;
      const comp = [seed]; visited[seed] = 1;
      let frozenFeat = null, sumFeat = pts[seed].gabor.slice(), anchorCount = 1;
      const queue = [seed];
      while (queue.length) {
        const cur = queue.pop();
        const p = pts[cur];
        const c = [Math.floor(p.x / distanceLimit), Math.floor(p.y / distanceLimit), Math.floor(p.z / distanceLimit)];
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const arr = buckets.get((c[0] + dx) + ':' + (c[1] + dy) + ':' + (c[2] + dz));
          if (!arr) continue;
          for (const next of arr) {
            if (visited[next]) continue;
            const q = pts[next];
            const dd = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
            if (dd > distanceLimit) continue;
            const nCur = normals[cur].normal, nNext = normals[next].normal;
            const geomOk = (nCur[0] * nNext[0] + nCur[1] * nNext[1] + nCur[2] * nNext[2]) >= normalCos28;
            if (!geomOk) continue;
            if (useColor && colorDist(p, q) > COLOR_THRESHOLD) continue;
            if (frozenFeat) { if (gaborDist(frozenFeat, q.gabor) > gaborThreshold) continue; }
            visited[next] = 1; queue.push(next); comp.push(next);
            if (!frozenFeat && anchorCount < anchorSize) {
              for (let i = 0; i < N_ORIENT; i++) sumFeat[i] += q.gabor[i];
              anchorCount++;
              if (anchorCount >= anchorSize) frozenFeat = sumFeat.map(v => v / anchorCount);
            }
          }
        }
      }
      components.push(comp);
    }
    return components.sort((a, b) => b.length - a.length);
  }

  console.log('\n=== frozen-anchor Gabor, anchorSize=5 ===');
  for (const gaborThreshold of [gd[300], gd[750], gd[1500]]) {
    for (const useColor of [false, true]) {
      const comps = segmentFrozenGabor(points, { anchorSize: 5, gaborThreshold, useColor });
      console.log(`  threshold=${gaborThreshold.toFixed(2)} useColor=${useColor}:`, purityWeighted(comps, points));
    }
  }
})();
