// SCRATCH v2 -- same operator framework as scratch-operator-solver.mjs,
// but fixing the representation the maintainer correctly identified as
// the likely root cause of v1's failure: v1 treated a vanishing point as
// a mutable PIXEL POSITION and nudged it directly via numerical gradients
// -- catastrophically ill-conditioned when that point sits thousands of
// pixels outside the frame (a tiny angular change implies a huge position
// change). v2 instead keeps each family's canonical DIRECTION as a single
// ANGLE (mod 180deg, always well-behaved, bounded 0-180 regardless of how
// far away the true vanishing point is) as the thing operators actually
// touch. A vanishing-point POSITION is only ever DERIVED (via the same
// robust least-squares line-intersection used by the real closed-form
// method) for calibration/reporting -- never itself perturbed directly.
//
// Same maintainer framing as v1: this is meant to show whether purely
// local, bounded, energy-reducing operators can reach the same answer as
// the closed-form batch solve -- this time testing a specific, sharper
// hypothesis (representation matters, not "locality" in general).
import fs from 'fs';

const svm = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/svm-full.json', 'utf8'));
const { W, H, pp: ppTruth, f: fTruth, VP: vpTruth, reconstructed } = svm;

function seededRandom(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const rand = seededRandom(42);
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

const NOISE_STD = 20; // px -- same noise level v1 catastrophically diverged on
const state = { cubes: {}, angle: null }; // angle[k] in degrees, mod 180
for (const name of cubeNames) {
  const truth = reconstructed[name].measured;
  state.cubes[name] = { vertices: truth.map(([x, y]) => [x + gaussian() * NOISE_STD, y + gaussian() * NOISE_STD]) };
}

function angleMod180(dx, dy) { let a = Math.atan2(dy, dx) * 180 / Math.PI; return ((a % 180) + 180) % 180; }
function angularDist(a, b) { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
function norm2([x, y]) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
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
function circularConsensusAngle(edges) {
  let sx = 0, sy = 0;
  for (const { a, b } of edges) { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang2 = angleMod180(b[0] - a[0], b[1] - a[1]) * 2 * Math.PI / 180; sx += Math.cos(ang2) * len; sy += Math.sin(ang2) * len; }
  return angleMod180(Math.cos(Math.atan2(sy, sx) / 2), Math.sin(Math.atan2(sy, sx) / 2));
}
// Initial state: canonical angle = consensus of noisy edges (fair,
// non-adversarial start, same spirit as the "fair test" correction to v1).
state.angle = [0, 1, 2].map(fam => circularConsensusAngle(edgesOfFamily(fam)));
console.log('Ground truth VP:', vpTruth.map(v => `[${v[0].toFixed(0)},${v[1].toFixed(0)}]`).join(' '));
function vpAngle(vp, pp) { return angleMod180(vp[0] - pp[0], vp[1] - pp[1]); }
console.log('Ground truth angles (from real VP via image center as reference pp):', vpTruth.map(v => vpAngle(v, [W / 2, H / 2]).toFixed(2) + 'deg'));
console.log('Initial canonical angles (consensus of noisy edges):', state.angle.map(a => a.toFixed(2) + 'deg'));

// --- DERIVE a vanishing-point POSITION from the CURRENT EDGES' OWN
// individual directions (which still naturally differ slightly, even
// after partial ALIGN steps -- that residual diversity is exactly what a
// finite intersection point needs). Using one single shared angle for
// every edge of a family would make them mathematically parallel to each
// other and the fit singular (tried it -- NaN). Never collapse that
// diversity; only nudge outliers toward it.
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
  if (Math.abs(det) < 1) return null; // genuinely degenerate (near-parallel family) -- report, don't fabricate
  return [(Sxb * Syy - Syb * Sxy) / det, (Sxx * Syb - Sxy * Sxb) / det];
}
function orthocenter(A, B, C) {
  function altitudeLine(P, Q, R) { return { point: P, dir: [-(R[1] - Q[1]), R[0] - Q[0]] }; }
  const L1 = altitudeLine(A, B, C), L2 = altitudeLine(B, A, C);
  const den = L1.dir[0] * L2.dir[1] - L1.dir[1] * L2.dir[0];
  const t = ((L2.point[0] - L1.point[0]) * L2.dir[1] - (L2.point[1] - L1.point[1]) * L2.dir[0]) / den;
  return [L1.point[0] + t * L1.dir[0], L1.point[1] + t * L1.dir[1]];
}
// Carry-forward cache for calibrate()'s fallback: when a family's edges
// become momentarily too collinear/degenerate for a finite TLS fit
// (det<1), we must NOT fabricate a generic point like [W/2,H/2] -- if two
// or three families ever fell back to that SAME fake point simultaneously,
// orthocenter() sees a degenerate (partially coincident) triangle and
// divides 0/0 -> NaN, which is exactly what happened. Keeping the last
// genuinely-fitted position per family is honest (reports the real prior
// state, never invents a new one) and structurally can't collide across
// families the way a shared constant can.
let lastValidVp = [null, null, null];
let degenWarned = [false, false, false];
let lastValidF = Math.hypot(W, H); // generic seed, used only before any real fit ever succeeds
let fWarned = false;
function calibrate() {
  const vp = [0, 1, 2].map(fam => {
    const fresh = fitVanishingPointTLS(edgesOfFamily(fam));
    if (fresh) { lastValidVp[fam] = fresh; degenWarned[fam] = false; return fresh; }
    if (!degenWarned[fam]) { console.log(`  [WARN] family ${fam} VP fit degenerate (edges too collinear) -- holding last valid estimate`); degenWarned[fam] = true; }
    return lastValidVp[fam] || [W / 2, H / 2]; // only ever a fallback-of-last-resort before any real fit has happened
  });
  const pp = orthocenter(vp[0], vp[1], vp[2]);
  const focalFromPair = (Vi, Vj) => { const dot = (Vi[0] - pp[0]) * (Vj[0] - pp[0]) + (Vi[1] - pp[1]) * (Vj[1] - pp[1]); return dot < 0 ? Math.sqrt(-dot) : null; };
  const fs3 = [focalFromPair(vp[0], vp[1]), focalFromPair(vp[1], vp[2]), focalFromPair(vp[0], vp[2])].filter(x => x !== null);
  // Second silent fallback caught the same way as the VP one above: a
  // fabricated constant (was "1000", chosen for no reason) masked every
  // iteration where NO vp pair satisfied the orthogonality sign condition
  // (dot<0) -- which, it turns out, was EVERY iteration of this run,
  // start to finish (confirmed via orthoErrFrom, which has no such
  // fallback and correctly returned null throughout). Carry the last
  // genuinely valid f forward instead, and warn once.
  let f;
  if (fs3.length) { f = fs3.reduce((s, v) => s + v, 0) / fs3.length; lastValidF = f; fWarned = false; }
  else { if (!fWarned) { console.log('  [WARN] no VP pair satisfies orthogonality sign condition (dot<0) -- holding last valid focal length'); fWarned = true; } f = lastValidF; }
  function normalize3([x, y, z]) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
  const axes = vp.map(v => normalize3([v[0] - pp[0], v[1] - pp[1], f]));
  return { vp, pp, f, axes };
}
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
  function det3(M) { return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]); }
  const det = det3(AtA);
  if (Math.abs(det) < 1e-9) return [0, 0, 5];
  const Tx = det3([[Atb[0], AtA[0][1], AtA[0][2]], [Atb[1], AtA[1][1], AtA[1][2]], [Atb[2], AtA[2][1], AtA[2][2]]]) / det;
  const Ty = det3([[AtA[0][0], Atb[0], AtA[0][2]], [AtA[1][0], Atb[1], AtA[1][2]], [AtA[2][0], Atb[2], AtA[2][2]]]) / det;
  const Tz = det3([[AtA[0][0], AtA[0][1], Atb[0]], [AtA[1][0], AtA[1][1], Atb[1]], [AtA[2][0], AtA[2][1], Atb[2]]]) / det;
  return [Tx, Ty, Tz];
}

