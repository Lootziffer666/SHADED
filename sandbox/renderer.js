// SHADED Style Discovery Sandbox — dünne WebGL2-Schicht.
//
// Orchestriert drei Draws (Material/G-Buffer → Style → Post) über die
// GLSL-Quellen in sandbox/passes/. Kennt selbst keine Stil-Logik — die steckt
// vollständig in style.glsl.js und wird nur mit Uniform-Werten aus einem
// StyleProfile gefüttert. runtime/style/ bleibt currency; hier passiert nur
// die renderer-spezifische letzte Meile (CLAUDE.md „Ziel statt Format").

import { FULLSCREEN_VERTEX_SRC, GBUFFER_FRAGMENT_SRC, MAX_PRIMS } from './passes/gbuffer.glsl.js';
import { STYLE_FRAGMENT_SRC, POST_FRAGMENT_SRC } from './passes/style.glsl.js';
import { BENCHMARK_PRIMITIVES, SCENE_VERSION, defaultCameraKeyframe } from './benchmark-scene.js';
import { deriveMaterialResponse } from '../runtime/style/material-response.js';
import { createPresetWorldState } from '../runtime/style/world-state.js';
import { substitute } from '../runtime/style/render-budget.js';
import { createTelemetry } from './telemetry.js';

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader-Kompilierfehler: ${info}`);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    throw new Error(`Programm-Linkfehler: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function createFullscreenVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

function createColorTexture(gl, w, h, internalFormat = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createGBuffer(gl, w, h) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const targets = [];
  for (let i = 0; i < 4; i++) {
    const tex = createColorTexture(gl, w, h);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
    targets.push(tex);
  }
  const depthTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`G-Buffer-FBO unvollständig: 0x${status.toString(16)}`);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, targets, depthTex, w, h };
}

