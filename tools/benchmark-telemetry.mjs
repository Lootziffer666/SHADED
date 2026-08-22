#!/usr/bin/env node
// benchmark-telemetry.mjs — §18 telemetry/metadata packet for SHADED post-GOLD benchmark runs.
//
// Implements the telemetry contract demanded by MASTER-TASK §18/§19 so every benchmark
// run emits a single reproducible, content-addressed artifact packet instead of bare
// numbers. Extends tools/benchmark-providers.mjs (does NOT replace it) and is consumed by
// tools/benchmark-prepare.mjs (Round-A smoke driver) and tools/run-experiment.js.
//
// Covers:
//   §19A  — real SHA-256 content/config hashing (no second addressing scheme).
//   §19B  — collision-resistant RUN_ID (timestamp + random suffix; parallel/cloud safe).
//   §19C  — real peak-RAM (ru_maxrss) + VRAM (graceful "unavailable", never "0").
//   §19D  — cost attribution (Modal cost collected by the run orchestrator downstream).
//   §19E/§21 — provider residency hooks so model load is amortized across batched scenes.
//   §23   — multi-dimensional quality VECTORS (the scalar tie-break §22 stays separate and
//           never erases the vector).
//
// Pure node:std — no torch/GPU needed. Real providers fill telemetry.vram via their wrapper.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TELEMETRY_VERSION = '1.0';
export const GOLD_COMMIT = '1cb06c432d90c49628786a1c80bcdb9ad8145722';

// --- §19A: real SHA-256 hashing -------------------------------------------------
export function hashFile(filePath) {
  const h = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  h.update(data);
  return h.digest('hex');
}

export function hashJson(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

export function hashInputs(inputs) {
  const hashed = [];
  for (const inp of inputs || []) {
    if (inp && typeof inp.path === 'string' && fs.existsSync(inp.path)) {
      hashed.push({
        type: inp.type || 'unknown',
        path: inp.path,
        sha256: hashFile(inp.path),
        size: fs.statSync(inp.path).size,
      });
    } else {
      hashed.push({
        type: inp && inp.type ? inp.type : 'unknown',
        path: inp && inp.path ? inp.path : null,
        sha256: null,
        size: null,
        note: 'virtual input (not content-addressed; real providers must pass a real path)',
      });
    }
  }
  return { inputs: hashed, aggregate_sha256: hashJson(hashed) };
}

// --- §19B: collision-resistant RUN_ID -------------------------------------------
export function generateRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const suffix = crypto.randomBytes(3).toString('hex');
  return `run-${ts}-${suffix}`;
}

// --- gitRef (graceful) ----------------------------------------------------------
export function gitRef(repoRoot = process.cwd()) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', timeout: 5000 }).trim();
    let tree = commit;
    try { tree = execFileSync('git', ['rev-parse', 'HEAD:'], { cwd: repoRoot, encoding: 'utf8', timeout: 5000 }).trim(); } catch {}
    let branch = 'main';
    try { branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', timeout: 5000 }).trim() || 'main'; } catch {}
    let dirty = false;
    try { const s = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8', timeout: 5000 }).trim(); dirty = !!s; } catch {}
    return { repo: 'SHADED', commit, tree, branch, dirty };
  } catch (e) {
    return { repo: 'SHADED', commit: 'unknown', tree: 'unknown', branch: 'unknown', dirty: false, note: `git unavailable: ${e.message}` };
  }
}

// --- §19C: peak process RAM + VRAM (graceful) -----------------------------------
export function collectMemory() {
  const ru = process.resourceUsage();
  // ru_maxrss is kB on Linux, bytes on macOS.
  const maxRssKb = ru.ru_maxrss || 0;
  const peakRssMb = process.platform === 'darwin' ? maxRssMb / 1024 / 1024 : maxRssMb / 1024;
  const mem = process.memoryUsage();
  return {
    peak_rss_mb: Math.round(peakRssMb * 100) / 100,
    heap_used_mb: Math.round(mem.heapUsed / 1048576 * 100) / 100,
    heap_total_mb: Math.round(mem.heapTotal / 1048576 * 100) / 100,
    external_mb: Math.round(((mem.external || 0) / 1048576) * 100) / 100,
    vram_mb: null,
    vram_source: 'unavailable',
    note: 'VRAM requires a CUDA/GPU provider. Real providers report vram_mb via their wrapper; node-only stubs cannot measure VRAM — reported as null (never "0").',
  };
}

