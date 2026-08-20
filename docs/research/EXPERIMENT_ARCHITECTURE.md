# SHADED Experiment Architecture (EXPERIMENT_ARCHITECTURE.md)

**Generated:** 2026-08-20  
**Status:** Foundation specification — ready for implementation

---

## Overview

The experiment architecture enables SHADED to run reproducible, instrumented, and scalable experiments. Every cloud GPU run simultaneously produces:

1. **Useful compute** — advances the current goal
2. **Benchmark** — standardized metrics
3. **Training example** — config → quality/cost vectors
4. **Provenance record** — why this result, what changed

---

## Core Components

### 1. Run ID System
```
Format: RUN-YYYYMMDD-HHMMSS-XXXX
Example: RUN-20260820-143022-A7F3
```
- Timestamp + 4 hex chars for uniqueness
- Lexicographically sortable
- Embedded in all artifacts

### 2. Experiment Configuration (config.json)
```json
{
  "runId": "RUN-20260820-143022-A7F3",
  "parentRunId": "RUN-20260820-120000-1A2B",
  "goal": "SHOWCASE",
  "scene": {
    "id": "koelnmesse_hall_1",
    "source": "/data/koelnmesse/hall_1.gml",
    "type": "multi_rgb",
    "cameraParams": { ... },
    "groundTruth": "/data/koelnmesse/hall_1_gt.ply"
  },
  "operators": [
    {
      "id": "DepthProvider.DA3",
      "version": "1.0.0",
      "enabled": true,
      "parameters": { "model": "DA3-BASE", "quantization": "q4_k" },
      "dependencies": []
    },
    {
      "id": "TextureStationarizer",
      "version": "1.0.0",
      "enabled": true,
      "parameters": { "patchSize": 256, "overlap": 32 },
      "dependencies": ["DepthProvider.DA3"]
    }
  ],
  "hardware": {
    "cpu": "AMD EPYC 7742",
    "gpu": "NVIDIA A100 40GB",
    "ram": "256GB",
    "vram": "40GB",
    "runtime": "modal"
  },
  "seeds": {
    "global": 12345,
    "perOperator": { "TextureStationarizer": 42 }
  },
  "environment": {
    "nodeVersion": "20.15.0",
    "dependencies": { "vite": "5.4.0", "three": "0.160.0" },
    "envVars": { "CUDA_VISIBLE_DEVICES": "0" }
  },
  "budget": {
    "maxTimeMs": 3600000,
    "maxVRAM": "38GB",
    "maxRAM": "200GB",
    "maxStorage": "10GB"
  }
}
```

### 3. Operator Registry
Each operator registered with metadata:
```javascript
{
  id: 'TextureStationarizer',
  version: '1.0.0',
  description: 'Turn photographed patch into tileable texture',
  category: 'texture',
  inputs: ['rgb_patch', 'mask', 'camera_pose'],
  outputs: ['tileable_texture', 'metadata'],
  parameters: { /* JSON Schema */ },
  defaultParameters: { patchSize: 256, overlap: 32 },
  dependencies: ['DepthProvider.DA3'],
  supportedSceneTypes: ['multi_rgb', 'single_rgb'],
  runtime: { cpu: true, gpu: true, memory: '2GB' },
  license: 'ACADEMIC',
  substitutes: [],
  rescues: ['manual_texture_cleanup'],
  synergies: ['MultiViewTextureFuser', 'PaletteNormalizer'],
  experimentRequired: true,
  priority: 0
}
```

### 4. Experiment Run Record (run.json)
```json
{
  "runId": "RUN-20260820-143022-A7F3",
  "parentRunId": "RUN-20260820-120000-1A2B",
  "goal": "SHOWCASE",
  "scene": { ... },
  "operators": [ ... ],
  "hardware": { ... },
  "seeds": { ... },
  "environment": { ... },
  "budget": { ... },
  "startTime": 1724176222000,
  "endTime": 1724178022000,
  "status": "completed",
  "error": null,
  "metrics": {
    "totalDuration": { "value": 1800000, "unit": "ms" },
    "timing.DepthProvider.DA3": { "value": 45000, "unit": "ms" },
    "memory.peak.vram": { "value": 12000, "unit": "MB" },
    "geometry.surface_error": { "value": 0.023, "unit": "m" },
    "visual.held_out_similarity": { "value": 0.89, "unit": "ssim" }
  },
  "artifacts": {
    "depth_maps": { "hash": "abc123...", "retention": "EPHEMERAL", "size": 52428800 },
    "stationarized_textures": { "hash": "def456...", "retention": "KEEP", "size": 10485760 }
  },
  "provenance": [
    { "type": "operator", "id": "DepthProvider.DA3", "inputHash": "scene_abc", "outputHash": "depth_def", "timestamp": 1724176267000 },
    { "type": "artifact", "stageName": "depth_maps", "hash": "abc123...", "retention": "EPHEMERAL", "timestamp": 1724176267000 }
  ],
  "cost": { "computeMs": 1800000, "estimatedCostUsd": 2.45 }
}
```

