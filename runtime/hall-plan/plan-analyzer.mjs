// Primitive technical-plan analysis for SHADED PLAN → HALL.
// Dependency-free (no OpenCV) so the PWA / Vercel build never depends on it.
// Operates on grayscale + connected components + rectangle/grid heuristics +
// dashed-line detection. Produces editable semantic element candidates.

import { PlanPoint, DetectedRectangle } from './hall-plan-core.mjs';

export const SEMANTIC_CLASS = {
  COLUMN: 'column',
  WALL: 'wall',
  CORE: 'core',
  PORTAL: 'portal',
  STAIR: 'stair',
  ESCALATOR: 'escalator',
  LEVEL_LINK: 'level_link',
  OUTER_SHELL: 'outer_shell',
  IGNORE: 'ignore',
  STAND_ZONE: 'stand_zone',
  UNKNOWN: 'unknown'
};

export const DETECTION_PROVENANCE = {
  AUTO: 'AUTO_DETECTED',
  USER: 'USER_CLASSIFIED',
  DEFAULT: 'DEFAULT_FALLBACK'
};

/** Wraps raw RGBA pixels with grayscale access. */
export class PlanImage {
  constructor(width, height, rgba) {
    this.width = width;
    this.height = height;
    this.rgba = rgba; // Uint8ClampedArray length w*h*4
  }
  getGray(x, y) {
    const i = (y * this.width + x) * 4;
    return 0.299 * this.rgba[i] + 0.587 * this.rgba[i + 1] + 0.114 * this.rgba[i + 2];
  }
}

/** Otsu global threshold on grayscale image, returns 0..255. */
export function otsuThreshold(image) {
  const hist = new Array(256).fill(0);
  const n = image.width * image.height;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) hist[Math.round(image.getGray(x, y))]++;
  }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maximum = -1, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    // >= so a degenerate (bimodal) histogram still advances to a usable split
    // between the two mass clusters instead of sticking at t=0.
    if (between >= maximum) { maximum = between; threshold = t; }
  }
  return threshold;
}

/** Connected components (8-connectivity) on a binary mask (0/255). Returns components. */
export function connectedComponents(image, binary, minArea = 4) {
  const w = image.width, h = image.height;
  const label = new Int32Array(w * h).fill(0);
  const comps = [];
  const kept = new Set();
  let nextLabel = 1;
  const stack = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (binary[idx] !== 0 && label[idx] === 0) {
        const comp = { id: nextLabel, pixels: 0, minX: x, minY: y, maxX: x, maxY: y, sumX: 0, sumY: 0 };
        label[idx] = nextLabel;
        stack.length = 0; stack.push(idx);
        while (stack.length) {
          const cur = stack.pop();
          const cx = cur % w, cy = (cur / w) | 0;
          comp.pixels++; comp.sumX += cx; comp.sumY += cy;
          if (cx < comp.minX) comp.minX = cx; if (cx > comp.maxX) comp.maxX = cx;
          if (cy < comp.minY) comp.minY = cy; if (cy > comp.maxY) comp.maxY = cy;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const nidx = ny * w + nx;
              if (binary[nidx] !== 0 && label[nidx] === 0) { label[nidx] = nextLabel; stack.push(nidx); }
            }
          }
        }
        if (comp.pixels >= minArea) { comps.push(comp); kept.add(nextLabel); }
        nextLabel++;
      }
    }
  }
  // Pixel->Komponenten-Zuordnung (comp.id, 0 = keiner) als Zusatzfeld auf dem Array — kein
  // Bruch für bestehende Aufrufer (comps bleibt ein normales Array), aber Aufrufer, die pro
  // Pixel wissen müssen, zu welcher Komponente er gehört (z. B. SHADEDs depthRegionAt),
  // müssen die Flood-Fill dafür nicht ein zweites Mal implementieren. Ein einziger
  // abschließender Durchlauf statt pro verworfener Kleinkomponente neu zu scannen (sonst
  // O(Pixel × Anzahl_verworfener_Komponenten) statt O(Pixel)).
  if (kept.size < nextLabel - 1) for (let k = 0; k < label.length; k++) if (label[k] !== 0 && !kept.has(label[k])) label[k] = 0;
  comps.labelGrid = label;
  return comps;
}

