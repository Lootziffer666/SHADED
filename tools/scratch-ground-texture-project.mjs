// SCRATCH -- autonomous overnight iteration (user asleep, /loop dynamic mode).
// Goal: give the 3D viewer (Runde 28, fixed "4 von 6 schweben" this session)
// a real ground texture instead of a flat color, closing the "Wege/Buesche
// nicht rekonstruiert" gap noted as open in Runde 26 and 28 -- without
// inventing path/bush geometry that was never measured.
//
// Method, all built from ALREADY-established, ALREADY-verified pieces, no
// new assumption introduced:
//   1. The affine solver's forward map for a GROUND point (world Y=0, the
//      confirmed shared ground level from tonight's fix) is LINEAR:
//        screen = X*dirF[0] + Z*dirF[2]   (raw family-pixel units)
//      Inverting this 2x2 system gives, for ANY screen pixel, the real-world
//      (X,Z) ground position -- exact, not approximate, verified by a
//      round-trip test below.
//   2. Because the map is linear, the FULL image rectangle (0,0)-(W,H)
//      corresponds to an exact PARALLELOGRAM in world (X,Z) -- not the
//      axis-aligned rectangle the first viewer version wrongly assumed
//      (that produced UV coordinates far outside [0,1], caught before ever
//      publishing this version).
//   3. House pixels (roof/wallLight/wallDark, same real colors as Runde 25)
//      are painted over with the sampled grass color BEFORE embedding, so
//      the flat ground texture doesn't show a duplicate 2D house silhouette
//      underneath the real 3D box for that house. Bushes and paths are left
//      untouched -- they get a real, correctly-positioned flat texture
//      instead of the "not reconstructed" gap, honestly still flat (no 3D
//      bush volume, no path mesh), not invented geometry.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');
const r = JSON.parse(fs.readFileSync(path.join(OUT, 'village-reconstructed-affine.json'), 'utf8'));
const { dirF, scale, W, H } = r;
const metersPerUnit = 3.0 / scale['house1'][1];

const a = dirF[0][0], b = dirF[2][0], c = dirF[0][1], d = dirF[2][1];
const det = a * d - b * c;
function screenToGroundMeters(px, py) {
  const X = (px * d - b * py) / det;
  const Z = (a * py - px * c) / det;
  return [X * metersPerUnit, Z * metersPerUnit];
}
console.log('det =', det.toFixed(6));
const corners = { c00: screenToGroundMeters(0, 0), c10: screenToGroundMeters(W, 0), c01: screenToGroundMeters(0, H), c11: screenToGroundMeters(W, H) };
console.log('Welt-Parallelogramm-Ecken (Meter):', JSON.stringify(corners));
// Round-trip sanity check (cheap, catches any sign/axis mixup before touching the viewer).
function groundToScreen(xMeters, zMeters) { const x = xMeters / metersPerUnit, z = zMeters / metersPerUnit; return [x * a + z * b, x * c + z * d]; }
const [rtx, rty] = groundToScreen(...screenToGroundMeters(777, 411));
if (Math.abs(rtx - 777) > 0.01 || Math.abs(rty - 411) > 0.01) throw new Error('Rundreise-Test fehlgeschlagen: ' + rtx + ',' + rty);
console.log('Rundreise-Test bestanden.');

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
await page.setContent('<canvas id="c"></canvas>');

const maskedDataUrl = await page.evaluate(async ({ imgDataUrl, W, H }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, W, H);
  const px = imgData.data;

  // Same real colors as scratch-verify-region-roof-or-wall.mjs (Runde 25) -- not re-tuned.
  const MATERIALS = {
    roof: { color: [225, 126, 69], tol: 35 },
    wallLight: { color: [198, 166, 109], tol: 22 },
    wallDark: { color: [141, 125, 81], tol: 22 },
  };
  function dist(r, g, bl, c) { return Math.hypot(r - c[0], g - c[1], bl - c[2]); }

  // Grass sample, same coordinate convention as Runde 26.
  const gi = (Math.round(H * 0.85) * W + Math.round(W * 0.5)) * 4;
  const grass = [px[gi], px[gi + 1], px[gi + 2]];
  console.log('grass sample:', grass);

  let painted = 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const rgb = [px[o], px[o + 1], px[o + 2]];
    let isHouse = false;
    for (const m of Object.values(MATERIALS)) { if (dist(...rgb, m.color) <= m.tol) { isHouse = true; break; } }
    if (isHouse) { px[o] = grass[0]; px[o + 1] = grass[1]; px[o + 2] = grass[2]; painted++; }
  }
  console.log('painted-over house pixels:', painted, '/', W * H);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}, { imgDataUrl, W, H });

fs.writeFileSync(path.join(OUT, 'village-ground-masked.png'), Buffer.from(maskedDataUrl.split(',')[1], 'base64'));
fs.writeFileSync(path.join(OUT, 'village-ground-corners.json'), JSON.stringify({ metersPerUnit, W, H, corners }, null, 2));
console.log('Geschrieben: village-ground-masked.png, village-ground-corners.json');
await browser.close();
