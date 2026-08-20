# SHADED GOLD FREEZE — Baseline Documentation

**Date:** 2026-08-20  
**Commit:** `8e9e284a868e4201958281974333a2517df269a4`  
**Branch:** `claude/pipeline-repos-review-qft48j`  
**Tag:** `gold-freeze-20260820` (to be created)

---

## 1. REPOSITORY STATE

### Commit Information
```
commit 8e9e284a868e4201958281974333a2517df269a4
Author: SHADED Team
Date:   2026-08-20
    feat(tools): add pipeline scripts and reorganize project structure
```

### Working Tree Status
- Clean (no uncommitted changes)
- All source files tracked
- `node_modules/` and `dist/` in `.gitignore`

---

## 2. DEPENDENCY VERSIONS (LOCKED)

### Production Dependencies
| Package | Version | Source |
|---------|---------|--------|
| `@xmldom/xmldom` | 0.9.11 | npm |
| `proj4` | 2.21.0 | npm |
| `xmldom` | 0.6.0 | npm |

### Development Dependencies
| Package | Version | Source |
|---------|---------|--------|
| `@babel/preset-env` | 7.25.0 | npm |
| `@vitejs/plugin-legacy` | 5.4.0 | npm |
| `ajv` | 8.17.1 | npm |
| `eslint` | 8.57.0 | npm |
| `jest` | 29.7.0 | npm |
| `playwright` | 1.45.0 | npm |
| `terser` | 5.31.0 | npm |
| `typescript` | 5.5.0 | npm |
| `vite` | 5.4.0 | npm |

### System Dependencies (Playwright Chromium)
| Component | Version | Path |
|-----------|---------|------|
| Chromium Headless Shell | 151.0.7922.34 (playwright v1234) | `~/.cache/ms-playwright/chromium_headless_shell-1234/` |
| libnspr4 | 2:3.98-0ubuntu0.22.04.4 | system |
| libnss3 | 2:3.98-0ubuntu0.22.04.4 | system |
| libatk-bridge2.0-0 | 2.38.0-3 | system |
| libdrm2 | 2.4.113-2~ubuntu0.22.04.1 | system |
| libxkbcommon0 | 1.4.0-1 | system |
| libxcomposite1 | 1:0.4.5-1 | system |
| libxdamage1 | 1:1.1.5-2 | system |
| libxfixes3 | 1:6.0.0-2 | system |
| libxrandr2 | 2:1.5.2-1 | system |
| libgbm1 | 23.2.1-1ubuntu3.1~22.04.4 | system |
| libasound2 | 1.2.6.3-1ubuntu1.12 | system |

---

## 3. BUILD ARTIFACTS (dist/)

### Main Application Bundle
| File | Size | Gzip | Hash (SHA256) |
|------|------|------|---------------|
| `dist/index.html` | 23.81 kB | 7.79 kB | *pending* |
| `dist/assets/main-CjGtn8b3.js` | 138.13 kB | 47.14 kB | *pending* |
| `dist/assets/main-legacy-C5JarSop.js` | 132.14 kB | 46.13 kB | *pending* |
| `dist/assets/spatial-kernel-CBHR5IEu.js` | 7.10 kB | 2.56 kB | *pending* |
| `dist/assets/spatial-kernel-legacy-CfM0tAjq.js` | 6.76 kB | 2.42 kB | *pending* |
| `dist/assets/reconstruction-BQ-_b3PN.js` | 22.53 kB | 7.18 kB | *pending* |
| `dist/assets/reconstruction-legacy-BlLSfOXZ.js` | 22.24 kB | 7.19 kB | *pending* |
| `dist/assets/world-simulation-CATobh0R.js` | 1.37 kB | 0.70 kB | *pending* |
| `dist/assets/world-simulation-legacy-D5nYCX7l.js` | 1.43 kB | 0.73 kB | *pending* |
| `dist/assets/editor-BpSJApdn.js` | 91.49 kB | 22.02 kB | *pending* |
| `dist/assets/editor-legacy-cENbos-b.js` | 109.94 kB | 26.33 kB | *pending* |
| `dist/assets/editor-BPtYrXUg.css` | 24.04 kB | 5.74 kB | *pending* |

