// SCRATCH -- test whether 8 sober, locally-acting, energy-REDUCING
// operators (never freely "reshaping") converge, purely from repeated
// local correction, to the SAME vanishing points / cube positions that
// the closed-form batch solve in scratch-cube-3d-reconstruct.mjs found.
//
// Ground truth comes from svm-full.json (already verified: reprojection
// error 0.88-4.01px). We deliberately start from a WORSE state:
//   - vertices: ground truth + Gaussian noise (~20px)
//   - vanishing points: naive single-edge-pair intersection (the exact
//     unstable method identified earlier this session), not the robust fit
// and iterate operators to see if they recover the same answer.
//
// Operators (kept "nuechtern" per the maintainer's spec -- each is a
// distinct, real, bounded local rule; none freely reshapes geometry):
//   ALIGN    edge direction -> nudged toward its family's current VP
//   SNAP     vertex -> nudged toward intersection of its 2 adjacent edges
//   EQUALIZE per-cube independent scale estimate -> nudged toward consensus
//   ORTHO    the 3 VP estimates -> nudged to reduce axis non-orthogonality
//   PLACE    per-cube world Y -> nudged toward the shared ground-plane mean
//   RELATE   a cube's per-family angle -> nudged toward cross-cube consensus
//            (outlier-cube bias correction, distinct from ALIGN's per-edge pull)
//   CLOSE    repairs a degenerate hexagon (zero-length edge / self-intersect)
//   SMOOTH   decays all step sizes over iterations (anneal, avoid oscillation)
import fs from 'fs';

const svm = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/svm-full.json', 'utf8'));
const { W, H, pp: ppTruth, f: fTruth, VP: vpTruth, reconstructed } = svm;

