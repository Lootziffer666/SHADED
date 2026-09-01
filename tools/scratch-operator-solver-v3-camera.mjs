// SCRATCH v3 -- same 8 operators, same maintainer framing, but fixing the
// architectural issue v2's debugging session actually surfaced: v2 kept
// independently re-fitting 3 vanishing-point POSITIONS from live (still
// noisy, still-being-corrected) edges on every single call, then checked
// whether the resulting axes were orthogonal, then tried to nudge that
// violation down. That's backwards. docs/synthetic-visual-reverse-
// engineering.md says it plainly (Piazza-Prinzip, section 6): collect
// relations first, solve the hard global structure ONCE, then let local
// operators enforce it -- never have local operators fight a
// simultaneously-still-being-re-derived global fit.
//
// v3 therefore parametrizes the camera's orientation as an actual 3x3
// ROTATION MATRIX (state.R). A rotation matrix's columns are orthonormal
// BY CONSTRUCTION -- orthogonality between the 3 world axes is no longer a
// soft energy term an operator tries to reduce (which is what got stuck: a
// numerical gradient chasing a target that itself depended on the same
// unstable VP-position fit). It is now a structural guarantee that cannot
// be violated, which is the most literal possible reading of "harte
// Constraints nie von weichen Operatoren ueberschreiben lassen" applied to
// the ORTHO constraint specifically.
//
// Camera model: state.R (3x3, columns = world axes in camera space,
// exactly orthonormal), state.pp (principal point), state.f (focal
// length). A family's vanishing point is DERIVED (read-only, same
// discipline as v2) by projecting its axis column through (pp, f) -- never
// itself a mutated parameter. What operators actually perturb is: small
// bounded-angle rotations of R (Rodrigues, always exactly orthonormal
// after composition), and pp/f as plain well-conditioned scalars -- none
// of which can ever divide by a near-zero denominator the way raw VP
// pixel coordinates could.
import fs from 'fs';

const svm = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/svm-full.json', 'utf8'));
const { W, H, pp: ppTruth, f: fTruth, VP: vpTruth, reconstructed } = svm;

