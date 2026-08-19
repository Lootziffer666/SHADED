// SHADED Main Entry Point — Replaces monolithic index.html
import { SHADEDEngine } from './render/engine.js';

// Global API compatible with existing window.SHADED contract
let engine = null;

export async function initSHADED(canvas, options = {}) {
  engine = new SHADEDEngine(canvas, options);
  await engine.init?.();
  return engine;
}

export function getEngine() {
  return engine;
}

// Window.SHADED compatible API
export const SHADED = {
  version: '2.0.0',

  async erstellen() {
    return engine?.erstellen() ?? false;
  },

  applyAct(id) {
    return engine?.applyAct(id) ?? false;
  },

  setParams(params) {
    engine?.setParams(params);
  },

  getParams() {
    return engine?.getParams() ?? {};
  },

  setTime(t, freeze) {
    if (engine) {
      engine.time = t;
      // freeze not implemented in new engine yet
    }
  },

  isReady() {
    return engine?.isReady() ?? false;
  },

  getMaterialTypeAt(u, v) {
    return engine?.getMaterialTypeAt(u, v) ?? null;
  },

  story: {
    play: () => engine?.playStory?.(),
    stop: () => engine?.stopStory?.(),
    board: () => engine?.storyboard ?? []
  },

  showcase: {
    start: () => engine?.startShowcase?.(),
    stop: () => engine?.stopShowcase?.(),
    board: () => engine?.showcaseStoryboard ?? []
  },

  elements: {
    trigger: (name) => engine?.triggerElement?.(name),
    clear: () => engine?.clearElements?.()
  },

  worldState: () => engine?.getWorldState?.() ?? {},

  spatial: {
    pointCloud: () => engine?.buildPointCloud?.(),
    downloadPointCloud: () => engine?.downloadPointCloud?.()
  },

  loadDemo: async () => engine?.loadDemo?.(),

  loadImageFile: (file, isMaterial) => engine?.loadImageFile(file, isMaterial),

  player: {
    enable: () => engine?.spawnPlayer?.(),
    pos: () => engine?.player ?? { active: false },
    setAge: (a) => { if (engine?.player) engine.player.age = a; },
    move: (du, dv) => engine?.movePlayer?.(du, dv)
  },

  fire: {
    ignite: (u, v) => engine?.igniteFire?.(u, v),
    list: () => engine?.fires ?? []
  },

  trail: {
    clear: () => engine?.clearTrail?.(),
    sample: (u, v) => engine?.sampleTrail?.(u, v)
  },

  structure: () => engine?.structDiag ?? {},

  zoneAt: (u, v) => engine?.getZoneAt?.(u, v) ?? 0,

  parallax: {
    set: (x, y) => { if (engine) { engine.parallaxTarget.x = x; engine.parallaxTarget.y = y; } },
    get: () => engine?.parallax ?? { x: 0, y: 0 },
    hasDepth: () => engine?.hasDepth ?? false,
    setDepthImage: (img) => engine?.setDepthImage?.(img),
    clearDepth: () => engine?.clearDepth?.()
  },

  addActor: (config) => engine?.addActor?.(config),

  ecosystem: {
    spawn: (type) => engine?.spawnEcosystem?.(type),
    defs: () => engine?.ecosystemDefs ?? []
  },

  lens: {
    set: (n) => { if (engine) engine.lensState = Math.max(0, Math.min(5, n | 0)); },
    get: () => engine?.lensState ?? 0
  },

  sound: {
    emit: (u, v, strength) => engine?.emitSound?.(u, v, strength),
    clear: () => engine?.clearSound?.()
  },

  intrinsic: {
    state: () => engine?.getIntrinsicState?.() ?? {},
    setStrength: (s) => { if (engine) engine.intrinsicStrength = Math.max(0, Math.min(1, +s || 0)); return engine.intrinsicStrength; },
    getStrength: () => engine?.intrinsicStrength ?? 0,
    set: (opt) => engine?.setIntrinsic?.(opt),
    accept: () => engine?.acceptIntrinsic?.(),
    reset: () => engine?.resetIntrinsic?.(),
    clear: () => engine?.clearIntrinsic?.(),
    sample: (u, v) => engine?.sampleIntrinsic?.(u, v) ?? 1
  },

  dialogue: {
    play: (beats) => engine?.playDialogue?.(beats),
    advance: () => engine?.advanceDialogue?.(),
    skip: () => engine?.skipDialogue?.(),
    isPlaying: () => engine?.dialogueIndex >= 0,
    current: () => engine?.getCurrentDialogue?.()
  },

  // New: Spatial Kernel API
  kernel: {
    get: () => engine?.getKernel?.(),
    runRecipe: (name, input) => engine?.runRecipe?.(name, input),
    ingest: (obs) => engine?.ingestObservation?.(obs),
    getSubsystem: (name) => engine?.getSubsystem?.(name),
    snapshot: () => engine?.getKernelSnapshot?.()
  }
};

// Auto-initialize on DOM ready
if (typeof window !== 'undefined') {
  window.SHADED = SHADED;

  document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('gl');
    const overlay = document.getElementById('ov');
    if (canvas) {
      try {
        await initSHADED(canvas);
        console.log('[SHADED] Initialized successfully');
      } catch (err) {
        console.error('[SHADED] Initialization failed:', err);
        document.body.innerHTML = `
          <div style="padding:28px;font:14px/1.6 system-ui;color:#e6e6f0;background:#14141c;height:100vh">
            <b>SHADED Initialization Failed</b><br>
            ${err.message}
          </div>
        `;
      }
    }
  });
}

export default SHADED;