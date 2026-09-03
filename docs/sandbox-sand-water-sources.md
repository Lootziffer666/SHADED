# SHADED Sandbox — sand, water and particle source map

This document records the source set supplied for the sandbox and, more importantly, which **system boundary** each source informs. SHADED does not treat "sand" or "water" as one shader preset.

## Boundary

| Layer | Responsibility | Sandbox home |
|---|---|---|
| Material | color, roughness, micro-normal, wetness response | Material Lab |
| Surface dynamics | dunes, wind ripples, shoreline, wave shape, foam | Surface / Coast Lab |
| Granular / fluid state | falling grains, piling, spreading, barriers | Granular Lab |
| Volume particles | dust, spray, smoke, mist, soft intersections | Particle / Volume Lab |

## Sources

### 1. WebGL SandToy
- URL: https://johnrobinsn.github.io/sandtoy/
- Role: architecture reference for GPU-resident particle/granular state and direct brush interaction.
- Key idea: simulation state stays on the GPU; the browser only supplies input and presentation.
- License handling: no source license was established from the supplied page, so this is **technique/reference only**. No code is vendored.

### 2. Babylon.js simple stylized water shader
- URL: https://forum.babylonjs.com/t/simple-stylized-water-shader/17672
- Role: stylized water decomposition.
- Useful controls: water-noise scale/offset for refraction, foam-noise scale, maximum depth, shallow/deep colors.
- Important limitation: depth-overlap foam can appear where meshes overlap in camera space even when geometry is actually above the water. SHADED must not inherit that artifact blindly.
- License handling: forum author explicitly encourages reuse, but SHADED still reimplements the ideas rather than vendoring the Playground implementation.

### 3. Shadertoy t3cfWX
- URL: https://www.shadertoy.com/view/t3cfWX
- Role: visual/reference target supplied by the project owner.
- Retrieval status: automated source retrieval was unavailable during this pass.
- License handling: **visual reference only** until source and license can be inspected explicitly.

### 4. gameidea — Creating a Stylized 3D Water Shader
- URL: https://gameidea.org/2026/02/01/creating-a-stylized-3d-water-shader/
- Role: strongest implementation blueprint in this set for the future Coast Lab.
- Architecture extracted:
  - scene-depth reconstruction -> water thickness
  - shallow/deep color from thickness
  - Beer-Lambert-style absorption/transmittance
  - distance-smoothed procedural wave normals
  - normal-driven refraction with depth masking
  - shoreline + crest foam masks
  - domain-warped Voronoi foam with secondary bubble structure
- SHADED adaptation: use these as independent switchable stages so cost and visual contribution can be measured separately.

### 5. m4ym4y/falling-sand-shader
- URL: https://github.com/m4ym4y/falling-sand-shader
- Role: fragment-shader ping-pong simulation reference for Granular Lab.
- Useful behavior set: dust/sand, walls, fire, metal/electricity, quartz, experimental water, sinks.
- License handling: the repository root exposes no explicit LICENSE file in the inspected revision. SHADED therefore **does not copy its implementation**. The Granular Lab uses an original WebGL2 ping-pong cellular implementation based on the generic GPU-state technique.

### 6. Interactive beach and waves WebGL demo
- URL: https://www.reddit.com/r/webgl/comments/699pqp/beach_and_waves_shader_in_webgl_you_can_move_the/
- Role: interaction target for the Coast Lab.
- Key idea: shoreline/sand level is a live world parameter, not merely a material slider. Moving it should immediately change the beach-water relationship.
- License handling: visual/interaction reference only.

### 7. Rendering dunes terrain in WebGL
- URL: https://dev.to/keaukraine/rendering-dunes-terrain-in-webgl-30k2
- Role: dune surface/material architecture.
- Key ideas:
  - distinguish windward and leeward slopes from the surface normal
  - use different moving ripple scales/orientations per slope
  - fade high-frequency detail with distance
  - keep fog inexpensive
  - separate large-scale diffuse data from small repeating detail

### 8. Implementing soft particles in WebGL / OpenGL ES
- URL: https://dev.to/keaukraine/implementing-soft-particles-in-webgl-and-opengl-es-3l6e
- Role: Particle / Volume Lab.
- Key idea: compare linearized particle depth against scene depth, then use a configurable smoothstep transition to remove hard particle/geometry intersections.
- SHADED use: dust, sand spray, mist, smoke and foam spray should share this depth-softening contract.

### 9. keaukraine/webgl-dunes DunesShader.ts
- URL: https://github.com/keaukraine/webgl-dunes/blob/master/src/shaders/DunesShader.ts
- Role: concrete donor for slope-aware dune shading.
- License: MIT (`LICENSE.txt`, copyright Oleksandr Popov / Dmytro Popov, 2020).
- Reusable concepts and code are permitted with MIT notice retention. SHADED should still adapt the implementation to GLSL ES 3.00/WebGL2 rather than importing the old shader wrapper wholesale.
- Particularly useful donor logic:
  - `vSlopeCoeff` / `vSlopeCoeff2` derived from normal-vs-wind dot products
  - stretched windward versus leeward UVs
  - time-scrolled dust/ripple maps
  - distance-faded detail

### 10. FreeStylized Sand 01
- URL: https://freestylized.com/material/sand_01/
- Role: baseline PBR sand material for the Material Lab and surface-detail source for dune experiments.
- Available public resolutions: 1K / 2K / 4K.
- Site marks the material royalty-free for commercial and non-commercial use; SHADED's existing FreeStylized importer still keeps downloaded files local and gitignored because the site's redistribution restrictions remain in force.

### 11. matsuoka-601/Particles4All
- URL: https://github.com/matsuoka-601/Particles4All
- Role: WebGPU architecture donor for GPU-resident secondary particles, compact compute passes and delayed small-buffer readback.
- Verified scope: Position Based Fluids and particle-based rigid bodies share a constraint loop; the demo renders a reconstructed fluid surface in screen space.
- License: MIT, copyright matsuoka-601 (2026), verified in the repository root.
- SHADED adaptation: the coupled World Lab does not pretend that a full 3D PBF solver is a replacement for height, moisture, sediment and biomass fields. It adopts the GPU-resident particle boundary now; a complete Particles4All fluid operator can later replace the secondary-water-particle pass behind that boundary without changing the CA state contract.

## Implementation decision after this source pass

The first sandbox implementation treated sand primarily as a procedural surface preset. That is insufficient.

`editor/sandbox-granular.js` now establishes the separate **Granular Lab**:
- WebGL2 state textures
- two ping-pong simulation passes per frame
- GPU sand piling
- GPU water falling/spreading
- walls and erase brush
- direct pointer painting
- mobile-safe lower simulation resolution
- no mutation of SHADED scene/world state

The next Coast Lab should combine sources 2, 4, 6, 7, 9 and 10 instead of extending the old single `water` preset indefinitely.

`editor/world-sandbox.js` and `runtime/world-sandbox-webgpu.mjs` now establish the coupled **World Sandbox inside the canonical SHADED editor**:
- CPU input and rigid-body events become bounded stamps;
- WebGPU compute evolves sand, shallow water, sediment, wetness, heat and biomass in ping-pong storage buffers;
- secondary particles remain GPU-resident and return settled mass through atomic deposit cells;
- only a triple-buffered local query is mapped back to the CPU;
- the deterministic CPU reference uses the same 12-scalar cell contract and is both a test oracle and a real fallback;
- downloaded material maps are optional and never gate the simulation.
