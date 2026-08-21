// SHADED Pipeline Inspector — Debug-ID/Farb-Instrumentierung für die bestehende Pipeline.
//
// Jede Verarbeitungskomponente erhält eine feste Debug-ID und Farbe. Die
// Wirkung (Delta) von Funktionen wird eindeutig beweisbar: Before/After-Pixel
// werden verglichen; nur veränderte Pixel werden als Delta registriert.
//
// Prinzipien:
//   - Jede Stage hat Debug-ID + Farbe (feste Tabelle, nicht zufällig)
//   - Debug-Modus: beeinflusste Pixel/Punkte/Flächen → voll opag, eindeutige Kontrastfarbe
//   - requested vs executed wird getrackt
//   - Stille Fallbacks sind verboten — skip() erfordert explizite reason
//   - Abhängigkeiten bleiben erhalten (kein "Solo ohne Input")
//   - Delta-Beitrag innerhalb der realen Pipeline, nicht isoliert

// ==== 1. Farbrangierung: eindeutige, kontrastreiche Debug-Farben ====

const STAGE_COLORS = [
  [255,  99,  99],  // rot
  [255, 159,  99],  // orange-rot
  [255, 210,  99],  // orange
  [255, 255,  99],  // gelb
  [170, 255,  99],  // gelb-grün
  [ 99, 255, 106],  // grün
  [ 99, 255, 210],  // türkis
  [ 99, 180, 255],  // hellblau
  [ 99, 120, 255],  // blau
  [159,  99, 255],  // lila
  [230,  99, 255],  // magenta
  [255,  99, 230],  // rosa
  [255,  99, 170],  // rubin
  [255,  99, 120],  // karmin
  [255, 100, 160],  // konftakt-rot
  [210, 105,  30],  // bräunlich-orange (für Erde/Natur)
  [120, 210,  75],  // oliv-grün
  [255, 180, 200],  // pastell-pink
  [200, 200, 255],  // perlen-blau
  [255, 230, 200],  // champagner
  [180, 120,  60],  // dunkel-braun
  [230, 200,  80],  // gold
  [100, 200, 255],  // cyan-hell
  [255, 120, 180],  // neon-pink
  [130, 255, 180],  // mint
  [255, 255, 200],  // leicht-gelb
  [160, 100, 255],  // dunkel-lila
  [255, 140, 100],  // coral
  [100, 255, 140],  // leuchtend-grün
  [255, 100, 100],  // hell-rot
  [180,  80,  80],  // dunkel-rot
  [100, 255, 190],  // leuchtend-türkis
];

function colorForIndex(idx) {
  return STAGE_COLORS[idx % STAGE_COLORS.length];
}

