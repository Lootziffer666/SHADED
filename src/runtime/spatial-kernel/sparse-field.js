// SHADED Spatial Kernel — SparseField (spec §8, evolution of SparseVoxelWorld).
//
// Reuses the canonical VOXEL_STATE / VOXEL_PROVENANCE vocabulary from
// runtime/sparse-voxel-world.mjs (do NOT reinvent — spec PHASE 0 note). Adds:
//   - sparse chunks (only occupied space is allocated)
//   - dirty-chunk tracking for incremental/streaming updates
//   - confidence-weighted evidence fusion (observation vs simulation)
//   - stable spatial IDs and provenance per voxel
//   - GENERATED vs OBSERVED vs INFERRED vs USER distinction
//
// UNKNOWN remains UNKNOWN: setting a voxel is explicit. The universe is never
// auto-filled.

import { VOXEL_STATE, VOXEL_PROVENANCE } from '@runtime/sparse-voxel-world.js';

// Trust order for choosing a representative provenance when fusing evidence.
// Most trusted first.
const PROV_TRUST = [
  VOXEL_PROVENANCE.USER_APPROVED,
  VOXEL_PROVENANCE.MEASURED,
  VOXEL_PROVENANCE.OBSERVED,
  VOXEL_PROVENANCE.RECONSTRUCTED,
  VOXEL_PROVENANCE.INFERRED,
  VOXEL_PROVENANCE.GENERATED,
];

function chunkKeyOf(cx, cy, cz) { return cx + ':' + cy + ':' + cz; }
function localKeyOf(lx, ly, lz) { return lx + ':' + ly + ':' + lz; }

export class SparseField {
  constructor(opts = {}) {
    this.chunkSize = opts.chunkSize ?? 32;
    this.chunks = new Map(); // chunkKey -> { voxels:Map, dirty:bool, modified:number }
    this.multiResolution = opts.multiResolution ?? false; // reserved hook
  }

  _chunkCoord(v) { return Math.floor(v / this.chunkSize); }
  _local(v) { return ((v % this.chunkSize) + this.chunkSize) % this.chunkSize; }

  _chunk(cx, cy, cz, create = true) {
    const k = chunkKeyOf(cx, cy, cz);
    let c = this.chunks.get(k);
    if (!c && create) {
      c = { voxels: new Map(), dirty: false, modified: 0 };
      this.chunks.set(k, c);
    }
    return c;
  }

  // Write a single voxel. Explicit only — never called for UNKNOWN filler.
  set(x, y, z, info = {}) {
    const cx = this._chunkCoord(x), cy = this._chunkCoord(y), cz = this._chunkCoord(z);
    const c = this._chunk(cx, cy, cz);
    const lk = localKeyOf(this._local(x), this._local(y), this._local(z));
    const voxel = {
      x, y, z,
      state: info.state ?? VOXEL_STATE.SURFACE,
      provenance: info.provenance ?? VOXEL_PROVENANCE.OBSERVED,
      confidence: info.confidence ?? 1,
      material: info.material ?? null,
      sourceObs: info.sourceObs ?? null,
      generated: info.provenance === VOXEL_PROVENANCE.GENERATED,
    };
    c.voxels.set(lk, voxel);
    c.dirty = true;
    c.modified = Date.now();
    return voxel;
  }

  get(x, y, z) {
    const cx = this._chunkCoord(x), cy = this._chunkCoord(y), cz = this._chunkCoord(z);
    const c = this.chunks.get(chunkKeyOf(cx, cy, cz));
    if (!c) return null; // UNKNOWN — not allocated
    return c.voxels.get(localKeyOf(this._local(x), this._local(y), this._local(z))) || null;
  }

  // Confidence-weighted fusion of a new evidence voxel with any existing one.
  // Does NOT auto-create UNKNOWN space; only writes when evidence is supplied.
  fuse(x, y, z, evidence) {
    const existing = this.get(x, y, z);
    if (!existing) return this.set(x, y, z, evidence);
    const w = evidence.confidence ?? 1;
    const eConf = existing.confidence ?? 0;
    const fused = (eConf * (existing.state === VOXEL_STATE.UNKNOWN ? 0 : 1) + w) / (eConf + w || 1);
    const repProv = PROV_TRUST.indexOf(evidence.provenance) < PROV_TRUST.indexOf(existing.provenance)
      ? evidence.provenance : existing.provenance;
    const merged = {
      state: evidence.state ?? existing.state,
      provenance: repProv,
      confidence: Math.max(0, Math.min(1, fused)),
      material: evidence.material ?? existing.material,
      sourceObs: evidence.sourceObs ?? existing.sourceObs,
      generated: repProv === VOXEL_PROVENANCE.GENERATED,
    };
    return this.set(x, y, z, merged);
  }

  // Bulk import of a point/surface set from an observation into SURFACE voxels.
  importPoints(points, opts = {}) {
    const prov = opts.provenance ?? VOXEL_PROVENANCE.OBSERVED;
    const conf = opts.confidence ?? 1;
    const src = opts.sourceObs ?? null;
    let n = 0;
    for (const p of points) {
      this.set(Math.round(p.x), Math.round(p.y), Math.round(p.z), {
        state: VOXEL_STATE.SURFACE, provenance: prov, confidence: conf, sourceObs: src,
      });
      n++;
    }
    return n;
  }

  dirtyChunks() {
    return Array.from(this.chunks.entries()).filter(([, c]) => c.dirty).map(([k]) => k);
  }

  markChunkClean(key) {
    const c = this.chunks.get(key);
    if (c) c.dirty = false;
  }

  markAllClean() { for (const c of this.chunks.values()) c.dirty = false; }

  get voxelCount() {
    let n = 0;
    for (const c of this.chunks.values()) n += c.voxels.size;
    return n;
  }

  get chunkCount() { return this.chunks.size; }

  // Bridge to the legacy renderer world (reuse, not replace). Populates a
  // SparseVoxelWorld instance from this field's voxels.
  toLegacy(world) {
    for (const c of this.chunks.values()) {
      for (const v of c.voxels.values()) {
        world.setVoxel ? world.setVoxel(v.x, v.y, v.z, v.state, { provenance: v.provenance, confidence: v.confidence }) : null;
      }
    }
    return world;
  }
}

export { VOXEL_STATE, VOXEL_PROVENANCE };
