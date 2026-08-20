/**
 * SHADED Retention & Artifact Specification
 * Defines how experiment artifacts are stored, cached, and retained
 */

import { RETENTION_CLASS } from './core.js';

/**
 * Storage tier definitions
 */
export const STORAGE_TIER = {
  HOT: 'hot',        // Fast SSD, active experiments
  WARM: 'warm',      // Slower SSD, recent KEEP/FORENSIC
  COLD: 'cold',      // HDD/Object storage, GOLD archives
  REMOTE: 'remote'   // Cloud bucket, long-term GOLD
};

/**
 * Artifact categories and their default retention
 */
export const ARTIFACT_CATEGORIES = {
  // Heavy intermediates (auto-cleanup unless promoted)
  DEPTH_MAP: { defaultRetention: RETENTION_CLASS.EPHEMERAL, typicalSize: '10-50 MB' },
  POINT_CLOUD: { defaultRetention: RETENTION_CLASS.EPHEMERAL, typicalSize: '50-500 MB' },
  DENSE_MESH: { defaultRetention: RETENTION_CLASS.EPHEMERAL, typicalSize: '100 MB - 2 GB' },
  GAUSSIAN_MODEL: { defaultRetention: RETENTION_CLASS.EPHEMERAL, typicalSize: '50 MB - 1 GB' },
  TEXTURE_ATLAS: { defaultRetention: RETENTION_CLASS.EPHEMERAL, typicalSize: '10-100 MB' },
  SDF_FIELD: { defaultRetention: RETENTION_CLASS.EPHEMERAL, typicalSize: '10-100 MB' },
  VOXEL_GRID: { defaultRetention: RETENTION_CLASS.EPHEMERAL, typicalSize: '50-200 MB' },
  
  // Evaluation outputs (always kept)
  EVAL_PACKET: { defaultRetention: RETENTION_CLASS.KEEP, typicalSize: '1-10 KB' },
  METRICS_JSON: { defaultRetention: RETENTION_CLASS.KEEP, typicalSize: '5-50 KB' },
  PROBE_RENDERS: { defaultRetention: RETENTION_CLASS.KEEP, typicalSize: '1-5 MB' },
  CONTACT_SHEET: { defaultRetention: RETENTION_CLASS.KEEP, typicalSize: '2-10 MB' },
  HELD_OUT_RENDERS: { defaultRetention: RETENTION_CLASS.KEEP, typicalSize: '5-20 MB' },
  
  // Configuration & provenance (always kept)
  CONFIG_JSON: { defaultRetention: RETENTION_CLASS.GOLD, typicalSize: '5-20 KB' },
  PROVENANCE_JSON: { defaultRetention: RETENTION_CLASS.GOLD, typicalSize: '10-100 KB' },
  RUN_JSON: { defaultRetention: RETENTION_CLASS.GOLD, typicalSize: '20-200 KB' },
  
  // Promoted artifacts
  PARETO_MESH: { defaultRetention: RETENTION_CLASS.KEEP, typicalSize: '50-500 MB' },
  PARETO_GAUSSIANS: { defaultRetention: RETENTION_CLASS.KEEP, typicalSize: '50-500 MB' },
  FORENSIC_FULL: { defaultRetention: RETENTION_CLASS.FORENSIC, typicalSize: '100 MB - 5 GB' },
  GOLD_REFERENCE: { defaultRetention: RETENTION_CLASS.GOLD, typicalSize: '100 MB - 5 GB' }
};

/**
 * Retention policies by class
 */
