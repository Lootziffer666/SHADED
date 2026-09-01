// SCRATCH -- metric affine/orthographic reconstruction for image families
// whose parallel-edge evidence does not support a finite pinhole camera.
//
// A metric orthographic camera projects X with a 2x3 matrix P whose rows are
// orthogonal and have equal norm. The three image-axis columns are therefore
// NOT merely three unit directions: their relative magnitudes encode axis
// foreshortening. We recover those magnitudes from P*P^T = s^2 I, leaving only
// one harmless global scene-scale gauge.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
fs.mkdirSync(OUT, { recursive: true });
const raw = JSON.parse(fs.readFileSync(path.join(OUT, 'village-raw2d-v2.json'), 'utf8'));
const { W, H, cubes: rawCubes } = raw;
const cubeNames = Object.keys(rawCubes);
const famAssignment = Object.fromEntries(cubeNames.map((n) => [n, rawCubes[n].famAssignment]));
const vertsByName = Object.fromEntries(cubeNames.map((n) => [n, rawCubes[n].rawPoly.map((p) => (p ? [p[0], p[1]] : null))]));

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
    sx += Math.cos(ang2) * len;
    sy += Math.sin(ang2) * len;
  }
  const meanAng = Math.atan2(sy, sx) / 2;
  return [Math.cos(meanAng), Math.sin(meanAng)];
}

const unitDirF = [0, 1, 2].map((f) => familyDirection(familyEdges(f)));
const verticalFam = [0, 1, 2]
  .map((f) => ({ f, absX: Math.abs(unitDirF[f][0]) }))
  .sort((a, b) => a.absX - b.absX)[0].f;

// Fix the GLOBAL vertical sign before constructing any ground equations.
// Image Y grows downward, so positive world-up must project toward -Y.
if (unitDirF[verticalFam][1] > 0) {
  unitDirF[verticalFam] = unitDirF[verticalFam].map((v) => -v);
}

// P has columns p_i = m_i*u_i. Metric orthographic projection requires
// P*P^T = s^2 I. With w_i=m_i^2 this gives two homogeneous LINEAR equations:
//   sum w_i (ux_i^2-uy_i^2) = 0
//   sum w_i (2 ux_i uy_i)    = 0
// Their 1-D nullspace determines all relative foreshortening magnitudes.
function metricAxisColumns(unitDirs) {
  const a = unitDirs.map(([x, y]) => x * x - y * y);
  const b = unitDirs.map(([x, y]) => 2 * x * y);
  let w = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const eps = 1e-8;
  if (w.every((v) => v < -eps)) w = w.map((v) => -v);
  if (!w.every((v) => v > eps)) {
    throw new Error(`Affine metric constraints have no positive foreshortening solution: w=[${w.join(', ')}]. Projection family is not supported as metric orthographic.`);
  }
  const mean = w.reduce((s, v) => s + v, 0) / w.length;
  w = w.map((v) => v / mean); // global scale gauge only
  return unitDirs.map((u, i) => {
    const m = Math.sqrt(w[i]);
    return [u[0] * m, u[1] * m];
  });
}
const dirF = metricAxisColumns(unitDirF);

// Ensure local vertical coordinate 0 is the lower/ground face for EVERY house
// before the ground-plane rows are assembled. This prevents a later sign flip
// from moving differently sized houses off the plane we just constrained.
for (const name of cubeNames) {
  const verts = vertsByName[name];
  const lc = localCoords[name];
  const means = [0, 1].map((level) => {
    const ys = lc.map((v, i) => v[verticalFam] === level && verts[i] ? verts[i][1] : null).filter(Number.isFinite);
    return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : NaN;
  });
  // Positive vertical projects upward, so level 1 should have SMALLER image Y.
  if (Number.isFinite(means[0]) && Number.isFinite(means[1]) && means[1] > means[0]) {
    localCoords[name] = lc.map((v) => {
      const out = v.slice();
      out[verticalFam] = 1 - out[verticalFam];
      return out;
    });
  }
}

console.log('Metric affine columns:', dirF.map((d, f) => `${f}:[${d[0].toFixed(4)},${d[1].toFixed(4)}]${f === verticalFam ? ' <- vertical' : ''}`).join('  '));

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

