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
// REAL IMAGE, no ground truth of any kind -- this is the actual test the
// whole v1->v3e arc was built for. Input is the RAW hexagons (rawPoly,
// straight from mask + convex hull + Visvalingam-Whyatt, before the
// fragile closed-form-only line-intersection rebuild) plus the corrected
// per-cube famAssignment, both dumped by
// scratch-cube-silhouette-2d-newtest.mjs. These raw vertices ARE the
// noisy real measurements -- exactly the role state.cubes[name].vertices
// played in every synthetic test, just genuinely noisy this time instead
// of synthetically injected.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Repo-relative path, not the /tmp session scratchpad this script
// originally used -- reads the fixture that scratch-village-extract-v2.mjs
// writes to tools/verify-out/ (run that script first).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'verify-out');
const raw = JSON.parse(fs.readFileSync(path.join(OUT, 'village-raw2d-v2.json'), 'utf8'));
const { W, H, cubes: rawCubes } = raw;
const cubeNames = Object.keys(rawCubes);
const famAssignment = Object.fromEntries(cubeNames.map(n => [n, rawCubes[n].famAssignment]));

// localCoords derivation needs NO ground truth: a cube's 6-vertex
// silhouette cycle is a fixed combinatorial object -- the 6 visible
// corners are every cube corner except the fully-hidden one (0,0,0) and
// the "near" corner interior to the hexagon (1,1,1). Hand-derivation of
// the actual Hamiltonian cycle on the remaining 6 corners: starting at
// (1,0,0) -b+-> (1,1,0) -a--> (0,1,0) -c+-> (0,1,1) -b-> (0,0,1) -a+->
// (1,0,1) -c-> back to (1,0,0). Consecutive edges alternate 3 axes AND
// alternate +1/-1 step sign -- BUT (caught by direct hand-check, printed
// an invalid corner [1,0,-1] before this fix) the naive "always start
// every axis at 0" assumption is wrong: whichever axis's first
// occurrence in the cycle is a DECREASING step must start at 1, not 0
// (matching the derivation above, where axis 'a' first appears
// decreasing and (1,0,0) already has a=1). Fixed: seed lc[0] per-axis
// from that axis's first-occurrence sign, then walk as before -- keeps
// every vertex a genuine {0,1}^3 corner, verified for the actual
// famAssignment pattern on this image.
function localCoordsFor(name) {
  const fams = famAssignment[name];
  const lc0 = [0, 0, 0];
  for (let i = 0; i < 3; i++) lc0[fams[i]] = (i % 2 === 0) ? 0 : 1;
  const lc = [lc0];
  for (let i = 0; i < 5; i++) { const next = lc[i].slice(); next[fams[i]] += (i % 2 === 0 ? 1 : -1); lc.push(next); }
  return lc;
}
const localCoords = Object.fromEntries(cubeNames.map(n => [n, localCoordsFor(n)]));

