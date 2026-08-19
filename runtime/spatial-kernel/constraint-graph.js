// SHADED Spatial Kernel — ConstraintGraph (spec §10, REST3D-inspired).
//
// Cheap deterministic spatial constraints. Generated/inferred geometry can run
// a stabilization pass, but TRUSTED observed/plan geometry is never moved
// merely to please an inferred object (spec §10). Optional rigid-body sim is a
// separate backend (rapier) — not built here.
//
// Pure, dependency-free.

export class ConstraintGraph {
  constructor(opts = {}) {
    this.gravity = opts.gravity || [0, -1, 0]; // unit-ish direction
    this.groundY = opts.groundY ?? 0;
    this.supportTol = opts.supportTol ?? 0.15;
    this.nodes = new Map(); // id -> { box:{min,max}, fixed, role, mass }
  }

  addNode(id, box, opts = {}) {
    if (box.min[1] > box.max[1]) throw new Error('invalid box');
    this.nodes.set(id, {
      id, box,
      fixed: opts.fixed ?? false,
      role: opts.role ?? 'object',
      mass: opts.mass ?? 1,
    });
    return this.nodes.get(id);
  }

  removeNode(id) { return this.nodes.delete(id); }
  get(id) { return this.nodes.get(id); }

  // Is `id` supported? Bottom within tol of ground, or resting on top of
  // another node whose top is below and footprint overlaps.
  isSupported(id) {
    const n = this._box(id);
    if (!n) return false;
    const bottom = n.min[1];
    if (Math.abs(bottom - this.groundY) <= this.supportTol) return true;
    for (const [oid, o] of this.nodes) {
      if (oid === id) continue;
      const ob = o.box;
      if (Math.abs(ob.max[1] - bottom) <= this.supportTol && footprintsOverlap(n, ob)) return true;
    }
    return false;
  }

  // Detect 3D overlaps (penetration) between all node pairs.
  overlaps() {
    const out = [];
    const ids = Array.from(this.nodes.keys());
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = this.nodes.get(ids[i]).box, b = this.nodes.get(ids[j]).box;
        if (boxesOverlap(a, b)) out.push([ids[i], ids[j]]);
      }
    }
    return out;
  }

  // Center of mass (box center) must project inside the support footprint.
  restsPlausibly(id) {
    const n = this._box(id);
    if (!n) return false;
    if (this.nodes.get(id).fixed) return true;
    if (!this.isSupported(id)) return false;
    const cx = (n.min[0] + n.max[0]) / 2, cz = (n.min[2] + n.max[2]) / 2;
    if (Math.abs(n.min[1] - this.groundY) <= this.supportTol) return true;
    for (const [oid, o] of this.nodes) {
      if (oid === id) continue;
      if (Math.abs(o.box.max[1] - n.min[1]) <= this.supportTol &&
          cx >= o.box.min[0] && cx <= o.box.max[0] && cz >= o.box.min[2] && cz <= o.box.max[2]) return true;
    }
    return false;
  }

  // Stabilization pass: compute unstable nodes and penetration corrections.
  // Non-fixed penetrating nodes are pushed apart along the minimum
  // translation axis. Fixed/observed nodes are never moved.
  analyze() {
    const unstable = [];
    const overlaps = this.overlaps();
    const corrections = [];
    for (const [id] of this.nodes) {
      const n = this.nodes.get(id);
      if (n.fixed) continue;
      if (!this.restsPlausibly(id)) unstable.push({ id, reason: this.isSupported(id) ? 'com-off-footprint' : 'unsupported' });
    }
    for (const [a, b] of overlaps) {
      const na = this.nodes.get(a), nb = this.nodes.get(b);
      const corr = minTranslation(na.box, nb.box);
      if (!na.fixed) corrections.push({ id: a, delta: corr.a });
      if (!nb.fixed) corrections.push({ id: b, delta: corr.b });
    }
    return { unstable, overlaps, corrections };
  }

  // Apply corrections to non-fixed nodes; returns applied list.
  resolve() {
    const { corrections } = this.analyze();
    const applied = [];
    for (const c of corrections) {
      const n = this.nodes.get(c.id);
      if (!n || n.fixed) continue;
      n.box = translateBox(n.box, c.delta);
      applied.push({ id: c.id, delta: c.delta });
    }
    return applied;
  }

  _box(id) { const n = this.nodes.get(id); return n ? n.box : null; }
}

function translateBox(b, d) {
  return { min: [b.min[0] + d[0], b.min[1] + d[1], b.min[2] + d[2]], max: [b.max[0] + d[0], b.max[1] + d[1], b.max[2] + d[2]] };
}
function boxesOverlap(a, b) {
  return a.min[0] < b.max[0] && a.max[0] > b.min[0] &&
         a.min[1] < b.max[1] && a.max[1] > b.min[1] &&
         a.min[2] < b.max[2] && a.max[2] > b.min[2];
}
function footprintsOverlap(a, b) {
  return a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[2] < b.max[2] && a.max[2] > b.min[2];
}
// Minimum translation to separate two overlapping boxes (A pushed one way, B the other).
function minTranslation(a, b) {
  const dx = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const dy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const dz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  if (dx <= dy && dx <= dz) {
    const dir = a.min[0] < b.min[0] ? -1 : 1;
    return { a: [dir * dx, 0, 0], b: [-dir * dx, 0, 0] };
  } else if (dy <= dz) {
    const dir = a.min[1] < b.min[1] ? -1 : 1;
    return { a: [0, dir * dy, 0], b: [0, -dir * dy, 0] };
  } else {
    const dir = a.min[2] < b.min[2] ? -1 : 1;
    return { a: [0, 0, dir * dz], b: [0, 0, -dir * dz] };
  }
}
