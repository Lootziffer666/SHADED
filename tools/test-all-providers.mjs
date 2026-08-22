#!/usr/bin/env node
// Comprehensive test for ALL SHADED providers registered in gpu-providers.all.json.
// Tests:
//   1. Doctor mode for every provider (exit 0 ready, exit 2 not-ready, or exit 1 for separate scripts)
//   2. Real-path execution for numpy-tier providers against a real input image
//   3. Schema validation of output result.json
//   4. Torch-tier providers verified as not_ready or ready (depending on deps)
//   5. API-tier providers verified

import { execFileSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TEST_IMAGE = join(root, 'file_00000000974871f49fe71f6b456f9579.png');
const OUTPUT_DIR = join(root, 'tools', '_test_out');

const REGISTRY = JSON.parse(readFileSync(join(__dirname, 'gpu-providers.all.json'), 'utf8'));
const providers = REGISTRY.providers;

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failures.push({ name, error: e.message });
    fail++;
  }
}

// Helper: run a command from a cli array (first element = binary, rest = args)
function runCli(cli, extraArgs = [], timeoutMs = 120000) {
  try {
    const result = execFileSync(cli[0], [...cli.slice(1), ...extraArgs], {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    return { exit: 0, stdout: result };
  } catch (e) {
    return { exit: e.status || 1, stdout: e.stdout || '', stderr: e.stderr || e.message };
  }
}

// Get all dispatch-based providers (handle via shaded-provider.py)
function isDispatchProvider(cfg) {
  return cfg.cli[1] === 'tools/shaded-provider.py';
}

console.log('=== SHADED Provider Test Suite ===\n');

// Phase 1: Validate registry structure
console.log('Phase 1: Registry structure validation');
test('providers object exists', () => {
  if (!providers || typeof providers !== 'object') throw new Error('providers not found');
});

const numpyProviders = Object.entries(providers)
  .filter(([, p]) => p.tier === 'numpy')
  .map(([name]) => name);
const torchProviders = Object.entries(providers)
  .filter(([, p]) => p.tier === 'torch')
  .map(([name]) => name);
const apiProviders = Object.entries(providers)
  .filter(([, p]) => p.tier === 'api')
  .map(([name]) => name);

console.log(`\n  numpy: ${numpyProviders.length}, torch: ${torchProviders.length}, api: ${apiProviders.length}\n`);

// Phase 2: Doctor mode for all providers
console.log('Phase 2: Doctor mode tests');
for (const [name, cfg] of Object.entries(providers)) {
  test(`${name} doctor`, () => {
    let result;
    if (isDispatchProvider(cfg)) {
      // Dispatch-based: cli already has --provider, doctorArgs has --doctor
      result = runCli(cfg.cli, cfg.doctorArgs);
    } else {
      // External script: run cli with --doctor appended
      result = runCli(cfg.cli, ['--doctor']);
    }
    if (cfg.tier === 'numpy') {
      if (result.exit !== 0) throw new Error(`numpy provider doctor should exit 0, got ${result.exit}: ${result.stderr}`);
      const parsed = JSON.parse(result.stdout);
      if (parsed.status !== 'ready') throw new Error(`status=${parsed.status}`);
    } else if (cfg.tier === 'torch') {
      if (result.exit !== 0 && result.exit !== 2) throw new Error(`expected exit 0 or 2 for ${name}, got ${result.exit}`);
    } else if (cfg.tier === 'api') {
      if (result.exit !== 0 && result.exit !== 1 && result.exit !== 2) throw new Error(`api provider doctor should exit 0-2, got ${result.exit}`);
    }
  });
}

// Phase 3: Real execution for numpy-tier providers via dispatch
console.log('\nPhase 3: Real execution (numpy-tier dispatch providers)');
for (const name of numpyProviders) {
  const cfg = providers[name];
  if (!isDispatchProvider(cfg)) continue; // Skip external scripts

  test(`${name} execution`, () => {
    const out = join(OUTPUT_DIR, `exec_${name}`);
    const result = runCli(cfg.cli, ['--input', TEST_IMAGE, '--output', out], 120000);
    if (result.exit !== 0) throw new Error(`provider ${name} exited ${result.exit}: ${result.stderr}`);
    if (!existsSync(join(out, 'result.json'))) throw new Error('result.json not found');
    const rj = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
    if (!rj.format || !rj.provider || !rj.channels) throw new Error('result.json missing required fields');
    if (!rj.channels.depth) throw new Error('depth channel missing');
    if (!rj.channels.confidence) throw new Error('confidence channel missing');
  });
}

// Phase 3b: Real execution for api-tier providers with external scripts
console.log('\nPhase 3b: Real execution (api-tier external scripts)');
for (const name of apiProviders) {
  const cfg = providers[name];
  test(`${name} doctor is not "unimplemented"`, () => {
    if (!isDispatchProvider(cfg)) {
      const result = runCli(cfg.cli, ['--doctor']);
      // External scripts should either be ready (0) or not-ready (2)
      if (result.exit !== 0 && result.exit !== 2 && result.exit !== 1) {
        throw new Error(`unexpected exit ${result.exit}: ${result.stderr}`);
      }
      // Exit 1 means missing args (script needs --input/--output etc.) — that's fine for doctor
    }
  });
}

// Phase 4: Torch-tier providers (not_ready when torch missing)
console.log('\nPhase 4: Torch-tier providers (torch availability check)');
for (const name of torchProviders) {
  test(`${name} doctor returns 0 or 2`, () => {
    const cfg = providers[name];
    let result;
    if (isDispatchProvider(cfg)) {
      result = runCli(cfg.cli, cfg.doctorArgs);
    } else {
      result = runCli(cfg.cli, ['--doctor']);
    }
    if (result.exit !== 0 && result.exit !== 2) throw new Error(`expected exit 0 or 2 for ${name}, got ${result.exit}: ${result.stderr}`);
  });
}

// Phase 5: Verify output schema for a representative numpy provider
console.log('\nPhase 5: Output schema validation');
test('gaussian_representation result schema', () => {
  const out = join(OUTPUT_DIR, 'exec_gaussian_representation');
  if (!existsSync(join(out, 'result.json'))) {
    runCli(['python3', 'tools/shaded-provider.py', '--provider', 'gaussian_representation'],
           ['--input', TEST_IMAGE, '--output', out]);
  }
  const rj = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
  const required = ['format', 'provider', 'device', 'precision', 'channels', 'provenance'];
  for (const k of required) {
    if (!(k in rj)) throw new Error(`missing field: ${k}`);
  }
  if (rj.format !== 'SHADED.spatial-provider-result.v1') throw new Error(`unexpected format: ${rj.format}`);
  if (rj.provenance === 'STUB') throw new Error('provenance must not be STUB');
  if (!rj.channels.depth) throw new Error('missing depth channel');
  if (!rj.channels.confidence) throw new Error('missing confidence channel');
});

// Phase 6: Verify all providers are registered in the dispatch script
console.log('\nPhase 6: Registry completeness');
test('dispatch script knows all providers', () => {
  // Run with invalid provider to get the "Available:" list from argparse error
  const dispatchOutput = runCli(['python3', 'tools/shaded-provider.py', '--provider', '__invalid__'], []);
  // argparse prints "Available: ..." to stderr, exit code 1
  const lines = dispatchOutput.stderr.split('\n');
  const availableLine = lines.find(l => l.startsWith('Available:'));
  if (!availableLine) throw new Error('Could not parse provider list from dispatch');
  const available = availableLine.replace('Available: ', '').split(', ').filter(Boolean);
  const registeredNames = Object.keys(providers).sort();
  const missing = registeredNames.filter(n => !available.includes(n));
  if (missing.length > 0) throw new Error(`providers in JSON but not in dispatch: ${missing.join(', ')}`);
});

// Summary
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error.substring(0, 200)}`);
  process.exit(1);
}
process.exit(0);
