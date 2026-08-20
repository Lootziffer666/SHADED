# Retention and Artifact Specification

> Content-addressed artifact storage, lifecycle management, retention classes,
> and evaluation packet schema. Ensures reproducible experiments and
> recoverable provenance.

---

## 1. Content-Addressed Storage

All artifacts are stored in a content-addressable layout rooted at
`artifacts/` with SHA-256 as the canonical key.

### 1.1 Path Convention

```
artifacts/
├── by-sha256/
│   ├── ab/
│   │   └── cdef1234567890...          # actual file content
│   └── 12/
│       └── 3456abcd...                # another content hash
├── run-20260820-190600Z/             # GOLD freeze run (permanent)
│   ├── exp-001/
│   │   ├── result.json
│   │   ├── inputs/                   # symlinks to by-sha256
│   │   ├── outputs/                  # symlinks to by-sha256
│   │   └── logs/
│   └── metadata.json
├── pass/                             # PASS retention class (90d)
│   ├── exp-042/
│   │   └── result.json
├── fail/                             # FAIL retention class (30d)
├── error/                            # ERROR retention class (14d)
├── teacher/                          # TEACHER retention class (180d)
└── reference/                        # REFERENCE retention class (permanent)
```

### 1.2 Hash Computation

Every file written to `artifacts/` is hashed before storage:

```bash
# Files are stored by content hash, not by filename
sha256sum <file> | awk '{print $1}'
# Path: artifacts/by-sha256/${hash:0:2}/${hash:2}
```

Filenames in experiment `outputs` arrays are **logical names** that map to
hash paths via `result.json.outputs`.

### 1.3 Determinism Check

Re-running an experiment must produce bits-identical outputs:

```bash
result.json:
  "artifacts": [
    {
      "logicalName": "depth_v3.png",
      "sha256": "a1b2c3...",
      "size": 12582912,
      "storagePath": "by-sha256/a1/b2c3...",
      "deterministic": true
    }
  ]
```

If `deterministic: false`, the artifact is flagged for review.

---

## 2. Retention Classes

| Class | TTL | Cleanup policy | Content | Use case |
|---|---|---|---|---|
| `GOLD` | infinite | never | GOLD freeze artifacts + GOLD_FREEZE.md + CURRENT_STATE_AUDIT.md | Baseline reference |
| `PASS` | 90 days | cron `artifacts/pass/*` mtime +90d | Passing experiment outputs, ranking reports, comparison videos | Active research operators |
| `FAIL` | 30 days | cron `artifacts/fail/*` mtime +30d | Failed metric runs, partial outputs | Short-term debugging |
| `ERROR` | 14 days | cron `artifacts/error/*` mtime +14d | Crash dumps, timeout logs, missing outputs | Error triage |
| `TEACHER` | 180 days | cron `artifacts/teacher/*` mtime +180d | Teacher model outputs, reference predictions | Model distillation |
| `REFERENCE` | infinite | never | Published benchmarks, paper reproductions, GOLD_FREEZE.md | Long-term reference |

### 2.1 TTL Enforcement

Cleanup is driven by a cron job (or `node tools/retention-sweep.js`):

```bash
node tools/retention-sweep.js --age pass:90d fail:30d error:14d teacher:180d
```

- Files are moved to `artifacts/archive/<timestamp>/` before deletion
- A 24h grace period applies before permanent deletion
- `GOLD` and `REFERENCE` classes are never swept

### 2.2 Promotion Policy

| From → To ↓ | PASS | FAIL | ERROR | TEACHER | REFERENCE |
|---|---|---|---|---|---|
| GOLD | — | — | — | — | — |
| FAIL | operator improved, new run passes | — | — | — | manual review |
| ERROR | fixed, new run passes | — | — | — | manual review |
| PASS | — | demoted (new regression) | — | — | benchmark result |
| TEACHER | — | — | — | — | model published |

---

## 3. Evaluation Packet

An **evaluation packet** is a self-contained bundle that another researcher can
extract and immediately reproduce a result. Generated per experiment:

```
packet-exp-001.zip
├── packet.json                  # packet manifest
├── experiment.json            # ExperimentCard (verbatim)
├── metadata/
│   ├── environment.json        # node/npm versions, OS, CPU, RAM
│   ├── git.json               # commit + tree hash
│   └── deps.txt               # npm list + pip list + operator deps
├── inputs/
│   ├── file_00000000974871f49fe71f6b456f9579.png  # scene image
│   └── inputs.sha256          # checksums + source paths
├── outputs/
│   ├── depth_v3.png
│   ├── depth_v2.png
│   └── comparison.mp4
├── results/
│   └── result.json           # full run result
├── scripts/
│   ├── run.sh                # reproduction shell script
│   └── reproduce.js          # Node reproduction entrypoint
└── logs/
    ├── operator.log
    ├── engine.log
    └── console-capture.txt
```

