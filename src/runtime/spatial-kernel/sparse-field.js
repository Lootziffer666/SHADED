// SHADED Spatial Kernel — SparseField (spec §8, evolution of SparseVoxelWorld).
//
// Reuses the canonical VOXEL_STATE / VOXEL_PROVENANCE vocabulary from
// runtime/sparse-voxel-world.mjs (do NOT reinvent — spec PHASE 0 note). Adds:
//   - sparse chunks (only occupied space is allocated)
//   - dirty-chunk tracking for incremental/streaming updates
//   - confidence-weighted evidence fusion (observation vs simulation)
//   - stable spatial IDs and provenance per voxel
//   - GENERATED vs OBSERVED vs INFERRED vs USER distinction
//   - LRU chunk eviction (spec §8: camera-independent world state)
//   - voxel-hash neighbourhood queries (O(n log n) via chunk index)
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
    this.chunks = new Map(); // chunkKey -> { voxels:Map, dirty:bool, modified:number, access:number }
    this.multiResolution = opts.multiResolution ?? false;
    this.maxChunks = opts.maxChunks ?? 4096; // LRU limit
    this._lruHead = null; // doubly-linked list for LRU
    this._lruTail = null;
    this._lruMap = new Map(); // chunkKey -> { prev, next }
  }

  _chunkCoord(v) { return Math.floor(v / this.chunkSize); }
  _local(v) { return ((v % this.chunkSize) + this.chunkSize) % this.chunkSize; }

  // LRU list operations
  _lruTouch(key) {
    const node = this._lruMap.get(key);
    if (!node) {
      this._lruMap.set(key, { prev: this._lruTail, next: null });
      if (this._lruTail) this._lruMap.get(this._lruTail).next = key;
      this._lruTail = key;
      if (!this._lruHead) this._lruHead = key;
      return;
    }
    if (key === this._lruTail) return;
    // Remove from current position
    if (node.prev) this._lruMap.get(node.prev).next = node.next;
    else this._lruHead = node.next;
    if (node.next) this._lruMap.get(node.next).prev = node.prev;
    else this._lruTail = node.prev;
    // Add to tail
    node.prev = this._lruTail;
    node.next = null;
    if (this._lruTail) this._lruMap.get(this._lruTail).next = key;
    this._lruTail = key;
  }

  _lruEvict() {
    if (!this._lruHead) return;
    const victim = this._lruHead;
    const node = this._lruMap.get(victim);
    this._lruHead = node.next;
    if (this._lruHead) this._lruMap.get(this._lruHead).prev = null;
    else this._lruTail = null;
    this._lruMap.delete(victim);
    this.chunks.delete(victim);
  }

  _chunk(cx, cy, cz, create = true) {
    const k = chunkKeyOf(cx, cy, cz);
    let c = this.chunks.get(k);
    if (!c && create) {
      if (this.chunks.size >= this.maxChunks) this._lruEvict();
      c = { voxels: new Map(), dirty: false, modified: 0, access: Date.now() };
      this.chunks.set(k, c);
      this._lruTouch(k);
    } else if (c) {
      this._lruTouch(k);
      c.access = Date.now();
    }
    return c;
  }

  _chunkCoord(v) { return Math.floor(v / this.chunkSize); }
  _local(v) { return ((v % this.chunkSize) + this.chunkSize) % this.chunkSize; }

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
    if (!c) return null;
    this._lruTouch(chunkKeyOf(cx, cy, cz));
    return c.voxels.get(localKeyOf(this._local(x), this._local(y), this._local(z))) || null;
  }

  // Confidence-weighted fusion of a new evidence voxel with any existing one.
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

  // --- Voxel-hash neighbourhood (spec §6A/§8): O(1) chunk lookup + k neighbours ---
  // Returns up to k neighbour voxel coordinates within maxDist, using chunk index.
  neighbours(x, y, z, opts = {}) {
    const k = opts.k ?? 16;
    const maxDist = opts.maxDist ?? this.chunkSize * 2;
    const cx = this._chunkCoord(x), cy = this._chunkCoord(y), cz = this._chunkCoord(z);
    const maxChunkDist = Math.ceil(maxDist / this.chunkSize);
    const out = [];
    const cx0 = cx - maxChunkDist, cx1 = cx + maxChunkDist;
    const cy0 = cy - maxChunkDist, cy1 = cy + maxChunkDist;
    const cz0 = cz - maxChunkDist, cz1 = cz + maxChunkDist;
    for (let ccz = cz0; ccz <= cz1 && out.length < k; ccz++) {
      for (let ccy = cy0; ccy <= cy1 && out.length < k; ccy++) {
        for (let ccx = cx0; ccx <= cx1 && out.length < k; ccx++) {
          const c = this.chunks.get(chunkKeyOf(ccx, ccy, ccz));
          if (!c) continue;
          for (const [lk, v] of c.voxels) {
            if (v.x === x && v.y === y && v.z === z) continue;
            const dx = v.x - x, dy = v.y - y, dz = v.z - z;
            if (dx * dx + dy * dy + dz * dz <= maxDist * maxDist) {
              out.push({ x: v.x, y: v.y, z: v.z, voxel: v });
              if (out.length >= k) break;
            }
          }
        }
      }
    }
    out.sort((a, b) => (a.voxel.x - x) ** 2 + (a.voxel.y - y) ** 2 + (a.voxel.z - z) ** 2 -
                    (b.voxel.x - x) ** 2 - (b.voxel.y - y) ** 2 - (b.voxel.z - z) ** 2);
    return out.slice(0, k);
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

  // Bridge to the legacy renderer world (reuse, not replace).
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
