// SCRATCH follow-up prototype — NOT part of the verify suite, NOT meant to be
// committed. Tests the residual-based variant: bounded residual layered on a
// frozen base, structure-protected edges (low edit weight near strong
// existing edges), gradient-guided agents. Goal is NOT new geometry, it's
// plausible local shape change without destroying the legible base scene —
// so the key evidence here is the edge-preservation ratio, not edgeEnergy
// going up.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createHeightField, seedAgents, runResidualCellularGeometry,
  computeEdgeMagnitude, computeEditWeight, edgeEnergy, fieldStats,
} from '../runtime/spatial-kernel/cellular-geometry-solver.js';
import { mulberry32 } from '../runtime/spatial-kernel/world-fields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const DEPTH_IMG = path.join(REPO, 'file_00000000974871f49fe71f6b456f9579_depth.png');
const SIZE = 256;

function mean(arr, mask) {
  let sum = 0, count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (mask && !mask[i]) continue;
    sum += arr[i]; count++;
  }
  return count ? sum / count : 0;
}

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
  writeDataUrl(await grayToPngDataUrl(base.values), 'cellular-residual-base.png');

  const editWeight = computeEditWeight(base, { edgeScale: 0.12, gamma: 1.5, minWeight: 0.03 });
  writeDataUrl(await grayToPngDataUrl(editWeight), 'cellular-residual-editweight.png');

  const seed = 20260830;
  const agents = seedAgents(base, 120, mulberry32(seed ^ 0x51ed270b));
  const {
    base: outBase, residual, output, editWeight: ew2,
  } = runResidualCellularGeometry(base, agents, seed, 400, {
    growRate: 0.02, erodeRate: 0.02, smoothFactor: 0.2, randomness: 0.05, maxResidual: 0.15,
    edgeProtection: { edgeScale: 0.12, gamma: 1.5, minWeight: 0.03 },
  });
  const outputStats = fieldStats({ width: SIZE, height: SIZE, values: output });
  writeDataUrl(await grayToPngDataUrl(output), 'cellular-residual-output.png');

  // Residual visualized as diverging: 0.5 = no change, darker = eroded, lighter = grown.
  const residualVis = new Float32Array(residual.length);
  for (let i = 0; i < residual.length; i++) residualVis[i] = 0.5 + residual[i] * (0.5 / 0.15);
  writeDataUrl(await grayToPngDataUrl(residualVis), 'cellular-residual-delta.png');

  let rmin = Infinity, rmax = -Infinity, rsum = 0, rabssum = 0;
  for (let i = 0; i < residual.length; i++) {
    const v = residual[i];
    if (v < rmin) rmin = v;
    if (v > rmax) rmax = v;
    rsum += v; rabssum += Math.abs(v);
  }
  const residualStats = { min: rmin, max: rmax, mean: rsum / residual.length, meanAbs: rabssum / residual.length };

  const edgeMagBase = computeEdgeMagnitude(base);
  const edgeMagOut = computeEdgeMagnitude({ width: SIZE, height: SIZE, values: output });
  const edgeDelta = new Float32Array(edgeMagBase.length);
  for (let i = 0; i < edgeDelta.length; i++) edgeDelta[i] = Math.abs(edgeMagOut[i] - edgeMagBase[i]);
  const protectedMask = new Uint8Array(editWeight.length);
  const flatMask = new Uint8Array(editWeight.length);
  for (let i = 0; i < editWeight.length; i++) {
    protectedMask[i] = editWeight[i] < 0.3 ? 1 : 0;
    flatMask[i] = editWeight[i] > 0.7 ? 1 : 0;
  }
  const protectedEdgeChange = mean(edgeDelta, protectedMask);
  const flatEdgeChange = mean(edgeDelta, flatMask);

  console.log('BASE  ', baseStats);
  console.log('OUTPUT', outputStats);
  console.log('RESIDUAL (bounded to +/-0.15)', residualStats);
  console.log('edgeEnergy base -> output:', edgeEnergy(base), '->', edgeEnergy({ width: SIZE, height: SIZE, values: output }));
  console.log('Protected-edge pixels (editWeight<0.3): count =', protectedMask.reduce((a, b) => a + b, 0),
    ' mean |edgeMag change| =', protectedEdgeChange);
  console.log('Flat pixels (editWeight>0.7): count =', flatMask.reduce((a, b) => a + b, 0),
    ' mean |edgeMag change| =', flatEdgeChange);
  console.log('Edge-preservation ratio (protected/flat, lower = better preserved):', protectedEdgeChange / flatEdgeChange);

  await browser.close();
})();
