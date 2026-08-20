// SHADED Spatial Kernel — HybridLittleWorld recipe (spec §17).
//
// Combines OBSERVED seed geometry (photo-derived points) with GENERATED
// procedural fill to produce a complete "little world". This is the proof
// that the kernel is not PHOTO-FIRST: the same kernel ingests real observations
// OR procedurally completes the gaps they leave behind.
//
// Determinism: a fixed seed + observation set always yields the same hybrid
// output (spec §17, §11). The procedural fill is seeded, never random.

import { GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE } from '../observation.js';
import { NODE_FAMILY } from '../scene-graph.js';
import { VOXEL_STATE, VOXEL_PROVENANCE } from '../sparse-field.js';

// Small deterministic PRNG (mulberry32) — no external deps.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export class HybridLittleWorld {
  constructor(opts = {}) {
    this.name = 'hybrid-little-world';
    this.seed = opts.seed ?? 1337;
    this.materials = opts.materials ?? ['grass', 'rock', 'wood', 'dirt'];
    this.fillRadius = opts.fillRadius ?? 3;     // voxels around observed seed
    this.fillDensity = opts.fillDensity ?? 0.6; // probability per candidate voxel
  }

  // Generate procedural fill voxels around observed points.
  // Only fills cells that do NOT already have an observed voxel — this is
  // the "hybrid" part: real data wins, procedural fills the gaps.
  _generateFill(observedPositions, field, seed, worldBounds) {
    const rnd = mulberry32(seed);
    const fill = [];
    const observedSet = new Set();
    for (const p of observedPositions) {
      observedSet.add(`${p.x}:${p.y}:${p.z}`);
    }

    // Iterate a bounded region around observed points.
    const margin = this.fillRadius;
    const visited = new Set();
    for (const p of observedPositions) {
      for (let dx = -margin; dx <= margin; dx++) {
        for (let dy = -margin; dy <= margin; dy++) {
          for (let dz = -margin; dz <= margin; dz++) {
            const x = Math.round(p.x) + dx;
            const y = Math.round(p.y) + dy;
            const z = Math.round(p.z) + dz;
            if (x < worldBounds.min[0] || x > worldBounds.max[0]) continue;
            if (y < worldBounds.min[1] || y > worldBounds.max[1]) continue;
            if (z < worldBounds.min[2] || z > worldBounds.max[2]) continue;
            const k = `${x}:${y}:${z}`;
            if (visited.has(k) || observedSet.has(k)) continue;
            visited.add(k);
            if (rnd() < this.fillDensity) {
              const matIdx = Math.floor(rnd() * this.materials.length);
              fill.push({ x, y, z, material: this.materials[matIdx] });
            }
          }
        }
      }
    }
    return fill;
  }

  async run(kernel, input = {}, opts = {}) {
    const observations = input.observations || [];
    const seed = opts.seed ?? input.seed ?? this.seed;

    // 1) Ingest each observed observation and record IDs.
    const observedIds = [];
    const allObservedPoints = [];
    for (const obs of observations) {
      const res = kernel.ingest(obs);
      if (!res.ok) {
        return { ok: false, error: `observation ${obs.id} failed validation: ${res.errors.join(', ')}` };
      }
      observedIds.push(obs.id);
      if (obs.points && obs.points.positions) {
        allObservedPoints.push(...obs.points.positions);
      }
    }

    if (observedIds.length === 0 || allObservedPoints.length === 0) {
      return { ok: false, error: 'no observed observations with points provided' };
    }

    // 2) Import OBSERVED points into the field (if present).
    const field = kernel.getSubsystem('field');
    if (field) {
      for (const obs of observations) {
        if (obs.points && obs.points.positions) {
          field.importPoints(obs.points.positions, {
            provenance: VOXEL_PROVENANCE.OBSERVED,
            confidence: 1,
            sourceObs: obs.id,
          });
        }
      }
    }

    // 3) Generate procedural fill voxels.
    const worldBounds = { min: [-16, 0, -16], max: [16, 8, 16] };
    const fillVoxels = this._generateFill(allObservedPoints, field, seed, worldBounds);

    // 4) Create a GENERATED observation for the procedural fill and ingest it.
    const hybridObs = new GeometryObservation({
      sourceType: SOURCE_TYPE.HYBRID,
      provenanceClass: OBS_PROVENANCE.GENERATED,
      points: { positions: fillVoxels, count: fillVoxels.length },
      metric: false,
      sourceRef: `hybrid-little-world:seed:${seed}`,
      provider: { name: 'HybridLittleWorld', modelVersion: '1.0' },
    });

    let genVoxelCount = 0;
    if (field) {
      // Import fill voxels as GENERATED.
      for (const v of fillVoxels) {
        field.set(v.x, v.y, v.z, {
          state: VOXEL_STATE.SURFACE,
          provenance: VOXEL_PROVENANCE.GENERATED,
          confidence: 0.7,
          material: v.material,
          sourceObs: hybridObs.id,
        });
        genVoxelCount++;
      }
    }

    const ingest = kernel.ingest(hybridObs);

    // 5) If a SceneGraph exists, record semantic structure.
    let worldNode = null;
    let structNodes = [];
    const graph = kernel.getSubsystem('graph');
    if (graph) {
      worldNode = graph.rootId
        ? graph.get(graph.rootId)
        : graph.createNode({ family: NODE_FAMILY.WORLD, id: 'world_hybrid_' + seed });

      const terrain = graph.createNode({
        family: NODE_FAMILY.REGION,
        type: 'hybrid_terrain',
        parent: worldNode.id,
        id: 'hybrid_terrain_' + seed,
        metadata: { seed, observedCount: observedIds.length },
      });

      // Group observed points into surface nodes.
      const obsGroup = graph.createNode({
        family: NODE_FAMILY.SURFACE,
        type: 'observed_points',
        parent: terrain.id,
        id: 'obs_points_' + seed,
        metadata: { pointCount: allObservedPoints.length, observationIds: observedIds },
      });
      structNodes.push(obsGroup.id);

      const genGroup = graph.createNode({
        family: NODE_FAMILY.SURFACE,
        type: 'generated_fill',
        parent: terrain.id,
        id: 'gen_fill_' + seed,
        metadata: { voxelCount: genVoxelCount, seed },
      });
      structNodes.push(genGroup.id);
    }

    return {
      ok: ingest.ok,
      observedIds,
      hybridObservationId: hybridObs.id,
      observedVoxelCount: allObservedPoints.length,
      generatedVoxelCount: genVoxelCount,
      worldNodeId: worldNode ? worldNode.id : null,
      structNodeIds: structNodes,
      seed,
      simulated: false,
    };
  }
}
