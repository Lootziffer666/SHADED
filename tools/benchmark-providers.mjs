// SHADED Reconstruction Provider Benchmark — tournament-style evaluation.
//
// Vergleicht nicht nur isolierte Modelle, sondern vollständige Übergänge
// zwischen Depth/Point-Map → Geometry → Cleanup → Completion.
// Sparrt Parameter, Laufzeit, Speicherverbrauch und Zwischenresultate.
// Eliminiert turnierartig bis zu den besten Kandidaten pro Stufe.
//
// Nicht anfassen: Beuteltier-Hangleometrie, COLMAP-Fusion.

import {
  GeometryObservation,
  SOURCE_TYPE,
  OBS_PROVENANCE,
} from '../runtime/spatial-kernel/observation.js';
import { fitGeometricPrimitivesExtended } from '../runtime/spatial-kernel/reconstruction.js';
import {
  indexMesh,
  weldVertices,
  removeDegenerate,
  quantizePositions,
  simplifyGreedy,
  optimizeMesh,
} from '../runtime/spatial-kernel/mesh-pipeline.js';

// ---- Stage-Enum ----
export const STAGE = Object.freeze({
  DEPTH: 'depth',
  GEOMETRY: 'geometry',
  CLEANUP: 'cleanup',
  COMPLETION: 'completion',
});

export const STAGE_ORDER = [STAGE.DEPTH, STAGE.GEOMETRY, STAGE.CLEANUP, STAGE.COMPLETION];

// ---- BenchmarkProvider-Interface ----
// Jeder Provider implementiert:
//   async provide(input, ctx) -> { ok, output, metrics, error }
//   name, stage, params
export class BenchmarkProvider {
  constructor(name, stage, params = {}) {
    this.name = name;
    this.stage = stage;
    this.params = params;
  }

  // Override in subclass.
  async provide(_input, _ctx) {
    throw new Error(`Provider ${this.name} does not implement provide()`);
  }

  // Optional: cleanup resources between runs.
  dispose() {}

  // Identity string for caching.
  signature() {
    return `${this.name}:${JSON.stringify(this.params)}`;
  }
}

// ---- Stub-Provider für Tests (keine ML-Abhängigkeit) ----
export class StubDepthProvider extends BenchmarkProvider {
  constructor(name = 'stub-depth', params = {}) {
    super(name, STAGE.DEPTH, params);
  }
  async provide(input, _ctx) {
    const t0 = Date.now();
    const w = input.calibration?.width || 80;
    const h = input.calibration?.height || 60;
    const depth = new Float32Array(w * h).fill(0.5);
    const confidence = new Float32Array(w * h).fill(0.9);
    return {
      ok: true,
      output: { depth, confidence, w, h },
      metrics: {
        runtime_ms: Date.now() - t0,
        memory_mb: (depth.byteSize || depth.length * 4) / 1024 / 1024,
        quality: this.params.quality || 0.85,
      },
    };
  }
}

export class StubGeometryProvider extends BenchmarkProvider {
  constructor(name = 'stub-geometry', params = {}) {
    super(name, STAGE.GEOMETRY, params);
  }
  async provide(input, _ctx) {
    const t0 = Date.now();
    const depthData = input.output;
    // Erzeuge Punkte aus Tiefe (einfacher Abstands-Map → Punkte)
    const pts = [];
    const w = depthData.w, h = depthData.h;
    for (let y = 0; y < h; y += this.params.stride || 4) {
      for (let x = 0; x < w; x += this.params.stride || 4) {
        const d = depthData.depth[y * w + x];
        pts.push({ x: (x / w - 0.5) * d, y: d, z: (y / h - 0.5) * d });
      }
    }
    return {
      ok: true,
      output: { points: pts },
      metrics: {
        runtime_ms: Date.now() - t0,
        memory_mb: (pts.length * 12) / 1024 / 1024,
        quality: this.params.quality || 0.78,
      },
    };
  }
}

export class StubCleanupProvider extends BenchmarkProvider {
  constructor(name = 'stub-cleanup', params = {}) {
    super(name, STAGE.CLEANUP, params);
  }
  async provide(input, _ctx) {
    const t0 = Date.now();
    const points = input.output?.points || input.points || [];
    const stride = this.params.stride || 4;
    // Subsamplen (Cleanup = entferne Rauschen)
    const cleaned = [];
    for (let i = 0; i < points.length; i += stride) {
      cleaned.push(points[i]);
    }
    return {
      ok: true,
      output: { points: cleaned },
      metrics: {
        runtime_ms: Date.now() - t0,
        memory_mb: (cleaned.length * 12) / 1024 / 1024,
        quality: Math.min(1, (this.params.quality || 0.8) + 0.1),
      },
    };
  }
}

