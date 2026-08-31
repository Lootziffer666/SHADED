// SCRATCH follow-up prototype #3 — NOT part of the verify suite, NOT meant to
// be committed. Tests the gated/kernel-stamp fix: movement is pure search
// (writes nothing), GROW/ERODE deposit only at a qualifying local relief
// extremum, SMOOTH only acts where local roughness exceeds a threshold, and
// every action is a small radial kernel stamp instead of a per-step
// single-pixel write. Same barriers, residual-only architecture, seed.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createHeightField, seedAgents, runGatedKernelCellularGeometry,
  computeEditWeight, fieldStats, protectionLeakage, editableActivity,
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

  const grayToPngDataUrl = (values) => page.evaluate(({ values, size }) => {
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

  const base = createHeightField(SIZE, SIZE, gray);
  const baseStats = fieldStats(base);
  writeDataUrl(await grayToPngDataUrl(base.values), 'cellular-gated-base.png');

  const edgeProtection = { edgeScale: 0.12, gamma: 1.5, minWeight: 0.03 };
  const editWeightPreview = computeEditWeight(base, edgeProtection);
  writeDataUrl(await grayToPngDataUrl(editWeightPreview), 'cellular-gated-editweight.png');

  const seed = 20260830;
  const agents = seedAgents(base, 120, mulberry32(seed ^ 0x51ed270b));
  const runOpts = {
    growRate: 0.05, erodeRate: 0.05, smoothFactor: 0.3, randomness: 0.05,
    maxResidual: 0.15, barrierWeight: 0.15, maxCrossJump: 0.05, blurRadius: 10,
    // Tolerance/threshold grounded in the actual relief/roughness distribution
    // of the base field (see scratch-cellular-diagnostic.mjs output): the
    // first attempt (radius=1, tolerance=0.01) qualified ~75%+ of all cells
    // immediately, which is why it produced a stippled field, not sparse
    // patches. radius=3 + tolerance=0.0022 targets roughly the most extreme 5%.
    extremumRadius: 3, extremumTolerance: 0.0022, kernelRadius: 1,
    roughnessRadius: 1, roughnessThreshold: 0.0008,
    edgeProtection,
  };
  const { residual, output, editWeight } = runGatedKernelCellularGeometry(base, agents, seed, 400, runOpts);
  const outputStats = fieldStats({ width: SIZE, height: SIZE, values: output });
  writeDataUrl(await grayToPngDataUrl(output), 'cellular-gated-output.png');

  const residualVis = new Float32Array(residual.length);
  for (let i = 0; i < residual.length; i++) residualVis[i] = 0.5 + residual[i] * (0.5 / 0.15);
  writeDataUrl(await grayToPngDataUrl(residualVis), 'cellular-gated-delta.png');

  let rmin = Infinity, rmax = -Infinity, rsum = 0, rabssum = 0;
  for (let i = 0; i < residual.length; i++) {
    const v = residual[i];
    if (v < rmin) rmin = v;
    if (v > rmax) rmax = v;
    rsum += v; rabssum += Math.abs(v);
  }
  const residualStats = { min: rmin, max: rmax, mean: rsum / residual.length, meanAbs: rabssum / residual.length };

  const leakage = protectionLeakage(residual, editWeight, 0.15);
  const activity = editableActivity(residual, editWeight, 0.15, 0.01);

  console.log('BASE  ', baseStats);
  console.log('OUTPUT', outputStats);
  console.log('RESIDUAL (bounded to +/-0.15)', residualStats);
  console.log('PROTECTION LEAKAGE (expect ~0):', leakage);
  console.log('EDITABLE-REGION ACTIVITY (expect materially nonzero):', activity);

  await browser.close();
})();