function seededRandom(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const rand = seededRandom(42); // same seed as v2 -- fair, directly comparable run
function gaussian() { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const cubeNames = Object.keys(reconstructed);
const famAssignment = {};
for (const name of cubeNames) {
  const lc = reconstructed[name].localCoords;
  const fams = [];
  for (let i = 0; i < 6; i++) { const a = lc[i], b = lc[(i + 1) % 6]; fams.push([0, 1, 2].find(k => a[k] !== b[k])); }
  famAssignment[name] = fams;
}
function localCoordsFor(name) {
  const lc = [[0, 0, 0]];
  for (let i = 0; i < 5; i++) { const next = lc[i].slice(); const fam = famAssignment[name][i]; const dir = Math.sign(reconstructed[name].localCoords[(i + 1) % 6][fam] - reconstructed[name].localCoords[i][fam]) || 1; next[fam] += dir; lc.push(next); }
  return lc;
}
const localCoords = Object.fromEntries(cubeNames.map(n => [n, localCoordsFor(n)]));

const NOISE_STD = Number(process.env.NOISE_STD || 20); // px -- default matches v2's aggressive stress level for comparability
const state = { cubes: {} };
for (const name of cubeNames) {
  const truth = reconstructed[name].measured;
  state.cubes[name] = { vertices: truth.map(([x, y]) => [x + gaussian() * NOISE_STD, y + gaussian() * NOISE_STD]) };
}

// --- vector / matrix helpers ---
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function norm2([x, y]) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
// 3x3 matrices as arrays of 3 COLUMN vectors: M = [col0, col1, col2].
function matMul(A, B) { // A*B, both column-major [col0,col1,col2]
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) { let s = 0; for (let k = 0; k < 3; k++) s += (k === 0 ? A[0][r] : k === 1 ? A[1][r] : A[2][r]) * B[c][k]; out[c][r] = s; }
  return out;
}
function matTranspose(A) { const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) T[r][c] = A[c][r]; return T; }
function matAdd(A, B, sb = 1) { return [0, 1, 2].map(c => [0, 1, 2].map(r => A[c][r] + sb * B[c][r])); }
function matScale(A, s) { return A.map(col => col.map(v => v * s)); }
function det3col(A) { const a = A[0], b = A[1], c = A[2]; return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
// Newton-Schulz iteration for the orthogonal polar factor of a 3x3 matrix
// close to orthogonal: X_{k+1} = 1.5*X_k - 0.5*X_k*(X_k^T*X_k). Converges
// quadratically once X is reasonably close to orthonormal (Higham). Pure
// matrix multiplication -- no eigendecomposition/SVD needed, and every
// operation stays numerically well-conditioned regardless of how far any
// underlying vanishing point sits from the image.
function polarOrthonormalize(M, iters = 12) {
  let X = M;
  for (let i = 0; i < iters; i++) { const Xt = matTranspose(X); const XtX = matMul(Xt, X); X = matAdd(matScale(X, 1.5), matScale(matMul(X, XtX), -0.5)); }
  if (det3col(X) < 0) X[2] = scale3(X[2], -1); // fix handedness -> proper rotation (det=+1), not a reflection
  return X;
}
// Rodrigues' rotation formula: rotate by `angleRad` around unit `axis`.
function rodrigues(axis, angleRad) {
  const [x, y, z] = axis, c = Math.cos(angleRad), s = Math.sin(angleRad), t = 1 - c;
  // columns of the rotation matrix
  return [
    [t * x * x + c, t * x * y + s * z, t * x * z - s * y],
    [t * x * y - s * z, t * y * y + c, t * y * z + s * x],
    [t * x * z + s * y, t * y * z - s * x, t * z * z + c],
  ];
}

function lineIntersect2(a1, a2, b1, b2) {
  const x1 = a1[0], y1 = a1[1], x2 = a2[0], y2 = a2[1], x3 = b1[0], y3 = b1[1], x4 = b2[0], y4 = b2[1];
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}
function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }
function angularDist(a, b) { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
function edgesOfFamily(fam) {
  const edges = [];
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    famAssignment[name].forEach((f, i) => { if (f === fam) edges.push({ a: verts[i], b: verts[(i + 1) % 6] }); });
  }
  return edges;
}
// --- ONE-TIME seed, entirely angle-based -- no VP-position fit anywhere
// in the seeding path. The first version of this seed still routed
// through fitVanishingPointTLS + orthocenter (a position fit), and it
// backfired in exactly the way the whole session has been circling: at
// LOW noise (3-5px) the raw fit produced a near-degenerate/collinear VP
// triangle (confirmed: pp0 landed on the exact fallback [W/2,H/2] and f0
// on the exact generic hypot(W,H) fallback), which fed a near-singular
// matrix into polar orthonormalization and produced NaN on iteration 0.
// Fix: seed each family's camera-space direction purely from its
// CIRCULAR-MEAN 2D EDGE ANGLE (well-conditioned regardless of how far or
// unstable the "true" VP position is), treated as if that family's VP
// sits at the orthographic limit (z-component fixed to a moderate nominal
// value, not derived from any position fit). This only has to be roughly
// distinct per family to give polarOrthonormalize a non-degenerate
// starting matrix; opCalibrate's refinement loop does the real work of
// finding the actual finite VPs afterward.
function circularConsensusAngle(edges) {
  let sx = 0, sy = 0;
  for (const { a, b } of edges) { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang2 = angleMod180(b[0] - a[0], b[1] - a[1]) * 2 * Math.PI / 180; sx += Math.cos(ang2) * len; sy += Math.sin(ang2) * len; }
  return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
}
const seedAngles = [0, 1, 2].map(fam => circularConsensusAngle(edgesOfFamily(fam)));
console.log('Seed consensus angles:', seedAngles.map(a => a.toFixed(2) + 'deg'));