### Editor Bundle
| File | Size | Gzip | Hash (SHA256) |
|------|------|------|---------------|
| `dist/editor/index.html` | 7.91 kB | 2.56 kB | *pending* |

---

## 4. SOURCE STRUCTURE (src/)

```
src/
├── main.js                          # Entry point, window.SHADED API
├── render/
│   ├── engine.js                    # SHADEDEngine (kernel + renderer)
│   └── shader.js                    # Modular GLSL (header + body)
└── runtime/
    ├── spatial-kernel/
    │   ├── kernel.js                # SpatialKernel orchestration
    │   ├── observation.js           # GeometryObservation + provenance
    │   ├── observation-store.js     # ObservationStore
    │   ├── recipe-manager.js        # RecipeManager
    │   ├── sparse-field.js          # SparseField + voxel provenance
    │   ├── scene-graph.js           # SceneGraph
    │   ├── world-fields.js          # WorldFields
    │   ├── world-law-solver.js      # WorldLawSolver (4 reference laws)
    │   ├── spatial-memory.js        # SpatialMemory (stub)
    │   ├── navigation.js            # A* + LOS
    │   ├── reconstruction.js        # Geometry fitting (RANSAC)
    │   ├── mesh-pipeline.js         # Mesh optimization
    │   ├── patch-registration.js    # PatchRegistrar + mergeOverlappingPatches
    │   ├── constraint-graph.js      # ConstraintGraph
    │   ├── sdf-geometry.js          # SDF primitives + ops
    │   ├── quality-budget.js        # QualityBudget
    │   ├── representation-manager.js # RepresentationManager
    │   ├── completion-provider.js   # CompletionProvider interface
    │   └── recipes/
    │       ├── photo-first-recipe.js    # PhotoFirstRecipe
    │       └── procedural-little-world.js # ProceduralLittleWorld
    ├── reconstruction/
    │   ├── depth-provider.js        # MonocularDepthProvider (DA3 WASM)
    │   ├── mesh-pipeline.js         # DepthToMeshProcessor
    │   ├── patch-registration.js    # PatchRegistrar
    │   ├── geometry-fitting.js      # RANSAC primitives
    │   ├── constraint-graph.js      # ConstraintGraph
    │   ├── sdf-geometry.js          # SDF primitives
    │   └── completion-provider.js   # CompletionProvider
    ├── simulation/
    │   ├── world-law-solver.js      # WorldLawSolver
    │   ├── sparse-field.js          # SparseField
    │   ├── world-fields.js          # WorldFields
    │   ├── spatial-memory.js        # SpatialMemory
    │   ├── navigation.js            # Navigation
    │   ├── quality-budget.js        # QualityBudget
    │   └── representation-manager.js # RepresentationManager
    ├── reverse-viewfinder-mode.js   # ReverseViewfinderMode (SHADED depth)
    ├── reverse-viewfinder-calibrator.js
    ├── photo-first-reconstruction.js # PhotoFirstWorld + types
    ├── surface-world-simulation.js
    ├── world-persistence-integration.js
    └── spatial-system-integrator.js
```

---

## 5. TEST BASELINE STATUS

### Verification Tests (tools/*.cjs)

| Test | Status | Notes |
|------|--------|-------|
| `npm run verify` | **TIMEOUT** | Demo loading broken in modular dev server |
| `npm run verify:actors` | **TIMEOUT** | Same issue |
| `npm run verify:intrinsic` | **UNKNOWN** | Not run |
| `npm run verify:editor` | **UNKNOWN** | Not run |
| `npm run orchestrate` | **UNKNOWN** | Not run |

### Known Test Infrastructure Issues
1. **Demo loading broken** — The modular dev server (`npm run dev`) doesn't serve the demo assets the same way as the monolithic `index.html`
2. **Test expects monolithic behavior** — Tests written for single-file `index.html` with embedded demo loader
3. **Playwright timeout** — 30s timeout waiting for `window.SHADED.isReady()` which never fires because demo doesn't load

### Working Components (Verified via Build)
- ✅ `npm run build` — Production build succeeds (70 modules, code-split chunks)
- ✅ `npm run dev` — Dev server starts, serves index.html
- ✅ ES module imports resolve correctly
- ✅ Spatial Kernel initializes with all subsystems
- ✅ Shader source validation passes
- ✅ Vite code splitting works (spatial-kernel, reconstruction, world-simulation chunks)

