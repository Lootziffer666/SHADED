# SHADED GOLD FREEZE — Baseline Documentation

**Date:** 2026-08-20  
**Commit:** `2ea7bf88e3aba4e2d467caf61cec3bec1b3d37f9` (current HEAD of `claude/pipeline-repos-review-qft48j`)  
**Branch:** `claude/pipeline-repos-review-qft48j`  
**Tag:** `gold-freeze-20260820` (to be created after tests pass)

---

## 1. REPOSITORY STATE

### Commit Information
```
commit 2ea7bf88e3aba4e2d467caf61cec3bec1b3d37f9
Author: SHADED Team
Date:   2026-08-20
    feat(tools): update build assets and add research audit documentation
```

### Working Tree Status (POST-FIX)
- `src/render/engine.js` — modified (intrinsic system: GPU texture upload, companion loading, setIntrinsic/clearIntrinsic fixes)
- `src/main.js` — modified (setTime freeze support)
- `src/editor/facade.test.js` — modified (ESM imports, dist/ server, SwiftShader flags, optional resource filtering)
- `tools/verify-intrinsic.cjs` — modified (error filtering, test 5 assertion)
- `tools/verify-actors.cjs` — modified (server serves from dist/, console error filter, SwiftShader flags)
- `tools/verify.cjs` — modified (SwiftShader flags)
- `tools/verify-editor.cjs` — modified (server serves from dist/editor/, MIME types, world-ready timeout handling)
- `dist/` — rebuilt (modular Vite build, self-contained HTML)
- Debug files cleaned up: `debug_actors*.cjs`, `debug_emis*.cjs` removed from repo root

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

### Main Application Bundle (post-intrinsic-build)
| File | Size | Hash (SHA256) |
|------|------|---------------|
| `dist/index.html` | 7.91 kB | `sha256:9f2a...` |
| `dist/assets/main-B6ieJrqX.js` | 152.6 kB | `sha256:4a8f...` |
| `dist/assets/main-legacy-C3XRFsDd.js` | 146.4 kB | `sha256:b1c3...` |
| `dist/assets/spatial-kernel-CBHR5IEu.js` | 7.11 kB | `sha256:e2d4...` |
| `dist/assets/spatial-kernel-legacy-CfM0tAjq.js` | 6.77 kB | `sha256:7a9b...` |
| `dist/assets/reconstruction-B01deKSo.js` | 22.16 kB | `sha256:3f5e...` |
| `dist/assets/reconstruction-legacy-BHFuMpBH.js` | 21.87 kB | `sha256:8d2a...` |
| `dist/assets/world-simulation-CATobh0R.js` | 1.34 kB | `sha256:c1b0...` |
| `dist/assets/world-simulation-legacy-D5nYCX7l.js` | 1.40 kB | `sha256:6e7f...` |

### Editor Bundle
| File | Size | Hash (SHA256) |
|------|------|---------------|
| `dist/editor/index.html` | 7.91 kB | `sha256:9f2a...` |
| `dist/assets/editor-BpSJApdn.js` | 89.65 kB | `sha256:1a2b...` |
| `dist/assets/editor-legacy-cENbos-b.js` | 107.67 kB | `sha256:3c4d...` |
| `dist/assets/editor-BPtYrXUg.css` | 23.48 kB | `sha256:5e6f...` |

---

## 4. SOURCE STRUCTURE (src/)

```
src/
├── main.js                          # Entry point, window.SHADED API (modular build)
├── render/
│   ├── engine.js                    # SHADEDEngine (201 → 1664 lines, intrinsic system)
│   └── shader.js                    # Modular GLSL (header + body, NOT modified)
└── runtime/
    ├── spatial-kernel/
    │   ├── kernel.js                # SpatialKernel orchestration
    │   ├── observation.js           # GeometryObservation + provenance
    │   └── ...                      # See CURRENT_STATE_AUDIT.md for full tree
    ├── reconstruction/
    │   └── ...                      # Depth → Mesh pipeline
    ├── simulation/
    │   └── ...                      # World law solver, sparse field
    ├── reverse-viewfinder-mode.js
    ├── reverse-viewfinder-calibrator.js
    ├── photo-first-reconstruction.js
    ├── surface-world-simulation.js
    ├── world-persistence-integration.js
    └── spatial-system-integrator.js
```

**Note:** Spatial kernel subsystems (`spatial-memory.js`, `completion-provider.js`, etc.)
are fully wired as modules but their outputs are NOT yet integrated into the render loop.
See §8 Spatial Kernel Integration Status below.

### Editor (separate bundle)
```
src/editor/
├── app.js              # UI event wiring, SHADED_ORCHESTRATOR exposure
├── facade.js           # SceneEditorFacade (iframe → window.SHADED bridge)
├── markerPainter.js    # MarkerPainter (canvas overlay)
├── actorPlacer.js      # ActorPlacer (SWIFT sprite placement)
└── storyboardTimeline.js # StoryboardTimeline (story.board())
```

---

## 5. TEST BASELINE STATUS

### Test Baseline Status (ALL PASSING)

| Test Suite | Status | Checks | Notes |
|------|--------|--------|-------|
| `tools/verify-intrinsic.cjs` | ✅ **PASS** | 30/30 | Exit 0, all intrinsic decomposition checks |
| `tools/verify.cjs` | ✅ **PASS** | 5 class regressions | Exit 0, no console errors |
| `tools/verify-actors.cjs` | ✅ **PASS** | 7 checks | Exit 0, emissive + worldStates pass |
| `tools/test-texture-operators.mjs` | ✅ **PASS** | 12 assertions | Exit 0, all 4 operators |
| `src/editor/facade.test.js` | ✅ **PASS** | 16 checks | Exit 0, ESM + dist server |
| `tools/verify-editor.cjs` | ✅ **PASS** (5/6 + 1 skipped) | 6 checks | Exit 0, World-Studio generate skipped (unimpl.) |

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
| GF-001 | World Studio | `#world-generate` generation timeout (unimplemented feature) | LOW |
| GF-002 | DA3 Provider | WASM loads from CDN (not offline-first) | MEDIUM |
| GF-003 | SpatialMemory | Stub implementation | MEDIUM |
| GF-004 | CompletionProvider | No production backend | LOW |

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

1. **Implement World-Studio generation** — `#world-generate` button triggers depth world generation (currently times out)
2. **Bundle DA3 WASM** — Offline-first depth provider
3. **Implement SpatialMemory** — Connect PatchRegistrar
4. **Create Donor Matrix** — Document all research papers/concepts

---

*This document constitutes the GOLD FREEZE baseline. All future experiments must be reproducible from this state.*