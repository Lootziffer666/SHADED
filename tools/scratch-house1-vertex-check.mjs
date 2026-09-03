// SCRATCH -- affine (orthographic/weak-perspective) reconstruction, replacing
// the pinhole-camera Phase 1 from scratch-village-reconstruct-v2.mjs /
// -v3-camera.mjs entirely, rather than tuning it further.
//
// Why: the source render (file_000000006d188210a9bb1129089a7b29.png) is a
// flat-roofed isometric village, not a perspective photograph. Direct
// measurement on the real extracted hexagons confirms this rather than
// assuming it -- the "vertical" edge family (wall corners) sits at
// 89.4/89.4/90.0/90.0/90.9/91.7/89.6/89.6/90.5 degrees across houses whose
// hexagons span x=42..1507 in a 1536px-wide image (i.e. nearly the full
// frame). A real pinhole camera showing that little convergence over that
// much of the frame would need a vanishing point many image-diagonals away
// -- which is exactly the degenerate case docs/synthetic-visual-reverse-
// engineering.md SS4.2/SS11.6 warns never to fit as a wandering pixel-space
// VP position ("weit entfernte Fluchtpunkte sind numerisch schlecht
// konditioniert"), and SS4.1 states plainly: under orthographic/axonometric
// projection the vanishing points sit at infinity and edges stay parallel.
// scratch-village-reconstruct-v2/v3's own Phase-1 camera calibration (fit a
// finite focal length + principal point + rotation from those same near-
// parallel edges) is not a bug to patch, it is the wrong projection family
// for this data -- confirmed independently by the v3e ground-truth harness
// (65172e8, evidence only, not inherited here): "Remaining dominant error is
// Phase 1 camera recovery, which on NOISELESS input is 6.4-88deg off in axis
// and 26-63% off in focal length."
//
// Model: an affine camera has no focal length, no principal point, no
// perspective divide, and no cheirality constraint -- a 3D point projects as
//   screen = P * X_world      (P: 2x3, X_world: 3x1)
// We don't need a separate 3x3 rotation matrix: P's three COLUMNS are simply
// the three families' own measured 2D screen directions (closed-form,
// length-weighted circular mean over ALL edges of that family from ALL
// houses -- no iteration, no VP, no orthocenter). World axis index == family
// index throughout (0,1,2), matching localCoords' own convention, so no
// separate world/camera-axis relabeling is needed anywhere below.
//
// Per-house unknowns are still exactly (T_h in R^3, Lx_h/Ly_h/Lz_h), still
// solved by ONE joint linear least-squares system across all houses (house0
// gauges monocular scale, ground-plane row ties elevation across houses) --
// same shape as solveJointAnisotropic in v2/v3, but every coefficient is now
// a plain dot product against a FIXED 2D direction instead of routing
// through R/f/pp/cam_z. That removes the perspective-divide ill-
// conditioning at its root rather than damping it with more restarts.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const raw = JSON.parse(fs.readFileSync(path.join(OUT, 'village-raw2d-v2.json'), 'utf8'));
const { W, H, cubes: rawCubes } = raw;
const cubeNames = Object.keys(rawCubes);
const famAssignment = Object.fromEntries(cubeNames.map((n) => [n, rawCubes[n].famAssignment]));
const vertsByName = Object.fromEntries(cubeNames.map((n) => [n, rawCubes[n].rawPoly.map((p) => (p ? [p[0], p[1]] : null))]));

// --- local-coordinate topology: identical derivation to v3 (proven correct
// there, purely combinatorial over the famAssignment pattern -- unrelated to
// the camera/projection model, so not re-derived). A cube's 6-vertex
// silhouette cycle visits every corner except the fully-hidden (0,0,0) and
// the interior-to-the-hexagon near corner (1,1,1); consecutive edges
// alternate axis AND alternate +1/-1 step sign, with each axis's first
// occurrence's sign fixing that axis's start value.
function localCoordsFor(name) {
  const fams = famAssignment[name];
  const lc0 = [0, 0, 0];
  for (let i = 0; i < 3; i++) lc0[fams[i]] = i % 2 === 0 ? 0 : 1;
  const lc = [lc0];
  for (let i = 0; i < 5; i++) {
    const next = lc[i].slice();
    next[fams[i]] += i % 2 === 0 ? 1 : -1;
    lc.push(next);
  }
  return lc;
}
const localCoords = Object.fromEntries(cubeNames.map((n) => [n, localCoordsFor(n)]));