function createColorFbo(gl, w, h) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const tex = createColorTexture(gl, w, h);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Style-FBO unvollständig: 0x${status.toString(16)}`);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

function lookAtBasis(eye, target, up) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const forward = norm(sub(target, eye));
  const right = norm(cross(forward, up));
  const camUp = cross(right, forward);
  // Spaltenweise: right, camUp, -forward (mat3 in GLSL ist spaltenmajor).
  return new Float32Array([right[0], right[1], right[2], camUp[0], camUp[1], camUp[2], -forward[0], -forward[1], -forward[2]]);
}

const DIMENSION_UNIFORM_MAP = Object.freeze({
  'lighting.mode': { uniform: 'u_lightingMode', map: { halfLambert: 0, banded: 1, hardCel: 2 } },
  'lighting.rampBands': { uniform: 'u_rampBands' },
  'lighting.rampSoftness': { uniform: 'u_rampSoftness' },
  'specular.mode': { uniform: 'u_specMode', map: { ggx: 0, banded: 1 } },
  'specular.intensity': { uniform: 'u_specIntensity' },
  'rim.mode': { uniform: 'u_rimMode', map: { off: 0, soft: 1, hard: 2 } },
  'rim.width': { uniform: 'u_rimWidth' },
  'rim.hue': { uniform: 'u_rimHue' },
  'normal.mode': { uniform: 'u_normalMode', map: { smooth: 0, curvature: 1, faceted: 2 } },
  'normal.strength': { uniform: 'u_normalStrength' },
  'outline.mode': { uniform: 'u_outlineMode', map: { none: 0, sobel: 1 } },
  'outline.thickness': { uniform: 'u_outlineThickness' },
  'palette.mode': { uniform: 'u_paletteMode', map: { free: 0, gradientMap: 1, posterize: 2, iridescent: 3 } },
  'palette.steps': { uniform: 'u_paletteSteps' },
  'palette.hue': { uniform: 'u_paletteHue' },
  'texture.mode': { uniform: 'u_textureMode', map: { clean: 0, breakup: 1 } },
  'texture.strength': { uniform: 'u_textureStrength' },
});

export function createSandboxRenderer(canvas, { budgetTier = 'FULL' } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 wird von diesem Browser/GPU-Treiber nicht unterstützt.');

  const gbufferProgram = createProgram(gl, FULLSCREEN_VERTEX_SRC, GBUFFER_FRAGMENT_SRC);
  const styleProgram = createProgram(gl, FULLSCREEN_VERTEX_SRC, STYLE_FRAGMENT_SRC);
  const postProgram = createProgram(gl, FULLSCREEN_VERTEX_SRC, POST_FRAGMENT_SRC);
  const vao = createFullscreenVAO(gl);

  const telemetry = createTelemetry();

  let styleProfile = null;
  let budget = { profile: null, budget: { tier: budgetTier, renderScale: 1, raymarchSteps: 64 } };
  let camera = defaultCameraKeyframe();
  let primitives = BENCHMARK_PRIMITIVES.map((p) => ({ ...p }));

  let gbuffer = null;
  let styleTarget = null;
  let canvasCssW = canvas.clientWidth || canvas.width || 640;
  let canvasCssH = canvas.clientHeight || canvas.height || 400;

  function ensureTargets() {
    const scale = budget.budget.renderScale;
    const rw = Math.max(2, Math.round(canvasCssW * scale));
    const rh = Math.max(2, Math.round(canvasCssH * scale));
    if (canvas.width !== canvasCssW) canvas.width = canvasCssW;
    if (canvas.height !== canvasCssH) canvas.height = canvasCssH;
    if (!gbuffer || gbuffer.w !== rw || gbuffer.h !== rh) {
      gbuffer = createGBuffer(gl, rw, rh);
      styleTarget = createColorFbo(gl, rw, rh);
    }
  }

  function setSize(cssW, cssH) {
    canvasCssW = Math.max(2, Math.round(cssW));
    canvasCssH = Math.max(2, Math.round(cssH));
  }

  function DEFAULT_PROFILE_PLACEHOLDER() {
    // Nur für den Fall, dass setBudget() vor setStyleProfile() aufgerufen wird.
    return { lighting: { mode: 'halfLambert', rampBands: 3, rampSoftness: 0.35 }, specular: { mode: 'ggx', intensity: 0.5 }, rim: { mode: 'soft', width: 0.3, hue: 0.6 }, normal: { mode: 'smooth', strength: 0.5 }, outline: { mode: 'none', thickness: 0.3 }, palette: { mode: 'free', steps: 4, hue: 0.5 }, texture: { mode: 'clean', strength: 0.4 }, post: { mode: 'bloomGrain', intensity: 0.4 }, shadow: { warmth: 0 } };
  }

  function setStyleProfile(profile) {
    styleProfile = profile;
    budget = substitute(profile, budget.budget.tier);
    telemetry.setStyleProfileId(profile.id || '');
  }

  function setBudgetTier(tier) {
    if (!styleProfile) styleProfile = DEFAULT_PROFILE_PLACEHOLDER();
    budget = substitute(styleProfile, tier);
    telemetry.setBudgetTier(tier);
  }

  function setCamera(keyframe) { camera = keyframe; }

  // Überschreibt den WorldState ALLER Primitive mit demselben Preset (für
  // "Same-State/All-Styles" / "Same-Style/All-States") — jedes Primitiv
  // behält seinen eigenen MaterialKind, nur der Zustand wird vereinheitlicht.
  function setGlobalWorldStatePreset(presetName, overrides = {}) {
    primitives = BENCHMARK_PRIMITIVES.map((p) => ({ ...p, worldState: createPresetWorldState(p.materialKind, presetName, overrides) }));
  }

  function resetWorldStates() {
    primitives = BENCHMARK_PRIMITIVES.map((p) => ({ ...p }));
  }

  function buildPrimitiveUniforms() {
    const n = primitives.length;
    const type = new Int32Array(MAX_PRIMS);
    const center = new Float32Array(MAX_PRIMS * 3);
    const params = new Float32Array(MAX_PRIMS * 4);
    const baseColor = new Float32Array(MAX_PRIMS * 3);
    const roughness = new Float32Array(MAX_PRIMS);
    const reflectance = new Float32Array(MAX_PRIMS);
    const emission = new Float32Array(MAX_PRIMS);
    const damage = new Float32Array(MAX_PRIMS);
    const wetness = new Float32Array(MAX_PRIMS);
    const charAmt = new Float32Array(MAX_PRIMS);
    const crackAmt = new Float32Array(MAX_PRIMS);
    const frostAmt = new Float32Array(MAX_PRIMS);
    const snowAmt = new Float32Array(MAX_PRIMS);
    const rustAmt = new Float32Array(MAX_PRIMS);
    const heatAmt = new Float32Array(MAX_PRIMS);
    const fireAmt = new Float32Array(MAX_PRIMS);
    const mudAmt = new Float32Array(MAX_PRIMS);

    for (let i = 0; i < n; i++) {
      const p = primitives[i];
      type[i] = p.sdfType;
      center[i * 3] = p.center[0]; center[i * 3 + 1] = p.center[1]; center[i * 3 + 2] = p.center[2];
      params[i * 4] = p.params[0]; params[i * 4 + 1] = p.params[1]; params[i * 4 + 2] = p.params[2]; params[i * 4 + 3] = p.params[3];
      const r = deriveMaterialResponse(p.worldState);
      baseColor[i * 3] = r.baseColor[0]; baseColor[i * 3 + 1] = r.baseColor[1]; baseColor[i * 3 + 2] = r.baseColor[2];
      roughness[i] = r.roughness; reflectance[i] = r.reflectance; emission[i] = r.emission; damage[i] = r.damage;
      wetness[i] = r.wetness; charAmt[i] = r.charAmount; crackAmt[i] = r.crackAmount; frostAmt[i] = r.frostEdge;
      snowAmt[i] = r.snowCap; rustAmt[i] = r.rustAmount; heatAmt[i] = r.heatAmount; fireAmt[i] = r.fireAmount;
      mudAmt[i] = r.muddiness;
    }
    return { n, type, center, params, baseColor, roughness, reflectance, emission, damage, wetness, charAmt, crackAmt, frostAmt, snowAmt, rustAmt, heatAmt, fireAmt, mudAmt };
  }

  function u(gl_, prog, name) { return gl.getUniformLocation(prog, name); }

  function renderFrame(nowMs = performance.now()) {
    telemetry.beginFrame(nowMs);
    if (!styleProfile) styleProfile = DEFAULT_PROFILE_PLACEHOLDER();
    ensureTargets();
    let drawCalls = 0;

    const camBasis = lookAtBasis(camera.eye, camera.target, camera.up);
    const uni = buildPrimitiveUniforms();

    // --- Pass 1: Material/G-Buffer ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, gbuffer.fbo);
    gl.viewport(0, 0, gbuffer.w, gbuffer.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(gbufferProgram);
    gl.bindVertexArray(vao);
    gl.uniform2f(u(gl, gbufferProgram, 'u_resolution'), gbuffer.w, gbuffer.h);
    gl.uniform3fv(u(gl, gbufferProgram, 'u_camPos'), new Float32Array(camera.eye));
    gl.uniformMatrix3fv(u(gl, gbufferProgram, 'u_camBasis'), false, camBasis);
    gl.uniform1f(u(gl, gbufferProgram, 'u_camFov'), 0.62);
    gl.uniform1i(u(gl, gbufferProgram, 'u_maxSteps'), budget.budget.raymarchSteps);
    gl.uniform1i(u(gl, gbufferProgram, 'u_primCount'), uni.n);
    gl.uniform1iv(u(gl, gbufferProgram, 'u_primType'), uni.type);
    gl.uniform3fv(u(gl, gbufferProgram, 'u_primCenter'), uni.center);
    gl.uniform4fv(u(gl, gbufferProgram, 'u_primParams'), uni.params);
    gl.uniform3fv(u(gl, gbufferProgram, 'u_primBaseColor'), uni.baseColor);
    gl.uniform1fv(u(gl, gbufferProgram, 'u_primRoughness'), uni.roughness);
    gl.uniform1fv(u(gl, gbufferProgram, 'u_primReflectance'), uni.reflectance);
    gl.uniform1fv(u(gl, gbufferProgram, 'u_primEmission'), uni.emission);
    gl.uniform1fv(u(gl, gbufferProgram, 'u_primDamage'), uni.damage);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;

    // --- Pass 2: Style ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, styleTarget.fbo);
    gl.viewport(0, 0, styleTarget.w, styleTarget.h);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(styleProgram);
    const p = budget.profile;
    for (let i = 0; i < 4; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, gbuffer.targets[i]);
      gl.uniform1i(u(gl, styleProgram, `uG${i}`), i);
    }
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, gbuffer.depthTex);
    gl.uniform1i(u(gl, styleProgram, 'uDepth'), 4);
    gl.uniform2f(u(gl, styleProgram, 'u_gbufferTexel'), 1 / gbuffer.w, 1 / gbuffer.h);
    gl.uniform3f(u(gl, styleProgram, 'u_lightDir'), 0.45, 0.72, 0.52);
    gl.uniform3f(u(gl, styleProgram, 'u_lightColor'), 1.0, 0.97, 0.9);
    gl.uniform3fv(u(gl, styleProgram, 'u_camPos'), new Float32Array(camera.eye));
    gl.uniform1fv(u(gl, styleProgram, 'u_primWetness'), uni.wetness);
    gl.uniform1fv(u(gl, styleProgram, 'u_primChar'), uni.charAmt);
    gl.uniform1fv(u(gl, styleProgram, 'u_primCrack'), uni.crackAmt);
    gl.uniform1fv(u(gl, styleProgram, 'u_primFrost'), uni.frostAmt);
    gl.uniform1fv(u(gl, styleProgram, 'u_primSnow'), uni.snowAmt);
    gl.uniform1fv(u(gl, styleProgram, 'u_primRust'), uni.rustAmt);
    gl.uniform1fv(u(gl, styleProgram, 'u_primHeat'), uni.heatAmt);
    gl.uniform1fv(u(gl, styleProgram, 'u_primFire'), uni.fireAmt);
    gl.uniform1fv(u(gl, styleProgram, 'u_primMud'), uni.mudAmt);
    for (const [key, spec] of Object.entries(DIMENSION_UNIFORM_MAP)) {
      const [group, field] = key.split('.');
      const raw = p[group][field];
      const val = spec.map ? spec.map[raw] : raw;
      const loc = u(gl, styleProgram, spec.uniform);
      if (spec.map) gl.uniform1i(loc, val); else gl.uniform1f(loc, val);
    }
    gl.uniform1f(u(gl, styleProgram, 'u_shadowWarmth'), p.shadow.warmth);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;

    // --- Pass 3: Post (eigener Draw, siehe Korrektur 2) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(postProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, styleTarget.tex);
    gl.uniform1i(u(gl, postProgram, 'uStyleColor'), 0);
    gl.uniform2f(u(gl, postProgram, 'u_texel'), 1 / styleTarget.w, 1 / styleTarget.h);
    gl.uniform1f(u(gl, postProgram, 'u_time'), nowMs / 1000);
    gl.uniform1i(u(gl, postProgram, 'u_postMode'), p.post.mode === 'halftone' ? 1 : 0);
    gl.uniform1f(u(gl, postProgram, 'u_postIntensity'), p.post.intensity);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;

    gl.bindVertexArray(null);

    telemetry.setRenderSize(gbuffer.w, gbuffer.h);
    telemetry.setPrimitiveCount(uni.n);
    telemetry.setDrawCalls(drawCalls);
    telemetry.setRaymarchSteps(budget.budget.raymarchSteps);
    telemetry.endFrame(performance.now());

    const err = gl.getError();
    if (err !== gl.NO_ERROR) throw new Error(`WebGL-Fehler nach renderFrame: 0x${err.toString(16)}`);
  }

  return {
    gl, sceneVersion: SCENE_VERSION,
    setStyleProfile, setBudgetTier, setCamera, setSize,
    setGlobalWorldStatePreset, resetWorldStates,
    renderFrame,
    getTelemetry: () => telemetry.snapshot(),
    getResolvedBudget: () => budget.budget,
    getCanvas: () => canvas,
  };
}
