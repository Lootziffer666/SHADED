// Test für den Reconstruction Provider Benchmark.
// Run: node tools/test-benchmark-provider.mjs

import assert from 'node:assert/strict';
import {
  STAGE, STAGE_ORDER, BenchmarkProvider,
  StubDepthProvider, StubGeometryProvider, StubCleanupProvider, StubCompletionProvider,
  WrappedProvider, measureInfoLoss, BenchmarkCase, BenchmarkRun,
  Tournament, ReconstructionBenchmark, createStandardBenchmark,
} from '../tools/benchmark-providers.mjs';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

// ------------------------------------------------------------------
// 1) Stage-Enum und Reihenfolge
// ------------------------------------------------------------------
ok('4 Stages definiert', STAGE_ORDER.length === 4);
ok('DEPTH in STAGE', STAGE.DEPTH === 'depth');
ok('GEOMETRY in STAGE', STAGE.GEOMETRY === 'geometry');
ok('CLEANUP in STAGE', STAGE.CLEANUP === 'cleanup');
ok('COMPLETION in STAGE', STAGE.COMPLETION === 'completion');
ok('Reihenfolge Depth→Geometry→Cleanup→Completion', 
   STAGE_ORDER[0] === STAGE.DEPTH && STAGE_ORDER[3] === STAGE.COMPLETION);

// ------------------------------------------------------------------
// 2) BenchmarkProvider-Basis
// ------------------------------------------------------------------
const bp = new BenchmarkProvider('test', STAGE.DEPTH, { algo: 'v1' });
ok('Provider hat name', bp.name === 'test');
ok('Provider hat stage', bp.stage === STAGE.DEPTH);
ok('Provider hat params', JSON.stringify(bp.params) === JSON.stringify({ algo: 'v1' }));
ok('signature ist deterministisch', bp.signature() === 'test:{"algo":"v1"}');

// ------------------------------------------------------------------
// 3) StubDepthProvider
// ------------------------------------------------------------------
const depthProv = new StubDepthProvider('depth-test', { quality: 0.9 });
const depthInput = { calibration: { width: 40, height: 30 } };
const depthResult = await depthProv.provide(depthInput, {});
ok('DepthProvider ok', depthResult.ok === true);
ok('Depth-Puffer korrekt', depthResult.output.depth.length === 40 * 30);
ok('Depth-Werte 0.5', depthResult.output.depth[0] === 0.5);
ok('Confidence-Puffer vorhanden', depthResult.output.confidence.length === 40 * 30);
ok('Runtime gemessen', depthResult.metrics.runtime_ms >= 0);
ok('Memory gemessen', depthResult.metrics.memory_mb > 0);
ok('Quality 0.9', depthResult.metrics.quality === 0.9);

// ------------------------------------------------------------------
// 4) StubGeometryProvider
// ------------------------------------------------------------------
const geoProv = new StubGeometryProvider('geo-test', { quality: 0.8, stride: 4 });
const geoInput = { output: depthResult.output };
const geoResult = await geoProv.provide(geoInput, {});
ok('GeometryProvider ok', geoResult.ok === true);
ok('Punkte erzeugt', geoResult.output.points.length > 0);
ok('Punkt-Format {x,y,z}', geoResult.output.points[0].x !== undefined);

// ------------------------------------------------------------------
// 5) StubCleanupProvider
// ------------------------------------------------------------------
const cleanupProv = new StubCleanupProvider('cleanup-test', { quality: 0.85, stride: 2 });
const cleanupInput = { output: geoResult.output };
const cleanupResult = await cleanupProv.provide(cleanupInput, {});
ok('CleanupProvider ok', cleanupResult.ok === true);
ok('Punkte reduziert (stride=2)', cleanupResult.output.points.length < geoResult.output.points.length);

// ------------------------------------------------------------------
// 6) StubCompletionProvider
// ------------------------------------------------------------------
const completionProv = new StubCompletionProvider('completion-test', { quality: 0.7, grid: 5 });
const completionInput = { output: cleanupResult.output };
const completionResult = await completionProv.provide(completionInput, {});
ok('CompletionProvider ok', completionResult.ok === true);
ok('Punkte hinzugefügt (floor)', completionResult.output.points.length > cleanupResult.output.points.length);