function edgeMeasured(verts, i) { return !!(verts[i] && verts[(i + 1) % 6]); }

// --- Step 1: global per-family 2D direction, closed-form, no camera model.
// Doubled-angle circular mean (family membership only constrains ORIENTATION
// mod 180deg, not a signed direction -- opposite sides of the same hexagon
// have opposite-pointing edges of the same family, e.g. house1's edge2 points
// down and edge5 points up, both family 1). Weighted by edge length so short,
// noisy hull edges influence the fit less than long, well-measured ones.
function familyEdges(fam) {
  const edges = [];
  for (const name of cubeNames) {
    const verts = vertsByName[name];
    famAssignment[name].forEach((f, i) => {
      if (f !== fam || !edgeMeasured(verts, i)) return;
      const a = verts[i], b = verts[(i + 1) % 6];
      edges.push({ dx: b[0] - a[0], dy: b[1] - a[1], len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    });
  }
  return edges;
}
function familyDirection(edges) {
  let sx = 0, sy = 0;
  for (const { dx, dy, len } of edges) {
    const ang2 = 2 * Math.atan2(dy, dx);
    sx += Math.cos(ang2) * len; sy += Math.sin(ang2) * len;
  }
  const meanAng = Math.atan2(sy, sx) / 2; // back to single angle, range (-90,90]
  return [Math.cos(meanAng), Math.sin(meanAng)]; // unit vector, sign arbitrary -- fixed per-house below (E4-style)
}
const dirF = [0, 1, 2].map((f) => familyDirection(familyEdges(f)));

// Which family is the vertical (gravity) axis? Not assumed from an edge-
// position pattern -- read directly off the fitted directions: the vertical
// family's unit vector is the one closest to (0,+-1), i.e. the smallest
// |x| component. (This replaces v2/v3's "farthest VP from image center"
// heuristic, which only made sense for a finite-VP camera model.)
const verticalFam = [0, 1, 2].map((f) => ({ f, absX: Math.abs(dirF[f][0]) })).sort((a, b) => a.absX - b.absX)[0].f;
console.log('Family directions (unit, sign arbitrary):', dirF.map((d, f) => `${f}:[${d[0].toFixed(4)},${d[1].toFixed(4)}]${f === verticalFam ? ' <- vertical' : ''}`).join('  '));

// --- Step 2: one joint linear solve for every house's T (R^3, world-axis
// index == family index) and per-axis scale, same shape as v2/v3's
// solveJointAnisotropic (a soft ground-plane row ties elevation across
// houses) but with the affine projection
// screen = sum_f (T[f] + lc[f]*L[f]) * dirF[f]
// in place of the perspective equation -- every coefficient below is a
// fixed dot product against the already-known dirF, never a function of an
// iterated camera estimate, so there is no Phase 1/2/3 split left to have
// ordering bugs in.
//
// No monocular-scale gauge (no "house0's Lz fixed = 1"), unlike v2/v3 --
// and deliberately so, not an oversight. Perspective projection is
// scale-invariant from the camera (screen = f*cam_xy/cam_z is unchanged by
// uniformly scaling the whole 3D structure), which is exactly why that
// gauge was both SAFE and NECESSARY there (real single-view metrology: one
// known length is required to fix what would otherwise be a free scale).
// Affine projection through the already-fixed unit-vector dirF has no such
// invariance -- scaling every T/L by k changes the predicted screen
// position by k -- so L and T are already fully and uniquely determined by
// the pixel data alone. Confirmed the hard way: an earlier version of this
// function fixed house0's axis-0 scale to 1 by analogy with v2/v3, which
// silently forced that axis to ~1px instead of the ~170-265px every other
// house solved for on its own, and reprojection error on house0 alone
// jumped to 85px average (96px max) versus 5-16px for every unconstrained
// house. Removing the gauge (every house gets the same 6 free unknowns)
// brings house0 back in line with the rest -- see the printed reprojection
// table below.
function solveJointAffine() {
  const H_ = cubeNames.length;
  const blockSize = 6; // every house: T0,T1,T2,L0,L1,L2 -- all free, no reference house.
  const base = (h) => h * blockSize;
  const nUnknowns = H_ * blockSize;
  const colsFor = (h) => ({ T: base(h), L: { 0: base(h) + 3, 1: base(h) + 4, 2: base(h) + 5 } });
  const AtA = Array.from({ length: nUnknowns }, () => new Array(nUnknowns).fill(0));
  const Atb = new Array(nUnknowns).fill(0);
  cubeNames.forEach((name, h) => {
    const verts = vertsByName[name], lcoords = localCoords[name];
    const { T: TCol, L } = colsFor(h);
    for (let i = 0; i < 6; i++) {
      if (!verts[i]) continue;
      const lc = lcoords[i], [px, py] = verts[i];
      for (const [axis, pVal] of [[0, px], [1, py]]) { // axis here means screen x(0)/y(1), unrelated to world-axis f
        const coeffs = new Array(nUnknowns).fill(0);
        for (let f = 0; f < 3; f++) { coeffs[TCol + f] = dirF[f][axis]; coeffs[L[f]] = lc[f] * dirF[f][axis]; }
        for (let ii = 0; ii < nUnknowns; ii++) { Atb[ii] += coeffs[ii] * pVal; for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj]; }
      }
    }
  });
  // Ground-plane row: tie world coordinate along the VERTICAL family equal
  // across houses (soft, weighted) -- "sie stehen alle auf der selben
  // Bodenflaeche". Unlike v2/v3 this needs no projection through a rotation
  // matrix: the vertical WORLD axis literally IS family index verticalFam.
  const GROUND_WEIGHT = 50000;
  const T0Col = colsFor(0).T;
  for (let h = 1; h < H_; h++) {
    const ThCol = colsFor(h).T;
    const coeffs = new Array(nUnknowns).fill(0);
    coeffs[ThCol + verticalFam] = GROUND_WEIGHT;
    coeffs[T0Col + verticalFam] -= GROUND_WEIGHT;
    for (let ii = 0; ii < nUnknowns; ii++) { for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj]; }
  }
  function solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      if (Math.abs(M[col][col]) < 1e-9) continue;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col] / M[col][col];
        for (let cc = col; cc <= n; cc++) M[r][cc] -= factor * M[col][cc];
      }
    }
    return M.map((row, i) => (Math.abs(row[i]) < 1e-9 ? 0 : row[n] / row[i]));
  }
  const sol = solveLinearSystem(AtA, Atb);
  const T = {}, scale = {};
  cubeNames.forEach((name, h) => {
    const { T: TCol, L } = colsFor(h);
    T[name] = [sol[TCol], sol[TCol + 1], sol[TCol + 2]];
    scale[name] = [0, 1, 2].map((f) => sol[L[f]]);
  });
  // E4-style sign-gauge fix (same identity as v2/v3, simpler here since
  // there is no rotation matrix to project through -- T and scale already
  // share the same world-axis indexing as dirF/localCoords):
  //   T'[axis] = T[axis] + L[axis] (L negative), L'[axis] = -L[axis],
  //   local-coord a'[axis] = 1 - a[axis].
  // Proven identity: T[axis] + a*L[axis] === T'[axis] + (1-a)*L'[axis]
  // for all a, so reprojection is exactly unchanged; only the SIGN
  // convention (and which local-coord value means "far corner") flips.
  cubeNames.forEach((name) => {
    let lc = localCoords[name];
    for (let axis = 0; axis < 3; axis++) {
      if (scale[name][axis] < 0) {
        const Lneg = scale[name][axis];
        T[name][axis] += Lneg;
        scale[name][axis] = -Lneg;
        lc = lc.map((v) => { const nv = v.slice(); nv[axis] = 1 - nv[axis]; return nv; });
        localCoords[name] = lc;
      }
    }
  });
  return { T, scale };
}
const { T, scale } = solveJointAffine();

