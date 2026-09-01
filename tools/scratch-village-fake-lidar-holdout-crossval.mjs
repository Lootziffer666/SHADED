// SCRATCH -- addresses a real methodological gap the user flagged directly:
// every threshold in rounds 1-11 (COLOR_THRESHOLD, LBP/Gabor/autocorrelation
// thresholds, anchor sizes) was picked from percentiles of the SAME point
// cloud whose purity was then reported -- close to fitting on the test set.
// A genuinely independent second image would need its own extractor
// calibration (fixture-taxonomie.md SS6: the extractor is deliberately still
// scene/palette-specific, a real rebuild, not a quick add-on) -- too large
// for this round. This is the cheap, honest partial fix available right now:
// a HOLD-OUT split within the one fixture we have. Thresholds are learned
// ONLY from 3 of the 6 houses ("fit set"); purity is reported ONLY on the
// other 3, never seen during threshold selection ("holdout set"). If holdout
// purity collapses relative to fit-set purity, the numbers from rounds 1-11
// were overfit to this exact point cloud's idiosyncrasies, not a real,
// transferable property of geometry+color+LBP fusion.
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
const FIT_HOUSES = new Set(houseNames.slice(0, 3));
const HOLDOUT_HOUSES = new Set(houseNames.slice(3));
console.log(`Fit set: ${[...FIT_HOUSES].join(', ')}. Holdout set: ${[...HOLDOUT_HOUSES].join(', ')}.`);

