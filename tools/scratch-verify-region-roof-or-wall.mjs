// SCRATCH -- round 25, direct correction of an unverified claim in round 24
// ("die Region erfasst vermutlich nur das Dach" was stated with more
// confidence than it earned -- "es deutet darauf hin" is a guess, not a
// test). This actually tests it: the original color-mask extractor
// (scratch-village-extract-v2.mjs) knows the REAL roof/wallLight/wallDark
// pixel masks per house (ground truth, not inferred). Compares round 23/24's
// depth-edge+VP matched region for house4 directly against those real masks
// -- what fraction of the region's pixels are actually roof vs actually
// wall vs neither -- instead of guessing from planarity alone.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from '@huggingface/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const recon = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF, T, scale } = recon;
const familyAnglesDeg = dirF.map(([dx, dy]) => { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; });
function screenPoint(p3) { let x = 0, y = 0; for (let f = 0; f < 3; f++) { x += p3[f] * dirF[f][0]; y += p3[f] * dirF[f][1]; } return [x, y]; }
const groundTruthCentroids = Object.entries(T).map(([name, pos]) => {
  const sc = scale[name];
  const center = [pos[0] + 0.5 * sc[0], pos[1] + 0.5 * sc[1], pos[2] + 0.5 * sc[2]];
  return { name, screen: screenPoint(center) };
});

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

