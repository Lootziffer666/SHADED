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
