# SHADED Spatial Kernel — Current System Inventory & Donor Map

> **Deliverable for spec §2 (First Deliverable).** Inspect-don't-trust audit of the
> currently implemented spatial features, mapped to research donors (spec §1).
> Findings are derived from reading the code (`node --check`, API-surface grep,
> targeted reads) — not from README claims.

## 0. Bottom line / baseline status

- **Syntax baseline (PHASE 0):** 6 runtime modules were **genuinely broken**
  (Python-style `#` line comments, invalid in ES modules, plus duplicate
  `export` blocks and a stray `}`). They are now syntactically valid
  (`node --check` passes on all 14 spatial modules). The `#` comments were
  converted to `//` with a string-aware pass so CSS hex colors inside template
  strings (`#333`, `#4ade80`) were preserved.
- The 6 broken modules form a largely **orphaned subtree**:
  `world-persistence-integration.mjs` is not imported by anything in the live
  app; it dynamically imports `reverse-viewfinder-mode.mjs` →
  `spatial-system-integrator.mjs` → `depth-to-local-mesh.mjs` →
  `patch-registration.mjs`. They were dead-but-present and never reached by the
  running app — which is why the breakage was invisible until `node --check`.
- **`SpatialSystemIntegrator.processPhoto` contains fallback depth generators
  (`createSimulatedDepthMap`, `createFlatDepthMap`)** that emit *fake* depth when
  no provider is available. Per spec ("do not fake provider output") these must
  be clearly gated as explicit fallbacks, never presented as successful
  inference. This is the single most important behavioural caveat for the kernel
  inversion (§16).
- Verified green: `node --check` on all spatial modules + `node
  tools/test-spatial-navigation.mjs` passes. Full `npm run check` additionally
  requires `node_modules` (ajv, typescript, playwright) which are not installed
  in this sandbox; browser/visual verification steps were therefore not run here.

## 1. Module-by-module inventory

Notation per module: **API** (real exports), **Implemented**, **Limitations**,
**Disposition** (KEEP / IMPROVE / GENERALIZE / REPLACE), **Donor**, **Approach**,
**License**, **Test**.

---

### 1.1 `runtime/spatial-reconstruction.mjs`
- **API:** `seededRandom`, `estimatePointNormals`, `connectedSurfaceComponents`,
  `fitPlaneRansac`, `fitGeometricPrimitives` (plane/box/cylinder + model
  selection), `completeFromPrimitives`, `completeMirroredShell`,
  `buildSpatialEnvironment`.
- **Implemented:** covariance + `eigenSymmetric3` (analytic 3×3 eigen), PCA
  normals, RANSAC plane, convex-hull box fit, cylinder fit, connected components
  via image-adjacency, primitive-driven completion (plane/box/cylinder sampling),
  mirrored-shell completion.
- **Limitations:**
  - `connectedSurfaceComponents` uses **image-grid adjacency** (`x±1, y±1`),
    not 3D spatial neighbourhood → merges disconnected depth jumps (violates
    MoGe-3 donor principle, spec §1.12).
  - `estimatePointNormals` is a fixed-radius / image-window estimator with **no
    confidence weighting and no edge preservation** (spec §6C).
  - `fitGeometricPrimitives` model selection exists but primitive set is small
    (no sphere/capsule/wedge/wall/floor/support-surface; spec §6E).
  - No spatial hashing; neighbourhood passes are O(n²) over candidate points in
    several helpers (spec §6A).
- **Disposition:** **KEEP + IMPROVE**. Sound math (covariance/eigen/RANSAC) is
  reused; neighbourhood and normal estimation are upgraded in place (§6).
- **Donor:** MoGe-3 (§1.12 – geometry-aware 3D neighbourhood), fogleman/sdf
  (§1.6 – primitive vocab), apple/ml-lito (§1.9 – compact structure).
- **Approach:** add `geometryNeighbourhood(points, k, maxJump)` using a voxel
  hash; reject neighbours whose 3D distance ≫ local depth gradient; add normal
  reliability score; extend primitive set with model-selection penalty.
- **License:** internal SHADED code (no donor code copied).
- **Test:** `tools/test-spatial-reconstruction.mjs` — assert component
  connectivity rejects depth discontinuities; assert normal reliability ∈ [0,1].

