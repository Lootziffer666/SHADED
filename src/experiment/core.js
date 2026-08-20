/**
 * SHADED Experiment Infrastructure
 * Core primitives for reproducible experiment runs with provenance tracking
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Generate unique Run ID
 * Format: RUN-YYYYMMDD-HHMMSS-XXXX (4 hex chars from random)
 */
export function generateRunId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const random = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `RUN-${dateStr}-${random}`;
}

/**
 * Content-addressed hash for artifacts
 */
export function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function hashFile(filePath) {
  return fs.readFile(filePath).then(buf => createHash('sha256').update(buf).digest('hex'));
}

/**
 * Retention classes for artifact storage
 */
export const RETENTION_CLASS = {
  EPHEMERAL: 'EPHEMERAL',      // Evaluate then discard heavy artifacts
  KEEP: 'KEEP',                // Interesting Pareto result
  GOLD: 'GOLD',                // Full reproducible reference
  FORENSIC: 'FORENSIC'         // Unexpected failure/contradiction/synergy
};

/**
 * Experiment configuration schema
 */
export const ExperimentConfigSchema = {
  type: 'object',
  required: ['runId', 'goal', 'scene', 'operators', 'hardware', 'seeds'],
  properties: {
    runId: { type: 'string', pattern: '^RUN-\\d{14}-[0-9A-F]{4}$' },
    parentRunId: { type: ['string', 'null'] },
    goal: { type: 'string', enum: ['SHOWCASE', 'PLAY', 'EDIT', 'MOBILE', 'NAVIGATION', 'COLLISION', 'RESEARCH'] },
    scene: {
      type: 'object',
      required: ['id', 'source', 'type'],
      properties: {
        id: { type: 'string' },
        source: { type: 'string' }, // path or URL
        type: { type: 'string', enum: ['single_rgb', 'multi_rgb', 'video', 'depth', 'pointcloud', 'mesh', 'floorplan', 'synthetic'] },
        cameraParams: { type: 'object' },
        groundTruth: { type: ['string', 'null'] }
      }
    },
    operators: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'version', 'enabled', 'parameters'],
        properties: {
          id: { type: 'string' },
          version: { type: 'string' },
          enabled: { type: 'boolean' },
          parameters: { type: 'object' },
          dependencies: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    hardware: {
      type: 'object',
      required: ['cpu', 'gpu', 'ram', 'vram'],
      properties: {
        cpu: { type: 'string' },
        gpu: { type: 'string' },
        ram: { type: 'string' },
        vram: { type: 'string' },
        runtime: { type: 'string', enum: ['node', 'browser', 'modal', 'local'] }
      }
    },
    seeds: {
      type: 'object',
      properties: {
        global: { type: 'number' },
        perOperator: { type: 'object', additionalProperties: { type: 'number' } }
      }
    },
    environment: {
      type: 'object',
      properties: {
        nodeVersion: { type: 'string' },
        dependencies: { type: 'object' },
        envVars: { type: 'object' }
      }
    },
    budget: {
      type: 'object',
      properties: {
        maxTimeMs: { type: 'number' },
        maxVRAM: { type: 'string' },
        maxRAM: { type: 'string' },
        maxStorage: { type: 'string' }
      }
    }
  }
};

/**
 * Experiment run record
 */
export class ExperimentRun {
  constructor(config) {
    this.runId = config.runId || generateRunId();
    this.parentRunId = config.parentRunId || null;
    this.goal = config.goal || 'RESEARCH';
    this.scene = config.scene;
    this.operators = config.operators || [];
    this.hardware = config.hardware || {};
    this.seeds = config.seeds || { global: Date.now() };
    this.environment = config.environment || {};
    this.budget = config.budget || {};
    
    this.startTime = Date.now();
    this.endTime = null;
    this.status = 'running'; // 'running' | 'completed' | 'failed' | 'cancelled'
    this.error = null;
    
    this.artifacts = new Map(); // stageName -> { hash, path, retention, size, mime }
    this.metrics = {};
    this.provenance = [];
    this.cost = { computeMs: 0, estimatedCostUsd: 0 };
  }

  /**
   * Record an artifact produced during this run
   */
  async recordArtifact(stageName, filePath, options = {}) {
    const { retention = RETENTION_CLASS.EPHEMERAL, mime = 'application/octet-stream', metadata = {} } = options;
    
    const content = await fs.readFile(filePath);
    const hash = hashContent(content);
    const size = content.length;
    
    const artifact = {
      stageName,
      hash,
      path: filePath,
      retention,
      size,
      mime,
      metadata,
      timestamp: Date.now()
    };
    
    this.artifacts.set(stageName, artifact);
    this.provenance.push({
      type: 'artifact',
      stageName,
      hash,
      retention,
      timestamp: Date.now()
    });
    
    return artifact;
  }

