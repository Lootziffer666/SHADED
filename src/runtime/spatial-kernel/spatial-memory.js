// SHADED Spatial Kernel — SpatialMemory (spec §5, Lingbot-inspired, LIGHTWEIGHT).
//
// Deliberately NOT a neural transformer. It borrows only the useful structural
// ideas from Robbyant/lingbot-map:
//   - anchors (fixed world-frame references)
//   - keyframes (local reference windows)
//   - bounded local window (memory does not grow unboundedly)
//   - pose graph with registration residuals
//   - drift monitoring + loop/anchor correction where evidence permits
//
// Integration is INCREMENTAL: a new observation is integrated against its
// parent/anchor; the entire world is NEVER rebuilt from scratch unless
// explicitly requested. Deterministic and seed-free.
//
// Registration is injected (a `registrar` with `register(a,b) -> {rel, residual,
// overlap}`). The real PatchRegistrar plugs in here later; tests use a stub.

// --- minimal pose math (position + yaw + uniform scale) -------------------
function compose(parent, rel) {
  // rotate rel translation by parent yaw, scale, then translate
  const c = Math.cos(parent.yaw), s = Math.sin(parent.yaw);
  const tx = (rel.x * c - rel.z * s) * parent.scale;
  const tz = (rel.x * s + rel.z * c) * parent.scale;
  return {
    x: parent.x + tx,
    y: parent.y + rel.y * parent.scale,
    z: parent.z + tz,
    yaw: parent.yaw + rel.yaw,
    scale: parent.scale * rel.scale,
  };
}
function inverse(p) {
  // world^-1 relative to origin
  const c = Math.cos(-p.yaw), s = Math.sin(-p.yaw);
  const x = (p.x * c - p.z * s) / p.scale;
  const z = (p.x * s + p.z * c) / p.scale;
  return { x: -x, y: -p.y / p.scale, z: -z, yaw: -p.yaw, scale: 1 / p.scale };
}
function relBetween(aWorld, bWorld) {
  return compose(inverse(aWorld), bWorld);
}

export class SpatialMemory {
  constructor(opts = {}) {
    this.store = opts.store || null; // ObservationStore (for keyframe/anchor flags)
    this.registrar = opts.registrar || null;
    this.localWindowSize = opts.localWindowSize ?? 8;
    this.anchorResidualThreshold = opts.anchorResidualThreshold ?? 0.04;
    this.keyframeResidualThreshold = opts.keyframeResidualThreshold ?? 0.10;

    this.originId = null;
    this.poses = new Map();   // id -> world pose
    this.edges = new Map();   // id -> { parentId, rel, residual, overlap }
    this.window = [];         // recent ids, bounded
    this.driftMax = 0;        // worst recent registration residual
    this.corrections = 0;     // loop/anchor corrections applied
    this.correctedResidualTotal = 0;
    this._kernel = null;
  }

  onKernelReady(kernel) { this._kernel = kernel; this.store = this.store || kernel?.observations || null; }

  // Called by the kernel on every ingested observation (subsystem hook).
  // If a registrar is available and there is a parent observation, attempt
  // registration and integrate the relative transform incrementally.
  onIngest(obs, kernel) {
    this.store = this.store || kernel?.observations || null;
    if (this.originId == null) {
      this.originId = obs.id;
      this.poses.set(obs.id, { x: 0, y: 0, z: 0, yaw: 0, scale: 1 });
      this._pushWindow(obs.id);
      if (this.store) { this.store.markAnchor(obs.id); this.store.markKeyframe(obs.id); }
      return { role: 'origin' };
    }
    // Integrate against the most recent keyframe/anchor (local reference window).
    const parentId = this._localReference();
    if (!parentId || !this.registrar) return { role: 'unintegrated' };
    const parent = this.store ? this.store.get(parentId) : null;
    const reg = this.registrar.register(parent, obs);
    return this.integrate(obs, { parentId, rel: reg.rel, residual: reg.residual, overlap: reg.overlap });
  }

  // Core incremental integration step.
  integrate(obs, { parentId, rel, residual, overlap = 0 }) {
    const parentPose = this.poses.get(parentId);
    if (!parentPose) return { ok: false, error: 'no parent pose' };
    const world = compose(parentPose, rel);
    this.poses.set(obs.id, world);
    this.edges.set(obs.id, { parentId, rel, residual, overlap });
    this.driftMax = Math.max(this.driftMax, residual);

    this._pushWindow(obs.id);
    if (this.store) {
      if (residual <= this.keyframeResidualThreshold) this.store.markKeyframe(obs.id);
      if (residual <= this.anchorResidualThreshold) this.store.markAnchor(obs.id);
    }
    return { ok: true, role: 'integrated', residual, world };
  }

  // Loop/anchor correction: register `obsId` against an EARLIER anchor
  // `anchorId`. If the residual is small, snap the chain (override the edge)
  // and report the correction magnitude. This is the deterministic analogue of
  // Lingbot drift correction — only applied where evidence permits.
  loopClose(obsId, anchorId, { rel, residual, overlap = 0 } = {}) {
    const anchorPose = this.poses.get(anchorId);
    const obs = this.store ? this.store.get(obsId) : null;
    let r = residual, re = rel;
    if (this.registrar && obs) {
      const reg = this.registrar.register(this.store.get(anchorId), obs);
      r = reg.residual; re = reg.rel;
    }
    if (anchorPose == null || r == null) return { ok: false };
    if (r > this.anchorResidualThreshold) {
      return { ok: false, reason: 'residual too high to correct', residual: r };
    }
    const before = this.poses.get(obsId);
    const after = compose(anchorPose, re);
    const correction = before ? Math.hypot(after.x - before.x, after.z - before.z) : 0;
    this.poses.set(obsId, after);
    this.edges.set(obsId, { parentId: anchorId, rel: re, residual: r, overlap });
    this.corrections += 1;
    this.correctedResidualTotal += correction;
    return { ok: true, corrected: correction, residual: r };
  }

  worldPoseOf(id) { return this.poses.get(id) || null; }
  driftEstimate() { return this.driftMax; }
  hasAnchor(id) { return this.store ? this.store.isAnchor(id) : false; }

  _localReference() {
    // most recent anchor in the current window, else most recent pose
    for (let i = this.window.length - 1; i >= 0; i--) {
      const id = this.window[i];
      if (this.store && this.store.isAnchor(id)) return id;
    }
    return this.window.length ? this.window[this.window.length - 1] : this.originId;
  }

  _pushWindow(id) {
    this.window.push(id);
    // Hard-cap the recent-reference window. Anchors/keyframes are tracked
    // separately (in the store) and remain findable for loop closure even
    // after they leave this buffer, so evicting them here is safe.
    while (this.window.length > this.localWindowSize) this.window.shift();
  }
}

export const _poseMath = { compose, inverse, relBetween };