const state = { cubes: Object.fromEntries(cubeNames.map(n => [n, { vertices: rawCubes[n].rawPoly.map(p => p ? [p[0], p[1]] : null) }])) };

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
// house5 (nearest the image's right edge) has 2 unmeasured corners
// (BR, R -- its shaded right wall is off-canvas): state.cubes[name]
// .vertices[i] is `null` there instead of a [x,y] pair. Every edge/vertex
// loop below must skip a null endpoint rather than crash on it -- the
// missing corners still get a real 3D position from the box's rigid
// local-coordinate structure once T is solved from the 4 real
// correspondences, they just never contribute a 2D residual.
function edgeMeasured(verts, i) { return !!(verts[i] && verts[(i + 1) % 6]); }
function edgesOfFamily(fam) {
  const edges = [];
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    famAssignment[name].forEach((f, i) => { if (f === fam && edgeMeasured(verts, i)) edges.push({ a: verts[i], b: verts[(i + 1) % 6] }); });
  }
  return edges;
}
// --- ONE-TIME seed: the REAL closed-form procedure (not handed ground
// truth, not the crude angle-only placeholder from earlier v3) applied
// directly to the noisy edges -- exactly what Grok's corrected answer and
// ChatGPT describe: fitVanishingPointTLS pools ALL edges of a family into
// one linear least-squares solve (never pairwise intersection), then the
// 3 fitted VP positions determine pp via the orthocenter and f via the
// orthogonality dot-product. This is the same linear system this codebase
// has used since the very first 2D-extraction phase of this session --
// what changes here is architecture, not the fitting math: fit ONCE
// (Phase 1 below), then FREEZE and never let a local operator re-touch it
// (Phase 2), per the external review's core claim, now confirmed decisive
// on v3c (0.0px VP error, exact f/pp recovery, ~10x better per-cube T
// once frozen).
//
// If the closed-form fit is itself degenerate for a given noisy draw (can
// happen at very low noise where line clusters end up near-collinear --
// documented earlier this session), fall back to the angle-consensus seed
// with the chirality disambiguation from v3 -- worse but never a crash.
function circularConsensusAngle(edges) {
  let sx = 0, sy = 0;
  for (const { a, b } of edges) { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang2 = angleMod180(b[0] - a[0], b[1] - a[1]) * 2 * Math.PI / 180; sx += Math.cos(ang2) * len; sy += Math.sin(ang2) * len; }
  return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
}
function fitVanishingPointTLS(edges) {
  let Sxx = 0, Sxy = 0, Syy = 0, Sxb = 0, Syb = 0;
  for (const { a, b } of edges) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const A = uy, B = -ux, rhs = uy * P[0] - ux * P[1];
    Sxx += A * A; Sxy += A * B; Syy += B * B; Sxb += A * rhs; Syb += B * rhs;
  }
  const det = Sxx * Syy - Sxy * Sxy;
  if (Math.abs(det) < 1) return null;
  return [(Sxb * Syy - Syb * Sxy) / det, (Sxx * Syb - Sxy * Sxb) / det];
}
function orthocenterOrNull(A, B, C) {
  function altitudeLine(P, Q, R) { return { point: P, dir: [-(R[1] - Q[1]), R[0] - Q[0]] }; }
  const L1 = altitudeLine(A, B, C), L2 = altitudeLine(B, A, C);
  const den = L1.dir[0] * L2.dir[1] - L1.dir[1] * L2.dir[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((L2.point[0] - L1.point[0]) * L2.dir[1] - (L2.point[1] - L1.point[1]) * L2.dir[0]) / den;
  return [L1.point[0] + t * L1.dir[0], L1.point[1] + t * L1.dir[1]];
}
function vpOfAxis(axis, pp, f) {
  if (Math.abs(axis[2]) < 1e-6) return null; // axis parallel to image plane -> true point at infinity, no finite VP
  return [pp[0] + f * axis[0] / axis[2], pp[1] + f * axis[1] / axis[2]];
}
// v3d/v3e: the real, complete, non-circular end-to-end test. Fit the
// camera from the noisy edges via the actual closed-form procedure (never
// handed ground truth) as one candidate among several multi-start seeds
// for Phase 1's calibration-only pre-pass below.
function tryClosedFormSeed() {
  const rawVp = [0, 1, 2].map(fam => fitVanishingPointTLS(edgesOfFamily(fam)));
  if (rawVp.some(v => !v)) return null;
  const pp0 = orthocenterOrNull(rawVp[0], rawVp[1], rawVp[2]);
  if (!pp0) return null;
  const focalFromPair0 = (Vi, Vj) => { const dot = (Vi[0] - pp0[0]) * (Vj[0] - pp0[0]) + (Vi[1] - pp0[1]) * (Vj[1] - pp0[1]); return dot < 0 ? Math.sqrt(-dot) : null; };
  const fs30 = [focalFromPair0(rawVp[0], rawVp[1]), focalFromPair0(rawVp[1], rawVp[2]), focalFromPair0(rawVp[0], rawVp[2])].filter(x => x !== null);
  if (!fs30.length) return null;
  const f0 = fs30.reduce((s, v) => s + v, 0) / fs30.length;
  const rawM = rawVp.map(v => norm3([v[0] - pp0[0], v[1] - pp0[1], f0]));
  return { R: polarOrthonormalize(rawM), pp: pp0, f: f0, rawVp, rawDots: [[0, 1], [1, 2], [0, 2]].map(([i, j]) => dot3(rawM[i], rawM[j])) };
}
function angleFallbackCandidates() {
  const seedAngles = [0, 1, 2].map(fam => circularConsensusAngle(edgesOfFamily(fam)));
  const pp0 = [W / 2, H / 2], f0 = Math.hypot(W, H);
  function residualFor(zSign) {
    const M = seedAngles.map(a => { const rad = a * Math.PI / 180; return norm3([Math.cos(rad), Math.sin(rad), zSign * 0.5]); });
    const R = polarOrthonormalize(M);
    const vp = [0, 1, 2].map(k => vpOfAxis(R[k], pp0, f0));
    let e = 0;
    for (const name of cubeNames) { const verts = state.cubes[name].vertices; for (let i = 0; i < 6; i++) { if (!edgeMeasured(verts, i)) continue; const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6]; if (!vp[fam]) continue; const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; e += angularDist(angleMod180(b[0] - a[0], b[1] - a[1]), angleMod180(vp[fam][0] - mid[0], vp[fam][1] - mid[1])); } }
    return { R, pp: pp0, f: f0, e };
  }
  return [residualFor(1), residualFor(-1)];
}
function angleFallbackSeed() {
  const cand = angleFallbackCandidates();
  return cand[0].e <= cand[1].e ? cand[0] : cand[1];
}
const closedForm = tryClosedFormSeed();
const seed = closedForm || angleFallbackSeed();
console.log(closedForm ? 'Seed = REAL closed-form fit from noisy edges (not ground truth).' : 'Seed = angle-consensus fallback (closed-form fit was degenerate for this noisy draw).');
if (closedForm) console.log('  raw fitted VP:', closedForm.rawVp.map(v => `[${v[0].toFixed(0)},${v[1].toFixed(0)}]`).join(' '), ' pre-orthonormalization axis dots:', closedForm.rawDots.map(d => d.toFixed(3)).join(' '));
const state2 = { R: seed.R, pp: [seed.pp[0], seed.pp[1]], f: seed.f };
console.log('Seed f=' + state2.f.toFixed(1) + ' pp=[' + state2.pp.map(v => v.toFixed(1)) + ']  axis pairwise dots after polar-orthonormalize:', [[0, 1], [1, 2], [0, 2]].map(([i, j]) => dot3(state2.R[i], state2.R[j]).toFixed(6)).join(' '));

function currentVp() { return [0, 1, 2].map(k => vpOfAxis(state2.R[k], state2.pp, state2.f)); }