---

### 1.2 `runtime/sparse-voxel-world.mjs`
- **API:** `VOXEL_STATE` (UNKNOWN/FREE/SURFACE), `VOXEL_PROVENANCE`
  (MEASURED/OBSERVED/RECONSTRUCTED/INFERRED/GENERATED/USER_APPROVED),
  `providerBundlePoints`, `SparseVoxelWorld` (class).
- **Implemented:** flat keyed voxel map (`x:y:z`), provenance tracking, provider
  point-bundle import with `pointBudget` decimation, decode/encode of channel
  bundles.
- **Limitations:**
  - Single flat `Map`, **no chunks, no dirty tracking, no multi-resolution**
    (spec §8).
  - Provenance enum exists but is **not consistently written** by callers;
    GENERATED vs INFERRED vs USER not distinguished in render path.
  - No confidence-weighted evidence fusion; observations overwrite rather than
    fuse.
- **Disposition:** **GENERALIZE → sparse chunked world**. Keep `VOXEL_STATE` /
  `VOXEL_PROVENANCE` as canonical (reuse, do not reinvent — spec PHASE 0 note).
- **Donor:** ZyFou/ProceduralTerrains (§1.4 – chunks, dirty tracking,
  camera-independent world state), VAST-AI/TripoSplat (§1.8 – budget, not truth).
- **Approach:** wrap existing `SparseVoxelWorld` behind a `SparseField`
  interface; add `Chunk` with dirty flag + LRU eviction; add
  `fuseObservation(evidence, weight)`.
- **License:** internal.
- **Test:** `tools/test-sparse-voxel.mjs` — chunk dirty flag flips on write;
  UNKNOWN stays UNKNOWN after GENERATED fill of one chunk only.

---

### 1.3 `runtime/surface-world-simulation.mjs`
- **API:** `SpatialWorldSimulation` (class, fixed legacy field list:
  water/wet/snow/ice/fire/smoke/soot/mud/grass/blood/urine/temperature/…),
  `segmentCells`, `segmentIsTraversable`.
- **Implemented:** grid-based world-law fields, field coupling helpers,
  traversability segmentation.
- **Limitations:**
  - **No separation of A (world state) / B (solver) / C (visual effect)**
    (spec §11) — appearance fields are mixed with state.
  - No fixed-timestep / seed-deterministic stepping (spec §11).
  - Field list is hardcoded; adding a law (e.g. rust, heat) requires editing the
    core rather than registering a module.
- **Disposition:** **KEEP + FORMALIZE**. Preserve the field strengths/coupling
  that already work; separate state/solver/effect; add seed + fixed dt.
- **Donor:** (none external — SHADED-native strength; REST3D §1.2 only for the
  physical-stabilization extension in §10.)
- **Approach:** introduce `WorldFields` (state store) + `WorldLawSolver`
  (pure step fn, seedable) + effect layer consumed by renderer; register laws
  by table, not by editing core.
- **License:** internal.
- **Test:** `tools/test-world-sim.mjs` — identical seed → identical field CRC;
  freeze/thaw conserves mass within tolerance.

---

### 1.4 `runtime/spatial-navigation.mjs`
- **API:** `dykstraProject`, `boxSet`, `diskSet`, `buildNavigationGrid`,
  `dijkstraGrid`, `worldToCell`, `cellToWorld`, `addProceduralBoundaries`,
  `buildWorldLawPoints`.
- **Implemented:** Dijkstra grid pathing, Dykstra projection onto constraint
  sets, procedural boundary obstacles, world-law point emission.
- **Limitations:**
  - **Dijkstra only** (spec §12 wants A*); no clearance / slope / portal /
    obstacle inflation by actor radius; no path invalidation on geometry change.
  - Navigation consumes a *separate* grid built from the environment, not the
    same spatial truth as collision (spec §12 "no invisible nav-world").
- **Disposition:** **IMPROVE**. Keep shared algos; add A*, clearance, slope,
  portals, dirty-region invalidation; source the grid from `SparseField`.
