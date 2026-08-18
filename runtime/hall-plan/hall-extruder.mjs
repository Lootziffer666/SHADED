// BUILD HALL – extrudes the semantic hall model into structural geometry.
// Produces primitive colliders (AABBs) + simple render boxes, and exposes
// structural anchors for PHOTO-FIRST camera matching. Kept deliberately simple:
// primitives stay primitives, no invented detail (CLAUDE.md Invariante: Plan erfindet
// keine Texturen/Fenster/Beleuchtung).

import { HallModel, HallColumn, HallWall, HallCore, HallPortal, HallStair, HallEscalator, PlanPoint } from './hall-plan-core.mjs';

export class HallExtruder {
  constructor(model, params = {}) {
    if (!(model instanceof HallModel)) throw new Error('HallExtruder braucht ein HallModel.');
    this.model = model;
    this.params = {
      hallHeight: params.hallHeight ?? 7.4,
      columnHeight: params.columnHeight ?? 7.4,
      defaultWallHeight: params.defaultWallHeight ?? 7.4,
      defaultWallThickness: params.defaultWallThickness ?? 0.3,
      floorThickness: params.floorThickness ?? 0.2,
      // Mark which heights were explicitly given vs. defaulted (never claim measured).
      hallHeightIsDefault: params.hallHeight == null,
      columnHeightIsDefault: params.columnHeight == null,
      defaultWallHeightIsDefault: params.defaultWallHeight == null
    };
  }

  /** Generate axis-aligned collider boxes (world meters) for all solid elements. */
  buildColliders() {
    const colliders = [];
    for (const col of this.model.getAllColumns()) {
      const h = col.height ?? this.params.columnHeight;
      const hw = (col.footprint[0] ?? 0.4) / 2, hd = (col.footprint[1] ?? 0.4) / 2;
      colliders.push({
        id: col.id, type: 'column',
        min: [col.position.x - hw, 0, col.position.y - hd],
        max: [col.position.x + hw, h, col.position.y + hd],
        provenance: col.getProp('provenance', 'AUTO_DETECTED')
      });
    }
    for (const wall of this.model.getAllWalls()) {
      const h = wall.height ?? this.params.defaultWallHeight;
      const t = wall.getProp('thickness', this.params.defaultWallThickness);
      const box = this._wallBox(wall, h, t);
      if (box) colliders.push({ id: wall.id, type: 'wall', ...box, provenance: wall.getProp('provenance', 'AUTO_DETECTED') });
    }
    for (const core of this.model.getAllCores()) {
      const h = core.height ?? this.params.hallHeight;
      const box = this._polygonBox(core.footprint, h);
      if (box) colliders.push({ id: core.id, type: 'core', ...box, provenance: core.getProp('provenance', 'AUTO_DETECTED') });
    }
    // Stairs / escalators: simple bounding boxes as navigable blockers.
    for (const s of [...this.model.getAllStairs(), ...this.model.getAllEscalators()]) {
      const hw = s.width / 2, depth = 1.2;
      const h = Math.max(0.2, Math.abs(s.heightDifference));
      colliders.push({
        id: s.id, type: s.type,
        min: [s.position.x - hw, Math.min(0, s.heightDifference), s.position.y - depth / 2],
        max: [s.position.x + hw, Math.max(0, s.heightDifference) + h, s.position.y + depth / 2],
        provenance: s.getProp('provenance', 'AUTO_DETECTED')
      });
    }
    return colliders;
  }

  _wallBox(wall, h, t) {
    if (!wall.footprint || wall.footprint.length < 2) return null;
    // Treat footprint as a path; expand by half thickness perpendicular to segments.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const half = t / 2;
    for (let i = 0; i < wall.footprint.length - 1; i++) {
      const a = wall.footprint[i], b = wall.footprint[i + 1];
      const dx = b.x - a.x, dz = b.y - a.y;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len * half, pz = dx / len * half; // perpendicular
      for (const p of [a, b]) {
        minX = Math.min(minX, p.x - Math.abs(px), p.x + Math.abs(px));
        maxX = Math.max(maxX, p.x - Math.abs(px), p.x + Math.abs(px));
        minZ = Math.min(minZ, p.y - Math.abs(pz), p.y + Math.abs(pz));
        maxZ = Math.max(maxZ, p.y - Math.abs(pz), p.y + Math.abs(pz));
      }
    }
    return { min: [minX, 0, minZ], max: [maxX, h, maxZ] };
  }