function vpOfAxis(axis, pp, f) {
  if (Math.abs(axis[2]) < 1e-6) return null; // axis parallel to image plane -> true point at infinity, no finite VP
  return [pp[0] + f * axis[0] / axis[2], pp[1] + f * axis[1] / axis[2]];
}
const pp0 = [W / 2, H / 2], f0 = Math.hypot(W, H); // generic, distance-agnostic seed; refined below
// Chirality/handedness is NOT determined by 3 pure 2D angles + a uniform
// z-magnitude -- the SIGN of z is a free choice that flips which of two
// mirror-image camera configurations the seed lands near. A uniform
// z=+0.5 guess for all 3 families turned out to consistently bias toward
// the WRONG one (confirmed: family 1's VP landed near [-800..-1300,
// -8500..-8900] vs truth [736, 4528] -- flipped sign, same wrong basin,
// across every noise level tested, not something noise-sensitivity would
// produce). Fix: try both chiralities, score each by how well it already
// explains the observed edges before any refinement runs, keep the better
// one. Cheap (2 residual evaluations), well-conditioned (just picks a
// sign), and removes the arbitrary bias instead of patching around it.
function seedResidual(zSign) {
  const M = seedAngles.map(a => { const rad = a * Math.PI / 180; return norm3([Math.cos(rad), Math.sin(rad), zSign * 0.5]); });
  const R = polarOrthonormalize(M);
  const vp = [0, 1, 2].map(k => vpOfAxis(R[k], pp0, f0));
  let e = 0;
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6];
      if (!vp[fam]) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const edgeAngle = angleMod180(b[0] - a[0], b[1] - a[1]);
      const targetAngle = angleMod180(vp[fam][0] - mid[0], vp[fam][1] - mid[1]);
      e += angularDist(edgeAngle, targetAngle);
    }
  }
  return { R, e };
}
const cand = [seedResidual(1), seedResidual(-1)];
console.log('Seed chirality candidates: z=+0.5 residual=' + cand[0].e.toFixed(1) + '  z=-0.5 residual=' + cand[1].e.toFixed(1) + '  -> picking ' + (cand[0].e <= cand[1].e ? 'z=+0.5' : 'z=-0.5'));
const chosen = cand[0].e <= cand[1].e ? cand[0] : cand[1];
console.log('Seed (pre-orthonormalization) axis pairwise dots would be near 0.5-ish by construction; post-orthonormalization dots:', [[0, 1], [1, 2], [0, 2]].map(([i, j]) => dot3(chosen.R[i], chosen.R[j]).toFixed(6)).join(' '));

const state2 = { R: chosen.R, pp: [pp0[0], pp0[1]], f: f0 };
console.log('Seed f=' + f0.toFixed(1) + ' pp=[' + pp0.map(v => v.toFixed(1)) + ']');

function currentVp() { return [0, 1, 2].map(k => vpOfAxis(state2.R[k], state2.pp, state2.f)); }

function solveTranslation(vertices, lcoords, axes, f, pp) {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const [a, b, c] = lcoords[i];
    const K = [0, 1, 2].map(d => a * axes[0][d] + b * axes[1][d] + c * axes[2][d]);
    const px = vertices[i][0], py = vertices[i][1];
    rows.push({ row: [-f, 0, px - pp[0]], rhs: f * K[0] - (px - pp[0]) * K[2] });
    rows.push({ row: [0, -f, py - pp[1]], rhs: f * K[1] - (py - pp[1]) * K[2] });
  }
  const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Atb = [0, 0, 0];
  for (const { row, rhs } of rows) for (let i = 0; i < 3; i++) { Atb[i] += row[i] * rhs; for (let j = 0; j < 3; j++) AtA[i][j] += row[i] * row[j]; }
  function det3x3(M) { return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]); }
  const det = det3x3(AtA);
  if (Math.abs(det) < 1e-9) return [0, 0, 5];
  const Tx = det3x3([[Atb[0], AtA[0][1], AtA[0][2]], [Atb[1], AtA[1][1], AtA[1][2]], [Atb[2], AtA[2][1], AtA[2][2]]]) / det;
  const Ty = det3x3([[AtA[0][0], Atb[0], AtA[0][2]], [AtA[1][0], Atb[1], AtA[1][2]], [AtA[2][0], Atb[2], AtA[2][2]]]) / det;
  const Tz = det3x3([[AtA[0][0], AtA[0][1], Atb[0]], [AtA[1][0], AtA[1][1], Atb[1]], [AtA[2][0], AtA[2][1], Atb[2]]]) / det;
  return [Tx, Ty, Tz];
}