- **Donor:** (SHADED-native; pascalorg/editor §1.3 only for spatial queries on
  the semantic graph.)
- **Approach:** `aStarGrid(grid, start, goal, {clearance, slopeMax, actorRadius})`;
  `inflateObstacles(grid, radius)`; `invalidatePaths(dirtyCells)`.
- **License:** internal.
- **Test:** `tools/test-navigation.mjs` — A* length ≤ Dijkstra length; path
  respects clearance; invalidation drops stale path.

---

### 1.5 `runtime/spatial-system-integrator.mjs`  *(was broken — fixed)*
- **API:** `SpatialSystemIntegrator` (`processPhoto`, `initialize`,
  `loadPhoto`, `applyCalibration`, `generateDepthMap`, `createSimulatedDepthMap`,
  `createFlatDepthMap`, `createSurfacePatch`, `convertPatchToPointCloud`,
  `registerPointCloudWithSpatialSystem`, `getStatistics`).
- **Implemented:** end-to-end PHOTO-FIRST pipeline that loads a photo, asks
  `MonocularDepthProvider` for depth (falling back to `createSimulatedDepthMap`
  / `createFlatDepthMap`), builds a `SurfacePatch`, converts to a point cloud and
  registers it.
- **Limitations / risks:**
  - **Architectural centre is PHOTO-FIRST** (spec §0) — the kernel should know
    nothing about photo-first. This class is the thing to **invert** (§3, §16).
  - **`createSimulatedDepthMap` / `createFlatDepthMap` produce fake depth** and
    are used as silent fallbacks. Must be explicitly flagged, never reported as
    successful inference.
  - Hard-codes `new MonocularDepthProvider()` and `new PhotoFirstWorld()` inside
    the constructor → cannot be driven by arbitrary observations.
- **Disposition:** **REPLACE (role) / KEEP (logic)**. Keep the useful pipeline
  steps as a `PhotoFirstRecipe` under `RecipeManager`; remove the integrator's
  central position; feed observations through the universal contract (§4).
- **Donor:** TencentARC/Pixal3D (§1.10 – provider architecture reference),
  Tencent HY-World (§1.11 – multi-channel observation result).
- **Approach:** extract `processPhoto` into `PhotoFirstRecipe.run(observation)`;
  emit a `GeometryObservation` (§4); the kernel consumes it. Gate simulated
  depth behind an explicit `allowFallback` flag and mark provenance
  `GENERATED`/not `MEASURED`.
- **License:** internal; provider wrappers must not vendor restricted models.
- **Test:** `tools/test-photofirst-recipe.mjs` — recipe emits a valid
  `GeometryObservation`; with `allowFallback:false` and no provider it errors
  instead of faking depth.

---

### 1.6 `runtime/depth-to-local-mesh.mjs`  *(was broken — fixed)*
- **API:** `DepthToMeshProcessor` (class, discontinuity-aware meshing),
  `DepthProcessingUtils`.
- **Implemented:** depth→mesh with discontinuity handling (edge rejection, local
  mesh stitching).
- **Limitations:** tuned for single depth maps; not yet fed by the universal
  observation contract; no confidence-weighted fusion across multiple
  observations (spec §5 memory).
- **Disposition:** **KEEP + GENERALIZE**. Reuse as the meshing backend behind
  `GeometryStore`; accept `GeometryObservation` (§4) instead of raw depth.
- **Donor:** MoGe-3 (§1.12 – discontinuity / thin-structure handling).
- **Approach:** `DepthToMeshProcessor.fromObservation(obs)`; fuse multiple
  observations via `SpatialMemory` weights.
- **License:** internal.
- **Test:** `tools/test-depth-mesh.mjs` — meshing rejects a depth discontinuity
  (no triangle across the jump).

---

### 1.7 `runtime/patch-registration.mjs`  *(was broken — fixed)*
- **API:** `PatchRegistrar` (ICP / feature / overlap registration),
  `RegistrationUtils`.
- **Implemented:** patch-to-patch registration (ICP + overlap scoring).
- **Limitations:** standalone; not wired into an incremental `SpatialMemory`
  (spec §5) — drift correction / anchor windows absent.
