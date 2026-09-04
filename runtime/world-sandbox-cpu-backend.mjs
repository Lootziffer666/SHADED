// CPU reference backend + optional Canvas2D renderer extracted from editor/world-sandbox.js.
// The solver/particle feedback is runtime capability. A canvas is an optional render target,
// never a UI contract.

import {
  CELL_STRIDE,
  FIELD,
  STAMP,
  createWorldState,
  mulberry32,
  sampleWorld,
  stepWorldReference,
} from './world-sandbox-reference.mjs';
import {
  WALK_NEAR,
  cameraBasis,
  projectWalk,
  projectWorld,
  walkBasis,
} from './world-sandbox-camera.mjs';

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
    this.reset(options.seed, options.worldOptions);
  }

  reset(seed = 0x53484144, options = {}) {
    this.world = createWorldState(this.size, seed ?? 0x53484144, options || {});
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

  sample(x, z) {
    return sampleWorld(this.world, this.size, x, z);
  }

  render() {}

  destroy() {}

  get label() {
    return `CPU REFERENCE · ${this.size}²`;
  }
}

let skyStars = null;
function ensureSkyStars() {
  if (skyStars) return skyStars;
  const random = mulberry32(0xA57);
  skyStars = [];
  for (let i = 0; i < 140; i++) skyStars.push({ux: random(), uy: random() * 0.62, seed: random()});
  return skyStars;
}

