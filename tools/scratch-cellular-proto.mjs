// SCRATCH prototype driver — NOT part of the verify suite, NOT meant to be
// committed. Loads a real existing depth map, downsamples it to a 256x256
// height field, runs CellularGeometrySolver on it, and writes before/after
// PNGs + fieldStats() to tools/verify-out/ for visual + numeric inspection.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createHeightField, seedAgents, runCellularGeometry, fieldStats,
} from '../runtime/spatial-kernel/cellular-geometry-solver.js';
import { mulberry32 } from '../runtime/spatial-kernel/world-fields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const DEPTH_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579_depth.png');
const SIZE = 256;

(async () => {
  const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();

  // Decode + downsample the depth PNG to a 256x256 grayscale 0..1 array via
  // the browser's own canvas (matches the repo's established Playwright
  // convention for image decoding, no hand-written PNG parser).
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(DEPTH_IMG).toString('base64');
  const gray = await page.evaluate(async ({ dataUrl, size }) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const out = new Array(size * size);
    for (let i = 0; i < out.length; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return out;
  }, { dataUrl, size: SIZE });

  const fieldToPngDataUrl = (values) => page.evaluate(({ values, size }) => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    for (let i = 0; i < values.length; i++) {
      const v = Math.max(0, Math.min(1, values[i]));
      const g = Math.round(v * 255);
      imgData.data[i * 4] = g; imgData.data[i * 4 + 1] = g; imgData.data[i * 4 + 2] = g; imgData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return c.toDataURL('image/png');
  }, { values: Array.from(values), size: SIZE });

  const writeDataUrl = (dataUrl, file) => {
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, 'base64'));
  };

  const before = createHeightField(SIZE, SIZE, gray);
  const beforeStats = fieldStats(before);
  writeDataUrl(await fieldToPngDataUrl(before.values), 'cellular-proto-before.png');

  const after = { width: SIZE, height: SIZE, values: Float32Array.from(before.values) };
  const seed = 20260830;
  const agents = seedAgents(after, 120, mulberry32(seed ^ 0x51ed270b));
  runCellularGeometry(after, agents, seed, 400);
  const afterStats = fieldStats(after);
  writeDataUrl(await fieldToPngDataUrl(after.values), 'cellular-proto-after.png');

  console.log('BEFORE', beforeStats);
  console.log('AFTER ', afterStats);
  console.log('edgeEnergy delta:', afterStats.edgeEnergy - beforeStats.edgeEnergy);
  console.log('variance delta:', afterStats.variance - beforeStats.variance);

  await browser.close();
})();