export const RETENTION_POLICIES = {
  [RETENTION_CLASS.EPHEMERAL]: {
    description: 'Evaluate then discard heavy artifacts',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    autoDelete: true,
    tier: STORAGE_TIER.HOT,
    replication: 1
  },
  [RETENTION_CLASS.KEEP]: {
    description: 'Interesting Pareto result',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    autoDelete: false,
    tier: STORAGE_TIER.WARM,
    replication: 2
  },
  [RETENTION_CLASS.GOLD]: {
    description: 'Full reproducible reference',
    maxAge: -1, // Never auto-delete
    autoDelete: false,
    tier: STORAGE_TIER.COLD,
    replication: 3
  },
  [RETENTION_CLASS.FORENSIC]: {
    description: 'Unexpected failure/contradiction/synergy worth investigating',
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    autoDelete: false,
    tier: STORAGE_TIER.WARM,
    replication: 2
  }
};

/**
 * Artifact manifest entry
 */
export class ArtifactManifest {
  constructor() {
    this.entries = new Map(); // hash -> ArtifactEntry
  }

  add(entry) {
    this.entries.set(entry.hash, entry);
  }

  get(hash) {
    return this.entries.get(hash);
  }

  // Find artifacts by retention class
  byRetention(retention) {
    return Array.from(this.entries.values()).filter(e => e.retention === retention);
  }

  // Find artifacts older than maxAge
  olderThan(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    return Array.from(this.entries.values()).filter(e => e.timestamp < cutoff);
  }

  // Total size by retention class
  sizeByRetention() {
    const sizes = {};
    for (const entry of this.entries.values()) {
      sizes[entry.retention] = (sizes[entry.retention] || 0) + entry.size;
    }
    return sizes;
  }

  toJSON() {
    return Array.from(this.entries.values());
  }

  static fromJSON(data) {
    const manifest = new ArtifactManifest();
    for (const entry of data) {
      manifest.add(entry);
    }
    return manifest;
  }
}

/**
 * Artifact entry
 */
export class ArtifactEntry {
  constructor(hash, options = {}) {
    this.hash = hash;
    this.category = options.category || 'UNKNOWN';
    this.retention = options.retention || RETENTION_CLASS.EPHEMERAL;
    this.size = options.size || 0;
    this.mime = options.mime || 'application/octet-stream';
    this.tier = options.tier || STORAGE_TIER.HOT;
    this.path = options.path || null;
    this.remoteUrl = options.remoteUrl || null;
    this.replication = options.replication || 1;
    this.timestamp = options.timestamp || Date.now();
    this.lastAccess = options.lastAccess || Date.now();
    this.accessCount = options.accessCount || 0;
    this.tags = options.tags || [];
    this.runId = options.runId || null;
    this.stageName = options.stageName || null;
    this.metadata = options.metadata || {};
    this.checksum = options.checksum || null; // Additional checksum (xxhash, etc.)
  }

  promote(newRetention) {
    if (this.retention === RETENTION_CLASS.EPHEMERAL && 
        [RETENTION_CLASS.KEEP, RETENTION_CLASS.GOLD, RETENTION_CLASS.FORENSIC].includes(newRetention)) {
      this.retention = newRetention;
      this.tier = RETENTION_POLICIES[newRetention].tier;
      this.replication = RETENTION_POLICIES[newRetention].replication;
      return true;
    }
    return false;
  }

  shouldAutoDelete() {
    const policy = RETENTION_POLICIES[this.retention];
    if (!policy.autoDelete || policy.maxAge < 0) return false;
    return (Date.now() - this.timestamp) > policy.maxAge;
  }
}

/**
 * Run directory structure
 * 
 * runs/<RUN_ID>/
 *   config.json           # ExperimentConfig (GOLD)
 *   run.json              # Full ExperimentRun (GOLD)
 *   provenance.json       # Provenance chain (GOLD)
 *   metrics.json          # Computed metrics (KEEP)
 *   eval_report.json      # Evaluation report (KEEP)
 *   artifacts/
 *     manifest.json       # ArtifactManifest (GOLD)
 *     <category>/
 *       <hash>.<ext>      # Content-addressed files (various retention)
 *   probes/
 *     probe_<name>.png    # Probe renders (KEEP)
 *   contact_sheet.png     # Contact sheet (KEEP)
 *   held_out/
 *     view_<id>.png       # Held-out view comparisons (KEEP)
 *   logs/
 *     stdout.log
 *     stderr.log
 *     timing.json
 */
