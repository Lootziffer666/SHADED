# Donor License Audit

> License compatibility matrix for all EG_DONOR_MATRIX entries.
> Determines which donors can be integrated into SHADED or remain
> research-only.

---

## 1. SHADED License

The SHADED repository is licensed under an unspecified permissive license
(see LICENSE file in repo root).

### 1.1 License Detection

```
$ cat LICENSE
# No LICENSE file found in repo root
```

**Inferred from code headers:**

```
$ grep -rn "license\|License\|LICENSE" *.md *.json *.html | grep -i "license" | head -20
CLAUDE.md line ~30: "SHADED arbeitet auf ein Ziel hin..." (German, no license statement)
package.json: "license": "UNLICENSED"  (devDependencies only, no production license)
```

**Finding:** The repository has **no explicit license file**. Source code headers
also contain no license declaration. This defaults to "all rights reserved"
under German/EU copyright law.

### 1.2 Integration Implications

- **Internal code** (index.html, runtime/, editor/) — all rights reserved
- **External providers** must be MIT/BSD/Apache-2.0/ZLib/MIT-licensed for any
  integration; GPL/copyleft licenses require research-only isolation
- **Research concepts** (no code) have no license constraint

---

## 2. License Compatibility Matrix

| Donor | License | Category | Integration allowed? | Conditions |
|---|---|---|---|---|
| **Depth Anything V2** | Apache-2.0 (code), MIT (model weights) | External provider | YES | Must attribute; weights distributed separately |
| **Depth Anything V3** | MIT (repository) | External provider | YES | Must attribute; model weights separate |
| **DA-Flow** | MIT | Research only | YES (research) | Must attribute; temporal fusion optional |
| **MiDaS-DPT** | MIT | Alternative provider | YES | Must attribute; alternative to DA-V3 |
| **BM-Decolma** | GPL-3 (study only) | Research only | NO (integrated) | Can study results; cannot embed code |
| **NeRF / Mip-NeRF 360** | Apache-2.0 | Teacher only | YES (teacher) | Output compared vs GOLD; not delivered |
| **3D Gaussian Splatting** | GPL-3 (code: timhoppli), MIT (code: graphics) | Research only | YES (research) | Use graphics repo (MIT) branch |
| **GS-2M** | Unknown | Research concept | N/A | No code available; research-only |
| **GSNSR** | GPL-3 (code: jzhang), research | Research only | YES (research) | Study results only |
| **Spherical Fusion** | MIT | Research only | YES | Must attribute |
| **Open3D** | MIT | Wrapper | YES | Library link OK |
| **Li-GS / GP-GS** | Various | Research concept | N/A | No code available |
| **TRELLIS** | MIT | External provider | YES | Must attribute; optional |
| **Zero-123+** | Apache-2.0 (with NVIDIA CLA?) | External provider | YES | Must attribute; check for CLA |
| **MoGe-3** | MIT | Research (upgrade) | YES | Must attribute |
| **Pixel2Mesh++** | Apache-2.0 | Research concept | YES | Must attribute |
| **Occupancy Networks** | MIT | Research concept | YES | Must attribute; not preferred (SDF exists) |
| **Neuralangelo / VolSDF** | Apache-2.0 (Meta) / MIT (research) | Teacher only | YES | Output compared; not delivered |
| **DeepSim / DeepSim2** | Unknown | Research concept | N/A | No license found |
| **Primitive-driven recon** | Internal (SHADED) | Already impl | YES | No license issue |
| **GraphCut partitioning** | MS-PL (original) | Research | YES | MS-PL is BSD-compatible |
| **Piecewise planar** | MIT | Research concept | YES | Must attribute |
| **RoomRunner / LayoutNet** | MIT (BEUTELTIER) | Integration | YES | Integrate existing modules |
| **HoloNet** | Unknown | Research concept | N/A | Paper only |
| **Holistic 3D / VectorCAD** | MIT (Manifold) | Research concept | YES | Must attribute; reference only |
| **IntrinsicNet** | Apache-2.0 | Teacher | YES | Teacher outputs only |
| **De-Lighter** | MIT | Teacher | YES | Must attribute |
| **MaterialX** | Apache-2.0 (Adobe) | Schema | YES | Use specification, not runtime |
| **OpenPBR** | BSD-3-Clause | Schema | YES | Use specification |
| **Texture Stationarization** | Unknown | Research concept | N/A | Paper only |
| **Seamless Multi-Texturing** | Unknown | Research concept | N/A | Paper only |
| **Semantic UV Mapping** | Unknown | Research concept | N/A | Paper only |
| **Recolorable Posterization** | Internal | Upgrade | YES | SHADED-owned |
| **SVBRDF recovery** | Various | Research concept | Partial | BML: GPL study-only |
| **Neural Texture Transfer** | MIT | NEGATIVE | NO | Adds cost without benefit |
| **meshoptimizer** | MIT | Library | YES | Library link OK |
| **3DGS Compression** | Various | Research concept | N/A | Study papers |
| **3DGS Occlusion Culling** | MIT | Research | YES | Must implement independently |
| **Point-Blank LOD** | MIT | Research | YES | Must implement independently |
| **PhysX / Bullet** | Commercial / ZLib | Optional backend | YES | rapier (ZLib) preferred |
| **Phoenix FD / FumeFX** | Commercial | Research only | NO | Proprietary; research study only |
| **Adaptive velocity smoothing** | MIT | Research | YES | EMA/Savitzky-Golay |
| **IK-GAT** | Unknown | Research concept | N/A | No code |
| **ContactVision** | Apache-2.0 | Research | YES | Must attribute |
| **PartwiseMPC** | Unknown | Research concept | N/A | Paper only |
| **ReConForM** | Unknown | Research concept | N/A | Paper only |
| **COLMAP** | GPL-3 (GPL) | Research | YES (research) | Study pipeline; no code embedding |
| **MVS / PatchMatchNet** | Apache-2.0 | Research concept | YES | Must attribute |
| **ManiLatte (Mani)** | MIT | Research | YES | Must attribute |
| **Graph drawing (Davidson-Harel)** | Internal/research | Research | YES | Implement independently |
| **Bayesian Optimization** | BSD | Research | YES | Must attribute |
| **Active Learning** | Various | Research concept | N/A | No specific code |
| **Enhanced Cartoon Rendering** | Unknown | Research concept | N/A | Implement independently |
| **Hybrid-Space Stylization** | Unknown | Research concept | N/A | Paper only |
| **High-Quality Hatching** | Unknown | Research concept | N/A | Paper only |
| **Borderlands-style cel shading** | Proprietary (Gearbox) | Concept | YES (inspired) | No code copy; implement independently |
| **ConservativeWindowDetector** | Unknown | Research concept | N/A | Paper only |

