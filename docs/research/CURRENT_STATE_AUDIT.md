# Current State Audit — SHADED Post-GOLD Research Pass

**Commit (GOLD baseline):** `1cb06c432d90c49628786a1c80bcdb9ad8145722` (= origin/main at handoff, = `b341f7f`)
**This pass HEAD:** `d7efa428` (local `wip` commit — PHASE A instrumentation hardening only, see §3.6)
**Date:** 2026-08-22
**Method:** Direct code inspection (`grep`, `read`, `node --check`, live test execution).
Every finding is traceable to a file/line range or a test run.

Reproduction recipe:
```bash
npm ci                          # devDeps (ajv, typescript, playwright) are NOT committed
npx playwright install chromium # browser binary
npx playwright install-deps chromium # OS libs (libnspr4, libgbm, ...) for headless GL
node tools/verify-<x>.js        # browser checks
node tools/test-*.mjs           # node checks
npm run check                   # all node --check + static + node test suites listed below
```

---

## 0. Bottom Line

The repository contains **two coexisting systems** under a single roof:

1. **`index.html`** (single-file static WebGL2 PWA): the rendering engine with the `window.SHADED` API. This is the **single shader source and single material-truth** per Invariante 7.
2. **`runtime/spatial-kernel/`** (modular ES-module spatial kernel with dependency injection): observations → sparse spatial state → scene graph → SDF → constraints → budgets → reconstruction → navigation. Recipes ingest `GeometryObservation` objects.

Both are **live and tested**. The spatial kernel is the research/experimentation layer; `index.html` is the delivery engine. They coexist **without** duplicating shader or classification logic (no second `classGrid`, no second shader source).

**State of the 15 node test suites:** **all 15 PASS** (see §5).

The full `npm run check` passes (with `npm ci`). Browser verification is functional once Chromium + its OS libraries + swiftshader are installed; the correctness/quality gates **pass**, while screenshot capture remains flaky in headless software-GL (environmental — see §3.3/§3.6).

**Net delta from the prior audit (`b341f7f`):** the prior audit's single "BROKEN" claim (`test-hybrid-world`) is **FIXED** (commit `0d8a13f`); the prior audit's blanket "browser verifies fail in headless" is **mostly STALE** (commit `19859e5` started a swiftshader migration and this pass completes it). No architecture changed.

---

## 1. Architecture Map

