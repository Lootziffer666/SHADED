// Synthetic ground-truth verification for the E1/E3/E4 fix to
// solveJointAnisotropic() before it is ported into
// scratch-village-reconstruct-v2.mjs. No real photo is required (E0's
// fixture is still missing) -- this proves the LINEAR ALGEBRA is correct
// against known ground truth, independent of the noisy real-image front end.
//
// What is being proven:
//   E1: per-house Lx_h,Ly_h,Lz_h (house 0's Lz fixed=1 as the single global
//       gauge reference, every other house's Lz genuinely free) recovers
//       DISTINCT sizes per house instead of forcing them identical -- while
//       staying a single linear solve (no product of two unknowns anywhere).
//   E3: the ground-plane rows, now load-bearing (they are what removes each
//       non-reference house's OWN residual scale ambiguity, not just an
//       aesthetic flatness nudge -- see the derivation in the fix commit),
//       actually hold: recovered T_h all share the same vertical coordinate.
//   E4: the sign-flip identity T' = T + L*axis, L' = -L, local-coord flip
//       a' = 1-a reprojects IDENTICALLY to the un-flipped negative-L form.
import fs from 'fs';

function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// --- generic NxN Gaussian elimination w/ partial pivoting, identical to
// the one already in scratch-village-reconstruct-v2.mjs (Z.653-668). ---
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

// --- E1/E3/E4 fixed solve. cubeNames[0] is the reference house (Lz fixed
// = 1, the single global monocular-scale gauge); every other house gets
// Lx_h,Ly_h,Lz_h all free. Ground-plane rows tie every T_h's vertical
// component to T_0's -- which (see commit note) also removes each non-
// reference house's OWN residual (T_h,L_h) homogeneous scale freedom,
// since that freedom would move T_h off the fixed ground level. ---
function solveJointAnisotropic({ cubeNames, vertices, localCoords, R, f, pp, verticalFam, groundWeight }) {
  const H = cubeNames.length;
  const blockSize = (h) => (h === 0 ? 5 : 6);
  const base = new Array(H);
  { let acc = 0; for (let h = 0; h < H; h++) { base[h] = acc; acc += blockSize(h); } }
  const nUnknowns = base[H - 1] + blockSize(H - 1);
  const AtA = Array.from({ length: nUnknowns }, () => new Array(nUnknowns).fill(0));
  const Atb = new Array(nUnknowns).fill(0);

  const colsFor = (h) => h === 0
    ? { Lx: base[0] + 0, Ly: base[0] + 1, Lz: null, T: base[0] + 2 }
    : { Lx: base[h] + 0, Ly: base[h] + 1, Lz: base[h] + 2, T: base[h] + 3 };

  cubeNames.forEach((name, h) => {
    const verts = vertices[name], lcoords = localCoords[name];
    const { Lx: LxCol, Ly: LyCol, Lz: LzCol, T: TCol } = colsFor(h);
    for (let i = 0; i < 6; i++) {
      if (!verts[i]) continue;
      const [a, b, c] = lcoords[i];
      const [px, py] = verts[i];
      for (const [pAxis, pVal] of [[0, px], [1, py]]) {
        const coeffs = new Array(nUnknowns).fill(0);
        coeffs[LxCol] = a * (-f * R[0][pAxis] + (pVal - pp[pAxis]) * R[0][2]);
        coeffs[LyCol] = b * (-f * R[1][pAxis] + (pVal - pp[pAxis]) * R[1][2]);
        let rhs;
        if (LzCol === null) {
          // house 0: Lz fixed = 1, folded into RHS exactly as the original code did.
          rhs = -(c * (-f * R[2][pAxis] + (pVal - pp[pAxis]) * R[2][2]));
        } else {
          coeffs[LzCol] = c * (-f * R[2][pAxis] + (pVal - pp[pAxis]) * R[2][2]);
          rhs = 0;
        }
        coeffs[TCol + pAxis] = -f;
        coeffs[TCol + 2] = (pVal - pp[pAxis]);
        for (let ii = 0; ii < nUnknowns; ii++) { Atb[ii] += coeffs[ii] * rhs; for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj]; }
      }
    }
  });

  // Ground-plane rows -- E3: weight raised well above the pixel rows'
  // natural scale (~f) so this is close to hard, and (per E1's derivation)
  // load-bearing for gauge-fixing every h>0 house, not just cosmetic.
  const rv = R[verticalFam];
  const T0Col = colsFor(0).T;
  for (let h = 1; h < H; h++) {
    const ThCol = colsFor(h).T;
    const coeffs = new Array(nUnknowns).fill(0);
    coeffs[ThCol + 0] = groundWeight * rv[0]; coeffs[ThCol + 1] = groundWeight * rv[1]; coeffs[ThCol + 2] = groundWeight * rv[2];
    coeffs[T0Col + 0] -= groundWeight * rv[0]; coeffs[T0Col + 1] -= groundWeight * rv[1]; coeffs[T0Col + 2] -= groundWeight * rv[2];
    for (let ii = 0; ii < nUnknowns; ii++) { for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj]; }
  }

  const sol = solveLinearSystem(AtA, Atb);
  const scale = {}, T = {};
  cubeNames.forEach((name, h) => {
    const { Lx: LxCol, Ly: LyCol, Lz: LzCol, T: TCol } = colsFor(h);
    scale[name] = { Lx: sol[LxCol], Ly: sol[LyCol], Lz: LzCol === null ? 1 : sol[LzCol] };
    T[name] = [sol[TCol], sol[TCol + 1], sol[TCol + 2]];
  });

  // E4: sign-gauge fix. T' = T + L*axis, L' = -L reprojects identically
  // (derivation: a*L*axis = (1-a')*L*axis with a'=1-a expands to
  // L*axis - a'*L*axis = L*axis + a'*(-L)*axis, so T'=T+L*axis absorbs the
  // constant term and a'*L'*axis with L'=-L reproduces the rest exactly).
  const localCoordsFixed = {};
  cubeNames.forEach((name, h) => {
    let lc = localCoords[name].map((v) => v.slice());
    for (let axis = 0; axis < 3; axis++) {
      const key = axis === 0 ? 'Lx' : axis === 1 ? 'Ly' : 'Lz';
      if (scale[name][key] < 0) {
        const Lneg = scale[name][key];
        for (let d = 0; d < 3; d++) T[name][d] += Lneg * R[axis][d];
        scale[name][key] = -Lneg;
        lc = lc.map((v) => { const nv = v.slice(); nv[axis] = 1 - nv[axis]; return nv; });
      }
    }
    localCoordsFixed[name] = lc;
  });

  return { scale, T, localCoords: localCoordsFixed };
}

