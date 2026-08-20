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
      engine._frozen = !!freeze;
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
    pointCloud: (opts) => engine?.buildPointCloud?.(opts),
    downloadPointCloud: () => engine?.downloadPointCloud?.(),
    voxel: () => engine?.getVoxelState?.(),
    setDepthImage: (img) => engine?.setDepthImage?.(img),
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
  window.__SHADED_SCRIPT_RUNNING__ = true;

  const boot = async () => {
    const canvas = document.getElementById('gl');
    const overlay = document.getElementById('ov');
    const statusEl = () => document.getElementById('status');
    const setStatus = (t) => { const el = statusEl(); if (el) el.textContent = t; };

    if (canvas) {
      try {
        await initSHADED(canvas);
        console.log('[SHADED] Initialized successfully');
      } catch (err) {
        console.error('[SHADED] Initialization failed:', err);
        setStatus('Initialisierung fehlgeschlagen: ' + err.message);
        return;
      }
    }

    const engine = getEngine();

    // --- File inputs ---
    const wireFile = (sel, isMaterial, okText) => {
      const input = document.querySelector(sel);
      if (!input) return;
      input.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || !engine) return;
        try {
          if (isMaterial) {
            await engine.loadImageFile(file, true);
            setStatus(okText || 'Material-Map geladen');
          } else {
            await engine.loadImageFile(file, false);
            setStatus(okText || 'Szene geladen');
          }
        } catch (err) {
          console.error('[SHADED] load failed:', err);
          setStatus('Laden fehlgeschlagen: ' + err.message);
        }
      });
    };
    wireFile('#f-scene', false, 'Szene geladen');
    wireFile('#f-mat', true, 'Material-Map geladen');

    const depthInput = document.querySelector('#f-depth');
    if (depthInput) {
      depthInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file || !engine) return;
        const img = new Image();
        img.onload = () => { engine.setDepthImage(img); setStatus('Tiefenkarte geladen'); };
        img.src = URL.createObjectURL(file);
      });
    }

    // --- Create button ---
    const createBtn = document.getElementById('btn-create');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        if (!engine) return;
        const ok = engine.erstellen();
        setStatus(ok ? 'Szene bereit' : 'Zuerst ein Bild laden');
      });
    }

    // --- Demo button (no bundled asset in modular build) ---
    const demoBtn = document.getElementById('btn-demo');
    if (demoBtn) demoBtn.addEventListener('click', () => engine && engine.loadDemo());

    // --- Keyboard: player movement (WASD / arrows), space = sprint ---
    // Held keys drive continuous movement via a tick (Playwright does not
    // auto-repeat keydown), so the player actually traverses a path.
    const KEY_MAP = {
      KeyW: [0, -0.01], ArrowUp: [0, -0.01],
      KeyS: [0, 0.01], ArrowDown: [0, 0.01],
      KeyA: [-0.01, 0], ArrowLeft: [-0.01, 0],
      KeyD: [0.01, 0], ArrowRight: [0.01, 0]
    };
    const held = new Set();
    let sprint = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { sprint = true; return; }
      if (KEY_MAP[e.code]) { held.add(e.code); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') sprint = false;
      held.delete(e.code);
    });
    const moveTick = setInterval(() => {
      if (!engine || held.size === 0) return;
      const s = sprint ? 2.2 : 1;
      for (const code of held) {
        const m = KEY_MAP[code];
        if (m) engine.movePlayer(m[0] * s, m[1] * s);
      }
    }, 16);
    window.addEventListener('beforeunload', () => clearInterval(moveTick));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

export default SHADED;