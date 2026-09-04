import assert from 'node:assert/strict';
import {STAMP} from '../runtime/world-sandbox-reference.mjs';
import {
  WorldSandboxRuntime,
  applyDeadzone,
  walkInputFromGamepad,
} from '../runtime/world-sandbox-runtime.mjs';

// If this module accidentally regains an authored-DOM dependency, this Node process fails.
const runtime = new WorldSandboxRuntime({cpuSize: 32});
assert.equal(runtime.backendKind, 'cpu');
assert.equal(runtime.snapshot().active, false);

runtime.enter();
runtime.setPaused(true);
runtime.setTool('carve');
runtime.beginToolStroke(0.30, 0.40);
runtime.continueToolStroke(0.42, 0.40);
const pending = runtime.snapshot().stamps;
assert.equal(pending.length, 2, 'two carve samples queue two stamps');
assert.equal(pending[1].kind, STAMP.CARVE);
assert.ok(pending[1].directionX > 0.99, 'carve direction is derived from stroke movement');
assert.ok(Math.abs(pending[1].directionZ) < 1e-6);
runtime.endToolStroke();

runtime.setPaused(false);
for (let i = 0; i < 4; i++) runtime.stepOnce();
assert.ok(runtime.snapshot().elapsed > 0, 'fixed-step runtime advances without UI');
assert.ok(Number.isFinite(runtime.snapshot().query.ground), 'runtime query contract receives solver samples');

assert.equal(applyDeadzone(0.1, 0.15), 0);
const half = walkInputFromGamepad({connected: true, axes: [0, -0.5, 0.4, 0], buttons: []});
assert.ok(half.forward > 0 && half.forward < 1, 'analog magnitude survives deadzone mapping');
assert.ok(half.lookX > 0, 'right-stick look is exported as pure input data');

runtime.enterWalk();
const start = runtime.snapshot().walk;
runtime.updateWalk(0.4, {forward: half.forward, lookX: half.lookX});
const afterHalf = runtime.snapshot().walk;
const halfDistance = Math.hypot(afterHalf.x - start.x, afterHalf.z - start.z);
assert.ok(halfDistance > 0, 'analog walk moves the player');
assert.ok(afterHalf.yaw > start.yaw, 'look input turns the player');

runtime.exitWalk();
runtime.enterWalk();
const fullStart = runtime.snapshot().walk;
runtime.updateWalk(0.4, {forward: 1});
const fullAfter = runtime.snapshot().walk;
const fullDistance = Math.hypot(fullAfter.x - fullStart.x, fullAfter.z - fullStart.z);
assert.ok(fullDistance > halfDistance * 1.4, 'full input moves materially faster than half-stick input');

const noonTemp = runtime.snapshot().environment.temperature;
runtime.updateWalk(45, {});
const laterTemp = runtime.snapshot().environment.temperature;
assert.notEqual(laterTemp, noonTemp, 'walk clock drives real environment temperature');

runtime.exitWalk();
runtime.reset(0x5a17c0de);
runtime.startCauseChain();
for (let i = 0; i < 130; i++) runtime.stepOnce();
assert.ok(runtime.snapshot().elapsed > 4.2, 'deterministic cause-chain runs headlessly through heat event');
assert.equal(runtime.snapshot().scenarioActive, false, 'cause-chain completes without UI callbacks');

runtime.setTool('stone');
runtime.useTool(0.5, 0.5);
assert.equal(runtime.snapshot().body.active, true, 'stone is a runtime body, not a button side effect');

// Root-growth agent (world-sandbox-growth.mjs), ported from the legacy editor/world-sandbox.js
// into the DOM-free CPU backend: spawnPlant() creates a single-node plant, and real simulation
// time genuinely grows it through the same CpuWorldSandboxBackend.step() path stamps/particles
// already use -- not a standalone call to the growth module (already proven in isolation by
// tools/test-world-sandbox-growth.mjs).
runtime.reset(0x504c414e);
runtime.setPaused(true);
runtime.spawnPlant(0.5, 0.5);
const afterSpawn = runtime.plants;
assert.equal(afterSpawn.length, 1, 'spawnPlant() creates exactly one plant');
assert.equal(afterSpawn[0].nodeCount, 1, 'a freshly spawned plant starts as a single seed node');
assert.equal(afterSpawn[0].livingTips, 1, 'a freshly spawned plant has exactly one living tip');

runtime.setPaused(false);
for (let i = 0; i < 150; i++) runtime.stepOnce();
const afterSteps = runtime.plants;
assert.equal(afterSteps.length, 1, 'the plant still exists after real simulation time passes');
assert.ok(afterSteps[0].nodeCount > afterSpawn[0].nodeCount,
  `the graph actually grew new nodes over simulation time (${afterSpawn[0].nodeCount} -> ${afterSteps[0].nodeCount}) -- proves stepGrowthTips is genuinely wired into CpuWorldSandboxBackend.step(), not just callable in isolation`);

// The 'root' tool routes through useTool() exactly like 'stone' does, not only the direct
// spawnPlant() debug entry point.
runtime.reset(0x504c414f);
runtime.setTool('root');
runtime.useTool(0.4, 0.4);
assert.equal(runtime.plants.length, 1, 'setTool("root") + useTool() spawns a plant through the normal tool path');

console.log('test-world-sandbox-runtime: DOM-free tools/carve/walk/day-night/cause-chain/body/root-growth contracts PASS');