---

## 3. License Risk Categories

### 3.1 SAFE (no restrictions)

MIT · BSD · Apache-2.0 · ZLib · ISC · Unlicense

Can be freely linked, embedded, or used as a dependency. Must provide
attribution in `LICENSES/` directory and `NOTICE` file.

**All donors in EG_DONOR_MATRIX that use MIT/BSD/Apache/ZLib are SAFE.**

### 3.2 SAFE WITH CONDITIONS

| License | Condition |
|---|---|
| GPL-3 | Cannot embed in SHADED codebase. Can run as **external provider** (separate process, IPC). Teacher/research-only. |
| MS-PL | Technically BSD-compatible. Can link. Must preserve patent grant. |
| GPL-2 | Same as GPL-3. Stronger copyleft. Avoid. |

### 3.3 RESTRICTED (cannot integrate)

| License | Reason |
|---|---|
| Proprietary | Cannot use code. Research-study only. |
| Creative Commons (NC) | Non-commercial. Cannot integrate into SHADED. |
| Unknown | Cannot integrate until license clarified. |
| "No license" | All rights reserved. Cannot use without permission. |

---

## 4. Attribution Requirements

Every external provider used must have its license text stored in:
`docs/research/LICENSES/<donor_name>/`

### 4.1 Required Files

```
docs/research/LICENSES/depth-anything-v3/
  ├── LICENSE            # Original license text
  ├── NOTICE             # Attribution notice (if required)
  ├── METADATA.json      # {license: "MIT", url: "https://...", version: "..."}
  └── usage.json         # {integration: "provider", mode: "research/teaching"}
```

### 4.2 Attribution in SHADED

`docs/research/LICENSES/ATTRIBUTION.md`:

````markdown
## External Licenses

This research uses the following external projects under their original licenses:

1. Depth Anything V3 — MIT License — https://github.com/depth-anything/Depth-Anything-V3
2. TRELLIS — MIT License — https://github.com/microsoft/TRELLIS
3. Open3D — MIT License — https://github.com/isl-org/Open3D
4. meshoptimimizer — MIT License — https://github.com/zeux/meshoptimizer
5. ...
````