/** Build a binary mask (0/255) from a threshold. invert=true keeps dark ink. */
export function binarize(image, threshold, invert = true) {
  const n = image.width * image.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const gx = (i % image.width), gy = (i / image.width) | 0;
    const g = image.getGray(gx, gy);
    const on = invert ? g < threshold : g >= threshold;
    out[i] = on ? 255 : 0;
  }
  return out;
}

/** Convert a connected component into a rectangle descriptor (pixel space). */
export function componentToRect(comp) {
  const width = comp.maxX - comp.minX + 1;
  const height = comp.maxY - comp.minY + 1;
  const cx = comp.sumX / comp.pixels;
  const cy = comp.sumY / comp.pixels;
  const bboxArea = width * height;
  const fillRatio = bboxArea > 0 ? comp.pixels / bboxArea : 0;
  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return {
    id: comp.id,
    minX: comp.minX, minY: comp.minY, maxX: comp.maxX, maxY: comp.maxY,
    width, height, cx, cy, area: comp.pixels, fillRatio, aspect
  };
}

/**
 * Detect dashed-line / stand-zone components: small, similar, arranged along a line
 * with regular gaps. Returns array of stand-zone descriptors (bounding of the run).
 */
export function detectDashedRuns(rects, { maxGapPx = 14, minRun = 3, alignTol = 0.4 } = {}) {
  // Small marks (dashes, stand-rectangle corner ticks) — detected by SIZE, not by
  // low fill ratio: a single dash is itself a solid little mark. A dashed run is a
  // sequence of such marks with regular gaps along one line.
  const dashes = rects.filter(r => r.width < 50 && r.height < 50 && r.area < 50 * 50 * 0.7);
  const zones = [];
  const used = new Set();
  for (const seed of dashes) {
    if (used.has(seed.id)) continue;
    // grow a run in both directions matching similar size & colinear gaps
    const run = [seed]; used.add(seed.id);
    const consider = (from, dir) => {
      let last = from;
      for (const cand of dashes) {
        if (used.has(cand.id) || cand === from) continue;
        const dx = cand.cx - last.cx, dy = cand.cy - last.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 6 || dist > maxGapPx + Math.max(cand.width, cand.height)) continue;
        const szOk = Math.abs(cand.width - last.width) < last.width * 0.5 &&
                     Math.abs(cand.height - last.height) < last.height * 0.5;
        if (!szOk) continue;
        // collinear-ish: slope similar to first two
        if (run.length >= 2) {
          const a = run[0], b = run[run.length - 1];
          const refAng = Math.atan2(b.cy - a.cy, b.cx - a.cx);
          const ang = Math.atan2(dy, dx);
          let d = Math.abs(ang - refAng); while (d > Math.PI) d = Math.abs(d - Math.PI);
          if (d > alignTol) continue;
        }
        run.push(cand); used.add(cand.id); last = cand;
      }
    };
    consider(seed, 1); consider(seed, -1);
    if (run.length >= minRun) {
      const minX = Math.min(...run.map(r => r.minX)), maxX = Math.max(...run.map(r => r.maxX));
      const minY = Math.min(...run.map(r => r.minY)), maxY = Math.max(...run.map(r => r.maxY));
      zones.push({ kind: SEMANTIC_CLASS.STAND_ZONE, rects: run.map(r => r.id), minX, minY, maxX, maxY });
    }
  }
  return zones;
}

/**
 * Group filled squares into a regular grid (columns). Assigns grid row/column labels
 * when spacing is regular; otherwise marks as unknown repeated shapes.
 */
