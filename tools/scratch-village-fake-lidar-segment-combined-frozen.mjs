// SCRATCH -- round 8, the combination round: geometry + color + a SINGLE
// frozen anchor (small geometry+color-trusted core) that determines BOTH the
// cardinal VP axis (round 7, modest help alone: 39.4%) AND the reference LBP
// histogram (round 6, dramatic help alone: 73.0%) for a region, then checks
// every further candidate against both frozen references at once. Question:
// does combining the two frozen-anchor channels beat LBP's 73.0% alone, or do
// they compete/cancel (e.g. VP's coarse 90deg cells reject some points LBP
// alone would have correctly kept)?
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

  const CARDINAL = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function nearestAxis(v) { let best = 0, bestDot = -Infinity; for (let i = 0; i < CARDINAL.length; i++) { const d = v[0] * CARDINAL[i][0] + v[1] * CARDINAL[i][1] + v[2] * CARDINAL[i][2]; if (d > bestDot) { bestDot = d; best = i; } } return best; }
  function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
  function histL1(h1, h2) { let s = 0; for (let i = 0; i < 256; i++) s += Math.abs(h1[i] - h2[i]); return s; }
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

  function segmentCombinedFrozen(pts, opts) {
    const { anchorSize, vpCos, textureThreshold, useVp, useTexture } = opts;
    const buckets = buildBuckets(pts, distanceLimit);
    const n = pts.length;
    const visited = new Uint8Array(n), components = [];
    for (let seed = 0; seed < n; seed++) {
      if (visited[seed]) continue;
      const comp = [seed]; visited[seed] = 1;
      let frozen = null; // { axisVec, lbpHist }
      let sumNormal = [...normals[seed].normal], sumHist = pts[seed].lbp.slice(), anchorCount = 1;
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
            if (frozen) {
              if (useVp) { const nq = normals[next].normal; const dot = nq[0] * frozen.axisVec[0] + nq[1] * frozen.axisVec[1] + nq[2] * frozen.axisVec[2]; if (dot < vpCos) continue; }
              if (useTexture) { if (histL1(frozen.lbpHist, q.lbp) > textureThreshold) continue; }
            }
            visited[next] = 1; queue.push(next); comp.push(next);
            if (!frozen && anchorCount < anchorSize) {
              const nq = normals[next].normal;
              sumNormal[0] += nq[0]; sumNormal[1] += nq[1]; sumNormal[2] += nq[2];
              for (let i = 0; i < 256; i++) sumHist[i] += q.lbp[i];
              anchorCount++;
              if (anchorCount >= anchorSize) {
                const len = Math.hypot(sumNormal[0], sumNormal[1], sumNormal[2]) || 1;
                frozen = { axisVec: CARDINAL[nearestAxis([sumNormal[0] / len, sumNormal[1] / len, sumNormal[2] / len])], lbpHist: sumHist.map(v => v / anchorCount) };
              }
            }
          }
        }
      }
      components.push(comp);
    }
    return components.sort((a, b) => b.length - a.length);
  }

  console.log('\n=== combined frozen anchor, anchorSize=5 ===');
  for (const [label, opts] of [
    ['texture only (repro of round 6)', { useVp: false, useTexture: true }],
    ['vp only (repro of round 7)', { useVp: true, useTexture: false }],
    ['vp + texture combined', { useVp: true, useTexture: true }],
  ]) {
    const comps = segmentCombinedFrozen(points, { anchorSize: 5, vpCos: Math.cos(28 * Math.PI / 180), textureThreshold: 0.9, ...opts });
    console.log(`  ${label}:`, purityWeighted(comps, points));
  }

  // --- Round 9: Benchmark-Ladder Stufe B (material-geometrie-ohne-farbe.md
  // SS3/SS5 -- "Graustufen. Ueberlebt Cultivation ohne Objektfarbe?"), the
  // cheapest still-undone anti-overfit step named there. Does NOT resample
  // -- forces r=g=b=luminance on the already-sampled points in place, so
  // color carries zero chrominance/hue information, only brightness. LBP
  // is already luminance-only by construction (built from gray()), so this
  // isolates exactly the color channel's chrominance contribution.
  console.log('\n=== Stufe B: grayscale ablation (color reduced to luminance only) ===');
  const grayPoints = points.map((p) => {
    const lum = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
    return { ...p, r: lum, g: lum, b: lum };
  });
  // Re-run distance/normal setup is unnecessary (geometry unaffected); reuse
  // normals/distanceLimit computed above, just re-run segmentation on grayPoints.
  function segmentCombinedFrozenOn(pts, opts) { return segmentCombinedFrozen(pts, opts); }
  for (const [label, opts] of [
    ['grayscale: geometry+color only (no anchor channels)', { useVp: false, useTexture: false }],
    ['grayscale: + texture anchor', { useVp: false, useTexture: true }],
    ['grayscale: + vp anchor', { useVp: true, useTexture: false }],
    ['grayscale: + both anchors', { useVp: true, useTexture: true }],
  ]) {
    const comps = segmentCombinedFrozenOn(grayPoints, { anchorSize: 5, vpCos: Math.cos(28 * Math.PI / 180), textureThreshold: 0.9, ...opts });
    console.log(`  ${label}:`, purityWeighted(comps, grayPoints));
  }
})();
