import {
  CELL_STRIDE,
  DEFAULT_ENVIRONMENT,
  FIELD,
  STAMP,
  createWorldState,
  mulberry32,
  sampleWorld,
  stepWorldReference,
} from '../runtime/world-sandbox-reference.mjs';
import {WebGpuWorldSandbox} from '../runtime/world-sandbox-webgpu.mjs';
import {createPlantGraph, createRootTip, stepGrowthTips} from '../runtime/world-sandbox-growth.mjs';

const panel = document.getElementById('panel-sandbox');
const launch = document.getElementById('btn-world-sandbox');
const railLaunch = document.querySelector('.rail-btn[data-target="panel-sandbox"]');
const viewportStatus = document.getElementById('viewport-status');
const hudKicker = document.querySelector('.viewport-hud.hud-left .hud-kicker');
let canvas = document.getElementById('world-sandbox-canvas');
if (!panel || !launch || !canvas) throw new Error('Integrated SHADED world sandbox host missing');

const mobile = matchMedia('(max-width: 700px)').matches;
const SIM_DT = 1 / 30;
const MAX_STEPS = 3;
const DEFAULT_CAMERA = Object.freeze({
  yaw: -0.68,
  pitch: 0.76,
  zoom: mobile ? 1.42 : 1.34,
  verticalScale: 1.55,
  targetY: 0.29,
});
// Walking is a real perspective first-person mode (see project()'s R.spare0.w branch in
// world-sandbox-webgpu.mjs), not the orbit camera relabeled -- it owns its own look yaw/pitch
// and ground-following eye height so leaving it restores the orbit camera untouched.
const DEFAULT_WALK = Object.freeze({
  active: false,
  x: 0.5,
  z: 0.62,
  yaw: 0,
  pitch: 0.06,
  eyeY: 0.09,
  vx: 0,
  vz: 0,
});
const WALK_SPEED = 0.052; // world units/second crossing the 0..1 desert (~19s edge to edge)
const WALK_EYE_OFFSET = 0.052; // above sampled ground height, in the same verticalScale-adjusted units
// Twin-stick support (left stick = move, right stick = look), standard Gamepad API mapping
// (axes 0/1 = left stick x/y, axes 2/3 = right stick x/y) -- this is what an Xbox controller
// reports through the browser without any extra wiring. GAMEPAD_LOOK_SPEED is rad/second at
// full stick deflection; deadzone matches typical stick centring drift.
const GAMEPAD_DEADZONE = 0.15;
const GAMEPAD_LOOK_SPEED = 2.6;
// One full day/night cycle in real seconds while walking; env.temperature swings from the hot
// desert-day setting down into genuinely sub-freezing (see ICE's ~0.3-0.42 threshold in
// world-sandbox-reference.mjs) territory at night, so frost forms for real, not just cosmetically.
const DAY_LENGTH_SECONDS = 90;
const DAY_TEMPERATURE = 0.82;
const NIGHT_TEMPERATURE = 0.12;
const toolDefinitions = {
  sand: {kind: STAMP.SAND, amount: 0.026, particleKind: 2, particles: mobile ? 18 : 38},
  water: {kind: STAMP.WATER, amount: 0.029, particleKind: 1, particles: mobile ? 22 : 52},
  seed: {kind: STAMP.SEED, amount: 0.055, particleKind: 3, particles: mobile ? 10 : 24},
  dig: {kind: STAMP.DIG, amount: 0.028, particles: 0},
  heat: {kind: STAMP.HEAT, amount: 0.048, particleKind: 4, particles: mobile ? 16 : 34},
  // A magnifying glass, not a torch: STAMP.FOCUS only concentrates real sunlight (scales
  // with env.sun in the solver, near-zero without it) -- no particle effect of its own,
  // a continuous beam/glint reads better than thrown embers for "focusing sunlight".
  focus: {kind: STAMP.FOCUS, amount: 0.05, particles: 0},
  // "Wasserbändigen": aims water by the drag stroke's own direction (see useTool's
  // directional handling below) instead of just dropping it in place -- the same speed-driven
  // erosion the sim already has cuts a channel wherever this is aimed.
  carve: {kind: STAMP.CARVE, amount: 0.03, directional: true, particleKind: 1, particles: mobile ? 20 : 46},
};

const state = {
  active: false,
  initializing: false,
  paused: false,
  tool: 'sand',
  radius: 0.05,
  viewMode: 0,
  speed: 2,
  environment: {...DEFAULT_ENVIRONMENT, growthRate: 0.36},
  stamps: [],
  emitter: null,
  backend: null,
  backendKind: '',
  pointer: {x: 0.5, z: 0.5, radius: 0.05, visible: false, down: false},
  // Tracks the previous stamp position for directional tools (currently only "carve") so a
  // drag stroke's own direction can be read from successive useTool() calls -- reset to null on
  // every pointer-down so a fresh stroke never inherits direction from a previous, disconnected
  // one.
  toolTrail: {x: null, z: null},
  camera: {...DEFAULT_CAMERA},
  walk: {...DEFAULT_WALK},
  dayNight: 0.5,
  savedEnvironment: null,
  body: {active: false, x: 0.5, z: 0.2, y: 0.8, vx: 0, vz: 0, vy: 0, radius: 0.018, impacts: 0},
  query: {ground: 0.16, waterSurface: 0.16, waterDepth: 0, wetness: 0, biomass: 0, heat: 0, sand: 0, latencyMs: 0},
  accumulator: 0,
  lastFrame: performance.now(),
  elapsed: 0,
  frames: 0,
  fpsStarted: performance.now(),
  queryDivider: 0,
  scenario: null,
};

function cameraBasis(camera = state.camera) {
  const cosPitch = Math.cos(camera.pitch);
  const forward = [
    Math.sin(camera.yaw) * cosPitch,
    -Math.sin(camera.pitch),
    Math.cos(camera.yaw) * cosPitch,
  ];
  const rightLength = Math.hypot(forward[2], forward[0]) || 1;
  const right = [forward[2] / rightLength, 0, -forward[0] / rightLength];
  const up = [
    forward[1] * right[2],
    forward[2] * right[0] - forward[0] * right[2],
    -forward[1] * right[0],
  ];
  return {forward, right, up};
}