export function detectColumnGrid(filledSquares, { rowTol = 0.25, colTol = 0.25 } = {}) {
  if (filledSquares.length < 2) return { grid: [], cells: [] };
  // cluster by Y (rows) then X (cols)
  const byY = [...filledSquares].sort((a, b) => a.cy - b.cy);
  const rows = [];
  let cur = [byY[0]];
  for (let i = 1; i < byY.length; i++) {
    if (Math.abs(byY[i].cy - cur[0].cy) < cur[0].height * (1 + rowTol)) cur.push(byY[i]);
    else { rows.push(cur); cur = [byY[i]]; }
  }
  rows.push(cur);
  const cells = [];
  let rowLabel = 'A';
  const charCodeA = 65;
  for (const row of rows) {
    const sorted = [...row].sort((a, b) => a.cx - b.cx);
    sorted.forEach((sq, ci) => {
      cells.push({ rect: sq, row: String.fromCharCode(charCodeA + rows.indexOf(row)), column: ci + 1 });
    });
    rowLabel = String.fromCharCode(rowLabel.charCodeAt(0) + 1);
  }
  return { grid: rows, cells };
}

export class PlanAnalyzer {
  /**
   * @param {PlanImage} image
   * @param {object} opts {minArea, threshold, detectDashed, detectGrid}
   */
  analyze(image, opts = {}) {
    const { minArea = 6, threshold = null, detectDashed = true, detectGrid = true } = opts;
    const thr = threshold == null ? otsuThreshold(image) : threshold;
    const binary = binarize(image, thr, true);
    const comps = connectedComponents(image, binary, minArea);
    const rects = comps.map(componentToRect);

    // Preliminary classification by geometry.
    const filledSquares = [];
    const walls = [];
    const thinLines = [];
    for (const r of rects) {
      const isSquareish = r.aspect < 2.2 && r.fillRatio > 0.78 && r.width < Math.max(image.width, image.height) * 0.15;
      const isLongThin = (r.width > 40 || r.height > 40) && r.aspect > 4 && r.fillRatio > 0.6;
      if (isSquareish) filledSquares.push(r);
      else if (isLongThin) walls.push(r);
      else if (r.fillRatio < 0.55 && r.width < 60 && r.height < 60) thinLines.push(r);
    }

    const result = {
      threshold: thr,
      rects,
      filledSquares,
      walls,
      thinLines,
      dashedZones: [],
      columnCells: [],
      provenance: DETECTION_PROVENANCE.AUTO
    };

    if (detectDashed) result.dashedZones = detectDashedRuns(rects);
    if (detectGrid) result.columnCells = detectColumnGrid(filledSquares).cells;

    return result;
  }
}

/**
 * Score similarity of two rect descriptors across the features the spec lists:
 * width, height, aspect, area, fill ratio, orientation, line strength.
 * @returns number 0..1
 */
export function similarityScore(a, b, weights = {}) {
  const w = {
    width: weights.width ?? 0.18,
    height: weights.height ?? 0.18,
    aspect: weights.aspect ?? 0.15,
    area: weights.area ?? 0.15,
    fill: weights.fill ?? 0.14,
    orient: weights.orient ?? 0.1,
    line: weights.line ?? 0.1
  };
  const safe = (x, y) => 1 - Math.abs(x - y) / Math.max(1e-6, Math.max(Math.abs(x), Math.abs(y)));
  const sWidth = safe(a.width, b.width);
  const sHeight = safe(a.height, b.height);
  const sAspect = safe(a.aspect, b.aspect);
  const sArea = safe(a.area, b.area);
  const sFill = safe(a.fillRatio, b.fillRatio);
  const sOrient = safe(a.aspect, b.aspect); // proxy for orientation regularity
  const sLine = safe(a.fillRatio, b.fillRatio);
  const score = w.width * sWidth + w.height * sHeight + w.aspect * sAspect +
    w.area * sArea + w.fill * sFill + w.orient * sOrient + w.line * sLine;
  return Math.max(0, Math.min(1, score));
}

/** Find similar rects to a template, sorted by score desc. */
export function findSimilar(template, rects, { threshold = 0.0, weights } = {}) {
  return rects
    .filter(r => r.id !== template.id)
    .map(r => ({ rect: r, score: similarityScore(template, r, weights) }))
    .filter(m => m.score >= threshold)
    .sort((x, y) => y.score - x.score);
}

export { PlanPoint, DetectedRectangle };
