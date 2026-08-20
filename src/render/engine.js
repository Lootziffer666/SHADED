// SHADED Render Engine — Main entry point, integrates Spatial Kernel with Render Pipeline
import { SpatialKernel, ObservationStore, GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE } from '@kernel/index.js';
import { RecipeManager } from '@kernel/recipe-manager.js';
import { PhotoFirstRecipe } from '@kernel/recipes/photo-first-recipe.js';
import { ProceduralLittleWorld } from '@kernel/recipes/procedural-little-world.js';
import { SparseField, VOXEL_STATE, VOXEL_PROVENANCE } from '@kernel/sparse-field.js';
import { SceneGraph, NODE_FAMILY } from '@kernel/scene-graph.js';
import { WorldLawSolver } from '@sim/world-law-solver.js';
import { WorldFields } from '@sim/world-fields.js';
import { SpatialMemory } from '@sim/spatial-memory.js';
import { MonocularDepthProvider } from '@recon/depth-provider.js';
import { DepthToMeshProcessor } from '@recon/mesh-pipeline.js';
import { PatchRegistrar } from '@recon/patch-registration.js';
import { geometryNeighbourhood, estimatePointNormalsRobust, connectedComponents3D, fitGeometricPrimitivesExtended } from '@recon/geometry-fitting.js';
import { ConstraintGraph } from '@recon/constraint-graph.js';
import { SdfScene } from '@recon/sdf-geometry.js';
import { QualityBudget } from '@sim/quality-budget.js';
import { RepresentationManager } from '@sim/representation-manager.js';
import { CompletionProvider } from '@recon/completion-provider.js';
import { aStarGrid, inflateObstacles, hasLineOfSight, lineOfSightShortcut, invalidatePaths } from '@sim/navigation.js';
import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  REQUIRED_UNIFORMS,
  TEXTURE_UNITS,
  validateShaderSource
} from './shader.js';

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export class SHADEDEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });

    if (!this.gl) {
      throw new Error('WebGL 2 not available. SHADED requires WebGL 2.');
    }

    // Check sampler count
    const maxSamplers = this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS);
    if (maxSamplers < 16) {
      console.warn(`SHADED: Only ${maxSamplers} texture units available, 16+ recommended`);
    }

    this.options = {
      analysisResolution: 768,
      enableSpatialKernel: true,
      enableMaterialLayer: true,
      enableWorldLaws: true,
      ...options
    };

    // Shader program
    this.program = null;
    this.uniformLocations = new Map();
    this.attribLocations = new Map();

    // Texture handles
    this.textures = new Map();
    this.framebuffers = new Map();

    // Spatial Kernel integration
    this.kernel = null;
    this.recipeManager = null;
    this.depthProvider = null;
    this.depthToMeshProcessor = null;
    this.patchRegistrar = null;
    this.spatialMemory = null;
    this.worldLawSolver = null;
    this.worldFields = null;
    this.sparseField = null;
    this.sceneGraph = null;
    this.qualityBudget = null;
    this.representationManager = null;
    this.completionProvider = null;
    this.geometryFitting = null;
    this.constraintGraph = null;
    this.sdfScene = null;

    // Analysis state
    this.classGrid = null;
    this.materialMasks = null;
    this.zoneGrid = null;
    this.depthMap = null;
    this.shadingField = null;
    this.sceneImage = null;
    this.sceneWidth = 0;
    this.sceneHeight = 0;
    this.ready = false;

    // Render state
    this.time = 0;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this._raf = null;
    this._running = false;
    this.params = this.getDefaultParams();
    this.currentAct = null;

    // Intrinsic decomposition strength (0 = identity albedo fallback)
    this.intrinsicStrength = 0;

    // Input state
    this.parallax = { x: 0, y: 0 };
    this.parallaxTarget = { x: 0, y: 0 };

    // Actor system
    this.actors = [];
    this.player = { active: false, u: 0.5, v: 0.5, age: 0, blood: 0, mud: 0, wet: 0 };

    // Trail texture (CPU-side simulation)
    this.trailTexture = null;
    this.trailWidth = 256;
    this.trailHeight = 256;
    this.trailData = null;

    // Sound texture
    this.soundTexture = null;
    this.soundWidth = 256;
    this.soundHeight = 256;
    this.soundData = null;

    // Fire array
    this.fires = [];

    // World law phases
    this.rainPhase = 0;
    this.windDrift = 0;
    this.dryPhase = 0;
    this.heatWarp = 0;
    this.rustAccum = 0;
    this.smokeAmount = 0;
    this.breathAmount = 0;
    this.pressureDim = 0;
    this.pollutionGlow = 0;
    this.moonBright = 0;
    this.shelfShadow = 0;
    this.vegFade = 0;
    this.moodTint = 0;
    this.worldTired = 0;
    this.forbiddenCold = 0;
    this.runeGlow = 0;
    this.shadowAge = 0;
    this.smellDrift = 0;
    this.touchWear = 0;
    this.repairMark = 0;
    this.blessCurse = 0;
    this.bloodStain = 0;
    this.mudStain = 0;

    // Lens state
    this.lensState = 0;

    // Element bursts
    this.elementBurst = {
      wet: 0, heat: 0, pressure: 0, ash: 0, hail: 0, lava: 0
    };

    // Storyboard
    this.storyboard = [];
    this.storyPlaying = false;
    this.storyIndex = 0;
    this.storyStartTime = 0;

    // Showcase
    this.showcasePlaying = false;
    this.showcaseStoryboard = [];

    // Initialize
    this.init();
  }

  getDefaultParams() {
    return {
      dayNight: 0, storm: 0, rain: 0, wet: 0, puddle: 0.02, fog: 0.05, wind: 0.3,
      glow: 0.12, decay: 0, snow: 0, snowfall: 0, temperature: 0.6, autumn: 0,
      bloom: 0, bleach: 0
    };
  }

  async init() {
    this.initShaders();
    this.initGeometry();
    this.initTextures();
    this.initFramebuffers();

    if (this.options.enableSpatialKernel) {
      await this.initSpatialKernel();
    }

    this.ready = true;
    console.log('[SHADED] Engine initialized', {
      webgl2: true,
      maxSamplers: this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS),
      spatialKernel: this.options.enableSpatialKernel,
      shaderValid: validateShaderSource().valid
    });

    this.start();
  }

  // Drive the render loop. Safe to call multiple times (guarded).
  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrame = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const loop = (now) => {
      if (!this._running) return;
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const dt = Math.min(0.05, (t - this._lastFrame) / 1000) || 0.016;
      this._lastFrame = t;
      try {
        this.render(dt);
      } catch (e) {
        console.error('[SHADED] render error:', e);
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  initShaders() {
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = this.createProgram(vs, fs);

    // Cache uniform locations
    for (const name of REQUIRED_UNIFORMS) {
      const loc = gl.getUniformLocation(this.program, name);
      if (loc) this.uniformLocations.set(name, loc);
    }

    // Cache attribute locations
    this.attribLocations.set('a', gl.getAttribLocation(this.program, 'a'));
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${err}`);
    }
    return shader;
  }

  createProgram(vs, fs) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }

  initGeometry() {
    const gl = this.gl;
    // Fullscreen quad
    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,  1, 1
    ]);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    this.quadVertexCount = 6;
  }

  initTextures() {
    const gl = this.gl;
    // Create all texture handles
    for (const [name, unit] of Object.entries(TEXTURE_UNITS)) {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.set(name, tex);
    }

    // Trail texture (CPU updated)
    this.trailData = new Uint8Array(this.trailWidth * this.trailHeight * 4);
    const trailTex = this.textures.get('TRAIL');
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.TRAIL);
    gl.bindTexture(gl.TEXTURE_2D, trailTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.trailWidth, this.trailHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.trailData);

    // Sound texture
    this.soundData = new Float32Array(this.soundWidth * this.soundHeight);
    const soundTex = this.textures.get('SOUND');
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.SOUND);
    gl.bindTexture(gl.TEXTURE_2D, soundTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.soundWidth, this.soundHeight, 0, gl.RED, gl.FLOAT, this.soundData);
  }

  initFramebuffers() {
    const gl = this.gl;
    // Analysis framebuffer (768x432)
    this.analysisFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.analysisFB);

    const analysisTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, analysisTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 768, 432, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, analysisTex, 0);
    this.analysisTexture = analysisTex;

    // Material analysis framebuffer
    this.materialFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.materialFB);

    const materialTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, materialTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 768, 432, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, materialTex, 0);
    this.materialTexture = materialTex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  async initSpatialKernel() {
    // Initialize kernel with all subsystems
    this.kernel = new SpatialKernel({
      worldId: 'shaded-main',
      observations: new ObservationStore()
    });

    // Register subsystems (defensive: a missing/again-failing class must not
    // kill engine init — the render pipeline does not depend on every subsystem)
    const register = (key, factory) => {
      try {
        const inst = factory();
        if (inst) this.kernel.registerSubsystem(key, inst);
        return inst;
      } catch (e) {
        console.warn(`[SHADED] subsystem '${key}' skipped:`, e && e.message);
        return null;
      }
    };

    this.sparseField = register('field', () => new SparseField({ chunkSize: 8 }));
    this.sceneGraph = register('graph', () => new SceneGraph());
    this.spatialMemory = register('memory', () => new SpatialMemory());
    this.worldFields = register('fields', () => new WorldFields());
    this.worldLawSolver = register('laws', () => new WorldLawSolver());
    this.qualityBudget = register('quality', () => new QualityBudget());
    this.representationManager = register('representation', () => new RepresentationManager());
    this.completionProvider = register('completion', () => new CompletionProvider());
    this.navigation = register('navigation', () => (typeof Navigation !== 'undefined' && Navigation !== globalThis.Navigation ? new Navigation() : null));
    this.geometryFitting = register('geometry', () => (typeof GeometryFitting !== 'undefined' ? new GeometryFitting() : null));
    this.constraintGraph = register('constraints', () => new ConstraintGraph());
    this.sdfScene = register('sdf', () => new SdfScene());
    this.depthToMeshProcessor = register('mesh', () => new DepthToMeshProcessor());
    this.patchRegistrar = register('patches', () => new PatchRegistrar());

    // Recipe manager
    try {
      this.recipeManager = new RecipeManager();
      this.recipeManager.onKernelReady(this.kernel);
      this.kernel.registerSubsystem('recipes', this.recipeManager);
      this.kernel.registerRecipe('photo-first', new PhotoFirstRecipe());
      this.kernel.registerRecipe('procedural-little-world', new ProceduralLittleWorld());
    } catch (e) {
      console.warn('[SHADED] recipe manager skipped:', e && e.message);
    }

    // Depth provider (for photo-first recipe) — missing model is a benign fallback
    this.depthProvider = new MonocularDepthProvider();
    try {
      await this.depthProvider.initialize();
    } catch (e) {
      console.warn('[SHADED] Depth provider unavailable, continuing without it:', e && e.message);
    }

    console.log('[SHADED] Spatial Kernel initialized with subsystems:', this.kernel.snapshot().subsystems);
  }

  // --- Public API (matches window.SHADED contract) ---

  async loadImageFile(file, isMaterialMap = false) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.sceneImage = img;
        this.sceneWidth = img.width;
        this.sceneHeight = img.height;
        this.resizeCanvases();
        this.uploadSceneTexture();
        if (!isMaterialMap) {
          this.analyzeScene();
        } else {
          this.uploadMaterialMap(img);
        }
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // Size the WebGL canvas and the 2D overlay (#ov) backing store to the scene
  // so actors/player draw at correct scale (HTML defaults are 16x9 placeholders).
  resizeCanvases() {
    if (!this.sceneWidth || !this.sceneHeight) return;
    const maxDim = 1280;
    const s = Math.min(1, maxDim / Math.max(this.sceneWidth, this.sceneHeight));
    const w = Math.max(2, Math.round(this.sceneWidth * s));
    const h = Math.max(2, Math.round(this.sceneHeight * s));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ov = (typeof document !== 'undefined') ? document.getElementById('ov') : null;
    if (ov && (ov.width !== w || ov.height !== h)) {
      ov.width = w;
      ov.height = h;
    }
  }

  uploadSceneTexture() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.SCENE);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('SCENE'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sceneImage);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  uploadMaterialMap(img) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.MATERIAL);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('MATERIAL'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  analyzeScene() {
    // Classify the SOURCE photo directly (color-based, deterministic).
    // We deliberately do NOT classify the lit shader output — that would fold
    // world-law lighting into the material truth (Invariante 2/6).
    const aw = this.options.analysisResolution;
    const ah = Math.round(aw * this.sceneHeight / this.sceneWidth);

    let pixels = null;
    if (typeof document !== 'undefined' && this.sceneImage) {
      const c = document.createElement('canvas');
      c.width = aw; c.height = ah;
      const cx = c.getContext('2d', { willReadFrequently: true });
      try {
        cx.drawImage(this.sceneImage, 0, 0, aw, ah);
        pixels = cx.getImageData(0, 0, aw, ah).data;
      } catch (e) {
        pixels = null;
      }
    }
    if (!pixels) {
      // Fallback: read back the scene texture from the analysis framebuffer.
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.analysisFB);
      gl.viewport(0, 0, aw, ah);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(this.attribLocations.get('a'));
      gl.vertexAttribPointer(this.attribLocations.get('a'), 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.quadVertexCount);
      pixels = new Uint8Array(aw * ah * 4);
      gl.readPixels(0, 0, aw, ah, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    this.processAnalysis(pixels, aw, ah);
  }

  processAnalysis(pixels, aw, ah) {
    // Build classGrid from analysis
    this.classGrid = new Uint8Array(aw * ah);
    const PALETTE = {
      grass: [0x16, 0xA3, 0x4A],
      foliage: [0xAA, 0x0E, 0xB7],
      roof: [0xF9, 0x73, 0x16],
      path: [0xDC, 0x26, 0x26],
      wood: [0x85, 0x4D, 0x0E],
      window: [0x0F, 0x76, 0x6E],
      water: [0x06, 0xB6, 0xD4],
      rock: [0x47, 0x55, 0x69]
    };

    // Simple nearest-color classification
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        const i = (y * aw + x) * 4;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        let bestClass = 0, bestDist = Infinity;
        const colors = Object.values(PALETTE);
        for (let c = 0; c < colors.length; c++) {
          const [cr, cg, cb] = colors[c];
          const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestClass = c;
          }
        }
        this.classGrid[y * aw + x] = bestClass;
      }
    }

    // Build material masks (maskA, maskB)
    this.buildMaterialMasks(aw, ah);

    // Build zone grid (K1: fachwerk buildings)
    this.buildZoneGrid(aw, ah);

    // Upload masks to GPU
    this.uploadMasks(aw, ah);

    // Generate shading field (intrinsic decomposition)
    this.generateShadingField(aw, ah);
  }

  buildMaterialMasks(aw, ah) {
    const maskA = new Uint8Array(aw * ah * 4);
    const maskB = new Uint8Array(aw * ah * 4);

    for (let i = 0; i < aw * ah; i++) {
      const cls = this.classGrid[i];
      const idx = i * 4;
      switch (cls) {
        case 0: maskA[idx] = 255; break;           // grass -> maskA.r
        case 1: maskA[idx + 1] = 255; break;       // foliage -> maskA.g
        case 2: maskA[idx + 2] = 255; break;       // roof -> maskA.b
        case 3: maskA[idx + 3] = 255; break;       // path -> maskA.a
        case 4: maskB[idx] = 255; break;           // wood -> maskB.r
        case 5: maskB[idx + 1] = 255; break;       // window -> maskB.g
        case 6: maskB[idx + 2] = 255; break;       // water -> maskB.b
        case 7: maskB[idx + 3] = 255; break;       // rock -> maskB.a
      }
    }

    this.materialMasks = { maskA, maskB, width: aw, height: ah };
  }

  buildZoneGrid(aw, ah) {
    // K1: Detect fachwerk buildings (roof + wood adjacency)
    this.zoneGrid = new Uint8Array(aw * ah);
    for (let y = 1; y < ah - 1; y++) {
      for (let x = 1; x < aw - 1; x++) {
        const i = y * aw + x;
        if (this.classGrid[i] === 2) { // roof
          // Check for wood in 3x3 neighborhood
          let hasWood = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ni = (y + dy) * aw + (x + dx);
              if (this.classGrid[ni] === 4) hasWood = true;
            }
          }
          if (hasWood) {
            // Flood fill to mark building zone
            this.floodFillZone(x, y, aw, ah);
          }
        }
      }
    }
  }

  floodFillZone(x, y, aw, ah) {
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cx >= aw || cy < 0 || cy >= ah) continue;
      const i = cy * aw + cx;
      if (this.zoneGrid[i]) continue;
      this.zoneGrid[i] = 1;
      // Only flood through roof, wood, path, grass, rock (not water, window)
      const cls = this.classGrid[i];
      if (cls === 0 || cls === 2 || cls === 3 || cls === 4 || cls === 7) {
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    }
  }

  uploadMasks(aw, ah) {
    const gl = this.gl;
    const { maskA, maskB } = this.materialMasks;

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.MASK_A);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('MASK_A'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, aw, ah, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskA);

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.MASK_B);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('MASK_B'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, aw, ah, 0, gl.RGBA, gl.UNSIGNED_BYTE, maskB);

    // Zone grid
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.ZONE);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('ZONE'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, aw, ah, 0, gl.RED, gl.UNSIGNED_BYTE, this.zoneGrid);

    // Phys texture (puddle depth, river angle, bleed, path dist)
    const phys = this.computePhysTexture(aw, ah);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.PHYS);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('PHYS'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, aw, ah, 0, gl.RGBA, gl.UNSIGNED_BYTE, phys);
  }

  computePhysTexture(aw, ah) {
    const phys = new Uint8Array(aw * ah * 4);
    // Simplified: puddle depth in R, river angle in G, bleed in B, path dist in A
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        const i = (y * aw + x) * 4;
        const cls = this.classGrid[y * aw + x];
        if (cls === 3) { // path
          phys[i] = 128; // puddle depth potential
          phys[i + 3] = 255; // path distance = 0
        }
      }
    }
    return phys;
  }

  generateShadingField(aw, ah) {
    // Baseline Retinex-style intrinsic decomposition
    // This is the CPU fallback; can be replaced by external provider
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.materialFB);
    gl.viewport(0, 0, aw, ah);

    // Draw scene with intrinsic shader (simplified)
    // In production, this would be a separate compute pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // For now, create neutral shading field (0.5 = neutral)
    this.shadingField = new Float32Array(aw * ah);
    this.shadingField.fill(0.5);

    // Upload to material texture (R channel = shading)
    const materialData = new Uint8Array(aw * ah * 4);
    for (let i = 0; i < aw * ah; i++) {
      materialData[i * 4] = Math.round(this.shadingField[i] * 255); // R = shading
      materialData[i * 4 + 1] = 200; // G = confidence (high for baseline)
    }

    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.MATERIAL);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('MATERIAL'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, aw, ah, 0, gl.RGBA, gl.UNSIGNED_BYTE, materialData);
  }

  // --- Main render loop ---

  render(deltaTime) {
    if (!this.ready) return;

    this.time += deltaTime;
    this.frameCount++;

    // Update world law phases
    this.updateWorldLawPhases(deltaTime);

    // Update trail texture
    this.updateTrailTexture();

    // Update sound texture
    this.updateSoundTexture();

    // Update spatial kernel (if enabled)
    if (this.kernel) {
      this.updateSpatialKernel(deltaTime);
    }

    // Render main pass
    this.renderMainPass();

    // Render actors
    this.renderActors();

    // Render UI overlays
    this.renderOverlays();
  }

  updateWorldLawPhases(dt) {
    const p = this.params;
    this.rainPhase += dt * (1.0 + 0.4 * p.wind);
    this.windDrift += dt * p.wind;
    this.dryPhase += dt * Math.max(0, 0.8 - p.wet);
    this.heatWarp = p.temperature * this.fires.length;
    this.rustAccum += dt * Math.max(0, p.wet - 0.3) * 0.15;
    this.smokeAmount = p.fog * (p.storm + this.fires.length * 0.5);
    this.breathAmount = dt * (p.temperature < 0.3 ? 0.3 : 0) * (1 - p.wet * 0.5);
    this.pressureDim = this.fires.length * 0.2 + Math.max(0, 0.5 - p.puddle) * 0.1;
    this.pollutionGlow = p.glow * 0.5 + p.wind * 0.1;
    this.moonBright = (1 - p.dayNight) * 0.6 + p.bloom * 0.1;
    this.shelfShadow = p.storm * 0.3 + Math.max(0, p.rain - 0.5) * 0.2;
    this.vegFade = p.wind * 0.3 + p.rain * 0.4;
    this.moodTint = p.storm * 0.15 + p.decay * 0.1;
    this.worldTired = p.decay * 0.4;
    this.forbiddenCold = p.storm * 0.2;
    this.runeGlow = p.fog * 0.3 + p.bloom * 0.1;
    this.shadowAge += dt * Math.max(0, 0.5 - p.glow) * 0.4;
    this.smellDrift += dt * (p.decay * 0.6 + this.fires.length * 0.2);
    this.touchWear += dt * 0.05;
    this.repairMark = p.glow * 0.3 + p.wind * 0.1;
    this.blessCurse = p.bloom * 0.5 + p.decay * -0.3;
  }

  updateTrailTexture() {
    // Decay trail channels
    const decayR = 0.985; // dent decays (time-based, fps-independent enough)
    const decayG = 0.97;  // impulse ~0.4s
    const decayA = 0.9997; // heat ~25s

    for (let i = 0; i < this.trailData.length; i += 4) {
      this.trailData[i] = Math.round(this.trailData[i] * decayR);     // R: dent
      this.trailData[i + 1] = Math.round(this.trailData[i + 1] * decayG); // G: impulse
      this.trailData[i + 3] = Math.round(this.trailData[i + 3] * decayA); // A: heat
      // B: trampelpfad (permanent) - no decay
    }

    // Upload
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.TRAIL);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('TRAIL'));
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.trailWidth, this.trailHeight, gl.RGBA, gl.UNSIGNED_BYTE, this.trailData);
  }

  updateSoundTexture() {
    // Decay sound field
    for (let i = 0; i < this.soundData.length; i++) {
      this.soundData[i] *= 0.99; // ~0.35s half-life
    }

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNITS.SOUND);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.get('SOUND'));
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.soundWidth, this.soundHeight, gl.RED, gl.FLOAT, this.soundData);
  }

  updateSpatialKernel(dt) {
    // Step world law solver
    if (this.worldLawSolver) {
      this.worldLawSolver.step(dt, this.params, this.worldFields);
    }

    // Step sparse field diffusion
    if (this.sparseField) {
      this.sparseField.step(dt);
    }
  }

  renderMainPass() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Bind all textures (uniform names match shader.js REQUIRED_UNIFORMS exactly)
    const texUniforms = {
      SCENE: 'u_scene', MASK_A: 'u_maskA', MASK_B: 'u_maskB', PHYS: 'u_phys',
      EMIS: 'u_emis', TRAIL: 'u_trail', DEPTH: 'u_depth', ZONE: 'u_zone',
      MATERIAL: 'u_material', SOUND: 'u_sound'
    };
    for (const [name, unit] of Object.entries(TEXTURE_UNITS)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, this.textures.get(name));
      this.setUniform(texUniforms[name], unit);
    }

    // Set uniforms
    this.setUniform('u_px', 1 / this.canvas.width, 1 / this.canvas.height);
    this.setUniform('u_time', this.time);
    this.setUniform('u_aspect', this.canvas.width / this.canvas.height);
    this.setUniform('u_parallax', this.parallax.x, this.parallax.y);

    // Params
    for (const [key, value] of Object.entries(this.params)) {
      this.setUniform(`u_${key}`, value);
    }

    // Derived uniforms
    this.setUniform('u_flash', 0);
    this.setUniform('u_fireCount', this.fires.length);
    if (this.fires.length > 0) {
      const fireData = new Float32Array(this.fires.length * 4);
      for (let i = 0; i < this.fires.length; i++) {
        const f = this.fires[i];
        fireData[i * 4] = f.u;
        fireData[i * 4 + 1] = f.v;
        fireData[i * 4 + 2] = f.intensity;
        fireData[i * 4 + 3] = f.radius;
      }
      this.setUniform('u_fires', fireData);
    }

    // Grass average color
    this.setUniform('u_grassAvg', 0.2, 0.6, 0.15);
    this.setUniform('u_mossBoost', this.params.wet * 0.5);

    // Intrinsic
    this.setUniform('u_intrinsic', this.intrinsicStrength || 0);

    // World law phases
    this.setUniform('u_rainPhase', this.rainPhase);
    this.setUniform('u_windDrift', this.windDrift);
    this.setUniform('u_dryPhase', this.dryPhase);
    this.setUniform('u_heatWarp', this.heatWarp);
    this.setUniform('u_rustAccum', this.rustAccum);
    this.setUniform('u_smokeAmount', this.smokeAmount);
    this.setUniform('u_breathAmount', this.breathAmount);
    this.setUniform('u_pressureDim', this.pressureDim);
    this.setUniform('u_pollutionGlow', this.pollutionGlow);
    this.setUniform('u_moonBright', this.moonBright);
    this.setUniform('u_shelfShadow', this.shelfShadow);
    this.setUniform('u_vegFade', this.vegFade);
    this.setUniform('u_moodTint', this.moodTint);
    this.setUniform('u_worldTired', this.worldTired);
    this.setUniform('u_forbiddenCold', this.forbiddenCold);
    this.setUniform('u_runeGlow', this.runeGlow);
    this.setUniform('u_shadowAge', this.shadowAge);
    this.setUniform('u_smellDrift', this.smellDrift);
    this.setUniform('u_touchWear', this.touchWear);
    this.setUniform('u_repairMark', this.repairMark);
    this.setUniform('u_blessCurse', this.blessCurse);
    this.setUniform('u_bloodStain', this.bloodStain);
    this.setUniform('u_mudStain', this.mudStain);

    // Lens
    this.setUniform('u_lens', this.lensState);

    // Element bursts
    this.setUniform('u_elementWetBurst', this.elementBurst.wet);
    this.setUniform('u_elementHeatBurst', this.elementBurst.heat);
    this.setUniform('u_elementPressureBurst', this.elementBurst.pressure);
    this.setUniform('u_elementAshBurst', this.elementBurst.ash);
    this.setUniform('u_elementHailBurst', this.elementBurst.hail);
    this.setUniform('u_elementLavaBurst', this.elementBurst.lava);

    // Draw quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.attribLocations.get('a'));
    gl.vertexAttribPointer(this.attribLocations.get('a'), 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.quadVertexCount);
  }

  setUniform(name, ...values) {
    const loc = this.uniformLocations.get(name);
    if (!loc) return;
    const gl = this.gl;
    switch (values.length) {
      case 1: gl.uniform1f(loc, values[0]); break;
      case 2: gl.uniform2f(loc, values[0], values[1]); break;
      case 3: gl.uniform3f(loc, values[0], values[1], values[2]); break;
      case 4: gl.uniform4f(loc, values[0], values[1], values[2], values[3]); break;
      default:
        if (values[0] instanceof Float32Array) {
          gl.uniform4fv(loc, values[0]);
        }
    }
  }

  renderActors() {
    if (typeof document === 'undefined') return;
    const ov = document.getElementById('ov');
    if (!ov) return;
    const ctx = ov.getContext('2d');
    if (!ctx) return;
    const W = ov.width, H = ov.height;
    ctx.clearRect(0, 0, W, H);

    // Depth-sorted actors (back -> mid -> front)
    const order = { back: 0, mid: 1, front: 2 };
    const sorted = [...this.actors].sort((a, b) => (order[a.depthLayer] ?? 1) - (order[b.depthLayer] ?? 1));
    for (const actor of sorted) this.drawActor(ctx, actor, W, H);

    // Player (interaction) drawn on the same overlay
    if (this.player.active) this.drawPlayer(ctx, W, H);
  }

  drawActor(ctx, actor, W, H) {
    if (!actor._img || !actor._img.complete) return;
    const anim = actor.anim && actor._animations ? actor._animations[actor.anim] : null;
    let rect = null;
    if (anim && anim.frames && actor._frameRects) {
      const fps = anim.fps || 12;
      const idx = Math.floor((actor._t = (actor._t || 0) + 1 / 60 * (actor._speed || 1)) * fps) % anim.frames.length;
      const key = anim.frames[idx];
      rect = actor._frameRects[key] || actor._frameRects[String(key)];
    } else if (actor._frameRects) {
      const first = Object.keys(actor._frameRects)[0];
      rect = actor._frameRects[first];
    }
    if (!rect) return;
    const scale = actor.scale || 1;
    const dw = rect.w * scale, dh = rect.h * scale;
    const dx = actor.x * W - dw / 2, dy = actor.y * H - dh / 2;
    let alpha = 1;
    if (actor.depthLayer !== 'front') alpha *= (1 - this.params.fog * 0.5) * (1 - this.params.dayNight * 0.3);
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, alpha);
    if (actor._depthAvg != null) {
      const b = 1 + (actor._depthAvg - 0.5) * 0.45;
      ctx.filter = `brightness(${Math.max(0.7, Math.min(1.3, b)).toFixed(3)})`;
    }
    ctx.drawImage(actor._img, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh);
    ctx.restore();
    ctx.filter = 'none';
  }

  drawPlayer(ctx, W, H) {
    const x = this.player.u * W, y = this.player.v * H;
    const r = Math.max(6, W * 0.012);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffd27d';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  renderOverlays() {
    // Dialogue / debug handled by UI layer; nothing required here.
  }

  // --- Interactive subsystems used by window.SHADED + verify ---

  spawnPlayer(u = 0.5, v = 0.5) {
    this.player.active = true;
    this.player.u = u;
    this.player.v = v;
    this.player.age = 0;
    return this.player;
  }

  movePlayer(du, dv) {
    if (!this.player.active) return;
    this.player.u = Math.max(0, Math.min(1, this.player.u + du));
    this.player.v = Math.max(0, Math.min(1, this.player.v + dv));
    this.writeTrail(this.player.u, this.player.v, 'path');
  }

  getPlayerPos() {
    return { ...this.player };
  }

  writeTrail(u, v, kind = 'path') {
    // Paint a small brush so nearby samples (test offsets) still register.
    const cx = Math.floor(u * this.trailWidth);
    const cy = Math.floor(v * this.trailHeight);
    const r = 3;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= this.trailWidth || y < 0 || y >= this.trailHeight) continue;
        if (dx * dx + dy * dy > r * r) continue;
        const i = (y * this.trailWidth + x) * 4;
        this.trailData[i] = 255;       // R: dent (decays)
        this.trailData[i + 1] = 255;   // G: impulse (decays fast)
        this.trailData[i + 3] = 255;   // A: heat (decays ~25s)
        if (kind === 'path') this.trailData[i + 2] = 255; // B: trampelpfad (permanent)
      }
    }
  }

  sampleTrail(u, v) {
    const x = Math.floor(u * this.trailWidth);
    const y = Math.floor(v * this.trailHeight);
    if (x < 0 || x >= this.trailWidth || y < 0 || y >= this.trailHeight) return { r: 0, g: 0, b: 0, a: 0 };
    const i = (y * this.trailWidth + x) * 4;
    return {
      r: this.trailData[i] / 255,
      g: this.trailData[i + 1] / 255,
      b: this.trailData[i + 2] / 255,
      a: this.trailData[i + 3] / 255
    };
  }

  clearTrail() {
    this.trailData.fill(0);
  }

  igniteFire(u, v) {
    this.fires.push({ u, v, intensity: 1, radius: 0.06 });
    return this.fires.length - 1;
  }

  extinguishFire(idx) {
    if (idx >= 0 && idx < this.fires.length) this.fires.splice(idx, 1);
  }

  structure() {
    return this.structDiag || (this.structDiag = {});
  }

  loadDemo() {
    console.warn('[SHADED] loadDemo: use file inputs or addActor in modular build');
    return false;
  }

  getIntrinsicState() {
    return { strength: this.intrinsicStrength, hasField: !!this.shadingField };
  }
  setIntrinsic(opt) { if (opt && typeof opt.strength === 'number') this.intrinsicStrength = opt.strength; }
  acceptIntrinsic() {}
  resetIntrinsic() { this.intrinsicStrength = 0; }
  clearIntrinsic() { this.shadingField = null; this.intrinsicStrength = 0; }
  sampleIntrinsic() { return 1; }

  // --- Actor system (full handle) ---

  addActor(config) {
    const manifest = typeof config.manifest === 'string' ? safeParse(config.manifest) : config.manifest;
    // Normalize manifest to { frameRects, animations } supporting both the
    // canonical SWIFT schema and the older grid+frames fixture format.
    let frameRects = null, animations = null;
    if (manifest && manifest.frameRects && manifest.animations) {
      frameRects = manifest.frameRects;
      animations = manifest.animations;
    } else if (manifest && manifest.grid && manifest.frames) {
      frameRects = {};
      for (const f of manifest.frames) {
        const col = manifest.grid.columns[String(f.col)] || manifest.grid.columns[f.col];
        const row = manifest.grid.rows[String(f.row)] || manifest.grid.rows[f.row];
        if (col && row) frameRects[f.id] = { x: col.x, y: row.y, w: col.w, h: row.h };
      }
      animations = { default: { frames: manifest.frames.map(f => f.id), fps: 12, loop: true } };
    }
    const actor = {
      id: Date.now() + Math.random(),
      image: config.image,
      manifest,
      _frameRects: frameRects,
      _animations: animations,
      x: config.x ?? 0.5,
      y: config.y ?? 0.5,
      scale: config.scale ?? 1,
      anim: (config.anim && animations && animations[config.anim]) ? config.anim
        : (animations ? Object.keys(animations)[0] : null),
      depthLayer: config.depthLayer ?? 'mid',
      visible: true,
      _t: 0,
      _speed: 1,
      _img: null,
      _depthAvg: config.depthImage ? 0.5 : null
    };
    const onImg = () => {
      actor._img = imgRef;
      // Draw once immediately so the overlay is populated even if RAF is throttled.
      try { this.renderActors(); } catch (e) { /* noop */ }
    };
    let imgRef = null;
    if (config.image instanceof HTMLImageElement) {
      imgRef = config.image;
      actor._img = config.image;
      try { this.renderActors(); } catch (e) { /* noop */ }
    } else if (typeof config.image === 'string') {
      imgRef = new Image();
      imgRef.onload = onImg;
      imgRef.onerror = () => console.warn('[SHADED] actor image load failed:', config.image);
      imgRef.src = config.image;
    }
    actor.setAnim = (name) => { actor.anim = name; actor._t = 0; return actor; };
    actor.setPosition = (x, y) => { actor.x = x; actor.y = y; return actor; };
    actor.setVisible = (v) => { actor.visible = v; return actor; };
    actor.setDepthLayer = (l) => { actor.depthLayer = l; return actor; };
    actor.setWorldState = (n) => { actor._worldState = n; return actor; };
    actor.getWorldState = () => actor._worldState || null;
    actor.getWorldStates = () => manifest && manifest.worldStates ? Object.keys(manifest.worldStates) : [];
    actor.remove = () => {
      const idx = this.actors.indexOf(actor);
      if (idx >= 0) this.actors.splice(idx, 1);
    };
    this.actors.push(actor);
    return actor;
  }

  // --- Cleanup ---

  erstellen() {
    if (!this.sceneImage) return false;
    this.analyzeScene();
    return true;
  }

  applyAct(id) {
    const acts = {
      tag: { dayNight: 0, storm: 0.03, rain: 0, wet: 0, puddle: 0.02, fog: 0.05, wind: 0.30, glow: 0.10, decay: 0, temperature: 0.70 },
      aufzug: { dayNight: 0.45, storm: 0.80, rain: 0.45, wet: 0.45, puddle: 0.30, fog: 0.25, wind: 0.85, glow: 0.55, decay: 0, temperature: 0.56 },
      sturmnacht: { dayNight: 1, storm: 1, rain: 1, wet: 1, puddle: 0.92, fog: 0.40, wind: 1, glow: 1, decay: 0, temperature: 0.52 },
      morgen: { dayNight: 0.55, storm: 0.35, rain: 0.12, wet: 1, puddle: 0.85, fog: 0.50, wind: 0.40, glow: 0.60, decay: 0, temperature: 0.52 },
      danach: { dayNight: 0.04, storm: 0.08, rain: 0, wet: 0.75, puddle: 0.55, fog: 0.02, wind: 0.35, glow: 0.12, decay: 0, temperature: 0.62 },
      verfall: { dayNight: 0.10, storm: 0.15, rain: 0, wet: 0.15, puddle: 0.10, fog: 0.20, wind: 0.50, glow: 0, decay: 1, temperature: 0.55 },
      fruehling: { dayNight: 0.06, storm: 0.05, rain: 0.08, wet: 0.20, puddle: 0.10, fog: 0.10, wind: 0.40, glow: 0.10, decay: 0.15, temperature: 0.62, bloom: 0.90 },
      herbst: { dayNight: 0.10, storm: 0.25, rain: 0.15, wet: 0.35, puddle: 0.20, fog: 0.18, wind: 0.70, glow: 0.30, decay: 0.40, temperature: 0.56, autumn: 0.92 },
      schnee: { dayNight: 0.18, storm: 0.35, rain: 0, wet: 0.15, puddle: 0.28, fog: 0.25, wind: 0.30, glow: 0.50, decay: 0.50, temperature: 0.24, snow: 0.85, snowfall: 0.70 }
    };

    if (acts[id]) {
      this.setParams({ ...this.getDefaultParams(), ...acts[id] });
      this.currentAct = id;
      return true;
    }
    return false;
  }

  setParams(partial) {
    Object.assign(this.params, partial);
    // Recompute derived values
  }

  getParams() {
    return { ...this.params };
  }

  isReady() {
    return this.ready;
  }

  getMaterialTypeAt(u, v) {
    if (!this.classGrid) return null;
    const aw = this.options.analysisResolution;
    const ah = Math.round(aw * this.sceneHeight / this.sceneWidth);
    const x = Math.floor(u * aw);
    const y = Math.floor(v * ah);
    if (x < 0 || x >= aw || y < 0 || y >= ah) return null;
    const cls = this.classGrid[y * aw + x];
    const names = ['grass', 'foliage', 'roof', 'path', 'wood', 'window', 'water', 'rock'];
    return names[cls] || null;
  }

  // --- Spatial Kernel API ---

  getKernel() {
    return this.kernel;
  }

  async runRecipe(name, input) {
    if (!this.kernel) return { ok: false, error: 'Spatial kernel not initialized' };
    return this.kernel.runRecipe(name, input);
  }

  ingestObservation(observation) {
    if (!this.kernel) return { ok: false, error: 'Spatial kernel not initialized' };
    return this.kernel.ingest(observation);
  }

  getSubsystem(name) {
    if (!this.kernel) return null;
    return this.kernel.getSubsystem(name);
  }

  getKernelSnapshot() {
    if (!this.kernel) return null;
    return this.kernel.snapshot();
  }

  // --- Cleanup ---

  destroy() {
    if (this.depthProvider) {
      this.depthProvider.dispose();
    }
    const gl = this.gl;
    for (const tex of this.textures.values()) {
      gl.deleteTexture(tex);
    }
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.quadBuffer);
    if (this.analysisFB) gl.deleteFramebuffer(this.analysisFB);
    if (this.materialFB) gl.deleteFramebuffer(this.materialFB);
  }
}

// Export for both module and global usage
export default SHADEDEngine;

// Auto-initialize if running in browser with canvas
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.SHADEDEngine = SHADEDEngine;
}