function solveTranslation(vertices, lcoords, axes, f, pp) {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    if (!vertices[i]) continue; // unmeasured corner (house5's BR/R) -- no 2D equation to add
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
      if (!edgeMeasured(verts, i)) continue;
      const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const edgeAngle = angleMod180(b[0] - a[0], b[1] - a[1]);
      if (!vp[fam]) continue;
      const targetAngle = angleMod180(vp[fam][0] - mid[0], vp[fam][1] - mid[1]);
      eAlign += angularDist(edgeAngle, targetAngle) * Math.hypot(b[0] - a[0], b[1] - a[1]) / 90;
    }
    const T = solveTranslation(verts, localCoords[name], state2.R, state2.f, state2.pp);
    for (let i = 0; i < 6; i++) {
      if (!verts[i]) continue;
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => T[d] + a * state2.R[0][d] + b * state2.R[1][d] + c * state2.R[2][d]);
      if (cam[2] <= 0.3) { eReproj += 1000; continue; }
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
      if (!edgeMeasured(verts, i)) continue;
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
      if (!v) return null; // unmeasured corner -- nothing to snap
      const famPrev = famAssignment[name][(i + 5) % 6], famNext = famAssignment[name][i];
      const prev = verts[(i + 5) % 6], next = verts[(i + 1) % 6];
      if (!prev || !next || !vp[famPrev] || !vp[famNext]) return v;
      return lineIntersect2(prev, vp[famPrev], next, vp[famNext]) || v;
    });
    for (let i = 0; i < 6; i++) { if (verts[i] && targets[i]) verts[i] = [verts[i][0] + (targets[i][0] - verts[i][0]) * step, verts[i][1] + (targets[i][1] - verts[i][1]) * step]; }
  }
}
function edgesOfFamilyForCube(name, fam) {
  const es = [], verts = state.cubes[name].vertices;
  famAssignment[name].forEach((f, i) => { if (f === fam && edgeMeasured(verts, i)) es.push({ a: verts[i], b: verts[(i + 1) % 6] }); });
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
        if (f !== fam || !edgeMeasured(verts, i)) return;
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
      if (!edgeMeasured(verts, i)) continue;
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
// Pure angular residual has NO notion that all 4 cubes share the same
// real-world edge length -- it only constrains DIRECTION, never SCALE.
// Confirmed on this real image: Phase 1 converged to a camera with
// excellent angular fit that nonetheless forced cube3 (the largest, most
// foreshortened cube) to a near-zero depth (cam.z=0.08) to explain its
// disproportionate image size -- a genuine degenerate solution the
// angular term alone cannot see. EQUALIZE already encodes "same real
// size" as a fact; fold that same signal into the CALIBRATION residual
// itself (not just Phase 2's vertex-level correction) so Phase 1 can't
// wander into a camera that's angularly fine but scale-incoherent.
function scaleResidual() {
  const scales = cubeNames.map(name => {
    const verts = state.cubes[name].vertices;
    const T = solveTranslation(verts, localCoords[name], state2.R, state2.f, state2.pp);
    let avgLen = 0, n = 0; for (let i = 0; i < 6; i++) { if (!edgeMeasured(verts, i)) continue; avgLen += Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]); n++; } avgLen /= n;
    return avgLen * T[2] / state2.f;
  });
  const mean = scales.reduce((s, v) => s + v, 0) / scales.length;
  if (!(mean > 0) || !Number.isFinite(mean)) return 1e6; // degenerate/near-zero/negative depth -> heavily penalized, never silently accepted
  const variance = scales.reduce((s, v) => s + (v - mean) ** 2, 0) / scales.length;
  return (Math.sqrt(variance) / mean) * 100; // coefficient of variation, scaled to eAlign's typical magnitude
}
// scaleResidual is NOT folded into opCalibrate's own gradient search --
// tried that first and it destabilized the numerical gradient badly
// (T blew up into the millions): scaleResidual routes through
// solveTranslation's matrix inverse, which can swing sharply for a tiny
// rotation/f trial step, unlike the smooth, well-behaved angular
// residual. It's used below only as a POST-HOC ranking criterion between
// already-converged candidates (same role as cheirality), never as
// something the per-step gradient chases.
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
// opPlace and opEqualize both assume every cube shares ONE isotropic
// real-world edge length (same length on all 3 axes for every house) --
// exactly the assumption this village run replaces with "same real-world
// proportions (Lx,Ly,Lz), shared across houses, but NOT necessarily equal
// to each other" (these houses are visibly boxes, not cubes: footprint
// wider than wall height). Forcing the isotropic correction onto genuinely
// anisotropic geometry is what caused Phase 2 to diverge catastrophically
// on the first village attempt (eAlign/eReproj exploding into the tens of
// thousands by iter 40). Disabled below in the Phase 2 loop; the real
// anisotropic scale (Lx,Ly,Lz shared, T per house) is solved once, jointly,
// AFTER Phase 2 via solveJointAnisotropic() -- see bottom of file.
function opPlace(step) {
  const Ts = {}, Ys = [];
  for (const name of cubeNames) { const T = solveTranslation(state.cubes[name].vertices, localCoords[name], state2.R, state2.f, state2.pp); Ts[name] = T; let wy = 0; for (let d = 0; d < 3; d++) wy += state2.R[1][d] * T[d]; Ys.push(wy); }
  const meanY = Ys.reduce((s, v) => s + v, 0) / Ys.length;
  cubeNames.forEach((name, idx) => {
    const T = Ts[name], deltaY = (meanY - Ys[idx]) * step;
    const Tcorr = T.map((v, d) => v + (d === 1 ? deltaY : 0));
    for (let i = 0; i < 6; i++) {
      const v = state.cubes[name].vertices[i];
      if (!v) continue;
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => Tcorr[d] + a * state2.R[0][d] + b * state2.R[1][d] + c * state2.R[2][d]);
      if (cam[2] <= 0.3) continue;
      const proj = [state2.pp[0] + state2.f * cam[0] / cam[2], state2.pp[1] + state2.f * cam[1] / cam[2]];
      state.cubes[name].vertices[i] = [v[0] + (proj[0] - v[0]) * 0.1, v[1] + (proj[1] - v[1]) * 0.1];
    }
  });
}
function opEqualize(step) {
  const scales = {};
  for (const name of cubeNames) {
    const T = solveTranslation(state.cubes[name].vertices, localCoords[name], state2.R, state2.f, state2.pp);
    const verts = state.cubes[name].vertices;
    let avgLen = 0, n = 0; for (let i = 0; i < 6; i++) { if (!edgeMeasured(verts, i)) continue; avgLen += Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]); n++; } avgLen /= n;
    scales[name] = avgLen * T[2] / state2.f;
  }
  const vals = Object.values(scales).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  for (const name of cubeNames) {
    const ratio = median / scales[name], correction = 1 + (ratio - 1) * step;
    const verts = state.cubes[name].vertices;
    const known = verts.filter(v => v);
    const cx = known.reduce((s, v) => s + v[0], 0) / known.length, cy = known.reduce((s, v) => s + v[1], 0) / known.length;
    for (let i = 0; i < 6; i++) { if (verts[i]) verts[i] = [cx + (verts[i][0] - cx) * correction, cy + (verts[i][1] - cy) * correction]; }
  }
}
// opSmooth used to call solveTranslation with the RAW localCoords (0/1
// corners, i.e. an assumed ISOTROPIC unit cube) -- over 300 iterations
// that quietly drags genuinely anisotropic (non-cube) measurements toward
// looking like a cube, since every nudge target was computed under that
// assumption. Confirmed the hard way: disabling opSmooth entirely (along
// with opEqualize/opPlace) left reprojection error in the hundreds of
// pixels (it WAS doing necessary work), but keeping it isotropic produced
// a suspiciously exact Lx=Ly=Lz=1.00 AND a wrong house arrangement
// (maintainer: should read as a rotated U, did not) -- the model was
// confirming its own prior, not discovering the real shape from data.
// Fix: scale localCoords by the CURRENT best (Lx,Ly,Lz) estimate before
// solving T, and refresh that estimate periodically from the joint solve
// as vertices improve (coordinate-descent: refine vertices given scale,
// refine scale given vertices) -- unbiased either way, cube or not.
function scaledLocalCoords(name, scale) { return localCoords[name].map(([a, b, c]) => [a * scale.Lx, b * scale.Ly, c * scale.Lz]); }
// E1 follow-on: scale is now per-house (solveJointAnisotropic no longer
// returns one shared {Lx,Ly,Lz} for every house), so opSmooth takes the
// full per-house map and looks up each house's own entry.
function opSmooth(step, perHouseScale) {
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    const lc = scaledLocalCoords(name, perHouseScale[name]);
    const T = solveTranslation(verts, lc, state2.R, state2.f, state2.pp);
    for (let i = 0; i < 6; i++) {
      if (!verts[i]) continue;
      const [a, b, c] = lc[i];
      const cam = [0, 1, 2].map(d => T[d] + a * state2.R[0][d] + b * state2.R[1][d] + c * state2.R[2][d]);
      if (cam[2] <= 0.3) continue;
      const proj = [state2.pp[0] + state2.f * cam[0] / cam[2], state2.pp[1] + state2.f * cam[1] / cam[2]];
      verts[i] = [verts[i][0] + (proj[0] - verts[i][0]) * step, verts[i][1] + (proj[1] - verts[i][1]) * step];
    }
  }
}
function opClose() {
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      if (!edgeMeasured(verts, i)) continue;
      const len = Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]);
      if (len < 2) { const prev = verts[(i + 5) % 6], next2 = verts[(i + 2) % 6]; if (prev && next2) verts[i] = [(prev[0] + next2[0]) / 2, (prev[1] + next2[1]) / 2]; }
    }
  }
}