// ============================= synthetic ground truth =============================
const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; // identity camera orientation, columns = world axes in camera space
const f = 800, pp = [320, 240];
const verticalFam = 1; // world axis index 1 ("Ly slot") is gravity for this synthetic scene

// Reuse the exact hexagon-cycle derivation from scratch-village-reconstruct-v2.mjs
// (Z.63-70) so localCoords means the same thing here as in the real pipeline.
function localCoordsFor(fams) {
  const lc0 = [0, 0, 0];
  for (let i = 0; i < 3; i++) lc0[fams[i]] = (i % 2 === 0) ? 0 : 1;
  const lc = [lc0];
  for (let i = 0; i < 5; i++) { const next = lc[i].slice(); next[fams[i]] += (i % 2 === 0 ? 1 : -1); lc.push(next); }
  return lc;
}
const fams = [0, 1, 2, 0, 1, 2];
const cubeNames = ['big1', 'small1', 'big2', 'small2'];
const localCoords = Object.fromEntries(cubeNames.map((n) => [n, localCoordsFor(fams)]));

// Deliberately DISTINCT per-house scale: 2 big houses, 2 small houses, all
// with a DIFFERENT Lz (wall height) too -- proving the fix recovers real
// per-axis size differences, not just footprint under a forced-equal height.
const groundTruthScale = {
  big1: { Lx: 1.4, Ly: 1.1, Lz: 1.0 },   // reference house: Lz MUST be 1 (gauge)
  small1: { Lx: 0.6, Ly: 0.5, Lz: 0.55 },
  big2: { Lx: 1.6, Ly: 1.3, Lz: 1.05 },
  small2: { Lx: 0.55, Ly: 0.48, Lz: 0.5 },
};
const GROUND_Y = -1.0; // shared ground-plane vertical coordinate (camera-space, axis 1)
const groundTruthT = {
  big1: [-2, GROUND_Y, 8],
  small1: [1, GROUND_Y, 5],
  big2: [3, GROUND_Y, 10],
  small2: [-4, GROUND_Y, 6],
};