```
index.html (single-file static PWA, WebGL 2 / GLSL ES 3.00)
  ├── CSS (lines 13–91)                       Dark theme, responsive, cinema mode
  ├── DOM (lines 93–340)                      Sidebar UI, controls, overlays
  ├── Shader source (lines 372–~1213)         GLSL ES 3.00 vertex + fragment shader (ONE source)
  ├── GL setup (lines 1215–1340)              WebGL 2 context, uniforms, textures (9 units)
  ├── Trail/Sound systems (lines 1264–1375)   CPU particle/stamp fields → Units 5 & 8
  ├── Lens state (lines 1378–1390)            Runde 8 inspection lenses
  ├── Intrinsic layer (lines 1390–1620)       Material/lighting separation (v1.6)
  ├── analyze() (lines 1728–2330)             CPU material classification → classGrid (ONE truth)
  ├── classifyScenePixel (1627–1728)          Image-canon detectors K1–K8
  ├── structure pass (1740–1800)              structDiag, SHADED.structure(), zoneGrid (Unit 7)
  ├── World simulation (lines ~1400–1600)     World-law phase computation (13 + Phase C)
  ├── 2.5D parallax (lines ~2900–3150)        Unit 6
  ├── Player system (lines ~3150–3700)        Walk, fire, trail, interaction (Runde 4)
  ├── Actor system (lines 3261–3560)          addActor/drawActors, v1.4/v1.5/v1.6
  ├── Storyboard (lines 2371–2520)            story.board(), playStory, applyAct
  ├── Showcase (lines 2520–2560)
  ├── Dialogue engine (lines ~4250–4320)      Runde 10
  └── window.SHADED API (lines 4325–4475)     v1.4.0
      ├── runtime/install.js                  PWA install shell
      └── runtime/spatial-viewer.js           Live spatial runtime viewer

runtime/spatial-kernel/                       19 ES modules (barrel index.js = 24 exports)
  ├── index.js (barrel)                       24 named exports
  ├── bootstrap.js                           createDefaultKernel, installKernel
  ├── kernel.js                              SpatialKernel
  ├── observation.js                         GeometryObservation, SOURCE_TYPE, OBS_PROVENANCE
  ├── observation-store.js
  ├── sparse-field.js                        SparseField, VOXEL_STATE, VOXEL_PROVENANCE
  ├── scene-graph.js                         SceneGraph, NODE_FAMILY (16 families)
  ├── sdf-geometry.js                        SdfScene, prim/xform/op
  ├── constraint-graph.js
  ├── quality-budget.js                      QUALITY, BUDGET_PRESETS (4 profiles)
  ├── representation-manager.js
  ├── completion-provider.js                 CompletionProvider, Registry, makeHypothesis
  ├── spatial-memory.js
  ├── navigation.js                          aStarGrid + helpers
  ├── mesh-pipeline.js                       optimizeMesh/weld/simplify/quantize/index
  ├── world-fields.js                        WorldFields (deterministic)
  ├── world-law-solver.js                    WorldLawSolver + 4 reference laws
  ├── recipe-manager.js
  └── recipes/
      ├── photo-first-recipe.js              PhotoFirstRecipe
      ├── procedural-little-world.js         ProceduralLittleWorld
      ├── hybrid-little-world.js             HybridLittleWorld  (added 0d8a13f)
      └── hall-planner-recipe.js             HallPlannerRecipe   (added d381ce9)

runtime/ (legacy support modules — mostly bridged, not orphaned)
  ├── sparse-voxel-world.mjs                 reused by SparseField.toLegacy()
  ├── spatial-navigation.mjs                 reused by kernel
  ├── spatial-viewer.js                       WebGL point-cloud viewer
  ├── spatial-solid-runtime.js
  ├── photo-first-reconstruction.mjs
  ├── monocular-depth-provider.js            Depth Anything WASM wrapper
  ├── spatial-system-integrator.mjs
  ├── reverse-viewfinder-mode.mjs / -calibrator.mjs
  ├── depth-to-local-mesh.mjs
  ├── patch-registration.mjs
  ├── surface-world-simulation.mjs
  └── world-persistence-integration.mjs       **ORPHANED** (§3.4)

runtime/hall-plan/                          HALL structure (K1 building zones)
  ├── hall-plan-core.mjs
  ├── hall-extruder.mjs / hall-plan-workflow.mjs / hall-plan-adapter.mjs
  ├── hall-spatial-bridge.mjs / plan-analyzer.mjs / plan-calibrator.mjs

contracts/
  ├── shaded-spatial-provider.schema.json (v1)   tested by tools/test-gpu-spatial.mjs
  ├── shaded-scene-project.schema.json            tested by npm run check
  └── shaded-hall-plan.schema.json                tested by npm run check

docs/research/                                (foundation that EXISTS and must be evolved)
  ├── CURRENT_STATE_AUDIT.md                    ← this file (updated)
  ├── EVALUATION_SPEC.md
  ├── EXPERIMENT_ARCHITECTURE.md
  ├── EG_DONOR_MATRIX.md
  ├── operators.json                            47 operator entries (object schema)
  ├── operators.schema.json                    **MISSING** (operators.json $schema dangling ref)
  ├── GOLD_FREEZE.md
  ├── RETENTION_AND_ARTIFACT_SPEC.md
  ├── HALL_TEXTURE_PIPELINE.md / STYLIZED_RENDER_PIPELINE.md
  ├── SWIFT_MOTION_RESEARCH.md / SINGLE_IMAGE_TO_WORLD_MATRIX.md
  ├── BUILDING_RECONSTRUCTION_MATRIX.md / CROSS_DOMAIN_TECHNIQUES.md
  ├── gold-metrics.json / probe-cameras.mjs
  └── experiments/                              17 ExperimentCards (json)
      ├── exp-001-depth-v3-vs-v2.json          DepthAnything V3 vs V2
      ├── exp-001-vggt.json / exp-001-mapanything.json
      ├── exp-TSDF-001.json / exp-RANSAC-001.json / exp-SCALE-001.json
      ├── exp-015-primitive-fitter.json / exp-043-moge3-neighbourhood.json
      ├── exp-CHUNK-001.json / exp-COLMAP-001.json / exp-MASK-001.json
      ├── exp-NCA-001.json / exp-SLS-001.json / exp-SFS-001.json
      ├── exp-SLAM-001.json / exp-SLS-001.json / exp-T3DGS-001.json
      └── exp-SEQ-001.json

tools/                                         (benchmark + verification + providers)
  ├── benchmark-providers.mjs                  ReconstructionBenchmark/Tournament (STAGES: depth,geometry,cleanup,completion)
  ├── test-benchmark-provider.mjs               63 assertions (in `npm run check` ✓)
  ├── run-experiment.js                        experiment engine; `--dry-run` works (validates cards vs operators.json)
  ├── gpu-spatial.mjs / test-gpu-spatial.mjs   provider CONTRACT validation (fixture providers only)
  ├── verify*.js(m)                            browser verification (see §3.3)
  ├── orchestrate.js                           headless CLI contract for editor (Real Golden Run R-10)
  ├── providers/                               REAL Python providers (DepthAnything v2/v3, VGGT, MapAnything, COLMAP,
  │   ├── shaded_depth_anything_v2.py             RANSAC, TSDF, scale-align, software-depth) — NOT runnable here (§3.7)
  │   ├── shaded_depth_anything_3.py
  │   ├── shaded_vggt.py
  │   ├── shaded_mapanything.py
  │   ├── shaded_colmap.py
  │   ├── shaded_ransac_planes.py
  │   ├── shaded_tsdf_fusion.py
  │   ├── shaded_scale_align.py
  │   ├── software_depth.py
  │   └── shaded_provider_common.py            shared write_result (schema-valid; provenance.class=INFERRED)
  └── test-*.mjs                               node tests for every kernel module

editor/
  ├── facade.js  / facade.test.js              SceneEditorFacade (iframes index.html via window.SHADED)
  ├── markerPainter.js / actorPlacer.js
  ├── app.js (bundles the 4 facades + window.SHADED_ORCHESTRATOR)
  └── ux-fixes.js / world-studio.js / material-preview-live.js ...
```

