# SHADED Sandbox — Element Donor License Audit

Status is intentionally conservative. **No license / unclear license means technique/reference only**, not code copy.

| Source | Verified reuse posture | Evidence checked |
|---|---|---|
| `keaukraine/webgl-dunes` | MIT; adaptation/copy permitted with notice | root `LICENSE.txt` |
| `piellardj/navier-stokes-webgl` | ISC declared in package metadata | root `package.json` |
| `aadebdeb/WebGL_SmokeSimulation` | MIT | root `LICENSE` |
| `julesyoungberg/2d-smoke` | MIT | root `LICENSE` |
| `keijiro/StableFluids` | public domain / Unlicense | root `LICENSE` |
| `matthiasbroske/GPUStableFluids` | MIT | root `LICENSE` |
| `ericleong/sand.js` | GPL-3.0; do not copy into a non-GPL SHADED runtime | root `LICENSE` |
| `GelamiSalami/GPU-Falling-Sand-CA` | no license found in inspected root; technique only | root contents + README |
| `m4ym4y/falling-sand-shader` | no license found in inspected root; technique only | root contents |
| `wg-romank/sands-of-rust` | no license found in inspected root; technique only | root contents / Cargo metadata |
| `kody-w/kody-w.github.io` Falling Sand Lab | no reusable software license found in inspected root; prompt/behavior/architecture reference only | site source + root contents |
| `reindernijhoff/shadertoy` | no repository license found in inspected root; treat individual shaders as reference until separately verified | root contents / README |
| `haubna/PhysicsMod` `oceans.glsl` | no repository license found in inspected root; technique/visual reference only | root contents |
| `avcourt/terrain` | no repository license found in inspected root; technique/visual reference only | root contents / README |

## Newly verified sources (KilledByAPixel / Frank Force cluster + starred-repo audit)

Verified by cloning the actual repository and reading README + LICENSE directly (not by trusting a summary). Provenance: these surfaced via the user's own GitHub stars and via mining `KilledByAPixel`'s authored repos and stars — cross-checked against real data, not accepted from an unverified chat dump.

| Source | Verified reuse posture | Evidence checked | What it actually is |
|---|---|---|---|
| `KilledByAPixel/VaseFX` | GPL-3.0; technique/reference only, do not copy into non-GPL SHADED runtime | root `LICENSE`, `README.md` | Single WebGL fragment shader raymarching an SDF; a vase profile is 256 radius/smoothness values packed into a small data texture and revolved around the vertical axis — no polygon mesh at all. Seeded noise glazes, ambient + 2 randomized directional lights, soft raymarched shadows. |
| `KilledByAPixel/stereogram` | MIT; adaptation/copy permitted with notice | root `LICENSE`, `stereogram.js` source | Depth as a field family, not a single map: nonlinear depth-response curve (`depthCurve = d*(1+K)/(1+K*d)`), a raw unblurred copy kept separately from the blurred one for edge detection, separable box blur, Sobel edge enhancement, tileable blue-noise dot generator. |
| `KilledByAPixel/OS13k` | MIT (repo `LICENSE`); confirm before code copy | root `LICENSE`, `README.md` | Tiny web pseudo-OS/game-engine runtime: native Shadertoy/Dweet support, live program windows, previous-frame feedback. Precedent for a SHADED in-app Shader Lab. |
| `KilledByAPixel/TinyCode` | mixed/unclear per-demo; technique only until checked per file | `README.md` | Library of isolated minimal-mechanism demos sorted by byte budget (64B–1K). `256B/CityInABottle` is a 256-byte raycasting-with-shadows system with its own technical writeup — exemplar for "extract the mechanism, not the framework." |
| `KilledByAPixel/Drive13K` | **"code is only for learning purposes and not intended to be redistributed"** — stricter than MIT; technique-only, no code reuse at all | `README.md` explicit statement | Track generator + world builder, 10 stages with smooth transitions, procedural trees/rocks/scenery, parallax horizon/sky/sun. |
| `erincatto/box3d` | MIT | root `LICENSE`, `README.md` | Real 3D rigid-body physics engine by the Box2D author. C17, data-oriented, SIMD, "Soft Step" solver, continuous collision, contact events, character mover, height fields, cross-platform determinism, recording/replay. Strong donor for the rigid-body/contact side (complements Particles4All's PBD-fluid focus). |
| `SebLague/Hydraulic-Erosion` | MIT | root `LICENSE`, `README.md` | Terrain erosion simulation grounded in real published methods (firespark.de erosion paper, ranmantaru.com). Currently the strongest available donor for the Erosion/Sediment Lab target below — was previously a documented gap. |
| `baturinsky/worldgen` | MIT | root `LICENSE`, `README.md` | "Voronoi-less" terrain generator: gradient noise from summed semi-transparent ellipses (not Perlin/Simplex), plus a tectonic-plate simulation (`crust` + `noise` fields drive a `tectonic` activity value) that produces mountain ranges at plate boundaries. |
| `chrxh/alien` | BSD-3-Clause | root `LICENSE`, `README.md` | CUDA 2D particle engine simulating soft bodies + fluids + heat + damage + adhesion, with a genetic system, per-cell neural-network control, and spatially varying simulation parameters. Real, actively maintained (has its own `CLAUDE.md`). Relevant both as a particle/soft-body physics donor and, independently, to the PSYCHOPATH line of research (genesis, genome inheritance, artificial life). |
| `xem/mini2Dphysics` | Public Domain | root `LICENSE.md`, `README.md` | Minimal 2D physics for code-golf-style games: square/circle collision under gravity with reciprocal forces. |
| `Qqwy/js1k_powder_game` | no license found; technique only | root contents (no LICENSE file) | Real falling-sand/powder-game cellular automaton: 11 placeable elements, 50+ reactions (solids/liquids/gases, fire, water, ice, virus, "magic powder"), fits in ~1KB compressed. Confirms the falling-sand genre reference already used elsewhere in this matrix. |
| `tony-pizza/Stereogram.js` | no license found; technique/architecture only | root contents (no LICENSE file) | Second, independent SIRDS stereogram implementation with a clean pluggable `DepthMapper` interface (`Text`/`Canvas`/`Img`/`TemplateDepthMapper`) — worth studying as an interface shape for SHADED's own DepthField sources, not as code to import. |

## Shadertoy / Gist rule

A publicly readable shader is **not automatically freely redistributable**. Before vendoring or closely copying any Shadertoy/Gist shader, record an explicit license from the author/source. Until then SHADED may study its algorithm and visual output and implement the technique independently.

## Preferred code donors for the next Fluid Lab

For implementation work, prefer the permissively licensed set:

1. `piellardj/navier-stokes-webgl` — browser/WebGL architecture, ISC.
2. `aadebdeb/WebGL_SmokeSimulation` — direct 2D/3D WebGL GPGPU reference, MIT.
3. `julesyoungberg/2d-smoke` — readable TypeScript/WebGL organization, MIT.
4. `keijiro/StableFluids` — very permissive algorithm reference, Unlicense.
5. `matthiasbroske/GPUStableFluids` — 2D + 3D solver and 3D volume-rendering reference, MIT.

The scientific papers remain the canonical algorithm specification; donor code is used to cross-check implementation details and performance rather than to define SHADED's state model.