function projectWorld(world, width, height, camera = state.camera) {
  const {forward, right, up} = cameraBasis(camera);
  const delta = [world[0], world[1] - camera.targetY, world[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const aspect = width / Math.max(1, height);
  const ndcX = dot(delta, right) / Math.max(0.2, camera.zoom * aspect);
  const ndcY = dot(delta, up) / Math.max(0.55, camera.zoom);
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth: dot(delta, forward),
  };
}

// Real perspective for walk mode -- mirrors project()'s R.spare0.w branch in
// world-sandbox-webgpu.mjs (same near/fovTan constants), unlike the orbit projection above,
// which is deliberately non-perspective (isometric-style, no size falloff with distance).
function walkBasis(walk) {
  const cosPitch = Math.cos(walk.pitch);
  const forward = [Math.sin(walk.yaw) * cosPitch, -Math.sin(walk.pitch), Math.cos(walk.yaw) * cosPitch];
  const rightLength = Math.hypot(forward[2], forward[0]) || 1;
  const right = [forward[2] / rightLength, 0, -forward[0] / rightLength];
  const up = [forward[1] * right[2], forward[2] * right[0] - forward[0] * right[2], -forward[1] * right[0]];
  return {forward, right, up};
}

const WALK_NEAR = 0.006;
const WALK_FOV_TAN = 0.62;

function projectWalk(world, width, height, walk) {
  const {forward, right, up} = walkBasis(walk);
  const eye = [walk.x * 2 - 1, walk.eyeY, walk.z * 2 - 1];
  const delta = [world[0] - eye[0], world[1] - eye[1], world[2] - eye[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const aspect = width / Math.max(1, height);
  const viewX = dot(delta, right);
  const viewY = dot(delta, up);
  const clipZ = Math.max(dot(delta, forward), WALK_NEAR);
  const ndcX = viewX / (WALK_FOV_TAN * aspect * clipZ);
  const ndcY = viewY / (WALK_FOV_TAN * clipZ);
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth: clipZ,
  };
}

let skyStars = null;
function ensureSkyStars() {
  if (skyStars) return skyStars;
  const random = mulberry32(0xA57);
  skyStars = [];
  for (let i = 0; i < 140; i++) skyStars.push({ux: random(), uy: random() * 0.62, seed: random()});
  return skyStars;
}

// Mirrors sunElevationOf/skyColor in world-sandbox-webgpu.mjs, translated to Canvas2D
// primitives -- an approximate gradient + disc + stars, not a physically simulated
// atmosphere, matching the fidelity level of this whole fallback renderer.
function drawSky(context, width, height, dayNight, temperature, time) {
  const sunElevation = Math.sin((dayNight - 0.25) * Math.PI * 2);
  const dayFactor = Math.max(0, Math.min(1, (sunElevation + 0.18) / 0.26));
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const zenith = mix3([3, 4, 7], [41, 107, 189], dayFactor);
  const horizon = mix3([14, 13, 23], [219, 184, 133], dayFactor); // day: warm desert dust haze; night: cold, not warm
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `rgb(${zenith.map(v => Math.round(v)).join(',')})`);
  gradient.addColorStop(1, `rgb(${horizon.map(v => Math.round(v)).join(',')})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  if (dayFactor < 0.6) {
    const alpha = (1 - dayFactor) * 0.9;
    context.fillStyle = `rgba(230,235,255,${alpha})`;
    for (const star of ensureSkyStars()) {
      const twinkle = 0.5 + 0.5 * Math.sin(time * 3 + star.seed * 60);
      if (twinkle < 0.35) continue;
      context.fillRect(star.ux * width, star.uy * height, 1.4, 1.4);
    }
  }

  const sunScreenX = width * (0.5 + Math.sin(dayNight * Math.PI * 2) * 0.42);
  const sunScreenY = height * (0.92 - Math.max(0, sunElevation) * 0.75);
  if (dayFactor > 0.02) {
    context.fillStyle = 'rgba(255,235,200,0.95)';
    context.beginPath();
    context.arc(sunScreenX, sunScreenY, Math.max(6, width * 0.018), 0, Math.PI * 2);
    context.fill();
  }
  const moonScreenX = width * (0.5 - Math.sin(dayNight * Math.PI * 2) * 0.42);
  const moonScreenY = height * (0.92 - Math.max(0, -sunElevation) * 0.75);
  if (dayFactor < 0.85) {
    context.fillStyle = `rgba(205,210,222,${(1 - dayFactor) * 0.85})`;
    context.beginPath();
    context.arc(moonScreenX, moonScreenY, Math.max(5, width * 0.013), 0, Math.PI * 2);
    context.fill();
  }

  // Heat shimmer hint: a soft wavering line near the horizon during hot midday -- this
  // fallback path has no offscreen texture to refract, same honest limitation as fsSky.
  const hotFactor = Math.max(0, Math.min(1, (temperature - 0.55) / 0.4)) * dayFactor;
  if (hotFactor > 0.02) {
    context.save();
    context.globalAlpha = hotFactor * 0.35;
    context.strokeStyle = 'rgba(255,244,222,0.6)';
    context.lineWidth = Math.max(1, height * 0.006);
    context.beginPath();
    const baseY = height * 0.82;
    for (let x = 0; x <= width; x += 8) {
      const y = baseY + Math.sin(x * 0.05 + time * 5) * height * 0.01;
      if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    context.restore();
  }
}

function screenToWorld(clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  const aspect = bounds.width / Math.max(1, bounds.height);
  const ndcX = ((clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
  const ndcY = 1 - ((clientY - bounds.top) / Math.max(1, bounds.height)) * 2;
  const {forward, right, up} = cameraBasis();
  const viewX = ndcX * state.camera.zoom * aspect;
  const viewY = ndcY * state.camera.zoom;
  const line = [
    right[0] * viewX + up[0] * viewY,
    state.camera.targetY + right[1] * viewX + up[1] * viewY,
    right[2] * viewX + up[2] * viewY,
  ];
  const planeY = state.camera.targetY;
  const distance = Math.abs(forward[1]) > 1e-5 ? (planeY - line[1]) / forward[1] : 0;
  const worldX = line[0] + forward[0] * distance;
  const worldZ = line[2] + forward[2] * distance;
  return {
    x: Math.max(0, Math.min(1, worldX * 0.5 + 0.5)),
    z: Math.max(0, Math.min(1, worldZ * 0.5 + 0.5)),
  };
}

function resetCamera() {
  Object.assign(state.camera, DEFAULT_CAMERA);
}

const VIEW_MODES = [
  {id: 0, label: '3D BEAUTY', short: '3D'},
  {id: 2, label: 'WASSERFELD', short: 'H₂O'},
  {id: 3, label: 'FEUCHTEFELD', short: 'WET'},
  {id: 4, label: 'BIOMASSEFELD', short: 'BIO'},
  {id: 1, label: 'HÖHENFELD', short: 'H'},
];

const SPECIAL_TOOLS = new Set(['stone', 'root']); // handled directly in useTool(), not through toolDefinitions/queueStamp

function setTool(tool) {
  if (!SPECIAL_TOOLS.has(tool) && !toolDefinitions[tool]) return;
  state.tool = tool;
  document.querySelectorAll('[data-world-tool]').forEach(item => item.classList.toggle('active', item.dataset.worldTool === tool));
}

function setViewMode(mode) {
  state.viewMode = Number(mode) || 0;
  const definition = VIEW_MODES.find(item => item.id === state.viewMode)
    || {label: 'DATENFELD', short: 'DATA'};
  document.querySelectorAll('[data-world-view-label]').forEach(item => { item.textContent = definition.label; });
  document.querySelectorAll('[data-world-view-cycle]').forEach(item => { item.textContent = definition.short; });
  const select = panel?.querySelector('#world-view');
  if (select) select.value = String(state.viewMode);
}

function setBrushRadius(value) {
  state.radius = Number(value) / 100;
  state.pointer.radius = state.radius;
  document.querySelectorAll('#world-brush,[data-world-brush]').forEach(input => { input.value = String(value); });
  const output = panel?.querySelector('#world-brush')?.parentElement?.querySelector('output');
  if (output) output.textContent = state.radius.toFixed(2);
}

function setPaused(paused) {
  state.paused = !!paused;
  const panelButton = panel?.querySelector('#world-pause');
  if (panelButton) {
    panelButton.textContent = state.paused ? 'PLAY' : 'PAUSE';
    panelButton.classList.toggle('active', state.paused);
  }
  document.querySelectorAll('[data-world-action="pause"]').forEach(button => {
    button.textContent = state.paused ? '▶' : 'Ⅱ';
    button.classList.toggle('active', state.paused);
    button.title = state.paused ? 'Simulation fortsetzen' : 'Simulation pausieren';
  });
}

function colorForCell(data, offset, mode) {
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
  if (mode === 6) return [12 + heat * 243, 15 + heat * 28, 30 - heat * 20];
  if (mode === 7) return [12 + Math.min(230, vapor * 3600), 14 + Math.min(230, cloud * 4200), 30 + Math.min(200, snow * 800)];
  let r = 62 + sand * 850;
  let g = 55 + sand * 480;
  let b = 43 + sand * 170;
  const dark = 1 - wet * 0.52;
  r *= dark;
  g *= dark;
  b *= dark;
  r = r * (1 - bio * 0.68) + 43 * bio;
  g = g * (1 - bio * 0.54) + 91 * bio;
  b = b * (1 - bio * 0.66) + 30 * bio;
  r = r * (1 - heat * 0.45) + 245 * heat;
  g = g * (1 - heat * 0.7) + 38 * heat;
  // Water cycle made visible on the beauty view too, same rule as the WGSL fsTerrain: ice
  // pales the surface blue-white, snow (a separate reservoir on top) buries it in white.
  const icePresence = Math.min(1, Math.max(0, (ice - 0.15) / 0.6));
  r = r * (1 - icePresence * 0.62) + 158 * icePresence * 0.62;
  g = g * (1 - icePresence * 0.62) + 189 * icePresence * 0.62;
  b = b * (1 - icePresence * 0.62) + 204 * icePresence * 0.62;
  const snowCoverage = Math.min(1, Math.max(0, (snow - 0.006) / 0.054));
  r = r * (1 - snowCoverage * 0.88) + 230 * snowCoverage * 0.88;
  g = g * (1 - snowCoverage * 0.88) + 237 * snowCoverage * 0.88;
  b = b * (1 - snowCoverage * 0.88) + 242 * snowCoverage * 0.88;
  // Combustion made visible on the beauty view too, same rule as the WGSL fsTerrain: ash
  // darkens the burned ground toward soot, fire is its own emissive glow (not a shadow-lit
  // patch), smoke thickens the air above it into a grey haze.
  const ashPresence = Math.min(1, Math.max(0, (ash - 0.02) / 0.33));
  r = r * (1 - ashPresence * 0.55) + 13 * ashPresence * 0.55;
  g = g * (1 - ashPresence * 0.55) + 12 * ashPresence * 0.55;
  b = b * (1 - ashPresence * 0.55) + 11 * ashPresence * 0.55;
  const fireGlow = Math.min(1, Math.max(0, fire));
  r = r * (1 - fireGlow * 0.72) + 255 * fireGlow * 0.72 + 255 * fireGlow * fireGlow * 0.35;
  g = g * (1 - fireGlow * 0.72) + 107 * fireGlow * 0.72 + 140 * fireGlow * fireGlow * 0.35;
  b = b * (1 - fireGlow * 0.72) + 15 * fireGlow * 0.72 + 31 * fireGlow * fireGlow * 0.35;
  const smokeHaze = Math.min(0.85, smoke * 3.5);
  r = r * (1 - smokeHaze) + 46 * smokeHaze;
  g = g * (1 - smokeHaze) + 43 * smokeHaze;
  b = b * (1 - smokeHaze) + 41 * smokeHaze;
  return [r, g, b];
}

class CpuWorldSandbox {
  constructor(target, options = {}) {
    this.canvas = target;
    this.context = target.getContext('2d', {alpha: false});
    if (!this.context) throw new Error('Canvas 2D unavailable');
    // Higher than before, but far more conservative than the WebGPU backend's 256/512:
    // this path steps AND rasterizes every quad with Canvas2D fillPath calls on the main
    // thread, so its bottleneck is draw-call count, not compute -- see CpuWorldSandbox.render.
    this.size = mobile ? 96 : 144;
    this.particleCount = mobile ? 420 : 900;
    this.onQuery = options.onQuery || (() => {});
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.size;
    this.offscreen.height = this.size;
    this.offscreenContext = this.offscreen.getContext('2d', {alpha: false});
    this.image = this.offscreenContext.createImageData(this.size, this.size);
    this.particles = [];
    this.deposits = [];
    // Growth-agent plants (world-sandbox-growth.mjs): {graph, tips, random}. Additive overlay
    // only -- see useTool()'s own comment on why this never touches classGrid/material truth.
    this.plants = [];
    this.plantSeedCounter = 0;
    this.reset();
  }

  reset(seed = 0x53484144, options = {}) {
    this.world = createWorldState(this.size, seed, options);
    this.particles.length = 0;
    this.deposits.length = 0;
    this.plants.length = 0;
    this.plantSeedCounter = 0;
    this.orderKey = '';
  }

  // Spawns a single root-tip growth agent at (x, z) (normalized [0,1] world coordinates, same
  // convention this.world's own grid uses). Each plant gets its own deterministic RNG stream
  // (mulberry32, this project's standard) seeded from a per-instance counter, not shared platform
  // randomness -- so replaying the same sequence of spawns/steps reproduces the same growth,
  // matching world-sandbox-growth.mjs's own "CPU reference is the deterministic golden oracle"
  // discipline.
  spawnPlant(x, z) {
    const graph = createPlantGraph();
    const random = mulberry32(0x504c414e + this.plantSeedCounter++);
    const angle = random() * Math.PI * 2; // same deterministic stream the tip's own growth will use, not Math.random()
    const tip = createRootTip(x, z, angle, 1, graph, null);
    this.plants.push({graph, tips: [tip], random});
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
    // same ordering relationship spawn()/integrateParticles() already have to stepWorldReference
    // (react to this tick's world, not last tick's).
    for (const plant of this.plants) stepGrowthTips(this.world, this.size, plant.tips, dt, plant.random, plant.graph);
    if (query) {
      this.onQuery({...sampleWorld(this.world, this.size, query.x, query.z), latencyMs: 0});
    }
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2) * (mobile ? 0.92 : 1);
    const width = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render({viewMode = 0, body, cursor, camera = state.camera, walk = null, dayNight = 0.5, temperature = 0.5, time = 0}) {
    this.resize();
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const size = this.size;
    const verticalScale = camera.verticalScale;
    const useWalk = !!walk?.active;
    const offsetAt = (x, z) => (Math.max(0, Math.min(size - 1, z)) * size
      + Math.max(0, Math.min(size - 1, x))) * CELL_STRIDE;
    const heightAt = (x, z, water = false) => {
      const offset = offsetAt(x, z);
      return this.world[offset + FIELD.BEDROCK] + this.world[offset + FIELD.SAND]
        + (water ? this.world[offset + FIELD.WATER] : 0);
    };
    const projected = (x, z, water = false) => {
      const world = [x / (size - 1) * 2 - 1, heightAt(x, z, water) * verticalScale, z / (size - 1) * 2 - 1];
      return useWalk ? projectWalk(world, width, height, walk) : projectWorld(world, width, height, camera);
    };
    const walkEye = useWalk ? [walk.x * 2 - 1, walk.eyeY, walk.z * 2 - 1] : null;
    const walkForward = useWalk ? walkBasis(walk).forward : null;

    drawSky(context, width, height, dayNight, temperature, time);

    const orderKey = useWalk
      ? `${size}:walk:${walk.x.toFixed(3)}:${walk.z.toFixed(3)}:${walk.yaw.toFixed(3)}:${walk.pitch.toFixed(3)}`
      : `${size}:${camera.yaw.toFixed(3)}:${camera.pitch.toFixed(3)}`;
    if (this.orderKey !== orderKey) {
      const {forward} = cameraBasis(camera);
      this.drawOrder = [];
      for (let z = 0; z < size - 1; z++) {
        for (let x = 0; x < size - 1; x++) {
          const world = [x / (size - 1) * 2 - 1, heightAt(x, z) * verticalScale, z / (size - 1) * 2 - 1];
          if (useWalk) {
            // Frustum cull: a quad whose center sits behind the eye would otherwise get
            // clamped to the near plane in projectWalk without adjusting x/y, smearing it
            // across the front of the screen instead of correctly vanishing.
            const toCenter = [world[0] - walkEye[0], world[1] - walkEye[1], world[2] - walkEye[2]];
            const viewZ = toCenter[0] * walkForward[0] + toCenter[1] * walkForward[1] + toCenter[2] * walkForward[2];
            if (viewZ < WALK_NEAR * 4) continue;
          }
          const depth = useWalk
            ? Math.hypot(world[0] - walkEye[0], world[1] - walkEye[1], world[2] - walkEye[2])
            : world[0] * forward[0] + world[1] * forward[1] + world[2] * forward[2];
          this.drawOrder.push({x, z, depth});
        }
      }
      this.drawOrder.sort((a, b) => b.depth - a.depth);
      this.orderKey = orderKey;
    }

    context.save();
    context.lineJoin = 'round';
    for (const {x, z} of this.drawOrder) {
      const p00 = projected(x, z);
      const p10 = projected(x + 1, z);
      const p11 = projected(x + 1, z + 1);
      const p01 = projected(x, z + 1);
      const offset = offsetAt(x, z);
      const rgb = colorForCell(this.world, offset, viewMode);
      const dx = (heightAt(x + 1, z) - heightAt(x - 1, z)) * verticalScale;
      const dz = (heightAt(x, z + 1) - heightAt(x, z - 1)) * verticalScale;
      const normalLength = Math.hypot(dx, 2 / size, dz) || 1;
      const light = Math.max(0.28, (-dx * -0.42 + (2 / size) * 0.82 + -dz * -0.31) / normalLength);
      const grain = (((x * 73856093) ^ (z * 19349663)) & 255) / 255 - 0.5;
      const shade = 0.54 + light * 0.62 + grain * 0.055;
      context.fillStyle = `rgb(${Math.max(0, Math.min(255, rgb[0] * shade))} ${Math.max(0, Math.min(255, rgb[1] * shade))} ${Math.max(0, Math.min(255, rgb[2] * shade))})`;
      context.beginPath();
      context.moveTo(p00.x, p00.y);
      context.lineTo(p10.x, p10.y);
      context.lineTo(p11.x, p11.y);
      context.lineTo(p01.x, p01.y);
      context.closePath();
      context.fill();

      const water = this.world[offset + FIELD.WATER];
      if (viewMode === 0 && water > 0.00035) {
        const w00 = projected(x, z, true);
        const w10 = projected(x + 1, z, true);
        const w11 = projected(x + 1, z + 1, true);
        const w01 = projected(x, z + 1, true);
        const depth = Math.min(1, water * 12);
        // Same accelerate-then-damp velocity that now actually transports water (edgeFlow
        // in world-sandbox-reference.mjs) also has to show up here -- this 2D canvas path
        // is the real fallback most browsers/headless runs actually use, not a decoration
        // layered only on top of the WebGPU renderer.
        // A frozen cell (edgeFlow already stopped transporting it) should look still, not
        // just physically stop -- fade its own flow-driven foam out by the ice fraction.
        const ice = this.world[offset + FIELD.ICE];
        const vx = this.world[offset + FIELD.VELOCITY_X];
        const vz = this.world[offset + FIELD.VELOCITY_Z];
        const speed = Math.min(1, Math.hypot(vx, vz) * 6) * (1 - ice);
        const foam = Math.max(0, speed - 0.35) / 0.65;
        let r = 42 - depth * 18 + foam * 150;
        let g = 120 - depth * 31 + foam * 120;
        let b = 137 - depth * 24 + foam * 90;
        r = r * (1 - ice * 0.72) + 204 * ice * 0.72;
        g = g * (1 - ice * 0.72) + 222 * ice * 0.72;
        b = b * (1 - ice * 0.72) + 230 * ice * 0.72;
        context.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${0.48 + depth * 0.24})`;
        context.beginPath();
        context.moveTo(w00.x, w00.y);
        context.lineTo(w10.x, w10.y);
        context.lineTo(w11.x, w11.y);
        context.lineTo(w01.x, w01.y);
        context.closePath();
        context.fill();
      }

      const biomass = this.world[offset + FIELD.BIOMASS];
      const snowCover = this.world[offset + FIELD.SNOW];
      if (viewMode === 0 && water < 0.006 && snowCover < 0.02 && biomass > 0.012 && grain + 0.5 < Math.min(0.9, biomass * 4.2)) {
        // Real per-cell plant succession (mirrors FIELD.PLANT_TYPE in
        // world-sandbox-reference.mjs and vsGrass/fsGrass in world-sandbox-webgpu.mjs exactly
        // -- three renderers, one truth, same as everywhere else in this codebase). This is
        // the path most browsers (and every headless run in this session) actually fall back
        // to, so plant type needs to read here too, not only in the WebGPU renderer.
        const plantType = this.world[offset + FIELD.PLANT_TYPE];
        const isFlower = plantType > 0.5 && plantType < 1.5;
        const isShrub = plantType > 1.5 && plantType < 2.5;
        const isTree = plantType > 2.5;
        let stalkHeight = 0.025 + Math.sqrt(biomass) * 0.095;
        if (isFlower) stalkHeight *= 0.75;
        else if (isShrub) stalkHeight *= 1.6;
        else if (isTree) stalkHeight *= 7;
        const vx = this.world[offset + FIELD.VELOCITY_X];
        const vz = this.world[offset + FIELD.VELOCITY_Z];
        const lean = Math.min(0.6, Math.hypot(vx, vz) * 2.2);
        const groundHeight = heightAt(x, z) * verticalScale;
        const base = projectWorld([x / (size - 1) * 2 - 1, groundHeight, z / (size - 1) * 2 - 1], width, height, camera);
        const topWorld = [
          x / (size - 1) * 2 - 1 + vx * lean,
          groundHeight + stalkHeight * (1 - lean * 0.3),
          z / (size - 1) * 2 - 1 + vz * lean,
        ];
        const top = projectWorld(topWorld, width, height, camera);
        const hot = this.world[offset + FIELD.HEAT] > 0.25;
        context.strokeStyle = hot ? 'rgba(119,88,38,.82)'
          : isTree ? 'rgba(77,54,26,.9)' // trunk
            : isShrub ? 'rgba(46,84,32,.92)' // denser, darker canopy green
              : 'rgba(68,111,42,.88)'; // grass/flower stem
        context.lineWidth = Math.max(1, width / 900) * (isShrub ? 2.2 : isTree ? 3 : 1);
        context.beginPath();
        context.moveTo(base.x, base.y);
        context.lineTo(top.x, top.y);
        context.stroke();
        if (isFlower && !hot) {
          // A bright bloom dot at the tip -- the same three real bloom hues fsGrass uses, so
          // the two renderers agree on what a flower actually looks like, not just that
          // biomass exists there.
          const hue = Math.abs(Math.sin((x * 12.9898 + z * 78.233) * 43758.5453) % 1);
          const petal = hue < 0.33 ? '212,148,168' : hue < 0.66 ? '242,217,89' : '230,230,219';
          context.fillStyle = `rgba(${petal},.92)`;
          context.beginPath();
          context.arc(top.x, top.y, Math.max(1.4, width / 480), 0, Math.PI * 2);
          context.fill();
        } else if (isTree) {
          // A filled canopy blob above the trunk -- distinct from the single thin stalk every
          // other stage draws, so a tree actually reads as a tree in silhouette, not a tall
          // blade of grass.
          context.fillStyle = 'rgba(38,84,26,.88)';
          context.beginPath();
          context.arc(top.x, top.y, Math.max(3, width / 130), 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    // Growth-agent plants (world-sandbox-growth.mjs): each graph edge drawn as a line segment
    // running along the terrain surface (roots don't rise above ground) -- same unconditional
    // projectWorld() convention particles/body/cursor already use below, not a new one. No wind
    // yet (world-sandbox-wind.mjs exists and is tested/proven separately, tools/verify-world-
    // sandbox-wind-render.mjs) and no dedicated WebGPU render path (CPU backend only for now) --
    // both real, named follow-ups, not silently implied as finished here.
    context.lineCap = 'round';
    for (const plant of this.plants) {
      for (const node of plant.graph.nodes) {
        if (node.parentId == null) continue;
        const parent = plant.graph.nodes[node.parentId];
        const gx0 = Math.max(0, Math.min(size - 1, Math.round(parent.x * (size - 1))));
        const gz0 = Math.max(0, Math.min(size - 1, Math.round(parent.z * (size - 1))));
        const gx1 = Math.max(0, Math.min(size - 1, Math.round(node.x * (size - 1))));
        const gz1 = Math.max(0, Math.min(size - 1, Math.round(node.z * (size - 1))));
        const groundY0 = heightAt(gx0, gz0) * verticalScale;
        const groundY1 = heightAt(gx1, gz1) * verticalScale;
        const p0 = projectWorld([parent.x * 2 - 1, groundY0 + 0.0015, parent.z * 2 - 1], width, height, camera);
        const p1 = projectWorld([node.x * 2 - 1, groundY1 + 0.0015, node.z * 2 - 1], width, height, camera);
        context.strokeStyle = 'rgba(107,71,38,.88)'; // root brown
        context.lineWidth = Math.max(1, node.radius * width * 3.2);
        context.beginPath();
        context.moveTo(p0.x, p0.y);
        context.lineTo(p1.x, p1.y);
        context.stroke();
      }
    }

    for (const particle of this.particles) {
      const point = projectWorld([particle.x * 2 - 1, particle.y * verticalScale, particle.z * 2 - 1], width, height, camera);
      context.fillStyle = particle.kind === 1 ? '#78b8c7'
        : particle.kind === 2 ? '#d1a064'
          : particle.kind === 3 ? '#88a95b' : '#db5c32';
      context.globalAlpha = 0.86;
      context.beginPath();
      context.arc(point.x, point.y, Math.max(1.5, width / 420), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    if (body?.active) {
      const point = projectWorld([body.x * 2 - 1, body.y * verticalScale, body.z * 2 - 1], width, height, camera);
      const radius = Math.max(4, width / 115);
      const stone = context.createRadialGradient(point.x - radius * 0.35, point.y - radius * 0.45, 1, point.x, point.y, radius);
      stone.addColorStop(0, '#9a9d96');
      stone.addColorStop(0.55, '#555b58');
      stone.addColorStop(1, '#202523');
      context.fillStyle = stone;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }

    if (cursor?.visible) {
      context.strokeStyle = 'rgba(211,230,219,.92)';
      context.lineWidth = Math.max(1.25, width / 650);
      context.beginPath();
      for (let index = 0; index <= 40; index++) {
        const angle = index / 40 * Math.PI * 2;
        const x = Math.max(0, Math.min(1, cursor.x + Math.cos(angle) * cursor.radius));
        const z = Math.max(0, Math.min(1, cursor.z + Math.sin(angle) * cursor.radius));
        const sample = sampleWorld(this.world, size, x, z);
        const point = projectWorld([x * 2 - 1, sample.ground * verticalScale + 0.004, z * 2 - 1], width, height, camera);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.stroke();
    }
    context.restore();
  }

  get label() {
    return 'CPU REFERENCE + SPATIAL · ' + this.size + '² · WEBGPU UNAVAILABLE';
  }
}

function replaceCanvasForCpu() {
  const replacement = canvas.cloneNode(false);
  canvas.replaceWith(replacement);
  canvas = replacement;
  bindCanvas();
}

function updateMetricReadout(query) {
  state.query = {...state.query, ...query};
  for (const output of panel.querySelectorAll('[data-world-metric]')) {
    const key = output.dataset.worldMetric;
    const value = state.query[key];
    output.textContent = key === 'latencyMs'
      ? (Number.isFinite(value) ? value.toFixed(1) + ' ms' : '–')
      : (Number.isFinite(value) ? value.toFixed(3) : '–');
  }
}

function reportError(error) {
  console.warn('[SHADED World Sandbox]', error);
  panel.querySelector('#world-note').textContent = 'GPU-Pfad meldet einen Fehler: ' + error.message;
}

function activateCpuFallback(error) {
  reportError(error);
  // The real cause (error.message) previously only reached #world-note, inside the collapsed
  // inspector panel -- a device whose WebGPU genuinely works could still silently fall back to
  // the CPU solver with no visible reason on the always-on canvas HUD (confirmed against a real
  // WebGPU capability report: adapter/device/context all succeed, full feature set, yet the app
  // still fell back -- so whatever's actually failing is somewhere in this app's own shader/
  // pipeline/buffer setup, not a genuine "no WebGPU" case, and that specific reason needs to be
  // visible without opening the inspector to ever get diagnosed). Mirrors the same message onto
  // the HUD overlay that's visible immediately on entering World Sandbox mode.
  const hudError = document.getElementById('world-hud-error');
  if (hudError) {
    hudError.textContent = 'WEBGPU-FEHLER (Fallback auf CPU-Solver): ' + error.message;
    hudError.hidden = false;
  }
  if (state.backendKind === 'cpu') return;
  const previousBackend = state.backend;
  state.backendKind = 'cpu';
  previousBackend?.destroy?.();
  replaceCanvasForCpu();
  state.backend = new CpuWorldSandbox(canvas, {onQuery: updateMetricReadout});
  panel.querySelector('#world-state').textContent = state.backend.label;
  panel.querySelector('#world-note').textContent = 'WebGPU wurde sauber auf den echten CPU-Referenzsolver umgeschaltet. Ursache: ' + error.message;
}

async function ensureBackend() {
  if (state.backend || state.initializing) return state.backend;
  state.initializing = true;
  const status = panel.querySelector('#world-state');
  status.textContent = 'WEBGPU START …';
  try {
    state.backend = await WebGpuWorldSandbox.create(canvas, {
      mobile,
      onQuery: updateMetricReadout,
      onError: activateCpuFallback,
    });
    state.backendKind = 'webgpu';
  } catch (error) {
    activateCpuFallback(error);
  } finally {
    state.initializing = false;
  }
  status.textContent = state.backend.label;
  return state.backend;
}

function enter() {
  document.getElementById('spatial-close')?.click();
  document.body.classList.add('world-sandbox-mode');
  launch.classList.add('active');
  railLaunch?.classList.add('active');
  if (hudKicker) hudKicker.textContent = 'WORLD SANDBOX';
  if (viewportStatus) viewportStatus.textContent = 'Gekoppelte Sand-, Wasser-, Bio- und Partikelwelt';
  state.active = true;
  state.accumulator = 0;
  state.lastFrame = performance.now();
  ensureBackend();
}

function exit({preserveInspector = false} = {}) {
  document.body.classList.remove('world-sandbox-mode');
  launch.classList.remove('active');
  railLaunch?.classList.remove('active');
  if (hudKicker) hudKicker.textContent = 'LIVE VIEW';
  if (viewportStatus) {
    const webglUnavailable = document.documentElement.classList.contains('webgl2-unavailable');
    const ready = !!window.SHADED?.isReady?.();
    viewportStatus.textContent = webglUnavailable ? 'Szenenrenderer braucht WebGL 2 · Sandbox bleibt verfügbar' : ready ? 'Szene bereit · direkt im echten Renderer' : 'Engine live · Bild laden oder Demo starten';
  }
  if (!preserveInspector) {
    document.body.classList.remove('inspector-open');
    document.body.classList.add('inspector-collapsed');
  }
  state.active = false;
  state.pointer.down = false;
  activePointers.clear();
  paintPointerId = null;
  orbitGesture = null;
  walkLookGesture = null;
  walkKeysHeld.clear();
  if (state.walk.active) exitWalk();
}

function queueStamp(kind, x, z, amount, radius = state.radius, directionX = 0, directionZ = 0) {
  if (state.stamps.length >= 32) return;
  state.stamps.push({kind, x, z, radius, amount, directionX, directionZ});
}

function queueEmitter(kind, x, z, count, strength = 1) {
  if (!count) return;
  state.emitter = {kind, x, z, count, strength};
}

function launchStone(x = state.pointer.x, z = state.pointer.z) {
  state.body = {
    active: true,
    x: Math.max(0.05, Math.min(0.95, x - 0.12)),
    z: Math.max(0.05, Math.min(0.95, z - 0.09)),
    y: 0.82,
    vx: 0.15,
    vz: 0.11,
    vy: -0.05,
    radius: 0.018,
    impacts: 0,
  };
}

function useTool(x, z) {
  if (state.tool === 'stone') {
    launchStone(x, z);
    return;
  }
  if (state.tool === 'root') {
    // Root-tip growth (world-sandbox-growth.mjs) is an additive overlay, the same relationship
    // actors/particles already have to classGrid/getMaterialTypeAt: it reads live WETNESS/
    // COMPACTION from the running world to decide where to grow, but never writes back into it
    // and never touches material classification. CPU-backend only for now (this.plants lives on
    // CpuWorldSandbox) -- optional chaining means the WebGPU backend simply doesn't spawn
    // anything yet rather than throwing; a real WebGPU-side growth/render path is a named
    // follow-up, not silently faked here.
    state.backend?.spawnPlant?.(x, z);
    return;
  }
  const tool = toolDefinitions[state.tool];
  if (!tool) return;
  let directionX = 0;
  let directionZ = 0;
  if (tool.directional && state.toolTrail.x !== null) {
    const dx = x - state.toolTrail.x;
    const dz = z - state.toolTrail.z;
    const length = Math.hypot(dx, dz);
    if (length > 1e-4) {
      directionX = dx / length;
      directionZ = dz / length;
    }
  }
  state.toolTrail.x = x;
  state.toolTrail.z = z;
  queueStamp(tool.kind, x, z, tool.amount, state.radius, directionX, directionZ);
  queueEmitter(tool.particleKind, x, z, tool.particles, state.radius / 0.05);
}

const walkKeysHeld = new Set();
const WALK_MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// The Gamepad API is poll-only for axis/button state (only connect/disconnect are events), so
// this is called fresh every updateWalk() tick rather than cached -- navigator.getGamepads()
// itself is cheap (no browser round-trip, just reads already-polled state).
function activeGamepad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

function applyDeadzone(value, deadzone) {
  const magnitude = Math.abs(value);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

function enterWalk() {
  if (state.walk.active) return;
  state.savedEnvironment = {...state.environment};
  state.walk = {...DEFAULT_WALK, active: true};
  state.dayNight = 0.5; // start at noon -- immediately, obviously a hot desert
  state.body.active = false;
  state.stamps.length = 0;
  state.emitter = null;
  state.scenario = null;
  state.backend?.reset(0x64657365, {terrain: 'desert', windDeg: 34});
  state.elapsed = 0;
  state.accumulator = 0;
  state.queryDivider = 0;
  panel.querySelector('#world-walk')?.classList.add('active');
  document.body.classList.add('world-walk-active');
  const gesture = document.querySelector('.world-hud-gesture');
  if (gesture) gesture.textContent = 'WASD/STICK LAUFEN · ZIEHEN/STICK UMSEHEN · ESC VERLASSEN';
}

function exitWalk() {
  if (!state.walk.active) return;
  state.walk.active = false;
  if (state.savedEnvironment) {
    state.environment = state.savedEnvironment;
    state.savedEnvironment = null;
  }
  panel.querySelector('#world-walk')?.classList.remove('active');
  document.body.classList.remove('world-walk-active');
  const gesture = document.querySelector('.world-hud-gesture');
  if (gesture) gesture.textContent = 'MALEN · 2 FINGER KAMERA';
}

function toggleWalk() {
  if (state.walk.active) exitWalk();
  else enterWalk();
}

function updateWalk(dt) {
  const walk = state.walk;
  if (!walk.active) return;
  let forwardInput = 0;
  let strafeInput = 0;
  if (walkKeysHeld.has('KeyW') || walkKeysHeld.has('ArrowUp')) forwardInput += 1;
  if (walkKeysHeld.has('KeyS') || walkKeysHeld.has('ArrowDown')) forwardInput -= 1;
  if (walkKeysHeld.has('KeyD') || walkKeysHeld.has('ArrowRight')) strafeInput += 1;
  if (walkKeysHeld.has('KeyA') || walkKeysHeld.has('ArrowLeft')) strafeInput -= 1;

  const pad = activeGamepad();
  if (pad) {
    // Standard Gamepad API mapping: axes 0/1 = left stick x/y, axes 2/3 = right stick x/y --
    // exactly what a wired/wireless Xbox controller reports through the browser with no extra
    // setup. Left stick REPLACES (not adds to) a same-axis key press when its magnitude is
    // larger, so a half-tilted stick can still walk at half speed even with a key also held --
    // summing them could push the combined vector past 1 and back into "always full speed."
    const stickX = applyDeadzone(pad.axes[0] ?? 0, GAMEPAD_DEADZONE);
    const stickY = applyDeadzone(pad.axes[1] ?? 0, GAMEPAD_DEADZONE);
    if (Math.abs(stickX) > Math.abs(strafeInput)) strafeInput = stickX;
    if (Math.abs(-stickY) > Math.abs(forwardInput)) forwardInput = -stickY; // stick up = negative Y
    // Right stick: continuous look, the twin-stick counterpart to the mouse-drag gesture below.
    const lookX = applyDeadzone(pad.axes[2] ?? 0, GAMEPAD_DEADZONE);
    const lookY = applyDeadzone(pad.axes[3] ?? 0, GAMEPAD_DEADZONE);
    if (lookX !== 0 || lookY !== 0) {
      walk.yaw += lookX * GAMEPAD_LOOK_SPEED * dt;
      walk.pitch = Math.max(-0.95, Math.min(0.95, walk.pitch - lookY * GAMEPAD_LOOK_SPEED * dt));
    }
  }

  const inputLength = Math.hypot(forwardInput, strafeInput);
  if (inputLength > 0.001) {
    // Clamp to at most unit length rather than always normalizing TO unit length -- a fully
    // digital key press (magnitude 1 on its axis) still moves at full speed and a W+D diagonal
    // still normalizes exactly as before, but a partially-tilted analog stick now genuinely
    // walks slower instead of snapping to full speed the instant it leaves the deadzone.
    const clampedLength = Math.min(1, inputLength);
    const normForward = (forwardInput / inputLength) * clampedLength;
    const normStrafe = (strafeInput / inputLength) * clampedLength;
    // Matches cameraForward()'s (sin(yaw), .., cos(yaw)) convention in world-sandbox-webgpu.mjs,
    // so "forward" on the keyboard is exactly what the eye is looking at.
    const sinYaw = Math.sin(walk.yaw);
    const cosYaw = Math.cos(walk.yaw);
    const moveX = sinYaw * normForward + cosYaw * normStrafe;
    const moveZ = cosYaw * normForward - sinYaw * normStrafe;
    walk.x = Math.max(0.015, Math.min(0.985, walk.x + moveX * WALK_SPEED * dt));
    walk.z = Math.max(0.015, Math.min(0.985, walk.z + moveZ * WALK_SPEED * dt));
  }

  // Day/night cycle + temperature derived from the SAME sun-elevation curve the shader uses
  // (sunElevationOf in world-sandbox-webgpu.mjs) -- feeds straight into the simulated world,
  // so night cold genuinely freezes standing water (ICE in world-sandbox-reference.mjs)
  // instead of just dimming the lights.
  state.dayNight = (state.dayNight + dt / DAY_LENGTH_SECONDS) % 1;
  const sunElevation = Math.sin((state.dayNight - 0.25) * Math.PI * 2);
  const dayFactor = Math.max(0, Math.min(1, (sunElevation + 0.18) / 0.26));
  state.environment = {...state.environment, temperature: NIGHT_TEMPERATURE + (DAY_TEMPERATURE - NIGHT_TEMPERATURE) * dayFactor};

  walk.eyeY = state.query.ground * state.camera.verticalScale + WALK_EYE_OFFSET;
}

function updateBody(dt) {
  const body = state.body;
  if (!body.active) return;
  const local = state.query;
  const submerged = Math.max(0, Math.min(1, (local.waterSurface - (body.y - body.radius)) / (body.radius * 2)));
  body.vy += (-0.86 + submerged * 1.22) * dt;
  const drag = 1 - Math.min(0.92, submerged * dt * 4.2);
  body.vx *= drag;
  body.vz *= drag;
  body.x += body.vx * dt;
  body.z += body.vz * dt;
  body.y += body.vy * dt;
  if (body.x < 0.02 || body.x > 0.98) {
    body.vx *= -0.45;
    body.x = Math.max(0.02, Math.min(0.98, body.x));
  }
  if (body.z < 0.02 || body.z > 0.98) {
    body.vz *= -0.45;
    body.z = Math.max(0.02, Math.min(0.98, body.z));
  }
  const contact = local.ground + body.radius;
  if (body.y <= contact) {
    const impactSpeed = Math.abs(body.vy);
    body.y = contact;
    if (impactSpeed > 0.055) {
      queueStamp(STAMP.IMPACT, body.x, body.z, Math.min(0.08, impactSpeed * 0.055), 0.038 + impactSpeed * 0.02);
      queueEmitter(local.waterDepth > 0.004 ? 1 : 2, body.x, body.z, mobile ? 34 : 82, 1.3);
      body.vy = impactSpeed * 0.32;
      body.vx *= 0.72;
      body.vz *= 0.72;
      body.impacts += 1;
    } else if (submerged > 0.2) {
      body.vy += submerged * dt * 0.2;
    } else {
      body.vy = 0;
      body.vx *= Math.max(0, 1 - dt * 3.5);
      body.vz *= Math.max(0, 1 - dt * 3.5);
      if (Math.hypot(body.vx, body.vz) < 0.002) body.active = false;
    }
  }
}

function runScenarioEvents() {
  const scenario = state.scenario;
  if (!scenario) return;
  while (scenario.index < scenario.events.length && state.elapsed >= scenario.events[scenario.index].at) {
    scenario.events[scenario.index].run();
    scenario.index += 1;
  }
  if (scenario.index >= scenario.events.length) state.scenario = null;
}

async function startCauseChain() {
  panel.querySelector('#world-note').textContent = 'Solver wird für den deterministischen Ursache-Wirkungs-Replay vorbereitet …';
  const backend = await ensureBackend();
  if (!backend) return;
  backend.reset(0x5a17c0de);
  state.elapsed = 0;
  state.accumulator = 0;
  state.queryDivider = 0;
  state.stamps.length = 0;
  state.body.active = false;
  state.scenario = {
    index: 0,
    events: [
      {at: 0.05, run: () => {
        for (let index = 0; index < 9; index++) {
          queueStamp(STAMP.SAND, 0.31 + index * 0.026, 0.28 + Math.sin(index) * 0.018, 0.036, 0.045);
        }
        queueEmitter(2, 0.42, 0.28, mobile ? 44 : 110, 1.3);
      }},
      {at: 0.65, run: () => {
        queueStamp(STAMP.WATER, 0.28, 0.17, 0.095, 0.075);
        queueEmitter(1, 0.28, 0.17, mobile ? 64 : 150, 1.5);
      }},
      {at: 1.45, run: () => launchStone(0.43, 0.32)},
      {at: 2.4, run: () => {
        queueStamp(STAMP.SEED, 0.48, 0.58, 0.12, 0.09);
        queueEmitter(3, 0.48, 0.58, mobile ? 36 : 90, 1.1);
      }},
      {at: 4.0, run: () => {
        queueStamp(STAMP.HEAT, 0.72, 0.48, 0.11, 0.07);
        queueEmitter(4, 0.72, 0.48, mobile ? 38 : 96, 1.0);
      }},
    ],
  };
  panel.querySelector('#world-note').textContent = 'Replay läuft: Haufen → Wasser/Erosion → Stein/Splash → Samen/Wachstum → Hitze/Trocknung.';
}

function stepOnce() {
  if (!state.backend) return;
  runScenarioEvents();
  updateBody(SIM_DT);
  updateWalk(SIM_DT);
  const queryPosition = state.walk.active ? state.walk : (state.body.active ? state.body : state.pointer);
  state.queryDivider = (state.queryDivider + 1) % 2;
  const query = state.queryDivider === 0 ? {x: queryPosition.x, z: queryPosition.z} : null;
  const stamps = state.stamps.splice(0, 32);
  const emitter = state.emitter;
  state.emitter = null;
  state.backend.step({
    dt: SIM_DT,
    stamps,
    emitter,
    environment: state.environment,
    query,
  });
  state.elapsed += SIM_DT;
}

function loop(now) {
  requestAnimationFrame(loop);
  const delta = Math.min(0.1, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (!state.active || !state.backend) return;
  if (!state.paused) {
    state.accumulator = Math.min(0.1, state.accumulator + delta * state.speed);
    let steps = 0;
    while (state.accumulator >= SIM_DT && steps < MAX_STEPS) {
      stepOnce();
      state.accumulator -= SIM_DT;
      steps += 1;
    }
  }
  state.backend.render({
    viewMode: state.viewMode,
    time: now / 1000,
    body: state.body,
    cursor: state.pointer,
    camera: state.camera,
    walk: state.walk,
    dayNight: state.dayNight,
    temperature: state.environment.temperature,
  });
  state.frames += 1;
  if (now - state.fpsStarted >= 800) {
    const fps = state.frames * 1000 / (now - state.fpsStarted);
    panel.querySelector('#world-state').textContent = state.backend.label + ' · ' + fps.toFixed(0) + ' FPS';
    state.frames = 0;
    state.fpsStarted = now;
  }
}
requestAnimationFrame(loop);

function pointerPosition(event) {
  return screenToWorld(event.clientX, event.clientY);
}

let lastPaint = 0;
const activePointers = new Map();
let paintPointerId = null;
let orbitGesture = null;

function clampCamera() {
  state.camera.pitch = Math.max(0.42, Math.min(1.18, state.camera.pitch));
  state.camera.zoom = Math.max(0.72, Math.min(2.35, state.camera.zoom));
}

function clampWalkLook() {
  state.walk.pitch = Math.max(-0.95, Math.min(0.95, state.walk.pitch));
}

let walkLookGesture = null;

function beginMultiGesture() {
  const pointers = [...activePointers.values()].slice(0, 2);
  if (pointers.length < 2) return;
  const midpoint = {
    x: (pointers[0].x + pointers[1].x) * 0.5,
    y: (pointers[0].y + pointers[1].y) * 0.5,
  };
  orbitGesture = {
    kind: 'multi',
    midpoint,
    distance: Math.max(12, Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y)),
    camera: {...state.camera},
  };
  paintPointerId = null;
  state.pointer.down = false;
  state.pointer.visible = false;
}

function updateMultiGesture() {
  const pointers = [...activePointers.values()].slice(0, 2);
  if (pointers.length < 2 || orbitGesture?.kind !== 'multi') return;
  const midpoint = {
    x: (pointers[0].x + pointers[1].x) * 0.5,
    y: (pointers[0].y + pointers[1].y) * 0.5,
  };
  const distance = Math.max(12, Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y));
  state.camera.yaw = orbitGesture.camera.yaw - (midpoint.x - orbitGesture.midpoint.x) * 0.006;
  state.camera.pitch = orbitGesture.camera.pitch + (midpoint.y - orbitGesture.midpoint.y) * 0.0045;
  state.camera.zoom = orbitGesture.camera.zoom * orbitGesture.distance / distance;
  clampCamera();
}

function bindCanvas() {
  canvas.addEventListener('pointerdown', event => {
    if (!state.active) return;
    event.preventDefault();
    activePointers.set(event.pointerId, {x: event.clientX, y: event.clientY, type: event.pointerType});
    canvas.setPointerCapture?.(event.pointerId);
    if (state.walk.active) {
      walkLookGesture = {id: event.pointerId, x: event.clientX, y: event.clientY, yaw: state.walk.yaw, pitch: state.walk.pitch};
      return;
    }
    if (event.pointerType === 'touch' && activePointers.size >= 2) {
      beginMultiGesture();
      return;
    }
    const orbit = event.button === 1 || event.button === 2 || event.altKey || event.shiftKey;
    if (orbit) {
      orbitGesture = {kind: 'single', id: event.pointerId, x: event.clientX, y: event.clientY, camera: {...state.camera}};
      paintPointerId = null;
      state.pointer.down = false;
      state.pointer.visible = false;
      return;
    }
    Object.assign(state.pointer, pointerPosition(event), {down: true, visible: true});
    paintPointerId = event.pointerId;
    state.toolTrail.x = null;
    state.toolTrail.z = null;
    useTool(state.pointer.x, state.pointer.z);
    lastPaint = event.timeStamp;
  });
  canvas.addEventListener('pointermove', event => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, {x: event.clientX, y: event.clientY, type: event.pointerType});
    }
    if (walkLookGesture?.id === event.pointerId) {
      state.walk.yaw = walkLookGesture.yaw + (event.clientX - walkLookGesture.x) * 0.0052;
      state.walk.pitch = walkLookGesture.pitch - (event.clientY - walkLookGesture.y) * 0.0042;
      clampWalkLook();
      return;
    }
    if (orbitGesture?.kind === 'multi') {
      updateMultiGesture();
      return;
    }
    if (orbitGesture?.kind === 'single' && orbitGesture.id === event.pointerId) {
      state.camera.yaw = orbitGesture.camera.yaw - (event.clientX - orbitGesture.x) * 0.006;
      state.camera.pitch = orbitGesture.camera.pitch + (event.clientY - orbitGesture.y) * 0.0045;
      clampCamera();
      return;
    }
    Object.assign(state.pointer, pointerPosition(event), {visible: true});
    if (state.pointer.down && paintPointerId === event.pointerId && event.timeStamp - lastPaint > 42) {
      useTool(state.pointer.x, state.pointer.z);
      lastPaint = event.timeStamp;
    }
  });
  const release = event => {
    activePointers.delete(event.pointerId);
    if (walkLookGesture?.id === event.pointerId) walkLookGesture = null;
    if (paintPointerId === event.pointerId) {
      paintPointerId = null;
      state.pointer.down = false;
    }
    if (orbitGesture?.kind === 'single' && orbitGesture.id === event.pointerId) orbitGesture = null;
    if (orbitGesture?.kind === 'multi' && activePointers.size < 2) orbitGesture = null;
    canvas.releasePointerCapture?.(event.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    if (!state.pointer.down) state.pointer.visible = false;
  });
  canvas.addEventListener('wheel', event => {
    if (!state.active) return;
    event.preventDefault();
    state.camera.zoom *= Math.exp(event.deltaY * 0.0012);
    clampCamera();
  }, {passive: false});
  canvas.addEventListener('dblclick', event => {
    event.preventDefault();
    resetCamera();
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
}
bindCanvas();

launch.addEventListener('click', () => {
  if (state.active) return exit();
  enter();
  document.body.classList.remove('inspector-collapsed');
  document.body.classList.add('inspector-open');
  document.querySelectorAll('.inspector-section').forEach(section => section.classList.toggle('section-collapsed', section !== panel));
  document.querySelectorAll('.rail-btn').forEach(button => button.classList.toggle('active', button === railLaunch));
});
panel.querySelector('#world-exit').addEventListener('click', exit);
panel.querySelector('#world-reset').addEventListener('click', () => {
  if (state.walk.active) exitWalk();
  state.backend?.reset();
  state.elapsed = 0;
  state.accumulator = 0;
  state.queryDivider = 0;
  state.stamps.length = 0;
  state.emitter = null;
  state.body.active = false;
  state.scenario = null;
});
panel.querySelector('#world-walk')?.addEventListener('click', toggleWalk);
panel.querySelector('#world-chain').addEventListener('click', startCauseChain);
panel.querySelector('#world-pause').addEventListener('click', () => setPaused(!state.paused));
panel.querySelector('#world-step').addEventListener('click', () => {
  if (!state.paused) {
    setPaused(true);
  }
  stepOnce();
});
panel.querySelector('#world-brush').addEventListener('input', event => {
  setBrushRadius(event.target.value);
});
panel.querySelector('#world-view').addEventListener('change', event => {
  setViewMode(event.target.value);
});
panel.querySelector('#world-speed').addEventListener('change', event => {
  state.speed = Number(event.target.value);
});
document.querySelectorAll('[data-world-tool]').forEach(button => {
  button.addEventListener('click', () => setTool(button.dataset.worldTool));
});
document.querySelectorAll('[data-world-brush]').forEach(input => {
  input.addEventListener('input', () => setBrushRadius(input.value));
});
document.querySelectorAll('[data-world-view-cycle]').forEach(button => {
  button.addEventListener('click', () => {
    const index = VIEW_MODES.findIndex(item => item.id === state.viewMode);
    setViewMode(VIEW_MODES[(index + 1) % VIEW_MODES.length].id);
  });
});
document.querySelectorAll('[data-world-camera-reset]').forEach(button => {
  button.addEventListener('click', resetCamera);
});
document.querySelectorAll('[data-world-action="pause"]').forEach(button => {
  button.addEventListener('click', () => setPaused(!state.paused));
});
document.querySelectorAll('[data-world-open-panel]').forEach(button => {
  button.addEventListener('click', () => railLaunch?.click());
});
panel.addEventListener('input', event => {
  const input = event.target.closest('[data-world-env]');
  if (!input) return;
  state.environment[input.dataset.worldEnv] = Number(input.value);
  input.parentElement.querySelector('output').textContent = Number(input.value).toFixed(2);
});

for (const id of ['btn-room-view', 'btn-erstellen']) {
  document.getElementById(id)?.addEventListener('click', () => {
    if (state.active) exit({preserveInspector: true});
  }, {capture: true});
}
window.addEventListener('keydown', event => {
  if (/input|select|textarea/i.test(event.target.tagName)) return;
  if (event.key === ' ' && state.active) {
    event.preventDefault();
    panel.querySelector('#world-pause').click();
  }
  if (state.active && state.walk.active && WALK_MOVE_KEYS.has(event.code)) {
    event.preventDefault();
    walkKeysHeld.add(event.code);
  }
  if (event.key === 'Escape' && state.active && state.walk.active) {
    event.preventDefault();
    exitWalk();
    // editor/ux-fixes.js also binds a global window Escape handler (closeChrome) that
    // collapses the whole inspector; relying on event-phase ordering to outrun it proved
    // unreliable, so instead correct the DOM right after this dispatch finishes, once
    // every same-tick keydown handler (that one included) has already run.
    queueMicrotask(() => {
      if (!state.active) return;
      document.body.classList.remove('inspector-collapsed');
      document.body.classList.add('inspector-open');
      railLaunch?.classList.add('active');
      document.querySelectorAll('.inspector-section').forEach(section => section.classList.toggle('section-collapsed', section !== panel));
    });
  }
});
window.addEventListener('keyup', event => {
  walkKeysHeld.delete(event.code);
});

setTool(state.tool);
setViewMode(state.viewMode);
setBrushRadius(state.radius * 100);
setPaused(state.paused);

window.SHADEDWorldSandbox = {
  enter,
  exit,
  startCauseChain,
  queueStamp,
  // Forwards directly to the CPU backend's own spawnPlant(x, z) -- same reason queueStamp is
  // exposed here: lets tests drive a real, live growth-agent spawn without racing a canvas
  // click/drag (this panel's own documented pre-existing click-interception issue in headless
  // testing, noted elsewhere in this file's history for the carve tool). A no-op on the WebGPU
  // backend (no growth-agent render path there yet).
  spawnPlant: (x, z) => state.backend?.spawnPlant?.(x, z),
  enterWalk,
  exitWalk,
  get active() { return state.active; },
  get backend() { return state.backendKind; },
  get query() { return {...state.query}; },
  get body() { return {...state.body}; },
  get camera() { return {...state.camera}; },
  get walk() { return {...state.walk}; },
  get dayNight() { return state.dayNight; },
  // Debug-only: read-only snapshot of the stamps queued this frame, before stepOnce() drains
  // them. Exists for tests to inspect what a real DOM interaction (a click, a drag) actually
  // produced -- e.g. verifying a directional tool's drag-direction computation -- without
  // racing the running simulation loop (pause first via #world-pause, then this stays stable).
  get stamps() { return state.stamps.map(stamp => ({...stamp})); },
  // Debug-only: read-only snapshot of the CPU backend's growth-agent plants (world-sandbox-
  // growth.mjs), one entry per spawned plant with its own node count and living-tip count --
  // exists for tests to confirm a spawn + simulation steps actually grew a graph, without
  // reaching into CpuWorldSandbox's own private fields. Empty on the WebGPU backend (no
  // growth-agent render path there yet, see useTool()'s own comment on this).
  get plants() {
    const backend = state.backend;
    if (!backend?.plants) return [];
    return backend.plants.map(plant => ({
      nodeCount: plant.graph.nodes.length,
      livingTips: plant.tips.filter(tip => tip.alive).length,
    }));
  },
};