function energy() {
  const vp = currentVp();
  let eAlign = 0, eReproj = 0;
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const edgeAngle = angleMod180(b[0] - a[0], b[1] - a[1]);
      if (!vp[fam]) continue;
      const targetAngle = angleMod180(vp[fam][0] - mid[0], vp[fam][1] - mid[1]);
      eAlign += angularDist(edgeAngle, targetAngle) * Math.hypot(b[0] - a[0], b[1] - a[1]) / 90;
    }
    const T = solveTranslation(verts, localCoords[name], state2.R, state2.f, state2.pp);
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => T[d] + a * state2.R[0][d] + b * state2.R[1][d] + c * state2.R[2][d]);
      if (cam[2] <= 0.01) { eReproj += 1000; continue; }
      const proj = [state2.pp[0] + state2.f * cam[0] / cam[2], state2.pp[1] + state2.f * cam[1] / cam[2]];
      eReproj += Math.hypot(proj[0] - verts[i][0], proj[1] - verts[i][1]);
    }
  }
  const a = state2.R;
  const eOrtho = [[0, 1], [1, 2], [0, 2]].reduce((s, [i, j]) => s + Math.abs(dot3(a[i], a[j])), 0); // diagnostic only -- should be ~0 machine precision, always
  return { eAlign, eOrtho: eOrtho * 1000, eReproj, total: eAlign + eOrtho * 1000 + eReproj };
}