  /**
   * Record a metric
   */
  recordMetric(name, value, unit = '') {
    this.metrics[name] = { value, unit, timestamp: Date.now() };
  }

  /**
   * Record timing for a stage
   */
  recordTiming(stageName, durationMs) {
    this.recordMetric(`timing.${stageName}`, durationMs, 'ms');
  }

  /**
   * Record memory usage
   */
  recordMemory(stageName, rssMb, heapUsedMb, vramMb = null) {
    this.recordMetric(`memory.${stageName}.rss`, rssMb, 'MB');
    this.recordMetric(`memory.${stageName}.heap`, heapUsedMb, 'MB');
    if (vramMb !== null) {
      this.recordMetric(`memory.${stageName}.vram`, vramMb, 'MB');
    }
  }

  /**
   * Record cost
   */
  addCost(computeMs, estimatedCostUsd) {
    this.cost.computeMs += computeMs;
    this.cost.estimatedCostUsd += estimatedCostUsd;
  }

  /**
   * Mark run as completed
   */
  complete() {
    this.endTime = Date.now();
    this.status = 'completed';
    this.recordMetric('totalDuration', this.endTime - this.startTime, 'ms');
  }

  /**
   * Mark run as failed
   */
  fail(error) {
    this.endTime = Date.now();
    this.status = 'failed';
    this.error = error instanceof Error ? error.message : String(error);
    this.recordMetric('totalDuration', this.endTime - this.startTime, 'ms');
  }

  /**
   * Serialize to evaluation packet (small, no heavy artifacts)
   */
  toEvaluationPacket() {
    return {
      runId: this.runId,
      parentRunId: this.parentRunId,
      goal: this.goal,
      scene: this.scene,
      operators: this.operators.map(op => ({
        id: op.id,
        version: op.version,
        enabled: op.enabled,
        parameters: op.parameters
      })),
      hardware: this.hardware,
      seeds: this.seeds,
      environment: this.environment,
      budget: this.budget,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      error: this.error,
      metrics: this.metrics,
      artifacts: Array.from(this.artifacts.entries()).map(([stage, art]) => ({
        stageName: art.stageName,
        hash: art.hash,
        retention: art.retention,
        size: art.size,
        mime: art.mime,
        metadata: art.metadata
      })),
      provenance: this.provenance,
      cost: this.cost
    };
  }

  /**
   * Save run to disk
   */
  async save(runsDir = 'runs') {
    const runDir = path.join(runsDir, this.runId);
    await fs.mkdir(runDir, { recursive: true });
    
    // Save config
    await fs.writeFile(
      path.join(runDir, 'config.json'),
      JSON.stringify(this.toEvaluationPacket(), null, 2)
    );
    
    // Save full run record
    await fs.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify(this, null, 2)
    );
    
    return runDir;
  }

  /**
   * Load run from disk
   */
  static async load(runId, runsDir = 'runs') {
    const runDir = path.join(runsDir, runId);
    const data = JSON.parse(await fs.readFile(path.join(runDir, 'run.json'), 'utf8'));
    const run = new ExperimentRun(data);
    Object.assign(run, data);
    run.artifacts = new Map(data.artifacts.map(a => [a.stageName, a]));
    return run;
  }
}

/**
 * Artifact Cache — content-addressed storage
 */
export class ArtifactCache {
  constructor(cacheDir = '.shaded-cache/artifacts') {
    this.cacheDir = cacheDir;
    this.index = new Map(); // hash -> { path, refCount, lastAccess }
  }

