// DOM-free controller extracted from the former editor/world-sandbox.js.
// Presentation is a client of this object. The simulation does not know buttons, panels,
// CSS classes, selectors, pointer events or inspector state exist.

import {DEFAULT_ENVIRONMENT, STAMP} from './world-sandbox-reference.mjs';
import {CpuWorldSandboxBackend} from './world-sandbox-cpu-backend.mjs';
import {DEFAULT_CAMERA, DEFAULT_WALK, clampCamera, clampWalkLook} from './world-sandbox-camera.mjs';

export const SIM_DT = 1 / 30;
export const MAX_STEPS = 3;
export const WALK_SPEED = 0.052;
export const WALK_EYE_OFFSET = 0.052;
export const GAMEPAD_DEADZONE = 0.15;
export const GAMEPAD_LOOK_SPEED = 2.6;
export const DAY_LENGTH_SECONDS = 90;
export const DAY_TEMPERATURE = 0.82;
export const NIGHT_TEMPERATURE = 0.12;

export function createToolDefinitions({mobile = false} = {}) {
  return Object.freeze({
    sand: {kind: STAMP.SAND, amount: 0.026, particleKind: 2, particles: mobile ? 18 : 38},
    water: {kind: STAMP.WATER, amount: 0.029, particleKind: 1, particles: mobile ? 22 : 52},
    seed: {kind: STAMP.SEED, amount: 0.055, particleKind: 3, particles: mobile ? 10 : 24},
    dig: {kind: STAMP.DIG, amount: 0.028, particles: 0},
    heat: {kind: STAMP.HEAT, amount: 0.048, particleKind: 4, particles: mobile ? 16 : 34},
    focus: {kind: STAMP.FOCUS, amount: 0.05, particles: 0},
    carve: {kind: STAMP.CARVE, amount: 0.03, directional: true, particleKind: 1, particles: mobile ? 20 : 46},
  });
}

export function applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
  const magnitude = Math.abs(Number(value) || 0);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

