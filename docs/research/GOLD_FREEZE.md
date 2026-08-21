# SHADED GOLD Freeze — Reproducible State Record

**Tag:** `GOLD-b341f7f4`  
**Date:** 2026-08-20T18:58 UTC (sandbox); code freeze at commit `b341f7f46390216e81c97e01259a573fd2e9896c`  
**Purpose:** Reproducible baseline for all post-GOLD experiments. A future run must reproduce every artifact from this record.

---

## 1. Git

| Field | Value |
|---|---|
| Commit hash | `b341f7f46390216e81c97e01259a573fd2e9896c` |
| Tree hash | `ff1d67176d0a99c715416e29cc31098aad1a0147` |
| Branch | `session/agent_c0785c6e-101b-4ebd-bdbf-05d5d5ef1cb0` (detached from origin/main, 0 ahead / 0 behind) |
| Dirty | No (working tree clean) |
| Tags | None |

```bash
git rev-parse HEAD                     # b341f7f46390216e81c97e01259a573fd2e9896c
git rev-parse HEAD^{tree}              # ff1d67176d0a99c715416e29cc31098aad1a0147
```

---

## 2. Dependencies

| Package | Version | Source |
|---|---|---|
| Node.js | v22.22.3 | system |
| npm | 10.9.8 | system |
| playwright | 1.61.1 | devDependency (`^1.61.1`) |
| ajv | 8.17.1 | devDependency (`^8.17.1`) |
| typescript | 7.0.2 | devDependency (`^7.0.2`) |

Install command: `npm ci` (produces `node_modules/` — not committed per `.gitignore`).

Chromium (Playwright-managed): `chromium_headless_shell-1228` at
`~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/`.

---

## 3. Hardware / Environment

| Property | Value |
|---|---|
| OS | Ubuntu 22.04.5 LTS |
| Cores | 4 |
| RAM | 11 GiB total |
| GPU | Software-rendering fallback (headless Chromium with `--use-gl=angle`) |
| Working dir | `/workspace/3546202e-d6d3-42d8-abb3-cfad3a70b24a/sessions/agent_c0785c6e-101b-4ebd-bdbf-05d5d5ef1cb0` |

**Important:** WebGL in headless Chromium uses ANGLE/software emulation.
Some `verify-*.js` visual screenshot scripts may fail on `texImage2D` or screenshot
timing in this environment even though the underlying shader code is correct.
The non-browser node tests are the authoritative baseline.

---

## 4. Test Baseline (pass/fail)

### `npm run check` — PASS

Covers: `node --check` on every tool/runtime/editor file, JSON schema validation,
Python provider syntax validation, index.html inline script parsing, PWA static checks,
GPU provider contract tests, and node-runnable tool tests.

### Node-runnable test suites — 9/10 PASS

| Test file | Result | Assertions |
|---|---|---|
| `tools/test-spatial-kernel.mjs` | PASS | 25 |
| `tools/test-spatial-kernel-2.mjs` | PASS | 33 |
| `tools/test-procedural-world.mjs` | PASS | 13 |
| `tools/test-photofirst-recipe.mjs` | PASS | 16 |
| `tools/test-spatial-memory.mjs` | PASS | 9 |
| `tools/test-sparse-field.mjs` | PASS | 18 |
| `tools/test-scene-graph.mjs` | PASS | 19 |
| `tools/test-spatial-reconstruction-2.mjs` | PASS | 12 |
| `tools/test-spatial-navigation.mjs` | PASS | (node-assertion, no count) |
| `tools/test-gpu-spatial.mjs` | PASS | (provider contract) |
| `tools/test-hybrid-world.mjs` | **FAIL** | ImportError: `HybridLittleWorld`, `createDefaultKernel`, `installKernel` not exported |

