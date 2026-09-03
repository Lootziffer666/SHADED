// SCRATCH -- round 21: compares SHADED's OWN depth estimate
// (file_0000000098bc71f49c057d54182386e6.png, confirmed by the maintainer
// to be a SHADED-generated depth map, not external ground truth) against
// DA2 (onnx-community/depth-anything-v2-small), both run through the same
// depth-edge coarse segmentation from rounds 17-18, on the painted gable
// village fixture (file_00000000c40471f4859a10d6bf3ac39b.png). Not "which
// is truth" -- neither is -- but "which gives the depth-edge pipeline more
// usable coarse boundaries for the SAME downstream purpose."
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_00000000c40471f4859a10d6bf3ac39b.png');
const SHADED_DEPTH_IMG = path.join(__dirname, '..', 'file_0000000098bc71f49c057d54182386e6.png');

console.log('Running DA2 on the painted gable village...');
const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [daH, daW] = pd.dims;
const da2Raw = Array.from(pd.data);
console.log(`DA2 depth: ${daW}x${daH}`);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const shadedDepthDataUrl = 'data:image/png;base64,' + fs.readFileSync(SHADED_DEPTH_IMG).toString('base64');

const result = await page.evaluate(async ({ da2Raw, daW, daH, shadedDepthDataUrl }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = shadedDepthDataUrl; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const sW = c.width, sH = c.height;
  const sData = ctx.getImageData(0, 0, sW, sH).data;
  const shadedDepth = new Float32Array(sW * sH);
  for (let i = 0; i < sW * sH; i++) shadedDepth[i] = sData[i * 4]; // grayscale, R channel

  function gradientAndComponents(depthArr, W, H, label) {
    function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return depthArr[yi * W + xi]; }
    const gradMag = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      gradMag[y * W + x] = Math.hypot(gx, gy);
    }
    const sorted = Array.from(gradMag).sort((a, b) => a - b);
    const results = [];
    for (const p of [0.85, 0.90, 0.93]) {
      const threshold = sorted[Math.floor(sorted.length * p)];
      const mask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) mask[i] = gradMag[i] > threshold ? 1 : 0;
      const visited = new Uint8Array(W * H);
      const comps = [];
      const MIN_SIZE = Math.round(W * H * 0.0005);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx] || mask[idx]) continue;
        const stack = [[x, y]]; visited[idx] = 1;
        let count = 0;
        while (stack.length) {
          const [cx, cy] = stack.pop(); count++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nidx = ny * W + nx;
            if (visited[nidx] || mask[nidx]) continue;
            visited[nidx] = 1; stack.push([nx, ny]);
          }
        }
        if (count >= MIN_SIZE) comps.push(count);
      }
      comps.sort((a, b) => b - a);
      results.push({ percentile: p, nComponents: comps.length, largestFrac: comps.length ? comps[0] / (W * H) : 0 });
    }
    return results;
  }

  const shadedResults = gradientAndComponents(shadedDepth, sW, sH, 'shaded');
  const da2Results = gradientAndComponents(da2Raw, daW, daH, 'da2');

  return { shadedDims: [sW, sH], da2Dims: [daW, daH], shadedResults, da2Results };
}, { da2Raw, daW, daH, shadedDepthDataUrl });

console.log(`\nSHADED depth map dims: ${result.shadedDims.join('x')}`);
console.log('SHADED-depth edge segmentation:');
for (const r of result.shadedResults) console.log(`  p${(r.percentile * 100).toFixed(0)}: nComponents=${r.nComponents} largestFrac=${(r.largestFrac * 100).toFixed(1)}%`);

console.log(`\nDA2 depth map dims: ${result.da2Dims.join('x')}`);
console.log('DA2-depth edge segmentation:');
for (const r of result.da2Results) console.log(`  p${(r.percentile * 100).toFixed(0)}: nComponents=${r.nComponents} largestFrac=${(r.largestFrac * 100).toFixed(1)}%`);

