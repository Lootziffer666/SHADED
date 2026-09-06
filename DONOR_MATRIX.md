# Donor Matrix — GOAL_WORLD.md Section 25 Compliance (G-2564..G-2570)

Machine/human-readable matrix covering every donor named as binding in `GOAL_WORLD.md` Section 25
(`G-2511`..`G-2563`). Companion to `DONORS.md` (which remains the scoped water/weather/fire block
per `GOAL_WORLD.md` `G-0109`) — this file is the cross-domain registry `GOAL_WORLD.md` itself points
to as the binding one.

Columns per `G-2565`: `ROLE`, `RANK/PRIORITY` (the donor's own stated rank, e.g. `S++`/`S+`/`S`/`A+`/
`A`/`A-`, taken verbatim from `GOAL_WORLD.md` where given), `LICENSE`, `USE MODE`
(`COPY_ALLOWED / REIMPLEMENT / REFERENCE_ONLY / PROVIDER_ADAPTER / STUDY_ONLY`), `STATUS`
(`DISCOVERED → TRIAGED → INSPECTED → EXTRACTION_CANDIDATE → EXTRACTED → BENCHED → INTEGRATED`, or
`REJECTED / SUPERSEDED / REFERENCE_ONLY`), `SHADED CONTRACT` (what SHADED-owned contract it feeds),
`OWNER AFTER INTEGRATION` (per `G-2570`, always `SHADED`).

**Current STATUS for every row below is `TRIAGED`**: each has a role, rank and purpose already
assigned by the maintainer's own canonical text (`G-2511`..`G-2563`), which is more than
`DISCOVERED`, but none has yet been `INSPECTED` (source actually opened and read against its
stated purpose, per `G-2567`) in this pass. That inspection step is the next honest status move for
each row, not a claim this matrix makes prematurely.

## 25.2 Fixed water / weather / fire donors (also in `DONORS.md`)

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| `forbiddenlink/ocean-simulator` | Ocean Habitat Runtime Donor | S++ (implied top-tier, see G-2511) | Not stated in canon; verify before extraction | PROVIDER_ADAPTER | TRIAGED | World/Life Contracts (habitat, population, food chain) | SHADED |
| `GarrettGunnell/Water` | Ocean Surface Reference | S++ | Author invites reference use ("Please use as a reference") | REFERENCE_ONLY | TRIAGED | Water surface material/shader contract | SHADED |
| `idootop/webgl2-water` | Fresh/Pool Water Donor | S+ | Not stated in canon; verify | REIMPLEMENT | TRIAGED | Bounded clear-water rendering contract | SHADED |
| `rarietta/WebGL` | Lightweight Calm-Surface Donor | S | Not stated in canon; verify | REIMPLEMENT | TRIAGED | Cheap calm-water surface motion | SHADED |
| `niels747/2D-Weather-Sandbox` | Atmospheric Solver Donor | S++ | Not stated in canon; verify | REIMPLEMENT | TRIAGED | Atmosphere/weather world law (pressure/temp/humidity/phase) | SHADED |
| `niels747/GLFW_fire_simulation` | Fire/Gas Behaviour Donor | S+ | Not stated in canon; verify | REIMPLEMENT | TRIAGED | Fire/gas behaviour law (temperature/pressure/fluid motion) | SHADED |