---

## 6. ARCHITECTURE SUMMARY

### Core Systems (Implemented)
| System | File | Status |
|--------|------|--------|
| **Renderer** | `src/render/engine.js` + `shader.js` | Modular, 4488-line GLSL extracted |
| **Spatial Kernel** | `src/runtime/spatial-kernel/kernel.js` | Full subsystem registry |
| **Material Layer** | `shader.js` (intrinsic uniforms) | Dykstra projection in shader |
| **World Laws (31/60)** | `shader.js` + `world-law-solver.js` | Phase C complete |
| **Actor System** | `engine.js` | SWIFT-compatible |
| **Depth Provider** | `reconstruction/depth-provider.js` | DA3 WASM interface (CDN) |
| **Patch Registration** | `reconstruction/patch-registration.js` | ICP + mergeOverlappingPatches |
| **Reverse Viewfinder** | `reverse-viewfinder-mode.js` | SHADED depth integration |
| **Pipeline** | `tools/pipeline/` | Koelnmesse end-to-end |

### Stubbed / Incomplete
| Component | File | Issue |
|-----------|------|-------|
| `SpatialMemory` | `spatial-kernel/spatial-memory.js` | Comment: "real PatchRegistrar plugs in later" |
| `CompletionProvider` | `spatial-kernel/completion-provider.js` | Interface only, no production impl |
| `DA3 WASM` | `depth-provider.js` | Loads from CDN, not bundled offline |
| `TextureStationarizer` | — | Not implemented |
| `MultiViewTextureFuser` | — | Not implemented |
| `OCCAM Coverage` | — | Not implemented |

---

## 7. KNOWN FAILURES / BLOCKERS

| ID | Component | Failure | Severity |
|----|-----------|---------|----------|
| GF-001 | Test Suite | Demo loading broken in modular dev server | HIGH |
| GF-002 | DA3 Provider | WASM loads from CDN (not offline-first) | MEDIUM |
| GF-003 | SpatialMemory | Stub implementation | MEDIUM |
| GF-004 | CompletionProvider | No production backend | LOW |
| GF-005 | Texture Pipeline | Not implemented | MEDIUM |

---

## 8. ENVIRONMENT VARIABLES

```bash
NODE_ENV=production
PLAYWRIGHT_BROWSERS_PATH=/home/agent_da95f2f2-478f-44c6-9ed6-b3d35efa614c/.cache/ms-playwright
CHROMIUM_PATH=/opt/pw-browsers/chromium  # fallback
```

---

## 9. HARDWARE BASELINE

| Component | Specification |
|-----------|---------------|
| CPU | Cloud container (x86_64) |
| RAM | 8 GB |
| GPU | SwiftShader (software WebGL) |
| Disk | Ephemeral |

---

## 10. REPRODUCTION COMMANDS

```bash
# Clone and checkout
git clone <repo>
cd shaded
git checkout 8e9e284a868e4201958281974333a2517df269a4

# Install dependencies
npm ci

# Build production
npm run build

# Start dev server (for manual testing)
npm run dev

# Run tests (currently blocked on GF-001)
npm run verify
npm run verify:actors
npm run verify:intrinsic
npm run verify:editor
```

---

## 11. ARCHITECTURAL DECISIONS FROZEN

1. **ES Modules + Vite** — No more single-file HTML
2. **Spatial Kernel as orchestration layer** — Subsystems registered at init
3. **Shader as ES module** — Header + body composition, validation function
4. **Provenance tracking** — `OBS_PROVENANCE.SIMULATED_FALLBACK` for honest fakes
5. **Window.SHADED API preserved** — Backward compatible
6. **Pipeline separate from core** — `tools/pipeline/` for Koelnmesse
7. **Editor as separate entry** — `editor/index.html` → `src/editor/`

---

## 12. NEXT STEPS (Post-GOLD)

1. **Fix GF-001** — Update test infrastructure for modular architecture
2. **Bundle DA3 WASM** — Offline-first depth provider
3. **Implement SpatialMemory** — Connect PatchRegistrar
4. **Build Experiment Infrastructure** — Run IDs, provenance, artifact cache
5. **Create Donor Matrix** — Document all research papers/concepts

---

*This document constitutes the GOLD FREEZE baseline. All future experiments must be reproducible from this state.*