function colorToCss(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ==== 2. Pipeline-Stage-Definitionen (ID, Name, Farbe) ====

const PIPELINE_STAGES = [
  // ---- Analyze-Phase (CPU, einmalig bei "✨ Erstellen") ----
  { id: 'analyze.classify',          name: 'Pixel-Klassifizierung',          group: 'analyze' },
  { id: 'analyze.majority',          name: 'Majority-Filter',                group: 'analyze' },
  { id: 'analyze.windows',           name: 'Fensterdetektion (K3/K4)',        group: 'analyze' },
  { id: 'analyze.structure',         name: 'Struktur-Anker (Boden/Dach)',    group: 'analyze' },
  { id: 'analyze.sky',               name: 'Himmel-Regel (K7)',              group: 'analyze' },
  { id: 'analyze.zones',              name: 'Gebäudezonen (K1)',              group: 'analyze' },
  { id: 'analyze.texture_upload',    name: 'Material-Texture Upload',         group: 'analyze' },

  // ---- Intrinsic / Shading ----
  { id: 'intrinsic.decompose',       name: 'Intrinsic-Zerlegung',            group: 'intrinsic' },
  { id: 'intrinsic.dykstra',        name: 'Dykstra-Projektion',             group: 'intrinsic' },
  { id: 'intrinsic.shade_box',       name: 'Shade-Box-Sets',                 group: 'intrinsic' },

  // ---- Render-Phase: tickWorld ----
  { id: 'world.fire',               name: 'Feuer-Simulation',               group: 'tickworld' },
  { id: 'world.eco',                name: 'Ökosystem-Tick',                 group: 'tickworld' },
  { id: 'world.snow',               name: 'Schnee-Tick',                    group: 'tickworld' },
  { id: 'world.rain',               name: 'Regen-Tick',                     group: 'tickworld' },
  { id: 'world.hail',               name: ' Hagel-Tick',                    group: 'tickworld' },
  { id: 'world.trail',              name: 'Spur-Tick (Trail)',              group: 'tickworld' },
  { id: 'world.player',             name: 'Spieler-Tick',                   group: 'tickworld' },

  // ---- Render-Phase: Shader Pass ----
  { id: 'render.uniforms',          name: 'Shader-Uniform-Upload',          group: 'render' },
  { id: 'render.draw_arrays',       name: 'Haupt-Shader-Draw',               group: 'render' },
  { id: 'render.draw_overlay',      name: 'Overlay-Draw',                   group: 'render' },

  // ---- Overlay-Sub-Stages ----
  { id: 'overlay.leaves',           name: 'Herbst-Blätter',                 group: 'overlay' },
  { id: 'overlay.fruits',           name: 'Früchte-Partikel',               group: 'overlay' },
  { id: 'overlay.fires',            name: 'Feuer-Overlay',                  group: 'overlay' },
  { id: 'overlay.smoke',            name: 'Rauch-Overlay',                  group: 'overlay' },
  { id: 'overlay.sparks',           name: 'Funken-Overlay',                 group: 'overlay' },
  { id: 'overlay.breaths',          name: 'Atemwolken',                     group: 'overlay' },
  { id: 'overlay.raindrops',        name: 'Regen-Tropfen',                  group: 'overlay' },
  { id: 'overlay.hailstones',       name: 'Hagel-Körner',                   group: 'overlay' },
  { id: 'overlay.player',           name: 'Spieler-Rendering',              group: 'overlay' },
  { id: 'overlay.actors',           name: 'SWIFT-Actor-Rendering',          group: 'overlay' },

  // ---- Story / Acts ----
  { id: 'story.apply_act',          name: 'Act-Anwendung',                  group: 'story' },
  { id: 'story.tick',               name: 'Storyboard-Tick',                group: 'story' },
];

PIPELINE_STAGES.forEach((s, i) => { s.color = colorForIndex(i); });

// ==== 3. Stage-Registry ====

export class StageRegistry {
  constructor() {
    this.stages = new Map();      // id -> { id, name, group, color, ... }
    this.byOrder = [];            // Array of ids in registration order
    this._colorIdx = 0;

    for (const s of PIPELINE_STAGES) {
      this.register(s);
    }
  }

  register(stage) {
    const id = stage.id;
    if (this.stages.has(id)) return this.stages.get(id);
    const idx = this.byOrder.length;
    const entry = { id, name: stage.name, group: stage.group, color: stage.color, idx };
    this.stages.set(id, entry);
    this.byOrder.push(id);
    return entry;
  }

  has(id) { return this.stages.has(id); }
  get(id) { return this.stages.get(id); }
  colors() { return Array.from(this.stages.values()).map(s => s.color); }
}

// ==== 4. Instrumentation-Tracker ====

export class StageTracker {
  constructor(registry) {
    this.registry = registry;
    this.state = new Map();  // id -> { requested, executed, skipped, fallbackReason, masks }
  }

  // Mark a stage as requested (sollte laufen)
  requested(id) {
    const s = this.registry.get(id);
    if (!s) throw new Error(`unknown stage: ${id}`);
    if (!this.state.has(id)) this.state.set(id, { requested: 0, executed: 0, skipped: 0, masks: [] });
    this.state.get(id).requested++;
    return s;
  }

  // Mark a stage as executed (hat gelaufen), with optional affected mask
  executed(id, mask) {
    const s = this.registry.get(id);
    if (!s) throw new Error(`unknown stage: ${id}`);
    const st = this.state.get(id);
    if (st) {
      st.executed++;
      if (mask) st.masks.push(mask);
    }
    return s;
  }

  // Mark a stage as skipped with explicit reason (stille Fallbacks verboten)
  skip(id, reason) {
    const s = this.registry.get(id);
    if (!s) throw new Error(`unknown stage: ${id}`);
    const st = this.state.get(id);
    if (st) {
      st.skipped++;
      if (reason !== undefined && reason !== null) {
        st.fallbackReason = reason;
      }
    }
    return s;
  }

  // Get status of a stage
  status(id) {
    return this.state.get(id) || null;
  }

  // Check if any stage was skipped without explicit reason
  hasSilentFallbacks() {
    for (const [id, st] of this.state.entries()) {
      if (st.skipped > 0 && !st.fallbackReason) {
        return { id, reason: 'stille Fallback-Instanz ohne Begründung' };
      }
    }
    return null;
  }

  report() {
    const out = [];
    for (const [id, st] of this.state.entries()) {
      const s = this.registry.get(id);
      out.push({
        id, name: s.name, group: s.group, color: s.color,
        requested: st.requested, executed: st.executed, skipped: st.skipped,
        fallbackReason: st.fallbackReason || null,
        maskCount: st.masks.length,
      });
    }
    return out;
  }
}

// ==== 5. Pixel-Differenzierung (Before/After/Delta) ====

export class PixelDelta {
  // Compare two ImageData Uint8ClampedArray regions, return a bitmask of changed pixels.
  static diff(a, b, threshold = 4) {
    if (a.length !== b.length) return null;
    const n = a.length / 4;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = Math.abs(a[i * 4] - b[i * 4]);
      const g = Math.abs(a[i * 4 + 1] - b[i * 4 + 1]);
      const b2 = Math.abs(a[i * 4 + 2] - b[i * 4 + 2]);
      const a2 = Math.abs(a[i * 4 + 3] - b[i * 4 + 3]);
      if (r + g + b2 + a2 > threshold) mask[i] = 1;
    }
    return mask;
  }

  // Apply a unique debug color to all masked pixels in a canvas context.
  static applyDebugColor(ctx, mask, color, width, height) {
    const img = ctx.getImageData(0, 0, width, height);
    const d = img.data;
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        d[i * 4] = color[0];
        d[i * 4 + 1] = color[1];
        d[i * 4 + 2] = color[2];
        d[i * 4 + 3] = 255;  // voll opag
        count++;
      }
    }
    ctx.putImageData(img, 0, 0);
    return count;
  }

  // Count masked pixels in a region
  static count(mask) {
    let n = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
    return n;
  }
}

