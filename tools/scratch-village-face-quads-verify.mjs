// Sanity test requested before trusting face-quad measurements on the real
// village: does adding the interior (1,1,1) corner -- the point where all
// 3 visible faces (roof/wallLight/wallDark) meet, which the material
// segmentation in scratch-village-extract-v2.mjs already measures once it
// keeps each part's OWN hull instead of only the union hull -- actually
// change whether a known ANISOTROPIC cuboid is recoverable, or is the
// hexagon-only system already sufficient in exact arithmetic and the real
// village's near-isotropic result is a noise/conditioning problem instead?
//
// Uses the ACTUAL recovered camera (R, f, pp) from this session's real
// run (tools/verify-out/village-reconstructed-v2.json) -- not a clean
// synthetic camera -- specifically because that camera's vertical family
// has a vanishing point ~8642px from the image center (near-parallel
// verticals, weak perspective on that axis), which is exactly the kind of
// geometry that could make the hexagon-only system nearly (not exactly)
// singular even though it is exactly solvable on paper.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'verify-out', 'village-reconstructed-v2.json'), 'utf8'));
const R = real.R, f = real.f, pp = real.pp;
// Same local-coordinate structure as every house in this run (verified by
// hand above): v0=(0,0,1) v1=(1,0,1) v2=(1,0,0) v3=(1,1,0) v4=(0,1,0)
// v5=(0,1,1), interior/shared corner = (1,1,1).
const HEX_LC = [[0, 0, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1]];
const INTERIOR_LC = [1, 1, 1];

function project(T, scale, lc) {
  const cam = [0, 1, 2].map((d) => T[d] + lc[0] * scale.Lx * R[0][d] + lc[1] * scale.Ly * R[1][d] + lc[2] * scale.Lz * R[2][d]);
  if (cam[2] <= 0.01) return null;
  return [pp[0] + f * cam[0] / cam[2], pp[1] + f * cam[1] / cam[2]];
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

// Jacobi eigenvalue algorithm for a small symmetric matrix -- gives exact
// eigenvalues/eigenvectors, not just a pivot heuristic, so "how singular"
// and "singular in WHICH direction" are both answerable.
function jacobiEigen(Ain, iters = 100) {
  const n = Ain.length;
  let A = Ain.map((r) => r.slice());
  let V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < iters; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-18) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        const App = A[p][p], Aqq = A[q][q], Apq = A[p][q];
        A[p][p] = c * c * App - 2 * s * c * Apq + s * s * Aqq;
        A[q][q] = s * s * App + 2 * s * c * Apq + c * c * Aqq;
        A[p][q] = A[q][p] = 0;
        for (let i = 0; i < n; i++) {
          if (i === p || i === q) continue;
          const Aip = A[i][p], Aiq = A[i][q];
          A[i][p] = A[p][i] = c * Aip - s * Aiq;
          A[i][q] = A[q][i] = s * Aip + c * Aiq;
        }
        for (let i = 0; i < n; i++) {
          const Vip = V[i][p], Viq = V[i][q];
          V[i][p] = c * Vip - s * Viq;
          V[i][q] = s * Vip + c * Viq;
        }
      }
    }
  }
  const eigenvalues = A.map((row, i) => row[i]);
  const order = eigenvalues.map((_, i) => i).sort((a, b) => Math.abs(eigenvalues[a]) - Math.abs(eigenvalues[b]));
  return { eigenvalues: order.map((i) => eigenvalues[i]), eigenvectors: order.map((i) => V.map((row) => row[i])) };
}

// Single-house linear system: unknowns [Lx, Ly, Tx, Ty, Tz], Lz fixed=1
// (same as house-0's block in solveJointAnisotropic). `points` is a list
// of { lc:[a,b,c], px:[x,y] } -- either just the 6 hexagon points, or the
// hexagon plus repeated (possibly noisy) observations of (1,1,1).
function solveSingleHouse(points) {
  const nUnknowns = 5;
  const AtA = Array.from({ length: nUnknowns }, () => new Array(nUnknowns).fill(0));
  const Atb = new Array(nUnknowns).fill(0);
  for (const { lc: [a, b, c], px: [px, py] } of points) {
    for (const [pAxis, pVal] of [[0, px], [1, py]]) {
      const coeffs = new Array(nUnknowns).fill(0);
      coeffs[0] = a * (-f * R[0][pAxis] + (pVal - pp[pAxis]) * R[0][2]);
      coeffs[1] = b * (-f * R[1][pAxis] + (pVal - pp[pAxis]) * R[1][2]);
      coeffs[2 + pAxis] = -f;
      coeffs[4] = (pVal - pp[pAxis]);
      const rhs = -(c * (-f * R[2][pAxis] + (pVal - pp[pAxis]) * R[2][2]));
      for (let ii = 0; ii < nUnknowns; ii++) { Atb[ii] += coeffs[ii] * rhs; for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj]; }
    }
  }
  const sol = solveLinearSystem(AtA, Atb);
  const scale = { Lx: sol[0], Ly: sol[1], Lz: 1 };
  const T = [sol[2], sol[3], sol[4]];
  let sumErr = 0, maxErr = 0;
  for (const { lc, px } of points) {
    const proj = project(T, scale, lc);
    const err = proj ? Math.hypot(proj[0] - px[0], proj[1] - px[1]) : Infinity;
    sumErr += err; maxErr = Math.max(maxErr, err);
  }
  const { eigenvalues, eigenvectors } = jacobiEigen(AtA);
  return { scale, T, avgErr: sumErr / points.length, maxErr, eigenvalues, eigenvectors, AtA };
}

