// CPU reference backend, extracted from runtime/world-sandbox-cpu-backend.mjs.
// The solver/particle feedback is runtime capability, kept verbatim from the original SHADED
// world sandbox. `CpuCanvasWorldSandboxBackend` (the old Canvas2D renderer) is intentionally
// dropped here — sandboxRenderer.js is its Babylon-facing replacement, reading the same
// `backend.world` field grid this class produces.

import {
  FIELD,
  STAMP,
  createWorldState,
  mulberry32,
  sampleWorld,
  stepWorldReference,
} from './world-sandbox-reference.mjs';
import {createPlantGraph, createRootTip, stepGrowthTips} from './world-sandbox-growth.mjs';

export const VIEW_MODES = Object.freeze([
  {id: 0, label: '3D BEAUTY', short: '3D'},
  {id: 2, label: 'WASSERFELD', short: 'H₂O'},
  {id: 3, label: 'FEUCHTEFELD', short: 'WET'},
  {id: 4, label: 'BIOMASSEFELD', short: 'BIO'},
  {id: 1, label: 'HÖHENFELD', short: 'H'},
  {id: 5, label: 'GESCHWINDIGKEITSFELD', short: 'VEL'},
  {id: 6, label: 'HITZEFELD', short: 'HEAT'},
  {id: 7, label: 'ATMOSPHÄRE', short: 'ATM'},
]);

export function colorForCell(data, offset, mode = 0) {
  const bedrock = data[offset + FIELD.BEDROCK];
  const sand = data[offset + FIELD.SAND];
  const wet = data[offset + FIELD.WETNESS];
  const water = data[offset + FIELD.WATER];
  const vx = data[offset + FIELD.VELOCITY_X];
  const vz = data[offset + FIELD.VELOCITY_Z];
  const bio = data[offset + FIELD.BIOMASS];
  const heat = data[offset + FIELD.HEAT];
  const vapor = data[offset + FIELD.VAPOR];
  const cloud = data[offset + FIELD.CLOUD];
  const ice = data[offset + FIELD.ICE];
  const snow = data[offset + FIELD.SNOW];
  const fire = data[offset + FIELD.FIRE];
  const smoke = data[offset + FIELD.SMOKE];
  const ash = data[offset + FIELD.ASH];
  const height = bedrock + sand;

  if (mode === 1) {
    const v = Math.round(Math.min(1, height * 2.1) * 255);
    return [v, v, v];
  }
  if (mode === 2) return [10, 40 + Math.min(190, water * 1300), 58 + Math.min(197, water * 1700)];
  if (mode === 3) return [35 - wet * 20, 22 + wet * 115, 12 + wet * 220];
  if (mode === 4) return [8 + bio * 36, 12 + bio * 225, 9 + bio * 52];
  if (mode === 5) return [18 + Math.abs(vx) * 180, 18 + Math.hypot(vx, vz) * 210, 18 + Math.abs(vz) * 180];
  if (mode === 6) return [18 + heat * 237, 15 + heat * 28, 30 - heat * 20];
  if (mode === 7) return [12 + Math.min(230, vapor * 3600), 14 + Math.min(230, cloud * 4200), 30 + Math.min(200, snow * 800)];

  let r = 62 + sand * 850;
  let g = 55 + sand * 480;
  let b = 43 + sand * 170;
  const dark = 1 - wet * 0.52;
  r *= dark; g *= dark; b *= dark;
  r = r * (1 - bio * 0.68) + 43 * bio;
  g = g * (1 - bio * 0.54) + 91 * bio;
  b = b * (1 - bio * 0.66) + 30 * bio;
  r = r * (1 - heat * 0.45) + 245 * heat;
  g = g * (1 - heat * 0.70) + 38 * heat;

  const icePresence = Math.min(1, Math.max(0, (ice - 0.15) / 0.6));
  r = r * (1 - icePresence * 0.62) + 158 * icePresence * 0.62;
  g = g * (1 - icePresence * 0.62) + 189 * icePresence * 0.62;
  b = b * (1 - icePresence * 0.62) + 204 * icePresence * 0.62;

  const snowCoverage = Math.min(1, Math.max(0, (snow - 0.006) / 0.054));
  r = r * (1 - snowCoverage * 0.88) + 230 * snowCoverage * 0.88;
  g = g * (1 - snowCoverage * 0.88) + 237 * snowCoverage * 0.88;
  b = b * (1 - snowCoverage * 0.88) + 242 * snowCoverage * 0.88;

  const ashPresence = Math.min(1, Math.max(0, (ash - 0.02) / 0.33));
  r = r * (1 - ashPresence * 0.55) + 13 * ashPresence * 0.55;
  g = g * (1 - ashPresence * 0.55) + 12 * ashPresence * 0.55;
  b = b * (1 - ashPresence * 0.55) + 11 * ashPresence * 0.55;

  const fireGlow = Math.min(1, Math.max(0, fire));
  r = r * (1 - fireGlow * 0.72) + 255 * fireGlow * 0.72 + 255 * fireGlow * fireGlow * 0.35;
  g = g * (1 - fireGlow * 0.72) + 107 * fireGlow * 0.72 + 140 * fireGlow * fireGlow * 0.35;
  b = b * (1 - fireGlow * 0.72) + 15 * fireGlow * 0.72 + 31 * fireGlow * fireGlow * 0.35;

  const smokeHaze = Math.min(0.85, smoke * 3.5);
  return [
    r * (1 - smokeHaze) + 46 * smokeHaze,
    g * (1 - smokeHaze) + 43 * smokeHaze,
    b * (1 - smokeHaze) + 41 * smokeHaze,
  ];
}