// ==== 6. Debug-Canvas für Overlay-Darstellung ====

export class DebugOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.enabled = false;
    this.stageVisible = new Set();
  }

  setEnabled(v) { this.enabled = v; }

  showStage(stageId) { this.stageVisible.add(stageId); }
  hideStage(stageId) { this.stageVisible.delete(stageId); }
  toggleStage(stageId) {
    if (this.stageVisible.has(stageId)) this.stageVisible.delete(stageId);
    else this.stageVisible.add(stageId);
  }

  // Render a delta mask with the stage's debug color onto the overlay canvas.
  // Dependencies remain: this does NOT replace the pipeline, only overlays.
  renderDelta(registry, tracker) {
    if (!this.enabled || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const [stageId, st] of tracker.state.entries()) {
      if (!this.stageVisible.has(stageId)) continue;
      const s = registry.get(stageId);
      if (!s || !st.masks) continue;

      for (const mask of st.masks) {
        PixelDelta.applyDebugColor(
          this.ctx, mask, s.color,
          this.canvas.width, this.canvas.height
        );
      }
    }
  }

  // Render Before/After/Delta for a single stage
  renderStageView(stageId, registry, beforeImg, afterImg) {
    if (!this.enabled) return;
    const s = registry.get(stageId);
    if (!s || !beforeImg || !afterImg) return;

    const mask = PixelDelta.diff(beforeImg.data, afterImg.data);
    if (!mask) return;

    // Clear and render: changed pixels in stage color, unchanged in After-farben
    const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const d = img.data;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        d[i * 4] = s.color[0];
        d[i * 4 + 1] = s.color[1];
        d[i * 4 + 2] = s.color[2];
        d[i * 4 + 3] = 255;
      } else {
        d[i * 4] = afterImg.data[i * 4];
        d[i * 4 + 1] = afterImg.data[i * 4 + 1];
        d[i * 4 + 2] = afterImg.data[i * 4 + 2];
        d[i * 4 + 3] = 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

// ==== 7. Function-Wrapper für bestehende Pipeline-Funktionen ====

export class PipelineWrapper {
  constructor(inspector) {
    this.inspector = inspector;
    this._originals = new Map();
  }

  // Wrap a function on an object with stage instrumentation.
  // The wrapper:
  //   1. Marks the stage as requested
  //   2. Captures before-state (if canvas provided)
  //   3. Calls the original function
  //   4. Captures after-state, computes delta, marks executed
  //   5. If the function threw, marks as skipped with error reason
  wrap(obj, methodName, stageId, opts = {}) {
    const original = obj[methodName];
    if (typeof original !== 'function') {
      throw new Error(`Cannot wrap non-function: ${methodName}`);
    }

    const inspector = this.inspector;
    const self = this;

    obj[methodName] = function (...args) {
      const registry = inspector.registry;
      const tracker = inspector.tracker;

      inspector.beginStage(stageId);
      tracker.requested(stageId);

      let before = null;
      if (opts.captureBefore && typeof opts.captureBefore === 'function') {
        before = opts.captureBefore();
      }

      let result;
      let threw = false;
      let errMsg = null;
      try {
        result = original.apply(this, args);
      } catch (err) {
        threw = true;
        errMsg = err instanceof Error ? err.message : String(err);
      }

      if (threw) {
        tracker.skip(stageId, `Exception: ${errMsg}`);
        inspector.endStage();
        throw err;
      }

      // Compute delta if before/after are available
      if (before && typeof opts.captureAfter === 'function') {
        const after = opts.captureAfter();
        const mask = PixelDelta.diff(
          before instanceof Uint8ClampedArray ? before : before.data,
          after instanceof Uint8ClampedArray ? after : after.data,
          opts.threshold
        );
        if (mask) {
          tracker.executed(stageId, mask);
        } else {
          tracker.executed(stageId, null);
        }
      } else {
        tracker.executed(stageId, null);
      }

      inspector.endStage();
      return result;
    };

    this._originals.set({ obj, methodName }, original);
    return obj;
  }

  // Wrap an async function (returns a Promise)
  wrapAsync(obj, methodName, stageId, opts = {}) {
    const original = obj[methodName];
    if (typeof original !== 'function') {
      throw new Error(`Cannot wrap non-function: ${methodName}`);
    }

    const inspector = this.inspector;
    obj[methodName] = async function (...args) {
      const tracker = inspector.tracker;
      inspector.beginStage(stageId);
      tracker.requested(stageId);

      let before = null;
      if (opts.captureBefore && typeof opts.captureBefore === 'function') {
        before = opts.captureBefore();
      }

      let result;
      let threw = false;
      let errMsg = null;
      try {
        result = await original.apply(this, args);
      } catch (err) {
        threw = true;
        errMsg = err instanceof Error ? err.message : String(err);
      }

      if (threw) {
        tracker.skip(stageId, `Exception: ${errMsg}`);
        inspector.endStage();
        throw err;
      }

      if (before && typeof opts.captureAfter === 'function') {
        const after = opts.captureAfter();
        const mask = PixelDelta.diff(
          before instanceof Uint8ClampedArray ? before : before.data,
          after instanceof Uint8ClampedArray ? after : after.data,
          opts.threshold
        );
        if (mask) tracker.executed(stageId, mask);
        else tracker.executed(stageId, null);
      } else {
        tracker.executed(stageId, null);
      }

      inspector.endStage();
      return result;
    };

    this._originals.set({ obj, methodName }, original);
    return obj;
  }

  restore(obj, methodName) {
    for (const [key, orig] of this._originals.entries()) {
      if (key.obj === obj && key.methodName === methodName) {
        obj[methodName] = orig;
        this._originals.delete(key);
        return true;
      }
    }
    return false;
  }
}

// ==== 8. Hauptinspektor-Klasse ====

export class PipelineInspector {
  constructor(opts = {}) {
    this.registry = new StageRegistry();
    this.tracker = new StageTracker(this.registry);
    this.wrapper = new PipelineWrapper(this);
    this.debug = new DebugOverlay(opts.debugCanvas || null);
    this.enabled = opts.enabled || false;
    this.log = opts.log || false;

    // Active stage stack (für Nested-Aufrufe)
    this._activeStack = [];
    this._frameCount = 0;
    this._lastBefore = new Map();  // stageId -> ImageData snapshot
  }

  // Enable/disable debugging
  setEnabled(v) {
    this.enabled = v;
    this.debug.setEnabled(v);
  }

  // Begin a stage (for manual instrumentation in non-wrapped code)
  beginStage(stageId) {
    if (!this.enabled) return;
    if (this.log) console.debug(`[PipelineInspector] → ${stageId}`);
    this._activeStack.push(stageId);
  }

  // End a stage
  endStage() {
    if (!this.enabled) return;
    const stageId = this._activeStack.pop();
    if (this.log) console.debug(`[PipelineInspector] ← ${stageId}`);
    return stageId;
  }

  // Manually mark a stage as requested
  markRequested(stageId) {
    if (!this.enabled) return;
    this.tracker.requested(stageId);
    this.beginStage(stageId);
  }

  // Manually mark a stage as executed with optional affected-pixel mask
  markExecuted(stageId, mask) {
    if (!this.enabled) return;
    this.tracker.executed(stageId, mask);
    this.endStage();
  }

  // Manually skip a stage with explicit reason
  markSkipped(stageId, reason) {
    if (!this.enabled) return;
    this.tracker.skip(stageId, reason);
    this.endStage();
  }

  // Capture canvas state as before-snapshot for delta computation
  captureBefore(stageId, canvas) {
    if (!this.enabled) return null;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this._lastBefore.set(stageId, img);
    return img;
  }

  // Capture canvas state as after-snapshot and compute delta
  captureAfter(stageId, canvas) {
    if (!this.enabled) return null;
    const before = this._lastBefore.get(stageId);
    if (!before) return null;
    const ctx = canvas.getContext('2d');
    const after = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mask = PixelDelta.diff(before.data, after.data);
    this._lastBefore.delete(stageId);
    return { mask, before, after };
  }

  // Render debug overlay showing active stage deltas
  renderDebug() {
    if (!this.enabled) return;
    this.debug.renderDelta(this.registry, this.tracker);
    this._frameCount++;
  }

  // Get a full report
  getReport() {
    return {
      frameCount: this._frameCount,
      enabled: this.enabled,
      stages: this.tracker.report(),
      silentFallbacks: this.tracker.hasSilentFallbacks(),
    };
  }

  // Validate invariants — returns array of violations
  validate() {
    const violations = [];

    // 1. No silent fallbacks
    const sf = this.tracker.hasSilentFallbacks();
    if (sf) {
      violations.push({ type: 'silent_fallback', stage: sf.id, reason: sf.reason });
    }

    // 2. Every requested stage must have been executed or explicitly skipped
    for (const [id, st] of this.tracker.state.entries()) {
      if (st.requested > 0 && st.executed === 0 && st.skipped === 0) {
        violations.push({ type: 'requested_not_executed', stage: id });
      }
    }

    // 3. No stage should execute without being requested
    for (const [id, st] of this.tracker.state.entries()) {
      if (st.executed > 0 && st.requested === 0) {
        violations.push({ type: 'executed_without_request', stage: id });
      }
    }

    return violations;
  }
}

// ==== 9. Singleton für window.SHADED ====

export function createPipelineInspector(opts = {}) {
  return new PipelineInspector(opts);
}

export function attachToShaded(opts = {}) {
  const inspector = createPipelineInspector(opts);
  if (typeof window !== 'undefined') {
    if (!window.SHADED) window.SHADED = {};
    window.SHADED.pipelineInspector = inspector;
    window.SHADED.PipelineInspector = PipelineInspector;
    window.SHADED.PixelDelta = PixelDelta;
  }
  return inspector;
}

// Re-export submodules
// Re-export submodules are already available via `export class` above.
// Use: import { PipelineInspector, StageRegistry, StageTracker, DebugOverlay, PipelineWrapper, PixelDelta, createPipelineInspector, attachToShaded } from './pipeline-inspector.js';
