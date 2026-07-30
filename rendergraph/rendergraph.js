/* ============================================================
   SHADED RENDERGRAPH — Phase 1: Fassade + Graph-Runner
   §4 Rendergraph · §7 Ressourcen-Pool · §11 API · §12 Verifikation
   Backend-agnostische Logik; WebGL2-Ausführung als erster Proof.
   ============================================================ */
'use strict';

function resourceUniformName(id) {
  return `u_${String(id).replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/* ---------- §4.1 Pass-Vertrag ---------- */
class Pass {
  constructor(def) {
    if (!def || !def.id) throw new Error('Pass.id ist erforderlich');
    this.id = def.id;
    this.phase = def.phase || 'composite';
    this.inputs = def.inputs || [];
    this.outputs = def.outputs || [];
    this.resolution = def.resolution ?? 1.0;
    this.cadence = def.cadence || 'frame';
    this.hz = def.hz ?? 60;
    this.locality = def.locality || 'fullscreen';
    this.persistence = def.persistence || 'transient';
    this.priority = def.priority ?? 50;
    this.cost = def.cost ?? 1;
    this.fallback = def.fallback || null;
    this.enabledWhen = def.enabledWhen || null;
    this.lawId = def.lawId || null;

    // Runtime
    this.program = null;
    this.enabled = true;
    this.lastTimeMs = 0;       // CPU-Abgabezeit; kein GPU-Timer
    this.lastRunAtMs = -Infinity;
    this.frameCount = 0;
    this.skipCount = 0;
    this.dirty = true;
    this.eventPending = false;
    this.effectiveResolution = this.resolution;
    this._uniforms = new Map();
  }
}

/* ---------- §4.3 Topologische Sortierung + Fusion ---------- */
class GraphCompiler {
  static topoSort(passes) {
    const produces = new Map();
    const byId = new Map();

    for (const p of passes) {
      if (byId.has(p.id)) throw new Error(`Doppelte Pass-ID: ${p.id}`);
      byId.set(p.id, p);
      for (const output of p.outputs) {
        if (produces.has(output)) {
          throw new Error(`Ressource ${output} hat mehrere Producer: ${produces.get(output)} und ${p.id}`);
        }
        produces.set(output, p.id);
      }
    }

    const order = [];
    const visited = new Set();
    const temp = new Set();
    const stack = [];

    function visit(p) {
      if (visited.has(p.id)) return;
      if (temp.has(p.id)) {
        const start = stack.indexOf(p.id);
        const cycle = [...stack.slice(Math.max(0, start)), p.id].join(' → ');
        throw new Error(`Rendergraph-Zyklus: ${cycle}`);
      }

      temp.add(p.id);
      stack.push(p.id);
      for (const input of p.inputs) {
        const producerId = produces.get(input);
        if (producerId && producerId !== p.id) visit(byId.get(producerId));
      }
      stack.pop();
      temp.delete(p.id);
      visited.add(p.id);
      order.push(p.id);
    }

    [...passes].sort((a, b) => b.priority - a.priority).forEach(visit);
    return order;
  }

  static fusionCandidates(passes) {
    const groups = new Map();
    for (const p of passes) {
      const key = `${p.phase}|${p.resolution}|${p.cadence}|${p.hz}|${p.locality}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p.id);
    }
    return [...groups.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ key, passes: ids }));
  }

  static activeThisFrame(passes, nowMs) {
    return passes.filter(p => {
      if (p.cadence === 'frame') return true;
      if (p.cadence === 'fixedHz') {
        const interval = 1000 / Math.max(1, p.hz);
        return nowMs - p.lastRunAtMs + 0.01 >= interval;
      }
      if (p.cadence === 'event') return p.eventPending;
      if (p.cadence === 'onDirty') return p.dirty;
      return true;
    });
  }
}

/* ---------- §7 Ressourcen-Pool ---------- */
class ResourcePool {
  constructor(gl) {
    this.gl = gl;
    this.resources = {};
    this._slotCounter = 0;
  }