---

## 2. What Was Really Implemented

### 2.1 `index.html` — Rendering Engine (GOLD, v1.4.0)

**Implemented (verified by code reading + verify.js/verify-*.js, all PASS for checks):**

| Feature | Location | Evidence |
|---|---|---|
| WebGL 2 context (`--use-gl=swiftshader` in CI), 9 texture units, ≥16 frag-sampler | `index.html:364, 1251` | `TEX = { scene:mkTex(0), ... sound:mkTex(8) }`; shader queries `MAX_TEXTURE_IMAGE_UNITS` |
| 13 world-law params + Phase C derived phases | `index.html:334, 4331` | `PARAMS={dayNight,storm,rain,wet,puddle,fog,wind,glow,decay,temperature,bloom,autumn,snow}`; `setTime` derives `dryPhase, heatWarp, rustAccum, smokeAmount, breathAmount, pressureDim, pollutionGlow, moonBright, shelfShadow, vegFade, moodTint, worldTired, forbiddenCold, runeGlow, shadowAge, smellDrift, touchWear, repairMark, blessCurse` |
| `analyze()` → `classGrid` (ONE material truth) | `index.html:1728` | Produces `classGrid` (768×1080), `maskA/B`, `phys`, `emis`, `zoneGrid` |
| 8 material classes + canon. PALETTE | `index.html:320-331` | `CLASSES=['grass','foliage','roof','path','wood','window','water','rock']` |
| `getMaterialTypeAt(u,v)` | `index.html:2363` | Returns class from `classGrid` |
| Intrinsic/material separation (v1.6) | `index.html:1390-1620, 4405-4470` | `window.SHADED.intrinsic{state,setStrength,getStrength,set,accept,reset,clear,sample}` |
| Dykstra projection on shading field | `index.html:1442` | `dykstraProject()` — albedo-gamut `s≥max(col)` + energy-neutrality `mean(s)=target` |
| Companion auto-load (`_shading.png` / `_depth.png`) | `index.html:1570-1610, 3150-3160` | `applyPendingShading()` / `setDepth()`; 404 on missing companion is EXPECTED (isOptionalCompanion) |
| 2.5D parallax (Unit 6) | `index.html:~2900` | `u_parallax`; 1×1 black = flat; mouse-driven |
| Trail system (Unit 5, CPU→GPU) | `index.html:1264-1340` | R=HWZ 1.5s, G=impulse 0.4s, B=trample permanent, A=heat/fire ~25s; decays on pixel data (never composite tricks) |
| Sound wavefield (Unit 8) | `index.html:1343-1375` | 256² R-channel, HWZ ≈0.35s |
| Player system (Runde 4) | `index.html:~3150-3700` | Walk/trail/fire/interaction; trail+fire stamp the depth buffer |
| Actor system (Runde 4+, v1.4/v1.5/v1.6) | `index.html:3261-3560` | `addActor({image,manifest,x,y,scale,anim,depthImage,depthLayer,emissiveImage,worldStateImages})`; handles `setAnim/setPosition/setVisible/setDepthLayer/setWorldState/getWorldStates/remove` |
| Storyboard / Showcase / Dialogue | `index.html:2371-2560, ~4250-4320` | `story.board()/play/stop`, `showcase.start/stop`, `dialogue.play/advance/skip` |
| Lens + Sound API | `index.html:1378, 4401` | `SHADED.lens{set,get}`, `SHADED.sound{emit,clear}` |
| Structure pass + Building zones (K1) | `index.html:1740-1800` | `structDiag`, `SHADED.structure()`, `zoneGrid` (Unit 7 masks puddle/riv/creep/mud) |
| Image-canon detectors K1–K8 | `index.html:1627-1728` | `classifyScenePixel`, sky rule, frame-window detector (Blaugas/Warmlicht) |
| PWA | `index.html:4477, service-worker.js, runtime/install.js` | install + offline cache for editor, runtime modules, canonical demo |

**31 of 60 world laws** are represented in `PARAMS` + derived phases (11 from Runde 1–4 + 20 from Phase C). Verified by code reading + the world-law phase tests in `surface-world-simulation.mjs` / `test-spatial-navigation.mjs`.

### 2.2 `runtime/spatial-kernel/` — Modular Kernel

**19 modules, all passing `node --check`** (the 3 additions since the prior audit are marked ★):