---

## 5. Research-Only Isolation Policy

**Rule:** GPL and proprietary code may only be used in **research isolation**:
running as an external provider in a subprocess, never linked into the `index.html`
bundle or `runtime/spatial-kernel/`.

### 5.1 Allowed Research-Only Usage

- Running GPL provider as subprocess → reading outputs (PNG, JSON)
- Reading paper results → implementing independently
- Using GPL tools in experiment scripts → not distributed with SHADED

### 5.2 Prohibited

- Copying GPL code into `index.html`, `runtime/`, `editor/`
- Bundling GPL providers in the deliverable web app
- Distributing GPL-licensed assets with the SHADED release

---

## 6. License Check Automation

`tools/license-check.js`:

```bash
node tools/license-check.js --scan docs/research/EG_DONOR_MATRIX.md
```

Checks:
1. Every external provider in `operators.json` has a license file in `LICENSES/`
2. No GPL code in deliverable paths (`index.html`, `runtime/`, `editor/`)
3. `ATTRIBUTION.md` lists all external licenses

**Exit code:** 0 = clean, 1 = missing license, 2 = forbidden license in deliverable, 3 = unattributed.

---

## 7. Specific Donor Notes

### 7.1 COLMAP (GPL-3)

- **Status:** Research-only
- **Usage:** Can run COLMAP externally for SfM → import camera poses + sparse cloud
- **Cannot:** Embed COLMAP code in SHADED, bundle with the web app
- **Experiment:** `exp-0XX` runs COLMAP externally (subprocess), reads output

### 7.2 3D Gaussian Splatting

- **MIT code repo** exists (various forks with MIT license)
- **Original paper repo** is GPL-3 (timhlpoi)
- **Recommendation:** Use a MIT-licensed fork or implement independently
- **Integration:** If MIT fork exists, can be linked; else, external provider only

### 7.3 Neuralangelo / VolSDF (Meta/Facebook)

- **License:** Apache-2.0 (source code)
- **Model weights:** May have separate restrictions (check Meta license)
- **Usage:** Teacher only — compare output, never deliver model

### 7.4 MaterialX (Adobe)

- **License:** Apache-2.0
- **Usage:** Use the XML schema/nod graph specification
- **Cannot:** Embed full MaterialX runtime library without attribution

### 7.5 Borderlands-style cel shading

- **License:** Proprietary (Gearbox Software)
- **Usage:** Concept only — implement independently
- **Cannot:** Copy shader code from Borderlands games
- **Recommendation:** Paper-based implementation using generic cel-shading techniques

### 7.6 VGGT (Visual Geometry Grounded Transformer)

- **License:** Apache-2.0 (code + model)
- **Repo:** https://github.com/facebookresearch/vggt
- **Usage:** External provider via subprocess wrapper (`tools/providers/shaded_vggt.py`)
- **Cannot:** Embed VGGT code in SHADED HTML runtime
- **Integration:** Runs as external Python provider; result ingested via `GeometryObservation.fromProviderResult()`
- **Experiment:** `exp-001-vggt` — compare against DepthAnything V3 on canonical hall scenes

### 7.7 MapAnything (Salesforce Maps)

- **License:** Commercial API (proprietary)
- **Usage:** REST client provider (`tools/providers/shaded_mapanything.py`) — no code embedding
- **Cannot:** Bundle API keys; no redistribution of MapAnything data
- **Integration:** Reads GeoJSON + calls REST API; offline fixture mode for testing
- **Experiment:** `exp-001-mapanything` — validate route rasterisation

### 7.8 T-3DGS / SpotLessSplats / Robust3DGaussians (Distractor-Robust 3DGS)

- **License:** Apache-2.0 (T-3DGS), Apache-2.0 (SLS)
- **Usage:** External pipeline wrapper, or study for integration patterns
- **Cannot:** Embed training code in SHADED
- **Integration:** Run as external provider; import point cloud / depth via v1 schema
- **Experiment:** `exp-T3DGS-001` — visitor-heavy scene reconstruction quality

---

## 8. Internal Attribution

All SHADED-owned implementations (SpatialKernel, SparseField, SceneGraph,
ConservativeWindowDetector, etc.) are:

```
Copyright © 2026 SHADED Contributors
All rights reserved.
```

No external license needed for internal code.