// ============================= ground truth =============================
const TRUTH = { Lx: 2.4, Ly: 1.3, Lz: 1.0 };
// Representative T: similar depth/offset to the real houses (T camera-z
// around 5-20 in this run's units), keeping every corner in front of camera.
const T_TRUE = [1.5, -3.0, 9.0];

const hexPoints = HEX_LC.map((lc) => ({ lc, px: project(T_TRUE, TRUTH, lc) }));
const interiorPx = project(T_TRUE, TRUTH, INTERIOR_LC);

console.log('=== Ground truth ===');
console.log(`  Lx=${TRUTH.Lx} Ly=${TRUTH.Ly} Lz=${TRUTH.Lz}  Lx/Lz=${(TRUTH.Lx / TRUTH.Lz).toFixed(3)} Ly/Lz=${(TRUTH.Ly / TRUTH.Lz).toFixed(3)}`);

console.log('\n=== Configuration A: hexagon-only (6 points, current v2 behavior) ===');
const resA = solveSingleHouse(hexPoints);
console.log(`  recovered Lx=${resA.scale.Lx.toFixed(6)} Ly=${resA.scale.Ly.toFixed(6)}  Lx/Lz=${resA.scale.Lx.toFixed(3)} Ly/Lz=${resA.scale.Ly.toFixed(3)}`);
console.log(`  avgReprojErr=${resA.avgErr.toExponential(2)}px maxReprojErr=${resA.maxErr.toExponential(2)}px`);
console.log(`  AtA eigenvalues (smallest first): ${resA.eigenvalues.map((v) => v.toExponential(2)).join(', ')}`);
console.log(`  condition number (|max|/|min|): ${(Math.max(...resA.eigenvalues.map(Math.abs)) / Math.abs(resA.eigenvalues[0])).toExponential(2)}`);
console.log(`  smallest-eigenvalue eigenvector [Lx,Ly,Tx,Ty,Tz]: [${resA.eigenvectors[0].map((v) => v.toFixed(3))}]`);

console.log('\n=== Configuration B: hexagon + 3x interior-point (1,1,1) observations (E5-style face measurement) ===');
const interiorPoints = [0, 1, 2].map(() => ({ lc: INTERIOR_LC, px: interiorPx })); // 3 independent (here noiseless) observations, as roof/wallLight/wallDark each measure it
const resB = solveSingleHouse([...hexPoints, ...interiorPoints]);
console.log(`  recovered Lx=${resB.scale.Lx.toFixed(6)} Ly=${resB.scale.Ly.toFixed(6)}  Lx/Lz=${resB.scale.Lx.toFixed(3)} Ly/Lz=${resB.scale.Ly.toFixed(3)}`);
console.log(`  avgReprojErr=${resB.avgErr.toExponential(2)}px maxReprojErr=${resB.maxErr.toExponential(2)}px`);
console.log(`  AtA eigenvalues (smallest first): ${resB.eigenvalues.map((v) => v.toExponential(2)).join(', ')}`);
console.log(`  condition number (|max|/|min|): ${(Math.max(...resB.eigenvalues.map(Math.abs)) / Math.abs(resB.eigenvalues[0])).toExponential(2)}`);

console.log('\n=== Configuration C: hexagon-only, but with REALISTIC pixel noise (+-1.5px, matching typical mask-edge measurement noise) ===');
function seededRandom(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const rnd = seededRandom(42);
const noisyHex = hexPoints.map(({ lc, px }) => ({ lc, px: [px[0] + (rnd() - 0.5) * 3, px[1] + (rnd() - 0.5) * 3] }));
const resC = solveSingleHouse(noisyHex);
console.log(`  recovered Lx=${resC.scale.Lx.toFixed(3)} Ly=${resC.scale.Ly.toFixed(3)}  (truth 2.4/1.3)  avgReprojErr=${resC.avgErr.toFixed(2)}px`);

console.log('\n=== Configuration D: hexagon + 3x interior-point, SAME pixel noise as C (independent noise draws per interior observation, matching 3 separate face measurements) ===');
const noisyInterior = [0, 1, 2].map(() => ({ lc: INTERIOR_LC, px: [interiorPx[0] + (rnd() - 0.5) * 3, interiorPx[1] + (rnd() - 0.5) * 3] }));
const resD = solveSingleHouse([...noisyHex, ...noisyInterior]);
console.log(`  recovered Lx=${resD.scale.Lx.toFixed(3)} Ly=${resD.scale.Ly.toFixed(3)}  (truth 2.4/1.3)  avgReprojErr=${resD.avgErr.toFixed(2)}px`);

const ratioOk = (s) => Math.abs(s.Lx - TRUTH.Lx) / TRUTH.Lx < 0.01 && Math.abs(s.Ly - TRUTH.Ly) / TRUTH.Ly < 0.01;
console.log(`\nA (hex-only, noiseless) recovers true ratios within 1%: ${ratioOk(resA.scale)}`);
console.log(`C (hex-only, +-1.5px noise) recovers true ratios within 1%: ${ratioOk(resC.scale)}`);
console.log(`D (hex+interior, same noise) recovers true ratios within 1%: ${ratioOk(resD.scale)}`);