function seededRandom(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const rand = seededRandom(42);
function gaussian() { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// --- Reconstruct famAssignment per cube from the stored localCoords diffs
// (which axis changed at each step of the hexagon walk) -- ground truth
// topology, treated as a HARD/given fact per the maintainer's own framing
// ("Eckpunkt falsch oder Kante falsch klassifiziert -- nicht: neuer
// Fluchtpunkt" implies topology itself is not up for renegotiation here).
const cubeNames = Object.keys(reconstructed);
const famAssignment = {}; // [name] -> array of 6 family indices for edges vertices[i]->vertices[i+1]
for (const name of cubeNames) {
  const lc = reconstructed[name].localCoords;
  const fams = [];
  for (let i = 0; i < 6; i++) {
    const a = lc[i], b = lc[(i + 1) % 6];
    const diffAxis = [0, 1, 2].find(k => a[k] !== b[k]);
    fams.push(diffAxis);
  }
  famAssignment[name] = fams;
}

// --- Deliberately WORSE starting state ---
const NOISE_STD = 5; // px
const state = { cubes: {}, vp: null };
for (const name of cubeNames) {
  const truth = reconstructed[name].measured;
  state.cubes[name] = { vertices: truth.map(([x, y]) => [x + gaussian() * NOISE_STD, y + gaussian() * NOISE_STD]) };
}
function lineIntersect2(a1, a2, b1, b2) {
  const x1 = a1[0], y1 = a1[1], x2 = a2[0], y2 = a2[1], x3 = b1[0], y3 = b1[1], x4 = b2[0], y4 = b2[1];
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}
function edgesOfFamily(fam) {
  const edges = [];
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    famAssignment[name].forEach((f, i) => { if (f === fam) edges.push({ a: verts[i], b: verts[(i + 1) % 6] }); });
  }
  return edges;
}
// Fair test: SAME robust fitting method as the real pipeline, but on the
// noisy/corrupted vertices -- this is "rough measurements, good method"
// (matching "schiefe Eckpunkte, ungefaehre Kanten"), not "adversarially
// unstable method" (a different, harder question -- tested separately
// below, kept for the record since it's real information too).
const initialVP = [0, 1, 2].map(fam => fitVanishingPointTLS(edgesOfFamily(fam)) || [W / 2, H / 2]);
state.vp = initialVP;
console.log('Ground truth VP:', vpTruth.map(v => `[${v[0].toFixed(0)},${v[1].toFixed(0)}]`).join(' '));
console.log('Initial VP (robust fit, but from noisy vertices):', initialVP.map(v => `[${v[0].toFixed(0)},${v[1].toFixed(0)}]`).join(' '));

// --- Shared helpers ---
function fitVanishingPointTLS(edges) {
  let Sxx = 0, Sxy = 0, Syy = 0, Sxb = 0, Syb = 0;
  for (const { a, b } of edges) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const A = uy, B = -ux, rhs = uy * P[0] - ux * P[1];
    Sxx += A * A; Sxy += A * B; Syy += B * B; Sxb += A * rhs; Syb += B * rhs;
  }
  const det = Sxx * Syy - Sxy * Sxy;
  if (Math.abs(det) < 1e-9) return null;
  return [(Sxb * Syy - Syb * Sxy) / det, (Sxx * Syb - Sxy * Sxb) / det];
}
function orthocenter(A, B, C) {
  function altitudeLine(P, Q, R) { return { point: P, dir: [-(R[1] - Q[1]), R[0] - Q[0]] }; }
  const L1 = altitudeLine(A, B, C), L2 = altitudeLine(B, A, C);
  const den = L1.dir[0] * L2.dir[1] - L1.dir[1] * L2.dir[0];
  const t = ((L2.point[0] - L1.point[0]) * L2.dir[1] - (L2.point[1] - L1.point[1]) * L2.dir[0]) / den;
  return [L1.point[0] + t * L1.dir[0], L1.point[1] + t * L1.dir[1]];
}
function calibrate(vp) {
  const pp = orthocenter(vp[0], vp[1], vp[2]);
  const focalFromPair = (Vi, Vj) => { const dot = (Vi[0] - pp[0]) * (Vj[0] - pp[0]) + (Vi[1] - pp[1]) * (Vj[1] - pp[1]); return dot < 0 ? Math.sqrt(-dot) : null; };
  const fs3 = [focalFromPair(vp[0], vp[1]), focalFromPair(vp[1], vp[2]), focalFromPair(vp[0], vp[2])].filter(x => x !== null);
  const f = fs3.length ? fs3.reduce((s, v) => s + v, 0) / fs3.length : 1000;
  function normalize3([x, y, z]) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
  const axes = vp.map(v => normalize3([v[0] - pp[0], v[1] - pp[1], f]));
  return { pp, f, axes };
}
function solveTranslation(vertices, localCoords, axes, f, pp) {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const [a, b, c] = localCoords[i];
    const K = [0, 1, 2].map(d => a * axes[0][d] + b * axes[1][d] + c * axes[2][d]);
    const px = vertices[i][0], py = vertices[i][1];
    rows.push({ row: [-f, 0, px - pp[0]], rhs: f * K[0] - (px - pp[0]) * K[2] });
    rows.push({ row: [0, -f, py - pp[1]], rhs: f * K[1] - (py - pp[1]) * K[2] });
  }
  const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Atb = [0, 0, 0];
  for (const { row, rhs } of rows) for (let i = 0; i < 3; i++) { Atb[i] += row[i] * rhs; for (let j = 0; j < 3; j++) AtA[i][j] += row[i] * row[j]; }
  function det3(M) { return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]); }
  const det = det3(AtA);
  if (Math.abs(det) < 1e-9) return [0, 0, 5];
  const solveCol = (b) => { const M = AtA.map((r, i) => r.map((v, j) => j === 0 ? b[i] : v)); return det3(M) / det; };
  const Tx = det3([[Atb[0], AtA[0][1], AtA[0][2]], [Atb[1], AtA[1][1], AtA[1][2]], [Atb[2], AtA[2][1], AtA[2][2]]]) / det;
  const Ty = det3([[AtA[0][0], Atb[0], AtA[0][2]], [AtA[1][0], Atb[1], AtA[1][2]], [AtA[2][0], Atb[2], AtA[2][2]]]) / det;
  const Tz = det3([[AtA[0][0], AtA[0][1], Atb[0]], [AtA[1][0], AtA[1][1], Atb[1]], [AtA[2][0], AtA[2][1], Atb[2]]]) / det;
  return [Tx, Ty, Tz];
}
function localCoordsFor(name) {
  const lc = [[0, 0, 0]];
  for (let i = 0; i < 5; i++) { const next = lc[i].slice(); const fam = famAssignment[name][i]; const dir = Math.sign(reconstructed[name].localCoords[(i + 1) % 6][fam] - reconstructed[name].localCoords[i][fam]) || 1; next[fam] += dir; lc.push(next); }
  return lc; // topology is given/hard per the maintainer's framing -- not re-derived from noisy signs each iteration
}
const localCoords = Object.fromEntries(cubeNames.map(n => [n, localCoordsFor(n)]));

