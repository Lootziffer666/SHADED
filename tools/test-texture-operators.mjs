// Node-runnable test for Phase 1 texture operators (no browser/canvas needed).
// Run: node tools/test-texture-operators.mjs
import { registerTextureOperators } from '../src/experiment/operators/register.js';
import { TEXTURE_OPERATORS } from '../src/experiment/operators/texture.js';

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) failures++; };

function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

const colAt = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

// 1) TextureStationarizer reduces the horizontal seam energy
{
  const w = 64, h = 32;
  const img = makeImage(w, h, (x) => x < w / 2 ? [240, 240, 240] : [20, 20, 20]);
  const seamBefore = (() => { let s = 0; for (let y = 0; y < h; y++) { const a = colAt(img, 0, y), b = colAt(img, w - 1, y); s += Math.abs(a[0] - b[0]); } return s; })();
  const out = TEXTURE_OPERATORS.TextureStationarizer(img, { feather: 8 });
  const seamAfter = (() => { let s = 0; for (let y = 0; y < h; y++) { const a = colAt(out, 0, y), b = colAt(out, w - 1, y); s += Math.abs(a[0] - b[0]); } return s; })();
  ok(seamAfter < seamBefore, `TextureStationarizer reduces seam energy (${seamBefore} -> ${seamAfter})`);
}

// 2) MultiViewTextureFuser averages exposure differences
{
  const w = 16, h = 16;
  const a = makeImage(w, h, () => [200, 200, 200]);
  const b = makeImage(w, h, () => [60, 60, 60]);
  const fused = TEXTURE_OPERATORS.MultiViewTextureFuser([a, b]);
  let s = 0, n = 0; for (let i = 0; i < fused.data.length; i += 4) { s += fused.data[i]; n++; }
  const mean = s / n;
  ok(mean > 100 && mean < 160, `MultiViewTextureFuser mean between inputs (${mean.toFixed(1)})`);
}

// 3) PaletteNormalizer quantizes to <= numColors distinct colors
{
  const w = 32, h = 32;
  const img = makeImage(w, h, (x, y) => [(x * 8) % 256, (y * 8) % 256, ((x + y) * 4) % 256]);
  const { palette, data } = TEXTURE_OPERATORS.PaletteNormalizer(img, { numColors: 3 });
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  ok(seen.size <= 3, `PaletteNormalizer yields <=3 colors (got ${seen.size})`);
  ok(palette.length === 3, `PaletteNormalizer returns ${palette.length} palette entries`);
}

// 4) EmissiveSeparator isolates the bright pixel
{
  const w = 8, h = 8;
  const img = makeImage(w, h, () => [10, 10, 10]);
  const i = (3 * w + 3) * 4; img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
  const { baseColor, emissive } = TEXTURE_OPERATORS.EmissiveSeparator(img, { threshold: 0.85 });
  const ei = (3 * w + 3) * 4;
  ok(emissive[ei] === 255, 'EmissiveSeparator flags bright pixel in emissive mask');
  ok(baseColor[ei] < 200, 'EmissiveSeparator dims base color where emissive');
  let emCount = 0; for (let p = 0; p < emissive.data.length; p += 4) if (emissive.data[p] > 0) emCount++;
  ok(emCount === 1, `EmissiveSeparator isolates exactly one emissive pixel (${emCount})`);
}

// 5) Registration metadata is complete and audit-ready
{
  const reg = registerTextureOperators();
  const ids = reg.list().map(o => o.id);
  ok(ids.length === 4 && ids.includes('TextureStationarizer'), `OperatorRegistry has 4 texture operators (${ids.join(', ')})`);
  for (const op of reg.list()) ok(op.license && op.impl, `Operator ${op.id} has license + impl`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll texture-operator tests passed');
process.exit(failures ? 1 : 0);