const result = await page.evaluate(async ({ rawDepth, W, H, familyAnglesDeg, groundTruthCentroids, imgDataUrl }) => {
  // --- Part A: reproduce the REAL color-mask roof/wallLight/wallDark
  // components, exactly as scratch-village-extract-v2.mjs does (verified,
  // ground-truth material classification, not inferred from depth). ---
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
  const srcCanvas = document.createElement('canvas'); srcCanvas.width = img.naturalWidth; srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d'); srcCtx.drawImage(img, 0, 0);
  const srcW = srcCanvas.width, srcH = srcCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const rgb = (x, y) => { const i = (y * srcW + x) * 4; return [srcData[i], srcData[i + 1], srcData[i + 2]]; };
  const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const MATERIALS = {
    roof: { color: [225, 126, 69], tol: 35 },
    wallLight: { color: [198, 166, 109], tol: 22 },
    wallDark: { color: [141, 125, 81], tol: 22 },
  };
  function labelComponents(matchFn) {
    const visited = new Uint8Array(srcW * srcH);
    const components = [];
    for (let y = 0; y < srcH; y++) for (let x = 0; x < srcW; x++) {
      const idx = y * srcW + x;
      if (visited[idx] || !matchFn(x, y)) continue;
      const stack = [[x, y]]; visited[idx] = 1;
      const pixels = [];
      let minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop(); pixels.push([cx, cy]);
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= srcW || ny >= srcH) continue;
          const nidx = ny * srcW + nx;
          if (visited[nidx] || !matchFn(nx, ny)) continue;
          visited[nidx] = 1; stack.push([nx, ny]);
        }
      }
      if (pixels.length >= 300) components.push({ pixels, bbox: [minX, minY, maxX, maxY], cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, count: pixels.length });
    }
    return components;
  }
  const materialComps = {};
  for (const [name, { color, tol }] of Object.entries(MATERIALS)) {
    materialComps[name] = labelComponents((x, y) => rgbDist(rgb(x, y), color) <= tol);
  }
  // house4 ground truth: which roof/wallLight/wallDark component belongs to it.
  const gt4 = groundTruthCentroids.find((g) => g.name === 'house4');
  function nearestComp(comps, [gx, gy]) {
    let best = null, bestD = Infinity;
    for (const c of comps) { const d = Math.hypot(c.cx - gx, c.cy - gy); if (d < bestD) { bestD = d; best = c; } }
    return best;
  }
  const realRoof = nearestComp(materialComps.roof, gt4.screen);
  const realWallLight = nearestComp(materialComps.wallLight, gt4.screen);
  const realWallDark = nearestComp(materialComps.wallDark, gt4.screen);
  const roofSet = new Set(realRoof.pixels.map(([x, y]) => x + ':' + y));
  const wallSet = new Set([...(realWallLight ? realWallLight.pixels : []), ...(realWallDark ? realWallDark.pixels : [])].map(([x, y]) => x + ':' + y));

  // --- Part B: round 23/24's depth-edge+VP matched region for house4 (same
  // method, unmodified). Depth map (W,H) is a DIFFERENT resolution than the
  // source image (srcW,srcH) -- need to map each depth-space region pixel
  // to source-image pixel space to compare against the real masks. ---
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
  const visited2 = new Uint8Array(W * H);
  const comps2 = [];
  const MIN_SIZE = Math.round(W * H * 0.0005);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (visited2[idx] || mask[idx]) continue;
    const stack = [[x, y]]; visited2[idx] = 1;
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
        if (visited2[nidx] || mask[nidx]) continue;
        visited2[nidx] = 1; stack.push([nx, ny]);
      }
    }
    if (pixels.length >= MIN_SIZE) comps2.push({ pixels, bbox: [minX, minY, maxX, maxY], count: pixels.length });
  }
  const [gx4, gy4] = gt4.screen;
  const region4 = comps2.slice(1).find((c) => gx4 >= c.bbox[0] && gx4 <= c.bbox[2] && gy4 >= c.bbox[1] && gy4 <= c.bbox[3]);
  if (!region4) return { error: 'house4 region not found this run' };

  // Map region4's depth-space pixels to source-image space and classify
  // each against the REAL roof/wall masks.
  let roofHits = 0, wallHits = 0, neitherHits = 0;
  for (const [dx, dy] of region4.pixels) {
    const sx = Math.round((dx / W) * srcW), sy = Math.round((dy / H) * srcH);
    const key = sx + ':' + sy;
    if (roofSet.has(key)) roofHits++;
    else if (wallSet.has(key)) wallHits++;
    else neitherHits++;
  }

  return {
    realRoofBbox: realRoof.bbox, realRoofCount: realRoof.count,
    realWallLightBbox: realWallLight ? realWallLight.bbox : null, realWallLightCount: realWallLight ? realWallLight.count : 0,
    realWallDarkBbox: realWallDark ? realWallDark.bbox : null, realWallDarkCount: realWallDark ? realWallDark.count : 0,
    region4Bbox: region4.bbox, region4Count: region4.pixels.length,
    classification: { roofHits, wallHits, neitherHits, total: region4.pixels.length },
  };
}, { rawDepth, W, H, familyAnglesDeg, groundTruthCentroids, imgDataUrl });

console.log('Real (ground-truth, color-mask) house4 parts:');
console.log(`  roof: bbox=${JSON.stringify(result.realRoofBbox)} size=${result.realRoofCount}px`);
console.log(`  wallLight: bbox=${JSON.stringify(result.realWallLightBbox)} size=${result.realWallLightCount}px`);
console.log(`  wallDark: bbox=${JSON.stringify(result.realWallDarkBbox)} size=${result.realWallDarkCount}px`);

console.log('\nDepth-edge+VP matched region for house4:');
console.log(`  bbox=${JSON.stringify(result.region4Bbox)} size=${result.region4Count}px (depth-map pixel space)`);

const c = result.classification;
console.log('\nClassification of the matched region\'s pixels against REAL roof/wall masks:');
console.log(`  roof pixels: ${c.roofHits} (${(100 * c.roofHits / c.total).toFixed(1)}%)`);
console.log(`  wall pixels: ${c.wallHits} (${(100 * c.wallHits / c.total).toFixed(1)}%)`);
console.log(`  neither (trim/gap/antialiasing/background): ${c.neitherHits} (${(100 * c.neitherHits / c.total).toFixed(1)}%)`);

await browser.close();