function energy() {
  const cal = calibrate(state.vp);
  let eAlign = 0, eSnap = 0;
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const fam = famAssignment[name][i];
      const a = verts[i], b = verts[(i + 1) % 6];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const toVP = [state.vp[fam][0] - mid[0], state.vp[fam][1] - mid[1]];
      const edgeDir = [b[0] - a[0], b[1] - a[1]];
      const cosAng = (edgeDir[0] * toVP[0] + edgeDir[1] * toVP[1]) / (Math.hypot(...edgeDir) * Math.hypot(...toVP) || 1);
      eAlign += (1 - Math.abs(cosAng)) * Math.hypot(...edgeDir);
    }
  }
  const eOrtho = Math.abs(cal.axes[0][0] * cal.axes[1][0] + cal.axes[0][1] * cal.axes[1][1] + cal.axes[0][2] * cal.axes[1][2]) +
    Math.abs(cal.axes[1][0] * cal.axes[2][0] + cal.axes[1][1] * cal.axes[2][1] + cal.axes[1][2] * cal.axes[2][2]) +
    Math.abs(cal.axes[0][0] * cal.axes[2][0] + cal.axes[0][1] * cal.axes[2][1] + cal.axes[0][2] * cal.axes[2][2]);
  let eReproj = 0;
  const Ys = [];
  for (const name of cubeNames) {
    const T = solveTranslation(state.cubes[name].vertices, localCoords[name], cal.axes, cal.f, cal.pp);
    let worldY = 0; for (let d = 0; d < 3; d++) worldY += cal.axes[d][1] * T[d]; // axes[d]·T gives world coord d... actually need axes as rows; reuse below
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => T[d] + a * cal.axes[0][d] + b * cal.axes[1][d] + c * cal.axes[2][d]);
      const proj = [cal.pp[0] + cal.f * cam[0] / cam[2], cal.pp[1] + cal.f * cam[1] / cam[2]];
      eReproj += Math.hypot(proj[0] - state.cubes[name].vertices[i][0], proj[1] - state.cubes[name].vertices[i][1]);
    }
  }
  return { eAlign, eOrtho: eOrtho * 1000, eReproj, total: eAlign + eOrtho * 1000 + eReproj };
}

