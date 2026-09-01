// SCRATCH -- minimal Surface Cultivator, per the maintainer's shared
// "Cultivation Reconstruction Reference" doc, section 33 ("Minimaler
// Cultivation-Prototyp"). Explicit test of the claim that competitive
// region growth is MORE robust than tolerance-based flood fill for the
// exact failure case already found this session: newtest.png's floor,
// in shadow near the cubes, reads ~114-127 luminance -- nearly identical
// to the cube faces' ~113-130. The flood-fill fix needed a hand-drawn
// bounding box as a safety net. This script deliberately removes that
// safety net (grows across the WHOLE image) to see whether competition
// between simultaneously-growing regions produces a clean boundary on
// its own, per the doc's core claim in section 11/section 24.
//
// 5-attribute pixel state (doc section 12, kept minimal on purpose):
//   coordinate  -- (x,y), implicit via array index
//   appearance  -- luminance + local 3x3 mean
//   gradient    -- gx, gy, strength (simple central differences)
//   owner       -- 0 = unclaimed, else seed id
//   confidence  -- 0..1, grows with iterations of stable ownership
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = '/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/newtest.png';

// cube3 (the largest cube, hardest case -- its base sits in the deepest
// shadow region measured this session) -- 3 seeds, one per visible face,
// same points used successfully in the flood-fill version.
const SEEDS = [
  { id: 1, x: 1000, y: 160, label: 'top' },
  { id: 2, x: 850, y: 420, label: 'left' },
  { id: 3, x: 1150, y: 420, label: 'right' },
];

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<canvas id=c></canvas>');
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
  const BASE_TOL_PARAM = Number(process.env.CULT_TOL || 10);
  const MAX_DRIFT_PARAM = Number(process.env.CULT_DRIFT || 18);

  const result = await page.evaluate(async ({ dataUrl, SEEDS, BASE_TOL_PARAM, MAX_DRIFT_PARAM }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { const p = i * 4; lum[i] = (data[p] + data[p + 1] + data[p + 2]) / 3; }

    // gradient: simple central differences, magnitude only needed.
    const gradMag = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = lum[i + 1] - lum[i - 1], gy = lum[i + W] - lum[i - W];
      gradMag[i] = Math.hypot(gx, gy);
    }

    const owner = new Int32Array(W * H); // 0 = unclaimed
    const confidence = new Float32Array(W * H);
    const regionSeedValue = new Map(SEEDS.map(s => [s.id, lum[s.y * W + s.x]]));
    const regionMean = new Map(SEEDS.map(s => [s.id, lum[s.y * W + s.x]]));
    const regionCount = new Map(SEEDS.map(s => [s.id, 1]));
    for (const s of SEEDS) owner[s.y * W + s.x] = s.id;

    // APPEARANCE compatibility: within an adaptive tolerance of the
    // region's CURRENT running mean (not the fixed seed value) -- allows
    // slow drift across genuine shading, same spirit as the doc's
    // "kein hartes gleiche-Farbe" rule.
    //
    // BUT a free-drifting running mean has a real failure mode, found by
    // actually running this: green leaked all the way across the gap to
    // an entirely different cube (visible as a blob + speckle pattern on
    // cube2), because a long chain of individually-small compatible steps
    // walked the mean far enough from its origin to eventually accept
    // pixels the ORIGINAL seed value would have rejected outright --
    // "boiling frog" region growing. Fix: a hard DRIFT BUDGET -- every
    // candidate must ALSO stay within MAX_DRIFT of the region's original
    // seed value, not just the local running mean. This still allows
    // gradual local adaptation (the running-mean check) while capping how
    // far the region's identity can wander in total.
    const BASE_TOL = BASE_TOL_PARAM;
    const MAX_DRIFT = MAX_DRIFT_PARAM;
    // GRADIENT brake: a strong local edge sharply reduces (never fully
    // forbids on its own -- appearance still the primary gate) a pixel's
    // eligibility to be claimed this step, per the doc's "Gradient allein
    // ist kein Stoppschild" -- it slows growth, appearance/competition
    // decide the rest.
    function gradientPenalty(g) { return Math.min(1, g / 40); } // 0 = no brake, 1 = full brake

    let frontier = SEEDS.map(s => s.y * W + s.x);
    const NEI = [1, -1, W, -W];
    let iter = 0;
    const MAX_ITERS = 400;
    for (; iter < MAX_ITERS; iter++) {
      if (!frontier.length) break;
      // Each unclaimed neighbor of the current frontier collects BIDS
      // from every adjacent owned region this step -- true COMPETITION,
      // not first-come-first-served: if 2+ regions bid on the same
      // pixel in the same step, it is left CONTESTED (unclaimed), which
      // is exactly how the doc says boundaries should emerge as a
      // byproduct rather than being searched for directly.
      const bids = new Map(); // pixel index -> Set of region ids bidding
      for (const idx of frontier) {
        const rid = owner[idx];
        for (const d of NEI) {
          const nIdx = idx + d;
          if (nIdx < 0 || nIdx >= W * H) continue;
          // reject wraparound on horizontal neighbors
          if ((d === 1 || d === -1) && Math.floor(nIdx / W) !== Math.floor(idx / W)) continue;
          if (owner[nIdx] !== 0) continue;
          const mean = regionMean.get(rid);
          const tol = BASE_TOL * (1 - 0.5 * gradientPenalty(gradMag[nIdx]));
          if (Math.abs(lum[nIdx] - mean) > tol) continue; // appearance gate (local, running mean)
          if (Math.abs(lum[nIdx] - regionSeedValue.get(rid)) > MAX_DRIFT) continue; // drift budget (global, vs original seed)
          if (!bids.has(nIdx)) bids.set(nIdx, new Set());
          bids.get(nIdx).add(rid);
        }
      }
      const newFrontier = [];
      for (const [idx, bidders] of bids) {
        if (bidders.size > 1) continue; // contested -- becomes boundary, stays unclaimed
        const rid = [...bidders][0];
        owner[idx] = rid;
        confidence[idx] = 0.1;
        newFrontier.push(idx);
        const n = regionCount.get(rid), m = regionMean.get(rid);
        regionMean.set(rid, (m * n + lum[idx]) / (n + 1));
        regionCount.set(rid, n + 1);
      }
      // confidence grows for pixels that keep the same owner (simplified:
      // just age everything already-owned by a small amount each step).
      for (let i = 0; i < confidence.length; i++) if (owner[i] !== 0 && confidence[i] < 1) confidence[i] = Math.min(1, confidence[i] + 0.02);
      frontier = newFrontier;
    }

    // Boundary extraction: any owned pixel with a differently-owned
    // (including "contested/unclaimed") neighbor.
    const regionPixelCounts = Object.fromEntries(SEEDS.map(s => [s.id, 0]));
    for (let i = 0; i < owner.length; i++) if (owner[i]) regionPixelCounts[owner[i]]++;

    // Visualize: colored owners + white boundary pixels.
    const outCanvas = document.createElement('canvas'); outCanvas.width = W; outCanvas.height = H;
    const octx = outCanvas.getContext('2d');
    octx.drawImage(img, 0, 0);
    const imgData = octx.getImageData(0, 0, W, H);
    const colors = { 1: [255, 60, 60], 2: [60, 200, 60], 3: [60, 120, 255] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!owner[i]) continue;
      const [cr, cg, cb] = colors[owner[i]];
      const p = i * 4;
      imgData.data[p] = (imgData.data[p] + cr) / 2;
      imgData.data[p + 1] = (imgData.data[p + 1] + cg) / 2;
      imgData.data[p + 2] = (imgData.data[p + 2] + cb) / 2;
    }
    octx.putImageData(imgData, 0, 0);
    // boundary overlay pass (after putImageData so it isn't blended away)
    octx.fillStyle = '#ffff00';
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!owner[i]) continue;
      const o = owner[i];
      if (owner[i - 1] && owner[i - 1] !== o || owner[i + 1] && owner[i + 1] !== o || owner[i - W] && owner[i - W] !== o || owner[i + W] && owner[i + W] !== o) {
        octx.fillRect(x, y, 1, 1);
      }
    }
    const overlayUrl = outCanvas.toDataURL('image/png');
    return { W, H, iterations: iter, regionPixelCounts, overlayUrl };
  }, { dataUrl, SEEDS, BASE_TOL_PARAM, MAX_DRIFT_PARAM });

  console.log('Cultivator stopped after', result.iterations, 'iterations.');
  console.log('Region pixel counts:', result.regionPixelCounts);
  const b64 = result.overlayUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(OUT, 'surface-cultivator.png'), Buffer.from(b64, 'base64'));
  console.log('Wrote surface-cultivator.png');
  await browser.close();
})();
