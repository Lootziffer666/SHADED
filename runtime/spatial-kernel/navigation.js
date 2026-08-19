// SHADED Spatial Kernel — Navigation subsystem (spec §12, extends the shared
// grid conventions in runtime/spatial-navigation.mjs).
//
// Adds A* (alongside the existing Dijkstra), obstacle inflation by actor
// radius, slope cost, line-of-sight shortcutting, and path invalidation after
// geometry changes. Navigation consumes the SAME spatial truth as collision —
// there is no invisible alternate nav-world.
//
// Grid convention (shared): { size, cells:Uint8Array(1=blocked), cost:Float32Array }.

// Minimal binary min-heap keyed by [priority, value].
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(p, v) {
    const a = this.a; a.push([p, v]); let i = a.length - 1;
    while (i > 0) { const p2 = (i - 1) >> 1; if (a[p2][0] <= a[i][0]) break; [a[p2], a[i]] = [a[i], a[p2]]; i = p2; }
  }
  pop() {
    const a = this.a; if (!a.length) return null; const top = a[0], last = a.pop();
    if (a.length) { let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; if (l >= a.length) break; const c = r < a.length && a[r][0] < a[l][0] ? r : l; if (a[c][0] >= last[0]) break; a[i] = a[c]; i = c; } a[i] = last; }
    return top;
  }
}

const idx = (x, z, size) => z * size + x;

// Precompute a blocked mask inflated by actor radius (clears a corridor).
export function inflateObstacles(grid, radius = 0) {
  const { size, cells } = grid;
  const blocked = new Uint8Array(cells.length);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    if (cells[idx(x, z, size)]) { blocked[idx(x, z, size)] = 1; continue; }
    let hit = false;
    for (let dz = -radius; dz <= radius && !hit; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      if (cells[idx(nx, nz, size)]) { hit = true; break; }
    }
    if (hit) blocked[idx(x, z, size)] = 1;
  }
  return blocked;
}

// A* over the grid. opts: { diagonal, clearance, heightField, maxSlope }.
export function aStarGrid(grid, start, goal, opts = {}) {
  const { size, cost } = grid;
  const diagonal = opts.diagonal ?? true;
  const blocked = opts.clearance ? inflateObstacles(grid, opts.clearance) : grid.cells;
  const hf = opts.heightField, maxSlope = opts.maxSlope ?? Infinity;
  const sI = idx(start[0], start[1], size), gI = idx(goal[0], goal[1], size);
  if (blocked[sI] || blocked[gI]) return [];
  const total = size * size;
  const g = new Float64Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  g[sI] = 0;
  const open = new Heap();
  const h = (x, z) => diagonal
    ? (Math.abs(x - goal[0]) + Math.abs(z - goal[1])) + (Math.SQRT2 - 2) * Math.min(Math.abs(x - goal[0]), Math.abs(z - goal[1]))
    : Math.abs(x - goal[0]) + Math.abs(z - goal[1]);
  open.push(h(start[0], start[1]), sI);
  const neighbours = diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (open.size) {
    const [, cur] = open.pop();
    if (cur === gI) break;
    const cx = cur % size, cz = (cur / size) | 0;
    for (const [dx, dz] of neighbours) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const ni = idx(nx, nz, size);
      if (blocked[ni]) continue;
      // no corner cutting on diagonals
      if (dx !== 0 && dz !== 0 && (blocked[idx(cx + dx, cz, size)] && blocked[idx(cx, cz + dz, size)])) continue;
      let step = (cost ? cost[ni] : 1) || 1;
      if (dx !== 0 && dz !== 0) step *= Math.SQRT2;
      if (hf && maxSlope < Infinity) {
        const slope = Math.abs(hf[ni] - hf[cur]) / Math.SQRT2;
        if (slope > maxSlope) continue; // impassable slope
        step *= 1 + slope / maxSlope; // penalize
      }
      const cand = g[cur] + Math.max(0.001, step);
      if (cand < g[ni]) { g[ni] = cand; prev[ni] = cur; open.push(cand + h(nx, nz), ni); }
    }
  }
  if (!Number.isFinite(g[gI])) return [];
  const path = [];
  for (let at = gI; at !== -1; at = prev[at]) path.push([at % size, (at / size) | 0]);
  return path.reverse();
}

// Bresenham line-of-sight between two cells (no blocked cell in between).
export function hasLineOfSight(grid, a, b) {
  const { size, cells } = grid;
  let x0 = a[0], z0 = a[1], x1 = b[0], z1 = b[1];
  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
  let err = dx - dz, x = x0, z = z0;
  for (;;) {
    if (cells[idx(x, z, size)]) return false;
    if (x === x1 && z === z1) return true;
    const e2 = 2 * err;
    if (e2 > -dz) { err -= dz; x += sx; }
    if (e2 < dx) { err += dx; z += sz; }
  }
}

// Shortcut a path where consecutive nodes have clear LOS.
export function lineOfSightShortcut(grid, path) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!hasLineOfSight(grid, path[anchor], path[i])) { out.push(path[i - 1]); anchor = i - 1; }
  }
  out.push(path[path.length - 1]);
  return out;
}

// Invalidate cached paths that pass through dirty cells.
// paths: Map(key -> Array<[x,z]>). dirty: Set<cellIndex> (or Array).
// Returns Array of invalidated keys.
export function invalidatePaths(paths, dirty, size) {
  const dirtySet = dirty instanceof Set ? dirty : new Set(dirty);
  const invalidated = [];
  for (const [key, path] of paths) {
    for (const [x, z] of path) {
      if (dirtySet.has(idx(x, z, size))) { invalidated.push(key); break; }
    }
  }
  return invalidated;
}
