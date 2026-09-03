// SCRATCH -- round 17, pipeline reorder proposed directly by the maintainer:
// "Die Depthmap koennen wir anstelle der color masks zur direkten
// Kantenfindung nutzen. Darauf koennen wir die VP legen. Innerhalb dieser
// Constraints lassen wir die Operatoren los, um die zu grobe Flaeche zu
// segmentieren. Dann haetten wir immer noch mindestens Geometrie und Farbe
// als moeglichen Folgeschritt."
//
// Round 16 only used DA2 depth as a WEAK filter on points already defined by
// the affine box geometry. This is structurally different and stronger:
// DEPTH EDGES (gradient discontinuities in the depth map) become the FIRST,
// COARSE segmentation step -- replacing the color-mask flood-fill entirely,
// which is exactly what fixture-taxonomie.md SS6 flagged as the extractor's
// deepest limitation (scene/palette-specific hardcoded roof/wall colors).
// Depth edges don't know or care what color anything is.
//
// Step A (this file): depth-edge coarse segmentation on VLG-02, where real
// ground truth exists (6 known houses from the existing extractor), to
// validate the core idea before trying it on a second image.
import { pipeline } from '@huggingface/transformers';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');

console.log('Running Depth Anything V2 Small on VLG-02...');
const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const { depth } = await depthEstimator(IMG);
console.log(`Depth map: ${depth.width}x${depth.height}`);

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();

const result = await page.evaluate(({ depthValues, W, H }) => {
  // Sobel gradient magnitude on the depth map -- pure edge strength, no
  // color/material knowledge involved at all.
  function at(x, y) { const xi = Math.max(0, Math.min(W - 1, x)), yi = Math.max(0, Math.min(H - 1, y)); return depthValues[yi * W + xi]; }
  const gradMag = new Float32Array(W * H);
  let maxGrad = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const m = Math.hypot(gx, gy);
      gradMag[y * W + x] = m;
      if (m > maxGrad) maxGrad = m;
    }
  }
  // Threshold picked from THIS depth map's own gradient distribution (85th
  // percentile), not an external constant -- same discipline as every
  // color/texture threshold earlier this session.
  const sorted = Array.from(gradMag).sort((a, b) => a - b);

  function buildEdgeMask(percentile, dilateRadius) {
    const threshold = sorted[Math.floor(sorted.length * percentile)];
    let mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = gradMag[i] > threshold ? 1 : 0;
    // Morphological dilation to close small gaps in the edge trace -- a
    // house/ground boundary that fades gradually (DA2 smoothing) can leave
    // 1-2px gaps a pure threshold misses; dilation bridges those without
    // needing a much higher (and therefore over-aggressive elsewhere)
    // global threshold.
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

  function coarseComponents(isEdge) {
    const visited = new Uint8Array(W * H);
    const comps = [];
    const MIN_SIZE = Math.round(W * H * 0.0005);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx] || isEdge[idx]) continue;
        const stack = [[x, y]];
        visited[idx] = 1;
        let minX = x, maxX = x, minY = y, maxY = y, count = 0, depthSum = 0;
        while (stack.length) {
          const [cx, cy] = stack.pop(); count++; depthSum += at(cx, cy);
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
        if (count >= MIN_SIZE) comps.push({ bbox: [minX, minY, maxX, maxY], count, meanDepth: depthSum / count, w: maxX - minX, h: maxY - minY });
      }
    }
    return comps.sort((a, b) => b.count - a.count);
  }

  const sweep = [];
  for (const percentile of [0.85, 0.90, 0.93, 0.96]) {
    for (const dilate of [0, 1, 2, 3]) {
      const { mask, threshold } = buildEdgeMask(percentile, dilate);
      const comps = coarseComponents(mask);
      const largestFrac = comps.length ? comps[0].count / (W * H) : 0;
      sweep.push({ percentile, dilate, threshold, nComponents: comps.length, largestFrac, top5: comps.slice(0, 5).map((c) => ({ bbox: c.bbox, size: c.count })) });
    }
  }

  const EDGE_THRESHOLD = sorted[Math.floor(sorted.length * 0.85)];
  const isEdge = buildEdgeMask(0.85, 0).mask;
  const visited = new Uint8Array(W * H);
  const components = [];
  const MIN_SIZE = Math.round(W * H * 0.0005);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx] || isEdge[idx]) continue;
      const stack = [[x, y]];
      visited[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0, depthSum = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop(); count++; depthSum += at(cx, cy);
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
      if (count >= MIN_SIZE) components.push({ bbox: [minX, minY, maxX, maxY], count, meanDepth: depthSum / count, w: maxX - minX, h: maxY - minY });
    }
  }
  components.sort((a, b) => b.count - a.count);
  return { W, H, EDGE_THRESHOLD, maxGrad, totalEdgePixels: isEdge.reduce((s, v) => s + v, 0), components: components.slice(0, 40), sweep };
}, { depthValues: Array.from(depth.data), W: depth.width, H: depth.height });

console.log(`\n=== Threshold/dilation sweep (percentile, dilate radius -> #components, largest-region fraction of image) ===`);
for (const s of result.sweep) {
  console.log(`  p${(s.percentile * 100).toFixed(0)} dilate=${s.dilate}: threshold=${s.threshold.toFixed(1)} nComponents=${s.nComponents} largestFrac=${(s.largestFrac * 100).toFixed(1)}%`);
}
console.log(`\n(default view, p85/dilate=0) Edge pixels: ${result.totalEdgePixels} (${(100 * result.totalEdgePixels / (result.W * result.H)).toFixed(1)}% of image)`);
console.log(`\nTop coarse regions found (depth-edge segmentation, no color used):`);
for (const c of result.components.slice(0, 15)) {
  console.log(`  bbox=${JSON.stringify(c.bbox)} size=${c.count}px (${c.w}x${c.h}) meanDepth=${c.meanDepth.toFixed(0)}`);
}
fs.writeFileSync(path.join(OUT, 'depth-edge-coarse-regions.json'), JSON.stringify(result, null, 2));
await browser.close();