export class CpuWorldSandboxBackend {
  constructor(options = {}) {
    this.mobile = !!options.mobile;
    this.size = options.size || (this.mobile ? 96 : 144);
    this.particleCount = options.particleCount || (this.mobile ? 420 : 900);
    this.onQuery = options.onQuery || (() => {});
    this.particles = [];
    this.deposits = [];
    // Growth-agent plants (world-sandbox-growth.mjs): {graph, tips, random}. Additive overlay
    // only -- reads live WETNESS/COMPACTION from the world to grow, never writes back into it
    // and never touches material classification, same relationship particles already have.
    this.plants = [];
    this.plantSeedCounter = 0;
    this.reset(options.seed, options.worldOptions);
  }

  reset(seed = 0x53484144, options = {}) {
    this.world = createWorldState(this.size, seed ?? 0x53484144, options || {});
    this.particles.length = 0;
    this.deposits.length = 0;
    this.plants.length = 0;
    this.plantSeedCounter = 0;
  }

  // Spawns a single root-tip growth agent at (x, z) (normalized [0,1] world coordinates, same
  // convention this.world's own grid uses). Each plant gets its own deterministic RNG stream
  // (mulberry32, this project's standard) seeded from a per-instance counter, not shared platform
  // randomness -- so replaying the same sequence of spawns/steps reproduces the same growth.
  spawnPlant(x, z) {
    const graph = createPlantGraph();
    const random = mulberry32(0x504c414e + this.plantSeedCounter++);
    const angle = random() * Math.PI * 2;
    const tip = createRootTip(x, z, angle, 1, graph, null);
    this.plants.push({graph, tips: [tip], random});
    return this.plants[this.plants.length - 1];
  }

  spawn(emitter) {
    if (!emitter?.count) return;
    const count = Math.min(90, emitter.count);
    for (let index = 0; index < count; index++) {
      if (this.particles.length >= this.particleCount) this.particles.shift();
      const angle = (index * 2.399963 + this.particles.length * 0.17) % (Math.PI * 2);
      const radius = Math.sqrt((index + 0.5) / count) * 0.025;
      const sample = sampleWorld(this.world, this.size, emitter.x, emitter.z);
      this.particles.push({
        x: Math.max(0.002, Math.min(0.998, emitter.x + Math.cos(angle) * radius)),
        z: Math.max(0.002, Math.min(0.998, emitter.z + Math.sin(angle) * radius)),
        y: sample.waterSurface + 0.04 + (index % 7) * 0.012,
        vx: Math.cos(angle) * 0.07,
        vz: Math.sin(angle) * 0.07,
        vy: 0.22 + (index % 5) * 0.035,
        age: 0,
        life: 0.7 + (index % 11) * 0.07,
        kind: emitter.kind,
      });
    }
  }

  integrateParticles(dt) {
    const alive = [];
    for (const particle of this.particles) {
      particle.vy -= 0.86 * dt;
      particle.vx *= 1 - dt * (particle.kind === 1 ? 1.8 : 0.7);
      particle.vz *= 1 - dt * (particle.kind === 1 ? 1.8 : 0.7);
      particle.x = Math.max(0.001, Math.min(0.999, particle.x + particle.vx * dt));
      particle.z = Math.max(0.001, Math.min(0.999, particle.z + particle.vz * dt));
      particle.y += particle.vy * dt;
      particle.age += dt;
      const local = sampleWorld(this.world, this.size, particle.x, particle.z);
      const surface = particle.kind === 1 ? local.waterSurface : local.ground;
      if (particle.y <= surface || particle.age >= particle.life) {
        const kind = particle.kind === 1 ? STAMP.WATER
          : particle.kind === 2 ? STAMP.SAND
            : particle.kind === 3 ? STAMP.SEED : STAMP.HEAT;
        this.deposits.push({kind, x: particle.x, z: particle.z, radius: 0.009, amount: 0.0028});
      } else {
        alive.push(particle);
      }
    }
    this.particles = alive;
  }

  step({dt, stamps = [], environment, emitter, query}) {
    const allStamps = this.deposits.splice(0).concat(stamps);
    this.world = stepWorldReference(this.world, this.size, dt, {stamps: allStamps, environment});
    this.spawn(emitter);
    this.integrateParticles(dt);
    // Growth agents step AFTER the world itself, against the just-updated WETNESS/COMPACTION --
    // same ordering relationship spawn()/integrateParticles() already have to stepWorldReference.
    for (const plant of this.plants) stepGrowthTips(this.world, this.size, plant.tips, dt, plant.random, plant.graph);
    if (query) {
      this.onQuery({...sampleWorld(this.world, this.size, query.x, query.z), latencyMs: 0});
    }
  }

  sample(x, z) {
    return sampleWorld(this.world, this.size, x, z);
  }

  // Debug/test snapshot: one entry per spawned plant with its own node count and living-tip
  // count, without exposing the raw graph/tips/random internals.
  get plantSnapshot() {
    return this.plants.map(plant => ({
      nodeCount: plant.graph.nodes.length,
      livingTips: plant.tips.filter(tip => tip.alive).length,
    }));
  }

  render() {}

  destroy() {}

  get label() {
    return `CPU REFERENCE · ${this.size}²`;
  }
}