// Visual check: colored components (p90) from each depth source, overlaid
// on the source image, side by side.
const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
const vizDataUrl = await page.evaluate(async ({ da2Raw, daW, daH, shadedDepthDataUrl, imgDataUrl }) => {
  const shadedImg = new Image();
  await new Promise((res, rej) => { shadedImg.onload = res; shadedImg.onerror = rej; shadedImg.src = shadedDepthDataUrl; });
  const sc = document.createElement('canvas'); sc.width = shadedImg.naturalWidth; sc.height = shadedImg.naturalHeight;
  const sctx = sc.getContext('2d'); sctx.drawImage(shadedImg, 0, 0);
  const sW = sc.width, sH = sc.height;
  const sData = sctx.getImageData(0, 0, sW, sH).data;
  const shadedDepth = new Float32Array(sW * sH);
  for (let i = 0; i < sW * sH; i++) shadedDepth[i] = sData[i * 4];

  const srcImg = new Image();
  await new Promise((res, rej) => { srcImg.onload = res; srcImg.onerror = rej; srcImg.src = imgDataUrl; });

  function componentsFor(depthArr, W, H, percentile) {
    function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return depthArr[yi * W + xi]; }
    const gradMag = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      gradMag[y * W + x] = Math.hypot(gx, gy);
    }
    const sorted = Array.from(gradMag).sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * percentile)];
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = gradMag[i] > threshold ? 1 : 0;
    const visited = new Uint8Array(W * H);
    const comps = [];
    const MIN_SIZE = Math.round(W * H * 0.0005);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx] || mask[idx]) continue;
      const stack = [[x, y]]; visited[idx] = 1;
      const pixels = [];
      while (stack.length) {
        const [cx, cy] = stack.pop(); pixels.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nidx = ny * W + nx;
          if (visited[nidx] || mask[nidx]) continue;
          visited[nidx] = 1; stack.push([nx, ny]);
        }
      }
      if (pixels.length >= MIN_SIZE) comps.push(pixels);
    }
    return comps.sort((a, b) => b.length - a.length);
  }

  function renderPanel(comps, W, H, srcImg) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(srcImg, 0, 0, W, H);
    const id = ctx.getImageData(0, 0, W, H);
    comps.slice(1, 15).forEach((pixels, ci) => {
      const hue = (ci * 61) % 360;
      const r = Math.round(127 + 127 * Math.sin(hue * Math.PI / 180));
      const g = Math.round(127 + 127 * Math.sin((hue + 120) * Math.PI / 180));
      const b = Math.round(127 + 127 * Math.sin((hue + 240) * Math.PI / 180));
      for (const [x, y] of pixels) { const idx = (y * W + x) * 4; id.data[idx] = Math.round(id.data[idx] * 0.3 + r * 0.7); id.data[idx + 1] = Math.round(id.data[idx + 1] * 0.3 + g * 0.7); id.data[idx + 2] = Math.round(id.data[idx + 2] * 0.3 + b * 0.7); }
    });
    ctx.putImageData(id, 0, 0);
    return canvas;
  }

  const shadedComps = componentsFor(shadedDepth, sW, sH, 0.90);
  const da2Comps = componentsFor(da2Raw, daW, daH, 0.90);
  const p1 = renderPanel(shadedComps, sW, sH, srcImg);
  const p2 = renderPanel(da2Comps, daW, daH, srcImg);

  const out = document.createElement('canvas'); out.width = sW + daW; out.height = Math.max(sH, daH);
  const octx = out.getContext('2d');
  octx.drawImage(p1, 0, 0); octx.drawImage(p2, sW, 0);
  octx.fillStyle = '#0f0'; octx.font = '24px sans-serif';
  octx.fillText('SHADED depth (own)', 10, 30);
  octx.fillText('DA2 depth', sW + 10, 30);
  return out.toDataURL('image/png');
}, { da2Raw, daW, daH, shadedDepthDataUrl, imgDataUrl });

const b64v = vizDataUrl.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync(path.join(OUT, 'shaded-vs-da2-depth-components.png'), Buffer.from(b64v, 'base64'));
console.log('\nWrote shaded-vs-da2-depth-components.png');

await browser.close();