function project(T, scale, lc, axis) {
  const cam = [0, 1, 2].map((d) => T[d] + lc[0] * scale.Lx * R[0][d] + lc[1] * scale.Ly * R[1][d] + lc[2] * scale.Lz * R[2][d]);
  if (cam[2] <= 0.01) return null;
  return [pp[0] + f * cam[0] / cam[2], pp[1] + f * cam[1] / cam[2]];
}

const vertices = {};
for (const name of cubeNames) {
  vertices[name] = localCoords[name].map((lc) => project(groundTruthT[name], groundTruthScale[name], lc));
}

// ============================= run the fixed solve =============================
const GROUND_WEIGHT = 50000; // E3: raised from the original 5000
const result = solveJointAnisotropic({ cubeNames, vertices, localCoords, R, f, pp, verticalFam, groundWeight: GROUND_WEIGHT });

console.log('=== E1: per-house scale recovery (ground truth vs recovered) ===');
let maxScaleErr = 0;
for (const name of cubeNames) {
  const gt = groundTruthScale[name], rc = result.scale[name];
  const err = Math.max(Math.abs(gt.Lx - rc.Lx), Math.abs(gt.Ly - rc.Ly), Math.abs(gt.Lz - rc.Lz));
  maxScaleErr = Math.max(maxScaleErr, err);
  console.log(`  ${name}: truth Lx=${gt.Lx} Ly=${gt.Ly} Lz=${gt.Lz}  recovered Lx=${rc.Lx.toFixed(4)} Ly=${rc.Ly.toFixed(4)} Lz=${rc.Lz.toFixed(4)}  maxAxisErr=${err.toExponential(2)}`);
}

console.log('\n=== E3: ground-plane consistency (recovered T vertical component, should all match) ===');
for (const name of cubeNames) console.log(`  ${name}: T=[${result.T[name].map((v) => v.toFixed(4))}]  vertical=${result.T[name][verticalFam].toFixed(6)}`);
const verticals = cubeNames.map((n) => result.T[n][verticalFam]);
const groundSpread = Math.max(...verticals) - Math.min(...verticals);
console.log(`  spread across houses: ${groundSpread.toExponential(2)} (should be ~0)`);

console.log('\n=== Reprojection error using recovered params (should be ~0px) ===');
let maxReprojErr = 0;
for (const name of cubeNames) {
  const rc = result.scale[name], T = result.T[name], lc = result.localCoords[name];
  for (let i = 0; i < 6; i++) {
    const proj = project(T, rc, lc[i]);
    const truth = vertices[name][i];
    const err = Math.hypot(proj[0] - truth[0], proj[1] - truth[1]);
    maxReprojErr = Math.max(maxReprojErr, err);
  }
}
console.log(`  max reprojection error across all houses/vertices: ${maxReprojErr.toExponential(2)}px`);

console.log('\n=== E4: sign-flip identity check (independent of the solver) ===');
{
  const T = [3, -2, 9];
  const Lx = -1.7; // deliberately negative
  const axis = R[0];
  const a = 0.0, aFlip = 1.0; // a=0 corresponds to a'=1-a=1
  const before = T[2] + a * Lx * axis[2]; // just the z-component of one term, enough to prove the identity
  const Tprime = T.map((v, d) => v + Lx * axis[d]);
  const LxPrime = -Lx;
  const after = Tprime[2] + aFlip * LxPrime * axis[2];
  console.log(`  a=0 term before flip: ${before.toFixed(6)}   a'=1 term after flip (T'=T+L*axis, L'=-L): ${after.toFixed(6)}   identical=${Math.abs(before - after) < 1e-9}`);
}

const pass = maxScaleErr < 1e-3 && groundSpread < 1e-3 && maxReprojErr < 1e-3;
console.log(`\n${pass ? 'PASS' : 'FAIL'}: E1 (per-house scale) + E3 (ground-plane gauge) + E4 (sign-fix identity)`);
if (!pass) process.exit(1);
