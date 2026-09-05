// Self-tests for src/physics/rigidBody.mjs (PHYSICS.md's first slice: rigid bodies + contact +
// terrain collision), the groundHeightAt/groundHeightAndNormal samplers it depends on in
// src/sandbox/world-sandbox-reference.mjs, and -- at the bottom -- its actual wiring into
// src/sandbox/world-sandbox-runtime.mjs's launchStone()/updateBody(). The unit sections above are
// the literature-checkable properties of the physics module itself (drop-bounce restitution,
// friction, slope roll, penetration correction) in isolation; the integration section is the only
// coverage in this repo's check suite that exercises src/sandbox/* directly at all -- every other
// test-world-sandbox-*.mjs script imports the parked ../runtime/ copy instead (see CLAUDE.md's
// "Status: two subsystems, one repo"), so a regression in the live Snowflow tree would otherwise
// go completely unnoticed by `npm run check`.
import assert from 'node:assert/strict';
import {createSphereBody, stepSphereBody, DEFAULT_RESTITUTION} from '../src/physics/rigidBody.mjs';
import {
  FIELD, CELL_STRIDE, cellOffset, groundHeightAt, groundHeightAndNormal,
} from '../src/sandbox/world-sandbox-reference.mjs';
import {WorldSandboxRuntime} from '../src/sandbox/world-sandbox-runtime.mjs';

function ok(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`✓ ok: ${message}`);
}

// ---------------------------------------------------------------- flat-ground fixture
const FLAT_HEIGHT = 0.4;
const flatGround = () => ({height: FLAT_HEIGHT, normalX: 0, normalY: 1, normalZ: 0});

// 1. Free fall: with no ground under it, gravity alone integrates the body downward every step.
{
  const body = createSphereBody({x: 0.5, y: 10, z: 0.5, radius: 0.02});
  const noGroundFarBelow = () => ({height: -1000, normalX: 0, normalY: 1, normalZ: 0});
  const report = stepSphereBody(body, noGroundFarBelow, 1 / 60);
  ok(report.contact === false, 'a body far above the ground reports no contact this step');
  ok(body.vy < 0, 'gravity alone makes an airborne body accelerate downward');
}

// 2. Drop-bounce restitution: for a 1D vertical drop onto flat ground, the bounce apex height
// should be e^2 * drop height (energy in a perfectly elastic bounce along one axis scales with
// v^2, and v^2 scales linearly with height under constant gravity -- this is the textbook
// restitution check, independent of this module's internals).
{
  const radius = 0.01;
  const restingHeight = FLAT_HEIGHT + radius; // the sphere CENTER's height at rest, not FLAT_HEIGHT itself
  const dropHeight = 0.3; // fall distance of the center above its own resting height
  const restitution = DEFAULT_RESTITUTION;
  const body = createSphereBody({
    x: 0.5, z: 0.5, y: restingHeight + dropHeight, radius, restitution, friction: 0,
  });
  const dt = 1 / 240; // fine step so the discrete bounce apex closely tracks the analytic one
  let apex = -Infinity;
  let bounced = false;
  for (let i = 0; i < 20000 && body.y > FLAT_HEIGHT - 1; i++) {
    stepSphereBody(body, flatGround, dt);
    if (body.vy > 0) bounced = true;
    if (bounced) {
      if (body.y > apex) apex = body.y;
      else if (body.vy <= 0) break; // past the apex and descending again
    }
  }
  const apexAboveRest = apex - restingHeight;
  const expectedAboveRest = dropHeight * restitution * restitution;
  ok(bounced, 'the body actually leaves the ground after impact (vy > 0 at some point)');
  ok(
    Math.abs(apexAboveRest - expectedAboveRest) / expectedAboveRest < 0.08,
    `bounce apex above resting height (${apexAboveRest.toFixed(4)}) matches e^2 * dropHeight `
      + `(${expectedAboveRest.toFixed(4)}) within 8%`,
  );
}

// 3. Resting equilibrium: a body placed exactly at contact height with zero velocity does not
// sink through the floor or accumulate energy over many steps.
{
  const body = createSphereBody({x: 0.5, z: 0.5, y: FLAT_HEIGHT + 0.02, radius: 0.02, friction: 0.6});
  const dt = 1 / 60;
  for (let i = 0; i < 300; i++) stepSphereBody(body, flatGround, dt);
  ok(body.y >= FLAT_HEIGHT + 0.02 - 0.01, `a settled body stays at/above contact height (y=${body.y.toFixed(5)})`);
  ok(Math.abs(body.vy) < 0.05, `a settled body's vertical speed decays toward zero (vy=${body.vy.toFixed(5)})`);
  ok(body.resting === true, 'a settled body reports resting=true');
}

// 4. Penetration correction: a body that starts already overlapping the terrain is pushed back
// out along the normal within a single step, rather than being left to sink or teleport instantly.
{
  const body = createSphereBody({x: 0.5, z: 0.5, y: FLAT_HEIGHT + 0.005, vy: 0, radius: 0.02});
  const penetrationBefore = FLAT_HEIGHT + body.radius - body.y;
  const report = stepSphereBody(body, flatGround, 1 / 60);
  const penetrationAfter = FLAT_HEIGHT + body.radius - body.y;
  ok(report.contact === true, 'an overlapping body reports contact');
  ok(penetrationAfter < penetrationBefore, 'penetration strictly decreases after one step (partial correction, not a teleport)');
  ok(penetrationAfter > 0, 'a single step does not fully resolve penetration either (BAUMGARTE < 1)');
}