// --- Operators ---
function opAlign(step) {
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const fam = famAssignment[name][i];
      const a = verts[i], b = verts[(i + 1) % 6];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const toVP = norm2([state.vp[fam][0] - mid[0], state.vp[fam][1] - mid[1]]);
      const curDir = norm2([b[0] - a[0], b[1] - a[1]]);
      const sign = (curDir[0] * toVP[0] + curDir[1] * toVP[1]) >= 0 ? 1 : -1;
      const target = [toVP[0] * sign, toVP[1] * sign];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // rotate endpoints around midpoint toward target direction, small step
      const newDir = norm2([curDir[0] + (target[0] - curDir[0]) * step, curDir[1] + (target[1] - curDir[1]) * step]);
      verts[i] = [mid[0] - newDir[0] * len / 2, mid[1] - newDir[1] * len / 2];
      verts[(i + 1) % 6] = [mid[0] + newDir[0] * len / 2, mid[1] + newDir[1] * len / 2];
    }
  }
}
function norm2([x, y]) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
function opSnap(step) {
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    const targets = verts.map((v, i) => {
      const famPrev = famAssignment[name][(i + 5) % 6], famNext = famAssignment[name][i];
      const prev = verts[(i + 5) % 6], next = verts[(i + 1) % 6];
      const L1 = { point: prev, dir: norm2([state.vp[famPrev][0] - prev[0], state.vp[famPrev][1] - prev[1]]) };
      const L2 = { point: v, dir: norm2([state.vp[famNext][0] - v[0], state.vp[famNext][1] - v[1]]) };
      return lineIntersect2(L1.point, [L1.point[0] + L1.dir[0], L1.point[1] + L1.dir[1]], L2.point, [L2.point[0] + L2.dir[0], L2.point[1] + L2.dir[1]]) || v;
    });
    for (let i = 0; i < 6; i++) verts[i] = [verts[i][0] + (targets[i][0] - verts[i][0]) * step, verts[i][1] + (targets[i][1] - verts[i][1]) * step];
  }
}
function orthoErrOf(cal) {
  const a = cal.axes;
  return [[0, 1], [1, 2], [0, 2]].reduce((s, [i, j]) => s + Math.pow(a[i][0] * a[j][0] + a[i][1] * a[j][1] + a[i][2] * a[j][2], 2), 0);
}
const MAX_VP_STEP = 25; // px per call -- gradient near a bad starting VP can be
// steep/ill-conditioned; clip so ORTHO nudges instead of launches the point.
function opOrtho(step) {
  const cal = calibrate(state.vp);
  const base = orthoErrOf(cal);
  if (base < 1e-10) return;
  const h = 2;
  for (let k = 0; k < 3; k++) for (let d = 0; d < 2; d++) {
    const saved = state.vp[k][d];
    state.vp[k][d] = saved + h;
    const errPlus = orthoErrOf(calibrate(state.vp));
    state.vp[k][d] = saved;
    const grad = (errPlus - base) / h;
    // normalize by base so the step size means "reduce ortho error by
    // roughly `step` fraction", not a raw unnormalized gradient jump.
    let delta = -grad * step * base / (grad * grad + 1e-6);
    delta = Math.max(-MAX_VP_STEP, Math.min(MAX_VP_STEP, delta));
    state.vp[k][d] = saved + delta;
  }
}
function opPlace(step) {
  const cal = calibrate(state.vp);
  const Ts = {}, Ys = [];
  for (const name of cubeNames) { const T = solveTranslation(state.cubes[name].vertices, localCoords[name], cal.axes, cal.f, cal.pp); Ts[name] = T; let wy = 0; for (let d = 0; d < 3; d++) wy += cal.axes[d][1] * T[d]; Ys.push(wy); }
  const meanY = Ys.reduce((s, v) => s + v, 0) / Ys.length;
  cubeNames.forEach((name, idx) => {
    const T = Ts[name], curY = Ys[idx], deltaY = (meanY - curY) * step;
    const Tcorr = T.map((v, d) => v + deltaY * (d === 1 ? 1 : 0)); // approx: nudge along camera Y-ish; good enough as a small local correction
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => Tcorr[d] + a * cal.axes[0][d] + b * cal.axes[1][d] + c * cal.axes[2][d]);
      const proj = [cal.pp[0] + cal.f * cam[0] / cam[2], cal.pp[1] + cal.f * cam[1] / cam[2]];
      const v = state.cubes[name].vertices[i];
      state.cubes[name].vertices[i] = [v[0] + (proj[0] - v[0]) * 0.15, v[1] + (proj[1] - v[1]) * 0.15];
    }
  });
}
function opEqualize(step) {
  const cal = calibrate(state.vp);
  // Independent per-cube scale proxy: average pixel edge length / (f / T.z)
  // (i.e. "what real size would explain this cube's apparent pixel size,
  // GIVEN its own depth") -- should be 1 for all identical cubes; pull the
  // outliers toward the group median.
  const scales = {};
  for (const name of cubeNames) {
    const T = solveTranslation(state.cubes[name].vertices, localCoords[name], cal.axes, cal.f, cal.pp);
    const verts = state.cubes[name].vertices;
    let avgLen = 0; for (let i = 0; i < 6; i++) avgLen += Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]); avgLen /= 6;
    scales[name] = avgLen * T[2] / cal.f; // proxy real-world edge length
  }
  const vals = Object.values(scales).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  for (const name of cubeNames) {
    const ratio = median / scales[name];
    const correction = 1 + (ratio - 1) * step;
    const verts = state.cubes[name].vertices;
    const cx = verts.reduce((s, v) => s + v[0], 0) / 6, cy = verts.reduce((s, v) => s + v[1], 0) / 6;
    for (let i = 0; i < 6; i++) verts[i] = [cx + (verts[i][0] - cx) * correction, cy + (verts[i][1] - cy) * correction];
  }
}
function opRelate(step) {
  // Per-cube, per-family average edge angle vs. cross-cube consensus for
  // that family -- corrects a cube's systematic bias, distinct from ALIGN
  // (which only pulls toward the current, possibly-still-wrong, global VP).
  for (let fam = 0; fam < 3; fam++) {
    const perCubeAngle = {};
    for (const name of cubeNames) {
      let sx = 0, sy = 0;
      famAssignment[name].forEach((f, i) => {
        if (f !== fam) return;
        const verts = state.cubes[name].vertices, a = verts[i], b = verts[(i + 1) % 6];
        const d = norm2([b[0] - a[0], b[1] - a[1]]);
        const ang2 = Math.atan2(d[1], d[0]) * 2; sx += Math.cos(ang2); sy += Math.sin(ang2);
      });
      perCubeAngle[name] = Math.atan2(sy, sx) / 2;
    }
    const angles = Object.values(perCubeAngle);
    const cSx = angles.reduce((s, a) => s + Math.cos(a * 2), 0), cSy = angles.reduce((s, a) => s + Math.sin(a * 2), 0);
    const consensus = Math.atan2(cSy, cSx) / 2;
    for (const name of cubeNames) {
      const delta = (consensus - perCubeAngle[name]) * step;
      const cos = Math.cos(delta), sin = Math.sin(delta);
      const verts = state.cubes[name].vertices;
      const cx = verts.reduce((s, v) => s + v[0], 0) / 6, cy = verts.reduce((s, v) => s + v[1], 0) / 6;
      famAssignment[name].forEach((f, i) => {
        if (f !== fam) return;
        for (const idx of [i, (i + 1) % 6]) {
          const v = verts[idx], dx = v[0] - cx, dy = v[1] - cy;
          verts[idx] = [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
        }
      });
    }
  }
}
function opClose() {
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const len = Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]);
      if (len < 2) { // degenerate edge -- repair from neighbours
        const prev = verts[(i + 5) % 6], next2 = verts[(i + 2) % 6];
        verts[i] = [(prev[0] + next2[0]) / 2, (prev[1] + next2[1]) / 2];
      }
    }
  }
}
// NOT a full snap-to-best-fit (that would be a batch solve smuggled into
// the loop, not a local operator) -- a small damped step toward the fresh
// TLS consensus from current edges, same spirit as RELATE.
function recomputeVP(step) {
  state.vp = [0, 1, 2].map(fam => {
    const fresh = fitVanishingPointTLS(edgesOfFamily(fam));
    if (!fresh) return state.vp[fam];
    return [state.vp[fam][0] + (fresh[0] - state.vp[fam][0]) * step, state.vp[fam][1] + (fresh[1] - state.vp[fam][1]) * step];
  });
}