export const RUN_DIR_STRUCTURE = {
  'config.json': { retention: RETENTION_CLASS.GOLD, required: true },
  'run.json': { retention: RETENTION_CLASS.GOLD, required: true },
  'provenance.json': { retention: RETENTION_CLASS.GOLD, required: true },
  'metrics.json': { retention: RETENTION_CLASS.KEEP, required: true },
  'eval_report.json': { retention: RETENTION_CLASS.KEEP, required: false },
  'artifacts/manifest.json': { retention: RETENTION_CLASS.GOLD, required: true },
  'artifacts/': { retention: 'VARIES', required: false },
  'probes/': { retention: RETENTION_CLASS.KEEP, required: false },
  'contact_sheet.png': { retention: RETENTION_CLASS.KEEP, required: false },
  'held_out/': { retention: RETENTION_CLASS.KEEP, required: false },
  'logs/': { retention: RETENTION_CLASS.EPHEMERAL, required: false }
};

/**
 * Artifact Cache Manager
 * Manages content-addressed artifact storage across tiers
 */
export class ArtifactCacheManager {
  constructor(rootDir = '.shaded-cache') {
    this.rootDir = rootDir;
    this.manifest = new ArtifactManifest();
    this.tierDirs = {
      [STORAGE_TIER.HOT]: path.join(rootDir, 'hot'),
      [STORAGE_TIER.WARM]: path.join(rootDir, 'warm'),
      [STORAGE_TIER.COLD]: path.join(rootDir, 'cold'),
      [STORAGE_TIER.REMOTE]: null // Cloud bucket
    };
  }

  async init() {
    for (const dir of Object.values(this.tierDirs)) {
      if (dir) await fs.mkdir(dir, { recursive: true });
    }
    await this.loadManifest();
  }

  async loadManifest() {
    const manifestPath = path.join(this.rootDir, 'manifest.json');
    try {
      const data = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      this.manifest = ArtifactManifest.fromJSON(data);
    } catch {
      // No manifest yet
    }
  }

  async saveManifest() {
    const manifestPath = path.join(this.rootDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(this.manifest.toJSON(), null, 2));
  }

  /**
   * Store artifact content-addressed
   */
  async store(content, options = {}) {
    const hash = createHash('sha256').update(content).digest('hex');
    
    // Check if already exists
    const existing = this.manifest.get(hash);
    if (existing) {
      existing.accessCount++;
      existing.lastAccess = Date.now();
      return { hash, path: existing.path, cached: true };
    }
    
    const category = options.category || 'UNKNOWN';
    const retention = options.retention || RETENTION_CLASS.EPHEMERAL;
    const policy = RETENTION_POLICIES[retention];
    const tier = options.tier || policy.tier;
    const tierDir = this.tierDirs[tier];
    
    const subDir = path.join(tierDir, hash.slice(0, 2));
    await fs.mkdir(subDir, { recursive: true });
    const filePath = path.join(subDir, hash);
    
    await fs.writeFile(filePath, content);
    
    const entry = new ArtifactEntry(hash, {
      category,
      retention,
      size: content.length,
      mime: options.mime || 'application/octet-stream',
      tier,
      path: filePath,
      tags: options.tags || [],
      runId: options.runId,
      stageName: options.stageName,
      metadata: options.metadata || {}
    });
    
    this.manifest.add(entry);
    await this.saveManifest();
    
    return { hash, path: filePath, cached: false };
  }

  /**
   * Retrieve artifact by hash
   */
  async retrieve(hash) {
    const entry = this.manifest.get(hash);
    if (!entry) return null;
    
    entry.accessCount++;
    entry.lastAccess = Date.now();
    await this.saveManifest();
    
    try {
      const content = await fs.readFile(entry.path);
      return content;
    } catch {
      // File missing from tier
      return null;
    }
  }

