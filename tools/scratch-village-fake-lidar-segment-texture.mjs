// SCRATCH -- fourth evidence channel: Local Binary Patterns (LBP), one of the
// three "Mikrotextur-Signatur" operators named in
// docs/material-geometrie-ohne-farbe.md SS2 (LBP + Gabor + 2D-Autokorrelation).
// That doc explicitly flagged this as an OPEN, UNTESTED question ("Ob das
// Signal dort diskriminativ genug ist, bleibt eine offene, ungeprüfte Frage")
// because the literature validates on photographs, not cel-shaded
// illustrations like SHADED's fixtures. This is the first empirical test,
// not a literature claim -- only LBP is implemented here (not Gabor or
// autocorrelation, kept for a future round).
//
// Also runs something close to Benchmark-Ladder Stufe B from that doc's SS3
// table ("Graustufen. Ueberlebt Cultivation ohne Objektfarbe?") -- the
// cheapest still-undone step named in SS5 -- by comparing geometry+texture
// (no color) against geometry+color, to see whether texture can substitute
// for color rather than just add to it.
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
const PATCH = 9; // 9x9 patch -> 7x7 interior LBP codes per point

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
    function gray(x, y) {
      const xi = Math.max(0, Math.min(imgW - 1, x)), yi = Math.max(0, Math.min(imgH - 1, y));
      const idx = (yi * imgW + xi) * 4;
      return 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2];
    }
    function samplePixel(x, y) {
      const xi = Math.max(0, Math.min(imgW - 1, Math.round(x))), yi = Math.max(0, Math.min(imgH - 1, Math.round(y)));
      const idx = (yi * imgW + xi) * 4;
      return [srcData[idx], srcData[idx + 1], srcData[idx + 2]];
    }
    // Standard 8-neighbour LBP code (radius 1) per interior patch pixel,
    // accumulated into a 256-bin histogram, L1-normalised.
    function lbpHistogram(cx, cy) {
      const hist = new Array(256).fill(0);
      const half = Math.floor(PATCH / 2);
      let n = 0;
      for (let dy = -half + 1; dy <= half - 1; dy++) {
        for (let dx = -half + 1; dx <= half - 1; dx++) {
          const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
          const c = gray(x, y);
          let code = 0;
          const neigh = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
          for (let b = 0; b < 8; b++) {
            const [nx, ny] = neigh[b];
            if (gray(x + nx, y + ny) >= c) code |= (1 << b);
          }
          hist[code]++; n++;
        }
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
          const hist = lbpHistogram(sx, sy);
          out.push({ x: world[0], y: world[1], z: world[2], r: color[0], g: color[1], b: color[2], lbp: hist, house: name, faceKey: `${face.axis}:${face.value}`, gt: face.gt });
        }
      }
    }
    return out;
  }, { imgDataUrl, imgW, imgH, houseNames, T, scale, dirF, FACES, GRID, PATCH });
  await browser.close();
  console.log(`Point cloud with LBP histograms: ${points.length} points, ${PATCH}x${PATCH} patch -> 256-bin histogram each`);

  function lbpDist(a, b) { let s = 0; for (let i = 0; i < 256; i++) s += Math.abs(a.lbp[i] - b.lbp[i]); return s; } // L1, range [0,2]
  function colorDist(a, b) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }

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
  function segment(pts, normals, opts) {
    const { distanceLimit, normalCos, colorThreshold, textureThreshold, mode } = opts;
    const buckets = buildBuckets(pts, distanceLimit);
    const n = pts.length;
    const visited = new Uint8Array(n), components = [];
    for (let seed = 0; seed < n; seed++) {
      if (visited[seed]) continue;
      const comp = [], queue = [seed]; visited[seed] = 1;
      while (queue.length) {
        const cur = queue.pop(); comp.push(cur);
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
            const geomOk = (nCur[0] * nNext[0] + nCur[1] * nNext[1] + nCur[2] * nNext[2]) >= normalCos;
            const colorOk = colorThreshold == null || colorDist(p, q) <= colorThreshold;
            const textureOk = textureThreshold == null || lbpDist(p, q) <= textureThreshold;
            let connect;
            if (mode === 'geometry-only') connect = geomOk;
            else if (mode === 'texture-only') connect = textureOk;
            else if (mode === 'geometry+texture') connect = geomOk && textureOk;
            else if (mode === 'geometry+color') connect = geomOk && colorOk;
            else if (mode === 'geometry+texture+color') connect = geomOk && textureOk && colorOk;
            if (!connect) continue;
            visited[next] = 1; queue.push(next);
          }
        }
      }
      components.push(comp);
    }
    return components.sort((a, b) => b.length - a.length);
  }
  function purityWeighted(components, pts) {
    let purePts = 0, mixedPts = 0, singletonPts = 0;
    for (const comp of components) {
      if (comp.length < 4) { singletonPts += comp.length; continue; }
      const houses = new Set(comp.map(i => pts[i].house));
      const faces = new Set(comp.map(i => pts[i].faceKey));
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
  for (let s = 0; s < Math.min(points.length, 64); s++) {
    const { localScale } = geometryNeighbourhood(points, s, { k: 4 });
    if (localScale > 1e-9) spacings.push(localScale);
  }
  spacings.sort((a, b) => a - b);
  const nn = spacings[Math.floor(spacings.length / 2)];
  const distanceLimit = Math.max(nn * 2.5, diag * 0.01, 1e-4);
  const normalCos = Math.cos(28 * Math.PI / 180);
  const COLOR_THRESHOLD = 40;

  // Distribution of LBP L1-distance across random pairs, to pick a threshold
  // the same way COLOR_THRESHOLD was picked earlier (empirically, from the
  // sample distribution -- not a literature default).
  const lbpDists = [];
  for (let i = 0; i < 3000; i++) { const a = points[Math.floor(Math.random() * points.length)], b = points[Math.floor(Math.random() * points.length)]; lbpDists.push(lbpDist(a, b)); }
  lbpDists.sort((a, b) => a - b);
  console.log(`Random-pair LBP L1-distance sample: p10=${lbpDists[300].toFixed(3)} p50=${lbpDists[1500].toFixed(3)} p90=${lbpDists[2700].toFixed(3)}`);
  const TEXTURE_THRESHOLD = lbpDists[Math.floor(lbpDists.length * 0.25)]; // 25th percentile, mirrors how COLOR_THRESHOLD sat below the median

  for (const mode of ['geometry-only', 'texture-only', 'geometry+texture', 'geometry+color', 'geometry+texture+color']) {
    const comps = segment(points, normals, { distanceLimit, normalCos, colorThreshold: COLOR_THRESHOLD, textureThreshold: TEXTURE_THRESHOLD, mode });
    console.log(`\n=== ${mode} (textureThreshold=${TEXTURE_THRESHOLD.toFixed(3)}) ===`);
    console.log(purityWeighted(comps, points));
  }

  // Direct check of the open SS2 question: does LBP actually vary at all
  // between DIFFERENT faces of the same house here, or is this stylized
  // image too flat for LBP to say anything (which would itself be the
  // answer to the open question, just a negative one)?
  const sample = houseNames[0];
  const byFace = {};
  for (const p of points) if (p.house === sample) (byFace[p.faceKey] ||= []).push(p);
  console.log(`\nLBP variance check on ${sample} (are different faces' LBP histograms actually distinguishable?):`);
  const faceKeys = Object.keys(byFace);
  for (let a = 0; a < faceKeys.length; a++) for (let b = a + 1; b < faceKeys.length; b++) {
    const pa = byFace[faceKeys[a]][0], pb = byFace[faceKeys[b]][0];
    console.log(`  ${faceKeys[a]} vs ${faceKeys[b]}: LBP L1=${lbpDist(pa, pb).toFixed(3)}, color dist=${colorDist(pa, pb).toFixed(1)}`);
  }
})();