  async init() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const indexPath = path.join(this.cacheDir, 'index.json');
    try {
      const data = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      for (const [hash, info] of Object.entries(data)) {
        this.index.set(hash, info);
      }
    } catch {
      // No index yet
    }
  }

  async saveIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    const data = Object.fromEntries(this.index);
    await fs.writeFile(indexPath, JSON.stringify(data, null, 2));
  }

  async get(hash) {
    const info = this.index.get(hash);
    if (!info) return null;
    
    const filePath = path.join(this.cacheDir, hash.slice(0, 2), hash);
    try {
      await fs.access(filePath);
      info.lastAccess = Date.now();
      return filePath;
    } catch {
      // File missing, remove from index
      this.index.delete(hash);
      return null;
    }
  }

  async put(hash, content) {
    if (this.index.has(hash)) {
      this.index.get(hash).refCount++;
      return;
    }
    
    const subDir = path.join(this.cacheDir, hash.slice(0, 2));
    await fs.mkdir(subDir, { recursive: true });
    const filePath = path.join(subDir, hash);
    await fs.writeFile(filePath, content);
    
    this.index.set(hash, {
      path: filePath,
      refCount: 1,
      lastAccess: Date.now(),
      size: content.length
    });
  }

  async release(hash) {
    const info = this.index.get(hash);
    if (!info) return;
    
    info.refCount--;
    if (info.refCount <= 0) {
      // Could delete file, but keep for now (manual cleanup)
    }
  }

  // Garbage collect unreferenced artifacts older than maxAge
  async gc(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [hash, info] of this.index.entries()) {
      if (info.refCount <= 0 && (now - info.lastAccess) > maxAgeMs) {
        try {
          await fs.unlink(info.path);
        } catch {}
        this.index.delete(hash);
      }
    }
    await this.saveIndex();
  }
}

/**
 * Operator Registry — metadata for experimental operators
 */
export class OperatorRegistry {
  constructor() {
    this.operators = new Map(); // id -> OperatorMetadata
  }

  register(metadata) {
    const required = ['id', 'version', 'description', 'inputs', 'outputs', 'parameters', 'license'];
    for (const field of required) {
      if (!metadata[field]) {
        throw new Error(`Operator metadata missing required field: ${field}`);
      }
    }
    
    this.operators.set(metadata.id, {
      ...metadata,
      registeredAt: Date.now(),
      runs: [] // runIds that used this operator
    });
  }

  get(id) {
    return this.operators.get(id);
  }

  list() {
    return Array.from(this.operators.values());
  }

  recordRun(operatorId, runId) {
    const op = this.operators.get(operatorId);
    if (op) {
      op.runs.push(runId);
    }
  }

  // Get operators compatible with a scene type
  forSceneType(sceneType) {
    return this.list().filter(op => 
      op.supportedSceneTypes?.includes(sceneType) || 
      op.supportedSceneTypes === undefined
    );
  }

  // Get operators that can substitute for another
  substitutesFor(operatorId) {
    const op = this.operators.get(operatorId);
    if (!op) return [];
    return this.list().filter(o => 
      o.substitutes?.includes(operatorId) || 
      o.id === operatorId
    );
  }

  // Get rescue operators (cheap operators that can rescue expensive ones)
  rescuersFor(operatorId) {
    return this.list().filter(op => 
      op.rescues?.includes(operatorId)
    );
  }

  // Export for experiment config
  toExperimentConfig(operatorIds) {
    return operatorIds.map(id => {
      const op = this.operators.get(id);
      if (!op) throw new Error(`Unknown operator: ${id}`);
      return {
        id: op.id,
        version: op.version,
        enabled: true,
        parameters: op.defaultParameters || {},
        dependencies: op.dependencies || []
      };
    });
  }
}

/**
 * Operator Metadata schema
 */
export const OperatorMetadataSchema = {
  id: 'string',                    // e.g., 'DepthProvider.DA3'
  version: 'string',               // semantic version
  description: 'string',
  category: 'string',              // 'depth', 'geometry', 'texture', 'simulation', 'render', 'optimization'
  inputs: ['string'],              // e.g., ['rgb_image', 'camera_params']
  outputs: ['string'],             // e.g., ['depth_map', 'confidence_map']
  parameters: 'object',            // JSON schema for parameters
  defaultParameters: 'object',
  dependencies: ['string'],        // other operator IDs
  supportedSceneTypes: ['string'], // ['single_rgb', 'multi_rgb', 'depth', ...]
  runtime: 'object',               // { cpu: true, gpu: false, memory: '512MB' }
  license: 'string',               // e.g., 'MIT', 'Apache-2.0', 'Custom-NC'
  licenseUrl: 'string',
  commercialUse: 'boolean',
  substitutes: ['string'],         // operators this can replace
  rescues: ['string'],             // operators this can rescue
  synergies: ['string'],           // operators this synergizes with
  negativeContributions: ['string'], // metrics this harms
  experimentRequired: 'boolean',
  priority: 'number'               // 0=highest, 1=high, 2=medium, 3=low
};

export default {
  generateRunId,
  hashContent,
  hashFile,
  RETENTION_CLASS,
  ExperimentConfigSchema,
  ExperimentRun,
  ArtifactCache,
  OperatorRegistry,
  OperatorMetadataSchema
};