  _formatInfo(format) {
    const gl = this.gl;
    if (format === 'rgba16f') {
      if (!gl.getExtension('EXT_color_buffer_float')) {
        throw new Error('rgba16f benötigt EXT_color_buffer_float');
      }
      return { internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT, bytesPerPixel: 8 };
    }
    return { internalFormat: gl.RGBA8, type: gl.UNSIGNED_BYTE, bytesPerPixel: 4 };
  }

  _allocateStorage(resource, width, height) {
    const gl = this.gl;
    const info = this._formatInfo(resource.format);
    resource.width = Math.max(1, Math.round(width));
    resource.height = Math.max(1, Math.round(height));

    gl.bindTexture(gl.TEXTURE_2D, resource.tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, info.internalFormat,
      resource.width, resource.height, 0,
      gl.RGBA, info.type, null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, resource.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resource.tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer für ${resource.id} unvollständig: 0x${status.toString(16)}`);
    }
    resource.bytesPerPixel = info.bytesPerPixel;
  }

  allocate(id, { lifetime = 'transient', width = 256, height = 256, format = 'rgba8' } = {}) {
    if (this.resources[id]) return this.resources[id];
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error(`GPU-Ressource konnte nicht angelegt werden: ${id}`);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const resource = {
      id, lifetime, format, tex, fbo,
      baseWidth: Math.max(1, Math.round(width)),
      baseHeight: Math.max(1, Math.round(height)),
      width: 0, height: 0,
      slot: this._slotCounter++, born: 0, dead: 0, pingpong: false,
      bytesPerPixel: 4
    };
    this.resources[id] = resource;
    this._allocateStorage(resource, resource.baseWidth, resource.baseHeight);
    return resource;
  }

  setBaseSize(id, width, height) {
    const resource = this.resources[id];
    if (!resource) throw new Error(`Unbekannte Ressource: ${id}`);
    resource.baseWidth = Math.max(1, Math.round(width));
    resource.baseHeight = Math.max(1, Math.round(height));
  }

  ensureScale(id, scale = 1) {
    const resource = this.resources[id];
    if (!resource) throw new Error(`Unbekannte Ressource: ${id}`);
    const width = Math.max(1, Math.round(resource.baseWidth * scale));
    const height = Math.max(1, Math.round(resource.baseHeight * scale));
    if (width !== resource.width || height !== resource.height) {
      this._allocateStorage(resource, width, height);
    }
    return resource;
  }

  release(id) {
    const resource = this.resources[id];
    if (!resource) return;
    this.gl.deleteTexture(resource.tex);
    this.gl.deleteFramebuffer(resource.fbo);
    delete this.resources[id];
  }

  get(id) { return this.resources[id]; }

  memoryMB() {
    return Object.values(this.resources).reduce(
      (sum, r) => sum + (r.width * r.height * r.bytesPerPixel) / (1024 * 1024), 0
    );
  }

  inspect() {
    return Object.values(this.resources).map(r => ({
      id: r.id, lifetime: r.lifetime, size: `${r.width}×${r.height}`,
      baseSize: `${r.baseWidth}×${r.baseHeight}`,
      format: r.format, slot: r.slot,
      memoryMB: +(r.width * r.height * r.bytesPerPixel / (1024 * 1024)).toFixed(2)
    }));
  }
}

/* ---------- §5 Scheduler ---------- */
class PassScheduler {
  constructor(passes) { this.passes = passes; }

  evaluate(context) {
    const { frameMs = 16.6, quality = 'high' } = context;
    const qScale = { low: 0.65, medium: 0.82, high: 1.0, auto: 1.0 }[quality] || 1.0;
    const budget = Math.max(0.5, (frameMs / 16.6) * 12.0);
    const states = {};

    for (const p of this.passes) {
      let enabled = p.enabled;
      if (enabled && typeof p.enabledWhen === 'function') {
        enabled = Boolean(p.enabledWhen(context));
      }
      states[p.id] = enabled ? 'FULL' : 'DORMANT';
    }

    const cadenceWeight = p => {
      if (p.cadence === 'fixedHz') return Math.min(1, Math.max(1, p.hz) / 60);
      if (p.cadence === 'event' || p.cadence === 'onDirty') return 0.1;
      return 1;
    };

    const resolutionFor = (p, state) => {
      let scale = p.resolution * qScale;
      if (state === 'VISIBLE') scale *= p.fallback ? 0.5 : 0.75;
      return Math.max(0.125, Math.min(1, scale));
    };

    const cost = () => {
      let total = 0;
      for (const p of this.passes) {
        const state = states[p.id];
        if (state === 'FULL' || state === 'VISIBLE') {
          const scale = resolutionFor(p, state);
          total += p.cost * scale * scale * cadenceWeight(p);
        } else if (state === 'SIMULATING') {
          total += p.cost * 0.05;
        }
      }
      return total;
    };

    const order = [...this.passes].sort((a, b) => a.priority - b.priority);
    let guard = 0;
    while (cost() > budget && guard++ < 100) {
      let degraded = false;
      for (const p of order) {
        if (states[p.id] === 'FULL') {
          states[p.id] = 'VISIBLE';
          degraded = true;
          break;
        }
        if (states[p.id] === 'VISIBLE' && p.fallback) {
          states[p.id] = 'SIMULATING';
          degraded = true;
          break;
        }
      }
      if (!degraded) break;
    }

    for (const p of this.passes) p.effectiveResolution = resolutionFor(p, states[p.id]);
    return states;
  }
}

/* ---------- Rendergraph-Engine ---------- */
class RenderGraph {
  constructor(gl) {
    this.gl = gl;
    this.passes = [];
    this.pool = new ResourcePool(gl);
    this.scheduler = null;
    this.frame = 0;
    this.budget = { frameMs: 16.6, memoryMB: 256 };
    this.quality = 'high';
    this._quadVAO = null;
    this._timings = {};
  }

  registerPass(def) {
    if ((def.outputs || []).length > 1) {
      throw new Error(`Phase 1 unterstützt genau ein Render-Target pro Pass: ${def.id}`);
    }
    const pass = new Pass(def);
    this.passes.push(pass);
    this.scheduler = new PassScheduler(this.passes);
    return pass;
  }

  getPass(id) { return this.passes.find(p => p.id === id); }

  triggerPass(id) {
    const pass = this.getPass(id);
    if (!pass) throw new Error(`Unbekannter Pass: ${id}`);
    pass.eventPending = true;
  }

  markDirty(id) {
    const pass = this.getPass(id);
    if (!pass) throw new Error(`Unbekannter Pass: ${id}`);
    pass.dirty = true;
  }

  compile(context = {}) {
    const order = GraphCompiler.topoSort(this.passes);
    const states = this.scheduler
      ? this.scheduler.evaluate({ ...context, ...this.budget, quality: this.quality })
      : {};
    const fusion = GraphCompiler.fusionCandidates(
      this.passes.filter(p => states[p.id] === 'FULL' || states[p.id] === 'VISIBLE')
    );
    return { order, fusion, states };
  }

  _uniform(pass, name) {
    if (!pass._uniforms.has(name)) {
      pass._uniforms.set(name, this.gl.getUniformLocation(pass.program, name));
    }
    return pass._uniforms.get(name);
  }

  execute(context = {}) {
    const gl = this.gl;
    const nowMs = context.nowMs ?? ((context.time ?? 0) * 1000) ?? performance.now();
    const { order, states } = this.compile(context);
    const renderable = this.passes.filter(p => states[p.id] === 'FULL' || states[p.id] === 'VISIBLE');
    const active = GraphCompiler.activeThisFrame(renderable, nowMs);
    const activeIds = new Set(active.map(p => p.id));
    for (const p of renderable) if (!activeIds.has(p.id)) p.skipCount++;

    const byId = new Map(this.passes.map(p => [p.id, p]));
    const results = [];

    for (const id of order) {
      const p = byId.get(id);
      if (!activeIds.has(id) || !p.program) continue;
      const t0 = performance.now();

      let targetFBO = null;
      let targetW = gl.drawingBufferWidth;
      let targetH = gl.drawingBufferHeight;
      if (p.outputs.length === 1) {
        const output = this.pool.ensureScale(p.outputs[0], p.effectiveResolution);
        targetFBO = output.fbo;
        targetW = output.width;
        targetH = output.height;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
      gl.viewport(0, 0, targetW, targetH);
      gl.useProgram(p.program);

      const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      if (p.inputs.length > maxUnits) {
        throw new Error(`${p.id} benötigt ${p.inputs.length} Texturen, verfügbar sind ${maxUnits}`);
      }

      let unit = 0;
      for (const input of p.inputs) {
        const resource = this.pool.get(input);
        if (!resource) throw new Error(`${p.id} erwartet fehlende Ressource ${input}`);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, resource.tex);
        const location = this._uniform(p, resourceUniformName(input));
        if (location !== null) gl.uniform1i(location, unit);
        unit++;
      }

      const uRes = this._uniform(p, 'u_resolution');
      if (uRes !== null) gl.uniform2f(uRes, targetW, targetH);
      const uTime = this._uniform(p, 'u_time');
      if (uTime !== null) gl.uniform1f(uTime, context.time || 0);
      const uFrame = this._uniform(p, 'u_frame');
      if (uFrame !== null) gl.uniform1f(uFrame, this.frame);

      if (!this._quadVAO) this._initQuad();
      gl.bindVertexArray(this._quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      const elapsed = performance.now() - t0;
      p.lastTimeMs = elapsed;
      p.lastRunAtMs = nowMs;
      p.frameCount++;
      p.dirty = false;
      p.eventPending = false;
      this._timings[p.id] = elapsed;
      results.push({
        id: p.id, state: states[p.id],
        resolution: p.effectiveResolution,
        timeMs: +elapsed.toFixed(3)
      });
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.frame++;
    return results;
  }

  _initQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error('Fullscreen-Dreieck konnte nicht angelegt werden');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this._quadVAO = vao;
  }

  /* ---------- §11 Debug-API ---------- */
  inspect() {
    const { order, fusion, states } = this.compile();
    return {
      frame: this.frame,
      passes: this.passes.map(p => ({
        id: p.id, phase: p.phase, state: states[p.id],
        inputs: p.inputs, outputs: p.outputs,
        resolution: p.resolution,
        effectiveResolution: +p.effectiveResolution.toFixed(3),
        cadence: p.cadence, hz: p.hz,
        priority: p.priority, cost: p.cost, fallback: p.fallback,
        lastTimeMs: +p.lastTimeMs.toFixed(3),
        frameCount: p.frameCount, skipCount: p.skipCount
      })),
      executionOrder: order,
      fusionCandidates: fusion,
      resources: this.pool.inspect(),
      resourceMemoryMB: +this.pool.memoryMB().toFixed(2),
      budget: { ...this.budget },
      quality: this.quality
    };
  }

  setBudget({ frameMs, memoryMB }) {
    if (Number.isFinite(frameMs) && frameMs > 0) this.budget.frameMs = frameMs;
    if (Number.isFinite(memoryMB) && memoryMB > 0) this.budget.memoryMB = memoryMB;
  }

  getPassTimings() { return { ...this._timings }; }
  setQuality(mode) {
    if (!['low', 'medium', 'high', 'auto'].includes(mode)) throw new Error(`Unbekannte Qualität: ${mode}`);
    this.quality = mode;
  }
}

/* ---------- §7.4 Capability-Snapshot ---------- */
function capabilitySnapshot(gl) {
  const ext = name => !!gl.getExtension(name);
  const colorBufferFloat = ext('EXT_color_buffer_float');
  return {
    renderer: gl.getParameter(gl.RENDERER),
    vendor: gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
    glslVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    maxCombinedUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxColorAttachments: gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
    maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    floatRenderable: colorBufferFloat,
    halfFloatRenderable: colorBufferFloat,
    timerQuery: ext('EXT_disjoint_timer_query_webgl2'),
    drawBuffers: true,
    webgl2: true
  };
}

/* ---------- Export ---------- */
if (typeof window !== 'undefined') {
  window.RenderGraph = RenderGraph;
  window.GraphCompiler = GraphCompiler;
  window.ResourcePool = ResourcePool;
  window.PassScheduler = PassScheduler;
  window.capabilitySnapshot = capabilitySnapshot;
  window.resourceUniformName = resourceUniformName;
}