- **Disposition:** **KEEP + GENERALize**. Reuse as the registration backend;
  call it from `SpatialMemory.integrate()` with anchor/keyframe bookkeeping.
- **Donor:** Robbyant/lingbot-map (§1.1 – keyframes, drift correction,
  anchor context).
- **Approach:** `PatchRegistrar.register(obs, anchor)` returns residual +
  world-frame transform; `SpatialMemory` stores it.
- **License:** internal.
- **Test:** `tools/test-registration.mjs` — two overlapping patches register
  with bounded residual; misfit above threshold is reported, not silently
  absorbed.

---

### 1.8 `runtime/reverse-viewfinder-mode.mjs`  *(was broken — fixed)*
- **API:** `ReverseViewfinderMode` (manual camera placement UI + pipeline),
  `ReverseViewfinderHelper`.
- **Implemented:** interactive camera placement, reference-point calibration,
  depth preview, patch creation; calls into calibrator/registrar/integrator.
- **Limitations:** tightly coupled to `SpatialSystemIntegrator` (the thing being
  inverted); large UI+logic file.
- **Disposition:** **KEEP (valuable) + REFACTOR**. Keep as a
  `ManualCameraRecipe` / editor mode; emit `GeometryObservation`(s) with camera
  pose + FOV (spec §4, §16). Do not let it define the core.
- **Donor:** Tencent HY-World (§1.11 – camera observation), Pixal3D (§1.10).
- **Approach:** decouple from integrator; produce observations; let kernel
  register them.
- **License:** internal.
- **Test:** `tools/test-reverse-viewfinder.mjs` — placing a camera emits a
  valid camera-only `GeometryObservation` (pose + FOV), no depth required.

---

### 1.9 `runtime/reverse-viewfinder-calibrator.mjs`  *(was broken — fixed)*
- **API:** `ReverseViewfinderCalibrator` (pose optimization, EXIF/focal
  inference, principal point, lens distortion), `ReverseViewfinderHelper`.
- **Implemented:** reprojection-error pose optimization, simplified EXIF→FOV,
  distortion iteration, heuristic camera suggestion.
- **Limitations:** heavily simplified (comments admit "simplified"); no rigorous
  bundle adjustment.
- **Disposition:** **KEEP**. Useful as a lightweight camera-estimation helper
  behind the observation contract; mark approximations explicitly.
- **Donor:** Tencent HY-World (§1.11 – camera/depth/normals decomposition).
- **Approach:** expose `estimateCamera(obs)` → `GeometryObservation.camera`.
- **License:** internal.
- **Test:** `tools/test-calibrator.mjs` — known camera reprojects reference
  points within tolerance; out-of-range input rejected.

---

### 1.10 `runtime/world-persistence-integration.mjs`  *(was broken — fixed; orphaned)*
- **API:** `WorldPersistenceManager`, `PhotoFirstEditorIntegration`.
- **Implemented:** autosave, import/export, editor facade hooks for photo-first.
- **Limitations:** **not imported by any live code** (orphaned); mixes
  persistence with photo-first editor integration; uses `self.` where `this.`
  was likely intended (latent bug).
- **Disposition:** **GENERALIZE**. Fold persistence into the kernel's
  `World` serialization (portable Little-World format, spec §18+); the
  photo-first editor integration becomes a recipe consumer.
- **Donor:** ZyFou/ProceduralTerrains (§1.4 – save/load), pascalorg/editor
  (§1.3 – scene-graph serialization).
- **Approach:** `World.toPortable()` / `World.fromPortable()`; remove `self.`
  bug; re-wire editor through `window.SHADED` facade only.
- **License:** internal.
- **Test:** `tools/test-world-persistence.mjs` — round-trip serialize/deserialize
  preserves voxels + provenance + observations.

---

### 1.11 `runtime/monocular-depth-provider.js`
- **API:** `MonocularDepthProvider` (class; also `window.MonocularDepthProvider`).
- **Implemented:** wrapper around `window.DepthAnything` WASM; loads model,
  runs inference, returns depth + confidence. Falls back gracefully if the WASM
  module is absent.
- **Limitations:** provider-**specific** name (`DepthAnything`) baked into the
  class; not yet expressed through the universal provider contract (§4).