// Pure adapter for the standard Gamepad mapping. Polling navigator.getGamepads() belongs to a
// future input client, not the runtime.
export function walkInputFromGamepad(pad, deadzone = GAMEPAD_DEADZONE) {
  if (!pad?.connected) return {forward: 0, strafe: 0, lookX: 0, lookY: 0};
  return {
    forward: -applyDeadzone(pad.axes?.[1] ?? 0, deadzone),
    strafe: applyDeadzone(pad.axes?.[0] ?? 0, deadzone),
    lookX: applyDeadzone(pad.axes?.[2] ?? 0, deadzone),
    lookY: applyDeadzone(pad.axes?.[3] ?? 0, deadzone),
  };
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

export class WorldSandboxRuntime {
  constructor(options = {}) {
    this.mobile = !!options.mobile;
    this.toolDefinitions = createToolDefinitions({mobile: this.mobile});
    this.onQuery = options.onQuery || (() => {});
    this.onError = options.onError || (() => {});
    this.backend = options.backend || new CpuWorldSandboxBackend({
      mobile: this.mobile,
      size: options.cpuSize,
      particleCount: options.particleCount,
      onQuery: query => this.updateQuery(query),
    });
    if (options.backend) this.backend.onQuery = query => this.updateQuery(query);
    this.backendKind = options.backendKind || 'cpu';
    this.realtimeHandle = null;
    this.realtimeLast = 0;
    this.resetControllerState(options.environment);
  }

  resetControllerState(environment) {
    this.state = {
      active: false,
      paused: false,
      tool: 'sand',
      radius: 0.05,
      viewMode: 0,
      speed: 2,
      environment: {...DEFAULT_ENVIRONMENT, growthRate: 0.36, ...(environment || {})},
      stamps: [],
      emitter: null,
      pointer: {x: 0.5, z: 0.5, radius: 0.05, visible: false, down: false},
      toolTrail: {x: null, z: null},
      camera: {...DEFAULT_CAMERA, zoom: this.mobile ? 1.42 : DEFAULT_CAMERA.zoom},
      walk: {...DEFAULT_WALK},
      dayNight: 0.5,
      savedEnvironment: null,
      body: {active: false, x: 0.5, z: 0.2, y: 0.8, vx: 0, vz: 0, vy: 0, radius: 0.018, impacts: 0},
      query: {ground: 0.16, waterSurface: 0.16, waterDepth: 0, wetness: 0, biomass: 0, heat: 0, sand: 0, latencyMs: 0},
      accumulator: 0,
      elapsed: 0,
      queryDivider: 0,
      scenario: null,
    };
  }

  useBackend(backend, kind = 'custom') {
    if (!backend?.step || !backend?.reset) throw new TypeError('World sandbox backend must implement step() and reset()');
    this.backend?.destroy?.();
    this.backend = backend;
    this.backendKind = kind;
    this.backend.onQuery = query => this.updateQuery(query);
    return backend;
  }

  updateQuery(query) {
    this.state.query = {...this.state.query, ...query};
    this.onQuery({...this.state.query});
  }

  enter() {
    this.state.active = true;
    this.state.accumulator = 0;
    return this.snapshot();
  }

  exit() {
    this.state.active = false;
    this.state.pointer.down = false;
    if (this.state.walk.active) this.exitWalk();
    return this.snapshot();
  }

  reset(seed = 0x53484144, worldOptions = {}) {
    this.backend.reset(seed, worldOptions);
    this.state.elapsed = 0;
    this.state.accumulator = 0;
    this.state.queryDivider = 0;
    this.state.stamps.length = 0;
    this.state.emitter = null;
    this.state.body.active = false;
    this.state.scenario = null;
    this.state.toolTrail = {x: null, z: null};
    return this.snapshot();
  }

  setTool(tool) {
    if (tool !== 'stone' && !this.toolDefinitions[tool]) throw new RangeError(`Unknown world tool: ${tool}`);
    this.state.tool = tool;
    this.endToolStroke();
    return tool;
  }

  setViewMode(mode) {
    this.state.viewMode = Number(mode) || 0;
    return this.state.viewMode;
  }

  setBrushRadius(radius) {
    const value = Number(radius);
    if (!Number.isFinite(value)) throw new TypeError('Brush radius must be finite');
    this.state.radius = Math.max(0.001, Math.min(0.5, value));
    this.state.pointer.radius = this.state.radius;
    return this.state.radius;
  }

  setSpeed(speed) {
    const value = Number(speed);
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('Simulation speed must be > 0');
    this.state.speed = value;
    return value;
  }

  setPaused(paused) {
    this.state.paused = !!paused;
    return this.state.paused;
  }

  setEnvironment(partial = {}) {
    for (const [key, value] of Object.entries(partial)) {
      if (!Number.isFinite(Number(value))) throw new TypeError(`Environment ${key} must be numeric`);
      this.state.environment[key] = Number(value);
    }
    return {...this.state.environment};
  }

  setPointer(x, z, {visible = true, down = this.state.pointer.down} = {}) {
    this.state.pointer.x = Math.max(0, Math.min(1, Number(x)));
    this.state.pointer.z = Math.max(0, Math.min(1, Number(z)));
    this.state.pointer.visible = !!visible;
    this.state.pointer.down = !!down;
    return {...this.state.pointer};
  }

  beginToolStroke(x, z) {
    this.state.toolTrail.x = null;
    this.state.toolTrail.z = null;
    this.setPointer(x, z, {down: true, visible: true});
    this.useTool(x, z);
  }

  continueToolStroke(x, z) {
    this.setPointer(x, z, {down: true, visible: true});
    this.useTool(x, z);
  }

  endToolStroke() {
    this.state.pointer.down = false;
    this.state.toolTrail.x = null;
    this.state.toolTrail.z = null;
  }

  queueStamp(kind, x, z, amount, radius = this.state.radius, directionX = 0, directionZ = 0) {
    if (this.state.stamps.length >= 32) return false;
    this.state.stamps.push({
      kind,
      x: Math.max(0, Math.min(1, Number(x))),
      z: Math.max(0, Math.min(1, Number(z))),
      radius: Math.max(0.001, Number(radius) || this.state.radius),
      amount: Number(amount) || 0,
      directionX: Number(directionX) || 0,
      directionZ: Number(directionZ) || 0,
    });
    return true;
  }

  queueEmitter(kind, x, z, count, strength = 1) {
    if (!count) return false;
    this.state.emitter = {kind, x, z, count, strength};
    return true;
  }

  launchStone(x = this.state.pointer.x, z = this.state.pointer.z) {
    this.state.body = {
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
    return {...this.state.body};
  }

  useTool(x, z) {
    if (this.state.tool === 'stone') return this.launchStone(x, z);
    const tool = this.toolDefinitions[this.state.tool];
    if (!tool) return false;

    let directionX = 0;
    let directionZ = 0;
    if (tool.directional && this.state.toolTrail.x !== null) {
      const dx = x - this.state.toolTrail.x;
      const dz = z - this.state.toolTrail.z;
      const length = Math.hypot(dx, dz);
      if (length > 1e-4) {
        directionX = dx / length;
        directionZ = dz / length;
      }
    }
    this.state.toolTrail.x = x;
    this.state.toolTrail.z = z;
    this.queueStamp(tool.kind, x, z, tool.amount, this.state.radius, directionX, directionZ);
    this.queueEmitter(tool.particleKind, x, z, tool.particles, this.state.radius / 0.05);
    return true;
  }

  enterWalk() {
    if (this.state.walk.active) return {...this.state.walk};
    this.state.savedEnvironment = {...this.state.environment};
    this.state.walk = {...DEFAULT_WALK, active: true};
    this.state.dayNight = 0.5;
    this.state.body.active = false;
    this.state.stamps.length = 0;
    this.state.emitter = null;
    this.state.scenario = null;
    this.backend.reset(0x64657365, {terrain: 'desert', windDeg: 34});
    this.state.elapsed = 0;
    this.state.accumulator = 0;
    this.state.queryDivider = 0;
    return {...this.state.walk};
  }

  exitWalk() {
    if (!this.state.walk.active) return {...this.state.walk};
    this.state.walk.active = false;
    if (this.state.savedEnvironment) {
      this.state.environment = this.state.savedEnvironment;
      this.state.savedEnvironment = null;
    }
    return {...this.state.walk};
  }

  toggleWalk() {
    return this.state.walk.active ? this.exitWalk() : this.enterWalk();
  }

  resetCamera() {
    Object.assign(this.state.camera, DEFAULT_CAMERA, {zoom: this.mobile ? 1.42 : DEFAULT_CAMERA.zoom});
    return {...this.state.camera};
  }

  orbitCamera({yawDelta = 0, pitchDelta = 0, zoomFactor = 1} = {}) {
    this.state.camera.yaw += Number(yawDelta) || 0;
    this.state.camera.pitch += Number(pitchDelta) || 0;
    this.state.camera.zoom *= Number(zoomFactor) || 1;
    clampCamera(this.state.camera);
    return {...this.state.camera};
  }

  lookWalk({yawDelta = 0, pitchDelta = 0} = {}) {
    this.state.walk.yaw += Number(yawDelta) || 0;
    this.state.walk.pitch += Number(pitchDelta) || 0;
    clampWalkLook(this.state.walk);
    return {...this.state.walk};
  }

  updateWalk(dt, input = {}) {
    const walk = this.state.walk;
    if (!walk.active) return;

    let forwardInput = Number(input.forward) || 0;
    let strafeInput = Number(input.strafe) || 0;
    const lookX = Number(input.lookX) || 0;
    const lookY = Number(input.lookY) || 0;
    if (lookX || lookY) {
      walk.yaw += lookX * GAMEPAD_LOOK_SPEED * dt;
      walk.pitch = Math.max(-0.95, Math.min(0.95, walk.pitch - lookY * GAMEPAD_LOOK_SPEED * dt));
    }

    const inputLength = Math.hypot(forwardInput, strafeInput);
    if (inputLength > 0.001) {
      const clampedLength = Math.min(1, inputLength);
      const normForward = forwardInput / inputLength * clampedLength;
      const normStrafe = strafeInput / inputLength * clampedLength;
      const sinYaw = Math.sin(walk.yaw);
      const cosYaw = Math.cos(walk.yaw);
      const moveX = sinYaw * normForward + cosYaw * normStrafe;
      const moveZ = cosYaw * normForward - sinYaw * normStrafe;
      walk.x = Math.max(0.015, Math.min(0.985, walk.x + moveX * WALK_SPEED * dt));
      walk.z = Math.max(0.015, Math.min(0.985, walk.z + moveZ * WALK_SPEED * dt));
    }

    this.state.dayNight = (this.state.dayNight + dt / DAY_LENGTH_SECONDS) % 1;
    const sunElevation = Math.sin((this.state.dayNight - 0.25) * Math.PI * 2);
    const dayFactor = Math.max(0, Math.min(1, (sunElevation + 0.18) / 0.26));
    this.state.environment = {
      ...this.state.environment,
      temperature: NIGHT_TEMPERATURE + (DAY_TEMPERATURE - NIGHT_TEMPERATURE) * dayFactor,
    };
    walk.eyeY = this.state.query.ground * this.state.camera.verticalScale + WALK_EYE_OFFSET;
  }

  updateBody(dt) {
    const body = this.state.body;
    if (!body.active) return;
    const local = this.state.query;
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
        this.queueStamp(STAMP.IMPACT, body.x, body.z, Math.min(0.08, impactSpeed * 0.055), 0.038 + impactSpeed * 0.02);
        this.queueEmitter(local.waterDepth > 0.004 ? 1 : 2, body.x, body.z, this.mobile ? 34 : 82, 1.3);
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

  runScenarioEvents() {
    const scenario = this.state.scenario;
    if (!scenario) return;
    while (scenario.index < scenario.events.length && this.state.elapsed >= scenario.events[scenario.index].at) {
      scenario.events[scenario.index].run();
      scenario.index += 1;
    }
    if (scenario.index >= scenario.events.length) this.state.scenario = null;
  }

  startCauseChain() {
    this.backend.reset(0x5a17c0de);
    this.state.elapsed = 0;
    this.state.accumulator = 0;
    this.state.queryDivider = 0;
    this.state.stamps.length = 0;
    this.state.body.active = false;
    this.state.scenario = {
      index: 0,
      events: [
        {at: 0.05, run: () => {
          for (let index = 0; index < 9; index++) {
            this.queueStamp(STAMP.SAND, 0.31 + index * 0.026, 0.28 + Math.sin(index) * 0.018, 0.036, 0.045);
          }
          this.queueEmitter(2, 0.42, 0.28, this.mobile ? 44 : 110, 1.3);
        }},
        {at: 0.65, run: () => {
          this.queueStamp(STAMP.WATER, 0.28, 0.17, 0.095, 0.075);
          this.queueEmitter(1, 0.28, 0.17, this.mobile ? 64 : 150, 1.5);
        }},
        {at: 1.45, run: () => this.launchStone(0.43, 0.32)},
        {at: 2.4, run: () => {
          this.queueStamp(STAMP.SEED, 0.48, 0.58, 0.12, 0.09);
          this.queueEmitter(3, 0.48, 0.58, this.mobile ? 36 : 90, 1.1);
        }},
        {at: 4.0, run: () => {
          this.queueStamp(STAMP.HEAT, 0.72, 0.48, 0.11, 0.07);
          this.queueEmitter(4, 0.72, 0.48, this.mobile ? 38 : 96, 1.0);
        }},
      ],
    };
    return this.snapshot();
  }

  stepOnce(input = {}) {
    if (!this.backend) return false;
    this.runScenarioEvents();
    this.updateBody(SIM_DT);
    this.updateWalk(SIM_DT, input);

    const queryPosition = this.state.walk.active
      ? this.state.walk
      : (this.state.body.active ? this.state.body : this.state.pointer);
    this.state.queryDivider = (this.state.queryDivider + 1) % 2;
    const query = this.state.queryDivider === 0
      ? {x: queryPosition.x, z: queryPosition.z}
      : null;
    const stamps = this.state.stamps.splice(0, 32);
    const emitter = this.state.emitter;
    this.state.emitter = null;
    this.backend.step({
      dt: SIM_DT,
      stamps,
      emitter,
      environment: this.state.environment,
      query,
    });
    this.state.elapsed += SIM_DT;
    return true;
  }

  advance(realDeltaSeconds, input = {}) {
    if (!this.state.active || this.state.paused || !this.backend) return 0;
    const delta = Math.min(0.1, Math.max(0, Number(realDeltaSeconds) || 0));
    this.state.accumulator = Math.min(0.1, this.state.accumulator + delta * this.state.speed);
    let steps = 0;
    while (this.state.accumulator >= SIM_DT && steps < MAX_STEPS) {
      this.stepOnce(input);
      this.state.accumulator -= SIM_DT;
      steps += 1;
    }
    return steps;
  }

  render(timeSeconds = 0) {
    this.backend?.render?.({
      viewMode: this.state.viewMode,
      time: timeSeconds,
      body: this.state.body,
      cursor: this.state.pointer,
      camera: this.state.camera,
      walk: this.state.walk,
      dayNight: this.state.dayNight,
      temperature: this.state.environment.temperature,
    });
  }

  startRealtime({inputProvider = () => ({}), render = true, requestFrame = globalThis.requestAnimationFrame} = {}) {
    if (this.realtimeHandle) return this.stopRealtime.bind(this);
    if (typeof requestFrame !== 'function') throw new Error('requestAnimationFrame unavailable; use advance() for headless stepping');
    this.enter();
    this.realtimeLast = 0;
    const tick = now => {
      if (!this.realtimeHandle) return;
      const delta = this.realtimeLast ? Math.min(0.1, Math.max(0, (now - this.realtimeLast) / 1000)) : 0;
      this.realtimeLast = now;
      this.advance(delta, inputProvider() || {});
      if (render) this.render(now / 1000);
      this.realtimeHandle = requestFrame(tick);
    };
    this.realtimeHandle = requestFrame(tick);
    return this.stopRealtime.bind(this);
  }

  stopRealtime(cancelFrame = globalThis.cancelAnimationFrame) {
    if (this.realtimeHandle && typeof cancelFrame === 'function') cancelFrame(this.realtimeHandle);
    this.realtimeHandle = null;
    this.realtimeLast = 0;
  }

  snapshot() {
    return {
      active: this.state.active,
      paused: this.state.paused,
      backend: this.backendKind,
      backendLabel: this.backend?.label || this.backendKind,
      tool: this.state.tool,
      radius: this.state.radius,
      viewMode: this.state.viewMode,
      speed: this.state.speed,
      environment: {...this.state.environment},
      query: {...this.state.query},
      body: {...this.state.body},
      pointer: {...this.state.pointer},
      camera: {...this.state.camera},
      walk: {...this.state.walk},
      dayNight: this.state.dayNight,
      elapsed: this.state.elapsed,
      scenarioActive: !!this.state.scenario,
      stamps: this.state.stamps.map(stamp => ({...stamp})),
      emitter: this.state.emitter ? {...this.state.emitter} : null,
    };
  }

  get world() {
    return this.backend?.world || null;
  }
}