### 3.1 `packet.json`

```jsonc
{
  "packetId": "pkt-20260820-190600Z-exp-001",
  "experimentId": "exp-001",
  "runId": "run-20260820-190600Z",
  "createdAt": "2026-08-20T19:06:00Z",
  "gitRef": {
    "repo": "SHADED",
    "commit": "b341f7f46390216e81c97e01259a573fd2e9896c",
    "tree": "ff1d67176d0a99c715416e29cc31098aad1a0147"
  },
  "contentHash": "a1b2c3d4...",        // SHA-256 of entire packet contents
  "reproducible": true,
  "signature": "sha256:..."             // optional GPG signature
}
```

### 3.2 Reproduction Script (`run.sh`)

```bash
#!/bin/bash
# Auto-generated by tools/orchestrate.js
cd $(dirname "$0")/..
git checkout b341f7f46390216e81c97e01259a573fd2e9896c
npm ci
node tools/run-operator.js --card experiment.json --input inputs/ --output outputs/
node tools/evaluate.js --result results/result.json --expected-classes tools/expected-classes.json
```

---

## 4. Artifact Provenance Tracking

Every artifact has a **provenance chain** recorded in `result.json`:

```jsonc
{
  "sha256": "a1b2c3d4...",
  "logicalName": "depth_v3.png",
  "producedBy": {
    "operator": "DepthProvider",
    "version": "depth_anything_v3",
    "seed": 42,
    "gitRef": { "commit": "b341f7f...", "tree": "ff1d6..." }
  },
  "inputs": [
    {
      "sha256": "9f8e7d6c...",
      "logicalName": "file_00000000974871f49fe71f6b456f9579.png"
    }
  ],
  "deterministic": true,
  "metrics": {
    "depth_mse_mm": 18.3,
    "depth_edge_f1": 0.74
  }
}
```

### 4.1 Provenance Graph

The `ProvenanceTracker` builds a directed acyclic graph:

```
   file_00000000...png
         │
         ▼
   DepthProvider (DA-V3)
         │
         ▼
   depth_v3.png ───► EvaluationEngine ───► result.json
         │
         ▼
   comparison.mp4
```

Every node is content-addressed; the graph is serialized as
`artifacts/<runId>/<expId>/provenance.json`.

---

## 5. Cleanup Cron Configuration

```cron
# Run daily at 02:00 UTC
0 2 * * * cd /path/to/shaded && node tools/retention-sweep.js \
  --age pass:90d fail:30d error:14d teacher:180d \
  --archive-days 1 \
  --dry-run=false \
  --log-file logs/retention-sweep.log
```

### 5.1 `--archive-days`

Files marked for deletion are moved to `artifacts/archive/` and kept for this many
days before permanent deletion. Default: 1 day.

### 5.2 Size Budget

If `artifacts/` exceeds 10 GB (configurable), oldest non-GOLD/REFERENCE files
are swept first, regardless of TTL.

```jsonc
// tools/retention-config.json
{
  "totalBudgetGb": 10,
  "classes": {
    "GOLD": { "ttlDays": 0, "sweepable": false },
    "PASS": { "ttlDays": 90, "sweepable": true },
    "FAIL": { "ttlDays": 30, "sweepable": true },
    "ERROR": { "ttlDays": 14, "sweepable": true },
    "TEACHER": { "ttlDays": 180, "sweepable": true },
    "REFERENCE": { "ttlDays": 0, "sweepable": false }
  }
}
```

---

## 6. Cross-Repository Artifact References

Artifacts may reference content from SWIFT, BEUTELTIER, or TRIVIUM repos:

```jsonc
{
  "externalRefs": [
    {
      "repo": "lootziffer666/swift",
      "commit": "swift-abc123",
      "artifact": "sprite_sheets/character_walk.json",  // manifest
      "sha256": "d4e5f6...",
      "usage": "input to ActorPlacer experiment"
    }
  ]
}
```

External references are recorded but not fetched during retention sweep.
The `tools/orchestrate.js` runner fetches them fresh from the pinned commit.

---

## 7. Non-Goals

- The artifact store is **not** a package registry (npm/pypi). Use external
  package managers for operator dependencies.
- The packet format is **not** a deployment artifact — it is for evaluation
  and reproducibility only.
- `GOLD` class artifacts must never be swept, even if `artifacts/` exceeds
  the size budget.