function energy() {
  const cal = calibrate();
  let eAlign = 0, eReproj = 0;
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      // Same fix as opAlign: measure deviation from the per-edge direction
      // implied by (this edge's own midpoint -> the family's derived VP),
      // not from one shared canonical angle -- the latter falsely penalizes
      // the very edge-direction diversity a correct perspective reconstruction
      // must have.
      const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const edgeAngle = angleMod180(b[0] - a[0], b[1] - a[1]);
      const targetAngle = angleMod180(cal.vp[fam][0] - mid[0], cal.vp[fam][1] - mid[1]);
      eAlign += angularDist(edgeAngle, targetAngle) * Math.hypot(b[0] - a[0], b[1] - a[1]) / 90;
    }
    const T = solveTranslation(verts, localCoords[name], cal.axes, cal.f, cal.pp);
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => T[d] + a * cal.axes[0][d] + b * cal.axes[1][d] + c * cal.axes[2][d]);
      const proj = [cal.pp[0] + cal.f * cam[0] / cam[2], cal.pp[1] + cal.f * cam[1] / cam[2]];
      eReproj += Math.hypot(proj[0] - verts[i][0], proj[1] - verts[i][1]);
    }
  }
  const a = cal.axes;
  const eOrtho = [[0, 1], [1, 2], [0, 2]].reduce((s, [i, j]) => s + Math.abs(a[i][0] * a[j][0] + a[i][1] * a[j][1] + a[i][2] * a[j][2]), 0);
  return { eAlign, eOrtho: eOrtho * 1000, eReproj, total: eAlign + eOrtho * 1000 + eReproj };
}