export class StubCompletionProvider extends BenchmarkProvider {
  constructor(name = 'stub-completion', params = {}) {
    super(name, STAGE.COMPLETION, params);
  }
  async provide(input, _ctx) {
    const t0 = Date.now();
    const points = input.output?.points || input.points || [];
    // Completion: füge eine ebene Unterseite hinzu
    const minY = Math.min(...points.map(p => p.y));
    const floorPts = [];
    const gridSize = this.params.grid || 10;
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        floorPts.push({ x: (i / gridSize - 0.5), y: minY, z: (j / gridSize - 0.5) });
      }
    }
    return {
      ok: true,
      output: { points: [...points, ...floorPts] },
      metrics: {
        runtime_ms: Date.now() - t0,
        memory_mb: (floorPts.length * 12) / 1024 / 1024,
        quality: this.params.quality || 0.7,
      },
    };
  }
}

// ---- Real-Provider-Wrapper für DA2/DA3/MoGe etc. (stubbar) ----
export class WrappedProvider extends BenchmarkProvider {
  constructor(name, stage, params, impl) {
    super(name, stage, params);
    this._impl = impl;
  }
  async provide(input, ctx) {
    const t0 = Date.now();
    let result;
    try {
      result = await this._impl(input, ctx, this.params);
    } catch (err) {
      return { ok: false, error: err.message, metrics: { runtime_ms: Date.now() - t0 } };
    }
    const runtime = (result.metrics?.runtime_ms) ?? (Date.now() - t0);
    const memEstimate = estimateMemory(result.output);
    return {
      ok: true,
      output: result.output,
      metrics: {
        runtime_ms: runtime,
        memory_mb: result.metrics?.memory_mb ?? memEstimate,
        quality: result.metrics?.quality ?? 0,
      },
    };
  }
}

function estimateMemory(output) {
  if (!output) return 0;
  if (output.depth && output.depth.length) return output.depth.length * 4 / 1024 / 1024;
  if (output.points && output.points.length) return output.points.length * 12 / 1024 / 1024;
  return 0;
}

// ---- Information-Loss-Messung ----
// Misst Information-Verlust zwischen zwei Stufen:
//   - Punkt-Dichtät (Anzahl Punkte vor/nach)
//   - Coverage ( welche % der Eingabepunkte sind im Output erhalten)
//   - Distanz (Durchschnittliche Verschiebung von behaltenen Punkten)
export function measureInfoLoss(before, after) {
  const beforePts = before?.points || [];
  const afterPts = after?.points || [];
  if (beforePts.length === 0) return { density: 0, coverage: 1, distance: 0 };

  const retainedRatio = afterPts.length / beforePts.length;
  // Coverage = Anteil der Eingabepunkte, die innerhalb einer Toleranz im Output sind
  let covered = 0;
  const tol = 0.05;
  for (const bp of beforePts) {
    for (const ap of afterPts) {
      const d = Math.hypot(bp.x - ap.x, bp.y - ap.y, bp.z - ap.z);
      if (d < tol) { covered++; break; }
    }
  }
  return {
    density: retainedRatio,
    coverage: covered / beforePts.length,
    distance: 0, // Simplified; real impl would compute nearest-neighbor distance
  };
}

// ---- BenchmarkCase: ein Testfall mit Eingabe und Erwartungen ----
export class BenchmarkCase {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.input = config.input;
    this.expected = config.expected || {};
    this.thresholds = config.thresholds || {
      quality_min: 0.5,
      runtime_max_ms: 10000,
      memory_max_mb: 512,
      info_loss_max: 0.3,
    };
  }
}

// ---- BenchmarkRun: Ergebnis eines Provider-Laufs ----
export class BenchmarkRun {
  constructor(provider, caseId, result) {
    this.provider = provider.name;
    this.providerSignature = provider.signature();
    this.stage = provider.stage;
    this.caseId = caseId;
    this.ok = result.ok;
    this.error = result.error || null;
    this.metrics = result.metrics || {};
    this.outputRef = result.output ? hashOutput(result.output) : null;
    this.params = provider.params;
    this.timestamp = Date.now();
  }
}

function hashOutput(output) {
  // Kurzer SHA-256-ähnlicher Hash (verwende JSON + String-Länge als Proxy)
  let h = 0;
  const json = JSON.stringify(output).substring(0, 2000);
  for (let i = 0; i < json.length; i++) h = ((h << 5) - h + json.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).padStart(8, '0');
}