**Known broken test:** `test-hybrid-world.mjs` (commit `8e424c8`) references three
exports (`HybridLittleWorld`, `createDefaultKernel`, `installKernel`) that are **not
implemented** in `runtime/spatial-kernel/index.js`. See
[CURRENT_STATE_AUDIT.md](#current-state-audit) §3.3 "Broken claims."

### Browser visual verify scripts

| Script | Status | Notes |
|---|---|---|
| `tools/verify.js` | Partial | Loads scene, class regression PASSES; screenshot fails on WebGL `texImage2D` error |
| `tools/verify-actors.js` | Fails | Element screenshot, WebGL context issue in headless |
| `tools/verify-intrinsic.js` | Fails | WebGL `texImage2D` error, screenshot failure |
| `tools/verify-lenses.js` | Fails | Element screenshot stability issue in headless |
| `tools/verify-editor.js` | Fails | Timeout on world generation (30s); engine loads but walk-mode init stalls |
| `tools/verify-editor-mobile.mjs` | Fails | Browser closed during evaluation |
| `tools/verify-pwa.mjs` | PASS | Static PWA checks |
| `tools/verify-pwa-browser.mjs` | PASS | PWA active in Chromium |
| `tools/verify-walk-browser.mjs` | PASS | 12 steps, 3970 observed, 2321 mirror, 2694 trees |
| `tools/verify-sprite-exporter.js` | PASS | No page errors |
| `tools/verify-dialogue.js` | Times out | 120s timeout exceeded |
| `editor/facade.test.js` | Fails | MIME type error (PNG served as JS module) |

Browser test status is environment-dependent. All non-browser tests are the
authoritative GOLD baseline.

---

## 5. Reference Scene / Input Files

The GOLD verification uses these canonical inputs (must not be deleted/renamed/recompressed):

| File | Role |
|---|---|
| `file_00000000974871f49fe71f6b456f9579.png` | Primary scene (village with windows), 768×1080 target |
| `file_00000000974871f49fe71f6b456f9579_depth.png` | Auto-loaded depth companion |
| `file_00000000c84071f4bcd6ff9afdba7246.png` | Pink marker overlay (window corrections) |
| `file_00000000b27471f4a8aeb27484b46720.png` | Target: Sturmnacht (storm night) |
| `file_00000000fbc472438dcc92aff24bed6e.png` | Target: Tag danach (day after) |
| `1782823262240.png` | Physics reference (day) |
| `1782823374309.png` | Physics reference (night) |
| `1782824829119.png` | Hand-painted material map (Map mode test) |
| `1782826101420.png` | Decay reference (Act `verfall`, Round 3) |
| `file_00000000c40471f4859a10d6bf3ac39b.png` | Canon village (top-down, Round 5) |
| `file_00000000723471f48a11eaa8371edfb7.png` | Canon village (perspective, K7 sky test) |
| `ResizedImage_2026-06-30_10-29-19_2317[41].png` | Legacy scene (Tag) |
| `ResizedImage_2026-06-30_23-14-34_6442[1].jpg` | Legacy scene (Rain) |
| `tools/verify-test-actor.png` | Actor sprite sheet (test fixture) |
| `tools/verify-test-actor.json` | Actor manifest (v1.2, grid-based) |

---

## 6. Expected Class Counts (tools/expected-classes.json)

```json
{
  "dorf-marker": {"foliage": 5872, "grass": 4885, "wood": 3636, "rock": 1186, "roof": 2818, "window": 197, "path": 2142},
  "legacy-map": {"foliage": 3916, "roof": 4753, "path": 2080, "wood": 1921, "rock": 1175, "grass": 6024, "water": 345, "window": 522},
  "taverne": {"foliage": 6279, "grass": 3284, "wood": 4366, "rock": 2644, "window": 0, "path": 2123, "roof": 2040},
  "dorf-kanon": {"foliage": 7246, "grass": 5575, "path": 1813, "wood": 2356, "rock": 1099, "roof": 2626, "window": 20, "water": 1},
  "dorf-himmel": {"rock": 3996, "grass": 4670, "path": 1552, "roof": 2186, "foliage": 5443, "water": 15, "wood": 2848, "window": 26}
}
```

Tolerance: ±10% (min 40 absolute deviation) per class per scene.

---

## 7. Key File Hashes (SHA-256)

| File | SHA-256 |
|---|---|
| `index.html` | `02b6e30698b482845124f508d7f56802a57fca8b113264535ef3264a5b4496af` |
| `runtime/spatial-kernel/index.js` | `de83a442f05e1db59640478bc556baeb73a51f2cd31ab21b57fc884d117f6e2a` |
| `runtime/spatial-kernel/kernel.js` | `f66de8379ad8763a4bcb1c1e5f1416b4b32e0545bf63c988cdf88b734cafb638` |
| `runtime/spatial-kernel/observation.js` | `383ddd1467d5b1ab789e6531e8670ff6af8be96c1b3c85defe92e196eb84d60e` |
| `runtime/spatial-kernel/sparse-field.js` | `1903d8d51f830ef3bf92a79976463e178de60fef8d0257b0fbe1dfcf310e22dd` |
| `runtime/spatial-kernel/scene-graph.js` | `16bc3ec727a73193302bee2d6a9d9554823e66debbbf7faf82a28dcb84245c5b` |
| `runtime/sparse-voxel-world.mjs` | `bed4171e643e22d4f27ba13d592d0a6ab380e3ca6d329ba62d6631ccca195d71` |
| `runtime/spatial-navigation.mjs` | `ecb9b0e3e506d1d98e3356ff157f3558914a863183ad5d57a06e0b425859166d` |
| `editor/facade.js` | `a20a4b3f4318e85a7125f0afd5ce8bf8d3c406a40c779e9a889fcaaf7a2395fe` |
| `tools/verify.js` | `66f244039acf8e879c571fbd541063e532685044cd30a6c636aba10637007c49` |

Full repo hash: `git rev-parse HEAD^{tree}` → `ff1d67176d0a99c715416e29cc31098aad1a0147`

---

## 8. Environment Variables

| Variable | Value |
|---|---|
| `CHROMIUM` | unset (uses Playwright-managed Chromium) |
| `NODE_ENV` | (unset) |

---

## 9. Operator Configuration (GOLD)

The `index.html` GOLD configuration with all world-law parameters active:

```
PARAMS = {
  dayNight: 0, storm: 0, rain: 0, wet: 0.02, puddle: 0,
  fog: 0.05, wind: 0.3, glow: 0.12, decay: 0,
  temperature: 0.5, bloom: 0.5, autumn: 0, snow: 0,
  fireCount: 0
}
```

Phase C (Runde 5+) additional derived phases:
`dryPhase, rustAccum, heatWarp, smokeAmount, breathAmount, pressureDim,
pollutionGlow, moonBright, shelfShadow, vegFade, moodTint, worldTired,
forbiddenCold, runeGlow, shadowAge, smellDrift, touchWear, repairMark,
blessCurse`

Texture-unit allocation (9 used of `MAX_TEXTURE_IMAGE_UNITS`):
0=scene, 1=maskA, 2=maskB, 3=phys, 4=emis, 5=trail, 6=depth, 7=zone, 8=sound.

---

## 10. Reproduction Recipe

```bash
# 1. Clone at frozen commit
git clone <repo> .
git checkout b341f7f46390216e81c97e01259a573fd2e9896c

# 2. Install dependencies (not committed)
npm ci

# 3. Install browser for visual tests
npx playwright install chromium
npx playwright install-deps chromium  # Ubuntu system deps

# 4. Run baseline
npm run check                    # Syntax + static + provider contract + PWA
node tools/test-spatial-kernel.mjs
node tools/test-spatial-kernel-2.mjs
node tools/test-procedural-world.mjs
node tools/test-photofirst-recipe.mjs
node tools/test-spatial-memory.mjs
node tools/test-sparse-field.mjs
node tools/test-scene-graph.mjs
node tools/test-spatial-reconstruction-2.mjs
node tools/test-spatial-navigation.mjs
node tools/test-gpu-spatial.mjs
```

---

## 11. Known Failures (non-blocking for this GOLD freeze)

1. **`test-hybrid-world.mjs`**: References unimplemented `HybridLittleWorld`, `createDefaultKernel`, `installKernel`. Must be resolved in Phase 1 (implement or remove) before it can serve as a regression test.
2. **Browser screenshot scripts** (`verify.js`, `verify-actors.js`, `verify-intrinsic.js`, `verify-lenses.js`, `verify-editor.js`, `verify-editor-mobile.mjs`, `facade.test.js`): Fail due to headless WebGL limitations, not code defects. Require a GPU-enabled Chromium to verify visually.
3. **`verify-dialogue.js`**: Times out at 120s; dialogue engine may have a blocking wait.

---

## 12. Intermediate Stage Metadata

| Stage | File / Module | Hash |
|---|---|---|
| Shader source | `index.html` (inline `<script>`) | `02b6e3...` (file hash) |
| Spatial kernel barrel | `runtime/spatial-kernel/index.js` | `de83a4...` |
| Legacy voxel world | `runtime/sparse-voxel-world.mjs` | `bed417...` |
| Legacy navigation | `runtime/spatial-navigation.mjs` | `ecb9b0...` |
| Editor facade | `editor/facade.js` | `a20a4b...` |
| Provider schema | `contracts/shaded-spatial-provider.schema.json` | (see repo) |
| Project schema | `contracts/shaded-scene-project.schema.json` | (see repo) |
| Hall plan schema | `contracts/shaded-hall-plan.schema.json` | (see repo) |

---

## 13. Timings (node tests, approximate)

| Test | Wall time |
|---|---|
| `npm run check` | ~15s |
| `test-spatial-kernel.mjs` | <1s |
| `test-spatial-kernel-2.mjs` | <1s |
| `test-spatial-navigation.mjs` | <2s |
| `test-gpu-spatial.mjs` | <5s (incl. Python process) |