// --- Operators (angle-space versions) ---
//
// CORRECTED per the maintainer's own operator definition: "ALIGN -> aligns
// detected edges to one of the 3 global vanishing POINTS" -- a point, not a
// shared angle. My first draft aligned every family edge to one identical
// canonical angle, which is an orthographic assumption smuggled into a
// perspective problem: in true 3-point perspective, edges of the same
// family are NOT mutually parallel in image space (each lies on its own
// line through the common VP, so each has a slightly different 2D angle
// depending on how far its midpoint is from that point). Forcing them all
// to one angle destroys exactly the diversity fitVanishingPointTLS needs
// to find a finite intersection -- and running it repeatedly, with decay,
// guarantees convergence to EXACT parallelism, i.e. exact singularity.
// That was the real cause of the NaN (confirmed via instrumentation: all
// three families' fits went degenerate simultaneously by iteration 1,
// calibrate()'s silent fallback masked it with three IDENTICAL fake
// points, and orthocenter() on a degenerate triangle divided 0/0).
//
// Fix: each edge's target direction is derived per-edge, from its own
// midpoint toward the family's CURRENT (freshly re-derived, read-only)
// vanishing-point estimate. Different midpoints naturally imply different
// target angles even for a shared VP -- diversity is preserved by
// construction, not accidentally. The VP position itself is never the
// mutated parameter (still ill-conditioned to touch directly); it is only
// ever read to build a per-edge angle, which stays well-conditioned even
// when the VP sits far outside the frame -- that was the maintainer's
// actual hypothesis, and this is the faithful version of it.
function opAlign(step) {
  const cal = calibrate();
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    for (let i = 0; i < 6; i++) {
      const fam = famAssignment[name][i], a = verts[i], b = verts[(i + 1) % 6];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const curDir = norm2([b[0] - a[0], b[1] - a[1]]);
      let target = norm2([cal.vp[fam][0] - mid[0], cal.vp[fam][1] - mid[1]]);
      if (curDir[0] * target[0] + curDir[1] * target[1] < 0) target = [-target[0], -target[1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const newDir = norm2([curDir[0] + (target[0] - curDir[0]) * step, curDir[1] + (target[1] - curDir[1]) * step]);
      verts[i] = [mid[0] - newDir[0] * len / 2, mid[1] - newDir[1] * len / 2];
      verts[(i + 1) % 6] = [mid[0] + newDir[0] * len / 2, mid[1] + newDir[1] * len / 2];
    }
  }
}
// SNAP: a corner sits at the intersection of its two adjacent edges' true
// perspective lines -- the line through the OTHER endpoint of each
// neighboring edge and that edge's family's actual vanishing point (not a
// shared family angle, same fix as ALIGN).
function opSnap(step) {
  const cal = calibrate();
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    const targets = verts.map((v, i) => {
      const famPrev = famAssignment[name][(i + 5) % 6], famNext = famAssignment[name][i];
      const prev = verts[(i + 5) % 6], next = verts[(i + 1) % 6];
      return lineIntersect2(prev, cal.vp[famPrev], next, cal.vp[famNext]) || v;
    });
    for (let i = 0; i < 6; i++) verts[i] = [verts[i][0] + (targets[i][0] - verts[i][0]) * step, verts[i][1] + (targets[i][1] - verts[i][1]) * step];
  }
}
// ORTHO must perturb something well-conditioned. A single shared angle is
// numerically clean but (per the fix above) can't drive a VP fit; instead
// perturb by ROTATING each family's real edges by a small trial angle
// (around each edge's own midpoint, same mechanism opAlign uses) and
// re-fit VP from those -- the fit stays well-conditioned (edges keep their
// natural mutual diversity) while the thing being searched over (a
// rotation in degrees) stays well-conditioned too. Evaluated on a cloned
// copy so the trial itself never corrupts live state.
function cloneCubes() { return Object.fromEntries(cubeNames.map(n => [n, state.cubes[n].vertices.map(v => [v[0], v[1]])])); }
function edgesOfFamilyFrom(cubesVerts, fam) {
  const edges = [];
  for (const name of cubeNames) famAssignment[name].forEach((f, i) => { if (f === fam) edges.push({ a: cubesVerts[name][i], b: cubesVerts[name][(i + 1) % 6] }); });
  return edges;
}
function rotateFamilyEdgesInPlace(cubesVerts, fam, deltaDeg) {
  const rad = deltaDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  for (const name of cubeNames) {
    const verts = cubesVerts[name];
    famAssignment[name].forEach((f, i) => {
      if (f !== fam) return;
      const a = verts[i], b = verts[(i + 1) % 6], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const idx of [i, (i + 1) % 6]) { const v = verts[idx], dx = v[0] - mid[0], dy = v[1] - mid[1]; verts[idx] = [mid[0] + dx * cos - dy * sin, mid[1] + dx * sin + dy * cos]; }
    });
  }
}
function orthoErrFrom(cubesVerts) {
  const vp = [0, 1, 2].map(fam => fitVanishingPointTLS(edgesOfFamilyFrom(cubesVerts, fam)));
  if (vp.some(v => !v)) return null;
  const pp = orthocenter(vp[0], vp[1], vp[2]);
  const focalFromPair = (Vi, Vj) => { const dot = (Vi[0] - pp[0]) * (Vj[0] - pp[0]) + (Vi[1] - pp[1]) * (Vj[1] - pp[1]); return dot < 0 ? Math.sqrt(-dot) : null; };
  const fs3 = [focalFromPair(vp[0], vp[1]), focalFromPair(vp[1], vp[2]), focalFromPair(vp[0], vp[2])].filter(x => x !== null);
  if (!fs3.length) return null;
  const f = fs3.reduce((s, v) => s + v, 0) / fs3.length;
  function normalize3([x, y, z]) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
  const axes = vp.map(v => normalize3([v[0] - pp[0], v[1] - pp[1], f]));
  return [[0, 1], [1, 2], [0, 2]].reduce((s, [i, j]) => s + Math.pow(axes[i][0] * axes[j][0] + axes[i][1] * axes[j][1] + axes[i][2] * axes[j][2], 2), 0);
}
function liveCubeVertices() { return Object.fromEntries(cubeNames.map(n => [n, state.cubes[n].vertices])); }
function opOrtho(step) {
  const base = orthoErrFrom(liveCubeVertices());
  if (base === null || base < 1e-10) return;
  const h = 0.3; // degrees -- well-conditioned rotation step
  const grad = [0, 1, 2].map(fam => {
    const trial = cloneCubes();
    rotateFamilyEdgesInPlace(trial, fam, h);
    const errPlus = orthoErrFrom(trial);
    return errPlus === null ? 0 : (errPlus - base) / h;
  });
  const gnorm = Math.hypot(...grad) || 1;
  for (let fam = 0; fam < 3; fam++) {
    const delta = -grad[fam] / gnorm * step * Math.min(base, 1) * 3; // degrees, bounded by construction
    rotateFamilyEdgesInPlace(liveCubeVertices(), fam, delta); // mutates state.cubes in place (same array refs)
  }
}
function opPlace(step) {
  const cal = calibrate();
  const Ts = {}, Ys = [];
  for (const name of cubeNames) { const T = solveTranslation(state.cubes[name].vertices, localCoords[name], cal.axes, cal.f, cal.pp); Ts[name] = T; let wy = 0; for (let d = 0; d < 3; d++) wy += cal.axes[d][1] * T[d]; Ys.push(wy); }
  const meanY = Ys.reduce((s, v) => s + v, 0) / Ys.length;
  cubeNames.forEach((name, idx) => {
    const T = Ts[name], deltaY = (meanY - Ys[idx]) * step;
    const Tcorr = T.map((v, d) => v + (d === 1 ? deltaY : 0));
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => Tcorr[d] + a * cal.axes[0][d] + b * cal.axes[1][d] + c * cal.axes[2][d]);
      const proj = [cal.pp[0] + cal.f * cam[0] / cam[2], cal.pp[1] + cal.f * cam[1] / cam[2]];
      const v = state.cubes[name].vertices[i];
      state.cubes[name].vertices[i] = [v[0] + (proj[0] - v[0]) * 0.1, v[1] + (proj[1] - v[1]) * 0.1];
    }
  });
}
function opEqualize(step) {
  const cal = calibrate();
  const scales = {};
  for (const name of cubeNames) {
    const T = solveTranslation(state.cubes[name].vertices, localCoords[name], cal.axes, cal.f, cal.pp);
    const verts = state.cubes[name].vertices;
    let avgLen = 0; for (let i = 0; i < 6; i++) avgLen += Math.hypot(verts[i][0] - verts[(i + 1) % 6][0], verts[i][1] - verts[(i + 1) % 6][1]); avgLen /= 6;
    scales[name] = avgLen * T[2] / cal.f;
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
function edgesOfFamilyForCube(name, fam) {
  const es = [], verts = state.cubes[name].vertices;
  famAssignment[name].forEach((f, i) => { if (f === fam) es.push({ a: verts[i], b: verts[(i + 1) % 6] }); });
  return es;
}
// RELATE: "corrects positions based on neighbor relationships." My first
// draft rotated a whole cube's family edges toward a per-family CROSS-CUBE
// CONSENSUS ANGLE -- same flawed shared-angle mechanism as the original
// ALIGN/SNAP, would eventually force full cross-cube parallelism the same
// way. Corrected version: genuinely neighbor-informed via LEAVE-ONE-OUT --
// for cube X, fit family fam's vanishing point from every OTHER cube's
// edges only (X's own edges excluded), then nudge X's edges toward THAT
// point. This is what "neighbors" concretely means here: cube X is
// corrected by what everyone else says, not by a copy of the same pooled
// fit ALIGN already uses (which includes X itself). If the leave-one-out
// fit is itself degenerate, skip that cube/family this step rather than
// fabricate a target -- consistent with never masking degeneracy.
function opRelate(step) {
  for (let fam = 0; fam < 3; fam++) {
    for (const name of cubeNames) {
      const neighborEdges = [];
      for (const other of cubeNames) if (other !== name) edgesOfFamilyForCube(other, fam).forEach(e => neighborEdges.push(e));
      const vpFromNeighbors = fitVanishingPointTLS(neighborEdges);
      if (!vpFromNeighbors) continue;
      const verts = state.cubes[name].vertices;
      famAssignment[name].forEach((f, i) => {
        if (f !== fam) return;
        const a = verts[i], b = verts[(i + 1) % 6], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const curDir = norm2([b[0] - a[0], b[1] - a[1]]);
        let target = norm2([vpFromNeighbors[0] - mid[0], vpFromNeighbors[1] - mid[1]]);
        if (curDir[0] * target[0] + curDir[1] * target[1] < 0) target = [-target[0], -target[1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const newDir = norm2([curDir[0] + (target[0] - curDir[0]) * step, curDir[1] + (target[1] - curDir[1]) * step]);
        verts[i] = [mid[0] - newDir[0] * len / 2, mid[1] - newDir[1] * len / 2];
        verts[(i + 1) % 6] = [mid[0] + newDir[0] * len / 2, mid[1] + newDir[1] * len / 2];
      });
    }
  }
}
// SMOOTH/RELAX: "distributes small residual errors globally without
// violating hard constraints." A final gentle relaxation pass: pull every
// vertex a small fraction toward its own reprojection under the CURRENT
// shared calibration + that cube's own best-fit translation -- i.e.
// redistribute whatever reprojection residual is left, globally, in small
// bounded steps. Guarded against cam[2]<=0 (behind-camera degenerate
// point) so a bad trial state can never divide by (near) zero here either.
function opSmooth(step) {
  const cal = calibrate();
  for (const name of cubeNames) {
    const verts = state.cubes[name].vertices;
    const T = solveTranslation(verts, localCoords[name], cal.axes, cal.f, cal.pp);
    for (let i = 0; i < 6; i++) {
      const [a, b, c] = localCoords[name][i];
      const cam = [0, 1, 2].map(d => T[d] + a * cal.axes[0][d] + b * cal.axes[1][d] + c * cal.axes[2][d]);
      if (cam[2] <= 0.01) continue;
      const proj = [cal.pp[0] + cal.f * cam[0] / cam[2], cal.pp[1] + cal.f * cam[1] / cam[2]];
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
  return false;
}
// The 8 operators, exactly as the maintainer named them: ALIGN, SNAP,
// EQUALIZE, ORTHO, PLACE, RELATE, CLOSE, SMOOTH/RELAX. (The earlier
// opConsensus was my own invented "recompute VP" helper, not one of the
// eight -- superseded now that ALIGN/SNAP/RELATE each read a freshly
// re-derived VP directly, and SMOOTH/RELAX fills the slot that was
// actually missing.)
const ITERS = 300;
const trace = [];
for (let iter = 0; iter < ITERS; iter++) {
  const decay = Math.pow(0.99, iter);
  opAlign(0.15 * decay);
  opSnap(0.15 * decay);
  opOrtho(0.15 * decay);
  opRelate(0.1 * decay);
  opEqualize(0.1 * decay);
  opPlace(0.1 * decay);
  opClose();
  opSmooth(0.08 * decay);
  if (hasNaN()) { console.log(`  [ABORT] NaN state at iter ${iter}`); break; }
  if (iter < 25 || iter % 20 === 0 || iter === ITERS - 1) trace.push({ iter, ...energy() });
}
console.log('\nEnergy trace (every 20 iters):');
for (const t of trace) console.log(`  iter ${t.iter}: eAlign=${t.eAlign.toFixed(1)} eOrtho(x1000)=${t.eOrtho.toFixed(2)} eReproj=${t.eReproj.toFixed(1)} total=${t.total.toFixed(1)}`);

const calFinal = calibrate();
state.angle = [0, 1, 2].map(fam => circularConsensusAngle(edgesOfFamily(fam))); // for reporting only, not used to drive geometry
console.log('\nFinal canonical angles (diagnostic only):', state.angle.map(a => a.toFixed(2) + 'deg'), ' vs truth (via true pp):', vpTruth.map(v => vpAngle(v, ppTruth).toFixed(2) + 'deg'));
console.log('Final derived VP:', calFinal.vp.map(v => `[${v[0].toFixed(1)},${v[1].toFixed(1)}]`).join(' '));
console.log('Ground truth VP: ', vpTruth.map(v => `[${v[0].toFixed(1)},${v[1].toFixed(1)}]`).join(' '));
calFinal.vp.forEach((v, i) => console.log(`  family ${i} dist=${Math.hypot(v[0] - vpTruth[i][0], v[1] - vpTruth[i][1]).toFixed(1)}px`));
console.log('\nFinal f=' + calFinal.f.toFixed(1) + ' (truth ' + fTruth.toFixed(1) + ')  pp=[' + calFinal.pp.map(v => v.toFixed(1)) + '] (truth [' + ppTruth.map(v => v.toFixed(1)) + '])');
console.log('\nFinal per-cube T vs ground truth:');
for (const name of cubeNames) {
  const T = solveTranslation(state.cubes[name].vertices, localCoords[name], calFinal.axes, calFinal.f, calFinal.pp);
  const Ttruth = reconstructed[name].T;
  console.log(`  ${name}: solver T=[${T.map(v => v.toFixed(2))}] truth T=[${Ttruth.map(v => v.toFixed(2))}] dist=${Math.hypot(T[0] - Ttruth[0], T[1] - Ttruth[1], T[2] - Ttruth[2]).toFixed(3)} units`);
}
