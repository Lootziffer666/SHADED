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
const { dirF, T, scale, W, H } = r;
const metersPerUnit = 3.0 / scale['house1'][1];

// CORRECTION #5 (Runde 29, caught directly by the maintainer -- "du nimmst
// das Dach als Boden"). Verified with real pixel colors, not another guess:
// at EVERY house, the 3 hexagon vertices with local axis-1 = 1 (screen =
// ...+(T[1]+scale[1])*dirF[1], which is exactly 0 for all 6 houses) sample as
// ROOF color (~225,126,69); the 3 with axis-1 = 0 (screen = ...+T[1]*dirF[1])
// sample as WALL color, i.e. near the true ground. So T[1]+scale[1]=0 -- what
// this whole file previously called "the shared ground" and used as the Y=0
// reference for EVERY ground-plane projection (paths, grass, bushes, the
// footprint mask) -- is actually the shared ROOFLINE. Every ground pixel this
// file has projected so far was projected as if it sat at roof height, not
// ground height: a real, systematic error, not just the smaller masking bugs
// already fixed above (this is very likely the actual root cause behind the
// "Wege passen nicht zu den Haeusern" symptom, not just the masking gaps).
// Fixed at the root: ground-plane projections now use each house's own T[1]
// (confirmed ground-level) averaged across the 6 houses as the reference --
// not 0. This does NOT force artificial flatness: individual houses keep
// their own real T[1], only the shared ground TEXTURE plane (which has no
// "per house" concept) needs one reference value.
const groundRefRaw = Object.values(T).reduce((s, t) => s + t[1], 0) / Object.keys(T).length;
console.log('Boden-Referenz (Mittel von T[.][1], jetzt korrekt als Boden statt Dach):', groundRefRaw.toFixed(2), 'raw =', (groundRefRaw * metersPerUnit).toFixed(2), 'm');

const a = dirF[0][0], b = dirF[2][0], c = dirF[0][1], d = dirF[2][1];
const det = a * d - b * c;
function screenToGroundMeters(px, py) {
  const rhsX = px - groundRefRaw * dirF[1][0];
  const rhsY = py - groundRefRaw * dirF[1][1];
  const X = (rhsX * d - b * rhsY) / det;
  const Z = (a * rhsY - rhsX * c) / det;
  return [X * metersPerUnit, Z * metersPerUnit];
}
function groundRawToScreen(xRaw, zRaw) {
  return [xRaw * a + zRaw * b + groundRefRaw * dirF[1][0], xRaw * c + zRaw * d + groundRefRaw * dirF[1][1]];
}

// CORRECTION #2 (still Runde 29 -- caught by the maintainer's screenshots even
// after CORRECTION #1 below): masking the VISIBLE silhouette polygon alone is
// not enough, and for a subtler reason than incomplete color-tolerance. A
// tall object's visible 2D silhouette, once ground-projected under the flat
// Y=0 assumption, lands SHIFTED/SHEARED away from where the object's real
// footprint is (elevation-dependent isometric parallax: a point at height h
// projects at screen = groundToScreen(X,Z) + h*dirF[1], so masking "the
// silhouette" paints a grass GHOST at the wrong (X,Z), while the TRUE
// footprint screen position -- occluded by the house itself in the original
// photo, never directly visible -- never gets touched at all and keeps
// showing whatever was originally there.  Fix: mask BOTH regions. (1) the
// visible silhouette (below, unchanged) so no ghost hexagon is left floating
// on the grass with no box above it, and (2) the box's OWN real footprint
// (T[0]/T[2] + scale[0]/scale[2], the same data the 3D box itself is built
// from), forward-projected via the identical affine map, so the ground
// texture is guaranteed clean exactly where the real 3D box actually stands.
// Footprint corners use EACH house's OWN real T[1] (its own confirmed ground
// level, not the shared average used for the flat ground texture plane) --
// the true 3D position of that house's own base, not an approximation.
function groundRawToScreenAtY(xRaw, yRaw, zRaw) {
  return [xRaw * a + zRaw * b + yRaw * dirF[1][0], xRaw * c + zRaw * d + yRaw * dirF[1][1]];
}
const houseFootprintPolys = Object.keys(T).map((name) => {
  const t = T[name], s = scale[name];
  const corners = [[t[0], t[2]], [t[0] + s[0], t[2]], [t[0] + s[0], t[2] + s[2]], [t[0], t[2] + s[2]]];
  return corners.map(([x, z]) => groundRawToScreenAtY(x, t[1], z));
});
console.log('det =', det.toFixed(6));
const corners = { c00: screenToGroundMeters(0, 0), c10: screenToGroundMeters(W, 0), c01: screenToGroundMeters(0, H), c11: screenToGroundMeters(W, H) };
console.log('Welt-Parallelogramm-Ecken (Meter):', JSON.stringify(corners));
// Round-trip sanity check (cheap, catches any sign/axis mixup before touching the viewer).
function groundToScreen(xMeters, zMeters) {
  const x = xMeters / metersPerUnit, z = zMeters / metersPerUnit;
  return [x * a + z * b + groundRefRaw * dirF[1][0], x * c + z * d + groundRefRaw * dirF[1][1]];
}
const [rtx, rty] = groundToScreen(...screenToGroundMeters(777, 411));
if (Math.abs(rtx - 777) > 0.01 || Math.abs(rty - 411) > 0.01) throw new Error('Rundreise-Test fehlgeschlagen: ' + rtx + ',' + rty);
console.log('Rundreise-Test bestanden.');