### 5. Evaluation Packet (eval_report.json)
Small, no heavy artifacts:
```json
{
  "runId": "RUN-20260820-143022-A7F3",
  "goal": "SHOWCASE",
  "overallScore": 0.87,
  "dimensionScores": {
    "GEOMETRY": 0.82,
    "CONSISTENCY": 0.91,
    "FUNCTION": 0.75,
    "WORLD_TRUTH": 0.88,
    "VISUAL": 0.93,
    "STABILITY": 0.85,
    "PERFORMANCE": 0.72
  },
  "metrics": { ... },
  "weights": { "VISUAL": 0.35, "GEOMETRY": 0.20, ... },
  "timestamp": 1724178022000
}
```

### 6. Provenance Chain (provenance.json)
```json
[
  { "type": "config", "runId": "RUN-20260820-143022-A7F3", "hash": "config_sha256", "timestamp": 1724176222000 },
  { "type": "operator", "id": "DepthProvider.DA3", "inputHashes": ["scene_abc"], "outputHash": "depth_def", "durationMs": 45000, "timestamp": 1724176267000 },
  { "type": "artifact", "stageName": "depth_maps", "hash": "depth_def", "retention": "EPHEMERAL", "size": 52428800, "timestamp": 1724176267000 },
  { "type": "operator", "id": "TextureStationarizer", "inputHashes": ["depth_def", "rgb_ghi"], "outputHash": "tex_jkl", "durationMs": 120000, "timestamp": 1724176387000 },
  { "type": "artifact", "stageName": "stationarized_textures", "hash": "tex_jkl", "retention": "KEEP", "size": 10485760, "timestamp": 1724176387000 },
  { "type": "evaluation", "runId": "RUN-20260820-143022-A7F3", "overallScore": 0.87, "timestamp": 1724178022000 }
]
```

---

## Directory Structure

```
runs/
├── RUN-20260820-143022-A7F3/
│   ├── config.json              # GOLD
│   ├── run.json                 # GOLD
│   ├── provenance.json          # GOLD
│   ├── metrics.json             # KEEP
│   ├── eval_report.json         # KEEP
│   ├── artifacts/
│   │   ├── manifest.json        # GOLD
│   │   ├── depth_maps/
│   │   │   └── abc123...bin     # EPHEMERAL
│   │   └── stationarized_textures/
│   │       └── def456...png     # KEEP
│   ├── probes/
│   │   ├── probe_entry.png      # KEEP
│   │   └── probe_center.png     # KEEP
│   ├── contact_sheet.png        # KEEP
│   ├── held_out/
│   │   ├── view_D.png           # KEEP
│   │   └── view_E.png           # KEEP
│   └── logs/
│       ├── stdout.log           # EPHEMERAL
│       └── timing.json          # EPHEMERAL
```

---

## Artifact Cache (Content-Addressed)

```
.shaded-cache/
├── hot/           # EPHEMERAL (24h TTL)
│   └── ab/
│       └── abc123...
├── warm/          # KEEP / FORENSIC (30-90d)
│   └── de/
│       └── def456...
├── cold/          # GOLD (forever)
│   └── 12/
│       └── 123456...
├── manifest.json  # Hash -> { path, retention, refCount, lastAccess }
└── index.json     # Secondary indexes
```

**Deduplication Example:**
```
PHOTO → DA3 → POINT_CLOUD (hash ABC123)
         ├─ experiment 1 (uses ABC123)
         ├─ experiment 2 (uses ABC123)
         ├─ experiment 3 (uses ABC123)
         └─ experiment 4 (uses ABC123)
```
ABC123 computed once, shared by 4 experiments.

---

## Experiment Funnel (5 Levels)

| Level | Name | Scope | Cost | Automation |
|-------|------|-------|------|------------|
| L1 | Deterministic Metrics | Every run | ~ms | Full |
| L2 | Probe Views | Every run | ~seconds | Full |
| L3 | Held-Out Views | Multi-view scenes | ~minutes | Full |
| L4 | Perceptual Model | Ambiguous cases | ~minutes | Semi-auto |
| L5 | Human Blind | Small subset | ~hours | Manual |

**L1 Metrics (every run):**
- Geometry: surface error, normals, scale, topology
- World Truth: observed ratio, free-space violations, hallucination
- Performance: time, VRAM, RAM, storage
- Stability: frame shimmer, LOD pops

**L2 Probe Views (every run):**
- Standardized camera positions (entry, center, corner, etc.)
- SSIM, LPIPS, edge stability vs reference renders

**L3 Held-Out (when available):**
- Withhold views D, E from reconstruction
- Render D', E' and compare to real D, E
- Silhouette IoU, feature correspondence, occlusion ordering

**L4 Perceptual (ambiguous):**
- CLIP/DreamSim comparison for close calls
- Only when L1-L3 can't distinguish

**L5 Human (subset):**
- Blind A/B comparison
- 10-20 runs per major decision point

---

## Experiment Types

