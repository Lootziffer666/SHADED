// Analysis pass on the measured hexagon corners from scratch-measure-cubes.mjs.
// Pure geometry, no rendering -- extracts T/L/R/F extrema per cube, checks
// real collinearity of the "row" cubes' footprints, and finds the vanishing
// point of the row direction to test whether the front-center cube really
// sits where a "3D midpoint / regular spacing" hypothesis predicts -- via
// cross-ratio, not by eyeballing raw pixel distances (perspective invalidates
// that).
import fs from 'fs';
const r = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-SHADED/28c78061-b0e0-5f7f-bdfd-27d37e45d96b/scratchpad/measure-result.json', 'utf8'));

function extrema(poly) {
  const pts = poly.slice(0, -1); // drop closing duplicate
  const T = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
  const F = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const L = pts.reduce((a, b) => (b[0] < a[0] ? b : a));
  const R = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
  return { T, L, R, F };
}
const cubes = {};
for (const [name, c] of Object.entries(r.out)) cubes[name] = extrema(c.poly);
console.log('Extrema per cube (T=top, L=left, R=right, F=bottom/front):');
for (const [name, e] of Object.entries(cubes)) console.log(' ', name, e);

// Hypothesis from apparent size (pixCount, a monotonic proxy for camera
// distance for same-size objects): cube4 closest, cube2 next, cube1
// farther, cube3 farthest -- so the "row of 3" is cube1(far)-cube2(mid)-
// cube4(near), and cube3 is the one set back.
const row = ['cube1', 'cube2', 'cube4'];

console.log('');
console.log('--- Collinearity check: are the row cubes\' F (footprint) points on one real 3D line? ---');
console.log('(true 3D collinearity ALWAYS projects to 2D collinearity -- directly testable)');
const [F1, F2, F4] = row.map(n => cubes[n].F);
function perpDistToLine(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  return Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / len;
}
const dev = perpDistToLine(F2, F1, F4);
const baseline = Math.hypot(F4[0] - F1[0], F4[1] - F1[1]);
console.log('  F(cube1)=' + F1 + ' F(cube2)=' + F2 + ' F(cube4)=' + F4);
console.log('  cube2 F perpendicular distance from the cube1-cube4 line: ' + dev.toFixed(2) + 'px on a ' + baseline.toFixed(1) + 'px baseline = ' + (dev / baseline * 100).toFixed(2) + '%');

console.log('');
console.log('--- Vanishing point of the row direction (independent parallel-edge pairs) ---');
function lineIntersect(a1, a2, b1, b2) {
  const x1 = a1[0], y1 = a1[1], x2 = a2[0], y2 = a2[1], x3 = b1[0], y3 = b1[1], x4 = b2[0], y4 = b2[1];
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}
const edgeLF = n => [cubes[n].L, cubes[n].F];
const e1 = edgeLF('cube1'), e2 = edgeLF('cube2'), e4 = edgeLF('cube4');
const Vu_12 = lineIntersect(e1[0], e1[1], e2[0], e2[1]);
const Vu_14 = lineIntersect(e1[0], e1[1], e4[0], e4[1]);
const Vu_24 = lineIntersect(e2[0], e2[1], e4[0], e4[1]);
console.log('  Vu from cube1&cube2 L-F edges: ' + (Vu_12 ? Vu_12.map(v => Math.round(v)) : null));
console.log('  Vu from cube1&cube4 L-F edges: ' + (Vu_14 ? Vu_14.map(v => Math.round(v)) : null));
console.log('  Vu from cube2&cube4 L-F edges: ' + (Vu_24 ? Vu_24.map(v => Math.round(v)) : null));
console.log('  -> wildly disagreeing (short baselines make pairwise intersection of');
console.log('     near-parallel lines numerically unstable) -- averaging these 3 would');
console.log('     be pretending precision that is not there. Least-squares over ALL 4');
console.log('     cubes L-F edges instead (incl. cube3, same orientation assumption):');

// Total-least-squares vanishing point: minimize sum of squared perpendicular
// distances from V to all 4 cubes' L-F lines (linear in V -- normal
// equations, not pairwise intersection).
function fitVanishingPointLS(edges) {
  let Sxx = 0, Sxy = 0, Syy = 0, Sxb = 0, Syb = 0;
  for (const [P, Q] of edges) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len; // unit direction
    // row: [uy, -ux] . [x,y] = uy*Px - ux*Py
    const a = uy, b2 = -ux, rhs = uy * P[0] - ux * P[1];
    Sxx += a * a; Sxy += a * b2; Syy += b2 * b2; Sxb += a * rhs; Syb += b2 * rhs;
  }
  const det = Sxx * Syy - Sxy * Sxy;
  if (Math.abs(det) < 1e-9) return null;
  return [(Sxb * Syy - Syb * Sxy) / det, (Sxx * Syb - Sxy * Sxb) / det];
}
const e3 = edgeLF('cube3');
const Vu = fitVanishingPointLS([e1, e2, e3, e4]);
console.log('  Vu (least-squares, 4 lines): ' + Vu.map(v => Math.round(v)));
// Report each line's residual (perpendicular distance from Vu) as an honest
// fit-quality number, not just the point itself.
for (const [name, [P, Q]] of [['cube1', e1], ['cube2', e2], ['cube3', e3], ['cube4', e4]]) {
  console.log('    residual ' + name + ': ' + perpDistToLine(Vu, P, Q).toFixed(1) + 'px');
}

console.log('');
console.log('--- Cross-ratio test: is cube2 the exact 3D midpoint of cube1 and cube4? ---');
// For 3 collinear 3D points A,B,C with B the midpoint of AC, their images
// a,b,c and the line's vanishing point v satisfy the harmonic cross ratio
// (a,c;b,v) = -1, i.e. (ab/bc) = -(av/vc) using SIGNED distances along the
// line (project onto the line direction to get 1D signed coordinates).
function project1D(p, origin, dir) { return (p[0]-origin[0])*dir[0] + (p[1]-origin[1])*dir[1]; }
const dir = [F4[0]-F1[0], F4[1]-F1[1]];
const len = Math.hypot(dir[0], dir[1]);
const u = [dir[0]/len, dir[1]/len];
const a = project1D(F1, F1, u), b = project1D(F2, F1, u), c = project1D(F4, F1, u), v = project1D(Vu, F1, u);
const ab = b - a, bc = c - b, av = v - a, vc = c - v;
const lhs = ab / bc, rhs = -(av / vc);
console.log('  1D coords along row line: a(cube1)=' + a.toFixed(1) + ' b(cube2)=' + b.toFixed(1) + ' c(cube4)=' + c.toFixed(1) + ' v(Vu)=' + v.toFixed(1));
console.log('  ab/bc = ' + lhs.toFixed(4) + '  vs  -(av/vc) = ' + rhs.toFixed(4) + '  (equal => cube2 is the exact 3D midpoint)');
console.log('  relative difference: ' + (Math.abs(lhs - rhs) / Math.abs(rhs) * 100).toFixed(2) + '%');