function project(Th, Lh, lc) {
  let x = 0, y = 0;
  for (let f = 0; f < 3; f++) { const coeff = Th[f] + lc[f] * Lh[f]; x += coeff * dirF[f][0]; y += coeff * dirF[f][1]; }
  return [x, y];
}

// DEBUG: full 3-axis world position per house1 hexagon vertex (using the
// REAL post-sign-fix local coords), vs. the simplified Y=0-only formula
// used in the ground-texture-projection script -- to see exactly which
// vertices that simplification gets wrong and by how much.
const metersPerUnit = 3.0 / scale['house1'][1];
console.log('house1 localCoords (post sign-fix):', JSON.stringify(localCoords['house1']));
const verts1 = vertsByName['house1'];
localCoords['house1'].forEach((lc, i) => {
  const wx = (T['house1'][0] + lc[0]*scale['house1'][0]) * metersPerUnit;
  const wy = (T['house1'][1] + lc[1]*scale['house1'][1]) * metersPerUnit;
  const wz = (T['house1'][2] + lc[2]*scale['house1'][2]) * metersPerUnit;
  console.log('vertex', i, 'screen=', verts1[i], 'lc=', lc, '-> world (X,Y,Z)=', wx.toFixed(2), wy.toFixed(2), wz.toFixed(2));
});