function hasNaN() {
  for (const name of cubeNames) for (const v of state.cubes[name].vertices) if (v && (!Number.isFinite(v[0]) || !Number.isFinite(v[1]))) return true;
  if (![...state2.R.flat(), ...state2.pp, state2.f].every(Number.isFinite)) return true;
  return false;
}
// v3e: two-phase pipeline, synthesizing everything found in v3/v3b/v3c/v3d.
// v3c proved freezing a GOOD camera works essentially perfectly; v3d proved
// the naive one-shot "3 independent VP fits -> orthocenter -> sign check"
// is too fragile as that good camera for this scene (family 1's true VP
// sits ~4528px outside the frame, giving too little intrinsic angular
// diversity for that specific closed-form chain -- confirmed this is a
// genuine geometric fact, NOT a numerical-conditioning artifact fixable by
// coordinate normalization, which was tested and produced literally
// 0.000000px difference). The fix is not better math, but ORDERING:
// opCalibrate isn't a bad operator, it just should never run *interleaved*
// with the vertex operators (that's what caused v3b's 200px pp drift even
// starting from ground truth). Used as a dedicated PRE-PASS instead --
// run to convergence in isolation, from multiple restarts, BEFORE any
// vertex correction -- it can serve as the "robust one-shot global fit"
// the architecture needs. Phase 2 then freezes that result completely and
// runs only the vertex-level operators, exactly as v3c validated.
// Pure 2D-angle residual is invariant under certain camera reflections/
// depth flips (it only constrains DIRECTIONS, never which side of the
// camera anything sits on) -- run in isolation it can converge to a
// "mirror" camera that explains the angles just as well but puts every
// reconstructed point behind the lens. Real bundle-adjustment pipelines
// call this the CHEIRALITY constraint (all points must have positive
// depth) and use it specifically to disambiguate exactly this kind of
// otherwise-tied solution. Score each candidate by it in addition to the
// angular residual, so a cheirality-violating "winner" never gets picked.
function cheiralityViolationFraction(R, pp, f) {
  let bad = 0, total = 0;
  for (const name of cubeNames) {
    const T = solveTranslation(state.cubes[name].vertices, localCoords[name], R, f, pp);
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const camZ = T[2] + a * R[0][2] + b * R[1][2] + c * R[2][2];
      total++; if (camZ <= 0.3) bad++;
    }
  }
  return bad / total;
}
function runCalibrationPhase(startCand, iters) {
  state2.R = startCand.R; state2.pp = [startCand.pp[0], startCand.pp[1]]; state2.f = startCand.f;
  for (let i = 0; i < iters; i++) {
    const decay = Math.pow(0.99, i);
    opCalibrate(0.2 * decay);
    if (i % 20 === 0) state2.R = polarOrthonormalize(state2.R);
  }
  const cheiralityBad = cheiralityViolationFraction(state2.R, state2.pp, state2.f);
  const scaleBad = scaleResidual();
  return { R: state2.R, pp: state2.pp, f: state2.f, e: globalAngleResidual(), cheiralityBad, scaleBad };
}
const PHASE1_ITERS = 150;
const candidates = [];
if (closedForm) candidates.push(closedForm);
candidates.push(...angleFallbackCandidates());
// Only 2-3 seeds (one crude angle-consensus guess per chirality) isn't
// enough basins for multi-start to do its job -- confirmed: both
// available candidates converged scale-inconsistent (33.8% and a fully
// degenerate candidate). Add genuine random-restart diversity: perturb
// each existing seed's rotation by a handful of random Rodrigues
// rotations before handing it to Phase 1 -- standard multi-start
// practice, not a new mechanism.
function seededRandom(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const restartRand = seededRandom(7);
const baseCandidates = candidates.slice();
// Village data needed more restarts than the original cube test: even the
// best of the original 15 still left 17-20% of corners behind the camera.
// Widened to 24 perturbations per base seed (up from 4) -- more basins for
// multi-start to find a genuinely clean (0% cheirality-violating) camera.
for (const base of baseCandidates) {
  for (let k = 0; k < 24; k++) {
    const axis = norm3([restartRand() - 0.5, restartRand() - 0.5, restartRand() - 0.5]);
    const angle = (restartRand() * 70 - 35) * Math.PI / 180; // +-35deg random perturbation
    candidates.push({ R: matMul(rodrigues(axis, angle), base.R), pp: base.pp, f: base.f });
  }
}
const calibrated = candidates.map(c => runCalibrationPhase(c, PHASE1_ITERS));
console.log('\nPhase 1 (calibration-only, ' + candidates.length + '-start, ' + PHASE1_ITERS + ' iters each):', calibrated.map(c => `residual=${c.e.toFixed(2)} cheiralityBad=${(c.cheiralityBad * 100).toFixed(0)}% scaleBad(CoV%)=${c.scaleBad.toFixed(1)}`).join('  |  '));
// Cheirality (all points in front of the camera) is a hard constraint the
// angular residual can't see -- rank by it first. Scale consistency
// (all 4 cubes share one real-world edge length) is the second hard fact
// it can't see either -- rank by it second, only then break ties by the
// angular residual itself.
// scaleBad (coefficient of variation of implied per-house scale) is a
// weaker proxy than the thing we actually care about -- confirmed on this
// village data: even 75 random restarts never found a candidate with 0%
// cheirality violation (a real, structural floor for this scene, not a
// restart-count problem), so ties among the low-but-nonzero cheiralityBad
// candidates matter a lot, and scaleBad picked one that silently wrecked
// specific houses' isotropic reprojection (1900-9000px average) while
// looking fine in scaleBad terms. Direct verification catches that:
// among candidates within 2% of the best cheiralityBad, re-rank by the
// actual thing we're trying to get right -- summed isotropic reprojection
// error across every house (same solveTranslation used everywhere else),
// heavily penalizing NaN/degenerate houses instead of averaging past them.
function totalIsotropicReprojError(cand) {
  let total = 0;
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    const T = solveTranslation(verts, localCoords[name], cand.R, cand.f, cand.pp);
    let sum = 0, n = 0;
    for (let i = 0; i < 6; i++) {
      if (!verts[i]) continue;
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => T[d] + a * cand.R[0][d] + b * cand.R[1][d] + c * cand.R[2][d]);
      if (cam[2] <= 0.3) { sum += 1e5; n++; continue; }
      const proj = [cand.pp[0] + cand.f * cam[0] / cam[2], cand.pp[1] + cand.f * cam[1] / cam[2]];
      const err = Math.hypot(proj[0] - verts[i][0], proj[1] - verts[i][1]);
      sum += Number.isFinite(err) ? err : 1e5; n++;
    }
    total += n ? sum / n : 1e5;
  }
  return total;
}
calibrated.sort((a, b) => a.cheiralityBad - b.cheiralityBad || a.scaleBad - b.scaleBad || a.e - b.e);
const bestCheirality = calibrated[0].cheiralityBad;
const finalists = calibrated.filter(c => c.cheiralityBad <= bestCheirality + 0.02);
finalists.forEach(c => { c.reprojSum = totalIsotropicReprojError(c); });
finalists.sort((a, b) => a.reprojSum - b.reprojSum);
console.log(`\n${finalists.length} finalist(s) within 2% of best cheiralityBad (${(bestCheirality * 100).toFixed(0)}%), re-ranked by direct isotropic reprojection:`, finalists.map(c => c.reprojSum.toFixed(1)).join(', '));
const winner = finalists[0];
state2.R = winner.R; state2.pp = winner.pp; state2.f = winner.f;
console.log('Phase 1 winner (cheirality-first, then direct reprojection): f=' + state2.f.toFixed(1) + ' pp=[' + state2.pp.map(v => v.toFixed(1)) + ']  cheiralityBad=' + (winner.cheiralityBad * 100).toFixed(0) + '%  reprojSum=' + winner.reprojSum.toFixed(1));

