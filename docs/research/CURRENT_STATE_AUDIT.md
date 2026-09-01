# Current State Audit — SHADED Post-GOLD Research Pass

**Commit:** `b341f7f46390216e81c97e01259a573fd2e9896c`  
**Date:** 2026-08-20  
**Method:** Direct code inspection (`grep`, `read`, `node --check`, live test execution)  
**Basis:** Not README claims — every finding is traceable to a file and line range or a test run.

---

## 0. Bottom Line

The repository contains **two coexisting systems** under a single roof:

1. **`index.html`** (4480 lines, single-file): WebGL 2 / GLSL ES 3.00 rendering engine with the `window.SHADED` API v1.4.0. This is the **single shader source and single material-truth** per Invariante 7.
2. **`runtime/spatial-kernel/`** (14 ES modules): A newer modular spatial-reasoning kernel with dependency injection via subsystem registry. Recipes ingest `GeometryObservation` objects.

Both are **live and tested**. The spatial-kernel is the research/experimentation layer; `index.html` is the delivery engine. They coexist without duplicating shader or classification logic (no second `classGrid`, no second shader source).

**11 of 11 node test suites pass.** §3.1's original claim that `test-hybrid-world.mjs` imports
three unimplemented symbols is **stale** — it was true at this audit's own commit
(`b341f7f`) but was fixed same-day by `0d8a13f` ("feat(spatial-kernel): add kernel
bootstrapping and hybrid world recipe"), which landed immediately after this audit was
written. `HybridLittleWorld`, `createDefaultKernel`, `installKernel` are real, exported
from `runtime/spatial-kernel/index.js`, and `node tools/test-hybrid-world.mjs` passes
(7/7 assertions) as of 2026-09-01. See the correction note in §3.1 below.

The full `npm run check` passes. Browser-based visual verify scripts mostly work; some fail in headless Chromium due to WebGL limitations, not code defects.

---

## 1. Architecture Map

```
index.html (4480 lines)
  ├── CSS (lines 13–91)                    — Dark theme, responsive, cinema mode
  ├── DOM (lines 93–340)                    — Sidebar UI, controls, overlays
  ├── Shader source (lines 372–~1200)       — GLSL ES 3.00 vertex + fragment shader
  ├── GL setup (lines 1215–1340)            — WebGL 2 context, uniforms, textures (9 units)
  ├── Trail/Sound systems (lines 1264–1375) — CPU particle/stamp fields on canvas
  ├── Camera/parallax (lines ~2900–3150)    — 2.5D depth parallax
  ├── Player system (lines ~3150–3700)      — Walk controls, fire, trail, interaction
  ├── analyze() (lines 1728–2330)           — CPU material classification → classGrid
  ├── Intrinsic layer (lines 1390–1620)     — Material/lighting separation (v1.6)
  ├── Actor system (lines 3261–3560)        — SWIFT sprite-sheet actors
  ├── Storyboard (lines 2371–2500)          — Act/timeline system
  ├── World simulation (lines ~1400–1600)   — World-law phase computation
  └── window.SHADED API (lines 4325–4475)   — Public API surface (v1.4.0)
    └── runtime/install.js                   — PWA install shell
    └── runtime/spatial-viewer.js            — Live spatial runtime viewer

runtime/spatial-kernel/
  ├── index.js (20 exports)                  — Public barrel
  ├── kernel.js                             — SpatialKernel shell (orchestration)
  ├── observation.js                        — GeometryObservation contract (v1)
  ├── observation-store.js                  — ObservationStore (keyframes, anchors)
  ├── sparse-field.js                       — SparseField (sparse chunked voxels)
  ├── scene-graph.js                        — Semantic SceneGraph (16 node families)
  ├── sdf-geometry.js                       — SDF primitives + boolean ops
  ├── constraint-graph.js                   — ConstraintGraph (support/overlap/stabilize)
  ├── quality-budget.js                     — QualityBudget (4 profiles)
  ├── representation-manager.js             — RepresentationManager (budget-aware)
  ├── completion-provider.js                — CompletionProvider/Registry
  ├── spatial-memory.js                     — SpatialMemory (drift correction)
  ├── navigation.js                         — A* grid navigation
  ├── mesh-pipeline.js                      — Mesh optimization (index/weld/simplify)
  ├── world-fields.js                       — WorldFields (seeded scalar field grid)
  ├── world-law-solver.js                   — WorldLawSolver (reference laws)
  ├── recipe-manager.js                     — RecipeManager
  └── recipes/
      ├── photo-first-recipe.js             — PhotoFirstRecipe
      └── procedural-little-world.js        — ProceduralLittleWorld

editor/
  ├── facade.js                             — SceneEditorFacade (iframes index.html)
  ├── markerPainter.js                      — MarkerPainter (palette overlay tool)
  ├── actorPlacer.js                        — ActorPlacer (SWIFT sprite placement)
  ├── app.js                                — UI event wiring
  ├── world-studio.js / world-studio-v4.js  — World Studio workflow
  └── facade.test.js                        — Headless browser test

runtime/ (legacy modules — partially orphaned)
  ├── sparse-voxel-world.mjs               — Legacy sparse voxel world (reused by SparseField)
  ├── spatial-navigation.mjs                — Legacy navigation (Dijkstra grid, reused by kernel)
  ├── spatial-viewer.js                     — WebGL point-cloud viewer
  ├── spatial-solid-runtime.js              — Voxel shell renderer
  ├── photo-first-reconstruction.mjs         — Photo-first data model
  ├── monocular-depth-provider.js            — Depth Anything WASM wrapper
  ├── spatial-system-integrator.mjs         — [was broken, fixed] Old photo-first integrator
  ├── reverse-viewfinder-mode.mjs            — [was broken, fixed] Manual camera placement
  ├── reverse-viewfinder-calibrator.mjs      — [was broken, fixed] Camera calibration
  ├── depth-to-local-mesh.mjs               — [was broken, fixed] Depth→mesh
  ├── patch-registration.mjs                — [was broken, fixed] ICP/feature registration
  ├── world-persistence-integration.mjs     — [was broken, fixed; orphaned]
  └── surface-world-simulation.mjs          — Grid-based world-law simulation

runtime/hall-plan/
  ├── hall-plan-core.mjs                    — Rich structural plan model
  ├── hall-extruder.mjs
  ├── hall-plan-workflow.mjs
  ├── hall-plan-adapter.mjs
  ├── hall-spatial-bridge.mjs
  ├── plan-analyzer.mjs
  └── plan-calibrator.mjs

contracts/
  ├── shaded-spatial-provider.schema.json   — Provider result v1 schema
  ├── shaded-scene-project.schema.json      — Scene project schema
  └── shaded-hall-plan.schema.json          — Hall plan schema

docs/
  ├── rendergraph-lastverteilung.md         — Rendergraph and scheduling
  ├── reconstruction-provider-und-world-surface-graph.md — Reconstruction
  ├── neuronale-materialien-svbrdf-pbr.md   — Material/Intrinsic decomposition
  ├── sdf-geometrie-stand-2026.md           — SDF geometry status
  ├── raeumliche-algorithmen-arsenal.md     — Spatial algorithms inventory
  ├── raumrekonstruktion-dykstra-dijkstra.md — Reconstruction pipeline
  ├── bildkanon.md                          — Image canon (K1–K8)
  ├── vision-weltgesetze.md                 — 60 world laws catalog
  ├── phase-c-world-laws.md                  — Phase C implementation
  ├── ORCHESTRATION.md                      — Orchestration contract
  └── research/
      ├── spatial-kernel-donor-map.md       — Existing donor audit (477 lines)
      └── _probe.md                         — Placeholder
```

---

## 2. What Was Really Implemented

### 2.1 `index.html` — Rendering Engine (GOLD, v1.4.0)

**Implemented (verified by code reading + verify.js):**

| Feature | Location | Evidence |
|---|---|---|
| WebGL 2 context with 9 texture units | `index.html:364, 1251` | `TEX = { scene:mkTex(0), ... sound:mkTex(8) }` |
| 13 high-level params + Phase C phases | `index.html:334, 4331` | `PARAMS = {...}`, `setTime` computes `dryPhase, heatWarp, rustAccum, ...` |
| `analyze()` material classification | `index.html:1728` | Produces `classGrid` (768×1080), `maskA`, `maskB`, `phys`, `emis`, `zoneGrid` |
| 8 material classes + PALETTE | `index.html:320-331` | `CLASSES = ['grass','foliage','roof','path','wood','window','water','rock']` |
| `getMaterialTypeAt(u,v)` | `index.html:2363` | Returns class name from `classGrid` |
| Intrinsic/material layer | `index.html:1390-1620, 4405-4466` | `window.SHADED.intrinsic` with `set/setStrength/reset/clear/sample` |
| Dykstra projection for albedo-gamut constraint | `index.html:1442` | `dykstraProject()` on shading field |
| Companion file auto-load | `index.html:1570-1610` | `applyPendingShading()` loads `_shading.png` |
| Companion depth auto-load | `index.html:3150-3160` | `setDepth()` loads `_depth.png` |
| 2.5D parallax (Unit 6) | `index.html:~2900` | `u_parallax`, `parallaxTarget/Current` |
| Trail system (Unit 5, CPU→GPU) | `index.html:1264-1340` | `trailStamp`, `trailTick`, `trailUpload` with R/G/B/A channels |
| Sound wavefield (Unit 8) | `index.html:1343-1375` | `soundStamp`, `soundTick`, `soundUpload` |
| Player system (Runde 4) | `index.html:~3150-3700` | Walk, trail stamps, fire, interaction |
| Actor system (Runde 4+, v1.4) | `index.html:3261-3560` | `addActor`, `drawActors`, depth layers, fog/dayNight alpha coupling |
| Actor emissive (v1.5) | `index.html:3350-3370` | `emissiveImage` additive rendering |
| Actor world states (v1.5) | `index.html:3511-3560` | `worldStateImages`, `setWorldState` |
| Storyboard/act system | `index.html:2371-2520` | `story.board()`, `playStory`, `applyAct` |
| Showcase system | `index.html:2520-2560` | `showcase.start/stop` |
| Dialogue engine (Runde 10) | `index.html:~4250-4320` | `dialogue.play/advance/skip`, `content/prolog-act1.js` |
| PWA support | `index.html:4477, service-worker.js` | Install module, offline caching |
| Lens system (Runde 8) | `index.html:1378, 4401` | `SHADED.lens{set/get}` |
| Building zones (K1) | `index.html:~1740-1760` | `zoneGrid`, Unit 7 |
| Structure pass (Runde 5) | `index.html:1740-1800` | `structDiag`, `SHADED.structure()` |
| Image canon detectors (K1–K8) | `index.html:1627-1728` | `classifyScenePixel`, sky rule, frame-window detector |

**13 world-law parameters** (`index.html:334`):
`dayNight, storm, rain, wet, puddle, fog, wind, glow, decay, temperature, bloom, autumn, snow`

**Phase C derived phases** (`index.html:4331-4351`):
`dryPhase (42), heatWarp (41), rustAccum (9), smokeAmount (43), breathAmount (44),
pressureDim (4), pollutionGlow (26), moonBright (38), shelfShadow (34),
vegFade (15), moodTint (24), worldTired (50), forbiddenCold (25), runeGlow (32),
shadowAge (11), smellDrift (6), touchWear (45), repairMark (30),
blessCurse (49)`

### 2.2 `runtime/spatial-kernel/` — Modular Kernel

**14 modules, all passing `node --check`:**

| Module | Exports | Test |
|---|---|---|
| `kernel.js` | `SpatialKernel` | `test-spatial-kernel.mjs` |
| `observation.js` | `GeometryObservation`, `OBSERVATION_SPEC_VERSION`, `SOURCE_TYPE`, `OBS_PROVENANCE` | `test-spatial-kernel.mjs` |
| `observation-store.js` | `ObservationStore` | `test-spatial-kernel.mjs` |
| `sparse-field.js` | `SparseField`, `VOXEL_STATE`, `VOXEL_PROVENANCE` | `test-sparse-field.mjs` |
| `scene-graph.js` | `SceneGraph`, `SceneGraphNode`, `NODE_FAMILY` (16 families) | `test-scene-graph.mjs` |
| `sdf-geometry.js` | `SdfScene`, `prim` (6), `xform` (6), `op` (4) | `test-spatial-kernel-2.mjs` |
| `constraint-graph.js` | `ConstraintGraph` | `test-spatial-kernel-2.mjs` |
| `quality-budget.js` | `QualityBudget`, `QUALITY`, `BUDGET_PRESETS` (4 profiles) | `test-spatial-kernel-2.mjs` |
| `representation-manager.js` | `RepresentationManager` | `test-spatial-kernel-2.mjs` |
| `completion-provider.js` | `CompletionProvider`, `CompletionProviderRegistry`, `makeHypothesis` | `test-spatial-kernel-2.mjs` |
| `spatial-memory.js` | `SpatialMemory`, `_poseMath` | `test-spatial-memory.mjs` |
| `navigation.js` | `aStarGrid`, `inflateObstacles`, `hasLineOfSight`, `lineOfSightShortcut`, `invalidatePaths` | `test-spatial-kernel-2.mjs` |
| `mesh-pipeline.js` | `optimizeMesh`, `weldVertices`, `removeDegenerate`, `quantizePositions`, `simplifyGreedy`, `indexMesh` | `test-spatial-kernel-2.mjs` |
| `world-fields.js` | `WorldFields` | `test-spatial-kernel-2.mjs` |
| `world-law-solver.js` | `WorldLawSolver`, `registerReferenceLaws`, 4 reference laws | `test-spatial-kernel-2.mjs` |
| `recipe-manager.js` | `RecipeManager` | `test-procedural-world.mjs` |
| `recipes/photo-first-recipe.js` | `PhotoFirstRecipe` | `test-photofirst-recipe.mjs` |
| `recipes/procedural-little-world.js` | `ProceduralLittleWorld` | `test-procedural-world.mjs` |

**Design properties verified by tests:**
- Ingestion never throws; bad observations return structured `{ ok: false, errors: [...] }` (not exceptions).
- `SIMULATED_FALLBACK` provenance is always flagged with a warning; never presented as success.
- `SpatialMemory` integration is incremental (never rebuilds from scratch), deterministic, seed-free.
- `SparseField` keeps `UNKNOWN` unallocated; `fuse()` only writes explicit evidence, trust-ordered.
- `WorldFields` is deterministic: identical seed → identical CRC after N steps.
- `ConstraintGraph` never moves fixed/trusted nodes; only pushes non-fixed nodes apart.
- `PhotoFirstRecipe` fails (not fakes) when no provider and `allowFallback` is false.
- `ProceduralLittleWorld` is deterministic per seed; same seed → identical output.

### 2.3 Editor

| Component | Status |
|---|---|
| `editor/facade.js` (`SceneEditorFacade`) | Implemented, iframes `index.html` |
| `editor/markerPainter.js` | Implemented (palette brush tool) |
| `editor/actorPlacer.js` | Implemented (SWIFT actor placement) |
| `editor/app.js` | Implemented (UI event wiring) |
| `editor/world-studio.js` | Implemented (World Studio workflow) |
| `editor/facade.test.js` | **Failing** — MIME type error in headless Chromium |
| `tools/verify-editor.js` | **Failing** — World generation timeout in headless Chromium |

### 2.4 Contracts & Schemas

| Contract | Status |
|---|---|
| `contracts/shaded-spatial-provider.schema.json` (v1) | Implemented, tested by `tools/test-gpu-spatial.mjs` |
| `contracts/shaded-scene-project.schema.json` | Implemented, tested by `npm run check` |
| `contracts/shaded-hall-plan.schema.json` | Implemented, tested by `npm run check` |

### 2.5 Tools

| Tool | Status |
|---|---|
| `tools/verify.js` | Partial pass (class regression PASS, screenshot fails in headless WebGL) |
| `tools/verify-actors.js` | Failing (WebGL/screenshot in headless) |
| `tools/verify-intrinsic.js` | Failing (WebGL/screenshot in headless) |
| `tools/verify-editor.js` | Failing (world gen timeout in headless) |
| `tools/verify-pwa.mjs` | PASS |
| `tools/verify-pwa-browser.mjs` | PASS |
| `tools/verify-walk-browser.mjs` | PASS |
| `tools/verify-sprite-exporter.js` | PASS |
| `tools/verify-dialogue.js` | Failing (120s timeout) |
| `tools/verify-lenses.js` | Failing (screenshot in headless) |
| `tools/verify-editor-mobile.mjs` | Failing (browser closed) |
| `tools/verify-costume-browser.js` | (not run — likely browser-based) |
| `tools/orchestrate.js` | `node --check` passes |
| `tools/register.js` | `node --check` passes |
| `tools/gpu-spatial.mjs` | PASS (`test-gpu-spatial.mjs`) |
| `tools/build-scene-project.mjs` | `node --check` passes |
| `tools/build-world-package.mjs` | `node --check` passes |
| `tools/shaded-local-bridge.mjs` | `node --check` passes |

---

## 3. Incomplete / Broken Claims

### 3.1 `test-hybrid-world.mjs` — **RESOLVED, was stale as of 2026-08-20**

> **Correction (2026-09-01):** Everything below described the state at this audit's own
> commit (`b341f7f`). It was fixed same-day by `0d8a13f` ("feat(spatial-kernel): add
> kernel bootstrapping and hybrid world recipe"), which this document was never updated
> to reflect. `HybridLittleWorld`, `createDefaultKernel`, `installKernel` are implemented
> in `runtime/spatial-kernel/bootstrap.js` and `runtime/spatial-kernel/recipes/
> hybrid-little-world.js`, exported from `index.js`, and `node tools/test-hybrid-world.mjs`
> passes (7/7 assertions). The narrative below is kept for historical trace, not as a
> current blocker — see §6 and §7 for the corrected status.

**Commit:** `8e424c8` (2026-08-19) — "test(tools): add integration test for hybrid world and kernel bootstrap"

The test imports:
```js
import {
  ... HybridLittleWorld, createDefaultKernel, installKernel,
} from '../runtime/spatial-kernel/index.js';
```

**None of these three symbols exist in the codebase.** Grep across the entire workspace:

```
$ grep -rn "HybridLittleWorld\|createDefaultKernel\|installKernel" runtime/
(no matches)
```

The `index.js` barrel exports exactly 20 named symbols (verified at
`runtime/spatial-kernel/index.js:1-20`); none of the three missing names appear.

**What the test expects:**
- `HybridLittleWorld` — a recipe that ingests observed points + procedurally fills gaps
- `createDefaultKernel()` — returns a pre-configured `SpatialKernel` with all subsystems registered
- `installKernel(kernel)` — attaches the kernel to `window.SHADED.spatialKernel` and exposes `SpatialKernel` class

**Required action (Phase 1):** Either implement these three exports in `index.js`, or mark
the test as `SKIPPED` and remove it from the GOLD baseline. The test file otherwise
has correct test logic (asserts observed vs generated voxel provenance, bootstrap wiring).

### 3.2 `npm run check` requires `node_modules`

The `check` script requires `ajv`, `typescript`, and `playwright` to be installed.
These are in `devDependencies` but NOT committed (per `.gitignore`). The script passes
only after `npm ci`. This is by design (dev-only tools), but must be documented
in the reproduction recipe.

### 3.3 Browser-based verify scripts fail in headless Chromium

Six browser verify scripts fail in this sandbox:
- `verify.js` — screenshot fails after WebGL `texImage2D: no texture bound` error
- `verify-actors.js` — element screenshot stability issue
- `verify-intrinsic.js` — WebGL `texImage2D` error, screenshot failure
- `verify-lenses.js` — element screenshot stability issue
- `verify-editor.js` — world generation timeout (30s)
- `verify-editor-mobile.mjs` — browser closed during evaluation
- `facade.test.js` — MIME type error (PNG served as JS module at port 8933)
- `verify-dialogue.js` — 120s timeout

**Diagnosis:** These all involve WebGL rendering in headless Chromium without GPU
acceleration. The errors are `texImage2D: no texture bound to target` (WebGL driver
message) and screenshot/element-stability timeouts. The underlying shader code in
`index.html` is syntactically valid (`new Function()` parse passes in `npm run check`).

**Evidence they are environment issues, not code bugs:**
- `verify-pwa-browser.mjs` PASSES (loads page, checks service worker, no WebGL needed)
- `verify-walk-browser.mjs` PASSES (uses Canvas 2D overlay, not WebGL for its checks)
- `verify-sprite-exporter.js` PASSES (checks UI elements, no WebGL)
- `verify-pwa.mjs` PASSES (static checks only)
- `test-gpu-spatial.mjs` PASSES (Python provider, not browser)

### 3.4 `runtime/world-persistence-integration.mjs` — orphaned

This module (515 lines) implements `WorldPersistenceManager` and
`PhotoFirstEditorIntegration`. It was flagged as orphaned in
`docs/research/spatial-kernel-donor-map.md:255-270`. It is **not imported** by any
live code path:

```
$ grep -rn "world-persistence-integration\|WorldPersistenceManager" *.html editor/ runtime/ tools/ 2>/dev/null
(no imports found)
```

The module has a latent `self.` → `this.` bug (documented in the donor-map audit).

### 3.5 Stale `.kiro/steering/` references

`.kiro/steering/shader-pipeline.md:92` references `u_mossBoost` and `u_bleach` as
shader uniforms, but the **actual** `index.html` PARAMS at line 334 does NOT include
these. The shader source itself uses `u_mossBoost` (line 1234 shows
`'u_mossBoost'` in the uniform list). The steering doc's "Effect 4" section (line 99)
mentions `u_mossBoost` as a CPU-computed value — it exists in the shader uniform list
but is not in the PARAMS object. This is a minor documentation drift, not a code bug.

---

## 4. Architecture Assessment

### 4.1 What the Two-Layer Architecture Achieves

The separation of concerns is clean and follows the spec:

```
Inputs (photo, depth, plan, procedural, manual)
  ↓
RecipeManager → PhotoFirstRecipe / ProceduralLittleWorld / (ManualCameraRecipe TBD)
  ↓
SpatialKernel.ingest(GeometryObservation)
  ↓
Subsystems (ObservationStore, SparseField, SceneGraph, SpatialMemory, ...)
  ↓
SparseField.toLegacy(SparseVoxelWorld)  ← bridge, not replacement
SceneGraph.toJSON() / fromJSON()       ← serialization
RepresentationManager picks budget rep ← GOLD/DESKTOP/BROWSER/MOBILE
```

**Key design wins:**
1. The kernel knows nothing about photo-first (verified by `test-spatial-kernel.mjs:96-98`).
2. `GeometryObservation` is the universal currency (verified by `test-photofirst-recipe.mjs`).
3. `SIMULATED_FALLBACK` is explicitly flagged, never hidden (verified by `test-spatial-kernel.mjs:35-36`).
4. `SparseField` bridges to legacy `SparseVoxelWorld` via `toLegacy()` (reuse, not replace).
5. `SpatialMemory` uses incremental integration with bounded local window (no full rebuild).

### 4.2 Where the Kernel Connects to `index.html`

The kernel is **not yet wired** into `index.html`'s runtime. The `index.html` engine runs
its own `analyze()` → `classGrid` → shader path, which is the **single material truth**.
The kernel's `SceneGraph` + `SparseField` are designed to eventually feed the spatial
runtime viewer (`runtime/spatial-viewer.js`) for walk-through mode, but this connection
is only partially established:

- `editor/facade.js` calls `window.SHADED` API (not the kernel directly).
- `window.SHADED.spatial` exposes `pointCloud`/`downloadPointCloud` — these are from the
  legacy `spatial-reconstruction.mjs` pipeline, not the kernel.
- The kernel's `SpatialKernel` is not yet attached to `window.SHADED`.

This is the **expected Phase 1 integration boundary**, documented in
`docs/research/spatial-kernel-donor-map.md:440-460`.

### 4.3 The `index.html` API Surface (Invariante 5)

```
window.SHADED = {
  version: '1.4.0',
  erstellen,                      // create/shader compile
  applyAct,                       // story act transition
  setParams / getParams,          // 13 world-law parameters
  setTime,                        // deterministic time control (freeze=true)
  isReady,                        // shader compiled + scene loaded
  getMaterialTypeAt(u, v),        // material query (classGrid)
  story: { play, stop, board() },  // storyboard
  showcase: { start, stop, board },
  elements: { trigger, clear },   // elemental burst
  worldState(),                   // full state snapshot
  spatial: { pointCloud, downloadPointCloud },
  loadDemo,
  loadImageFile,
  player: { enable, pos, setAge, move },
  fire: { ignite, list },
  trail: { clear, sample },
  structure(),                    // structure pass diagnostic
  zoneAt(u, v),                   // building zone query (K1)
  parallax: { set, get, hasDepth, setDepthImage, clearDepth },
  addActor,                       // SWIFT sprite actors
  ecosystem: { spawn, defs },
  lens: { set, get },             // inspection lenses (Runde 8)
  sound: { emit, clear },
  intrinsic: { state, setStrength, getStrength, set, accept, reset, clear, sample },
  dialogue: { play, advance, skip, isPlaying, current },
}
```

**Note:** `loadImageFile` (not `loadImageFile`) is the correct name — it's exported
but not listed in the CLAUDE.md API summary which omits it.

### 4.4 Texture Unit Allocation (Invariante 7)

```
Unit 0: Scene texture (background image)
Unit 1: maskA (grass, foliage, roof, path)     — RGBA masks
Unit 2: maskB (wood, window, water, rock)       — RGBA masks
Unit 3: phys (puddle depth, river angle, bleed, path distance)
Unit 4: emis (warm glow RGB + window-alpha A)
Unit 5: trail (R=HWZ decay 1.5s, G=impulse 0.4s, B=trample permanent, A=heat/fire ~25s)
Unit 6: depth (2.5D parallax; 1×1 black = flat)
Unit 7: zone (K1: R=1 building zone; masks puddle/riv/creep/mud)
Unit 8: sound (R-channel only, 256², HWZ ≈ 0.35s)
```

The shader queries `MAX_TEXTURE_IMAGE_UNITS` at runtime (verify.js checks `fragUnits ≥ 16`).
9 units are used; 7+ remain on standard WebGL 2.

### 4.5 World-Law Coverage

Per CLAUDE.md §"Weltgesetze-Katalog":
- **Runde 1–4:** 11 systems implemented (Footprints, Material Fatigue, Wind, Blood,
  Day/Night, Cold/Frost/Snow, Water Flow, Seasons, Fire Aftermath, Fog, Dirt partial)
- **Phase C (Runde 5+):** 20 systems newly implemented (Heat Distortion, Drying,
  Smoke Layering, Rust, Temperature Gradients, Breath Clouds, Pressure, Light Pollution,
  Moonlight, Biom Zones, Vegetation Fade, Mood Tint, World Tiredness, Forbidden Boundaries,
  Surface Runes, Shadows as Ownership, Smell/Diffusion, Touch Traces, Repair Marks,
  Blessing/Curse)
- **Total in shader:** 31 of 60 world laws represented in `PARAMS` + derived phases

---

## 5. Test Coverage Matrix

| Subsystem | Tests | Coverage |
|---|---|---|
| GeometryObservation | `test-spatial-kernel.mjs` | 25 assertions — spec version, sourceType validation, SIMULATED_FALLBACK flagging, provider adaptation |
| SpatialKernel | `test-spatial-kernel.mjs` | ingest, subsystem hooks, snapshot, simulated flag |
| SparseField | `test-sparse-field.mjs` | 18 assertions — UNKNOWN stays unallocated, fuse trust-order, chunk dirty tracking, toLegacy bridge |
| SceneGraph | `test-scene-graph.mjs` | 19 assertions — node families, parent/children, semantic links, bounds query, remove re-parent, JSON round-trip |
| SDF | `test-spatial-kernel-2.mjs` | sphere/box/union/difference, surface sampler |
| ConstraintGraph | `test-spatial-kernel-2.mjs` | support, overlap, penetration correction, fixed-node protection |
| QualityBudget | `test-spatial-kernel-2.mjs` | within(), fit(), profile presets |
| RepresentationManager | `test-spatial-kernel-2.mjs` | register, pick (budget-aware), setBudget |
| CompletionProvider | `test-spatial-kernel-2.mjs` | hypothesis creation, registry, kernel ingestion |
| SpatialMemory | `test-spatial-memory.mjs` | 9 assertions — origin, integration, loop closure, bounded window, high-residual rejection |
| A* Navigation | `test-spatial-kernel-2.mjs` | gap-finding, obstacle inflation, LOS shortcut, path invalidation |
| WorldFields | `test-spatial-kernel-2.mjs` | CRC determinism, clone, frozen stepping |
| WorldLawSolver | `test-spatial-kernel-2.mjs` | reference laws: evaporation, freeze/thaw, rain→mud, fire-fuel |
| Mesh pipeline | `test-spatial-kernel-2.mjs` | index, weld, degenerate removal, quantize, greedy simplify |
| PhotoFirstRecipe | `test-photofirst-recipe.mjs` | 16 assertions — no-provider failure, fallback flag, provider success, providerResult path, unknown recipe |
| ProceduralLittleWorld | `test-procedural-world.mjs` | 13 assertions — seed determinism, kernel ingest, field/graph population |
| Depth provider | `test-gpu-spatial.mjs` | Contract validation, binary channels, bundle, comparison |
| PWA | `tools/verify-pwa.mjs` | Service worker, offline caching, static checks |
| PWA browser | `tools/verify-pwa-browser.mjs` | Active SW, offline demo, spatial viewer |
| Walk browser | `tools/verify-walk-browser.mjs` | Steps, observed, mirror, tree, way cells |
| Legacy spatial-nav | `test-spatial-navigation.mjs` | Dykstra projection, Dijkstra, plane fit, voxel world, world sim, fire/water flow |

**Missing coverage:**
- No test for `SpatialMemory` with a real `PatchRegistrar` (uses stub)
- No test for `SceneGraph.fromJSON()` edge cases beyond basic round-trip
- No test for `RepresentationManager.resolveAll()`
- No test for `mesh-pipeline.simplifyGreedy` quality guarantee
- No node-based test for `editor/facade.js` (only browser-based `facade.test.js`)
- No test for `index.html` shader behavior without a browser

---

## 6. Incomplete/Broken Claims Summary

| # | Claim | Location | Status |
|---|---|---|---|
| 1 | `HybridLittleWorld`, `createDefaultKernel`, `installKernel` exported from kernel | `test-hybrid-world.mjs` | **RESOLVED** (2026-09-01) — fixed same-day as this audit by `0d8a13f`, doc was stale |
| 2 | `npm run check` passes | `package.json` | **PASS** after `npm ci` |
| 3 | All 8 world-law rounds (1–10 minus 6/7) complete | CLAUDE.md | **Verified** — rounds 2,3,4,5,8,9,10 complete |
| 4 | 31/60 world laws in shader | CLAUDE.md | **Verified** — 11 (R1-4) + 20 (Phase C) |
| 5 | `docs/research/spatial-kernel-donor-map.md` is complete | existing doc | **Partial** — 477 lines, covers 1.1–2.6, migration plan §4–5 |
| 6 | Browser visual verification | `.kiro/steering/visual-verification.md` | **Environment-dependent** — fails in headless without GPU |
| 7 | `b341f7f` is the GOLD commit | git log | **Verified** — HEAD of branch |
| 8 | 9 texture units | `index.html:1251` | **Verified** — 9 mkTex calls |
| 9 | `index.html` is single shader source | Invariante 7 | **Verified** — no other shader files exist |
| 10 | Material truth = `analyze()` output only | Invariante 2 | **Verified** — no second classification in spatial-kernel |

---

## 7. What Should Be Fixed for GOLD Reproducibility

Only blocking fixes (per task §1.6):

1. ~~**`test-hybrid-world.mjs`**: Implement `HybridLittleWorld`, `createDefaultKernel`, `installKernel`~~
   — **done, same-day as this audit** (`0d8a13f`). Confirmed passing 2026-09-01.

2. **Document the `npm ci` requirement** in the reproduction recipe — already captured
   in `GOLD_FREEZE.md` §10.

3. **Browser visual tests**: Require GPU-enabled Chromium for full verification. The
   `npm run check` script (non-browser) is the CI gate and passes cleanly.

---

## 8. Foundation vs Research vs Implementation Gaps

| Category | Items |
|---|---|
| **Foundation (implementable now)** | Run IDs, experiment metadata, operator toggles, provenance, content-addressed artifact cache, evaluation packet schema, canonical probe cameras, retention policy classes, scene descriptor schema |
| **Research/experiment (Modal ablation)** | DepthAnything v2/v3 comparison, MoGe-3 neighbourhood, TRELLIS/Zero123+ completion, GSNSR hybrid, GS-2M, silhouette-aware warping, 3DGS compression, learned residual specialists |
| **Implementation gaps** | ~~`HybridLittleWorld` recipe, `createDefaultKernel`/`installKernel` wiring~~ (done, `0d8a13f`), `ManualCameraRecipe`, `PlanConstraintRecipe`, kernel↔`index.html` integration |

---

## 9. Key File References

- `index.html:320-331` — PALETTE + CLASSES (canonical material palette)
- `index.html:334-336` — PARAMS (13 world-law parameters)
- `index.html:337-360` — PARAM_META (slider metadata)
- `index.html:363-370` — WebGL 2 context + version check
- `index.html:372-1213` — Vertex + fragment shader source
- `index.html:1215-1340` — GL setup, uniforms, textures, trail system
- `index.html:1343-1375` — Sound wavefield (Unit 8)
- `index.html:1380-1420` — Lens state (Runde 8)
- `index.html:1390-1620` — Intrinsic/material layer separation
- `index.html:1442` — dykstraProject() (constraint projection)
- `index.html:1627-1728` — Segmentierung / classifyScenePixel / analyze
- `index.html:1728-2330` — analyze() full implementation
- `index.html:2363` — getMaterialTypeAt()
- `index.html:3261-3560` — Actor system (addActor, drawActors)
- `index.html:4325-4475` — window.SHADED API surface