## 25.3 Snow / UI / Material World / Ecology

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| `Snowflow` / `Noniv/snowflow_demo` | Snow + UI Donor (and ONLY that) | binding, exclusive in its role (G-2517) | Not stated in canon; verify | REIMPLEMENT | TRIAGED (currently the live runtime import, being absorbed per Section 4) | Snow material state; UI/interaction pattern donor | SHADED |
| `MaxBittker/sandspiel` | S++ Behaviour + Fallback Architecture Donor | S++ | Not stated; verify | REFERENCE_ONLY | TRIAGED | CA core behaviour / RGBA state transport fallback pattern | SHADED |
| `MaxBittker/sandspiel-studio` | S Material-/World-Law Composer Donor | S | Not stated; verify | REFERENCE_ONLY | TRIAGED | Rule-based material definition UX pattern | SHADED |
| `MaxBittker/orb.farm` | S+ Ecosystem / Persistent World-State Donor | S+ | Not stated; verify | REFERENCE_ONLY | TRIAGED | Persistent habitat/ecosystem coupling pattern | SHADED |
| `MaxBittker/shaderbooth` | Max-Bittker cluster: shader authoring/experiment mechanic | (cluster) | Not stated; verify | STUDY_ONLY | TRIAGED | Experimental shader-authoring pattern | SHADED |
| `MaxBittker/walky.space` | Max-Bittker cluster: spatial/interactive experiment pattern | (cluster) | Not stated; verify | STUDY_ONLY | TRIAGED | Extraction not yet named (per G-2522, must be named before integration) | SHADED |
| `VoxelWorld` | S++ 3D CA / Material-World Behaviour Donor | S++ | GPL-3.0 | STUDY_ONLY | TRIAGED | 3D CA material-world behaviour pattern (study only under GPL-3.0) | SHADED |
| `Sandboxels` | S Feature-/Interaction-Mine | S | R74n Content License / All Rights Reserved | STUDY_ONLY | TRIAGED | Feature/interaction idea mine, not copy source | SHADED |
| `Particles4All` | Explicitly NOT a canonical material core or owner (G-2525) | — (demoted) | Not stated | REFERENCE_ONLY (bounded) | SUPERSEDED (as former core direction) | None (previous direction rejected) | SHADED |

## 25.4 Sand / Soil / Water Solver Donors

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| RTSW (`kuiwuchn.github.io/rtsw.html`) | Target solver reference: coupled height-field sand/water dynamics | S++ | Not stated; verify | REFERENCE_ONLY | TRIAGED | Sand/water saturation-friction-diffusion-momentum-elastoplasticity-seepage-erosion law | SHADED |
| `RaymondMcGuire/sph_seepage_flows` | Subsurface water/soil donor | S++ | MIT (boundary/provenance to document) | REIMPLEMENT | TRIAGED | Porosity/permeability/capillarity/cohesion/internal-erosion law | SHADED |
| `aparis69/Desertscapes-Simulation` | Dune/wind/erosion donor | S+ | Not stated; verify | REIMPLEMENT | TRIAGED | Aeolian transport / dune evolution / desert-surface law | SHADED |
| `devdynaf/falling-sand` | Golden Behaviour / exact-donor reference | S | Unclear/missing — no ungated copy-vendoring | REFERENCE_ONLY | TRIAGED | Falling-sand behaviour regression oracle | SHADED |
| `Fluid Frenzy` | Terrain↔fluid architecture/behaviour reference | S | Not stated; verify | REFERENCE_ONLY | TRIAGED | Terrain/fluid coupling architecture pattern | SHADED |
| `webgpu-water-playcanvas` | Water donor | S++ | MIT | REIMPLEMENT | TRIAGED | Water technique/renderer/GPU reference | SHADED |
| `jeantimex/threejs-water` | Pool geometry / water-integration donor | S++ | MIT | REIMPLEMENT | TRIAGED | Pool geometry / water integration pattern | SHADED |
| `evanw/webgl-water` | Water optics/rendering donor | S++ | MIT | REIMPLEMENT | TRIAGED | Heightfield water optics (reflection/refraction/caustics/soft AO) | SHADED |
| `threejs-caustics` | Caustics reference | A+ | Unclear — clarify before code reuse | REFERENCE_ONLY | TRIAGED | Caustics rendering reference | SHADED |