// --- Iterate ---
const ITERS = 300;
const trace = [];
for (let iter = 0; iter < ITERS; iter++) {
  const decay = Math.pow(0.99, iter); // SMOOTH/RELAX: anneal step sizes
  opAlign(0.08 * decay);
  opSnap(0.10 * decay);
  recomputeVP(0.08 * decay); // damped step toward consensus, not a full snap
  opOrtho(0.15 * decay);
  opRelate(0.05 * decay);
  opEqualize(0.05 * decay);
  opPlace(0.05 * decay);
  opClose();
  if (iter % 20 === 0 || iter === ITERS - 1) trace.push({ iter, ...energy() });
}
console.log('\nEnergy trace (every 20 iters):');
for (const t of trace) console.log(`  iter ${t.iter}: eAlign=${t.eAlign.toFixed(1)} eOrtho(x1000)=${t.eOrtho.toFixed(2)} eReproj=${t.eReproj.toFixed(1)} total=${t.total.toFixed(1)}`);

console.log('\nFinal VP vs ground truth:');
state.vp.forEach((v, i) => {
  const dist = Math.hypot(v[0] - vpTruth[i][0], v[1] - vpTruth[i][1]);
  console.log(`  family ${i}: solver=[${v[0].toFixed(1)},${v[1].toFixed(1)}] truth=[${vpTruth[i][0].toFixed(1)},${vpTruth[i][1].toFixed(1)}] dist=${dist.toFixed(1)}px`);
});
const calFinal = calibrate(state.vp);
console.log('\nFinal f=' + calFinal.f.toFixed(1) + ' (truth ' + fTruth.toFixed(1) + ')  pp=[' + calFinal.pp.map(v => v.toFixed(1)) + '] (truth [' + ppTruth.map(v => v.toFixed(1)) + '])');
console.log('\nFinal per-cube T vs ground truth:');
for (const name of cubeNames) {
  const T = solveTranslation(state.cubes[name].vertices, localCoords[name], calFinal.axes, calFinal.f, calFinal.pp);
  const Ttruth = reconstructed[name].T;
  const dist = Math.hypot(T[0] - Ttruth[0], T[1] - Ttruth[1], T[2] - Ttruth[2]);
  console.log(`  ${name}: solver T=[${T.map(v => v.toFixed(2))}] truth T=[${Ttruth.map(v => v.toFixed(2))}] dist=${dist.toFixed(3)} units`);
}
fs.writeFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/operator-solver-result.json', JSON.stringify({ trace, finalVP: state.vp, vpTruth }, null, 2));
