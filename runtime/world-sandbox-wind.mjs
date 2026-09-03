// SHADED wind deformation -- "Tier 1: Vertex-Animated Wind" from the user's foliage-physics
// reference doc, ported onto this project's plant-graph tube geometry (world-sandbox-mesh.mjs).
// The doc's three-layer model (global sway, a travelling gust front, per-vertex turbulence),
// height-weighted quadratically so roots stay planted and tips sway most, plus the "arc
// correction" that keeps a bent tip's apparent length from stretching.
//
// This world-sandbox has no vertical growth axis yet, so the doc's `uv.y` / world-height weight
// is replaced with `rootDistance` (world-sandbox-mesh.mjs's own geodesic distance-from-root
// output) -- same shape (0 at the anchor, growing outward), built from data this graph actually
// has. See world-sandbox-mesh.mjs's own rootDistances comment for the full reasoning.
//
// The doc's gust layer samples a pre-baked tileable noise texture; this module has no texture
// pipeline (CPU reference + WGSL, no image asset), so both implementations use the same cheap,
// deterministic hash-noise function instead -- documented as a real simplification, not hidden.
// Deliberately NOT the classic `sin(dot(...))*43758.5453` GLSL hash trick: that formula's whole
// mechanism is amplifying tiny input differences into pseudo-randomness (multiplying a
// moderate-magnitude float by ~43758 and keeping only the fractional part), which is exactly
// what makes it useless as noise if it were reproducible -- and exactly why it CAN'T match
// between this file's two implementations: JS runs it in float64, WGSL is mandatorily float32,
// and that same amplification mechanism turns their tiny, unavoidable last-bit differences into
// completely different outputs. Confirmed empirically while building the GPU lockstep test
// (tools/test-world-sandbox-wind-gpu.mjs): case 1 gave CPU dx=-0.2412 vs GPU dx=-0.1859, a huge
// disagreement despite both formulas being byte-identical. Uses an integer bit-mixing hash
// instead (quantize to a fixed-point domain, then wrapping 32-bit multiply/xor/shift, PCG-style)
// -- every intermediate value is an EXACT 32-bit integer operation, identical in JS (Math.imul,
// which performs true 32-bit wrapping multiplication) and WGSL (u32 arithmetic, which wraps by
// spec), with only the final int->[0,1) division being floating-point, and that division is by
// an exact power of two, representable identically in float32 and float64. No precision gap for
// this mechanism to amplify.
//
// CPU reference (computeWindDisplacement) and the WGSL mirror (WIND_DISPLACEMENT_WGSL) implement
// the IDENTICAL formula, constant-for-constant -- the same lockstep discipline
// world-sandbox-reference.mjs/world-sandbox-webgpu.mjs already keep for the rest of this
// sandbox. tools/test-world-sandbox-wind.mjs proves both the CPU formula's own documented
// properties AND that the WGSL version numerically agrees with it via a real GPU compute pass
// (not just "compiles").

// Baked constants, matching the doc's own design: only bendStrength is meant to be a live,
// per-plant/per-frame tunable (the doc's uBendStrength uniform) -- everything else is a fixed
// shape of the wind model itself, not exposed as a parameter here.
const WIND_GUST_SPEED = 6.0;
const WIND_SWAY_AMP = 0.35;
const WIND_GUST_AMP = 0.85;
const WIND_TURB_AMP = 0.15;
const WIND_TURB_FREQ = 6.5;