| Type | Design | Purpose |
|------|--------|---------|
| **FULL REFERENCE** | All operators enabled | Upper bound |
| **SINGLE ABLATION** | FULL - X | Necessity of X |
| **SINGLE ADDITION** | BASE + X | Sufficiency of X |
| **SYNERGY** | BASE, BASE+A, BASE+B, BASE+A+B | Interaction A×B |
| **RESCUE** | Cheap A, Cheap A + targeted B, Expensive ref | Can cheap rescue expensive? |
| **SUBSTITUTION** | A vs B under conditions | When to use which |
| **REPRESENTATION** | Same world, different budgets | GOLD/DESKTOP/WEB/MOBILE |
| **PARAMETER REDUCTION** | Reduce params of X | Minimal viable config |
| **QUANTIZATION** | FP32 → FP16 → INT8 | Precision vs quality |
| **HARDWARE TARGET** | Desktop / Web / Mobile | Deployment target |
| **NEGATIVE CONTRIBUTION** | Measure harm | Trade-offs |

---

## Scaling to 50,000 Runs

### Storage (3-tier)
| Tier | Retention Classes | Est. 50k Runs |
|------|-------------------|---------------|
| HOT (SSD) | EPHEMERAL | ~500 GB (24h rolling) |
| WARM (SSD) | KEEP, FORENSIC | ~2 TB |
| COLD (HDD/S3) | GOLD | ~10 TB |

### Compute
- Screening designs for operator selection
- Fractional factorial for parameter spaces
- Latin hypercube for continuous params
- Bayesian optimization for Pareto front
- Active learning for uncertainty sampling

### Metadata Query
```sql
-- Find all runs using TextureStationarizer with DA3-BASE
SELECT runId, overallScore FROM eval_report 
WHERE operators @> '[{"id": "TextureStationarizer"}]'
AND operators @> '[{"parameters": {"model": "DA3-BASE"}}]';
```

---

## Quality/Cost Predictors (Phase 8+)

### Training Data Schema
```json
{
  "sceneDescriptor": { "type": "indoor_hall", "complexity": 0.7, "views": 120 },
  "goal": "SHOWCASE",
  "hardware": { "gpu": "A100", "vram": "40GB" },
  "operatorConfig": [
    { "id": "DepthProvider.DA3", "params": { "model": "DA3-BASE" } },
    { "id": "TextureStationarizer", "params": { "patchSize": 256 } }
  ],
  "qualityVector": { "geometry": 0.82, "visual": 0.93, ... },
  "costVector": { "computeMs": 1800000, "vram": 12000, "storage": 62 },
  "failures": [],
  "relationships": {
    "TextureStationarizer": { "synergy": ["MultiViewTextureFuser"], "rescues": [] }
  }
}
```

### Predictor Targets
- `QualityPredictor(scene, config) → qualityVector`
- `CostPredictor(hardware, config) → costVector`
- `FailurePredictor(scene, config) → failureProbability`

### Optimization
```
maximize Σ(weight_i × quality_i)
subject to cost_i ≤ budget_i
```

---

## Modal Integration (Cloud GPU)

### Run Submission
```bash
modal run shaded/experiment.py \
  --config runs/RUN-20260820-143022-A7F3/config.json \
  --output runs/RUN-20260820-143022-A7F3/
```

### Automatic Instrumentation
- Wrapper captures: stdout, stderr, timing, memory, GPU utilization
- Artifacts auto-uploaded to cache with content-addressing
- Evaluation pipeline runs automatically on completion
- Failed runs auto-promoted to FORENSIC

---

## Failure Handling

### Automatic FORENSIC Promotion
Triggers:
- Run status = 'failed'
- WORLD_TRUTH score < 0.3
- Unexpected metric regression vs parent
- Operator contradiction detected

### Forensic Artifacts Retained
- Full intermediate stacks
- Debug logs
- Memory dumps (if enabled)
- Operator internal states

---

## Integration Points

### SHADED Core
- `ExperimentRun` class in `src/experiment/core.js`
- `ArtifactCache` for content-addressed storage
- `OperatorRegistry` for operator metadata

### Pipeline
- `KoelnmessePipeline` emits `ExperimentRun` per stage
- Stage outputs → artifacts with provenance
- Evaluation pipeline runs on completion

### CI/CD
- GitHub Actions runs synthetic benchmarks on PR
- Modal runs for major version bumps
- Results stored in `runs/` with Git LFS for GOLD artifacts

---

## Implementation Status

| Component | Status | File |
|-----------|--------|------|
| Run ID generation | ✅ | `src/experiment/core.js` |
| Content hashing | ✅ | `src/experiment/core.js` |
| ExperimentRun class | ✅ | `src/experiment/core.js` |
| ArtifactCache | ✅ | `src/experiment/core.js` |
| OperatorRegistry | ✅ | `src/experiment/core.js` |
| EvaluationPipeline | ✅ | `src/experiment/evaluation.js` |
| Retention policies | ✅ | `src/experiment/retention.js` |
| RunLifecycleManager | ✅ | `src/experiment/retention.js` |
| Synthetic benchmarks | ✅ | `src/experiment/evaluation.js` |
| Modal integration | 📋 | Planned |
| Quality predictors | 📋 | Phase 8 |
| Active learning | 📋 | Phase 8 |