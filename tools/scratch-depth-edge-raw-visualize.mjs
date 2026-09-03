// SCRATCH -- round 17 fix: the previous depth-edge attempt used the
// DISPLAY-quantized depth.data (0-255, 8-bit), which produced dense
// quantization-banding noise across smooth gradients (visible as fine
// parallel-line texture over the whole ground plane in
// depth-edge-visual-diagnostic.png) -- comparable per-pixel gradient
// magnitude to the real house-silhouette edges, defeating a simple
// threshold. This uses the RAW, unquantized predicted_depth float tensor
// instead (confirmed via scratch-depth-edge-raw-check.mjs: continuous
// Float32Array, range ~0.46-8.45, no 256-level rounding).
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [H, W] = pd.dims;
const rawDepth = Array.from(pd.data);
let rdMin = Infinity, rdMax = -Infinity;
for (const v of rawDepth) { if (v < rdMin) rdMin = v; if (v > rdMax) rdMax = v; }
console.log(`Raw depth tensor: ${W}x${H}, range ${rdMin.toFixed(3)}-${rdMax.toFixed(3)}`);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

const result = await page.evaluate(({ rawDepth, W, H }) => {
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return rawDepth[yi * W + xi]; }
  const gradMag = new Float32Array(W * H);
  let maxGrad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    const m = Math.hypot(gx, gy);
    gradMag[y * W + x] = m; if (m > maxGrad) maxGrad = m;
  }
  const sorted = Array.from(gradMag).sort((a, b) => a - b);

  function buildEdgeMask(percentile, dilateRadius) {
    const threshold = sorted[Math.floor(sorted.length * percentile)];
    let mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = gradMag[i] > threshold ? 1 : 0;
    for (let r = 0; r < dilateRadius; r++) {
      const next = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (mask[idx]) { next[idx] = 1; continue; }
        let hit = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (mask[ny * W + nx]) { hit = 1; break; }
        }
        next[idx] = hit;
      }
      mask = next;
    }
    return { mask, threshold };
  }
  function coarseComponents(isEdge, returnPixels) {
    const visited = new Uint8Array(W * H);
    const comps = [];
    const MIN_SIZE = Math.round(W * H * 0.0005);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx] || isEdge[idx]) continue;
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
          if (visited[nidx] || isEdge[nidx]) continue;
          visited[nidx] = 1; stack.push([nx, ny]);
        }
      }
      if (pixels.length >= MIN_SIZE) comps.push({ pixels: returnPixels ? pixels : null, bbox: [minX, minY, maxX, maxY], count: pixels.length });
    }
    return comps.sort((a, b) => b.count - a.count);
  }

  const sweep = [];
  for (const percentile of [0.85, 0.90, 0.93, 0.96, 0.98]) {
    for (const dilate of [0, 1, 2]) {
      const { mask, threshold } = buildEdgeMask(percentile, dilate);
      const comps = coarseComponents(mask, false);
      const largestFrac = comps.length ? comps[0].count / (W * H) : 0;
      sweep.push({ percentile, dilate, threshold, nComponents: comps.length, largestFrac, top8: comps.slice(0, 8).map((c) => ({ bbox: c.bbox, size: c.count })) });
    }
  }

  // Render diagnostic visuals for the raw-depth version.
  const { mask: bestMask } = buildEdgeMask(0.90, 1);
  const bestComps = coarseComponents(bestMask, true);
  const outCanvas = document.createElement('canvas'); outCanvas.width = W * 2; outCanvas.height = H;
  const outCtx = outCanvas.getContext('2d');
  const p1 = document.createElement('canvas'); p1.width = W; p1.height = H;
  const c1 = p1.getContext('2d'); const id1 = c1.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = Math.min(255, Math.round(255 * Math.log(1 + gradMag[i]) / Math.log(1 + maxGrad))); id1.data[i * 4] = v; id1.data[i * 4 + 1] = v; id1.data[i * 4 + 2] = v; id1.data[i * 4 + 3] = 255; }
  c1.putImageData(id1, 0, 0);
  outCtx.drawImage(p1, 0, 0);
  const p2 = document.createElement('canvas'); p2.width = W; p2.height = H;
  const c2 = p2.getContext('2d'); c2.fillStyle = '#000'; c2.fillRect(0, 0, W, H);
  const id2 = c2.getImageData(0, 0, W, H);
  bestComps.forEach((comp, ci) => {
    const hue = (ci * 61) % 360;
    const r = Math.round(127 + 127 * Math.sin(hue * Math.PI / 180));
    const g = Math.round(127 + 127 * Math.sin((hue + 120) * Math.PI / 180));
    const b = Math.round(127 + 127 * Math.sin((hue + 240) * Math.PI / 180));
    for (const [x, y] of comp.pixels) { const idx = (y * W + x) * 4; id2.data[idx] = r; id2.data[idx + 1] = g; id2.data[idx + 2] = b; id2.data[idx + 3] = 255; }
  });
  c2.putImageData(id2, 0, 0);
  outCtx.drawImage(p2, W, 0);
  outCtx.fillStyle = '#0f0'; outCtx.font = '20px sans-serif';
  outCtx.fillText('raw-depth gradient (log)', 8, 24);
  outCtx.fillText(`raw-depth coarse components p90/dilate=1 (${bestComps.length})`, W + 8, 24);

  return { sweep, bestComponentBboxes: bestComps.slice(0, 20).map((c) => ({ bbox: c.bbox, size: c.count })), png: outCanvas.toDataURL('image/png') };
}, { rawDepth, W, H });

console.log('\n=== Raw-depth threshold/dilation sweep ===');
for (const s of result.sweep) {
  console.log(`  p${(s.percentile * 100).toFixed(0)} dilate=${s.dilate}: threshold=${s.threshold.toFixed(4)} nComponents=${s.nComponents} largestFrac=${(s.largestFrac * 100).toFixed(1)}%`);
}
console.log('\nBest-view (p90/dilate=1) coarse components:');
for (const c of result.bestComponentBboxes) console.log(`  bbox=${JSON.stringify(c.bbox)} size=${c.size}`);

const b64 = result.png.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync(path.join(OUT, 'depth-edge-raw-diagnostic.png'), Buffer.from(b64, 'base64'));
console.log('\nWrote depth-edge-raw-diagnostic.png');
await browser.close();