console.log('\nPer-house affine solve: T (world, axis index = family index), Lx/Ly/Lz (axis order = family order), reprojection error:');
for (const name of cubeNames) {
  const verts = vertsByName[name], lcoords = localCoords[name], Th = T[name], Lh = scale[name];
  let sumErr = 0, maxErr = 0, n = 0;
  for (let i = 0; i < 6; i++) {
    if (!verts[i]) continue;
    const [px, py] = project(Th, Lh, lcoords[i]);
    const err = Math.hypot(px - verts[i][0], py - verts[i][1]);
    sumErr += err; maxErr = Math.max(maxErr, err); n++;
  }
  console.log(`  ${name}: T=[${Th.map((v) => v.toFixed(2))}]  scale(f0/f1/f2)=[${Lh.map((v) => v.toFixed(3))}]  avgReprojError=${(sumErr / n).toFixed(3)}px  maxReprojError=${maxErr.toFixed(3)}px`);
}

// Ground-plane spread (should be near-zero -- direct evidence the houses
// really do end up on one shared plane, not merely constrained to look like
// it in reprojection):
const groundVals = cubeNames.map((name) => T[name][verticalFam]);
const groundMean = groundVals.reduce((s, v) => s + v, 0) / groundVals.length;
const groundSpread = Math.sqrt(groundVals.reduce((s, v) => s + (v - groundMean) ** 2, 0) / groundVals.length);
console.log(`\nGround-plane (family ${verticalFam}) spread across houses: stddev=${groundSpread.toFixed(4)} (values: ${groundVals.map((v) => v.toFixed(3)).join(', ')})`);

// Footprint (the two non-vertical axes) -- this is the actual arrangement
// claim ("rotated U") the pinhole pipeline got wrong. Printed directly so it
// can be sanity-checked without a 3D renderer.
const footprintAxes = [0, 1, 2].filter((f) => f !== verticalFam);
console.log(`\nFootprint (axes ${footprintAxes.join(',')}) house-origin positions, for arrangement sanity check:`);
for (const name of cubeNames) console.log(`  ${name}: [${footprintAxes.map((f) => T[name][f].toFixed(3)).join(', ')}]`);

fs.writeFileSync(
  path.join(OUT, 'village-reconstructed-affine.json'),
  JSON.stringify({ W, H, dirF, verticalFam, T, scale, localCoords }, null, 2),
);
console.log('\nWrote village-reconstructed-affine.json');