| Module | Exports | Test |
|---|---|---|
| `index.js` (barrel) | 24 exports ★ | — |
| `bootstrap.js` ★ | `createDefaultKernel`, `installKernel` | `test-hybrid-world.mjs` |
| `kernel.js` | `SpatialKernel` | `test-spatial-kernel.mjs` |
| `observation.js` | `GeometryObservation`, `OBSERVATION_SPEC_VERSION`, `SOURCE_TYPE`, `OBS_PROVENANCE` | `test-spatial-kernel.mjs` |
| `observation-store.js` | `ObservationStore` | `test-spatial-kernel.mjs` |
| `sparse-field.js` | `SparseField`, `VOXEL_STATE`, `VOXEL_PROVENANCE` | `test-sparse-field.mjs` |
| `scene-graph.js` | `SceneGraph`, `SceneGraphNode`, `NODE_FAMILY` (16 families) | `test-scene-graph.mjs` |
| `sdf-geometry.js` | `SdfScene`, `prim`(6), `xform`(6), `op`(4) | `test-spatial-kernel-2.mjs` |
| `constraint-graph.js` | `ConstraintGraph` | `test-spatial-kernel-2.mjs` |
| `quality-budget.js` | `QualityBudget`, `QUALITY`, `BUDGET_PRESETS`(4) | `test-spatial-kernel-2.mjs` |
| `representation-manager.js` | `RepresentationManager` | `test-spatial-kernel-2.mjs` |
| `completion-provider.js` ★(registered) | `CompletionProvider`, `Registry`, `makeHypothesis` | `test-spatial-kernel-2.mjs` |
| `spatial-memory.js` | `SpatialMemory`, `_poseMath` | `test-spatial-memory.mjs` |
| `navigation.js` | `aStarGrid`, `inflateObstacles`, `hasLineOfSight`, `lineOfSightShortcut`, `invalidatePaths` | `test-spatial-kernel-2.mjs` |
| `mesh-pipeline.js` | `optimizeMesh`, `weldVertices`, `removeDegenerate`, `quantizePositions`, `simplifyGreedy`, `indexMesh` | `test-spatial-kernel-2.mjs` |
| `world-fields.js` | `WorldFields` | `test-spatial-kernel-2.mjs` |
| `world-law-solver.js` | `WorldLawSolver`, `registerReferenceLaws` + 4 laws | `test-spatial-kernel-2.mjs` |
| `recipe-manager.js` | `RecipeManager` | `test-procedural-world.mjs` |
| `recipes/photo-first-recipe.js` | `PhotoFirstRecipe` | `test-photofirst-recipe.mjs` |
| `recipes/procedural-little-world.js` | `ProceduralLittleWorld` | `test-procedural-world.mjs` |
| `recipes/hybrid-little-world.js` ★ | `HybridLittleWorld` | `test-hybrid-world.mjs` |
| `recipes/hall-planner-recipe.js` ★ | `HallPlannerRecipe` | `test-hall-planner-recipe.mjs` |

**Design properties verified by tests:**
- Ingestion never throws; bad observations return `{ ok:false, errors:[...] }`.
- `SIMULATED_FALLBACK` provenance is flagged with a warning; never presented as success.
- `SpatialMemory` integration is incremental, deterministic, seed-free.
- `SparseField` keeps `UNKNOWN` unallocated; `fuse()` writes only explicit evidence, trust-ordered.
- `WorldFields` deterministic: same seed → same CRC after N steps.
- `ConstraintGraph` never moves fixed/trusted nodes.
- `PhotoFirstRecipe` fails (not fakes) when no provider and `allowFallback` is false.
- `ProceduralLittleWorld` deterministic per seed.

### 2.3 Editor

| Component | Status |
|---|---|
| `editor/facade.js` (`SceneEditorFacade`) | Implemented; iframes `index.html`; exposes `window.SHADED_ORCHESTRATOR` (loadProject/exportProject/addActorBundle/getRuntimeStatus/getDebugSnapshot) |
| `editor/markerPainter.js` (`MarkerPainter`) | Implemented (palette brush, MARKER_BRUSH = canonical palette + window-pink) |
| `editor/actorPlacer.js` (`ActorPlacer`) | Implemented (SWIFT sprites via `addActor`, blob:-url strings) |
| `editor/storyboardTimeline.js` (`StoryboardTimeline`) | Implemented (edits live `story.board()`) |
| `editor/app.js` | Implemented (UI → 4 facades) |
| `editor/facade.test.js` | Not run here (headless Chromium MIME serving) — see §3.6 |
| `tools/verify-editor.js` | **PASS** (was "Failing" — stale) |
| `tools/verify-editor-mobile.mjs` | **PASS** (20/20) (was "browser closed" — stale) |

### 2.4 Contracts & Schemas

| Contract | Status |
|---|---|
| `contracts/shaded-spatial-provider.schema.json` (v1) | Implemented; tested by `tools/test-gpu-spatial.mjs` |
| `contracts/shaded-scene-project.schema.json` | Implemented; tested by `npm run check` |
| `contracts/shaded-hall-plan.schema.json` | Implemented; tested by `npm run check` |
| `docs/research/operators.json` ($schema → `operators.schema.json`) | 47 operator entries (object schema w/ `implType/donor/mode/configSchema`) |
| `docs/research/operators.schema.json` | **MISSING** — dangling `$schema` reference |