// Which of the 3 global families is the VERTICAL (gravity) axis? Not
// something to assume from an edge-position pattern -- that only encodes
// WHICH edges pair up, never which global index value the fit gave that
// pair. Determined empirically instead, the same way this whole session
// has repeatedly found it: the vertical family's vanishing point sits
// much farther from the image than the other two (weak-perspective,
// near-parallel verticals -- confirmed again here: one family's VP came
// out 8x the image height away, the other two within ~1-1.5x).
const campVp = currentVp();
const imgCenter = [W / 2, H / 2];
const verticalFam = campVp.map((vp, i) => ({ i, d: vp ? Math.hypot(vp[0] - imgCenter[0], vp[1] - imgCenter[1]) : 0 })).sort((a, b) => b.d - a.d)[0].i;
console.log('Vertical (gravity) family, determined from VP distance: family ' + verticalFam + ' (VPs: ' + campVp.map(vp => vp ? Math.hypot(vp[0] - imgCenter[0], vp[1] - imgCenter[1]).toFixed(0) : 'null').join(', ') + 'px from image center)');

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    if (Math.abs(M[col][col]) < 1e-9) continue; // singular direction -- leave unknown at 0 rather than divide by ~0
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let cc = col; cc <= n; cc++) M[r][cc] -= factor * M[col][cc];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-9 ? 0 : row[n] / row[i]));
}
// E1 fix (was: single shared [Lx,Ly] for every house -- forced all houses
// to be EXACTLY the same 3D size, the confirmed root cause of the "wild
// distributed boxes" arrangement: a house that should look smaller had no
// way to do that except by being pushed into depth). house 0 stays the
// single global monocular-scale gauge reference (Lz_0 fixed = 1 --
// single-view-metrology's required "one known real length"); every OTHER
// house now gets its own free Lx_h,Ly_h,Lz_h. Still exactly ONE linear
// solve: each scale unknown multiplies only KNOWN coefficients (a local-
// coordinate value times a known camera/rotation component), never another
// unknown -- s_h*Lx style products were considered and rejected because
// that IS a product of two unknowns (bilinear), which this normal-
// equations solve cannot represent without either Gauss-Newton or
// alternating fix-one-solve-other iteration (which reintroduces exactly
// the oscillating coordinate-descent failure this file already documents
// for Phase 2/3 above).
//
// E3: this is also why the ground-plane rows below are no longer merely
// aesthetic. "sie stehen alle auf der selben Bodenflaeche" (they all stand
// on the same ground plane) is still the maintainer's steer, but with
// Lz_h now free per house it does double duty: scaling a single house's
// own (T_h, Lx_h,Ly_h,Lz_h) together leaves ITS OWN reprojection exactly
// unchanged (derivation: cam_d scales by the same factor at every vertex,
// so proj = pp + f*cam/cam_z is invariant) -- i.e. every non-reference
// house has its OWN residual one-parameter scale ambiguity once freed.
// The ground-plane row ties T_h's vertical coordinate to house 0's FIXED
// T_0, and that scaling direction changes T_h's vertical coordinate
// (generically nonzero unless a house sits exactly at camera height) --
// so enforcing it removes that remaining per-house ambiguity too, not just
// visual flatness. Weight raised from 5000 -> 50000 accordingly (still a
// soft weighted row job, not an exact elimination -- see arsenal.md §4 for
// the Dykstra alternative if this ever needs to become truly hard).
// T is exactly the local (0,0,0)-relative camera-space corner by
// construction of solveTranslation's own linear system (cam_d = T_d +
// a*R0_d+b*R1_d+c*R2_d, which is T_d itself at a=b=c=0) -- its WORLD
// height along the vertical axis is dot(R[verticalFam], T), a fixed
// dot-product of KNOWN R components against the unknown T components, so
// it folds into the exact same normal-equations solve.
//
// E4: after solving, any axis that came out negative (a valid fit that
// happens to describe a MIRRORED house, not a real ambiguity SHADED wants
// to keep) is flipped via the exact identity T'=T+L*axis, L'=-L,
// local-coord a'=1-a -- proven to reproject identically in
// scratch-village-e1e4-verify.mjs, not just abs()'d for display as the
// previous version did (which left a real mirrored 3D box behind the
// printed positive number).
//
// Verified against synthetic ground truth (distinct per-house Lx/Ly/Lz,
// shared ground plane, deliberately mirrored axis) in
// tools/scratch-village-e1e4-verify.mjs: max scale error 2.8e-12, ground
// ‑plane spread 2.2e-16, reprojection error 1.3e-10px -- run that file to
// re-check this solve in isolation any time it changes.
function solveJointAnisotropic() {
  const R = state2.R, f = state2.f, pp = state2.pp;
  const H = cubeNames.length;
  const blockSize = (h) => (h === 0 ? 5 : 6); // house 0: Lx,Ly,Tx,Ty,Tz (Lz fixed=1). h>0: Lx,Ly,Lz,Tx,Ty,Tz.
  const base = new Array(H);
  { let acc = 0; for (let h = 0; h < H; h++) { base[h] = acc; acc += blockSize(h); } }
  const nUnknowns = base[H - 1] + blockSize(H - 1);
  const colsFor = (h) => h === 0
    ? { Lx: base[0] + 0, Ly: base[0] + 1, Lz: null, T: base[0] + 2 }
    : { Lx: base[h] + 0, Ly: base[h] + 1, Lz: base[h] + 2, T: base[h] + 3 };
  const AtA = Array.from({ length: nUnknowns }, () => new Array(nUnknowns).fill(0));
  const Atb = new Array(nUnknowns).fill(0);
  cubeNames.forEach((name, h) => {
    const verts = state.cubes[name].vertices, lcoords = localCoords[name];
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
        if (LzCol === null) { rhs = -(c * (-f * R[2][pAxis] + (pVal - pp[pAxis]) * R[2][2])); } // house 0: Lz=1 term moved to RHS
        else { coeffs[LzCol] = c * (-f * R[2][pAxis] + (pVal - pp[pAxis]) * R[2][2]); rhs = 0; }
        coeffs[TCol + pAxis] = -f;
        coeffs[TCol + 2] = (pVal - pp[pAxis]);
        for (let ii = 0; ii < nUnknowns; ii++) { Atb[ii] += coeffs[ii] * rhs; for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj]; }
      }
    }
  });
  const GROUND_WEIGHT = 50000; // E3: raised from 5000 -- now load-bearing for per-house gauge, not just flatness
  const rv = R[verticalFam];
  const T0Col = colsFor(0).T;
  for (let h = 1; h < H; h++) {
    const ThCol = colsFor(h).T;
    const coeffs = new Array(nUnknowns).fill(0);
    coeffs[ThCol + 0] = GROUND_WEIGHT * rv[0]; coeffs[ThCol + 1] = GROUND_WEIGHT * rv[1]; coeffs[ThCol + 2] = GROUND_WEIGHT * rv[2];
    coeffs[T0Col + 0] -= GROUND_WEIGHT * rv[0]; coeffs[T0Col + 1] -= GROUND_WEIGHT * rv[1]; coeffs[T0Col + 2] -= GROUND_WEIGHT * rv[2];
    for (let ii = 0; ii < nUnknowns; ii++) { for (let jj = 0; jj < nUnknowns; jj++) AtA[ii][jj] += coeffs[ii] * coeffs[jj]; }
  }
  const sol = solveLinearSystem(AtA, Atb);
  const scale = {}, T = {};
  cubeNames.forEach((name, h) => {
    const { Lx: LxCol, Ly: LyCol, Lz: LzCol, T: TCol } = colsFor(h);
    scale[name] = { Lx: sol[LxCol], Ly: sol[LyCol], Lz: LzCol === null ? 1 : sol[LzCol] };
    T[name] = [sol[TCol], sol[TCol + 1], sol[TCol + 2]];
  });
  // E4: sign-gauge fix -- flip any negative axis into a valid non-mirrored box.
  cubeNames.forEach((name, h) => {
    let lc = localCoords[name];
    for (let axis = 0; axis < 3; axis++) {
      const key = axis === 0 ? 'Lx' : axis === 1 ? 'Ly' : 'Lz';
      if (scale[name][key] < 0) {
        const Lneg = scale[name][key];
        for (let d = 0; d < 3; d++) T[name][d] += Lneg * R[axis][d];
        scale[name][key] = -Lneg;
        lc = lc.map((v) => { const nv = v.slice(); nv[axis] = 1 - nv[axis]; return nv; });
        localCoords[name] = lc; // persist the flip -- render.mjs and the JSON dump must see the corrected convention
      }
    }
  });
  return { scale, T };
}
// Phase 2: FREEZE the camera completely (no opCalibrate call anywhere
// below) -- only vertex-level operators run against it, per v3c.
const ITERS = 300;
const trace = [];
for (let iter = 0; iter < ITERS; iter++) {
  const decay = Math.pow(0.99, iter);
  opAlign(0.15 * decay);
  opSnap(0.15 * decay);
  opRelate(0.1 * decay);
  opClose();
  // opEqualize/opPlace/opSmooth all stay OFF here. Tried interleaving
  // opSmooth with a periodically-refreshed anisotropic+ground-plane scale
  // estimate (coordinate descent: refine vertices given scale, refine
  // scale given vertices) -- it was UNSTABLE, not just imperfect: eReproj
  // climbed monotonically from iter 120 to 299 instead of converging,
  // exactly the oscillating-feedback failure mode coordinate descent has
  // when the two halves aren't damped/weighted carefully, which this
  // wasn't. Simpler and more robust: let ONLY the 4 pure-direction
  // operators (opAlign/opSnap/opRelate/opClose -- none of them touch
  // size/depth at all, so none can bias or destabilize scale) clean up
  // the raw noisy vertices here, then solve scale+ground-plane+T ONCE,
  // jointly, on the direction-refined result. One well-posed linear solve
  // beats an unstable iterative coupling.
  if (hasNaN()) { console.log(`  [ABORT] NaN state at iter ${iter}`); break; }
  if (iter < 25 || iter % 20 === 0 || iter === ITERS - 1) trace.push({ iter, ...energy() });
}
console.log('\nPhase 2 (vertex operators only, camera frozen) energy trace (every 20 iters):');
for (const t of trace) console.log(`  iter ${t.iter}: eAlign=${t.eAlign.toFixed(1)} eOrtho(x1000,diagnostic)=${t.eOrtho.toFixed(4)} eReproj=${t.eReproj.toFixed(1)} total=${t.total.toFixed(1)}`);