- **Disposition:** **KEEP + ADAPT**. This is a legit provider; wrap it behind the
  `CompletionProvider`/observation interface (§4, §18+). Never fake its output.
- **Donor:** TencentARC/Pixal3D (§1.10 – provider architecture), Tencent
  HY-World (§1.11).
- **Approach:** `MonocularDepthProvider.provide(observation) → GeometryObservation`
  with channel `depth` + `confidence` + `camera`.
- **License:** **reference only for the upstream model** — do not vendor
  restricted weights; wrapper is SHADED-internal.
- **Test:** `tools/test-monocular-provider.mjs` — without WASM present, returns
  explicit "unavailable" (not fake depth).

---

### 1.12 `runtime/photo-first-reconstruction.mjs`
- **API:** `PhotoCamera`, `Photo`, `SurfacePatch`, `PhotoFirstWorld`,
  `PhotoFirstUtils`.
- **Implemented:** photo/ camera/ patch/ world data model for PHOTO-FIRST;
  patch add + point-cloud conversion; world accumulation.
- **Limitations:** PHOTO-FIRST-specific data model; the *generic* world model
  should live in the kernel `World`/`SceneGraph` (§3, §9). `PhotoFirstWorld`
  overlaps with what the kernel `World` should own.
- **Disposition:** **GENERALIZE**. `PhotoCamera`/`Photo` become observation
  types; `SurfacePatch` becomes a `SceneGraph` node (SURFACE/SCAN); the kernel
  `World` replaces `PhotoFirstWorld` as the accumulation target.
- **Donor:** pascalorg/editor (§1.3 – Scan vs Guide, flat node store with IDs).
- **Approach:** map `PhotoFirst*` → kernel entities; keep helpers as recipe utils.
- **License:** internal.
- **Test:** `tools/test-photofirst-model.mjs` — a `PhotoFirstWorld` snapshot
  imports losslessly into a kernel `World`.

---

### 1.13 `runtime/spatial-viewer.js`  *(pipeline viewer)*
- **API:** WebGL point-cloud viewer with staged pipeline (`spatial-pipeline`
  UI), camera controls, depth/point render.
- **Implemented:** live viewer + pipeline-stage inspection hooks.
- **Limitations:** viewer-specific; not the renderer for the kernel's multiple
  representations (§13) — but its inspection hooks are reusable for the
  inspection mode (spec §round-8 / PHASE 0 note).
- **Disposition:** **KEEP + REUSE hooks**. It becomes one
  `RepresentationManager` consumer (POINTS/POINT_CLOUD).
- **Donor:** PlayCanvas/WebGPU (§1.14 – rendering patterns), zeux/meshoptimizer
  (§1.5 – LOD).
- **Approach:** feed viewer from `RepresentationManager.get('points')`.
- **License:** internal.
- **Test:** manual/browser — covered by existing `tools/verify-*.mjs`.

---

### 1.14 `runtime/spatial-solid-runtime.js`  *(voxel shell renderer)*
- **API:** WebGL2 voxel-shell renderer, touch walk controls, badge UI.
- **Implemented:** renders `SparseVoxelWorld` as block mesh; touch/desktop walk.
- **Limitations:** renderer only; couples to the old `SparseVoxelWorld` shape.
- **Disposition:** **KEEP + ADAPT**. Becomes a `RepresentationManager`
  consumer (BLOCK_MESH) once `SparseField` (§8) stabilizes the world shape.
- **Donor:** zeux/meshoptimizer (§1.5 – block mesh export), PlayCanvas (§1.14).
- **Approach:** renderer reads `SparseField` chunks; keep controls.
- **License:** internal.
- **Test:** manual/browser.

---

### 1.15 `runtime/hall-plan/hall-plan-core.mjs`
- **API:** `PlanPoint`, `PlanVector`, `PlanLine`, `PlanRectangle`, `PlanPolygon`,
  `DetectedLine`, `DetectedRectangle`, `HallElement`, `HallColumn`, `HallWall`,
  `HallCore`, `HallPortal`, `HallStair`, `HallEscalator`, `HallLevel`,
  `HallModel`, `HallAnchor`, `PlanPoint3D`.
