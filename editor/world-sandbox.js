import {
  DEFAULT_ENVIRONMENT,
  FIELD,
  STAMP,
  createWorldState,
  sampleWorld,
  stepWorldReference,
} from '../runtime/world-sandbox-reference.mjs';
import {WebGpuWorldSandbox} from '../runtime/world-sandbox-webgpu.mjs';

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
const toolDefinitions = {
  sand: {kind: STAMP.SAND, amount: 0.026, particleKind: 2, particles: mobile ? 18 : 38},
  water: {kind: STAMP.WATER, amount: 0.029, particleKind: 1, particles: mobile ? 22 : 52},
  seed: {kind: STAMP.SEED, amount: 0.055, particleKind: 3, particles: mobile ? 10 : 24},
  dig: {kind: STAMP.DIG, amount: 0.028, particles: 0},
  heat: {kind: STAMP.HEAT, amount: 0.048, particleKind: 4, particles: mobile ? 16 : 34},
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

function colorForCell(data, offset, mode) {
  const bedrock = data[offset + FIELD.BEDROCK];
  const sand = data[offset + FIELD.SAND];
  const wet = data[offset + FIELD.WETNESS];
  const water = data[offset + FIELD.WATER];
  const vx = data[offset + FIELD.VELOCITY_X];
  const vz = data[offset + FIELD.VELOCITY_Z];
  const bio = data[offset + FIELD.BIOMASS];
  const heat = data[offset + FIELD.HEAT];
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
  let r = 62 + sand * 850;
  let g = 55 + sand * 480;
  let b = 43 + sand * 170;
  const dark = 1 - wet * 0.52;
  r *= dark;
  g *= dark;
  b *= dark;
  if (water > 0.0003) {
    const depth = Math.min(1, water * 12);
    r = r * (0.45 - depth * 0.12) + 10;
    g = g * 0.45 + 80 - depth * 35;
    b = b * 0.42 + 105 + depth * 35;
  }
  r = r * (1 - bio * 0.76) + 20 * bio;
  g = g * (1 - bio * 0.58) + 116 * bio;
  b = b * (1 - bio * 0.74) + 28 * bio;
  r = r * (1 - heat * 0.45) + 245 * heat;
  g = g * (1 - heat * 0.7) + 38 * heat;
  return [r, g, b];
}

class CpuWorldSandbox {
  constructor(target, options = {}) {
    this.canvas = target;
    this.context = target.getContext('2d', {alpha: false});
    if (!this.context) throw new Error('Canvas 2D unavailable');
    this.size = mobile ? 56 : 72;
    this.particleCount = mobile ? 420 : 900;
    this.onQuery = options.onQuery || (() => {});
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.size;
    this.offscreen.height = this.size;
    this.offscreenContext = this.offscreen.getContext('2d', {alpha: false});
    this.image = this.offscreenContext.createImageData(this.size, this.size);
    this.particles = [];
    this.deposits = [];
    this.reset();
  }

  reset(seed = 0x53484144) {
    this.world = createWorldState(this.size, seed);
    this.particles.length = 0;
    this.deposits.length = 0;
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
    if (query) {
      this.onQuery({...sampleWorld(this.world, this.size, query.x, query.z), latencyMs: 0});
    }
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2) * (mobile ? 0.72 : 0.9);
    const width = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render({viewMode = 0, body, cursor}) {
    this.resize();
    const pixels = this.image.data;
    for (let cell = 0; cell < this.size * this.size; cell++) {
      const rgb = colorForCell(this.world, cell * 12, viewMode);
      const pixel = cell * 4;
      pixels[pixel] = Math.max(0, Math.min(255, rgb[0]));
      pixels[pixel + 1] = Math.max(0, Math.min(255, rgb[1]));
      pixels[pixel + 2] = Math.max(0, Math.min(255, rgb[2]));
      pixels[pixel + 3] = 255;
    }
    this.offscreenContext.putImageData(this.image, 0, 0);
    const context = this.context;
    context.imageSmoothingEnabled = true;
    context.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
    context.save();
    for (const particle of this.particles) {
      const x = particle.x * this.canvas.width;
      const y = particle.z * this.canvas.height - particle.y * this.canvas.height * 0.05;
      context.fillStyle = particle.kind === 1 ? '#78cfff'
        : particle.kind === 2 ? '#e8ae59'
          : particle.kind === 3 ? '#82d959' : '#ff5a1e';
      context.globalAlpha = 0.85;
      context.beginPath();
      context.arc(x, y, 1.5 + particle.y * 2, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    if (body?.active) {
      context.fillStyle = 'rgba(0,0,0,.35)';
      context.beginPath();
      context.ellipse(body.x * this.canvas.width + 3, body.z * this.canvas.height + 4, 9, 5, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#696d72';
      context.beginPath();
      context.arc(body.x * this.canvas.width, body.z * this.canvas.height - body.y * 5, 7, 0, Math.PI * 2);
      context.fill();
    }
    if (cursor?.visible) {
      context.strokeStyle = 'rgba(178,207,255,.85)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.ellipse(
        cursor.x * this.canvas.width,
        cursor.z * this.canvas.height,
        cursor.radius * this.canvas.width,
        cursor.radius * this.canvas.height,
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
    context.restore();
  }

  get label() {
    return 'CPU REFERENCE · ' + this.size + '² · WEBGPU UNAVAILABLE';
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
}

function queueStamp(kind, x, z, amount, radius = state.radius) {
  if (state.stamps.length >= 32) return;
  state.stamps.push({kind, x, z, radius, amount});
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
  const tool = toolDefinitions[state.tool];
  if (!tool) return;
  queueStamp(tool.kind, x, z, tool.amount, state.radius);
  queueEmitter(tool.particleKind, x, z, tool.particles, state.radius / 0.05);
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
  const queryPosition = state.body.active ? state.body : state.pointer;
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
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    z: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
  };
}

let lastPaint = 0;
function bindCanvas() {
  canvas.addEventListener('pointerdown', event => {
    if (!state.active) return;
    Object.assign(state.pointer, pointerPosition(event), {down: true, visible: true});
    useTool(state.pointer.x, state.pointer.z);
    canvas.setPointerCapture(event.pointerId);
    lastPaint = event.timeStamp;
  });
  canvas.addEventListener('pointermove', event => {
    Object.assign(state.pointer, pointerPosition(event), {visible: true});
    if (state.pointer.down && event.timeStamp - lastPaint > 42) {
      useTool(state.pointer.x, state.pointer.z);
      lastPaint = event.timeStamp;
    }
  });
  const release = event => {
    state.pointer.down = false;
    canvas.releasePointerCapture?.(event.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    if (!state.pointer.down) state.pointer.visible = false;
  });
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
  state.backend?.reset();
  state.elapsed = 0;
  state.accumulator = 0;
  state.queryDivider = 0;
  state.stamps.length = 0;
  state.emitter = null;
  state.body.active = false;
  state.scenario = null;
});
panel.querySelector('#world-chain').addEventListener('click', startCauseChain);
panel.querySelector('#world-pause').addEventListener('click', event => {
  state.paused = !state.paused;
  event.currentTarget.textContent = state.paused ? 'PLAY' : 'PAUSE';
  event.currentTarget.classList.toggle('active', state.paused);
});
panel.querySelector('#world-step').addEventListener('click', () => {
  if (!state.paused) {
    state.paused = true;
    panel.querySelector('#world-pause').textContent = 'PLAY';
    panel.querySelector('#world-pause').classList.add('active');
  }
  stepOnce();
});
panel.querySelector('#world-brush').addEventListener('input', event => {
  state.radius = Number(event.target.value) / 100;
  state.pointer.radius = state.radius;
  const output = event.target.parentElement.querySelector('output');
  if (output) output.textContent = state.radius.toFixed(2);
});
panel.querySelector('#world-view').addEventListener('change', event => {
  state.viewMode = Number(event.target.value);
});
panel.querySelector('#world-speed').addEventListener('change', event => {
  state.speed = Number(event.target.value);
});
panel.addEventListener('click', event => {
  const button = event.target.closest('[data-world-tool]');
  if (!button) return;
  state.tool = button.dataset.worldTool;
  panel.querySelectorAll('[data-world-tool]').forEach(item => item.classList.toggle('active', item === button));
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
});

window.SHADEDWorldSandbox = {
  enter,
  exit,
  startCauseChain,
  queueStamp,
  get active() { return state.active; },
  get backend() { return state.backendKind; },
  get query() { return {...state.query}; },
  get body() { return {...state.body}; },
};