// 5. Slope roll: on a tilted ground plane, gravity's tangential component should accelerate a
// resting body downhill -- the entire reason groundHeightAndNormal()/contact use a real normal
// instead of "always straight down," per PHYSICS.md's "Fels-Test" (a rock reacts to the actual
// surface it lands on, not an abstracted flat plane).
{
  // A plane tilted so "downhill" is +x: height H(x) = FLAT_HEIGHT + (0.5-x)*0.6 decreases as x
  // grows, so dH/dx = -0.6 and the outward normal (-dH/dx, 1, -dH/dz)/len leans toward +x.
  const tiltNormalX = 0.6;
  const tiltNormalY = Math.sqrt(1 - tiltNormalX * tiltNormalX);
  const tiltedGround = (x, z) => ({height: FLAT_HEIGHT + (0.5 - x) * 0.6, normalX: tiltNormalX, normalY: tiltNormalY, normalZ: 0});
  const body = createSphereBody({x: 0.5, z: 0.5, y: tiltedGround(0.5, 0.5).height + 0.02, radius: 0.02, friction: 0.05});
  const startX = body.x;
  for (let i = 0; i < 120; i++) stepSphereBody(body, tiltedGround, 1 / 60);
  ok(body.x > startX, `a resting body on a slope rolls downhill (+x) instead of staying put (dx=${(body.x - startX).toFixed(5)})`);
}

// 6. Friction actually removes tangential energy: same slope, near-zero vs. high friction should
// diverge in how much downhill speed survives after the same number of steps.
{
  const tiltedGround = (x, z) => ({height: FLAT_HEIGHT + (0.5 - x) * 0.6, normalX: 0.6, normalY: Math.sqrt(1 - 0.36), normalZ: 0});
  const low = createSphereBody({x: 0.5, z: 0.5, y: tiltedGround(0.5, 0.5).height + 0.02, radius: 0.02, friction: 0.02});
  const high = createSphereBody({x: 0.5, z: 0.5, y: tiltedGround(0.5, 0.5).height + 0.02, radius: 0.02, friction: 0.95});
  for (let i = 0; i < 90; i++) {
    stepSphereBody(low, tiltedGround, 1 / 60);
    stepSphereBody(high, tiltedGround, 1 / 60);
  }
  ok(low.x > high.x, `low-friction body slides further downhill than high-friction body (low.x=${low.x.toFixed(5)}, high.x=${high.x.toFixed(5)})`);
}

// ---------------------------------------------------------------- ground sampler self-tests
{
  const size = 8;
  const state = new Float32Array(size * size * CELL_STRIDE);
  // A simple, gentle upward ramp along x: bedrock height rises from 0 to 0.1 across the grid.
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const o = cellOffset(size, x, z);
      state[o + FIELD.BEDROCK] = (x / (size - 1)) * 0.1;
    }
  }
  const midLow = groundHeightAt(state, size, 0.1, 0.5);
  const midHigh = groundHeightAt(state, size, 0.9, 0.5);
  ok(midHigh > midLow, 'groundHeightAt reads the ramp direction correctly');

  const {normalX, normalY} = groundHeightAndNormal(state, size, 0.5, 0.5);
  ok(normalY > 0.9, `a gentle ramp's normal stays close to "up" (normalY=${normalY.toFixed(4)})`);
  ok(normalX < 0, `an upward ramp along +x tilts the normal toward -x (normalX=${normalX.toFixed(4)})`);
}

// ---------------------------------------------------------------- integration: the live stone
// Exercises src/sandbox/world-sandbox-runtime.mjs's own launchStone()/updateBody() end to end --
// the actual code path Snowflow's stone tool runs -- not just the physics module in isolation.
{
  const runtime = new WorldSandboxRuntime({cpuSize: 48});
  runtime.enter();
  runtime.setTool('stone');
  const launched = runtime.useTool(0.5, 0.5);
  ok(launched.active === true, 'launching a stone activates the body');
  ok(typeof launched.resting === 'boolean', 'the live stone carries a resting flag from day one, not just after a physics-module upgrade');

  // Plain assert (no per-step console line -- 600 potential iterations of the friendly ok()
  // logger would flood the check output) for the per-step invariants; the friendly, narrated
  // ok() calls below cover the properties that actually matter about the whole run.
  let sawImpact = false;
  let maxAbsVelocity = 0;
  let steps = 0;
  for (; steps < 600; steps++) {
    runtime.stepOnce();
    const body = runtime.snapshot().body;
    assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y) && Number.isFinite(body.z), `stone position stays finite at step ${steps}`);
    assert.ok(body.y > -1 && body.y < 5, `stone stays within a sane height range at step ${steps} (y=${body.y})`);
    maxAbsVelocity = Math.max(maxAbsVelocity, Math.abs(body.vx), Math.abs(body.vy), Math.abs(body.vz));
    if (body.impacts > 0) sawImpact = true;
    if (!body.active) break;
  }
  ok(true, `stone position/height stay finite and sane across all ${steps + 1} simulated steps`);
  const finalBody = runtime.snapshot().body;
  ok(sawImpact, 'the live stone actually registers a real terrain contact (impacts > 0), not just floats forever');
  ok(finalBody.active === false, 'the live stone eventually settles and deactivates, instead of bouncing/jittering forever');
  ok(maxAbsVelocity < 5, `stone velocity never blows up over the run (max |v| component = ${maxAbsVelocity.toFixed(4)})`);
}

console.log('\n✅ Alle Rigid-Body/Physics-Selbsttests bestanden');