// Quantizes to 1/4096 world-unit resolution (plenty for wind noise) before mixing, so the whole
// function is exact 32-bit integer arithmetic apart from the final division.
function windHash2(x, z) {
  let h = (Math.imul(Math.floor(x * 4096) | 0, 0x27d4eb2d) ^ Math.imul(Math.floor(z * 4096) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296; // exact power-of-two division -- identical in float32 and float64
}

// Returns the {dx, dy, dz} world-space displacement wind applies at (x, z) this instant.
// `rootDistance`/`maxDistance`: this vertex's own distance-from-root and the plant's overall
// longest root-distance (so h = rootDistance/maxDistance lands in [0,1] regardless of the
// plant's actual size). `windDirX`/`windDirZ`: normalized wind direction. `bendStrength`: the
// one live-tunable parameter, matching the doc's uBendStrength.
export function computeWindDisplacement(x, z, rootDistance, maxDistance, time, windDirX, windDirZ, bendStrength) {
  const h = Math.max(0, Math.min(1, rootDistance / Math.max(1e-6, maxDistance)));
  const hMask = h * h; // quadratic weighting -- the doc's own "linear looks rubbery" note

  const sway = Math.sin(time * 1.3 + (x * 0.061 + z * 0.053)) * WIND_SWAY_AMP;

  const gustX = x - windDirX * time * WIND_GUST_SPEED;
  const gustZ = z - windDirZ * time * WIND_GUST_SPEED;
  const gust = (windHash2(gustX * 0.02, gustZ * 0.02) * 2 - 1) * WIND_GUST_AMP;

  const phase = windHash2(x * 13.7, z * 91.3); // per-vertex desync, derived from position (no
  const turb = Math.sin(time * WIND_TURB_FREQ + phase * Math.PI * 2) * WIND_TURB_AMP; // per-instance attribute needed here

  const bend = (sway + gust + turb) * bendStrength * hMask;
  return {
    dx: windDirX * bend,
    dy: -bend * bend * 0.35, // arc correction: tip drops as it bends, preserving apparent length
    dz: windDirZ * bend,
  };
}

// WGSL mirror of computeWindDisplacement above -- same constants, same formula, same order of
// operations. Callable from any vertex shader that has a position, that vertex's rootDistance,
// the plant's maxDistance, time, wind direction, and bend strength.
export const WIND_DISPLACEMENT_WGSL = /* wgsl */ `
fn windHash2(x: f32, z: f32) -> f32 {
  // gustX/gustZ (see windDisplacement below) can go negative for realistic time values, so this
  // must handle negative inputs identically to the JS side's Math.imul (which reinterprets a
  // signed int32's two's-complement bit pattern as unsigned). WGSL's u32() conversion of a
  // NEGATIVE float clamps to 0 rather than wrapping -- going through i32() first (which DOES
  // round a negative value the normal signed way) and then bitcast<u32> (a true bit
  // reinterpretation, not a numeric conversion) is what actually matches.
  let ix: i32 = i32(floor(x * 4096.0));
  let iz: i32 = i32(floor(z * 4096.0));
  var h: u32 = (bitcast<u32>(ix) * 0x27d4eb2du) ^ (bitcast<u32>(iz) * 0x85ebca6bu);
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12u)) * 0x297a2d39u;
  h = h ^ (h >> 15u);
  return f32(h) / 4294967296.0;
}

fn windDisplacement(x: f32, z: f32, rootDistance: f32, maxDistance: f32, time: f32, windDirX: f32, windDirZ: f32, bendStrength: f32) -> vec3<f32> {
  let h = clamp(rootDistance / max(1e-6, maxDistance), 0.0, 1.0);
  let hMask = h * h;

  let sway = sin(time * 1.3 + (x * 0.061 + z * 0.053)) * 0.35;

  let gustX = x - windDirX * time * 6.0;
  let gustZ = z - windDirZ * time * 6.0;
  let gust = (windHash2(gustX * 0.02, gustZ * 0.02) * 2.0 - 1.0) * 0.85;

  let phase = windHash2(x * 13.7, z * 91.3);
  let turb = sin(time * 6.5 + phase * 6.2831853) * 0.15;

  let bend = (sway + gust + turb) * bendStrength * hMask;
  return vec3<f32>(windDirX * bend, -bend * bend * 0.35, windDirZ * bend);
}
`;