export function collectHardware() {
  const cpus = os.cpus();
  return {
    os: os.type(),
    os_release: os.release(),
    node: process.version,
    arch: process.arch,
    cpu_model: cpus.length ? cpus[0].model : 'unknown',
    cores: cpus.length,
    mem_total_mb: Math.round(os.totalmem() / 1048576),
    gpu: { available: false, model: 'unavailable', note: 'CUDA/GPU absent in sandbox; real providers probe nvidia-smi / torch.cuda.' },
    cuda: { available: false, device_count: 0 },
  };
}

// --- §19D: cost attribution ------------------------------------------------------
export function costAttribution(ctx = {}) {
  return {
    currency: 'USD',
    amount: ctx.amount ?? null,
    source: ctx.source || 'unavailable',
    note: ctx.note ||
      'Modal/cloud cost is attributable to RUN_ID by the run orchestrator (Modal run API) ' +
      'and filled here. Zero-cost local stubs report amount=null (§19D).',
  };
}

// --- §19E/§21: provider residency hooks (model load amortized over batches) -----
export function providerSession(providerName) {
  const loadStart = Date.now();
  const state = {
    provider: providerName,
    session_id: `${providerName}-${crypto.randomBytes(4).toString('hex')}`,
    model_loaded: false,
    model_load_ms: 0,
    batches: [],
    begin() { this.model_loaded = true; this.model_load_ms = Date.now() - loadStart; },
    addBatch(scene, config, inferenceMs) { this.batches.push({ scene, config, inference_ms: inferenceMs }); },
    end() {
      return {
        provider: this.provider,
        session_id: this.session_id,
        cold_start_ms: this.model_load_ms,
        total_inference_ms: this.batches.reduce((s, b) => s + (b.inference_ms || 0), 0),
        batches: this.batches.length,
        note: 'Stub/real providers reuse one loaded model across batched scenes (§19E/§21).',
      };
    },
  };
  return state;
}

// --- §23: multi-dimensional quality VECTOR (never replaced by a scalar §22) ------
export const QUALITY_DIMENSIONS = ['geometry', 'consistency', 'function', 'world_truth', 'visual', 'stability', 'performance'];

export function emptyQualityVector() {
  return Object.fromEntries(QUALITY_DIMENSIONS.map((d) => [d, null]));
}

export function buildQualityVector(runMetrics = {}, dims = {}) {
  // Stubs expose a single scalar `quality`. Real providers emit per-dimension scores
  // (e.g. surface_error -> geometry, multi/view -> consistency). Derived fallback below.
  const q = runMetrics.quality != null ? runMetrics.quality : 0;
  const maxMs = runMetrics.runtime_max_ms || 10000;
  return {
    geometry: dims.geometry ?? q,
    consistency: dims.consistency ?? q,
    function: dims.function ?? q,
    world_truth: dims.world_truth ?? q,
    visual: dims.visual ?? q,
    stability: dims.stability ?? q,
    performance: dims.performance ?? Math.max(0, 1 - ((runMetrics.runtime_ms || 0) / maxMs)),
    provenance: runMetrics.quality_source || 'stub-derivation',
    note: 'Scalar tie-break (§22) is kept SEPARATE in scalarTieBreak; this vector is never replaced by it.',
  };
}

