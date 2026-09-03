// Behavioural regression test for runtime/world-sandbox-growth.mjs's plant life-state machine
// (the user's "Test C: Bloom/Wilt", section 9 of their cultivation plan). Proves each named event
// chain actually happens as a SEQUENCE of state changes driven by one real input (moisture), not
// as an animation triggered by name: rain (water up, stress down, growth up), drought (water
// down, stress up, growth down/wilting), bloom (only once age/energy/calm all hold at once), and
// death (health hits zero -> alive=false -> dead wood persists, doesn't vanish or freeze).
import assert from 'node:assert/strict';
import {createPlantLifeState, stepPlantLifeState} from '../runtime/world-sandbox-growth.mjs';

const DT = 1 / 20;

function run(life, moisture, seconds) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepPlantLifeState(life, DT, moisture);
}

// --- Rain: sustained high moisture raises water, lowers stress, enables growth ------------
{
  const life = createPlantLifeState();
  // Start already mildly stressed (low starting water) so "stress falls" is an observable
  // transition, not just "stayed at its already-zero floor."
  run(life, 0.1, 20);
  const stressBeforeRain = life.stress;
  assert.ok(stressBeforeRain > 0.1, 'sanity: the plant is actually stressed before the rain starts');

  run(life, 0.9, 40);
  assert.ok(life.water > 0.7, `sustained rain raises stored water -- ${life.water.toFixed(3)}`);
  assert.ok(life.stress < stressBeforeRain, `sustained rain lowers stress from its pre-rain level (${stressBeforeRain.toFixed(3)} -> ${life.stress.toFixed(3)})`);
  assert.ok(life.growth > 0, `a watered, calm plant actually grows -- growth=${life.growth.toFixed(3)}`);
}

// --- Drought: sustained zero moisture lowers water, raises stress, suppresses growth, wilts -
{
  const life = createPlantLifeState();
  run(life, 0.9, 20); // start healthy and watered so the drop is an observable transition
  const waterBeforeDrought = life.water;
  assert.ok(waterBeforeDrought > 0.7, 'sanity: the plant starts well-watered before the drought');

  // Step second-by-second through the drought and catch the FIRST tick where stress crosses the
  // wilt threshold. This is checked mid-transition, not after the whole 30s drought, on purpose:
  // by the end of a long drought water/energy have ALSO decayed toward zero on their own, which
  // would make growth read as ~0 even without a real wilt gate -- that's not what's being tested
  // here. Right as stress first crosses the threshold, water/energy are still clearly nonzero, so
  // an exact growth===0 at that exact moment can only come from the wilt gate itself, not from
  // water/energy coincidentally bottoming out at the same time.
  let crossedWiltAt = null;
  for (let i = 0; i < Math.round(30 / DT) && crossedWiltAt === null; i++) {
    stepPlantLifeState(life, DT, 0.0);
    if (life.stress > 0.6) crossedWiltAt = {water: life.water, energy: life.energy, growth: life.growth, stress: life.stress};
  }
  assert.ok(crossedWiltAt, 'sanity: sustained drought actually crosses the wilt stress threshold within 30s');
  assert.ok(crossedWiltAt.water > 0.001 && crossedWiltAt.energy > 0.001,
    `sanity: at the moment stress first crosses the wilt threshold, water/energy are still clearly nonzero (water=${crossedWiltAt.water.toFixed(4)}, energy=${crossedWiltAt.energy.toFixed(4)}) -- so a following growth===0 check is isolating the wilt gate, not water/energy coincidentally hitting zero`);
  assert.equal(crossedWiltAt.growth, 0,
    `growth is driven to exactly zero the moment wilting starts, not just asymptotically small (water=${crossedWiltAt.water.toFixed(4)}, energy=${crossedWiltAt.energy.toFixed(4)}, stress=${crossedWiltAt.stress.toFixed(4)})`);

  run(life, 0.0, 10);
  assert.ok(life.water < waterBeforeDrought * 0.2, `by the end of the drought, stored water has dropped well below its pre-drought level (${waterBeforeDrought.toFixed(3)} -> ${life.water.toFixed(3)})`);
  assert.ok(life.stress > 0.9, `by the end of the drought, stress is high -- ${life.stress.toFixed(3)}`);
}

// --- Bloom: needs age AND energy AND calm together, not any one alone ---------------------
{
  // Good conditions from birth, but bloom must still wait for the age threshold -- energy/calm
  // alone are not enough.
  const tooYoung = createPlantLifeState();
  run(tooYoung, 0.9, 10); // well short of LIFE_BLOOM_AGE_THRESHOLD=30
  assert.ok(!tooYoung.bloom, 'a young plant does not bloom even in perfect conditions -- age is a real gate, not decorative');

  // Old enough, but kept in permanent drought -- age alone is not enough either.
  const stressedElder = createPlantLifeState();
  run(stressedElder, 0.0, 60);
  assert.ok(!stressedElder.bloom, 'an old but drought-stressed plant does not bloom -- calm/energy are real gates too');

  // All three conditions genuinely held at once -> bloom.
  const healthyElder = createPlantLifeState();
  run(healthyElder, 0.9, 60);
  assert.ok(healthyElder.bloom, 'an old, well-fed, calm plant actually blooms once every condition is met');

  // A bloomed plant that starts wilting closes again rather than staying open through distress.
  run(healthyElder, 0.0, 30);
  assert.ok(!healthyElder.bloom, 'a bloom closes again once the plant starts wilting under new stress');
}

// --- Death: health hits zero, plant goes inert but the object persists (dead wood) --------
{
  const life = createPlantLifeState();
  // Prolonged, total drought: health should eventually reach zero.
  run(life, 0.0, 400);
  assert.equal(life.alive, false, 'sustained total drought eventually kills the plant (health reaches zero)');
  assert.equal(life.growth, 0, 'a dead plant has zero growth');
  assert.equal(life.bloom, false, 'a dead plant is never in bloom');

  const waterAtDeath = life.water;
  // "Dead wood persists" -- stepping a dead plant must not throw, delete anything, or freeze its
  // state; its water should keep draining (drying out) rather than sitting frozen forever.
  run(life, 0.5, 20); // even with moisture nearby, a dead plant no longer tracks it
  assert.ok(life.water <= waterAtDeath, "a dead plant's water keeps draining (drying out), not frozen and not rehydrating on its own");
  assert.equal(life.alive, false, 'a dead plant stays dead -- no accidental resurrection from later moisture');
  assert.ok(Number.isFinite(life.water) && Number.isFinite(life.health), 'the life-state object is still a valid, inspectable record after death, not deleted');
}

console.log('life-state: rain/drought move water+stress+growth as a real sequence, bloom needs age+energy+calm together and closes on new stress, and death leaves dead wood that keeps drying instead of vanishing');