// ------------------------------------------------------------------
// 7) Information-Loss-Messung
// ------------------------------------------------------------------
const lossFull = measureInfoLoss(
  { points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1}] },
  { points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1}] }
);
ok('Volle Coverage bei identischen Punkten', lossFull.coverage === 1);
ok('Density = 1 bei identischer Menge', lossFull.density === 1);

const lossHalf = measureInfoLoss(
  { points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1}] },
  { points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}] }
);
ok('Density < 1 bei Reduktion', lossHalf.density < 1);

// ------------------------------------------------------------------
// 8) BenchmarkCase
// ------------------------------------------------------------------
const testCase = new BenchmarkCase({
  id: 'test-case-001',
  name: 'Test Scene',
  input: { calibration: { width: 40, height: 30 } },
  expected: { depthQuality: 0.8 },
  thresholds: { quality_min: 0.5, runtime_max_ms: 1000 },
});
ok('Case hat id', testCase.id === 'test-case-001');
ok('Case hat thresholds', testCase.thresholds.quality_min === 0.5);

// ------------------------------------------------------------------
// 9) BenchmarkRun
// ------------------------------------------------------------------
const run = new BenchmarkRun(depthProv, 'test-case-001', depthResult);
ok('Run hat provider name', run.provider === 'depth-test');
ok('Run hat stage', run.stage === STAGE.DEPTH);
ok('Run hat ok=true', run.ok === true);
ok('Run hat metrics', run.metrics.runtime_ms >= 0);
ok('Run hat outputRef (Hash)', typeof run.outputRef === 'string');
ok('Run hat timestamp', run.timestamp > 0);
ok('Run hat params', JSON.stringify(run.params) === JSON.stringify({ quality: 0.9 }));

// ------------------------------------------------------------------
// 10) ReconstructionBenchmark: register + addCase + runProvider
// ------------------------------------------------------------------
const bench = new ReconstructionBenchmark({ artifactDir: '/tmp/test-bench' });
bench.register(new StubDepthProvider('d1', { quality: 0.9 }));
bench.register(new StubGeometryProvider('g1', { quality: 0.8, stride: 4 }));
bench.register(new StubCleanupProvider('c1', { quality: 0.85, stride: 2 }));
bench.register(new StubCompletionProvider('p1', { quality: 0.7, grid: 5 }));
bench.addCase(testCase);

ok('Benchmark hat Provider', bench.providers.length === 4);
ok('Benchmark hat Depth-Provider in Stage', bench.providersByStage[STAGE.DEPTH].length === 1);
ok('Benchmark hat Geometry-Provider in Stage', bench.providersByStage[STAGE.GEOMETRY].length === 1);
ok('Benchmark hat Cleanup-Provider in Stage', bench.providersByStage[STAGE.CLEANUP].length === 1);
ok('Benchmark hat Completion-Provider in Stage', bench.providersByStage[STAGE.COMPLETION].length === 1);
ok('Benchmark hat Cases', bench.cases.length === 1);

const benchRun = await bench.runProvider(bench.providers[0], STAGE.DEPTH, testCase);
ok('runProvider returned BenchmarkRun', benchRun instanceof BenchmarkRun);
ok('BenchmarkRun ok', benchRun.ok === true);
ok('Run wurde im Benchmark gespeichertt', bench.runs.length === 1);

// ------------------------------------------------------------------
// 11) Report
// ------------------------------------------------------------------
bench.addCase(new BenchmarkCase({ id: 'case-2', name: 'Scene 2', input: { calibration: { width: 20, height: 20 } } }));
await bench.runProvider(bench.providers[0], STAGE.DEPTH, bench.cases[1]);