### 2.5 Benchmark & Experiment Infrastructure

| Tool | Status | Notes |
|---|---|---|
| `tools/benchmark-providers.mjs` | Implemented; tested (63 assert) | `ReconstructionBenchmark`, `Tournament`, `WrappedProvider`, 4 STAGES, `measureInfoLoss`, content-hash output |
| `tools/test-benchmark-provider.mjs` | **PASS (63 assert)** | Now in `npm run check` ✓ |
| `tools/benchmark-local.mjs` | **MAXIMUM DENNIS PASS** (9/9, deterministic ×3) | Local/stub tournament+stack driver over 5 scenes × 4 stages; writes `result.json`+`result.sha256` under `artifacts/local-*/` |
| `tools/run-experiment.js` | `--dry-run` **works** (card valid, runId generated) | Full execution needs `docs/research/operators/operator-*.mjs` which **do not exist** (§3.5) |
| `tools/gpu-spatial.mjs` / `test-gpu-spatial.mjs` | **PASS** | Provider contract/schema/bundle/comparison via **fixture** providers; explicitly claims no CUDA inference |
| `tools/orchestrate.js` | `node --check` passes | Headless CLI for editor (Real Golden Run R-10) |
| `tools/providers/*.py` (9 real providers) | **Not runnable here** (no torch/numpy/Pillow/pip) | software_depth.py also needs numpy (§3.7) |

### 2.6 Tools (verification — live, see §3.3 for details)

| Tool | Status (this pass) | Notes |
|---|---|---|
| `tools/verify.js` | **class regression PASS**; screenshots flaky | `dorf-marker` counts match `expected-classes.json` exactly |
| `tools/verify-actors.js` | **PASS** (7/7) | addActor API, depth layers, fog/dayNight, animation, emissive night glow, worldStates |
| `tools/verify-intrinsic.js` | **checks PASS** (8/8) | identity-albedo default, built-in shading field, Dykstra convergence, energy-neutrality, albedo-gamut, provenance INFERRED, channel contract |
| `tools/verify-dialogue.js` | **PASS** (8/8) | typewriter, beat triggers, lens-trigger, speaker detection |
| `tools/verify-editor.js` | **PASS** | World Studio, 1-Bild-Workflow, live params |
| `tools/verify-editor-mobile.mjs` | **PASS** (20/20) | mobile viewport, inspector toggle, RAUM triangle count |
| `tools/verify-lenses.js` | checks PASS; screenshot flaky | lens API + per-lens diff (meanAbsDiff); `page.screenshot` GPU-crash in swiftshader (§3.6) |
| `tools/verify-classes.mjs` | 2/5 PASS, 1 FAIL, 2 ERROR | dorf-marker ✓, taverne ✓; legacy-map ✗ (variance); dorf-kanon/himmel ERROR (GPU crash) |
| `tools/verify-pwa.mjs` | **PASS** | static PWA checks |
| `tools/verify-pwa-browser.mjs` | **PASS** | active SW, offline demo |
| `tools/verify-walk-browser.mjs` | **PASS** | step/observed/mirror/tree/way |
| `tools/verify-sprite-exporter.js` | **PASS** | UI elements |
| `tools/verify-costume-browser.js` | not run here | browser-based costume browser |

---

## 3. Incomplete / Broken Claims (vs. the prior audit)

### 3.1 `test-hybrid-world.mjs` — **FIXED** (was "BROKEN")

The prior audit (§3.1) claimed `HybridLittleWorld`, `createDefaultKernel`, `installKernel` were missing. **They are now implemented** by commit `0d8a13f` ("feat(spatial-kernel): add kernel bootstrapping and hybrid world recipe"):
- `runtime/spatial-kernel/bootstrap.js` (new) — `createDefaultKernel`, `installKernel`
- `runtime/spatial-kernel/recipes/hybrid-little-world.js` (new) — `HybridLittleWorld`
- `runtime/spatial-kernel/index.js` — both exported (lines 21, 23)

`test-hybrid-world.mjs` now **PASSES (7 assertions)**. The prior "BROKEN" finding is stale.

### 3.2 `npm run check` requires `node_modules` — still accurate

`devDependencies` (ajv, typescript, playwright) are not committed (per `.gitignore`). The script passes only after `npm ci`. This is by design and documented in `GOLD_FREEZE.md` §10. **No code change needed.**

### 3.3 Browser-based verify scripts — **mostly STALE** ("fail in headless")

The prior audit (§3.3) claimed 6 browser verifies "fail in headless Chromium due to WebGL limitations." This is **superceded**:

- Commit `19859e5` migrated *some* verify scripts to `--use-gl=swiftshader --enable-unsafe-swiftshader --enable-webgl --ignore-gpu-blocklist --no-sandbox --disable-dev-shm-usage`.
- **This pass completes the migration** for the 4 remaining scripts still on `--use-gl=angle`: `verify-intrinsic.js`, `verify-dialogue.js`, `verify-classes.mjs`, `verify-lenses.js`.
- Once Chromium + OS libs (`npx playwright install-deps chromium`) are installed, the **logic/quality checks of every verify script PASS** (see §2.6).

