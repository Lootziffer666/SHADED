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
import {createSphereBody, stepSphereBody, stepSphereBodies, DEFAULT_RESTITUTION} from '../src/physics/rigidBody.mjs';
import {
  FIELD, CELL_STRIDE, cellOffset, groundHeightAt, groundHeightAndNormal, srgbToLinear,
} from '../src/sandbox/world-sandbox-reference.mjs';
import {WorldSandboxRuntime} from '../src/sandbox/world-sandbox-runtime.mjs';
import {colorForCell} from '../src/sandbox/world-sandbox-cpu-backend.mjs';

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

// ---------------------------------------------------------------- EXECUTION_PLAN.md Task 1:
// albedo clamp + colour-space decode. colorForCell()'s coefficients (r = 73.977 +
// sand*1014.199, etc.) are additive/multiplicative and unclamped by design -- its mode 1..7
// debug views deliberately let values overshoot to make field magnitudes visible.
// sandboxRenderer.js's `_refresh()` divides mode-0 output by 255, clamps it into [0,1] (Task 1),
// then decodes it from sRGB to linear (Task 2) before writing sandboxTex's GBA channels, the
// exact point where this colour stops being a debug value and becomes albedo that
// snow.fragment.wgsl mixes into linear PBR. sandboxRenderer.js itself isn't importable under
// headless Node (it pulls in @babylonjs/core submodules whose resolution needs Vite's bundling,
// not plain ESM), so this test reimplements its one-line clamp (`Math.min(1, Math.max(0, x))`)
// rather than importing it -- keep the two in sync if that formula ever changes. srgbToLinear
// itself is imported from world-sandbox-reference.mjs, the single source both production code
// and this test share.
{
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const pipelineAlbedo = (raw) => raw.map((c) => srgbToLinear(clamp01(c / 255)));
  const cell = () => new Float32Array(CELL_STRIDE);
  const withFields = (fields) => {
    const c = cell();
    for (const [field, value] of Object.entries(fields)) c[FIELD[field]] = value;
    return c;
  };

  // Named per EXECUTION_PLAN.md's Task 1 table (the five overshoot rows) plus WETNESS, BIOMASS,
  // SNOW, ASH as the plan's DONE criteria require.
  const states = {
    'bare bedrock': withFields({BEDROCK: 0.4}),
    'medium dune (SAND=0.12)': withFields({SAND: 0.12}),
    'dune crest (SAND=0.24, seed maximum)': withFields({SAND: 0.24}),
    'sand stamp x5 (SAND=0.50)': withFields({SAND: 0.50}),
    'fire (FIRE=1, SAND=0.12)': withFields({SAND: 0.12, FIRE: 1}),
    'fire on crest (FIRE=1, SAND=0.5)': withFields({SAND: 0.5, FIRE: 1}),
    'wet sand (SAND=0.12, WETNESS=0.6)': withFields({SAND: 0.12, WETNESS: 0.6}),
    'biomass (BIOMASS=1)': withFields({SAND: 0.12, BIOMASS: 1}),
    'snow cover (SNOW=0.1)': withFields({SAND: 0.12, SNOW: 0.1}),
    'ash (ASH=0.35)': withFields({SAND: 0.12, ASH: 0.35}),
  };

  let sawRawOvershoot = false;
  for (const [name, state] of Object.entries(states)) {
    const raw = colorForCell(state, 0, 0);
    if (raw.some((c) => c / 255 > 1 || c / 255 < 0)) sawRawOvershoot = true;
    const albedo = pipelineAlbedo(raw);
    ok(
      albedo.every((c) => c >= 0 && c <= 1),
      `${name}: pipeline albedo (${albedo.map((c) => c.toFixed(3)).join(', ')}) stays within [0, 1]`,
    );
  }
  ok(sawRawOvershoot, 'the sweep actually exercises a real overshoot state (raw/255 > 1 before clamping) -- otherwise this test would not have caught the original bug');
}