// CORRECTION (still Runde 29, caught by the maintainer against real screenshots,
// s. Log): color-tolerance masking alone leaves anti-aliased roof-edge fringe
// unmasked. That residual then gets ground-projected under the SAME "this pixel
// is a Y=0 ground point" assumption used for real ground pixels -- but roof/wall
// pixels are NOT at Y=0, they are ELEVATED, so the assumption is wrong for them
// specifically, and the resulting (X,Z) is shifted by a house-height-dependent
// parallax offset -- a stray, wrongly-positioned fragment of house texture next
// to, not under, the real 3D box. Fixed geometrically instead of by better color
// tuning: fill each house's own REAL measured hull polygon (village-raw2d-v2.json,
// the same ground-truth silhouette used throughout this whole session), slightly
// enlarged from its centroid for anti-aliasing margin, with grass -- guaranteed
// complete removal, no reliance on a color threshold at all.
// CORRECTION #3 (still Runde 29 -- caught by the maintainer directly: "es gibt
// kein 7. Haus, das ist ein Masking Fehler"). What I dismissed as "a 7th,
// never-reconstructed house peeking in at the frame edge" was wrong -- it's
// house5's OWN silhouette, undermasked. house5 (and house6) only have 4 of 6
// hull vertices measured (village-raw2d-v2.json has `null` for the other 2)
// because those corners fall OFF the image frame and were never directly
// measurable. Filling just the 4 valid points draws a straight "shortcut"
// edge across the gap, undershooting the true silhouette by however far it
// actually extends past the frame edge -- exactly the leftover sliver of
// unmasked roof color the maintainer spotted near house5, x=1536 (image
// right edge). Fixed generically: for any house with missing vertices,
// extend the fill polygon out to whichever image edge the gap sits against.
const raw2d = JSON.parse(fs.readFileSync(path.join(OUT, 'village-raw2d-v2.json'), 'utf8'));
function extendClippedPoly(rawPoly, W, H) {
  const n = rawPoly.length; // always 6, some entries null
  const out = [];
  for (let i = 0; i < n; i++) {
    if (rawPoly[i]) { out.push(rawPoly[i]); continue; }
    // Missing vertex: walk BOTH directions (skipping other nulls) to find the
    // nearest valid neighbor by step-count, and use THAT one's coordinate --
    // each null in a multi-null gap needs its OWN nearer reference, not
    // always "prev", or consecutive nulls collapse onto the same duplicate
    // point and the fill never actually sweeps across to the frame edge.
    let prev = null, prevSteps = Infinity, next = null, nextSteps = Infinity;
    for (let k = 1; k <= n; k++) { const p = rawPoly[(i - k + n) % n]; if (p) { prev = p; prevSteps = k; break; } }
    for (let k = 1; k <= n; k++) { const p = rawPoly[(i + k) % n]; if (p) { next = p; nextSteps = k; break; } }
    const ref = prevSteps <= nextSteps ? prev : next;
    if (!ref) continue;
    const distL = ref[0], distR = W - ref[0], distT = ref[1], distB = H - ref[1];
    const m = Math.min(distL, distR, distT, distB);
    if (m === distL) out.push([0, ref[1]]);
    else if (m === distR) out.push([W, ref[1]]);
    else if (m === distT) out.push([ref[0], 0]);
    else out.push([ref[0], H]);
  }
  return out;
}
const housePolys = Object.values(raw2d.cubes).map((c) => extendClippedPoly(c.rawPoly, W, H));

