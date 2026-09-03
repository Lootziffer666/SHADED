// SCRATCH -- round 19, completing the pipeline the maintainer originally
// proposed: depth edges (coarse, color-blind) -> VP gap-closing (round 18,
// 5/6 houses correctly separated) -> operators for FINE segmentation within
// those now-known boundaries (roof vs wall), rather than a separate
// synthetic point cloud like rounds 1-11 used. This runs LBP -- the
// strongest operator found earlier (73-74.5% pure with the frozen-anchor
// recipe) -- directly on 2D image pixels, restricted to one of the coarse
// depth+VP regions from round 18 (house4, matched robustly across every
// gapLength tested).
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF, T, scale } = recon;
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
function screenPoint(p3) { let x = 0, y = 0; for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; } return [x, y]; }
const house4Center = screenPoint([T.house4[0] + 0.5 * scale.house4[0], T.house4[1] + 0.5 * scale.house4[1], T.house4[2] + 0.5 * scale.house4[2]]);
console.log('house4 center (screen):', house4Center);

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [H, W] = pd.dims;
const rawDepth = Array.from(pd.data);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
await page.setContent('<canvas id=c></canvas>');

const result = await page.evaluate(async ({ rawDepth, W, H, familyAnglesDeg, house4Center, imgDataUrl }) => {
  // --- Step 1: reproduce round 18's coarse depth+VP segmentation to find
  // house4's pixel mask. ---
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return rawDepth[yi * W + xi]; }
  const gradMag = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    gradMag[y * W + x] = Math.hypot(gx, gy);
  }
  const sorted = Array.from(gradMag).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.90)];
  const baseMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) baseMask[i] = gradMag[i] > threshold ? 1 : 0;
  function directionalClose(mask, angleDeg, gapLength) {
    const rad = angleDeg * Math.PI / 180, ux = Math.cos(rad), uy = Math.sin(rad);
    const out = mask.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (let t = -gapLength; t <= gapLength; t++) {
        const nx = Math.round(x + ux * t), ny = Math.round(y + uy * t);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        out[ny * W + nx] = 1;
      }
    }
    return out;
  }
  let mask = baseMask;
  for (const angle of familyAnglesDeg) mask = directionalClose(mask, angle, 8);

  const visited = new Uint8Array(W * H);
  let house4Pixels = null;
  for (let y = 0; y < H && !house4Pixels; y++) {
    for (let x = 0; x < W && !house4Pixels; x++) {
      const idx = y * W + x;
      if (visited[idx] || mask[idx]) continue;
      const stack = [[x, y]]; visited[idx] = 1;
      const pixels = [];
      let minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop(); pixels.push([cx, cy]);
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nidx = ny * W + nx;
          if (visited[nidx] || mask[nidx]) continue;
          visited[nidx] = 1; stack.push([nx, ny]);
        }
      }
      const [gx, gy] = house4Center;
      if (pixels.length > 1000 && pixels.length < 500000 && gx >= minX && gx <= maxX && gy >= minY && gy <= maxY) {
        house4Pixels = { pixels, bbox: [minX, minY, maxX, maxY] };
      }
    }
  }
  if (!house4Pixels) return { error: 'house4 coarse region not found' };

  // --- Step 2: LBP-based fine segmentation restricted to house4's mask,
  // sampled on a coarse grid (every 3px) for speed, same frozen-anchor
  // recipe as rounds 6-11 (small geometry+color-free core since we're
  // already INSIDE a known single-object boundary -- just LBP+distance). ---
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
  const srcCanvas = document.createElement('canvas'); srcCanvas.width = img.naturalWidth; srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d'); srcCtx.drawImage(img, 0, 0);
  const srcW = srcCanvas.width, srcH = srcCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  function gray(x, y) { const xi = Math.max(0, Math.min(srcW - 1, x)), yi = Math.max(0, Math.min(srcH - 1, y)); const idx = (yi * srcW + xi) * 4; return 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2]; }
  function lbpHistogram(cx, cy) {
    const hist = new Array(256).fill(0); const half = 4; let n = 0;
    const neigh = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
    for (let dy = -half + 1; dy <= half - 1; dy++) for (let dx = -half + 1; dx <= half - 1; dx++) {
      const x = Math.round(cx) + dx, y = Math.round(cy) + dy; const c = gray(x, y); let code = 0;
      for (let b = 0; b < 8; b++) { const [nx, ny] = neigh[b]; if (gray(x + nx, y + ny) >= c) code |= (1 << b); }
      hist[code]++; n++;
    }
    for (let i = 0; i < 256; i++) hist[i] /= (n || 1);
    return hist;
  }

  // The depth map (1536x1024) is at a different resolution than the source
  // image (imgW/imgH from recon) -- house4Pixels are in DEPTH-map pixel
  // space; need the source-image coordinates to sample real LBP texture.
  // Depth map dims == W,H here; source image dims == srcW,srcH.
  // Real uniform SPATIAL grid within house4's mask, not index-based
  // subsampling of the DFS-ordered pixel list (which produced spatially
  // uneven gaps and 755 spurious fragments on the first attempt).
  // GRID=3 (near-pixel spacing) fragmented into 743 sub-components -- LBP is
  // noise-sensitive at that fine a scale (earlier successful rounds, on the
  // synthetic 3D point cloud, sampled at tens-of-pixels spacing, not 3px).
  // Widen the grid to operate at a comparable, less noise-sensitive scale.
  const GRID = 14;
  const inMask = new Set(house4Pixels.pixels.map(([x, y]) => x + ':' + y));
  const [bx0, by0, bx1, by1] = house4Pixels.bbox;
  const samplePts = [];
  for (let y = by0; y <= by1; y += GRID) for (let x = bx0; x <= bx1; x += GRID) { if (inMask.has(x + ':' + y)) samplePts.push([x, y]); }
  const points = samplePts.map(([dx, dy]) => {
    const sx = Math.round((dx / W) * srcW), sy = Math.round((dy / H) * srcH);
    const c = { idx: (Math.round(sy) * srcW + Math.round(sx)) * 4 };
    return { x: dx, y: dy, sx, sy, lbp: lbpHistogram(sx, sy), r: srcData[c.idx], g: srcData[c.idx + 1], b: srcData[c.idx + 2] };
  });
  console.log(`Sampled ${points.length} points within house4's coarse mask.`);

  function histL1(a, b) { let s = 0; for (let i = 0; i < 256; i++) s += Math.abs(a[i] - b[i]); return s; }

  // Threshold calibrated from THIS point sample's own random-pair
  // distribution -- reusing 0.9 (calibrated in an earlier round on a
  // completely different sampling scale, the synthetic 3D point cloud) was
  // the actual bug behind the 743/41-component fragmentation, not a real
  // LBP failure. Same anti-overfit discipline every earlier round followed.
  const randomDists = [];
  for (let i = 0; i < Math.min(2000, points.length * points.length); i++) {
    const a = points[Math.floor(Math.random() * points.length)], b = points[Math.floor(Math.random() * points.length)];
    randomDists.push(histL1(a.lbp, b.lbp));
  }
  randomDists.sort((x, y) => x - y);
  const p10 = randomDists[Math.floor(randomDists.length * 0.1)];
  const p50 = randomDists[Math.floor(randomDists.length * 0.5)];
  console.log(`Random-pair LBP distance within house4: p10=${p10.toFixed(3)} p50=${p50.toFixed(3)}`);
  const TEXTURE_THRESHOLD = randomDists[Math.floor(randomDists.length * 0.4)];
  function buildBuckets(pts, cell) { const m = new Map(); for (let i = 0; i < pts.length; i++) { const p = pts[i]; const k = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell); if (!m.has(k)) m.set(k, []); m.get(k).push(i); } return m; }
  const CELL = GRID * 3;
  const buckets = buildBuckets(points, CELL);
  const n = points.length;
  const visited2 = new Uint8Array(n);
  const comps = [];
  for (let seed = 0; seed < n; seed++) {
    if (visited2[seed]) continue;
    const comp = [seed]; visited2[seed] = 1;
    let frozen = null, sum = points[seed].lbp.slice(), cnt = 1;
    const queue = [seed];
    while (queue.length) {
      const cur = queue.pop();
      const p = points[cur];
      const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
      for (let dyi = -1; dyi <= 1; dyi++) for (let dxi = -1; dxi <= 1; dxi++) {
        const arr = buckets.get((cx + dxi) + ':' + (cy + dyi));
        if (!arr) continue;
        for (const next of arr) {
          if (visited2[next]) continue;
          const q = points[next];
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d > CELL * 1.8) continue;
          if (frozen && histL1(frozen, q.lbp) > TEXTURE_THRESHOLD) continue;
          visited2[next] = 1; queue.push(next); comp.push(next);
          if (!frozen && cnt < 5) { for (let i = 0; i < 256; i++) sum[i] += q.lbp[i]; cnt++; if (cnt >= 5) frozen = sum.map((v) => v / cnt); }
        }
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  return {
    house4Bbox: house4Pixels.bbox,
    totalPoints: n,
    nComponents: comps.length,
    top: comps.slice(0, 8).map((c) => {
      const idxs = c;
      const meanColor = idxs.reduce((s, i) => [s[0] + points[i].r, s[1] + points[i].g, s[2] + points[i].b], [0, 0, 0]).map((v) => Math.round(v / idxs.length));
      const xs = idxs.map((i) => points[i].x), ys = idxs.map((i) => points[i].y);
      return { size: idxs.length, meanColor, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    }),
  };
}, { rawDepth, W, H, familyAnglesDeg, house4Center, imgDataUrl });

console.log('\nhouse4 coarse bbox (depth-map space):', JSON.stringify(result.house4Bbox));
console.log(`Sampled ${result.totalPoints} points, LBP fine-segmentation found ${result.nComponents} sub-components.`);
console.log('\nTop sub-components (should ideally be ~2-3: roof, wallLight, wallDark):');
for (const c of result.top) console.log(`  size=${c.size} color=rgb(${c.meanColor.join(',')}) bbox=${JSON.stringify(c.bbox)}`);
await browser.close();