  /**
   * Promote artifact to higher retention class
   */
  async promote(hash, newRetention, reason = 'manual') {
    const entry = this.manifest.get(hash);
    if (!entry) throw new Error(`Artifact not found: ${hash}`);
    
    if (entry.promote(newRetention)) {
      // Copy to new tier if needed
      const newPolicy = RETENTION_POLICIES[newRetention];
      const newTierDir = this.tierDirs[newPolicy.tier];
      
      if (newTierDir !== path.dirname(entry.path)) {
        const newSubDir = path.join(newTierDir, hash.slice(0, 2));
        await fs.mkdir(newSubDir, { recursive: true });
        const newPath = path.join(newSubDir, hash);
        await fs.copyFile(entry.path, newPath);
        entry.path = newPath;
      }
      
      entry.tags.push(`promoted:${reason}:${Date.now()}`);
      await this.saveManifest();
      return true;
    }
    return false;
  }

  /**
   * Auto-promote interesting artifacts based on evaluation
   */
  async autoPromote(evalReport, runId) {
    const promotions = [];
    
    // Promote Pareto-optimal results
    if (evalReport.overallScore > 0.85) {
      // Find artifacts from this run
      const runArtifacts = this.manifest.byRetention(RETENTION_CLASS.EPHEMERAL)
        .filter(a => a.runId === runId);
      
      for (const artifact of runArtifacts) {
        if (artifact.category === 'DENSE_MESH' || artifact.category === 'GAUSSIAN_MODEL') {
          await this.promote(artifact.hash, RETENTION_CLASS.KEEP, `pareto_score_${evalReport.overallScore.toFixed(3)}`);
          promotions.push({ hash: artifact.hash, reason: 'pareto', score: evalReport.overallScore });
        }
      }
    }
    
    // Promote forensic cases
    if (evalReport.status === 'failed' || evalReport.dimensionScores?.WORLD_TRUTH < 0.3) {
      const runArtifacts = this.manifest.byRetention(RETENTION_CLASS.EPHEMERAL)
        .filter(a => a.runId === runId);
      
      for (const artifact of runArtifacts) {
        await this.promote(artifact.hash, RETENTION_CLASS.FORENSIC, `forensic_${evalReport.status}`);
        promotions.push({ hash: artifact.hash, reason: 'forensic', status: evalReport.status });
      }
    }
    
    return promotions;
  }

  /**
   * Garbage collect expired ephemeral artifacts
   */
  async gc() {
    let freed = 0;
    let deleted = 0;
    
    for (const entry of this.manifest.entries.values()) {
      if (entry.shouldAutoDelete()) {
        try {
          await fs.unlink(entry.path);
          freed += entry.size;
          deleted++;
        } catch (e) {
          // Already gone
        }
        this.manifest.entries.delete(entry.hash);
      }
    }
    
    await this.saveManifest();
    return { freed, deleted };
  }

  /**
   * Get storage usage report
   */
  getUsageReport() {
    const byTier = {};
    const byRetention = {};
    let totalSize = 0;
    let totalCount = 0;
    
    for (const entry of this.manifest.entries.values()) {
      totalSize += entry.size;
      totalCount++;
      
      byTier[entry.tier] = (byTier[entry.tier] || 0) + entry.size;
      byRetention[entry.retention] = (byRetention[entry.retention] || 0) + entry.size;
    }
    
    return {
      totalSize,
      totalCount,
      byTier,
      byRetention,
      policies: RETENTION_POLICIES
    };
  }
}

/**
 * Run Lifecycle Manager
 * Handles run directory creation, artifact linking, cleanup
 */
export class RunLifecycleManager {
  constructor(runsDir = 'runs', cacheManager) {
    this.runsDir = runsDir;
    this.cache = cacheManager;
  }