## 25.5 Rendering / Shader / Visual Material Donors

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| GameIdea 3D Grass Shader | Vegetation visual/interaction reference | A++ | Redistribution/derivative-restricted | REFERENCE_ONLY | TRIAGED | Grass/vegetation visual + interaction law | SHADED |
| GameIdea Fire / Gerstner Water Shader | Visual material references | (same discipline as above) | Same restriction discipline | REFERENCE_ONLY | TRIAGED | Fire/water visual material reference (not a World Law) | SHADED |
| `erichlof/THREE.js-PathTracing-Renderer` | Rendering/water/volume donor | S++ | CC0 | REIMPLEMENT | TRIAGED | Rendering/volume/light technique study | SHADED |
| `bgolus/WorldNormalFromDepthTexture.shader` | Depth-Normal Reference | A | Unclear — reimplement math, don't copy | REIMPLEMENT | TRIAGED | Depth-derived normal reconstruction math | SHADED |
| `SDL_shadercross` | Shader Portability Donor | A− | Not stated; verify | STUDY_ONLY | TRIAGED | Native multi-target shader portability architecture study | SHADED |
| `Kompute/scripts/convert_shaders.py` | Shader-ingestion/build-pipeline reference | — | Not stated; verify | REFERENCE_ONLY | TRIAGED | Deterministic shader-ingestion pipeline pattern | SHADED |
| `fragcoor.xyz` (tooling, not a donor repo) | GLSL/WGSL translation tooling helper | — | N/A (hosted tool) | PROVIDER_ADAPTER (tooling only) | TRIAGED | Assists SHADER_IR semantic translation; never replaces semantic review | SHADED |

## 25.6 Reconstruction / Spatial Representation Donors

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| `Anttwo/MILo` (+ SuGaR / Frosting / MAtCha) | Reconstruction / surface-aligned Gaussian cluster | S+ | Not stated; verify per repo | PROVIDER_ADAPTER | TRIAGED | Mesh-in-the-loop / editable radiance field / geometry↔GS coupling | SHADED |
| `xiaobiaodu/Flux-GS` | Mobile Gaussian-Splatting donor | S+ | Not stated; verify | PROVIDER_ADAPTER | TRIAGED | Mobile GS rendering/compression/decoding | SHADED |
| `samchopra2003/PhysGS` | Physical Gaussian / physics-representation donor | S++ | Not stated; verify | PROVIDER_ADAPTER | TRIAGED | Physical/Gaussian coupling, checked against SHADED Physics/World Contracts | SHADED |
| `harry7557558/spirula-studio` | Architectural reconstruction/provider donor | (unranked in canon) | GPL-3.0 | STUDY_ONLY (clean-room) | TRIAGED | Point-map/SfM/normals/sky-mask/meshing pipeline pattern | SHADED |
| `forbiddenlink/trace` | Provenance / reconstruction UX / spatial-editor donor | S++ | Not stated; verify | PROVIDER_ADAPTER | TRIAGED | Provenance-aware reconstruction UX pattern | SHADED |

## 25.7 Runtime / Composer / Animation / Architecture Donors

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| `XenolithEngine/xenolith-graph` (XenolithGraph) | Composer/Node-Editor Donor | S+ | Not stated; verify | REFERENCE_ONLY | TRIAGED | Editor/operator graph representation pattern | SHADED |
| `doriaxengine/doriax` | Runtime/Editor Donor | S+ (Rendering A+/S, UI A+) | MIT | REIMPLEMENT | TRIAGED | ECS/inspector/timeline/play-mode/terrain-physics-shader patterns | SHADED |
| `localai-org/motion-bricks.cpp` | Animation/agent donor | S | Not stated; verify | REFERENCE_ONLY | TRIAGED | Local generative motion/planning/pose-decoding pattern | SHADED |
| `ryokun6/ryos` | Shell/app-architecture reference | A+/S | AGPL-3.0 | STUDY_ONLY | TRIAGED | Shell/app architecture study | SHADED |
| `forbiddenlink/lumira` | World-Director donor | A+ | Not stated; verify | REFERENCE_ONLY | TRIAGED | World-direction/orchestration pattern (no World State ownership) | SHADED |
| `forbiddenlink/specter` | Dev-layer impact/risk donor | S+ | MIT | REIMPLEMENT (bounded) | TRIAGED | Specific dev-layer risk/impact mechanisms only | SHADED |
| `GS-Agent` | Responsibility-boundary donor | A+ | Not stated; verify | REFERENCE_ONLY | TRIAGED | Agent/Physics/Rendering separation-of-concerns pattern | SHADED |