- **Implemented:** a **rich structural plan model** — walls, columns, portals,
  stairs, levels, anchors, 2D↔3D plan points. This is the basis for the
  `PlanConstraintRecipe` (spec §16/§17).
- **Limitations:** standalone; not yet expressed as `SceneGraph` nodes
  (WALL/FLOOR/PORTAL/STRUCTURE, §9) nor wired to physical constraints (§10).
- **Disposition:** **KEEP + BRIDGE**. Reuse as the plan parser; emit
  `SceneGraph` structural nodes + `ConstraintGraph` contacts.
- **Donor:** pascalorg/editor (§1.3 – walls/slabs/zones/items, Guide vs Scan),
  REST3D (§1.2 – wall fitting, support/contact).
- **Approach:** `HallModel → SceneGraph` bridge; `HallWall`/`HallColumn` →
  structural nodes; contacts → `ConstraintGraph`.
- **License:** internal.
- **Test:** `tools/test-hall-plan-bridge.mjs` — a parsed hall emits the expected
  WALL/PORTAL node set with stable IDs.

---

### 1.16 `runtime/install.js` (PWA install shell)
- Not spatial logic. **KEEP** as-is (offline lifecycle only).

---

## 2. Cross-cutting systems (also in scope for the kernel)

### 2.1 Shader / world-law visual systems (`index.html`)
- The 13 high-level params (dayNight…snow) drive GLSL world-law effects. These
  are **visual effects (C)** and must stay separate from **world state (A)** /
  **solver (B)** (spec §11). Currently interleaved with the shader; the sim
  layer (§1.3) formalizes the split so effects read from `WorldFields`, never
  become authoritative state.
- **Disposition:** KEEP effects; route through `WorldFields` → effect uniforms.

### 2.2 Actors / dialogue / storyboard / director (`editor/`, `window.SHADED`)
- `addActor`, `story.board()`, SWIFT sprites — these are **render-decoration**
  (CLAUDE.md invariant 2: actors never change `classGrid`/material truth).
- **Disposition:** KEEP. The kernel's `SceneGraph` gains an `ACTOR`/`LIGHT`/
  `EMITTER` node family (§9); actors remain optics, now also queryable as
  semantic nodes. Dialogue triggers / director stay event-layer, not spatial
  truth.

### 2.3 Point-cloud / mesh / GLB export
- `Hitem3d-*.glb` + `tools/*` export paths exist. **Disposition:** KEEP; the
  `RepresentationManager` (§13) is the single export surface (POINT_CLOUD /
  BLOCK_MESH / OPTIMIZED_MESH) so export is representation-aware and budgeted.

### 2.4 Provider bundles / project import-export
- `contracts/shaded-spatial-provider.schema.json` (v1: channels + intrinsics/
  extrinsics/fx/fy) is the **basis** for the universal observation contract (§4).
- `contracts/shaded-scene-project.schema.json` + `tools/build-scene-project.mjs`
  + `tools/build-world-package.mjs` exist. **Disposition:** GENERALIZE →
  portable SHADED Little-World format (§18+).

### 2.5 PWA / offline (`service-worker.js`, `runtime/install.js`)
- **Disposition:** KEEP. Independent of kernel internals.

### 2.6 Tests / GPU workflow (`tools/verify*.mjs`, `tools/gpu-spatial.mjs`)
- `tools/test-spatial-navigation.mjs` passes. Browser/visual verifiers need
  `node_modules` (playwright). **Disposition:** EXTEND — each new kernel
  subsystem gets a focused `node`-runnable test (no browser) plus a verify
  harness where a browser is required.

---

## 3. Donor → disposition summary (spec §1)

