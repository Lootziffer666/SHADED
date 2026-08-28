# SHADED Sandbox — Element / Simulation Donor Matrix

This matrix turns the current source dump into **system donors**, not a pile of shader presets.

## Rule

SHADED has three separate responsibilities:

1. **WORLD STATE** — authoritative scalar/vector fields and semantic material state.
2. **SOLVER** — deterministic rules that evolve those fields.
3. **RENDERER** — visualizes the resulting state; visuals never become authoritative state.

A source can be excellent at one layer and useless at the other two.

---

## P0 — implement/adapt next

| System | Primary donors | Why SHADED needs it | License posture |
|---|---|---|---|
| Granular cellular solver | GelamiSalami/GPU-Falling-Sand-CA; m4ym4y/falling-sand-shader; kody-w Falling Sand Lab | Replace simple per-cell movement with race-safe block updates; support material reactions | GelamiSalami and m4ym4y: no reusable license established in inspected root, technique only until resolved. Kody page: verify before code reuse. |
| Stable Fluids / smoke velocity field | piellardj/navier-stokes-webgl; aadebdeb/WebGL_SmokeSimulation; julesyoungberg/2d-smoke; keijiro/StableFluids; matthiasbroske/GPUStableFluids | Real advection / pressure projection for smoke, steam, heat haze and gas instead of noise-only animation | piellardj package declares ISC; aadebdeb MIT; julesyoungberg MIT; keijiro public-domain/Unlicense; matthiasbroske MIT. |
| Coast / water surface | Babylon stylized-water thread; gameidea stylized 3D water; Seascape; PhysicsMod oceans.glsl | Depth-aware shallow/deep water, refraction, shore/crest foam, wave normals | Babylon/gameidea used as technique blueprint. Verify individual Seascape / PhysicsMod source license before copying. |
| Dune surface dynamics | keaukraine/webgl-dunes + dunes article | Windward/leeward ripple orientation, distance fade, cheap terrain shading | MIT verified for webgl-dunes. |
| Soft particle intersection | keaukraine soft-particles article | Dust, sand spray, smoke, mist, foam spray without hard geometry clipping | Technique reimplementation; keep independent SHADED shader path. |

### Granular algorithm target

The strongest architectural upgrade is **block cellular automata with Margolus-style offsets**:
- non-overlapping 2x2 blocks avoid write races,
- offsets move each frame so particles are not locked to one block partition,
- GelamiSalami uses a four-step Z-shaped shift to reduce directional bias,
- whole-cell swapping makes multi-material rules easier.

SHADED should implement this algorithm independently unless a donor's source license is explicitly compatible.

### Stable Fluids target

The shared minimum pipeline should be:
1. add force / source,
2. advect velocity,
3. diffuse when required,
4. compute divergence,
5. pressure solve (Jacobi / iterative),
6. subtract pressure gradient,
7. advect scalar density / heat / smoke,
8. inject buoyancy / vorticity confinement as optional stages.

Each stage must be individually toggleable and timed in the Sandbox.

---

## P1 — visual render donors

| Material / effect | Sources | SHADED use |
|---|---|---|
| Ocean / open water | Seascape Gist / Shadertoy; PhysicsMod oceans.glsl | Wave shape, specular/fresnel, horizon treatment, open-ocean visual target |
| Fire | XT95 flame.glsl; lostintangent fire gist; greentec fire article | Flame density / distortion / blackbody-style palette; renderer only, fire state comes from world solver |
| Lava | ghostty-shaders cineShader-Lava.glsl | Hot/crust pattern, emissive breakup; lava temperature/flow must remain solver state |
| Clouds | Reinder Himalayas buffers; Protean Clouds | Volumetric density, cheap raymarching, lighting/phase targets |
| Terrain / ice | avcourt/terrain; keaukraine dunes | Terrain shading vocabulary and snow/ice region masks |
| Fireworks | sanxincao firework.glsl | Particle burst reference, not core world simulation |

**Shadertoy rule:** source found on Shadertoy or a backup repository is treated as visual/algorithm reference until that shader's reuse license is explicitly verified.

---

## P2 — papers / algorithm specifications

These are more valuable than another effect preset because they let SHADED own the implementation:

- Jos Stam — *Stable Fluids*.
- Jos Stam — *Real-Time Fluid Dynamics for Games*.
- Mark J. Harris — *Fast Fluid Dynamics Simulation on the GPU* (GPU Gems).
- *Hardware-aware analysis and optimization of stable fluids* (I3D 2008).
- *Probabilistic Cellular Automata for Granular Media in Video Games* (linked by GPU-Falling-Sand-CA).

Use the papers to define tests and invariants, then use open-source implementations to cross-check behavior and performance.

---

## P3 — source discovery / tooling only

- dawnarc Shader Sources Collections — discovery index, not a runtime donor.
- stevensona/shader-toy — local authoring convenience; not needed by SHADED runtime.
- devdynaf falling-sand live demo — reaction vocabulary / UX reference until source + license are verified.
- archive.org Sandspiel snapshot — historical behavior reference only unless original licensing is recovered.

---

## Missing SHADED labs after Material / Coast / Granular

### Fluid Lab
A 2D GPU Stable-Fluids solver with observable velocity, divergence, pressure, density, temperature and obstacles. This becomes the shared solver for smoke, steam, gas, heat and later fluid-driven particles.

### Particle Lab
Instanced particles with scene-depth softening. Shared emitters for dust, spray, sparks, embers, snow, rain, ash, bubbles and debris. Particle appearance can vary; the emitter / collision / depth contract should not.

### Volume Lab
Raymarched density renderer for smoke, fog and clouds. It consumes density/temperature/light fields from Fluid Lab or procedural density sources, with HQ/Balanced/Fast step budgets and temporal stabilization.

### Reaction Lab
A readable material-state graph, e.g.:
- water <-> ice <-> steam,
- soil + water -> mud,
- lava -> cooling crust -> rock,
- fuel + heat -> fire -> smoke + soot + ash,
- snow + heat -> meltwater / slush,
- wet surface + heat/wind -> dry,
- vegetation + drought -> dry fuel -> char/ash.

The graph updates authoritative world fields; renderers only visualize them.

### Erosion / Sediment Lab
Couple terrain slope, water flow, loose sediment and deposition. This connects dune/sand visuals to actual world evolution instead of treating terrain as immutable decoration.

### Vegetation Lab
Growth, bending, wet/dry state, snow loading, burn/char and procedural scatter. It should read wind/moisture/temperature/light fields rather than invent its own weather controls.

---

## Required cross-cutting infrastructure

Every Sandbox donor eventually needs the same metadata/adapter contract:

- source URL + author + license + source revision/hash,
- layer: state / solver / renderer,
- required buffers: scene color, depth, normals, motion, environment, world fields,
- outputs: color, normal, roughness, emission, opacity, density, velocity, state deltas,
- quality tiers and hard loop/step limits,
- deterministic seed behavior where relevant,
- GPU time, render resolution, memory estimate and compile/link result,
- mobile capability/fallback,
- explicit statement whether copied code, adapted code or technique-only reimplementation was used.

That contract is more important than collecting another hundred shaders: it is what lets SHADED compare, combine and safely promote experiments into the real world runtime.
