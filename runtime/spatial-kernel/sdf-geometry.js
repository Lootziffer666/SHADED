// SHADED Spatial Kernel — SDF / Procedural Geometry (spec §7, fogleman/sdf donor).
//
// A small SHADED-native composable geometry language: primitives, transforms,
// boolean ops and modifiers, evaluated as signed-distance functions. NOT a
// replacement for every mesh — it represents simple fitted/editable/procedural
// structure and feeds the SparseField / RepresentationManager.
//
// Pure and dependency-free. Surface extraction is a coarse zero-crossing
// sampler (real, testable); a production mesher (marching cubes / meshopt) can
// consume the SDF later.

// --- primitives (return distance at x,y,z) --------------------------------
export const prim = {
  sphere(r = 1) { return (x, y, z) => Math.hypot(x, y, z) - r; },
  box(hx = 0.5, hy = 0.5, hz = 0.5) {
    return (x, y, z) => {
      const dx = Math.abs(x) - hx, dy = Math.abs(y) - hy, dz = Math.abs(z) - hz;
      const ox = Math.max(dx, 0), oy = Math.max(dy, 0), oz = Math.max(dz, 0);
      return Math.hypot(ox, oy, oz) + Math.min(Math.max(dx, Math.max(dy, dz)), 0);
    };
  },
  roundedBox(hx, hy, hz, r) { return modTranslate(prim.box(hx - r, hy - r, hz - r), 0, 0, 0, (d) => d - r); },
  cylinder(r = 0.5, h = 1) {
    return (x, y, z) => {
      const d = Math.hypot(x, z) - r;
      const dy = Math.abs(y) - h / 2;
      const ox = Math.max(d, 0), oy = Math.max(dy, 0);
      return Math.min(Math.max(d, dy), 0) + Math.hypot(ox, oy);
    };
  },
  capsule(r = 0.5, h = 1) {
    return (x, y, z) => {
      const dy = Math.max(Math.abs(y) - h / 2, 0);
      return Math.hypot(x, z, dy) - r;
    };
  },
  plane(n = [0, 1, 0], off = 0) {
    const [a, b, c] = n; const len = Math.hypot(a, b, c) || 1;
    return (x, y, z) => (a * x + b * y + c * z) / len + off;
  },
  slabY(min, max) {
    return (x, y, z) => -Math.min(y - min, max - y);
  },
};

// --- transforms (return a new SDF) ---------------------------------------
function modTranslate(sdf, tx, ty, tz, post) {
  return (x, y, z) => { const d = sdf(x - tx, y - ty, z - tz); return post ? post(d) : d; };
}
export const xform = {
  translate(sdf, t) { return modTranslate(sdf, t[0], t[1], t[2], null); },
  rotateY(sdf, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return (x, y, z) => sdf(x * c + z * s, y, -x * s + z * c);
  },
  rotateX(sdf, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return (x, y, z) => sdf(x, y * c - z * s, y * s + z * c);
  },
  scale(sdf, s) { return (x, y, z) => sdf(x / s, y / s, z / s) * s; },
  // shell/thickness: |d| - t
  shell(sdf, t) { return (x, y, z) => Math.abs(sdf(x, y, z)) - t; },
  // mirror across a plane (returns union of sdf and its mirror over X=0)
  mirrorX(sdf) {
    return (x, y, z) => Math.min(sdf(x, y, z), sdf(-x, y, z));
  },
  // repeat along X with period p
  repeatX(sdf, p) {
    return (x, y, z) => { const q = x - p * Math.round(x / p); return sdf(q, y, z); };
  },
  // extrude a 2D SDF (sdf2(x,z)) along Y to height h
  extrude(sdf2, h) {
    return (x, y, z) => {
      const d2 = sdf2(x, z);
      const dy = Math.abs(y) - h / 2;
      const ox = Math.max(d2, 0), oy = Math.max(dy, 0);
      return Math.min(Math.max(d2, dy), 0) + Math.hypot(ox, oy);
    };
  },
};

// --- boolean ops ----------------------------------------------------------
export const op = {
  union: (a, b) => (x, y, z) => Math.min(a(x, y, z), b(x, y, z)),
  intersection: (a, b) => (x, y, z) => Math.max(a(x, y, z), b(x, y, z)),
  difference: (a, b) => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z)),
  smoothUnion: (a, b, k = 0.2) => (x, y, z) => {
    const da = a(x, y, z), db = b(x, y, z);
    const h = Math.max(k - Math.abs(da - db), 0) / k;
    return Math.min(da, db) - h * h * k * 0.25;
  },
};

// --- scene: compose primitives with ops ----------------------------------
export class SdfScene {
  constructor() { this.root = null; }
  set(sdf) { this.root = sdf; return this; }
  union(sdf) { this.root = this.root ? op.union(this.root, sdf) : sdf; return this; }
  subtract(sdf) { this.root = this.root ? op.difference(this.root, sdf) : sdf; return this; }
  intersect(sdf) { this.root = this.root ? op.intersection(this.root, sdf) : sdf; return this; }
  distance(x, y, z) { return this.root ? this.root(x, y, z) : 1e9; }
  // Coarse surface sampler: grid points where |d| <= threshold.
  surfacePoints(bounds, step = 0.25, threshold = step * 0.75) {
    const pts = [];
    const [mn, mx] = bounds;
    for (let x = mn[0]; x <= mx[0]; x += step) {
      for (let y = mn[1]; y <= mx[1]; y += step) {
        for (let z = mn[2]; z <= mx[2]; z += step) {
          const d = this.distance(x, y, z);
          if (Math.abs(d) <= threshold) pts.push({ x, y, z, d });
        }
      }
    }
    return pts;
  }
}
