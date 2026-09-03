// SCRATCH -- visual diagnostic companion to scratch-depth-edge-pipeline.mjs.
// Renders the raw Sobel gradient-magnitude map (independent of any
// threshold choice) plus the best sweep result's coarse components, colored,
// so the depth-edge segmentation's actual behavior can be checked by eye
// instead of only by component counts.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const { depth } = await depthEstimator(IMG);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

const pngDataUrl = await page.evaluate(({ depthValues, W, H }) => {
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return depthValues[yi * W + xi]; }
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
    return mask;
  }
  function coarseComponents(isEdge) {
    const visited = new Uint8Array(W * H);
    const comps = [];
    const MIN_SIZE = Math.round(W * H * 0.0005);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx] || isEdge[idx]) continue;
      const stack = [[x, y]]; visited[idx] = 1;
      const pixels = [];
      while (stack.length) {
        const [cx, cy] = stack.pop(); pixels.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nidx = ny * W + nx;
          if (visited[nidx] || isEdge[nidx]) continue;
          visited[nidx] = 1; stack.push([nx, ny]);
        }
      }
      if (pixels.length >= MIN_SIZE) comps.push(pixels);
    }
    return comps.sort((a, b) => b.length - a.length);
  }

  const outCanvas = document.createElement('canvas'); outCanvas.width = W * 2; outCanvas.height = H * 2;
  const outCtx = outCanvas.getContext('2d');

  // Panel 1: raw gradient magnitude, log-scaled for visibility.
  const p1 = document.createElement('canvas'); p1.width = W; p1.height = H;
  const c1 = p1.getContext('2d'); const id1 = c1.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(255, Math.round(255 * Math.log(1 + gradMag[i]) / Math.log(1 + maxGrad)));
    id1.data[i * 4] = v; id1.data[i * 4 + 1] = v; id1.data[i * 4 + 2] = v; id1.data[i * 4 + 3] = 255;
  }
  c1.putImageData(id1, 0, 0);
  outCtx.drawImage(p1, 0, 0);

  // Panel 2: p85/dilate=0 edge mask (white=edge).
  const mask2 = buildEdgeMask(0.85, 0);
  const p2 = document.createElement('canvas'); p2.width = W; p2.height = H;
  const c2 = p2.getContext('2d'); const id2 = c2.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = mask2[i] ? 255 : 0; id2.data[i * 4] = v; id2.data[i * 4 + 1] = v; id2.data[i * 4 + 2] = v; id2.data[i * 4 + 3] = 255; }
  c2.putImageData(id2, 0, 0);
  outCtx.drawImage(p2, W, 0);

  // Panel 3: best sweep point (p85/dilate=3) edge mask.
  const mask3 = buildEdgeMask(0.85, 3);
  const p3 = document.createElement('canvas'); p3.width = W; p3.height = H;
  const c3 = p3.getContext('2d'); const id3 = c3.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = mask3[i] ? 255 : 0; id3.data[i * 4] = v; id3.data[i * 4 + 1] = v; id3.data[i * 4 + 2] = v; id3.data[i * 4 + 3] = 255; }
  c3.putImageData(id3, 0, 0);
  outCtx.drawImage(p3, 0, H);

  // Panel 4: coarse components (p85/dilate=3), each a random color.
  const comps4 = coarseComponents(mask3);
  const p4 = document.createElement('canvas'); p4.width = W; p4.height = H;
  const c4 = p4.getContext('2d'); c4.fillStyle = '#000'; c4.fillRect(0, 0, W, H);
  const id4 = c4.getImageData(0, 0, W, H);
  comps4.forEach((pixels, ci) => {
    const hue = (ci * 47) % 360;
    const r = Math.round(127 + 127 * Math.sin(hue * Math.PI / 180));
    const g = Math.round(127 + 127 * Math.sin((hue + 120) * Math.PI / 180));
    const b = Math.round(127 + 127 * Math.sin((hue + 240) * Math.PI / 180));
    for (const [x, y] of pixels) { const idx = (y * W + x) * 4; id4.data[idx] = r; id4.data[idx + 1] = g; id4.data[idx + 2] = b; id4.data[idx + 3] = 255; }
  });
  c4.putImageData(id4, 0, 0);
  outCtx.drawImage(p4, W, H);

  outCtx.fillStyle = '#0f0'; outCtx.font = '20px sans-serif';
  outCtx.fillText('1: raw gradient (log)', 8, 24);
  outCtx.fillText('2: edge mask p85/dilate=0', W + 8, 24);
  outCtx.fillText('3: edge mask p85/dilate=3', 8, H + 24);
  outCtx.fillText(`4: coarse components (${comps4.length})`, W + 8, H + 24);

  return outCanvas.toDataURL('image/png');
}, { depthValues: Array.from(depth.data), W: depth.width, H: depth.height });

const b64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync(path.join(OUT, 'depth-edge-visual-diagnostic.png'), Buffer.from(b64, 'base64'));
console.log('Wrote depth-edge-visual-diagnostic.png');
await browser.close();