// --- Operators ---
function opAlign(step) {
  const vp = currentVp();
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6];
      if (!vp[fam]) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const curDir = norm2([b[0] - a[0], b[1] - a[1]]);
      let target = norm2([vp[fam][0] - mid[0], vp[fam][1] - mid[1]]);
      if (curDir[0] * target[0] + curDir[1] * target[1] < 0) target = [-target[0], -target[1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const newDir = norm2([curDir[0] + (target[0] - curDir[0]) * step, curDir[1] + (target[1] - curDir[1]) * step]);
      verts[i] = [mid[0] - newDir[0] * len / 2, mid[1] - newDir[1] * len / 2];
      verts[(i + 1) % 6] = [mid[0] + newDir[0] * len / 2, mid[1] + newDir[1] * len / 2];
    }
  }
}
function opSnap(step) {
  const vp = currentVp();
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    const targets = verts.map((v, i) => {
      const famPrev = famAssignment[name][(i + 5) % 6], famNext = famAssignment[name][i];
      if (!vp[famPrev] || !vp[famNext]) return v;
      const prev = verts[(i + 5) % 6], next = verts[(i + 1) % 6];
      return lineIntersect2(prev, vp[famPrev], next, vp[famNext]) || v;
    });
    for (let i = 0; i < 6; i++) verts[i] = [verts[i][0] + (targets[i][0] - verts[i][0]) * step, verts[i][1] + (targets[i][1] - verts[i][1]) * step];
  }
}
function edgesOfFamilyForCube(name, fam) {
  const es = [], verts = state.cubes[name].vertices;
  famAssignment[name].forEach((f, i) => { if (f === fam) es.push({ a: verts[i], b: verts[(i + 1) % 6] }); });
  return es;
}
function opRelate(step) {
  const vp = currentVp(); // leave-one-out on the SHARED camera model would require refitting per-cube;
  // simplified here to: nudge each cube's edges toward the shared camera VP too, weighted lower than
  // ALIGN (0.1 vs 0.15 in the main loop) -- with orthogonality now structural, RELATE's distinct value is
  // damping outlier cubes gently rather than discovering the direction itself (that's ALIGN's job + opCalibrate).
  for (let fam = 0; fam < 3; fam++) {
    if (!vp[fam]) continue;
    for (const name of cubeNames) {
      const verts = state.cubes[name].vertices;
      famAssignment[name].forEach((f, i) => {
        if (f !== fam) return;
        const a = verts[i], b = verts[(i + 1) % 6], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const curDir = norm2([b[0] - a[0], b[1] - a[1]]);
        let target = norm2([vp[fam][0] - mid[0], vp[fam][1] - mid[1]]);
        if (curDir[0] * target[0] + curDir[1] * target[1] < 0) target = [-target[0], -target[1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const newDir = norm2([curDir[0] + (target[0] - curDir[0]) * step, curDir[1] + (target[1] - curDir[1]) * step]);
        verts[i] = [mid[0] - newDir[0] * len / 2, mid[1] - newDir[1] * len / 2];
        verts[(i + 1) % 6] = [mid[0] + newDir[0] * len / 2, mid[1] + newDir[1] * len / 2];
      });
    }
  }
}
// opCalibrate ("ORTHO" role): refine the CAMERA MODEL itself (rotation,
// pp, f) to better explain the observed edges -- 6 well-conditioned scalar
// parameters (3 small rotation angles, 2 pp offsets, 1 f offset), never a
// raw VP pixel position. Orthogonality of the 3 axes is never at stake
// here; it is guaranteed by construction (Rodrigues composition of
// rotations is always exactly orthonormal).
function globalAngleResidual() {
  const vp = currentVp();
  let e = 0;
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6];
      if (!vp[fam]) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const edgeAngle = angleMod180(b[0] - a[0], b[1] - a[1]);
      const targetAngle = angleMod180(vp[fam][0] - mid[0], vp[fam][1] - mid[1]);
      e += angularDist(edgeAngle, targetAngle) * Math.hypot(b[0] - a[0], b[1] - a[1]) / 90;
    }
  }
  return e;
}
function opCalibrate(step) {
  const base = globalAngleResidual();
  if (base < 1e-9) return;
  const hRot = 0.2 * Math.PI / 180, hPp = 1, hF = 5; // well-conditioned trial steps
  const saved = { R: state2.R, pp: state2.pp, f: state2.f };
  function trialAndRestore(mutate) {
    mutate();
    const e = globalAngleResidual();
    state2.R = saved.R; state2.pp = saved.pp; state2.f = saved.f;
    return e;
  }
  const camAxes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const gradRot = camAxes.map(axis => (trialAndRestore(() => { state2.R = matMul(rodrigues(axis, hRot), saved.R); }) - base) / hRot);
  const gradPp = [0, 1].map(d => (trialAndRestore(() => { state2.pp = saved.pp.map((v, k) => k === d ? v + hPp : v); }) - base) / hPp);
  const gradF = (trialAndRestore(() => { state2.f = saved.f + hF; }) - base) / hF;
  // Rotation (radians) and pp/f (pixels) are different units with wildly
  // different natural gradient magnitudes purely from the trial-step
  // denominators (hRot << hPp,hF) -- combining them into one shared L2 norm
  // silently starved pp/f of any real step (confirmed: f and pp never
  // moved from their seed values across 300 iterations). Each parameter
  // GROUP gets its own trust-region-style normalization instead.
  const rotNorm = Math.hypot(...gradRot) || 1;
  const ppfNorm = Math.hypot(...gradPp, gradF) || 1;
  const deltaRot = gradRot.map(g => -g / rotNorm * step * Math.min(base, 5) * (0.5 * Math.PI / 180));
  const deltaPp = gradPp.map(g => -g / ppfNorm * step * Math.min(base, 5) * 8);
  const deltaF = -gradF / ppfNorm * step * Math.min(base, 5) * 8;
  let R = saved.R;
  camAxes.forEach((axis, k) => { if (deltaRot[k] !== 0) R = matMul(rodrigues(axis, deltaRot[k]), R); });
  state2.R = R;
  state2.pp = saved.pp.map((v, k) => v + deltaPp[k]);
  state2.f = saved.f + deltaF;
}
function opPlace(step) {
  const Ts = {}, Ys = [];
  for (const name of cubeNames) { const T = solveTranslation(state.cubes[name].vertices, localCoords[name], state2.R, state2.f, state2.pp); Ts[name] = T; let wy = 0; for (let d = 0; d < 3; d++) wy += state2.R[1][d] * T[d]; Ys.push(wy); }
  const meanY = Ys.reduce((s, v) => s + v, 0) / Ys.length;
  cubeNames.forEach((name, idx) => {
    const T = Ts[name], deltaY = (meanY - Ys[idx]) * step;
    const Tcorr = T.map((v, d) => v + (d === 1 ? deltaY : 0));
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => Tcorr[d] + a * state2.R[0][d] + b * state2.R[1][d] + c * state2.R[2][d]);
      if (cam[2] <= 0.01) continue;
      const proj = [state2.pp[0] + state2.f * cam[0] / cam[2], state2.pp[1] + state2.f * cam[1] / cam[2]];
      const v = state.cubes[name].vertices[i];
      state.cubes[name].vertices[i] = [v[0] + (proj[0] - v[0]) * 0.1, v[1] + (proj[1] - v[1]) * 0.1];
    }
  });
}
function opEqualize(step) {
  const scales = {};
  for (const name of cubeNames) {
    const T = solveTranslation(state.cubes[name].vertices, localCoords[name], state2.R, state2.f, state2.pp);
    const verts = state.cubes[name].vertices;
    let avgLen = 0; for (let i = 0; i < 6; i++) avgLen += Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]); avgLen /= 6;
    scales[name] = avgLen * T[2] / state2.f;
  }
  const vals = Object.values(scales).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  for (const name of cubeNames) {
    const ratio = median / scales[name], correction = 1 + (ratio - 1) * step;
    const verts = state.cubes[name].vertices;
    const cx = verts.reduce((s, v) => s + v[0], 0) / 6, cy = verts.reduce((s, v) => s + v[1], 0) / 6;
    for (let i = 0; i < 6; i++) verts[i] = [cx + (verts[i][0] - cx) * correction, cy + (verts[i][1] - cy) * correction];
  }
}
function opSmooth(step) {
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    const T = solveTranslation(verts, localCoords[name], state2.R, state2.f, state2.pp);
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => T[d] + a * state2.R[0][d] + b * state2.R[1][d] + c * state2.R[2][d]);
      if (cam[2] <= 0.01) continue;
      const proj = [state2.pp[0] + state2.f * cam[0] / cam[2], state2.pp[1] + state2.f * cam[1] / cam[2]];
      verts[i] = [verts[i][0] + (proj[0] - verts[i][0]) * step, verts[i][1] + (proj[1] - verts[i][1]) * step];
    }
  }
}
function opClose() {
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) { const len = Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]); if (len < 2) { const prev = verts[(i + 5) % 6], next2 = verts[(i + 2) % 6]; verts[i] = [(prev[0] + next2[0]) / 2, (prev[1] + next2[1]) / 2]; } }
  }
}