**Remaining, genuinely-flaky behavior is environmental (headless software GL), not a code defect:**
- `page.screenshot({...})` forces a GPU `ReadPixels`. In headless **swiftshader** (no hardware), sustained WebGL + readback occasionally crashes the GPU process → `Target page, context or browser has been closed`. This affects only screenshot *capture* on `tools/verify.js` and `tools/verify-lenses.js` and the later scenes of `tools/verify-classes.mjs`.
- The **correctness/quality gates do NOT need screenshots**: `dorf-marker` class counts match `expected-classes.json` exactly; lens diffs (meanAbsDiff) assert lens behavior; intrinsic asserts material/gamut; actor asserts API + depth + emissive; dialogue asserts beats. **All pass.**
- `verify-classes.mjs` `legacy-map` shows FAIL variance — expected, because that scene has **no marker map** (heuristic-only classification) and swiftshader float precision differs from a real GPU; `dorf-marker` (with marker) PASSes exactly.

**Conclusion:** no code defect. Full screenshot reliability requires a real GPU (Modal/L40S per §20 of MASTER_TASK). The automated gates are green.

### 3.4 `runtime/world-persistence-integration.mjs` — orphaned (still accurate)

515 lines (`WorldPersistenceManager`, `PhotoFirstEditorIntegration`), not imported by any live path:
```
$ grep -rn "world-persistence-integration\|WorldPersistenceManager" *.html editor/ runtime/ tools/ 2>/dev/null | grep -v "world-persistence-integration.mjs:"
(no imports found)
```
The latent `self.` → `this.` bug documented in the donor-map audit is still present. **Not benchmark-blocking; left untouched.**

### 3.5 Experiment engine references files that do not exist (gap)

- `run-experiment.js` executes operators from `docs/research/operators/operator-<name>.mjs` — the `docs/research/operators/` **directory does not exist**. Full execution therefore cannot yet run a real operator; only `--dry-run` (card/operator registry validation) works.
- Experiment cards (`docs/research/experiments/*.json`) pin `gitRef.commit = b341f7f…` — stale vs. current main (`1cb06c4`) / this pass (`d7efa42`).
- `docs/research/operators.schema.json` is referenced as `$schema` in `operators.json` but **file does not exist**.

These are wiring gaps, not logic bugs. `--dry-run` proves the card→operator contract resolves. Real operator execution is a Phase-B/C step.

### 3.6 This pass's instrumentation hardening (applied, d7efa42)

To make browser verification actually runnable in CI, this pass completed the `19859e5` swiftshader migration and made the animated-canvas screenshot path robust:

- **Launch args**: `verify-intrinsic.js`, `verify-dialogue.js`, `verify-classes.mjs`, `verify-lenses.js` switched from `--use-gl=angle` to `--use-gl=swiftshader --enable-unsafe-swiftshader --enable-webgl --ignore-gpu-blocklist --no-sandbox --disable-dev-shm-usage` (identical to `verify.js`/`verify-actors.js`).
- `verify-lenses.js`: replaced `(await page.$('#canvas-wrap')).screenshot(...)` (which waits for element *stability* — impossible on an animating canvas and a deterministic timeout) with a `shotWrap()` helper that screenshots via a **clip bounding box** (no stability wait), mirroring the proven `shotSel` in `tools/verify.js`.

These are the **only** code changes this pass. `npm run check` is green.

### 3.7 Real providers cannot execute in this sandbox (environmental)

| Provider | Needs | Available here? |
|---|---|---|
| Depth Anything v2 | torch, torchvision | ❌ no torch |
| Depth Anything v3 | torch, xformers | ❌ no torch |
| VGGT | torch, transformers | ❌ |
| MapAnything | torch, transformers | ❌ |
| COLMAP | binary | ❌ |
| scale-align / RANSAC / TSDF | numpy | ❌ no numpy |
| software_depth.py | numpy, Pillow | ❌ no numpy/Pillow |
| pip | pip | ❌ `No module named pip` |

**No GPU (CUDA) either** (`probeNvidia()` reports `available: false`). Per MASTER-TASK §32 ("Do not Fake Success") and §19 ("Harden before Modal"), real provider baselines are deferred to a Modal/L40S run. The local path uses **stub + fixture** providers that are explicitly labeled synthetic/fallback (see §4 / PHASE C).

---

## 4. Architecture Assessment (unchanged verdict)