function solveJointAffine() {
  const houseCount = cubeNames.length;
  const blockSize = 6; // T0,T1,T2,L0,L1,L2
  const base = (h) => h * blockSize;
  const nUnknowns = houseCount * blockSize;
  const colsFor = (h) => ({ T: base(h), L: [base(h) + 3, base(h) + 4, base(h) + 5] });
  const AtA = Array.from({ length: nUnknowns }, () => new Array(nUnknowns).fill(0));
  const Atb = new Array(nUnknowns).fill(0);

  cubeNames.forEach((name, h) => {
    const verts = vertsByName[name], lcoords = localCoords[name];
    const { T: TCol, L } = colsFor(h);
    for (let i = 0; i < 6; i++) {
      if (!verts[i]) continue;
      const lc = lcoords[i], [px, py] = verts[i];
      for (const [screenAxis, pVal] of [[0, px], [1, py]]) {
        const coeffs = new Array(nUnknowns).fill(0);
        for (let f = 0; f < 3; f++) {
          coeffs[TCol + f] = dirF[f][screenAxis];
          coeffs[L[f]] = lc[f] * dirF[f][screenAxis];
        }
        for (let ii = 0; ii < nUnknowns; ii++) {
          Atb[ii] += coeffs[ii] * pVal;
          for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj];
        }
      }
    }
  });

  // T[verticalFam] is now the actual lower face because the vertical sign and
  // local-coordinate orientation were fixed above, before this constraint.
  const GROUND_WEIGHT = 50000;
  const T0Col = colsFor(0).T;
  for (let h = 1; h < houseCount; h++) {
    const ThCol = colsFor(h).T;
    const coeffs = new Array(nUnknowns).fill(0);
    coeffs[ThCol + verticalFam] = GROUND_WEIGHT;
    coeffs[T0Col + verticalFam] -= GROUND_WEIGHT;
    for (let ii = 0; ii < nUnknowns; ii++) for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj];
  }

  const sol = solveLinearSystem(AtA, Atb);
  const T = {}, scale = {};
  cubeNames.forEach((name, h) => {
    const { T: TCol, L } = colsFor(h);
    T[name] = [sol[TCol], sol[TCol + 1], sol[TCol + 2]];
    scale[name] = [sol[L[0]], sol[L[1]], sol[L[2]]];
  });

  // The vertical sign is already physically fixed and participates in the
  // ground constraint. A negative vertical length is therefore a failed fit,
  // not permission to move the house after the fact.
  for (const name of cubeNames) {
    if (!(scale[name][verticalFam] > 0)) {
      throw new Error(`${name}: vertical length is non-positive after ground-oriented solve (${scale[name][verticalFam]}).`);
    }
    let lc = localCoords[name];
    for (let axis = 0; axis < 3; axis++) {
      if (axis === verticalFam || scale[name][axis] >= 0) continue;
      const Lneg = scale[name][axis];
      T[name][axis] += Lneg;
      scale[name][axis] = -Lneg;
      lc = lc.map((v) => { const nv = v.slice(); nv[axis] = 1 - nv[axis]; return nv; });
    }
    localCoords[name] = lc;
  }
  return { T, scale };
}
const { T, scale } = solveJointAffine();

function project(Th, Lh, lc) {
  let x = 0, y = 0;
  for (let f = 0; f < 3; f++) {
    const coeff = Th[f] + lc[f] * Lh[f];
    x += coeff * dirF[f][0];
    y += coeff * dirF[f][1];
  }
  return [x, y];
}

let globalMaxErr = 0;
console.log('\nPer-house metric-affine solve:');
for (const name of cubeNames) {
  const verts = vertsByName[name], lcoords = localCoords[name], Th = T[name], Lh = scale[name];
  let sumErr = 0, maxErr = 0, n = 0;
  for (let i = 0; i < 6; i++) {
    if (!verts[i]) continue;
    const [px, py] = project(Th, Lh, lcoords[i]);
    const err = Math.hypot(px - verts[i][0], py - verts[i][1]);
    sumErr += err; maxErr = Math.max(maxErr, err); n++;
  }
  globalMaxErr = Math.max(globalMaxErr, maxErr);
  console.log(`  ${name}: T=[${Th.map((v) => v.toFixed(2))}] scale=[${Lh.map((v) => v.toFixed(3))}] avg=${(sumErr / n).toFixed(3)}px max=${maxErr.toFixed(3)}px`);
}

const groundVals = cubeNames.map((name) => T[name][verticalFam]);
const groundMean = groundVals.reduce((s, v) => s + v, 0) / groundVals.length;
const groundSpread = Math.sqrt(groundVals.reduce((s, v) => s + (v - groundMean) ** 2, 0) / groundVals.length);
console.log(`\nGround-plane family ${verticalFam}: stddev=${groundSpread.toFixed(6)}`);

const footprintAxes = [0, 1, 2].filter((f) => f !== verticalFam);
console.log(`Footprint axes ${footprintAxes.join(',')}:`);
for (const name of cubeNames) console.log(`  ${name}: [${footprintAxes.map((f) => T[name][f].toFixed(3)).join(', ')}]`);

if (!Number.isFinite(globalMaxErr) || !Number.isFinite(groundSpread)) {
  throw new Error('Metric-affine reconstruction produced non-finite verification metrics.');
}

fs.writeFileSync(
  path.join(OUT, 'village-reconstructed-affine.json'),
  JSON.stringify({ W, H, dirF, unitDirF, verticalFam, T, scale, localCoords, verification: { globalMaxErr, groundSpread } }, null, 2),
);
console.log('\nWrote village-reconstructed-affine.json');