// --- §18: assemble the full telemetry/artifact packet --------------------------
export function buildArtifactPacket(ctx) {
  const start = Date.now();
  const inputsInfo = hashInputs(ctx.inputs || []);
  const packet = {
    telemetry_version: TELEMETRY_VERSION,
    runId: ctx.runId || generateRunId(),
    experimentId: ctx.experimentId || 'exp-local-dennis',
    parentExperiment: ctx.parentExperiment || null,
    goal: ctx.goal || 'PLAY',
    baselineCommit: GOLD_COMMIT,
    gitRef: ctx.gitRef || gitRef(ctx.repoRoot),
    scene: ctx.scene,
    inputs: inputsInfo.inputs,
    inputsAggregateSha256: inputsInfo.aggregate_sha256,
    operator: ctx.operator,
    donor: ctx.donor,
    mode: ctx.mode || 'research',
    parameters: ctx.parameters || {},
    provider: {
      name: ctx.providerName,
      impl_type: ctx.implType || 'stub',
      tier: ctx.providerTier || 'stub',
    },
    versions: {
      node: process.version,
      provider_model: ctx.providerModel || 'stub-local-v0',
      weight_sha256: ctx.weightSha256 || null,
      operator_impl: ctx.operatorImpl || null,
    },
    seeds: ctx.seeds || { note: 'stubs are seed-free; real stochastic operators record explicit seeds' },
    hardware: collectHardware(),
    telemetry: { ...collectMemory(), ...(ctx.extraTelemetry || {}) },
    timing: {
      wall_ms: Date.now() - start,
      inference_ms: ctx.inferenceMs || 0,
      per_stage: ctx.perStage || {},
      stage_ms: ctx.stageTimings || [],
    },
    output_hashes: ctx.outputHashes || [],
    provider_session: ctx.providerSession || null,
    cost: costAttribution(ctx.cost || {}),
    retention_class: ctx.retentionClass || 'research-short',
    canonical_probes: ctx.canonicalProbes || [],
    quality_vector: ctx.qualityVector || emptyQualityVector(),
    scalarTieBreak: ctx.scalarTieBreak != null ? ctx.scalarTieBreak : null,
    errors: ctx.errors || [],
  };
  return packet;
}

export function writeArtifactPacket(packet, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const resultPath = path.join(outDir, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(packet, null, 2));
  const sha = hashJson(packet);
  fs.writeFileSync(path.join(outDir, 'result.sha256'), sha + '\n');
  const hashDir = path.join(outDir, 'by-sha256', sha.substring(0, 2));
  fs.mkdirSync(hashDir, { recursive: true });
  fs.copyFileSync(resultPath, path.join(hashDir, sha.substring(2)));
  return { resultPath, sha256: sha };
}

// --- self-test (run directly) ---------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const packet = buildArtifactPacket({
    experimentId: 'telemetry-self-test',
    scene: { id: 'self-test-scene', name: 'Self-test scene' },
    inputs: [],
    operator: 'StubDepthProvider',
    donor: 'stub',
    parameters: { quality: 0.9 },
    providerName: 'depth-accurate',
    qualityVector: buildQualityVector({ quality: 0.9, runtime_ms: 1, runtime_max_ms: 10000 }),
    canonicalProbes: [{ id: 'self', scene: 'self-test-scene', purpose: 'smoke' }],
  });
  const ok =
    typeof packet.runId === 'string' &&
    packet.runId.startsWith('run-') &&
    /-[0-9a-f]{6}$/.test(packet.runId) &&
    !!packet.gitRef &&
    typeof packet.gitRef.commit === 'string' &&
    packet.telemetry.peak_rss_mb != null &&
    packet.telemetry.vram_mb === null &&
    packet.quality_vector &&
    packet.quality_vector.geometry === 0.9 &&
    packet.output_hashes !== undefined &&
    packet.cost &&
    packet.scalarTieBreak === null;
  console.log(JSON.stringify(packet, null, 2));
  console.error(`\nbenchmark-telemetry self-test: ${ok ? 'PASS' : 'FAIL'}\n`);
  process.exit(ok ? 0 : 1);
}
