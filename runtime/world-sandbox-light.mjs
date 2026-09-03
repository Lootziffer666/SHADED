// SHADED per-cell light field -- first real slice of the architecture from the user's own
// "SHADED: Light as a World Field" reference doc ("light is a field of the world, not a
// property of the camera"). This file implements Pass 3 from that doc (direct sun visibility via
// height-field ray-marching) only: a real, honest first step, not a stub for the full 7-pass
// pipeline (optical bake, sky exposure, iterative bounce light transport, world response,
// render). Those are real, named follow-ups -- not built here yet.
//
// Reads the SAME heightfield the rest of the sandbox already uses (surface() = BEDROCK + SAND
// from world-sandbox-reference.mjs, already the terrain's own real elevation, not a second
// height concept invented for lighting) so a dune that blocks sand transport also correctly
// casts a shadow -- one terrain, one height, not two truths.
//
// This world-sandbox has no day/night cycle with a moving sun position yet (only a scalar
// env.sun intensity exists, with no direction). Sun direction/elevation are therefore explicit
// caller-supplied parameters here, the same honest-placeholder pattern already used for the vine
// gremlin's light target in world-sandbox-growth.mjs -- not silently wired to a fake default.
//
// CPU reference only for now; a WGSL/WebGPU mirror (matching world-sandbox-webgpu.mjs's existing
// dual-implementation discipline for the rest of this sandbox) is a real follow-up, not built
// here -- this module proves the ray-march model is correct before it's worth porting to GPU.

import {surface, cellOffset} from './world-sandbox-reference.mjs';

const MAX_MARCH_STEPS = 64;
const MARCH_CELLS_PER_STEP = 2; // matches the reference doc's "2 cells per step"

// Returns a Float32Array of size*size sun-visibility values in [0,1] (1 = in direct sunlight,
// 0 = occluded), indexed the same way as the world state's own cells (z*size+x).
//
// `sunDirX`/`sunDirZ`: normalized horizontal direction the ray marches TOWARD the sun (XZ only,
// world-space [0,1] units, same convention as world-sandbox-growth.mjs's tip coordinates).
// `sunElevation`: angle above the horizon in radians (0 = grazing/sunset, PI/2 = straight
// overhead) -- higher elevation means the "expected height" a march step must clear rises much
// faster with distance, so a low sun casts long shadows and a high sun casts almost none, the
// same real relationship real shadows have.
export function computeSunVisibility(state, size, sunDirX, sunDirZ, sunElevation) {
  const len = Math.hypot(sunDirX, sunDirZ);
  const dirX = len > 1e-6 ? sunDirX / len : 1;
  const dirZ = len > 1e-6 ? sunDirZ / len : 0;
  const tanElevation = Math.tan(Math.max(0.001, sunElevation));
  const marchStep = MARCH_CELLS_PER_STEP / size;

  const out = new Float32Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const originOffset = cellOffset(size, x, z);
      const originHeight = surface(state, originOffset);
      let worldX = (x + 0.5) / size;
      let worldZ = (z + 0.5) / size;
      let visible = 1;
      for (let step = 1; step <= MAX_MARCH_STEPS; step++) {
        worldX += dirX * marchStep;
        worldZ += dirZ * marchStep;
        if (worldX < 0 || worldX > 1 || worldZ < 0 || worldZ > 1) break; // marched off the world into open sky
        const cx = Math.min(size - 1, Math.max(0, Math.floor(worldX * size)));
        const cz = Math.min(size - 1, Math.max(0, Math.floor(worldZ * size)));
        const terrainHeight = surface(state, cellOffset(size, cx, cz));
        const expectedHeight = originHeight + tanElevation * (step * marchStep);
        if (terrainHeight > expectedHeight) {
          visible = 0;
          break;
        }
      }
      out[z * size + x] = visible;
    }
  }
  return out;
}
