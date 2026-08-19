// SHADED Spatial Kernel — ProceduralLittleWorld recipe (spec §17).
//
// Generates a deterministic little world from a seed (terrain + simple
// structures) and feeds it into the kernel as GENERATED observations. This is
// the proof that SHADED is not PHOTO-FIRST: the same kernel ingests a photo OR
// a procedural rule set. Camera/scale/representation are unchanged — only the
// input adapter differs.
//
// Determinism: a fixed seed always yields the same world (spec §17, §11).

import { GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE } from '../observation.js';
import { NODE_FAMILY } from '../scene-graph.js';

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

// Integer hash -> [0,1) for value noise.
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

export class ProceduralLittleWorld {
  constructor(opts = {}) {
    this.name = 'procedural-little-world';
    this.seed = opts.seed ?? 1337;
    this.bounds = opts.bounds ?? { min: [0, 0, 0], max: [16, 8, 16] };
    this.density = opts.density ?? 1;          // structures per cell-ish
    this.materials = opts.materials ?? ['grass', 'rock', 'wood'];
    this.params = opts.params ?? { octaves: 3, amplitude: 4, structures: 3 };
  }

  // Generate a deterministic terrain height field + structure placements.
  generate() {
    const rnd = mulberry32(this.seed);
    const { min, max } = this.bounds;
    const sx = max[0] - min[0], sz = max[2] - min[2];
    const points = [];
    const step = 1;
    for (let gx = min[0]; gx <= max[0]; gx += step) {
      for (let gz = min[2]; gz <= max[2]; gz += step) {
        let h = 0, amp = this.params.amplitude, freq = 0.15;
        for (let o = 0; o < this.params.octaves; o++) {
          h += valueNoise(gx * freq, gz * freq, this.seed + o * 101) * amp;
          amp *= 0.5; freq *= 2;
        }
        const hy = Math.round(min[1] + h);
        points.push({ x: gx, y: hy, z: gz });
      }
    }
    const structures = [];
    for (let i = 0; i < (this.params.structures | 0); i++) {
      const bx = Math.floor(min[0] + rnd() * sx);
      const bz = Math.floor(min[2] + rnd() * sz);
      // place a column of blocks upward from the terrain height at (bx,bz)
      const baseY = points.find((p) => p.x === bx && p.z === bz);
      if (baseY) structures.push({ x: bx, y: baseY.y + 1, z: bz, h: 2 + Math.floor(rnd() * 3) });
    }
    return { points, structures, extent: { sx, sz } };
  }

  async run(kernel, input = {}, opts = {}) {
    const seed = opts.seed ?? input.seed ?? this.seed;
    this.seed = seed;
    const { points, structures } = this.generate();

    // 1) Ingest a PROCEDURAL observation (the kernel stays input-agnostic).
    const obs = new GeometryObservation({
      sourceType: SOURCE_TYPE.PROCEDURAL,
      provenanceClass: OBS_PROVENANCE.GENERATED,
      points: { positions: points, count: points.length },
      metric: true,
      sourceRef: `procedural:seed:${seed}`,
    });
    const ingest = kernel.ingest(obs);

    // 2) If a SparseField subsystem exists, persist the generated geometry.
    const field = kernel.getSubsystem('field');
    let voxelCount = 0;
    if (field) {
      voxelCount = field.importPoints(points, { provenance: OBS_PROVENANCE.GENERATED, confidence: 1, sourceObs: obs.id });
      for (const s of structures) {
        for (let yy = 0; yy < s.h; yy++) {
          field.set(s.x, s.y + yy, s.z, { state: 2, provenance: OBS_PROVENANCE.GENERATED, confidence: 1, material: this.materials[2] || 'wood', sourceObs: obs.id });
          voxelCount++;
        }
      }
    }

    // 3) If a SceneGraph subsystem exists, record semantic structure.
    const graph = kernel.getSubsystem('graph');
    let worldNode = null, structNodes = [];
    if (graph) {
      worldNode = graph.rootId ? graph.get(graph.rootId)
        : graph.createNode({ family: NODE_FAMILY.WORLD, id: 'world_procedural_' + seed });
      const terrain = graph.createNode({ family: NODE_FAMILY.REGION, parent: worldNode.id, type: 'terrain', id: 'terrain_' + seed, metadata: { seed } });
      for (const s of structures) {
        const n = graph.createNode({ family: NODE_FAMILY.STRUCTURE, parent: terrain.id, id: 'struct_' + seed + '_' + s.x + '_' + s.z, metadata: s });
        structNodes.push(n.id);
      }
    }

    return {
      ok: ingest.ok,
      observationId: obs.id,
      simulated: false,
      pointCount: points.length,
      voxelCount,
      structureCount: structures.length,
      worldNodeId: worldNode ? worldNode.id : null,
      structNodeIds: structNodes,
      seed,
    };
  }
}
