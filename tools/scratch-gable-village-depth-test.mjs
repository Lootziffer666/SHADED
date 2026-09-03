// SCRATCH -- round 20: tests the depth-edge + VP-gap-closing pipeline
// (rounds 17-18, which recovered 5/6 houses on VLG-02) on a genuinely
// different, more structurally complex fixture: an isometric village with
// real gable roofs (ridge line + triangular gable face), not the flat
// hexagon-box topology VLG-02 uses. file_000000002b2871f4891c9f18768440ca.png.
//
// Unlike round 13's mistake (importing VLG-02's fixed color values), this
// stays fully color-blind and VP-value-blind: NO affine reconstruction
// exists yet for this new image (that would require its own extraction --
// out of scope here), so this uses only DA2 depth edges plus a GENERIC
// isometric assumption (3 direction families ~60deg apart, the same
// topological signature this whole session has used) rather than a
// per-image-fitted dirF. This is honestly a weaker test than rounds 17-18
// (no fitted VP, just the generic isometric angle assumption) -- reported
// as such.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000002b2871f4891c9f18768440ca.png');

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
const pd = output.predicted_depth;
const [H, W] = pd.dims;
const rawDepth = Array.from(pd.data);
console.log(`Depth map: ${W}x${H}`);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

const result = await page.evaluate(({ rawDepth, W, H }) => {
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return rawDepth[yi * W + xi]; }
  const gradMag = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    gradMag[y * W + x] = Math.hypot(gx, gy);
  }
  const sorted = Array.from(gradMag).sort((a, b) => a - b);

  function buildEdgeMask(percentile) {
    const threshold = sorted[Math.floor(sorted.length * percentile)];
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = gradMag[i] > threshold ? 1 : 0;
    return mask;
  }
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
  function coarseComponents(isEdge) {
    const visited = new Uint8Array(W * H);
    const comps = [];
    const MIN_SIZE = Math.round(W * H * 0.0005);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx] || isEdge[idx]) continue;
      const stack = [[x, y]]; visited[idx] = 1;
      let count = 0, minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop(); count++;
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
      if (count >= MIN_SIZE) comps.push({ bbox: [minX, minY, maxX, maxY], count });
    }
    return comps.sort((a, b) => b.count - a.count);
  }

  // Generic isometric-triad assumption (0deg, 60deg, 120deg) -- no per-image
  // VP fit exists for this new fixture, unlike VLG-02's dirF (measured from
  // real silhouette vertices). Weaker, honestly, than rounds 17-18.
  const genericAngles = [0, 60, 120];
  const baseMask = buildEdgeMask(0.90);
  let closedMask = baseMask;
  for (const angle of genericAngles) closedMask = directionalClose(closedMask, angle, 12);

  const baselineComps = coarseComponents(baseMask);
  const closedComps = coarseComponents(closedMask);

  return {
    baseline: { n: baselineComps.length, largestFrac: baselineComps[0].count / (W * H), top: baselineComps.slice(0, 10).map((c) => c.bbox) },
    closed: { n: closedComps.length, largestFrac: closedComps[0].count / (W * H), top: closedComps.slice(0, 10).map((c) => c.bbox) },
  };
}, { rawDepth, W, H });

console.log('\n=== Baseline (raw depth edges, p90, no gap-closing) ===');
console.log(`nComponents=${result.baseline.n} largestFrac=${(result.baseline.largestFrac * 100).toFixed(1)}%`);
console.log(result.baseline.top.map((b) => JSON.stringify(b)).join('\n'));

console.log('\n=== Gap-closed (generic isometric 0/60/120deg, gapLength=12) ===');
console.log(`nComponents=${result.closed.n} largestFrac=${(result.closed.largestFrac * 100).toFixed(1)}%`);
console.log(result.closed.top.map((b) => JSON.stringify(b)).join('\n'));

// Visual diagnostic: colored coarse components after gap-closing, overlaid
// on the source image at 50% alpha so real house alignment can be checked.
const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
const vizDataUrl = await page.evaluate(async ({ rawDepth, W, H, imgDataUrl }) => {
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
  for (const angle of [0, 60, 120]) mask = directionalClose(mask, angle, 12);

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
  comps.sort((a, b) => b.length - a.length);

  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const id = ctx.getImageData(0, 0, W, H);
  comps.slice(1, 15).forEach((pixels, ci) => { // skip [0] = ground
    const hue = (ci * 61) % 360;
    const r = Math.round(127 + 127 * Math.sin(hue * Math.PI / 180));
    const g = Math.round(127 + 127 * Math.sin((hue + 120) * Math.PI / 180));
    const b = Math.round(127 + 127 * Math.sin((hue + 240) * Math.PI / 180));
    for (const [x, y] of pixels) { const idx = (y * W + x) * 4; id.data[idx] = Math.round(id.data[idx] * 0.3 + r * 0.7); id.data[idx + 1] = Math.round(id.data[idx + 1] * 0.3 + g * 0.7); id.data[idx + 2] = Math.round(id.data[idx + 2] * 0.3 + b * 0.7); }
  });
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL('image/png');
}, { rawDepth, W, H, imgDataUrl });

const b64 = vizDataUrl.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync(path.join(OUT, 'gable-village-depth-components.png'), Buffer.from(b64, 'base64'));
console.log('\nWrote gable-village-depth-components.png');

await browser.close();
