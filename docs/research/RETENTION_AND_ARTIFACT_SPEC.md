# SHADED Retention & Artifact Specification

**Status:** IMPLEMENTIERT (Phase 1 — Experiment Infrastructure)  
**Source code:** `src/experiment/core.js`, `src/experiment/evaluation.js`, `src/experiment/retention.js`  
**Test coverage:** `tools/test-texture-operators.mjs` (12 assertions PASS)

Der Experiment-Framework speichert Artefakte in einem **content-addressed Cache** und verwendet **Retention-Klassen**, um die Speichernutzung bei bis zu 50.000 Runs zu skalieren. Die Implementierung lebt in `src/experiment/retention.js`, die Spezifikation liegt hier.

---

## 1. RUN-ID-Format

```
RUN-YYYYMMDD-HHMMSS-XXXX
```

- **`YYYYMMDD-HHMMSS`**: UTC-Zeitstempel (nicht lokal)
- **`XXXX`**: 4 Hex-Zeichen, zufällig (65536 Möglichkeiten)
- **Regex**: `^RUN-\d{14}-[0-9A-F]{4}$` (definiert in `ExperimentConfigSchema`)
- **Beispiel**: `RUN-20260820143005-A3F2`

Runs sind **nicht** sequenziell nummeriert — die Kombination aus Zeitstempel + Zufall verhindert Kollisionen bei parallelen Runs.

---

## 2. RETENTION-KESSEN

### 2.1 Klassen

| Klasse | TTL | Auto-Promotion | Zweck |
|--------|-----|----------------|-------|
| `EPHEMERAL` | 24h | Nein | Schwere Zwischenergebnisse (Tiefenkarten, Punktwolken) — automatisch gelöscht |
| `KEEP` | 30 Tage | Ja (wenn Score > 0.7) | Interessante Pareto-Ergebnisse — manuell oder automatisch bewahrt |
| `GOLD` | Permanent | Nein | Vollständige, reproduzible Referenz — Commit-Referenz |
| `FORENSIC` | 14 Tage | Nein | Unerwartete Fehler, Widersprüche, Synergien — für Debugging |

### 2.2 Automatische Promotion-Regeln

Ein Artikel wird **automatisch** auf `KEEP` promotet, wenn **alle** Bedingungen erfüllt sind:
1. **Score > 0.7** (aggregierter Qualitäts-Score aus `evaluation.js`)
2. **Alle 7 Qualitätsdimensionen** >= 0.3
3. **Exit-Code = 0** (keine Konsolen- oder GL-Fehler)
4. **Runtime < 120s** (Performance-Grenze)

Artikel, die **keine** dieser Regeln erfüllen, werden nach 24h automatisch gelöscht.

### 2.3 Storage-Tiers

| Tier | Medium | Zweck |
|------|--------|-------|
| `HOT` | NVMe SSD | Aktive Experimente (<= 100 Runs) |
| `WARM` | SATA SSD | Recent KEEP/FORENSIC (24h–30d) |
| `COLD` | HDD / Object Storage | GOLD-Archive (> 30d) |
| `REMOTE` | Cloud Bucket | Langzeit-GOLD (nur Metadaten lokal) |

---

## 3. ARTEFAKT-KATEGORIEN

### 3.1 Schwerlast-Artefakte (automatischer Cleanup)

| Kategorie | Standard-Retention | Typische Größe |
|-----------|-------------------|----------------|
| `DEPTH_MAP` | `EPHEMERAL` | 10–50 MB |
| `POINT_CLOUD` | `EPHEMERAL` | 50–500 MB |
| `DENSE_MESH` | `EPHEMERAL` | 100 MB – 2 GB |
| `GAUSSIAN_MODEL` | `EPHEMERAL` | 50 MB – 1 GB |
| `TEXTURE_ATLAS` | `EPHEMERAL` | 10–100 MB |
| `SDF_FIELD` | `EPHEMERAL` | 10–100 MB |
| `VOXEL_GRID` | `EPHEMERAL` | 50–200 MB |

### 3.2 Leichte Artefakte (immer behalten)

| Kategorie | Standard-Retention | Typische Größe |
|-----------|-------------------|----------------|
| `PARAMS_JSON` | `KEEP` | 2–5 KB |
| `METRICS_JSON` | `KEEP` | 5–20 KB |
| `SCREENSHOT_PNG` | `KEEP` (max 5 pro Run) | 500 KB – 5 MB |
| `SHADER_LOG` | `FORENSIC` | 10–100 KB |
| `CONSOLE_LOG` | `FORENSIC` | 5–50 KB |

### 3.3 Artefakt-Namen-Konvention

```
<cache_root>/<run_id>/<category>/<sha256>[.<ext>]
```

- **`cache_root`**: Standard `~/.shaded/experiments/` (über `SHADED_EXPERIMENT_CACHE` env override)
- **`run_id`**: z.B. `RUN-20260820143005-A3F2`
- **`category`**: z.B. `DEPTH_MAP`
- **`sha256`**: SHA-256 des Artefakt-Inhalts (content-adressiert, dedupliziert)
- **`.ext`**: nur für PNG/JSON-Artefakte (`.png`, `.json`)

**Beispiel**:  
`~/.shaded/experiments/RUN-20260820143005-A3F2/DEPTH_MAP/a1b2c3...e5.png`

---

## 4. INHALTS-ADRESSIERTE CACHE-UNG (ArtifactCache)

### 4.1 Prinzip