// ---- Tournament: turnierartige Eliminierung ----
export class Tournament {
  constructor(benchmark) {
    this.benchmark = benchmark;
    this.rounds = [];
  }

  // Run a single provider on all cases for one stage, then rank.
  async runStage(stage, providers, cases) {
    const results = [];
    for (const p of providers) {
      for (const c of cases) {
        const run = await this.benchmark.runProvider(p, stage, c);
        results.push(run);
      }
    }

    // Rank providers by composite score: quality - runtime_penalty - memory_penalty
    const providerScores = new Map();
    for (const p of providers) {
      const runs = results.filter(r => r.provider === p.name);
      const validRuns = runs.filter(r => r.ok);
      if (validRuns.length === 0) {
        providerScores.set(p.name, { score: -Infinity, runs, eliminated: true, reason: 'all_runs_failed' });
        continue;
      }
      const avgQuality = validRuns.reduce((s, r) => s + (r.metrics.quality || 0), 0) / validRuns.length;
      const avgRuntime = validRuns.reduce((s, r) => s + (r.metrics.runtime_ms || 0), 0) / validRuns.length;
      const avgMemory = validRuns.reduce((s, r) => s + (r.metrics.memory_mb || 0), 0) / validRuns.length;
      const score = avgQuality - avgRuntime / 1000 - avgMemory / 100;
      providerScores.set(p.name, { score, runs, eliminated: false });
    }

    return {
      stage,
      results,
      ranking: Array.from(providerScores.entries())
        .sort(([, a], [, b]) => b.score - a.score)
        .map(([name, info]) => ({ provider: name, score: info.score, ...info })),
    };
  }

  // Eliminate bottom half of providers in a round.
  eliminateBottom(round, fraction = 0.5) {
    const active = round.ranking.filter(r => !r.eliminated);
    const cutoff = Math.ceil(active.length * fraction);
    const eliminated = active.slice(cutoff);
    const survivors = active.slice(0, cutoff);

    for (const e of eliminated) {
      e.eliminated = true;
      e.reason = `tournament: bottom ${fraction * 100}% (score ${e.score.toFixed(4)} vs cutoff ${survivors[0]?.score})`;
    }

    round.ranking.forEach(r => {
      if (eliminated.find(e => e.provider === r.provider)) {
        r.eliminated = true;
        r.reason = r.reason || `tournament: bottom ${fraction * 100}%`;
      }
    });

    return survivors.map(s => this.benchmark.providers.find(p => p.name === s.provider));
  }

  // Full tournament: run each stage, eliminate, combine winners.
  async runTournament(stages, providersByStage, cases) {
    const allRounds = [];
    const winners = {};

    for (const stage of stages) {
      const providers = providersByStage[stage] || [];
      if (providers.length === 0) {
        winners[stage] = [];
        continue;
      }

      let round = await this.runStage(stage, providers, cases);
      this.rounds.push({ stage, round });
      allRounds.push({ stage, round });

      let survivors = providers;
      let roundNum = 0;
      while (survivors.length > 1 && survivors.length > 1) {
        roundNum++;
        survivors = this.eliminateBottom(round, 0.5);
        if (survivors.length === 0) break;
        if (survivors.length === providers.length) break; // no elimination happened
        if (survivors.length === 1) break;

        round = await this.runStage(stage, survivors, cases);
        this.rounds.push({ stage, round, round: roundNum });
      }

      winners[stage] = survivors;
    }

    return { rounds: this.rounds, winners };
  }

  // Run a stack: combine winners from all stages and test end-to-end.
  async runStack(cases) {
    const stackResults = [];
    for (const c of cases) {
      const input = c.input;
      let currentInput = input;
      const stageOutputs = {};

      for (const stage of STAGE_ORDER) {
        const providers = this.benchmark.providersByStage[stage] || [];
        const winner = providers[0]; // best from tournament
        if (!winner) continue;

        const run = await this.benchmark.runProvider(winner, stage, c, currentInput);
        stageOutputs[stage] = run;
        if (run.ok) {
          currentInput = { input: currentInput, output: run.metrics?.output || run.outputRef, stage: stage };
        }
      }
      stackResults.push({ caseId: c.id, stageOutputs });
    }
    return stackResults;
  }
}