  _polygonBox(footprint, h) {
    if (!footprint || footprint.length < 3) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of footprint) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    return { min: [minX, 0, minZ], max: [maxX, h, maxZ] };
  }

  /** Floor polygon(s) as world-meter point arrays. */
  buildFloor() {
    const floor = this.model.getProp?.('floor') || this.model.bounds?.floor;
    // Prefer explicit floor polygon, else fall back to outer shell bounds.
    if (floor && floor.polygon && floor.polygon.length >= 3) {
      return floor.polygon.map(p => [p.x, p.y]);
    }
    const bb = this.model.getBoundingBox();
    return [
      [bb.min[0], bb.min[2]], [bb.max[0], bb.min[2]],
      [bb.max[0], bb.max[2]], [bb.min[0], bb.max[2]]
    ];
  }

  /** Produce structural anchors (3D world points) for PHOTO-FIRST matching. */
  buildAnchors() {
    const anchors = [];
    for (const col of this.model.getAllColumns()) {
      const h = col.height ?? this.params.columnHeight;
      anchors.push({
        id: 'anchor_' + col.id,
        kind: 'column',
        refId: col.id,
        position: [col.position.x, h * 0.5, col.position.y],
        base: [col.position.x, 0, col.position.y],
        confidence: col.getProp('confidence', 1.0)
      });
    }
    for (const wall of this.model.getAllWalls()) {
      if (wall.footprint && wall.footprint.length >= 2) {
        const mid = wall.footprint[Math.floor(wall.footprint.length / 2)];
        anchors.push({
          id: 'anchor_' + wall.id, kind: 'wall', refId: wall.id,
          position: [mid.x, (wall.height ?? this.params.defaultWallHeight) * 0.5, mid.y],
          base: [mid.x, 0, mid.y], confidence: wall.getProp('confidence', 1.0)
        });
      }
    }
    return anchors;
  }

  /** Combined structural description used by render + nav + photo matching. */
  build() {
    return {
      colliders: this.buildColliders(),
      floor: this.buildFloor(),
      anchors: this.buildAnchors(),
      params: this.params,
      provenance: 'STRUCTURAL_HALL'
    };
  }

  /**
   * Rasterize colliders into an existing navigation grid (mirrors spatial-navigation
   * blockCell). Keeps structural collision independent of any photo patch.
   * @param {{size:number, cells:Int8Array|Uint8Array}} grid
   */
  applyToNavGrid(grid) {
    const size = grid.size;
    const colliders = this.buildColliders();
    const toCell = v => Math.max(1, Math.min(size - 2, Math.floor(((v + 1) * 0.5) * size)));
    for (const c of colliders) {
      const x0 = toCell(c.min[0]), x1 = toCell(c.max[0]);
      const z0 = toCell(c.min[2]), z1 = toCell(c.max[2]);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const idx = z * size + x; grid.cells[idx] = 1;
      }
    }
    return grid;
  }
}

/** Helper: build a simple box mesh (triangles) for a collider, for rendering. */
export function colliderToMesh(c, color = [0.6, 0.6, 0.65]) {
  const { min, max } = c;
  const v = [
    [min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]],
    [min[0], max[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]
  ];
  const idx = [
    0, 1, 2, 0, 2, 3, // bottom
    4, 6, 5, 4, 7, 6, // top
    0, 4, 5, 0, 5, 1, // front
    1, 5, 6, 1, 6, 2, // right
    2, 6, 7, 2, 7, 3, // back
    3, 7, 4, 3, 4, 0  // left
  ];
  return { id: c.id, type: c.type, vertices: v, indices: idx, color };
}