  async createRunDir(runId) {
    const runDir = path.join(this.runsDir, runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(path.join(runDir, 'artifacts'), { recursive: true });
    await fs.mkdir(path.join(runDir, 'probes'), { recursive: true });
    await fs.mkdir(path.join(runDir, 'held_out'), { recursive: true });
    await fs.mkdir(path.join(runDir, 'logs'), { recursive: true });
    return runDir;
  }

  async linkArtifacts(run, runDir) {
    const artifactsDir = path.join(runDir, 'artifacts');
    const manifest = new ArtifactManifest();
    
    for (const [stageName, artifact] of run.artifacts.entries()) {
      // Link from cache to run directory
      const ext = this.mimeToExt(artifact.mime);
      const linkName = `${stageName}_${artifact.hash.slice(0, 12)}.${ext}`;
      const linkPath = path.join(artifactsDir, linkName);
      
      try {
        await fs.symlink(artifact.path, linkPath);
      } catch {
        // Copy if symlink fails (Windows, permissions)
        await fs.copyFile(artifact.path, linkPath);
      }
      
      manifest.add(new ArtifactEntry(artifact.hash, {
        category: artifact.category || 'UNKNOWN',
        retention: artifact.retention,
        size: artifact.size,
        mime: artifact.mime,
        path: linkPath,
        runId: run.runId,
        stageName,
        metadata: artifact.metadata
      }));
    }
    
    // Save manifest
    await fs.writeFile(
      path.join(artifactsDir, 'manifest.json'),
      JSON.stringify(manifest.toJSON(), null, 2)
    );
    
    return manifest;
  }

  mimeToExt(mime) {
    const map = {
      'application/octet-stream': 'bin',
      'application/json': 'json',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'model/gltf+json': 'gltf',
      'model/gltf-binary': 'glb',
      'text/plain': 'txt'
    };
    return map[mime] || 'bin';
  }

  async finalizeRun(run, evalReport) {
    const runDir = path.join(this.runsDir, run.runId);
    
    // Save evaluation report
    await fs.writeFile(
      path.join(runDir, 'eval_report.json'),
      JSON.stringify(evalReport, null, 2)
    );
    
    // Auto-promote based on evaluation
    const promotions = await this.cache.autoPromote(evalReport, run.runId);
    
    // Update run status
    await fs.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify(run, null, 2)
    );
    
    return { promotions };
  }

  /**
   * Cleanup run directory (keep only GOLD/KEEP/FORENSIC artifacts)
   */
  async cleanupRun(runId, options = {}) {
    const { keepProbes = true, keepHeldOut = true, dryRun = false } = options;
    const runDir = path.join(this.runsDir, runId);
    
    // Read manifest to know what to keep
    const manifestPath = path.join(runDir, 'artifacts', 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch {
      return { error: 'No manifest found' };
    }
    
    let freed = 0;
    let removed = 0;
    
    for (const entry of manifest) {
      const policy = RETENTION_POLICIES[entry.retention];
      if (policy.autoDelete && !entry.tags.some(t => t.startsWith('promoted:'))) {
        if (!dryRun) {
          try {
            await fs.unlink(entry.path);
          } catch {}
        }
        freed += entry.size;
        removed++;
      }
    }
    
    // Clean logs (always ephemeral)
    const logsDir = path.join(runDir, 'logs');
    try {
      const logFiles = await fs.readdir(logsDir);
      for (const logFile of logFiles) {
        const logPath = path.join(logsDir, logFile);
        const stats = await fs.stat(logPath);
        freed += stats.size;
        removed++;
        if (!dryRun) await fs.unlink(logPath);
      }
    } catch {}
    
    return { freed, removed, dryRun };
  }
}

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export default {
  STORAGE_TIER,
  ARTIFACT_CATEGORIES,
  RETENTION_POLICIES,
  RETENTION_CLASS,
  ArtifactManifest,
  ArtifactEntry,
  RUN_DIR_STRUCTURE,
  ArtifactCacheManager,
  RunLifecycleManager
};