function hasNaN() {
  for (const name of cubeNames) for (const v of state.cubes[name].vertices) if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) return true;
  if (![...state2.R.flat(), ...state2.pp, state2.f].every(Number.isFinite)) return true;
  return false;
}
const ITERS = 300;
const trace = [];
for (let iter = 0; iter < ITERS; iter++) {
  const decay = Math.pow(0.99, iter);
  opAlign(0.15 * decay);
  opSnap(0.15 * decay);
  opCalibrate(0.15 * decay);
  opRelate(0.1 * decay);
  opEqualize(0.1 * decay);
  opPlace(0.1 * decay);
  opClose();
  opSmooth(0.08 * decay);
  if (iter % 30 === 0) state2.R = polarOrthonormalize(state2.R); // cheap drift guard, not correctness-critical
  if (hasNaN()) { console.log(`  [ABORT] NaN state at iter ${iter}`); break; }
  if (iter < 25 || iter % 20 === 0 || iter === ITERS - 1) trace.push({ iter, ...energy() });
}
console.log('\nEnergy trace (every 20 iters):');
for (const t of trace) console.log(`  iter ${t.iter}: eAlign=${t.eAlign.toFixed(1)} eOrtho(x1000,diagnostic)=${t.eOrtho.toFixed(4)} eReproj=${t.eReproj.toFixed(1)} total=${t.total.toFixed(1)}`);

function vpAngle(vp, pp) { return angleMod180(vp[0] - pp[0], vp[1] - pp[1]); }
console.log('\nGround truth VP:', vpTruth.map(v => `[${v[0].toFixed(0)},${v[1].toFixed(0)}]`).join(' '));
const finalVp = currentVp();
console.log('Final derived VP:', finalVp.map(v => v ? `[${v[0].toFixed(1)},${v[1].toFixed(1)}]` : 'null').join(' '));
finalVp.forEach((v, i) => { if (v) console.log(`  family ${i} dist=${Math.hypot(v[0] - vpTruth[i][0], v[1] - vpTruth[i][1]).toFixed(1)}px`); });
console.log('\nFinal f=' + state2.f.toFixed(1) + ' (truth ' + fTruth.toFixed(1) + ')  pp=[' + state2.pp.map(v => v.toFixed(1)) + '] (truth [' + ppTruth.map(v => v.toFixed(1)) + '])');
console.log('\nFinal per-cube T vs ground truth:');
for (const name of cubeNames) {
  const T = solveTranslation(state.cubes[name].vertices, localCoords[name], state2.R, state2.f, state2.pp);
  const Ttruth = reconstructed[name].T;
  console.log(`  ${name}: solver T=[${T.map(v => v.toFixed(2))}] truth T=[${Ttruth.map(v => v.toFixed(2))}] dist=${Math.hypot(T[0] - Ttruth[0], T[1] - Ttruth[1], T[2] - Ttruth[2]).toFixed(3)} units`);
}