const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const imgDataUrl = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
await page.setContent('<canvas id="c"></canvas>');

const maskedDataUrl = await page.evaluate(async ({ imgDataUrl, W, H, housePolys, houseFootprintPolys }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgDataUrl; });
  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Global grass sample (Runde 26 convention) -- kept as fallback only.
  const gd = ctx.getImageData(Math.round(W * 0.5), Math.round(H * 0.85), 1, 1).data;
  const globalGrass = [gd[0], gd[1], gd[2]];
  console.log('global grass sample:', globalGrass);

  // CORRECTION #4 (still Runde 29 -- "wieso maskierst du gruen auf gruen?").
  // A single global grass sample ignores this render's own shading gradient
  // (lighter/darker grass depending on screen position) -- filling every
  // house with the SAME flat color paints a visibly wrong-toned patch next
  // to correctly-shaded real grass, which is what looked like a stray dark
  // "ghost" blob. Fixed: sample grass LOCALLY per house, just outside its own
  // silhouette, so each patch matches the shading actually surrounding it.
  function localGrassColor(poly) {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const maxR = poly.reduce((m, p) => Math.max(m, Math.hypot(p[0] - cx, p[1] - cy)), 0);
    const candidates = [];
    for (const ang of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rad = ang * Math.PI / 180;
      const sx = Math.round(cx + Math.cos(rad) * (maxR * 1.35));
      const sy = Math.round(cy + Math.sin(rad) * (maxR * 1.35));
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const d = ctx.getImageData(sx, sy, 1, 1).data;
      // grass is green-dominant (G > R and G > B); reject path (warm/tan) and roof/wall pixels.
      if (d[1] > d[0] && d[1] > d[2]) candidates.push([d[0], d[1], d[2]]);
    }
    if (!candidates.length) return globalGrass;
    return candidates.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]).map((v) => v / candidates.length);
  }

  const MARGIN = 1.12; // scale each polygon out from its own centroid, covers antialiasing fringe
  for (const poly of housePolys) {
    const grass = localGrassColor(poly);
    ctx.fillStyle = `rgb(${grass[0]},${grass[1]},${grass[2]})`;
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    ctx.beginPath();
    poly.forEach(([x, y], i) => {
      const ex = cx + (x - cx) * MARGIN, ey = cy + (y - cy) * MARGIN;
      if (i === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
    });
    ctx.closePath();
    ctx.fill();
  }
  console.log('painted', housePolys.length, 'visible-silhouette hull polygons (geometric, extended-to-frame-edge where clipped, locally-toned fill)');
  const grass = globalGrass; // used by the footprint pass below

  // Second pass: the TRUE footprint's own screen projection, forward-computed
  // from the same T/scale the real 3D box is built from -- not the visible
  // silhouette, which lands elsewhere once ground-projected (see comment above).
  const FOOT_MARGIN = 1.08;
  for (const poly of houseFootprintPolys) {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    ctx.beginPath();
    poly.forEach(([x, y], i) => {
      const ex = cx + (x - cx) * FOOT_MARGIN, ey = cy + (y - cy) * FOOT_MARGIN;
      if (i === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
    });
    ctx.closePath();
    ctx.fill();
  }
  console.log('painted', houseFootprintPolys.length, 'true-footprint polygons (forward-projected from T/scale)');
  return canvas.toDataURL('image/png');
}, { imgDataUrl, W, H, housePolys, houseFootprintPolys });

fs.writeFileSync(path.join(OUT, 'village-ground-masked.png'), Buffer.from(maskedDataUrl.split(',')[1], 'base64'));
fs.writeFileSync(path.join(OUT, 'village-ground-corners.json'), JSON.stringify({ metersPerUnit, W, H, corners }, null, 2));
console.log('Geschrieben: village-ground-masked.png, village-ground-corners.json');
await browser.close();