// Phase 3: alternating minimization, cleanly SEPARATED into two fully-
// converged stages per round (not mixed within one loop, which is what
// made the earlier interleaved attempt oscillate instead of converging):
// (A) fully run opSmooth to reprojection-convergence under the CURRENT
// fixed anisotropic+ground scale, then (B) re-solve that scale exactly
// (closed-form linear solve, not a gradient step) given the now-settled
// vertices. Each stage sees a stable input from the other.
let perHouseScale = Object.fromEntries(cubeNames.map((n) => [n, { Lx: 1, Ly: 1, Lz: 1 }]));
for (let round = 0; round < 8; round++) {
  for (let i = 0; i < 80; i++) opSmooth(0.2, perHouseScale);
  const j = solveJointAnisotropic();
  perHouseScale = j.scale;
  const scaleStr = cubeNames.map((n) => `${n}:${perHouseScale[n].Lx.toFixed(2)}/${perHouseScale[n].Ly.toFixed(2)}/${perHouseScale[n].Lz.toFixed(2)}`).join(' ');
  console.log(`  [Phase 3 round ${round}] Lx/Ly/Lz per house: ${scaleStr}  eReproj=${energy().eReproj.toFixed(1)}`);
}

const finalVp = currentVp();
console.log('\nFinal derived VP:', finalVp.map(v => v ? `[${v[0].toFixed(1)},${v[1].toFixed(1)}]` : 'null').join(' '));
console.log('Final f=' + state2.f.toFixed(1) + '  pp=[' + state2.pp.map(v => v.toFixed(1)) + ']');

