# Koelnmesse Reconstruction Pipeline

End-to-end pipeline for reconstructing Koelnmesse interiors from:
1. **Official GML geodata** (NRW Geobasis) → GIS base mesh
2. **COLMAP SfM/MVS** → Sparse + dense reconstruction from photos
3. **SHADED Depth Enhancement** → Material-aware depth refinement
4. **Blender Fusion** → Unified georeferenced 3D model

## Architecture

```
GML (NRW Geobasis)
    ↓
GIS Processor (tools/pipeline/gis/gml-processor.js)
    ↓
Buildings → OBJ + metadata.json
    ↓
┌─────────────────────────────────────┐
│         Blender (headless)          │
│  generateBaseMesh() → base.blend    │
└─────────────────────────────────────┘
    ↓
COLMAP (tools/pipeline/colmap/colmap-integration.js)
    ↓
Sparse (cameras.bin, images.bin, points3D.bin)
    ↓
Export → colmap_sparse.json
    ↓
Dense (optional) → depth maps
    ↓
┌─────────────────────────────────────┐
│       SHADED Headless               │
│  tools/pipeline/shaded/             │
│  shaded-headless.js                 │
│  enhanceDepths()                    │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│       Blender Fusion                │
│  alignToCOLMAP()                    │
│  fuseSHADEDDepths()                 │
└─────────────────────────────────────┘
    ↓
Export: GLTF / OBJ / USD
```

## Quick Start

```bash
# Install dependencies
npm install

# Build SHADED
npm run build

# Run full pipeline
node tools/pipeline/koelnmesse-pipeline.js \
  --gml-path ./data/koelnmesse.gml \
  --images-dir ./data/photos \
  --workspace-dir ./workspace \
  --output-dir ./output \
  --colmap-dense
```

Or use config file:

```bash
node tools/pipeline/koelnmesse-pipeline.js --config tools/pipeline/koelnmesse_config.json
```

## Requirements

- **Node.js** 20+
- **Blender** 3.6+ (in PATH or specify `--blender-executable`)
- **COLMAP** 3.8+ (in PATH)
- **Python** 3.10+ (for any preprocessing)

## Pipeline Stages

### 1. GIS Processing (`runGIS`)
- Parses GML (CityGML / ALKIS) from NRW Geobasis
- Extracts building geometries (LoD2 solids)
- Transforms CRS (ETRS89/UTM32N → target)
- Exports OBJ + metadata.json for Blender

### 2. COLMAP SfM (`runCOLMAP`)
- Feature extraction + exhaustive matching
- Sparse reconstruction (cameras.bin, images.bin, points3D.bin)
- Optional dense MVS (patch-match stereo + fusion)
- Exports JSON for pipeline integration

### 3. SHADED Enhancement (`runSHADED`)
- Runs SHADED's photo-first recipe on each image
- Material segmentation (7 classes: grass, foliage, roof, path, wood, window, water, rock)
- World laws (wet, rust, decay, etc.) for depth refinement
- Outputs enhanced depth maps + material masks

### 4. Blender Fusion (`runBlender`)
- `generateBaseMesh()`: Load GIS OBJs → base.blend
- `alignToCOLMAP()`: Register GIS mesh to COLMAP cameras/points
- `fuseSHADEDDepths()`: Project SHADED depths onto mesh
- Output: fused.blend

### 5. Export (`exportFinal`)
- GLTF (with materials, cameras)
- OBJ (geometry only)
- USD (for USD pipelines)

## Configuration

See `tools/pipeline/koelnmesse_config.json` for all options.

Key settings:
```json
{
  "gmlPath": "./data/koelnmesse.gml",
  "imagesDir": "./data/photos",
  "workspaceDir": "./workspace",
  "outputDir": "./output",
  "colmapOptions": { "dense": true },
  "shadedOptions": { "useMaterialSegmentation": true, "useWorldLaws": true }
}
```

## Resume Capability

Pipeline saves state to `workspace/pipeline_state.json`. Resume from any stage:

```bash
# Resume from SHADED stage
node tools/pipeline/koelnmesse-pipeline.js --resume --from-stage shaded

# Resume from Blender fusion
node tools/pipeline/koelnmesse-pipeline.js --resume --from-stage blender
```

## Output Structure

```
workspace/
├── gis/
│   ├── metadata.json
│   └── *.obj (one per building)
├── colmap/
│   ├── database.db
│   ├── sparse/0/ (cameras.bin, images.bin, points3D.bin)
│   ├── dense/ (MVS output)
│   ├── depth_maps/
│   └── colmap_sparse.json
├── shaded/
│   ├── shaded_depth_enhancement.json
│   └── shaded_fused.ply
└── *.blend (base, aligned, fused)

output/
├── koelnmesse.gltf
├── koelnmesse.obj
├── koelnmesse.usd
└── pipeline_report.json
```

## CRS Handling

Default: **EPSG:25832** (ETRS89 / UTM zone 32N) - standard for NRW.

GML source CRS is auto-detected from `srsName` attribute. All geometry is transformed to target CRS before Blender import.

## SHADED Integration Details

The SHADED headless engine uses:
- **Spatial Kernel** with all subsystems (SparseField, SceneGraph, WorldFields, WorldLawSolver)
- **PhotoFirstRecipe** for per-image depth + material estimation
- **Material Segmentation** (7 classes from canonical palette)
- **World Laws** applied as depth modifiers:
  - Wet surfaces → darker, more reflective
  - Rust accumulation → color shift + roughness
  - Decay → surface degradation
  - Frost → crystalline structure

## License

MIT - Part of SHADED project.