function drawSky(context, width, height, dayNight, temperature, time) {
  const sunElevation = Math.sin((dayNight - 0.25) * Math.PI * 2);
  const dayFactor = Math.max(0, Math.min(1, (sunElevation + 0.18) / 0.26));
  const mix3 = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
  const zenith = mix3([3, 4, 7], [41, 107, 189], dayFactor);
  const horizon = mix3([14, 13, 23], [219, 184, 133], dayFactor);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `rgb(${zenith.map(v => Math.round(v)).join(',')})`);
  gradient.addColorStop(1, `rgb(${horizon.map(v => Math.round(v)).join(',')})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  if (dayFactor < 0.6) {
    context.fillStyle = `rgba(230,235,255,${(1 - dayFactor) * 0.9})`;
    for (const star of ensureSkyStars()) {
      const twinkle = 0.5 + 0.5 * Math.sin(time * 3 + star.seed * 60);
      if (twinkle >= 0.35) context.fillRect(star.ux * width, star.uy * height, 1.4, 1.4);
    }
  }

  const sunX = width * (0.5 + Math.sin(dayNight * Math.PI * 2) * 0.42);
  const sunY = height * (0.92 - Math.max(0, sunElevation) * 0.75);
  if (dayFactor > 0.02) {
    context.fillStyle = 'rgba(255,235,200,0.95)';
    context.beginPath();
    context.arc(sunX, sunY, Math.max(6, width * 0.018), 0, Math.PI * 2);
    context.fill();
  }

  const moonX = width * (0.5 - Math.sin(dayNight * Math.PI * 2) * 0.42);
  const moonY = height * (0.92 - Math.max(0, -sunElevation) * 0.75);
  if (dayFactor < 0.85) {
    context.fillStyle = `rgba(205,210,222,${(1 - dayFactor) * 0.85})`;
    context.beginPath();
    context.arc(moonX, moonY, Math.max(5, width * 0.013), 0, Math.PI * 2);
    context.fill();
  }

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

export class CpuCanvasWorldSandboxBackend extends CpuWorldSandboxBackend {
  constructor(canvas, options = {}) {
    super(options);
    this.canvas = canvas;
    this.context = canvas.getContext('2d', {alpha: false});
    if (!this.context) throw new Error('Canvas 2D unavailable on supplied render target');
    this.pixelRatio = options.pixelRatio || (() => Math.min(globalThis.devicePixelRatio || 1, 2) * (this.mobile ? 0.92 : 1));
    this.drawOrder = [];
    this.orderKey = '';
  }

  reset(seed = 0x53484144, options = {}) {
    super.reset(seed, options);
    this.orderKey = '';
  }

  resize() {
    const dpr = Number(this.pixelRatio()) || 1;
    const width = Math.max(2, Math.floor((this.canvas.clientWidth || this.canvas.width || 2) * dpr));
    const height = Math.max(2, Math.floor((this.canvas.clientHeight || this.canvas.height || 2) * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.orderKey = '';
    }
  }

  render({viewMode = 0, body, cursor, camera, walk = null, dayNight = 0.5, temperature = 0.5, time = 0}) {
    this.resize();
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const size = this.size;
    const verticalScale = camera.verticalScale;
    const useWalk = !!walk?.active;
    const offsetAt = (x, z) => (
      Math.max(0, Math.min(size - 1, z)) * size + Math.max(0, Math.min(size - 1, x))
    ) * CELL_STRIDE;
    const heightAt = (x, z, water = false) => {
      const offset = offsetAt(x, z);
      return this.world[offset + FIELD.BEDROCK] + this.world[offset + FIELD.SAND]
        + (water ? this.world[offset + FIELD.WATER] : 0);
    };
    const projectPoint = (world) => useWalk
      ? projectWalk(world, width, height, walk)
      : projectWorld(world, width, height, camera);
    const projected = (x, z, water = false) => projectPoint([
      x / (size - 1) * 2 - 1,
      heightAt(x, z, water) * verticalScale,
      z / (size - 1) * 2 - 1,
    ]);

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
      context.moveTo(p00.x, p00.y); context.lineTo(p10.x, p10.y);
      context.lineTo(p11.x, p11.y); context.lineTo(p01.x, p01.y);
      context.closePath(); context.fill();

      const water = this.world[offset + FIELD.WATER];
      if (viewMode === 0 && water > 0.00035) {
        const w00 = projected(x, z, true);
        const w10 = projected(x + 1, z, true);
        const w11 = projected(x + 1, z + 1, true);
        const w01 = projected(x, z + 1, true);
        const depth = Math.min(1, water * 12);
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
        context.moveTo(w00.x, w00.y); context.lineTo(w10.x, w10.y);
        context.lineTo(w11.x, w11.y); context.lineTo(w01.x, w01.y);
        context.closePath(); context.fill();
      }

      const biomass = this.world[offset + FIELD.BIOMASS];
      const snowCover = this.world[offset + FIELD.SNOW];
      if (viewMode === 0 && water < 0.006 && snowCover < 0.02 && biomass > 0.012
          && grain + 0.5 < Math.min(0.9, biomass * 4.2)) {
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
        const base = projectPoint([x / (size - 1) * 2 - 1, groundHeight, z / (size - 1) * 2 - 1]);
        const top = projectPoint([
          x / (size - 1) * 2 - 1 + vx * lean,
          groundHeight + stalkHeight * (1 - lean * 0.3),
          z / (size - 1) * 2 - 1 + vz * lean,
        ]);
        const hot = this.world[offset + FIELD.HEAT] > 0.25;
        context.strokeStyle = hot ? 'rgba(119,88,38,.82)'
          : isTree ? 'rgba(77,54,26,.9)'
            : isShrub ? 'rgba(46,84,32,.92)' : 'rgba(68,111,42,.88)';
        context.lineWidth = Math.max(1, width / 900) * (isShrub ? 2.2 : isTree ? 3 : 1);
        context.beginPath(); context.moveTo(base.x, base.y); context.lineTo(top.x, top.y); context.stroke();
        if (isFlower && !hot) {
          const hue = Math.abs(Math.sin((x * 12.9898 + z * 78.233) * 43758.5453) % 1);
          const petal = hue < 0.33 ? '212,148,168' : hue < 0.66 ? '242,217,89' : '230,230,219';
          context.fillStyle = `rgba(${petal},.92)`;
          context.beginPath(); context.arc(top.x, top.y, Math.max(1.4, width / 480), 0, Math.PI * 2); context.fill();
        } else if (isTree) {
          context.fillStyle = 'rgba(38,84,26,.88)';
          context.beginPath(); context.arc(top.x, top.y, Math.max(3, width / 130), 0, Math.PI * 2); context.fill();
        }
      }
    }

    for (const particle of this.particles) {
      const point = projectPoint([particle.x * 2 - 1, particle.y * verticalScale, particle.z * 2 - 1]);
      context.fillStyle = particle.kind === 1 ? '#78b8c7'
        : particle.kind === 2 ? '#d1a064' : particle.kind === 3 ? '#88a95b' : '#db5c32';
      context.globalAlpha = 0.86;
      context.beginPath(); context.arc(point.x, point.y, Math.max(1.5, width / 420), 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;

    if (body?.active) {
      const point = projectPoint([body.x * 2 - 1, body.y * verticalScale, body.z * 2 - 1]);
      const radius = Math.max(4, width / 115);
      const stone = context.createRadialGradient(point.x - radius * 0.35, point.y - radius * 0.45, 1, point.x, point.y, radius);
      stone.addColorStop(0, '#9a9d96'); stone.addColorStop(0.55, '#555b58'); stone.addColorStop(1, '#202523');
      context.fillStyle = stone;
      context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill();
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
        const point = projectPoint([x * 2 - 1, sample.ground * verticalScale + 0.004, z * 2 - 1]);
        if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
      }
      context.closePath(); context.stroke();
    }
    context.restore();
  }

  get label() {
    return `CPU REFERENCE + SPATIAL · ${this.size}²`;
  }
}