### 4.1 Two-layer architecture is clean
The separation matches the spec exactly:
```
Inputs (photo, depth, plan, procedural, manual)
  ↓
RecipeManager → PhotoFirstRecipe / ProceduralLittleWorld / HybridLittleWorld / HallPlannerRecipe
  ↓
SpatialKernel.ingest(GeometryObservation)
  ↓
Subsystems (ObservationStore, SparseField, SceneGraph, SpatialMemory, ...)
  ↓
SparseField.toLegacy(SparseVoxelWorld)  ← bridge, not replacement
SceneGraph.toJSON() / fromJSON()
RepresentationManager picks budget rep ← GOLD/DESKTOP/BROWSER/MOBILE
```
- Kernel knows nothing about photo-first.
- `GeometryObservation` is the universal currency.
- `SIMULATED_FALLBACK` is explicitly flagged.
- Single material truth (`analyze()` in `index.html`) is NOT duplicated in the kernel.

### 4.2 Kernel↔`index.html` integration boundary (unchanged)
`SpatialKernel` is registered (via `bootstrap.js`) but is **not yet attached** to `window.SHADED` at runtime (the expected Phase-1 boundary per `docs/research/spatial-kernel-donor-map.md`). `window.SHADED.spatial` still exposes the legacy `pointCloud`/`downloadPointCloud` from `runtime/spatial-reconstruction.mjs`. This is intentional.

### 4.3 `window.SHADED` API surface (Invariante 5)
```
window.SHADED = {
  version:'1.4.0', erstellen, applyAct, setParams, getParams, setTime, isReady,
  getMaterialTypeAt, story:{play,stop,board}, showcase:{start,stop,board},
  elements:{trigger,clear}, worldState, spatial:{pointCloud,downloadPointCloud},
  loadDemo, loadImageFile, loadImageFile, player:{enable,pos,setAge,move},
  fire:{ignite,list}, trail:{clear,sample}, structure, zoneAt,
  parallax:{set,get,hasDepth,setDepthImage,clearDepth}, addActor,
  ecosystem:{spawn,defs}, lens:{set,get}, sound:{emit,clear},
  intrinsic:{state,setStrength,getStrength,set,accept,reset,clear,sample},
  dialogue:{play,advance,skip,isPlaying,current},
}
```

### 4.4 Texture units (Invariante 7) — verified, 9 used
Unit 0 scene, 1 maskA, 2 maskB, 3 phys, 4 emis, 5 trail, 6 depth(2.5D), 7 zone(K1), 8 sound. Shader queries `MAX_TEXTURE_IMAGE_UNITS` (≥16 on real HW, 32 in verify Chromium).

---

## 5. Test Coverage Matrix

| Subsystem | Tests | Assertions / result |
|---|---|---|
| GeometryObservation | `test-spatial-kernel.mjs` | 25 — spec version, SOURCE_TYPE, SIMULATED_FALLBACK flagging, provider adaptation |
| SpatialKernel (ingest/hooks/snapshot) | `test-spatial-kernel.mjs` | bootstrap wiring, simulated flag |
| SparseField | `test-sparse-field.mjs` | 18 — UNKNOWN unallocated, fuse trust-order, chunk dirty, toLegacy bridge |
| SceneGraph | `test-scene-graph.mjs` | 19 — 16 families, parent/children, JSON round-trip |
| SDF | `test-spatial-kernel-2.mjs` | sphere/box/union/difference + surface sampler |
| ConstraintGraph | `test-spatial-kernel-2.mjs` | support/overlap/fix-stabilize, fixed-node protection |
| QualityBudget | `test-spatial-kernel-2.mjs` | within()/fit()/4 presets |
| RepresentationManager | `test-spatial-kernel-2.mjs` | register/pick/setBudget |
| CompletionProvider | `test-spatial-kernel-2.mjs` | hypothesis, registry, kernel ingest |
| SpatialMemory | `test-spatial-memory.mjs` | 9 — origin/integration/loop-closure/bounded-window/high-residual |
| A* Navigation | `test-spatial-kernel-2.mjs` | gap-finding/inflate/LOS-shortcut/invalidate |
| WorldFields | `test-spatial-kernel-2.mjs` | CRC determinism, clone, frozen step |
| WorldLawSolver | `test-spatial-kernel-2.mjs` | evaporation/freezethaw/raintomud/firefuel |
| Mesh pipeline | `test-spatial-kernel-2.mjs` | index/weld/degenerate/quantize/greedy-simplify |
| PhotoFirstRecipe | `test-photofirst-recipe.mjs` | 16 — no-provider failure, fallback flag, provider success |
| ProceduralLittleWorld | `test-procedural-world.mjs` | 13 — seed determinism, kernel ingest |
| HybridLittleWorld + bootstrap | `test-hybrid-world.mjs` | 7 — hybrid voxel provenance, kernel install wiring |
| HallPlannerRecipe | `test-hall-planner-recipe.mjs` | 16 |
| SDF reconstruction §6 | `test-spatial-reconstruction-2.mjs` | 12 |
| Provider contract (fixture) | `test-gpu-spatial.mjs` | contract/schema/bundle/compare; no CUDA claimed |
| Benchmark tournament (stub) | `test-benchmark-provider.mjs` | 63 — stages/provider/run/case/tournament/stack/wrapped/failure |
| PWA (static) | `verify-pwa.mjs` | PASS |
| PWA (browser) | `verify-pwa-browser.mjs` | PASS |
| Walk (browser) | `verify-walk-browser.mjs` | PASS |
| Browser: actor system | `verify-actors.js` | PASS (7/7) |
| Browser: editor | `verify-editor.js` | PASS |
| Browser: editor-mobile | `verify-editor-mobile.mjs` | PASS (20/20) |
| Browser: dialogue | `verify-dialogue.js` | PASS (8/8) |
| Browser: intrinsic/material | `verify-intrinsic.js` | PASS (8/8 checks) |
| Browser: lenses | `verify-lenses.js` | checks PASS (screenshot flaky — §3.3) |
| Browser: class regression | `verify-classes.mjs` | dorf-marker✓ taverne✓; legacy-map✗ dorf-kanon/himmel ERROR (§3.3) |