## 25.8 KilledByAPixel / procedural donor hub

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| `KilledByAPixel` (hub) | Top-Tier SHADED Donor Hub | — | Varies per repo; verify per extraction | REFERENCE_ONLY (hub-level) | TRIAGED | Cross-cutting procedural/rendering technique hub | SHADED |
| `VaseFX`, `stereogram`, `Golf13K`, `Drive13K`, `TinyCode`, `OS13k`, `LittleJS`, `FrankEngine` | KilledByAPixel own-repo cluster | (cluster) | Verify per repo | STUDY_ONLY | TRIAGED | Procedural minimalism / rendering / interpolation / compact runtime patterns | SHADED |
| Depth Anything, MarkovJunior, Hydraulic-Erosion/worldgen (+ other classified stars) | High-priority starred candidates | A1/S (per repo) | Verify per repo | STUDY_ONLY | TRIAGED | Named per concrete extraction once actually pulled | SHADED |

## 25.9 Weitere festgelegte Solver-/Methoden-Donors

| Donor | Role | Rank | License | Use Mode | Status | SHADED Contract | Owner |
|---|---|---|---|---|---|---|---|
| `monman53` / Tetsuro Sakamoto cluster | Technique donor | S | Verify per repo | STUDY_ONLY | TRIAGED | WebGL fragment-compute / FFT / Transform-Feedback / snow-crystal sim / camera-light-ray / kd-tree patterns | SHADED |
| `lele394/Lattice-Boltzmann-WebGL` | Fluid-solver donor | S+ | Verify | REIMPLEMENT | TRIAGED | D2Q9 LBM / MRT / boundary conditions / density-velocity visualization | SHADED |
| Sand Homogenization (method) | Material-parameter donor | A+ | N/A (method/paper) | REFERENCE_ONLY (literature-derived) | TRIAGED | Continuum-parameter derivation from granular matter | SHADED |
| Literature-derived Physics Core (collision/constraints/CCD/PBD/XPBD/etc.) | Preferred core for established mechanics | — | N/A (literature) | REFERENCE_ONLY (literature-derived core) | TRIAGED | Rigid-body/contact/constraint/friction/fluid-granular core | SHADED |
| Protectwise/Troika, Adriwin06/black-hole, other ranked A/S donors | Dauerhaft gerankte Donors | A/S (per repo) | Verify per repo | REFERENCE_ONLY | TRIAGED | Role to be documented explicitly before integration (G-2563) | SHADED |

## 25.10 Compliance status (`G-2564`..`G-2570`)

- **`G-2564`** (this matrix exists, covering `G-2511`..`G-2563`): **PASS** — every entry above.
- **`G-2565`** (columns present): **PASS** — `ROLE`/`RANK`/`LICENSE`/`USE MODE`/`STATUS`/`SHADED
  CONTRACT`/`OWNER` present on every row.
- **`G-2566`** (no silent deletion/replacement): **PASS by construction** — `Particles4All` is the
  one entry marked `SUPERSEDED`, and that supersession is itself `GOAL_WORLD.md`'s own explicit
  `G-2525`, not something this matrix invented.
  ​
- **`G-2567`** ("considered" means inspected, not just linked): **OPEN** — every row is honestly
  `TRIAGED` (role/rank assigned from canon), not yet `INSPECTED` (source actually opened this
  session). Marking 60 external repositories `INSPECTED` in one pass without actually opening each
  one would be exactly the fabricated-evidence failure `GOAL_WORLD.md` `G-2707`/`G-2707`/Alfred's
  own `A-0006` warn against. Left honestly open, not stubbed.
- **`G-2568`** (overlap treated as benchmark/composition, not silently dropped): **OPEN**, same
  reason — real ablation/benchmark work needs the sources actually pulled first.
- **`G-2569`** (license boundaries respected): **PASS for what's stated in canon** — every
  `STUDY_ONLY`/`REFERENCE_ONLY` marking above reproduces `GOAL_WORLD.md`'s own stated license
  caution (GPL-3.0, AGPL-3.0, "All Rights Reserved", "unclear license") rather than loosening it.
- **`G-2570`** (SHADED is owner after integration): **PASS by construction** — every row's `OWNER`
  column is `SHADED`, no exceptions.
