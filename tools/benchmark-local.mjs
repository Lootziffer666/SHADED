// benchmark-local.mjs — MAXIMUM DENNIS: the maximal locally-reproducible bench-
// mark for SHADED post-GOLD (see docs/research/POST_GOLD_BENCHMARK_BASELINE.md §2).
//
// Runs the canonical 4-stage tournament (DEPTH→GEOMETRY→CLEANUP→COMPLETION) plus an
// end-to-end stack over the 5 registered benchmark scenes, using ONLY the stub providers
// from createStandardBenchmark(). No torch, no GPU, no Modal — fully deterministic.
//
// The class-count REGRESSION gate lives in tools/verify-classes.mjs (browser/swiftshader:
// dorf-marker exact, others within ±10%/min-40 per tools/expected-classes.json). This
// driver proves the *pipeline* is wired and deterministic; it does not render the shader.
//
// Exit codes: 0 = DENNIS pass, 1 = pipeline/threshold fail, 2 = execution error.
//   Run: node tools/benchmark-local.mjs [--out <dir>] [--repeat <n>]
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import {
  STAGE, STAGE_ORDER,
  BenchmarkCase, ReconstructionBenchmark, createStandardBenchmark,
} from './benchmark-providers.mjs';

const EXPECTED_CLASSES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'expected-classes.json');

function parseArgs(argv) {
  const out = { out: null, repeat: 2 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out.out = argv[++i];
    else if (argv[i] === '--repeat') out.repeat = Number(argv[++i]) || 1;
  }
  return out;
}

function fail(code, payload) {
  console.error(JSON.stringify({ status: 'error', ...payload }, null, 2));
  process.exit(code);
}

function sceneCases() {
  const expected = JSON.parse(fs.readFileSync(EXPECTED_CLASSES, 'utf8'));
  const cases = [];
  const W = 80, H = 60;
  for (const sceneId of Object.keys(expected)) {
    cases.push(new BenchmarkCase({
      id: sceneId,
      name: `scene:${sceneId}`,
      input: { calibration: { width: W, height: H, scene: sceneId } },
      thresholds: { quality_min: 0.5, runtime_max_ms: 10000, memory_max_mb: 512, info_loss_max: 0.3 },
    }));
  }
  return cases;
}

function sha256Json(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outRoot = args.out || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', `local-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(path.join(outRoot, 'by-sha256'), { recursive: true });

  const cases = sceneCases();
  if (cases.length !== 5) fail(2, { message: `expected 5 scenes, got ${cases.length}` });

  fs.mkdirSync(path.join(outRoot, 'by-sha256'), { recursive: true });
  let lastStack = null;
  const runTournament = async (b) => {
    for (const c of cases) b.addCase(c);
    return await b.runTournament();
  };

  // Primary run: populates bench.runs so report() is real.
  const bench = createStandardBenchmark({ artifactDir: outRoot });
  const primary = await runTournament(bench);
  const report = bench.report();
  lastStack = primary.stack;

  // Determinism: ranking ORDER (provider names per stage) across N identical runs.
  const orderings = [STAGE_ORDER.map(s => (primary.tournament.winners[s] || []).map(p => p.name))];
  for (let r = 1; r < args.repeat; r++) {
    const b = createStandardBenchmark({ artifactDir: outRoot });
    const res = await runTournament(b);
    orderings.push(STAGE_ORDER.map(s => (res.tournament.winners[s] || []).map(p => p.name)));
  }

  // Assertions (pipeline wiring + determinism).
  const checks = [];
  const ok = (name, cond, extra = null) => { checks.push({ name, passed: !!cond, ...(extra || {}) }); return !!cond; };

  ok('5 scene cases registered', cases.length === 5, { n: cases.length });
  ok('8 stub providers registered', bench.providers.length === 8, { n: bench.providers.length });
  ok('4 stages executed', report.totalRuns > 0 && STAGE_ORDER.every(s => report.byStage[s] && report.byStage[s].total > 0), { total: report.totalRuns });
  ok('primary stack produced all 5 cases', lastStack && lastStack.length === 5, { cases: lastStack && lastStack.length });
  ok('each stack case has all 4 stage outputs ok:true',
    lastStack && lastStack.every(c => STAGE_ORDER.every(s => c.stageOutputs[s] && c.stageOutputs[s].ok)),
    { note: 'stack chains Depth->Geometry->Cleanup->Completion; depth-consuming providers (geometry) succeed via the stack even when they fail standalone' }),
  ok('no provider eliminated as all_runs_failed',
    !bench.runs.some(r => !r.ok && r.error === 'all_runs_failed'), { failed: bench.runs.filter(r => !r.ok).length });
  ok('tournament ranking deterministic (order stable across ' + args.repeat + ' runs)',
    orderings.every(o => JSON.stringify(o) === JSON.stringify(orderings[0])),
    { first: orderings[0] });
  ok('class regression gate defined for dorf-marker',
    cases.find(c => c.id === 'dorf-marker') ? true : false, {});

  const allPassed = checks.every(c => c.passed);

  const winnerByStage = {};
  for (const s of STAGE_ORDER) winnerByStage[s] = (primary.tournament.winners[s] || []).map(p => ({ name: p.name }));
  // NOTE: winners[s] can be [] for even-count 2-provider stages due to eliminateBottom
  // rounding (existing Tournament code in benchmark-providers.mjs — not modified).
  // runStack correctly ignores winners[] and uses providersByStage[stage][0]; the stack
  // checks above prove all 4 stages execute end-to-end for all 5 cases regardless.

  const result = {
    status: allPassed ? 'pass' : 'fail',
    exitCode: allPassed ? 0 : 1,
    runId: `dennis-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    benchmark: 'MAXIMUM DENNIS (local/stub floor)',
    baselineCommit: '1cb06c432d90c49628786a1c80bcdb9ad8145722',
    stages: STAGE_ORDER,
    cases: cases.map(c => c.id),
    providers: bench.providers.map(p => ({ name: p.name, stage: p.stage })),
    stageWinners: winnerByStage,
    report,
    checks,
    reproducibility: {
      env: 'linux-container, node22, headless chromium+swiftshader (stub providers only, no torch/GPU)',
      classRegressionGate: 'tools/verify-classes.mjs (dorf-marker exact; see CURRENT_STATE_AUDIT.md §3.3)',
    },
  };

  const resultPath = path.join(outRoot, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  const sha = sha256Json(result);
  fs.writeFileSync(path.join(outRoot, 'result.sha256'), sha + '\n');
  const hashDir = path.join(outRoot, 'by-sha256', sha.substring(0, 2));
  fs.mkdirSync(hashDir, { recursive: true });
  fs.copyFileSync(resultPath, path.join(hashDir, sha.substring(2)));

  console.log(JSON.stringify(result, null, 2));
  process.stdout.write(`\n# MAXIMUM DENNIS: ${allPassed ? 'PASS' : 'FAIL'} — ${checks.filter(c=>c.passed).length}/${checks.length} checks — result: ${resultPath} (sha256 ${sha.slice(0, 12)})\n`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => fail(2, { message: e.message, stack: e.stack }));
