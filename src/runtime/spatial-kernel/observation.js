// SHADED Spatial Kernel — universal observation contract (spec §4).
//
// A GeometryObservation is the single, versioned currency that flows INTO the
// kernel. NO provider-specific assumption may leak into the kernel: DA3, MoGe,
// a manual Reverse-Viewfinder camera, a floor plan, a video frame, procedural
// rules, or simulated worlds all produce the same shaped object.
//
// This module is intentionally dependency-free (no imports) so it runs in the
// browser and under `node --check` / `node` tests without node_modules.

export const OBSERVATION_SPEC_VERSION = 'shaded.spatial-observation.v1';

// Where an observation originated. The kernel treats all of these uniformly.
export const SOURCE_TYPE = Object.freeze({
  PHOTO: 'photo',
  VIDEO_FRAME: 'video-frame',
  DEPTH: 'depth',
  POINT_MAP: 'point-map',
  POINT_CLOUD: 'point-cloud',
  MESH: 'mesh',
  VOXELS: 'voxels',
  GAUSSIANS: 'gaussians',
  FLOOR_PLAN: 'floor-plan',
  PROCEDURAL: 'procedural',
  MANUAL: 'manual',
  SIMULATION: 'simulation',
  SEMANTIC_CONSTRAINTS: 'semantic-constraints',
  HYBRID: 'hybrid',
});

// Provenance class — MUST distinguish inferred/faked output from trusted input.
// The old SpatialSystemIntegrator silently produced "simulated" depth; that is
// now explicit (spec: do not fake provider output).
export const OBS_PROVENANCE = Object.freeze({
  MEASURED: 'MEASURED',
  OBSERVED: 'OBSERVED',
  RECONSTRUCTED: 'RECONSTRUCTED',
  INFERRED: 'INFERRED',
  GENERATED: 'GENERATED',
  USER_APPROVED: 'USER_APPROVED',
  // Explicit marker that this observation is NOT real inference.
  SIMULATED_FALLBACK: 'SIMULATED_FALLBACK',
});

let _seq = 0;
function nextId() {
  _seq += 1;
  return 'obs_' + _seq.toString(36).padStart(6, '0');
}

export class GeometryObservation {
  constructor(init = {}) {
    this.specVersion = OBSERVATION_SPEC_VERSION;
    this.id = init.id || nextId();
    // Sequence index for streaming ordering (SpatialMemory keyframes, §5).
    this.sequence = init.sequence ?? null;
    this.timestamp = init.timestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());

    this.sourceType = init.sourceType || SOURCE_TYPE.MANUAL;
    // 'camera' | 'world' | 'unknown' — coordinate frame of the payload.
    this.coordinateFrame = init.coordinateFrame || 'unknown';

    // Optional RGB / image reference (URL, blob, Image, or tensor descriptor).
    this.image = init.image ?? null;

    // Camera (all optional; a plan or manual camera may supply only pose+FOV).
    this.camera = init.camera || null; // { intrinsics, extrinsics, fx, fy, cx, cy, width, height, fov, principalPoint, lens, pose }

    // Scale: is depth metric (meters) or relative?
    this.metric = init.metric ?? null; // boolean | null
    this.depthConvention = init.depthConvention || null; // enum from provider schema

    // Spatial channels (all optional, all lazily attached).
    this.depth = init.depth ?? null;
    this.pointMap = init.pointMap ?? null;
    this.normals = init.normals ?? null;
    this.confidence = init.confidence ?? null;
    this.points = init.points ?? null; // { positions, colors?, count }
    this.voxels = init.voxels ?? null;
    this.semanticMasks = init.semanticMasks ?? null;
    this.featureCorrespondences = init.featureCorrespondences ?? null;

    // Structural / constraint payloads (floor plan, manual placement).
    this.constraints = init.constraints ?? null;

    // Provenance (spec §8: distinguish OBSERVED / INFERRED / GENERATED / USER).
    this.provenanceClass = init.provenanceClass || OBS_PROVENANCE.OBSERVED;
    this.provenance = init.provenance || null; // free-form provider metadata

    // Provider metadata (name, modelVersion, device, deviceProfile...).
    this.provider = init.provider || null;

    // Arbitrary source reference (file path, capture id, recipe name).
    this.sourceRef = init.sourceRef ?? null;
  }

  // Structural validation. Returns { ok, errors:[], warnings:[] }.
  // Does NOT throw — providers/recipes decide how to react.
  validate() {
    const errors = [];
    const warnings = [];
    if (this.specVersion !== OBSERVATION_SPEC_VERSION) {
      errors.push(`unsupported specVersion: ${this.specVersion}`);
    }
    if (!Object.values(SOURCE_TYPE).includes(this.sourceType)) {
      errors.push(`unknown sourceType: ${this.sourceType}`);
    }
    if (!Object.values(OBS_PROVENANCE).includes(this.provenanceClass)) {
      errors.push(`unknown provenanceClass: ${this.provenanceClass}`);
    }
    // At least one spatial payload must be present for a useful observation.
    const hasPayload = [
      this.depth, this.pointMap, this.normals, this.points,
      this.voxels, this.constraints, this.image, this.camera,
    ].some((v) => v != null);
    if (!hasPayload) {
      warnings.push('observation carries no spatial payload');
    }
    if (this.provenanceClass === OBS_PROVENANCE.SIMULATED_FALLBACK) {
      warnings.push('SIMULATED_FALLBACK — not real inference; must not be reported as success');
    }
    if (this.metric === true && this.sourceType === SOURCE_TYPE.PHOTO && !this.camera) {
      warnings.push('metric scale claimed for a photo without camera — scale is uncalibrated');
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  // Adapt a renderer-neutral provider result (contracts/shaded-spatial-provider.schema.json v1)
  // into a GeometryObservation. The raw result is preserved under `providerResult`
  // so nothing is lost.
  static fromProviderResult(result, opts = {}) {
    const ch = result.channels || {};
    const cam = result.camera || null;
    const obs = new GeometryObservation({
      id: opts.id,
      sequence: opts.sequence ?? null,
      sourceType: opts.sourceType || SOURCE_TYPE.DEPTH,
      coordinateFrame: 'camera',
      image: opts.image ?? null,
      camera: cam,
      metric: result.metric ?? null,
      depthConvention: result.depthConvention || null,
      depth: ch.depth ? { ref: ch.depth, loader: opts.channelLoader } : null,
      confidence: ch.confidence ? { ref: ch.confidence } : null,
      normals: ch.normals ? { ref: ch.normals } : null,
      points: ch.points ? { ref: ch.points } : null,
      voxels: ch.voxels ? { ref: ch.voxels } : null,
      provenanceClass: result.provenance?.class || OBS_PROVENANCE.INFERRED,
      provenance: result.provenance || null,
      provider: { name: result.provider, modelVersion: result.modelVersion, device: result.device },
      sourceRef: result.provenance?.sourceFile || opts.sourceRef || null,
    });
    obs.providerResult = result;
    return obs;
  }
}
