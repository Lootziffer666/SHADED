// Behavioural regression test for runtime/world-sandbox-wind.mjs's computeWindDisplacement()
// (Tier 1 wind, ported from the user's foliage-physics reference doc onto this project's plant
// graph). Proves the model's own documented structural claims directly from the formula, not by
// eyeballing a rendered result: a vertex right at its root never moves regardless of wind/time
// (the whole point of weighting by rootDistance), the arc-correction relationship between
// horizontal bend and vertical drop holds exactly, wind direction alone determines the
// displacement's own direction, and the height weight clamps at the tip instead of
// extrapolating past it.
import assert from 'node:assert/strict';
import {computeWindDisplacement} from '../runtime/world-sandbox-wind.mjs';

const MAX_DISTANCE = 2.0;

// --- A vertex at the root (rootDistance=0) never moves, for any time/wind/bendStrength -----
{
  for (const time of [0, 1.7, 42.3]) {
    for (const bendStrength of [0.1, 0.5, 2.0]) {
      const d = computeWindDisplacement(0.4, 0.6, 0, MAX_DISTANCE, time, 1, 0, bendStrength);
      // === (not assert.equal, which uses Object.is under strict mode and would reject a
      // mathematically-irrelevant -0 propagating through hMask=0 as "not equal to 0").
      assert.ok(d.dx === 0, `a root vertex (rootDistance=0) never moves in X, regardless of time=${time}/bendStrength=${bendStrength}`);
      assert.ok(d.dy === 0, `a root vertex never moves in Y either`);
      assert.ok(d.dz === 0, `a root vertex never moves in Z`);
    }
  }
}

// --- The arc-correction relationship (dy = -0.35 * bend^2) holds exactly, derived from dx ---
{
  // windDir=(1,0) makes bend directly recoverable as dx/windDirX = dx, isolating the
  // relationship between the horizontal and vertical terms from the wind-direction projection.
  const d = computeWindDisplacement(0.31, 0.72, 1.4, MAX_DISTANCE, 5.2, 1, 0, 0.8);
  const bend = d.dx; // windDirX=1, so bend == dx exactly
  const expectedDy = -0.35 * bend * bend;
  assert.ok(Math.abs(d.dy - expectedDy) < 1e-9, `dy is exactly -0.35*bend^2 (arc correction), derived from dx as bend (got dy=${d.dy}, expected=${expectedDy})`);
  assert.ok(d.dy <= 0, 'the arc correction always pulls a bending tip DOWN, never up');
}

// --- Wind direction alone determines the displacement's own direction ----------------------
{
  // Pure +X wind: no Z component should appear at all.
  const dx1 = computeWindDisplacement(0.5, 0.5, 1.5, MAX_DISTANCE, 3.0, 1, 0, 1.0);
  assert.ok(dx1.dz === 0, 'wind blowing purely along +X produces zero Z displacement');

  // Pure +Z wind: no X component should appear at all.
  const dz1 = computeWindDisplacement(0.5, 0.5, 1.5, MAX_DISTANCE, 3.0, 0, 1, 1.0);
  assert.ok(dz1.dx === 0, 'wind blowing purely along +Z produces zero X displacement');
}

// --- The horizontal displacement scales linearly with bendStrength -------------------------
{
  const d1 = computeWindDisplacement(0.62, 0.18, 1.8, MAX_DISTANCE, 7.0, 1, 0, 0.4);
  const d2 = computeWindDisplacement(0.62, 0.18, 1.8, MAX_DISTANCE, 7.0, 1, 0, 0.8); // exactly double
  assert.ok(Math.abs(d2.dx - d1.dx * 2) < 1e-9, `doubling bendStrength exactly doubles the horizontal displacement (${d1.dx} -> ${d2.dx})`);
}

// --- The height weight clamps at the tip (h=1), it does not extrapolate past it -------------
{
  const atTip = computeWindDisplacement(0.3, 0.9, MAX_DISTANCE, MAX_DISTANCE, 12.0, 1, 0, 0.6);
  const wayPastTip = computeWindDisplacement(0.3, 0.9, MAX_DISTANCE * 5, MAX_DISTANCE, 12.0, 1, 0, 0.6);
  assert.equal(atTip.dx, wayPastTip.dx, 'a rootDistance far beyond maxDistance produces the SAME displacement as exactly at the tip -- the height weight clamps to 1, it does not keep growing past the actual tip');
}

console.log('wind: a root vertex never moves, the arc correction is exactly -0.35*bend^2, wind direction alone sets the displacement axis, bend strength scales linearly, and the height weight clamps at the tip instead of extrapolating past it');