Jedes Artefakt wird nach seinem **Inhalt** (SHA-256) benannt und **dedupliziert**. Wenn zwei Runs dasselbe Ergebnis erzeugen, teilen sie denselben Cache-Eintrag. Das reduziert den Speicherverbrauch bei 50.000 Runs um bis zu 60%.

### 4.2 Implementierung

```js
// src/experiment/core.js
export function hashFile(filePath) {
  return fs.readFile(filePath).then(buf => createHash('sha256').update(buf).digest('hex'));
}
```

`ArtifactCache` (in `retention.js`):
- **`store(sourcePath, runId, category)`** → kopiert die Datei in `<cache>/<run>/<cat>/<sha256>`
- **`retrieve(runId, category, sha256)`** → gibt den lokalen Pfad zurück
- **`dedupStats()`** → gibt an, wie viele Artefakte dedupliziert wurden

### 4.3 Cache-Größe

- **HOT**: max. 10 GB (älteste `EPHEMERAL` werden LRU-evakuiert)
- **WARM**: max. 50 GB (nur `KEEP`/`FORENSIC`)
- **COLD**: unbegrenzt (nur `GOLD`)
- **REMOTE**: unbegrenzt (Metadaten nur lokal, Artefakte werden on-demand geladen)

---

## 5. LIFECYCLE-MANAGER (RunLifecycleManager)

### 5.1 Zustände

Ein Run durchläuft diese Zustände:

1. **`CREATED`** → Run-ID generiert, Config validiert
2. **`RUNNING`** → Operators ausgeführt, Artefakte sammeln
3. **`EVALUATED`** → Qualitätsmetriken berechnet
4. **`DECIDED`** → Retention-Klasse zugewiesen (automatisch oder manuell)
5. **`ARCHIVED`** oder **`PRUNED`** → Dauerhaft archiviert oder gelöscht

### 5.2 Policy-Engine

`RunLifecycleManager` wendet diese Policies an:

| Policy | Trigger | Aktion |
|--------|---------|--------|
| `ephemeralCleanup` | 24h nach `DECIDED` | Lösche alle `EPHEMERAL`-Artefakte |
| `autoPromotion` | Bei `DECIDED` | Promote zu `KEEP` wenn Score > 0.7 |
| `goldFreeze` | Manuell | Setze auf `GOLD`, kopiere nach `COLD` |
| `forensicPreserve` | Bei Error-Code ≠ 0 | Setze auf `FORENSIC`, bewahre Logs |

---

## 6. PROJECT-SCHEMA (Scene-Project-Schema)

### 6.1 Zweck

Ein **Project** ist eine JSON-Datei, die Parameter, Actors, Storyboard und Intrinsic-Metadaten enthält. Es **enthält keine Bild-Bytes** (wegen Binary-Include-Problemen in JSON). Bild-Dateien werden separat referenziert.

### 6.2 Schema (vereinfacht)

```json
{
  "version": "1.0.0",
  "scene": { "id": "dorf-kanon", "source": "file_...9748.png" },
  "params": { "dayNight": 0, "storm": 0.1, ... },
  "actors": [
    {
      "image": "actor1.png",
      "manifest": "actor1.json",
      "x": 0.5, "y": 0.6, "scale": 2,
      "anim": "walk", "depthLayer": "mid",
      "emissiveImage": "actor1_emissive.png"
    }
  ],
  "storyboard": [
    { "id": "act1", "dur": 8, "params": { "dayNight": 0.5 } }
  ],
  "intrinsic": {
    "provider": "material.intrinsic.retinex-baseline",
    "providerVersion": "1.0.0",
    "channelSetId": "intrinsic.v1",
    "provenance": "INFERRED",
    "confidence": 0.85,
    "colorSpace": { "albedo": "sRGB", "shading": "linear" },
    "strength": 0,
    "accepted": false
  }
}
```

### 6.3 Companion-Konvention

Liegt neben `bild.png` eine Datei `bild_shading.png` (8-Bit Grayscale, 128 = neutral), wird sie automatisch als **Intrinsic-Feld** geladen. Das ist **optional** — ein fehlender Companion ist **kein Fehler** (404 wird ignoriert).

---

## 7. SCALIERBARKEIT BEI 50.000 RUNS

### 7.1 Content-Addressed Storage

Durch SHA-256-Deduplizierung sinkt die Storage-Nutzung linear mit dem Anzahl eindeutiger Ergebnisse. Bei 50.000 Runs mit durchschnittlich 30% Duplikaten spart man ~15.000 Runs × 50 MB = **750 GB**.

### 7.2 Tiered Storage Migration

`RunLifecycleManager.migrateTier()` verschiebt Artefakte automatisch:
- Nach 24h: `HOT` → `WARM`
- Nach 30d: `WARM` → `COLD` (oder `REMOTE` bei `GOLD`)

### 7.3 Metadata-Only Mode

Für `GOLD`-Runs im `REMOTE`-Tier: Nur Metadaten (Params, Metrics, Screenshot) werden lokal gespeichert. Das schwere Artefakt (Mesh, Depth-Map) wird nur **on-demand** aus der Cloud geladen.

---

## 8. VERBINDUNG ZU ORCHESTRATION

Siehe `docs/ORCHESTRATION.md` für den vollständigen Orchestrator-Vertrag. Die Retention-Policy ist Teil des **`artifacts`**-Feldes im Orchestrator-Request:

```json
{
  "action": "createExperiment",
  "params": {
    "goal": "RESEARCH",
    "operators": ["texture-stationarizer"],
    "retentionHint": "FORENSIC"
  }
}
```

`retentionHint` ist ein **Vorschlag** — die Policy-Engine kann ihn überschreiben (z.B. wenn Score > 0.7 → `KEEP`).