// No ground truth exists for a real photo/render -- the only legitimate
// proof of correctness, per this whole session's own standard, is
// REPROJECTION ERROR: run the reconstructed camera + per-cube T back
// through the projection equation and compare against the actual
// measured 2D points (state.cubes[name].vertices, post vertex-operator
// refinement). This ISOTROPIC pass (unit cube, same edge length on all 3
// axes) is kept only as a rough diagnostic -- it is NOT the real model for
// this scene; see the joint anisotropic solve below for the actual result.
console.log('\n[diagnostic only] Isotropic per-cube T (unit cube assumed) and reprojection error:');
for (const name of cubeNames) {
  const verts = state.cubes[name].vertices;
  const T = solveTranslation(verts, localCoords[name], state2.R, state2.f, state2.pp);
  let sumErr = 0, maxErr = 0, n = 0;
  for (let i = 0; i < 6; i++) {
    if (!verts[i]) continue;
    const [a, b, c] = localCoords[name][i];
    const cam = [0, 1, 2].map(d => T[d] + a * state2.R[0][d] + b * state2.R[1][d] + c * state2.R[2][d]);
    const proj = [state2.pp[0] + state2.f * cam[0] / cam[2], state2.pp[1] + state2.f * cam[1] / cam[2]];
    const err = Math.hypot(proj[0] - verts[i][0], proj[1] - verts[i][1]);
    sumErr += err; maxErr = Math.max(maxErr, err); n++;
  }
  console.log(`  ${name}: T=[${T.map(v => v.toFixed(2))}]  avgReprojError=${(sumErr / n).toFixed(2)}px  maxReprojError=${maxErr.toFixed(2)}px`);
}