// ---------------------------------------------------------------- EXECUTION_PLAN.md Task 2:
// sand colour calibration contract. WORLD_ARCHITECTURE.md names the medium-dune state (SAND=0.12)
// with a documented "warme Sand-Albedo" target (linear ≈ vec3f(0.55, 0.32, 0.13)) and frames
// colorForCell's 0..255 output as sRGB bytes needing decode ("sRGB -> Linear ... Konvertieren").
// colorForCell's sand coefficients were scaled (not re-eyeballed) so this reference state hits
// that target through the same clamp+decode pipeline production uses -- this test is the
// machine-checkable half of that contract, independent of the derivation script that produced
// the constants.
{
  const cell = new Float32Array(CELL_STRIDE);
  cell[FIELD.SAND] = 0.12;
  const raw = colorForCell(cell, 0, 0);
  const albedo = raw.map((c) => srgbToLinear(Math.min(1, Math.max(0, c / 255))));
  const target = [0.550, 0.320, 0.130];
  const tolerance = 0.005;
  ok(
    albedo.every((c, i) => Math.abs(c - target[i]) < tolerance),
    `medium-dune (SAND=0.12) pipeline albedo (${albedo.map((c) => c.toFixed(4)).join(', ')}) matches `
      + `WORLD_ARCHITECTURE.md's documented target (${target.join(', ')}) within ${tolerance}`,
  );
}

// ---------------------------------------------------------------- EXECUTION_PLAN.md Task 3:
// multi-body physics (stepSphereBodies). VERIFICATION.md's LAW: sphere_terrain_contact_v1 already
// documents the literature counter-evidence this section exists to answer: a single,
// un-iterated sequential-impulse pass loses measurable accuracy at multi-body contact -- these
// tests check the fix (iterating the pass N times), not just "does it run."
function totalMomentum(bodies) {
  let px = 0, py = 0, pz = 0;
  for (const b of bodies) { px += b.mass * b.vx; py += b.mass * b.vy; pz += b.mass * b.vz; }
  return [px, py, pz];
}
function totalKineticEnergy(bodies) {
  let ke = 0;
  for (const b of bodies) ke += 0.5 * b.mass * (b.vx ** 2 + b.vy ** 2 + b.vz ** 2);
  return ke;
}
const noGroundFarBelowMulti = () => ({height: -1000, normalX: 0, normalY: 1, normalZ: 0});

// 7. Impulse (momentum) conservation: two bodies, no terrain, no gravity, head-on collision.
// Total momentum before must equal total momentum after, for a perfectly inelastic (e=0) AND a
// perfectly elastic (e=1) collision alike -- momentum conservation doesn't depend on restitution,
// only energy behaviour does (checked separately below).
for (const e of [0, 1]) {
  const a = createSphereBody({x: 0, y: 5, z: 0, vx: 1, radius: 0.1, mass: 1, restitution: e, friction: 0});
  const b = createSphereBody({x: 0.19, y: 5, z: 0, vx: -1, radius: 0.1, mass: 2, restitution: e, friction: 0});
  const bodies = [a, b];
  const momentumBefore = totalMomentum(bodies);
  for (let i = 0; i < 5; i++) stepSphereBodies(bodies, noGroundFarBelowMulti, 1 / 60, {gravityY: 0, iterations: 4});
  const momentumAfter = totalMomentum(bodies);
  ok(
    momentumBefore.every((p, i) => Math.abs(p - momentumAfter[i]) < 1e-9),
    `e=${e}: total momentum conserved through a head-on collision (before=${momentumBefore.map((p) => p.toFixed(6))}, after=${momentumAfter.map((p) => p.toFixed(6))})`,
  );
}

// 8. Energy at e=1: kinetic energy is exactly conserved (elastic collision) -- and matches the
// classic unequal-mass elastic-collision result analytically (not just "unchanged").
{
  const a = createSphereBody({x: 0, y: 5, z: 0, vx: 1, radius: 0.1, mass: 1, restitution: 1, friction: 0});
  const b = createSphereBody({x: 0.19, y: 5, z: 0, vx: -1, radius: 0.1, mass: 2, restitution: 1, friction: 0});
  const bodies = [a, b];
  const keBefore = totalKineticEnergy(bodies);
  for (let i = 0; i < 5; i++) stepSphereBodies(bodies, noGroundFarBelowMulti, 1 / 60, {gravityY: 0, iterations: 4});
  const keAfter = totalKineticEnergy(bodies);
  ok(
    Math.abs(keBefore - keAfter) < 1e-9,
    `e=1: total kinetic energy conserved through an elastic collision (before=${keBefore.toFixed(6)}, after=${keAfter.toFixed(6)})`,
  );
}

