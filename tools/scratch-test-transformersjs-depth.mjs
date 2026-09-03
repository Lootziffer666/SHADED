// SCRATCH -- real feasibility test: does @huggingface/transformers (pure
// JS/ONNX, CPU/WASM backend, no CUDA/torch needed) actually run Depth
// Anything V2 inference in THIS environment, on a real repo image? Not a
// claim, a measurement -- reports success/failure and real timing, and
// renders the actual depth map to PNG so the output can be visually
// inspected, not just trusted by shape/dtype.
import { pipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');

console.log('Loading depth-estimation pipeline (onnx-community/depth-anything-v2-small)...');
const t0 = Date.now();
const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const loadMs = Date.now() - t0;
console.log(`Pipeline loaded in ${loadMs}ms.`);

const imgPath = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
console.log(`Running inference on ${imgPath}...`);
const t1 = Date.now();
const output = await depthEstimator(imgPath);
const inferMs = Date.now() - t1;
console.log(`Inference completed in ${inferMs}ms.`);

const { depth } = output;
console.log('Depth map:', depth.width, 'x', depth.height, 'channels:', depth.channels);
const raw = depth.data; // Uint8ClampedArray or similar, single channel, already normalized to 0-255 by the pipeline
let min = Infinity, max = -Infinity;
for (let i = 0; i < raw.length; i++) { if (raw[i] < min) min = raw[i]; if (raw[i] > max) max = raw[i]; }
console.log('Depth value range:', min, '-', max);

// Render to a real PNG via a headless canvas (Playwright, consistent with
// every other visualization this session produced) so it can be inspected
// visually, not just trusted by shape/dtype/range.
import { chromium } from 'playwright';
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');
const pngDataUrl = await page.evaluate(({ w, h, values }) => {
  const c = document.getElementById('c'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const imgData = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = values[i];
    imgData.data[i * 4] = v; imgData.data[i * 4 + 1] = v; imgData.data[i * 4 + 2] = v; imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL('image/png');
}, { w: depth.width, h: depth.height, values: Array.from(raw) });
await browser.close();

const b64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
const outPath = path.join(OUT, 'transformersjs-depth-anything-v2-real-output.png');
fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
console.log('Wrote', outPath);
console.log(`\nSUCCESS: real Depth Anything V2 Small inference ran in this environment via transformers.js. Load ${loadMs}ms, infer ${inferMs}ms, CPU/WASM, no CUDA/torch.`);
