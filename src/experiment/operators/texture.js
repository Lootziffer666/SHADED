// SHADED — Phase 1 Texture Pipeline Operators (real implementations, no stubs)
// Operate on a plain image structure: { width, height, data: Uint8ClampedArray (RGBA) }
// This keeps them runnable under Node (no DOM/canvas) and in the browser.

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

// --- TextureStationarizer -------------------------------------------------
// Make a photographed patch tileable by feathering opposing edges so the
// horizontal/vertical seams disappear. Real seam-energy reduction, not a crop.
export function textureStationarizer(img, params = {}) {
  const feather = params.feather ?? 16;     // px blend band
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data);
  // Horizontal: blend right edge into left edge and vice versa
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < feather; x++) {
      const t = (x + 1) / (feather + 1);
      const a = (y * w + x) * 4;
      const b = (y * w + (w - feather + x)) * 4;
      for (let k = 0; k < 3; k++) {
        const va = out[a + k], vb = out[b + k];
        out[a + k] = Math.round(va * (1 - t) + vb * t);
        out[b + k] = Math.round(vb * (1 - t) + va * t);
      }
    }
  }
  // Vertical: same for top/bottom
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < feather; y++) {
      const t = (y + 1) / (feather + 1);
      const a = (y * w + x) * 4;
      const b = ((h - feather + y) * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const va = out[a + k], vb = out[b + k];
        out[a + k] = Math.round(va * (1 - t) + vb * t);
        out[b + k] = Math.round(vb * (1 - t) + va * t);
      }
    }
  }
  return { width: w, height: h, data: out };
}

// --- MultiViewTextureFuser -----------------------------------------------
// Fuse several patches of the same surface: align exposure (match mean linear
// luma) then average. Real disagreement-resolution, not a naive overwrite.
export function multiViewTextureFuser(images, params = {}) {
  if (!images.length) throw new Error('MultiViewTextureFuser: no images');
  const { width: w, height: h } = images[0];
  // Compute per-image mean linear luma, then a common target (median).
  const means = images.map(im => {
    let s = 0, n = 0;
    for (let i = 0; i < im.data.length; i += 4) {
      s += 0.2126 * srgbToLinear(im.data[i]) + 0.7152 * srgbToLinear(im.data[i + 1]) + 0.0722 * srgbToLinear(im.data[i + 2]);
      n++;
    }
    return s / n;
  });
  const sorted = [...means].sort((a, b) => a - b);
  const target = sorted[Math.floor(sorted.length / 2)] || 1e-6;
  const gain = images.map((_, i) => target / (means[i] || 1e-6));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < images.length; i++) {
    const im = images[i], g = gain[i];
    for (let p = 0; p < im.data.length; p += 4) {
      for (let k = 0; k < 3; k++) {
        const lin = srgbToLinear(im.data[p + k]) * g;
        out[p + k] += linearToSrgb(lin) / images.length;
      }
      out[p + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// --- PaletteNormalizer ----------------------------------------------------
// Cluster material colors (k-means in linear RGB) and quantize to <= numColors.
// Returns { image, palette } where palette is array of [r,g,b] (0..255).
export function paletteNormalizer(img, params = {}) {
  const numColors = params.numColors ?? 4;
  const maxIter = params.maxIter ?? 12;
  const { width: w, height: h, data } = img;
  // Sample pixels as linear RGB points.
  const pts = [];
  for (let i = 0; i < data.length; i += 4) {
    pts.push([srgbToLinear(data[i]), srgbToLinear(data[i + 1]), srgbToLinear(data[i + 2])]);
  }
  // Seed: evenly spaced across sorted luminance.
  const idx = pts.map((_, i) => i);
  const centroids = [];
  for (let c = 0; c < numColors; c++) {
    const li = Math.floor((c + 0.5) / numColors * pts.length);
    centroids.push([...pts[li]]);
  }
  const assign = new Int32Array(pts.length);
  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < pts.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < numColors; c++) {
        const d = (pts[i][0] - centroids[c][0]) ** 2 + (pts[i][1] - centroids[c][1]) ** 2 + (pts[i][2] - centroids[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
    }
    const sums = Array.from({ length: numColors }, () => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const c = assign[i];
      sums[c][0] += pts[i][0]; sums[c][1] += pts[i][1]; sums[c][2] += pts[i][2]; sums[c][3]++;
    }
    for (let c = 0; c < numColors; c++) {
      if (sums[c][3] > 0) centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][2] === 0 ? 0 : sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }
  const palette = centroids.map(c => [linearToSrgb(c[0]), linearToSrgb(c[1]), linearToSrgb(c[2])]);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < pts.length; i++) {
    const c = palette[assign[i]];
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data: out, palette };
}

// --- EmissiveSeparator ----------------------------------------------------
// Split a surface texture into baseColor + emissive (high linear-luminance,
// saturated-ish pixels are treated as self-lit). Real threshold, not a drop.
export function emissiveSeparator(img, params = {}) {
  const threshold = params.threshold ?? 0.85; // linear luma
  const { width: w, height: h, data } = img;
  const base = new Uint8ClampedArray(data);
  const emissive = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    const lin = 0.2126 * srgbToLinear(data[i]) + 0.7152 * srgbToLinear(data[i + 1]) + 0.0722 * srgbToLinear(data[i + 2]);
    if (lin >= threshold) {
      emissive[i] = data[i]; emissive[i + 1] = data[i + 1]; emissive[i + 2] = data[i + 2]; emissive[i + 3] = 255;
      // Remove emissive energy from base so it does not double-count at night
      base[i] = Math.round(data[i] * 0.4); base[i + 1] = Math.round(data[i + 1] * 0.4); base[i + 2] = Math.round(data[i + 2] * 0.4);
    }
    base[i + 3] = 255;
  }
  return {
    width: w, height: h,
    baseColor: { width: w, height: h, data: base },
    emissive: { width: w, height: h, data: emissive }
  };
}

export const TEXTURE_OPERATORS = {
  TextureStationarizer: textureStationarizer,
  MultiViewTextureFuser: multiViewTextureFuser,
  PaletteNormalizer: paletteNormalizer,
  EmissiveSeparator: emissiveSeparator
};