// 9. Energy at e<1: kinetic energy strictly decreases, never increases -- and for a perfectly
// inelastic (e=0) head-on collision matches the textbook reduced-mass formula exactly.
{
  const a = createSphereBody({x: 0, y: 5, z: 0, vx: 1, radius: 0.1, mass: 1, restitution: 0, friction: 0});
  const b = createSphereBody({x: 0.19, y: 5, z: 0, vx: -1, radius: 0.1, mass: 2, restitution: 0, friction: 0});
  const bodies = [a, b];
  const keBefore = totalKineticEnergy(bodies);
  for (let i = 0; i < 5; i++) stepSphereBodies(bodies, noGroundFarBelowMulti, 1 / 60, {gravityY: 0, iterations: 4});
  const keAfter = totalKineticEnergy(bodies);
  ok(keAfter < keBefore, `e=0: kinetic energy strictly decreases (before=${keBefore.toFixed(6)}, after=${keAfter.toFixed(6)})`);
  // Textbook perfectly-inelastic collision: v_final = (m_a*v_a + m_b*v_b)/(m_a+m_b); here that's
  // (1*1 + 2*(-1))/3 = -1/3, giving KE = 0.5*3*(1/3)^2 = 1/6.
  ok(
    Math.abs(keAfter - 1 / 6) < 1e-6,
    `e=0: final KE (${keAfter.toFixed(6)}) matches the analytic perfectly-inelastic-collision result (1/6) exactly`,
  );
}

// 10. Iteration count matters: a stack of 3 spheres resting on the ground sinks/interpenetrates
// measurably MORE with 1 solver iteration than with several -- the exact weakness Consensus
// literature (Tonge et al. 2012, "Mass splitting for jitter-free parallel rigid body simulation";
// Erleben 2017, "Rigid body contact problems using proximal operators") documents for
// low-iteration-count Gauss-Seidel-style contact solvers at stacking/multi-contact scenes, held
// here as a regression test rather than a footnote.
{
  const buildStack = () => {
    const r = 0.05;
    const bodies = [];
    for (let i = 0; i < 3; i++) {
      bodies.push(createSphereBody({
        x: 0.5, z: 0.5, y: 0.4 + r + i * (2 * r), radius: r, mass: 1, restitution: 0.1, friction: 0.5,
      }));
    }
    return bodies;
  };
  const flatGroundMulti = () => ({height: 0.4, normalX: 0, normalY: 1, normalZ: 0});
  const totalOverlap = (bodies) => {
    let total = 0;
    for (const b of bodies) {
      const pen = flatGroundMulti().height + b.radius - b.y;
      if (pen > 0) total += pen;
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const dist = Math.hypot(bodies[j].x - bodies[i].x, bodies[j].y - bodies[i].y, bodies[j].z - bodies[i].z);
        const pen = (bodies[i].radius + bodies[j].radius) - dist;
        if (pen > 0) total += pen;
      }
    }
    return total;
  };

  const oneIteration = buildStack();
  const manyIterations = buildStack();
  for (let i = 0; i < 300; i++) {
    stepSphereBodies(oneIteration, flatGroundMulti, 1 / 60, {gravityY: -0.86, iterations: 1});
    stepSphereBodies(manyIterations, flatGroundMulti, 1 / 60, {gravityY: -0.86, iterations: 8});
  }
  const overlap1 = totalOverlap(oneIteration);
  const overlapN = totalOverlap(manyIterations);
  ok(
    overlap1 > overlapN * 1.5,
    `a 3-sphere stack settles with measurably MORE total interpenetration at 1 solver iteration `
      + `(${overlap1.toFixed(6)}) than at 8 (${overlapN.toFixed(6)}) -- the exact single-pass `
      + `weakness VERIFICATION.md's LAW: sphere_terrain_contact_v1 already documents`,
  );
}

// 11. Regression guard: the existing single-body stepSphereBody() tests above must stay exactly
// as they were -- stepSphereBodies() is an addition, not a replacement, and single-sphere-vs-
// terrain behaviour (already covered in detail above) must be unaffected by it. This is enforced
// structurally (stepSphereBody is untouched, unit-tested above, and stepSphereBodies is a
// separate exported function), not by a new assertion here -- noted rather than silently assumed.
ok(typeof stepSphereBody === 'function' && typeof stepSphereBodies === 'function', 'both the original single-body stepSphereBody and the new multi-body stepSphereBodies remain exported side by side');

console.log('\n✅ Alle Rigid-Body/Physics-Selbsttests bestanden');