// --- Joint anisotropic solve (maintainer-requested test: "same height") ---
// E1 fix: these houses are visibly boxes, not cubes, AND (per the visual
// arrangement -- 4 big, 2 small) not even the same size as each other.
// Forcing a SHARED Lx,Ly,Lz across every house (the previous version of
// this function) is exactly what pushed the small houses into depth to
// fake looking smaller -- the confirmed root cause of the wild arrangement.
// Every house now gets its OWN Lx_h,Ly_h,Lz_h (house 0's Lz fixed=1 as the
// single global monocular-scale gauge, everything else free) -- still
// perfectly LINEAR, solved ONCE jointly; see the full derivation on
// solveJointAnisotropic() above and the synthetic proof in
// tools/scratch-village-e1e4-verify.mjs.
const joint = solveJointAnisotropic();
console.log(`\nJoint anisotropic solve (per-house Lx/Ly/Lz, house 0 Lz=1 fixed reference), per-house T and reprojection error:`);
for (const name of cubeNames) {
  const verts = state.cubes[name].vertices, T = joint.T[name], sc = joint.scale[name];
  let sumErr = 0, maxErr = 0, n = 0;
  for (let i = 0; i < 6; i++) {
    if (!verts[i]) continue;
    const [a, b, c] = localCoords[name][i];
    const cam = [0, 1, 2].map(d => T[d] + a * sc.Lx * state2.R[0][d] + b * sc.Ly * state2.R[1][d] + c * sc.Lz * state2.R[2][d]);
    if (cam[2] <= 0.01) { console.log(`  ${name}: cheirality violation on a MEASURED vertex (cam.z=${cam[2].toFixed(3)}) -- joint solve degenerate for this house.`); continue; }
    const proj = [state2.pp[0] + state2.f * cam[0] / cam[2], state2.pp[1] + state2.f * cam[1] / cam[2]];
    const err = Math.hypot(proj[0] - verts[i][0], proj[1] - verts[i][1]);
    sumErr += err; maxErr = Math.max(maxErr, err); n++;
  }
  console.log(`  ${name}: Lx=${sc.Lx.toFixed(3)} Ly=${sc.Ly.toFixed(3)} Lz=${sc.Lz.toFixed(3)}  T=[${T.map(v => v.toFixed(2))}]  avgReprojError=${(sumErr / n).toFixed(2)}px  maxReprojError=${maxErr.toFixed(2)}px`);
}

fs.writeFileSync(path.join(OUT, 'village-reconstructed-v2.json'), JSON.stringify({ W, H, R: state2.R, pp: state2.pp, f: state2.f, scale: joint.scale, T: joint.T, vertices: Object.fromEntries(cubeNames.map(n => [n, state.cubes[n].vertices])), localCoords }, null, 2));
console.log('Wrote village-reconstructed-v2.json');