| Donor | What SHADED extracts | Where it lands | License handling |
|---|---|---|---|
| Robbyant/lingbot-map | anchors, keyframes, drift correction, bounded memory | `SpatialMemory` (§5) | internal impl, no transformer |
| ShirleyMaxx/REST3D | entity decomposition, support/contact, wall fit, stabilization | `ConstraintGraph` (§10), `SceneGraph` (§9) | **CC BY-NC → reference only, no code copy** |
| pascalorg/editor | semantic graph, stable IDs, dirty nodes, Guide/Scan | `SceneGraph` (§9) | reference architecture |
| ZyFou/ProceduralTerrains | seed chunks, dirty tracking, cam-independent world | `SparseField` (§8), `ProceduralLittleWorld` (§17) | reference |
| zeux/meshoptimizer | index/simplify/quantize/LOD/meshlets | `RepresentationManager` (§13/15) | **use directly if license fits** |
| fogleman/sdf | composable primitives/ops | `SdfGeometry` (§7) | reference (SDF language) |
| dimforge/rapier | rigid-body/collision | optional `ConstraintGraph` backend (§10) | optional dep, not a new solver |
| VAST-AI/TripoSplat | variable primitive count, budget = quality | `RepresentationManager` budgets (§14) | reference principle |
| apple/ml-lito | geometry+appearance separable, compact tokens | `RepresentationManager` interfaces (§13) | reference, no training |
| TencentARC/Pixal3D | pixel→3D correspondence, provider arch | `MonocularDepthProvider` adapter (§4) | **model NOT vendored** |
| Tencent HY-World 2 | observation/camera/depth/normals decomposition | universal observation contract (§4) | **research only, no restricted code** |
| MoGe-3 | 3D neighbourhood rejects false 2D neighbours | `spatial-reconstruction` upgrade (§6) | principle only |
| TRELLIS 2 / Zero123Plus | optional completion providers | `CompletionProvider` (§18+) | optional, not canonical truth |
| PlayCanvas / WebGPU | WebGL/WebGPU fallback, streaming | renderers (§13) | no wholesale migration w/o benchmark |
| starred GPU/terrain repos | flood fill, occupancy, sparse fields | `SparseField` / sim GPU paths (§8/11) | GPL/copyleft → study only |

**License red lines (must not be crossed):**
- REST3D (CC BY-NC): paper/architecture reference only — **no code copy**.
- Tencent HY-World / Pixal3D restricted models: **do not vendor** weights or
  restricted code; only wrap external providers via the contract.
- GPL/copyleft starred repos: study ideas, **do not copy code** into SHADED.
- Everything committed to SHADED remains SHADED-internal (MIT-style project).

---

## 4. Kernel migration plan (dependency inversion, spec §0/§3/§16)

Current (wrong) dependency direction:
`SpatialSystemIntegrator` ⊃ `PhotoFirstWorld` ⊃ observations ⊃ kernel pieces.

Target direction:
```
INPUTS / OBSERVATIONS / RULES
        ↓  (PhotoFirstRecipe, ManualCameraRecipe, PlanConstraintRecipe, ProceduralRecipe)
   SHADED SPATIAL KERNEL  (World, SceneGraph, SpatialMemory, ObservationStore,
        GeometryStore, SparseField, ConstraintGraph, WorldFields, Navigation,
        Simulation, RepresentationManager, RecipeManager)
        ↓
   PERSISTENT LITTLE WORLD  → render / walk / edit / simulate / complete / export
```
- The kernel imports **none** of photo-first / reverse-viewfinder / hall-plan.
  Those become `Recipe`s that call `kernel.ingest(observation)`.
- `SpatialSystemIntegrator` is dissolved: its pipeline steps move into
  `PhotoFirstRecipe`; its registration step calls `SpatialMemory.integrate`.
- `window.SHADED` facade (CLAUDE.md invariant 5) stays the only external surface;
  editor talks to the kernel only through it.

---

## 5. Open risks / next actions

1. **Simulated-depth fallback** in the old integrator must be gated before any
   recipe migration (spec "no faked output").
2. **Orphaned `world-persistence-integration.mjs`** — either re-wire through the
   kernel `World` serialization or delete; currently dead code.
3. **`self.` → `this.` bug** in that module (latent).
4. Full `npm run check` needs `node_modules`; browser/visual verify not run in
   this sandbox — must be run on a machine with playwright before committing
   architecture changes.
5. **Next concrete step (PHASE 0 closure → §3):** implement `SpatialKernel`
   shell + `ObservationStore` + universal `GeometryObservation` contract
   (§4), keeping `window.SHADED` intact; port one recipe (PhotoFirst) as proof.