const rep = bench.report();
ok('Report hat totalRuns', rep.totalRuns === 2);
ok('Report hat byStage', rep.byStage[STAGE.DEPTH].total === 2);
ok('Report avgRuntime >= 0', rep.byStage[STAGE.DEPTH].avgRuntimeMs >= 0);

// ------------------------------------------------------------------
// 12) Tournament: elimination
// ------------------------------------------------------------------
const bench2 = createStandardBenchmark({ artifactDir: '/tmp/test-tournament' });
bench2.addCase(testCase);
ok('Standard benchmark hat 8 Provider', bench2.providers.length === 8);

// Run tournament
const tResult = await bench2.runTournament();
ok('Tournament hat Runden', tResult.tournament.rounds && tResult.tournament.rounds.length >= 1);
ok('Tournament hat Winners', tResult.tournament.winners);
ok('Winners für jede Stage', Object.keys(tResult.tournament.winners).length === 4);
ok('Stack-Ergebnisse vorhanden', tResult.stack && tResult.stack.length === 1);

// Vergleiche: depth-accurate sollte besser abschneiden als depth-fast
const depthRanking = tResult.tournament.rounds.find(r => r.stage === STAGE.DEPTH);
ok('Depth-Ranking vorhanden', depthRanking);
const depthRanks = depthRanking.round.ranking;
ok('Ranking hat Provider', depthRanks.length >= 2);
ok('Beste Provider hat höchste Score', depthRanks[0].score >= depthRanks[depthRanks.length - 1].score);

// ------------------------------------------------------------------
// 13) Stack: Depth → Geometry → Cleanup → Completion (vollständige Pipeline)
// ------------------------------------------------------------------
const stackBench = new ReconstructionBenchmark({ artifactDir: '/tmp/test-stack' });
stackBench.register(new StubDepthProvider('depth-stack', { quality: 0.85 }));
stackBench.register(new StubGeometryProvider('geo-stack', { quality: 0.8, stride: 4 }));
stackBench.register(new StubCleanupProvider('cleanup-stack', { quality: 0.85, stride: 2 }));
stackBench.register(new StubCompletionProvider('completion-stack', { quality: 0.7, grid: 8 }));
stackBench.addCase(testCase);

const stackResult = await stackBench.runTournament();
ok('Stack-Tournament hat Stack-Ergebnis', stackResult.stack.length === 1);
const stackCase = stackResult.stack[0];
ok('Stack hat alle 4 Stages', Object.keys(stackCase.stageOutputs).length === 4);

// ------------------------------------------------------------------
// 14) WrappedProvider (für echte Provider wie DA2/DA3)
// ------------------------------------------------------------------
const wrapped = new WrappedProvider('da2-wrapped', STAGE.DEPTH, { variant: 'v2' },
  async (input, ctx, params) => {
    return {
      ok: true,
      output: { depth: new Float32Array([0.5, 0.6]), confidence: new Float32Array([0.9, 0.8]), w: 1, h: 2 },
      metrics: { quality: 0.92, runtime_ms: 42, memory_mb: 1.5 },
    };
  }
);
const wrappedResult = await wrapped.provide({ calibration: {} }, {});
ok('WrappedProvider ok', wrappedResult.ok === true);
ok('WrappedProvider name', wrappedResult.output.depth.length === 2);
ok('WrappedProvider metrics übernommen', wrappedResult.metrics.quality === 0.92);

// ------------------------------------------------------------------
// 15) Validation: keine stummen Fallbacks
// ------------------------------------------------------------------
const bench3 = new ReconstructionBenchmark();
bench3.addCase(testCase);
const failingProvider = new BenchmarkProvider('fails', STAGE.DEPTH, {});
failingProvider.provide = async () => ({ ok: false, error: 'model not loaded', metrics: { runtime_ms: 1 } });
bench3.register(failingProvider);

const failRun = await bench3.runProvider(failingProvider, STAGE.DEPTH, testCase);
ok('Fehlgeschlagener Provider ok=false', failRun.ok === false);
ok('Fehler-Message gespeichert', failRun.error === 'model not loaded');

console.log(`Benchmark Provider tests passed (${passed} assertions)`);