// ---- Haupt-Benchmark-Klasse ----
export class ReconstructionBenchmark {
  constructor(opts = {}) {
    this.providers = [];             // alle Provider
    this.providersByStage = {};     // stage -> [providers]
    this.cases = [];                // BenchmarkCases
    this.runs = [];                 // BenchmarkRun[]
    this.tournament = new Tournament(this);
    this.artifactDir = opts.artifactDir || '/tmp/shaded-benchmark';
    this.onRunComplete = opts.onRunComplete || null;
  }

  register(provider) {
    this.providers.push(provider);
    if (!this.providersByStage[provider.stage]) this.providersByStage[provider.stage] = [];
    this.providersByStage[provider.stage].push(provider);
    return this;
  }

  addCase(benchmarkCase) {
    this.cases.push(benchmarkCase);
    return this;
  }

  // Run a single provider on a single case for a given stage.
  async runProvider(provider, stage, testCase, inputOverride) {
    const input = inputOverride || testCase.input;
    const ctx = { benchmarks: this };

    const t0 = Date.now();
    const beforeMem = process.memoryUsage().heapUsed;

    let result;
    try {
      result = await provider.provide(input, ctx);
    } catch (err) {
      result = { ok: false, error: err.message };
    }

    const runtime = Date.now() - t0;
    const afterMem = process.memoryUsage().heapUsed;
    const memMB = (afterMem - beforeMem) / 1024 / 1024;

    if (!result.metrics) result.metrics = {};
    result.metrics.runtime_ms = (result.metrics.runtime_ms || runtime);
    result.metrics.memory_mb = result.metrics.memory_mb || memMB;

    const run = new BenchmarkRun(provider, testCase.id, result);
    this.runs.push(run);

    if (this.onRunComplete) this.onRunComplete(run);

    return run;
  }

  // Run all providers on all cases for all stages (full cartesian).
  async runAll() {
    const results = [];
    for (const stage of STAGE_ORDER) {
      const providers = this.providersByStage[stage] || [];
      for (const p of providers) {
        for (const c of this.cases) {
          const run = await this.runProvider(p, stage, c);
          results.push({ provider: p.name, stage, caseId: c.id, run });
        }
      }
    }
    return results;
  }

  // Tournament-style: eliminate bottom half per stage, then test stacks.
  async runTournament() {
    const tournamentResult = await this.tournament.runTournament(
      STAGE_ORDER,
      this.providersByStage,
      this.cases
    );

    const stackResults = await this.tournament.runStack(this.cases);

    return {
      tournament: tournamentResult,
      stack: stackResults,
      allRuns: this.runs,
    };
  }

  // Generate a report
  report() {
    const byStage = {};
    for (const stage of STAGE_ORDER) {
      const runs = this.runs.filter(r => r.stage === stage);
      byStage[stage] = {
        total: runs.length,
        ok: runs.filter(r => r.ok).length,
        failed: runs.filter(r => !r.ok).length,
        avgRuntimeMs: runs.filter(r => r.ok).reduce((s, r) => s + (r.metrics.runtime_ms || 0), 0) / Math.max(1, runs.filter(r => r.ok).length),
        avgMemoryMb: runs.filter(r => r.ok).reduce((s, r) => s + (r.metrics.memory_mb || 0), 0) / Math.max(1, runs.filter(r => r.ok).length),
        avgQuality: runs.filter(r => r.ok).reduce((s, r) => s + (r.metrics.quality || 0), 0) / Math.max(1, runs.filter(r => r.ok).length),
      };
    }
    return { totalRuns: this.runs.length, byStage };
  }
}

// Factory for creating a standard benchmark config
export function createStandardBenchmark(opts = {}) {
  const bench = new ReconstructionBenchmark(opts);

  // Register standard stub providers
  bench.register(new StubDepthProvider('depth-accurate', { quality: 0.9, resolution: 'high' }));
  bench.register(new StubDepthProvider('depth-fast', { quality: 0.7, resolution: 'low' }));
  bench.register(new StubGeometryProvider('geo-full', { quality: 0.85, stride: 2 }));
  bench.register(new StubGeometryProvider('geo-fast', { quality: 0.6, stride: 8 }));
  bench.register(new StubCleanupProvider('cleanup-strict', { quality: 0.95, stride: 5 }));
  bench.register(new StubCleanupProvider('cleanup-loose', { quality: 0.7, stride: 2 }));
  bench.register(new StubCompletionProvider('completion-full', { quality: 0.85, grid: 20 }));
  bench.register(new StubCompletionProvider('completion-minimal', { quality: 0.5, grid: 5 }));

  return bench;
}