const FACES = [
  { axis: 0, value: 1, gt: 'measured' }, { axis: 1, value: 1, gt: 'measured' }, { axis: 2, value: 1, gt: 'measured' },
  { axis: 0, value: 0, gt: 'constructed' }, { axis: 1, value: 0, gt: 'constructed' }, { axis: 2, value: 0, gt: 'constructed' },
];
const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
const GRID = 14, PATCH = 9;

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const imgPath = path.join(REPO_ROOT, 'file_000000006d188210a9bb1129089a7b29.png');
  const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(imgPath).toString('base64');
  await page.setContent('<canvas id="c"></canvas>');

  const points = await page.evaluate(async ({ imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID, PATCH }) => {
    const otherAxes = (axis) => [0, 1, 2].filter((a) => a !== axis);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
    const srcCanvas = document.createElement('canvas'); srcCanvas.width = imgW; srcCanvas.height = imgH;
    const srcCtx = srcCanvas.getContext('2d'); srcCtx.drawImage(img, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, imgW, imgH).data;
    function gray(x, y) { const xi = Math.max(0, Math.min(imgW - 1, x)), yi = Math.max(0, Math.min(imgH - 1, y)); const idx = (yi * imgW + xi) * 4; return 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2]; }
    function samplePixel(x, y) { const xi = Math.max(0, Math.min(imgW - 1, Math.round(x))), yi = Math.max(0, Math.min(imgH - 1, Math.round(y))); const idx = (yi * imgW + xi) * 4; return [srcData[idx], srcData[idx + 1], srcData[idx + 2]]; }
    function lbpHistogram(cx, cy) {
      const hist = new Array(256).fill(0); const half = Math.floor(PATCH / 2); let n = 0;
      const neigh = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
      for (let dy = -half + 1; dy <= half - 1; dy++) for (let dx = -half + 1; dx <= half - 1; dx++) {
        const x = Math.round(cx) + dx, y = Math.round(cy) + dy; const c = gray(x, y); let code = 0;
        for (let b = 0; b < 8; b++) { const [nx, ny] = neigh[b]; if (gray(x + nx, y + ny) >= c) code |= (1 << b); }
        hist[code]++; n++;
      }
      for (let i = 0; i < 256; i++) hist[i] /= (n || 1);
      return hist;
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
          out.push({ x: world[0], y: world[1], z: world[2], r: color[0], g: color[1], b: color[2], lbp: lbpHistogram(sx, sy), house: name, faceKey: `${face.axis}:${face.value}`, gt: face.gt });
        }
      }
    }
    return out;
  }, { imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID, PATCH });
  await browser.close();
  console.log(`Point cloud: ${points.length} points`);

  function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
  function histL1(h1, h2) { let s = 0; for (let i = 0; i < 256; i++) s += Math.abs(h1[i] - h2[i]); return s; }
  function buildBuckets(pts, cellSize) { const buckets = new Map(); for (let i = 0; i < pts.length; i++) { const p = pts[i]; const k = [Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize)].join(':'); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); } return buckets; }

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

  // --- Thresholds fit ONLY from FIT_HOUSES points -- the holdout houses'
  // points are never looked at during threshold selection.
  const fitPoints = points.filter((p) => FIT_HOUSES.has(p.house));
  const fitColorDists = [], fitLbpDists = [];
  for (let i = 0; i < 3000; i++) {
    const a = fitPoints[Math.floor(Math.random() * fitPoints.length)], b = fitPoints[Math.floor(Math.random() * fitPoints.length)];
    fitColorDists.push(colorDist(a, b)); fitLbpDists.push(histL1(a.lbp, b.lbp));
  }
  fitColorDists.sort((a, b) => a - b); fitLbpDists.sort((a, b) => a - b);
  const COLOR_THRESHOLD = fitColorDists[Math.floor(fitColorDists.length * 0.5)] * 0.7; // same style as round 2's "below median" pick, but from fit set only
  const TEXTURE_THRESHOLD = fitLbpDists[Math.floor(fitLbpDists.length * 0.25)]; // same percentile round 6 used, but from fit set only
  console.log(`Thresholds learned from fit set only: COLOR_THRESHOLD=${COLOR_THRESHOLD.toFixed(1)}, TEXTURE_THRESHOLD=${TEXTURE_THRESHOLD.toFixed(3)}`);

  // Segment the FULL cloud (region growing needs full spatial context to
  // even reach holdout points), using thresholds learned only on the fit set.
  function segment(pts, opts) {
    const { anchorSize } = opts;
    const buckets = buildBuckets(pts, distanceLimit);
    const n = pts.length;
    const visited = new Uint8Array(n), components = [];
    for (let seed = 0; seed < n; seed++) {
      if (visited[seed]) continue;
      const comp = [seed]; visited[seed] = 1;
      let frozenHist = null, sumHist = pts[seed].lbp.slice(), anchorCount = 1;
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
            if (colorDist(p, q) > COLOR_THRESHOLD) continue;
            if (frozenHist) { if (histL1(frozenHist, q.lbp) > TEXTURE_THRESHOLD) continue; }
            visited[next] = 1; queue.push(next); comp.push(next);
            if (!frozenHist && anchorCount < anchorSize) {
              for (let i = 0; i < 256; i++) sumHist[i] += q.lbp[i];
              anchorCount++;
              if (anchorCount >= anchorSize) frozenHist = sumHist.map((v) => v / anchorCount);
            }
          }
        }
      }
      components.push(comp);
    }
    return components.sort((a, b) => b.length - a.length);
  }
  function purityWeightedFiltered(components, pts, houseFilter) {
    let purePts = 0, mixedPts = 0, singletonPts = 0;
    for (const comp of components) {
      const filtered = comp.filter((i) => houseFilter(pts[i].house));
      if (filtered.length === 0) continue;
      if (comp.length < 4) { singletonPts += filtered.length; continue; }
      const houses = new Set(comp.map((i) => pts[i].house));
      const faces = new Set(comp.map((i) => pts[i].faceKey));
      if (houses.size === 1 && faces.size === 1) purePts += filtered.length; else mixedPts += filtered.length;
    }
    const total = purePts + mixedPts + singletonPts;
    return { purePts, mixedPts, singletonPts, purePct: total ? (100 * purePts / total).toFixed(1) + '%' : 'n/a' };
  }

  const comps = segment(points, { anchorSize: 5 });
  console.log('\nPurity on FIT houses (thresholds learned here, expected to look good):');
  console.log(purityWeightedFiltered(comps, points, (h) => FIT_HOUSES.has(h)));
  console.log('\nPurity on HOLDOUT houses (never seen during threshold selection -- the real test):');
  console.log(purityWeightedFiltered(comps, points, (h) => HOLDOUT_HOUSES.has(h)));
})();