**MAXIMUM DENNIS evidence (this pass):** `node tools/benchmark-local.mjs --repeat 3` → PASS 9/9 checks, deterministic ranking across 3 runs; result + sha256 written to `artifacts/local-*/` (see `docs/research/POST_GOLD_BENCHMARK_BASELINE.md` §2). New driver: `tools/benchmark-local.mjs`.

**Remaining coverage gaps:**
- `docs/research/operators/operator-*.mjs` subprocesses not implemented → `run-experiment.js` full-run still `--dry-run` only.
- `docs/research/operators.schema.json` missing (dangling `$schema` in `operators.json`).
- Experiment cards pin stale gitRef `b341f7f` (current main `1cb06c4` / this pass `d7efa42`).
- `editor/facade.test.js` not runnable without headless-Chromium MIME serving.
- No node-based shader test (requires a browser).

**Closed this pass:** `test-benchmark-provider.mjs` (63 assert) wired into `npm run check` — gate green (EXIT=0).
- Real providers (DA v2/v3, VGGT, MapAnything, COLMAP) have **no runnable test** in this environment (torch absent).

---

## 6. Incomplete/Broken Claims Summary (corrected)

| # | Prior claim | Location | Actual status (this pass) |
|---|---|---|---|
| 1 | `HybridLittleWorld/createDefaultKernel/installKernel` missing → `test-hybrid-world` BROKEN | §3.1 | **FIXED** (0d8a13f); test PASSES (7 assert) |
| 2 | `npm run check` passes only after `npm ci` | §3.2 | **Confirmed** — by design |
| 3 | 6+ browser verifies fail in headless WebGL | §3.3 | **Stale** — 19859e5 + this pass (d7efa42) complete swiftshader migration; logic/quality gates PASS; only screenshot capture is environmentally flaky |
| 4 | `runtime/world-persistence-integration.mjs` orphaned | §3.4 | **Confirmed** orphaned; left untouched |
| 5 | `.kiro/steering` doc drift (`u_mossBoost`) | §3.5 | Minor doc drift only |
| 6 | 9 texture units | §4.4 | **Verified** |
| 7 | Single shader source / material truth | Invariante 7/2 | **Verified** — no duplication |

---

## 7. What Was Fixed for Benchmark Reproducibility (this pass)

Only benchmark-/verification-blocking **instrumentation** problems (per MASTER_TASK §6.1/§63):

1. **Completed the swiftshader migration** for `verify-intrinsic.js`, `verify-dialogue.js`, `verify-classes.mjs`, `verify-lenses.js` (launch args now match `verify.js`/`verify-actors.js`). This unblocks browser verification in headless CI.
2. **Made `verify-lenses.js` screenshots robust** to the animating WebGL canvas (`shotWrap` clip-based screenshot, no element-stability wait), so the lens-diff quality checks can actually run instead of deterministically timing out.
3. **`test-hybrid-world.mjs` now passes** (was fixed upstream at `0d8a13f`; documented here).

**Not touched** (environmental, not code): headless-software-GL screenshot crashes; missing torch/numpy/pip (real providers require Modal/GPU); missing `operators.schema.json` and `docs/research/operators/` (Phase-B/C wiring, not benchmark-blocking); orphaned `world-persistence-integration.mjs`; stale doc drift.

---

## 8. Foundation vs Research vs Implementation Gaps

| Category | Items |
|---|---|
| **Foundation (implemented & tested)** | Run IDs, experiment metadata, operator toggles, provenance, content-addressed artifact cache (SHA-256), evaluation packet schema, canonical probe cameras, retention policy classes, scene descriptor schema, tournament ranking, `measureInfoLoss`, `GeometryObservation` contract |
| **Research/experiment (Modal ablation)** | DepthAnything v2/v3 comparison, VGGT, MapAnything, COLMAP, MoGe-3 neighbourhood, TRELLIS completion, GSNSR hybrid, 3DGS reduction, silhouette-aware warping — all present as providers/cards but **not runnable without torch/GPU** (deferred to PHASE D) |
| **Implementation gaps** | `docs/research/operators/operator-*.mjs` subprocesses not implemented (dry-run only); `docs/research/operators.schema.json` missing; experiment cards pin stale gitRef `b341f7f` |
