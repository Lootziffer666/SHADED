// SHADED Spatial Kernel — ObservationStore (spec §3 subsystem).
//
// Holds ingested GeometryObservations with stable IDs and the minimal
// bookkeeping SpatialMemory (§5) needs: keyframe flags, anchor set, and
// overlap hints. It does NOT rebuild the world on every insert; it only records.
//
// Dependency-free.

import { GeometryObservation, OBS_PROVENANCE } from './observation.js';

export class ObservationStore {
  constructor() {
    this._byId = new Map();
    this._order = []; // insertion order of ids
    this._keyframes = new Set();
    this._anchors = new Set();
    this._overlaps = new Map(); // id -> [otherId,...] (set by SpatialMemory)
    this._nextSequence = 0;
  }

  // Store an observation, assigning a stable id + sequence if absent.
  // Returns the stored observation.
  add(observation) {
    const obs = observation instanceof GeometryObservation
      ? observation
      : new GeometryObservation(observation);
    if (obs.sequence == null) {
      obs.sequence = this._nextSequence++;
    } else if (obs.sequence >= this._nextSequence) {
      this._nextSequence = obs.sequence + 1;
    }
    this._byId.set(obs.id, obs);
    if (!this._order.includes(obs.id)) this._order.push(obs.id);
    return obs;
  }

  get(id) {
    return this._byId.get(id) || null;
  }

  has(id) {
    return this._byId.has(id);
  }

  list() {
    return this._order.map((id) => this._byId.get(id));
  }

  // Streaming-ordered slice (oldest..newest) for incremental integration.
  inSequence() {
    return this.list().sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  }

  remove(id) {
    if (!this._byId.delete(id)) return false;
    this._order = this._order.filter((x) => x !== id);
    this._keyframes.delete(id);
    this._anchors.delete(id);
    this._overlaps.delete(id);
    return true;
  }

  markKeyframe(id, isKeyframe = true) {
    if (!this._byId.has(id)) return false;
    if (isKeyframe) this._keyframes.add(id); else this._keyframes.delete(id);
    return true;
  }

  isKeyframe(id) {
    return this._keyframes.has(id);
  }

  markAnchor(id, isAnchor = true) {
    if (!this._byId.has(id)) return false;
    if (isAnchor) this._anchors.add(id); else this._anchors.delete(id);
    return true;
  }

  isAnchor(id) {
    return this._anchors.has(id);
  }

  // Record that observation `id` overlaps observation `otherId` (SpatialMemory fills this).
  recordOverlap(id, otherId) {
    if (id === otherId) return;
    if (!this._overlaps.has(id)) this._overlaps.set(id, new Set());
    this._overlaps.get(id).add(otherId);
  }

  overlapsOf(id) {
    return Array.from(this._overlaps.get(id) || []);
  }

  // Count of observations that are NOT simulated fallback (trust accounting).
  trustedCount() {
    let n = 0;
    for (const o of this._byId.values()) {
      if (o.provenanceClass !== OBS_PROVENANCE.SIMULATED_FALLBACK) n++;
    }
    return n;
  }

  clear() {
    this._byId.clear();
    this._order.length = 0;
    this._keyframes.clear();
    this._anchors.clear();
    this._overlaps.clear();
    this._nextSequence = 0;
  }

  get size() {
    return this._byId.size;
  }
}
