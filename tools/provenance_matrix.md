# Provenance Matrix — Provider Source Audit

**Dataset:** 991 starred repositories (258 in GPU/terrain/shader block)
**Total providers audited:** 123 (119 existing + 4 newly added)
**Date:** 2026-08-22

## Classification Legend

| Classification | Meaning |
|---|---|
| **VERIFIED** | `source` URL traces exactly to a starred repo |
| **PARTIAL** | Name/repo matches a starred repo but source URL has wrong org, or no source claimed but name matches |
| **QUESTIONABLE** | `source` URL claimed but NOT found in starred repos |
| **MISSING** | No source claimed, no match in starred repos (internal/baseline/paper/etc.) |

## Summary

| Classification | Count |
|---|---|
| VERIFIED | 49 |
| PARTIAL | 13 |
| QUESTIONABLE | 6 |
| MISSING | 55 |
| **TOTAL** | **123** |

## Newly-Added Providers (uncommitted — flagged for human review)

These 4 providers were added during the current audit pass. All have **PARTIAL** or **QUESTIONABLE** provenance due to incorrect source URLs. They are **NOT deleted** — preserved for human pruning decision per audit protocol.

| # | Provider | Tier | Category | Claimed Source | Correct Starred Repo | Classification | Issue |
|---|---|---|---|---|---|---|---|
| 1 | `astray_fx` | api | materials | https://github.com/Auburn/Fast |  | QUESTIONABLE | Source URL does not match any starred repo; name also has no direct starred match |
| 2 | `null_graph` | api | render | https://github.com/NullSoftware/NullGraph | flarelink-in/NullGraph | PARTIAL | repo 'NullGraph' in starred set at: flarelink-in/NullGraph; claimed org 'NullSoftware' differs |
| 3 | `shader_web_background` | api | render | https://github.com/thednp/shader-web-background | xemantic/shader-web-background | PARTIAL | repo 'shader-web-background' in starred set at: xemantic/shader-web-background; claimed org 'thednp' differs |
| 4 | `turi` | api | render | https://github.com/rari/WebGL | rarietta/WebGL | PARTIAL | repo 'WebGL' in starred set at: rarietta/WebGL; claimed org 'rari' differs |

## Full Classification Table

| Provider | Tier | Category | Source | Classification | Details | New? |
|---|---|---|---|---|---|---|
| `astray_fx` | api | materials | `https://github.com/Auburn/Fast` | QUESTIONABLE | source URL 'Auburn/Fast' not in starred set; no name/repo match | ⚠️ YES |
| `neural_cellular_automaton` | torch | generation | `https://github.com/harmlessfoo/NCA` | QUESTIONABLE | source URL 'harmlessfoo/NCA' not in starred set; no name/repo match |  |
| `photometric_stone_provider` | torch | perception | `https://github.com/prs-eth/SDFStudio` | QUESTIONABLE | source URL 'prs-eth/SDFStudio' not in starred set; no name/repo match |  |
| `poisson_reconstruction` | torch | geometry | `https://github.com/magoesch/poisson-reconstruction` | QUESTIONABLE | source URL 'magoesch/poisson-reconstruction' not in starred set; no name/repo match |  |
| `splat_image` | torch | geometry | `https://github.com/dusty-lab/splat-image` | QUESTIONABLE | source URL 'dusty-lab/splat-image' not in starred set; no name/repo match |  |
| `texture_fuser` | numpy | geometry | `https://github.com/nianticlabs/map_anything` | QUESTIONABLE | source URL 'nianticlabs/map_anything' not in starred set; no name/repo match |  |
| `dust3d` | api | geometry | `https://github.com/dust3d/dust3d` | PARTIAL | repo 'dust3d' in starred set at: huxingyi/dust3d; claimed org 'dust3d' differs |  |
| `feather_engine` | api | render | `https://github.com/danielgold70/featherEngine` | PARTIAL | repo 'featherEngine' in starred set at: mariojgt/featherEngine; claimed org 'danielgold70' differs |  |
| `image2scene` | api | completion | `https://github.com/Image2Scene-API/Image2Scene-API` | PARTIAL | repo 'Image2Scene-API' in starred set at: mzen17/Image2Scene-API; claimed org 'Image2Scene-API' differs |  |
| `infinigen` | torch | api | `(none)` | PARTIAL | no source claimed but name matches starred repo: princeton-vl/infinigen |  |
| `null_graph` | api | render | `https://github.com/NullSoftware/NullGraph` | PARTIAL | repo 'NullGraph' in starred set at: flarelink-in/NullGraph; claimed org 'NullSoftware' differs | ⚠️ YES |
| `pixal3d` | torch | api | `(none)` | PARTIAL | no source claimed but name matches starred repo: TencentARC/Pixal3D |  |
| `pixel_extractor` | numpy | perception | `https://github.com/Pixel-Extractor/Pixel-Extractor` | PARTIAL | repo 'Pixel-Extractor' in starred set at: univeous/Pixel-Extractor; claimed org 'Pixel-Extractor' differs |  |
| `rest3d` | api | api | `(none)` | PARTIAL | no source claimed but name matches starred repo: ShirleyMaxx/REST3D |  |
| `scene_forge` | api | generation | `https://github.com/Scene-Forge/scene-forge` | PARTIAL | repo 'scene-forge' in starred set at: duarteHiago/scene-forge; claimed org 'Scene-Forge' differs |  |
| `shader_web_background` | api | render | `https://github.com/thednp/shader-web-background` | PARTIAL | repo 'shader-web-background' in starred set at: xemantic/shader-web-background; claimed org 'thednp' differs | ⚠️ YES |
| `threejs_webgl` | api | render | `https://github.com/rari/WebGL` | PARTIAL | repo 'WebGL' in starred set at: rarietta/WebGL; claimed org 'rari' differs |  |
| `turi` | api | render | `https://github.com/rari/WebGL` | PARTIAL | repo 'WebGL' in starred set at: rarietta/WebGL; claimed org 'rari' differs | ⚠️ YES |
| `water_shader` | api | render | `https://github.com/Tuxalin/water-shader` | PARTIAL | repo 'water-shader' in starred set at: tuxalin/water-shader; claimed org 'Tuxalin' differs |  |
| `3d_cell_forge` | torch | generation | `https://github.com/huangserva/3DCellForge` | VERIFIED | exact match: huangserva/3DCellForge |  |
| `3d_gen_studio` | api | completion | `https://github.com/visualbruno/3DGenStudio` | VERIFIED | exact match: visualbruno/3DGenStudio |  |
| `articraft` | torch | geometry | `https://github.com/mattzh72/articraft` | VERIFIED | exact match: mattzh72/articraft |  |
| `bao_scroll_story` | api | render | `https://github.com/architech97/bao-scroll-story` | VERIFIED | exact match: architech97/bao-scroll-story |  |
| `depth_anything_cpp` | api | depth | `https://github.com/localai-org/depth-anything.cpp` | VERIFIED | exact match: localai-org/depth-anything.cpp |  |
| `galaxy_sim` | api | generation | `https://github.com/N0rvel/galaxy_sim` | VERIFIED | exact match: N0rvel/galaxy_sim |  |
| `gauss_cannon` | torch | geometry | `https://github.com/warpgatelabs/gauss-cannon` | VERIFIED | exact match: warpgatelabs/gauss-cannon |  |
| `img23d` | torch | completion | `https://github.com/harry7557558/img23d` | VERIFIED | exact match: harry7557558/img23d |  |
| `img2threejs` | api | completion | `https://github.com/img2threejs/img2threejs` | VERIFIED | exact match: img2threejs/img2threejs |  |
| `isosurface` | api | geometry | `https://github.com/lettier/isosurface` | VERIFIED | exact match: lettier/isosurface |  |
| `jungle_trail` | api | generation | `https://github.com/StarKnightt/jungle-trail` | VERIFIED | exact match: StarKnightt/jungle-trail |  |
| `lato2` | torch | completion | `https://github.com/LoHhhha/LATO.2` | VERIFIED | exact match: LoHhhha/LATO.2 |  |
| `liquid_glass_studio` | api | materials | `https://github.com/iyinchao/liquid-glass-studio` | VERIFIED | exact match: iyinchao/liquid-glass-studio |  |
| `lumenpyx` | api | render | `https://github.com/ABC-Engine/lumenpyx` | VERIFIED | exact match: ABC-Engine/lumenpyx |  |
| `make_it_3d` | torch | completion | `https://github.com/junshutang/Make-It-3D` | VERIFIED | exact match: junshutang/Make-It-3D |  |
| `material_maker` | api | materials | `https://github.com/RodZill4/material-maker` | VERIFIED | exact match: RodZill4/material-maker |  |
| `material_maker_ray_marching` | api | geometry | `https://github.com/paulofalcao/MaterialMakerRayMarching` | VERIFIED | exact match: paulofalcao/MaterialMakerRayMarching |  |
| `meshflow` | torch | geometry | `https://github.com/facebookresearch/meshflow` | VERIFIED | exact match: facebookresearch/meshflow |  |
| `ml_lito` | torch | render | `https://github.com/apple/ml-lito` | VERIFIED | exact match: apple/ml-lito |  |
| `modly` | torch | completion | `https://github.com/lightningpixel/modly` | VERIFIED | exact match: lightningpixel/modly |  |
| `multi_agent_cad` | torch | completion | `https://github.com/Pan-Chera/Multi-Agent-CAD` | VERIFIED | exact match: Pan-Chera/Multi-Agent-CAD |  |
| `mykonos_island_voxels` | api | generation | `https://github.com/boona13/mykonos-island-voxels` | VERIFIED | exact match: boona13/mykonos-island-voxels |  |
| `neural_planetoid` | api | geometry | `https://github.com/3merillon/neural-planetoid` | VERIFIED | exact match: 3merillon/neural-planetoid |  |
| `neural_shading_s25` | api | materials | `https://github.com/shader-slang/neural-shading-s25` | VERIFIED | exact match: shader-slang/neural-shading-s25 |  |
| `night_street` | api | generation | `https://github.com/StarKnightt/night-street` | VERIFIED | exact match: StarKnightt/night-street |  |
| `nightdrive` | api | generation | `https://github.com/StarKnightt/nightdrive` | VERIFIED | exact match: StarKnightt/nightdrive |  |
| `open_worlds` | api | generation | `https://github.com/FunSoftWareTechologies/OpenWorlds` | VERIFIED | exact match: FunSoftWareTechologies/OpenWorlds |  |
| `planet_voxel` | api | geometry | `https://github.com/CopilotCoding/PlanetVoxel_webgpu.js_Port` | VERIFIED | exact match: CopilotCoding/PlanetVoxel_webgpu.js_Port |  |
| `procedural_terrains` | api | generation | `https://github.com/ZyFou/ProceduralTerrains` | VERIFIED | exact match: ZyFou/ProceduralTerrains |  |
| `querysplat` | torch | geometry | `https://github.com/inspatio/querysplat` | VERIFIED | exact match: inspatio/querysplat |  |
| `sdf` | numpy | geometry | `https://github.com/fogleman/sdf` | VERIFIED | exact match: fogleman/sdf |  |
| `snowflow` | api | render | `https://github.com/Noniv/snowflow_demo` | VERIFIED | exact match: Noniv/snowflow_demo |  |
| `solar_sys` | api | generation | `https://github.com/solarcg/SolarSys` | VERIFIED | exact match: solarcg/SolarSys |  |
| `spirulae_splat` | torch | geometry | `https://github.com/harry7557558/spirulae-splat` | VERIFIED | exact match: harry7557558/spirulae-splat |  |
| `stable_fast_3d` | torch | geometry | `https://github.com/Stability-AI/stable-fast-3d` | VERIFIED | exact match: Stability-AI/stable-fast-3d |  |
| `supersplat` | torch | geometry | `https://github.com/playcanvas/supersplat` | VERIFIED | exact match: playcanvas/supersplat |  |
| `terra` | api | generation | `https://github.com/xKrvZ/Terra` | VERIFIED | exact match: xKrvZ/Terra |  |
| `texture_generator` | numpy | materials | `https://github.com/boytchev/texture-generator` | VERIFIED | exact match: boytchev/texture-generator |  |
| `tidewright` | api | geometry | `https://github.com/winchxyz/tidewright` | VERIFIED | exact match: winchxyz/tidewright |  |
| `tinyrenderer` | api | geometry | `https://github.com/Mr-Robot-err-404/tinyrenderer` | VERIFIED | exact match: Mr-Robot-err-404/tinyrenderer |  |
| `trellis_cpp` | api | completion | `https://github.com/pwilkin/trellis.cpp` | VERIFIED | exact match: pwilkin/trellis.cpp |  |
| `triposr` | torch | completion | `https://github.com/VAST-AI-Research/TripoSR` | VERIFIED | exact match: VAST-AI-Research/TripoSR |  |
| `ultra_shape` | torch | generation | `https://github.com/PKU-YuanGroup/UltraShape-1.0` | VERIFIED | exact match: PKU-YuanGroup/UltraShape-1.0 |  |
| `volrend` | torch | geometry | `https://github.com/sxyu/volrend` | VERIFIED | exact match: sxyu/volrend |  |
| `webgpu_water` | api | render | `https://github.com/jeantimex/webgpu-water` | VERIFIED | exact match: jeantimex/webgpu-water |  |
| `wonder3d` | torch | completion | `https://github.com/xxlong0/Wonder3D` | VERIFIED | exact match: xxlong0/Wonder3D |  |
| `world_gen` | torch | generation | `https://github.com/ZiYang-xie/WorldGen` | VERIFIED | exact match: ZiYang-xie/WorldGen |  |
| `world_stereo` | torch | reconstruction | `https://github.com/FuchengSu/WorldStereo` | VERIFIED | exact match: FuchengSu/WorldStereo |  |
| `zero123plus` | torch | completion | `https://github.com/SUDO-AI-3D/zero123plus` | VERIFIED | exact match: SUDO-AI-3D/zero123plus |  |
| `3d_regen` | torch | completion | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `appearance_driven_simplifier` | numpy | representation | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `bim_geometry_extractor` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `colmap` | api | api | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `contact_detector` | numpy | simulation | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `depth_anything_software` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `depth_anything_v2` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `depth_anything_v3` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `dgslam_dynamic` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `diffusion_gs` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `directional_tsdf_extension` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `gaussian_4d` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `gaussian_gpt` | torch | api | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `gaussian_representation` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `gaussian_splatting` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `geometry_neighbourhood` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `graphslam_loop_closure` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `hall_planner` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `hierarchical_chunk_partitioner` | numpy | representation | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `hy_world` | numpy | reconstruction | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `hybrid_line_renderer` | api | render | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `intrinsic_decomposer` | numpy | materials | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `lingbot_map` | numpy | navigation | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `lyra_video` | torch | api | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `mapanything` | torch | api | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `meshgraphnet_lod` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `motion_smoother` | numpy | simulation | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `multi_view_texture_fuser` | numpy | materials | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `navigation_builder` | api | navigation | `runtime/navigation.js` | MISSING | internal runtime reference |  |
| `palette_normalizer` | numpy | materials | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `photometric_stereo_provider` | numpy | perception | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `position_to_rotation` | numpy | simulation | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `primitive_fitter` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `provenance_tracker` | numpy | workflow | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `ransac_planes` | api | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `rethinking_voxels` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `room_envelopes_layout_estimator` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `sam_segmentation` | torch | perception | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `scale_align` | api | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `seeing_through_clutter` | torch | api | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `semantic_mask_filter` | numpy | perception | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `sequence_consistency_aligner` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `splatter_image` | torch | render | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `spotless_splats` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `stylized_surface_shader` | numpy | render | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `surface_separator` | api | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `t3dgs` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `terrain_diffusion` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `texture_stationarizer` | numpy | materials | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `trellis` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `trellis_2` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `tsdf_fusion` | api | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `ultrashape_1` | numpy | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `vggt` | torch | geometry | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |
| `wonderjourney` | torch | api | `(none)` | MISSING | no source claimed; no starred match (internal/baseline/paper/etc.) |  |

## Detailed Notes

### QUESTIONABLE (6)

Providers whose `source` URL claims a specific GitHub repo that does NOT trace back to the starred dataset:

1. **`astray_fx`** — source `https://github.com/Auburn/Fast`. Claimed repo not in starred set.
2. **`neural_cellular_automaton`** — source `https://github.com/harmlessfoo/NCA`. Claimed repo not in starred set.
3. **`photometric_stone_provider`** — source `https://github.com/prs-eth/SDFStudio`. Claimed repo not in starred set.
4. **`poisson_reconstruction`** — source `https://github.com/magoesch/poisson-reconstruction`. Claimed repo not in starred set.
5. **`splat_image`** — source `https://github.com/dusty-lab/splat-image`. Claimed repo not in starred set.
6. **`texture_fuser`** — source `https://github.com/nianticlabs/map_anything`. Claimed repo not in starred set.

### PARTIAL (13)

Providers with some provenance evidence but source URL org mismatch or no source claimed:

- **`dust3d`** (api) — repo 'dust3d' in starred set at: huxingyi/dust3d; claimed org 'dust3d' differs
- **`feather_engine`** (api) — repo 'featherEngine' in starred set at: mariojgt/featherEngine; claimed org 'danielgold70' differs
- **`image2scene`** (api) — repo 'Image2Scene-API' in starred set at: mzen17/Image2Scene-API; claimed org 'Image2Scene-API' differs
- **`infinigen`** (torch) — no source claimed but name matches starred repo: princeton-vl/infinigen
- **`null_graph`** (api) — repo 'NullGraph' in starred set at: flarelink-in/NullGraph; claimed org 'NullSoftware' differs
- **`pixal3d`** (torch) — no source claimed but name matches starred repo: TencentARC/Pixal3D
- **`pixel_extractor`** (numpy) — repo 'Pixel-Extractor' in starred set at: univeous/Pixel-Extractor; claimed org 'Pixel-Extractor' differs
- **`rest3d`** (api) — no source claimed but name matches starred repo: ShirleyMaxx/REST3D
- **`scene_forge`** (api) — repo 'scene-forge' in starred set at: duarteHiago/scene-forge; claimed org 'Scene-Forge' differs
- **`shader_web_background`** (api) — repo 'shader-web-background' in starred set at: xemantic/shader-web-background; claimed org 'thednp' differs
- **`threejs_webgl`** (api) — repo 'WebGL' in starred set at: rarietta/WebGL; claimed org 'rari' differs
- **`turi`** (api) — repo 'WebGL' in starred set at: rarietta/WebGL; claimed org 'rari' differs
- **`water_shader`** (api) — repo 'water-shader' in starred set at: tuxalin/water-shader; claimed org 'Tuxalin' differs

### MISSING (55) — Internal/Baseline/Paper

These 55 providers have no `source` claim and no matching starred repo. They are SHADED-internal implementations, baseline providers, or academic reference implementations:

- `3d_regen` (torch)
- `appearance_driven_simplifier` (numpy)
- `bim_geometry_extractor` (torch)
- `colmap` (api)
- `contact_detector` (numpy)
- `depth_anything_software` (numpy)
- `depth_anything_v2` (torch)
- `depth_anything_v3` (torch)
- `dgslam_dynamic` (torch)
- `diffusion_gs` (torch)
- `directional_tsdf_extension` (numpy)
- `gaussian_4d` (torch)
- `gaussian_gpt` (torch)
- `gaussian_representation` (numpy)
- `gaussian_splatting` (torch)
- `geometry_neighbourhood` (numpy)
- `graphslam_loop_closure` (torch)
- `hall_planner` (numpy)
- `hierarchical_chunk_partitioner` (numpy)
- `hy_world` (numpy)
- `hybrid_line_renderer` (api)
- `intrinsic_decomposer` (numpy)
- `lingbot_map` (numpy)
- `lyra_video` (torch)
- `mapanything` (torch)
- `meshgraphnet_lod` (torch)
- `motion_smoother` (numpy)
- `multi_view_texture_fuser` (numpy)
- `navigation_builder` (api)
- `palette_normalizer` (numpy)
- `photometric_stereo_provider` (numpy)
- `position_to_rotation` (numpy)
- `primitive_fitter` (numpy)
- `provenance_tracker` (numpy)
- `ransac_planes` (api)
- `rethinking_voxels` (numpy)
- `room_envelopes_layout_estimator` (numpy)
- `sam_segmentation` (torch)
- `scale_align` (api)
- `seeing_through_clutter` (torch)
- `semantic_mask_filter` (numpy)
- `sequence_consistency_aligner` (numpy)
- `splatter_image` (torch)
- `spotless_splats` (torch)
- `stylized_surface_shader` (numpy)
- `surface_separator` (api)
- `t3dgs` (torch)
- `terrain_diffusion` (torch)
- `texture_stationarizer` (numpy)
- `trellis` (torch)
- `trellis_2` (torch)
- `tsdf_fusion` (api)
- `ultrashape_1` (numpy)
- `vggt` (torch)
- `wonderjourney` (torch)

### VERIFIED (49)

These 49 providers have `source` URLs that exactly match a starred repository:

- `3d_cell_forge` — `https://github.com/huangserva/3DCellForge`
- `3d_gen_studio` — `https://github.com/visualbruno/3DGenStudio`
- `articraft` — `https://github.com/mattzh72/articraft`
- `bao_scroll_story` — `https://github.com/architech97/bao-scroll-story`
- `depth_anything_cpp` — `https://github.com/localai-org/depth-anything.cpp`
- `galaxy_sim` — `https://github.com/N0rvel/galaxy_sim`
- `gauss_cannon` — `https://github.com/warpgatelabs/gauss-cannon`
- `img23d` — `https://github.com/harry7557558/img23d`
- `img2threejs` — `https://github.com/img2threejs/img2threejs`
- `isosurface` — `https://github.com/lettier/isosurface`
- `jungle_trail` — `https://github.com/StarKnightt/jungle-trail`
- `lato2` — `https://github.com/LoHhhha/LATO.2`
- `liquid_glass_studio` — `https://github.com/iyinchao/liquid-glass-studio`
- `lumenpyx` — `https://github.com/ABC-Engine/lumenpyx`
- `make_it_3d` — `https://github.com/junshutang/Make-It-3D`
- `material_maker` — `https://github.com/RodZill4/material-maker`
- `material_maker_ray_marching` — `https://github.com/paulofalcao/MaterialMakerRayMarching`
- `meshflow` — `https://github.com/facebookresearch/meshflow`
- `ml_lito` — `https://github.com/apple/ml-lito`
- `modly` — `https://github.com/lightningpixel/modly`
- `multi_agent_cad` — `https://github.com/Pan-Chera/Multi-Agent-CAD`
- `mykonos_island_voxels` — `https://github.com/boona13/mykonos-island-voxels`
- `neural_planetoid` — `https://github.com/3merillon/neural-planetoid`
- `neural_shading_s25` — `https://github.com/shader-slang/neural-shading-s25`
- `night_street` — `https://github.com/StarKnightt/night-street`
- `nightdrive` — `https://github.com/StarKnightt/nightdrive`
- `open_worlds` — `https://github.com/FunSoftWareTechologies/OpenWorlds`
- `planet_voxel` — `https://github.com/CopilotCoding/PlanetVoxel_webgpu.js_Port`
- `procedural_terrains` — `https://github.com/ZyFou/ProceduralTerrains`
- `querysplat` — `https://github.com/inspatio/querysplat`
- `sdf` — `https://github.com/fogleman/sdf`
- `snowflow` — `https://github.com/Noniv/snowflow_demo`
- `solar_sys` — `https://github.com/solarcg/SolarSys`
- `spirulae_splat` — `https://github.com/harry7557558/spirulae-splat`
- `stable_fast_3d` — `https://github.com/Stability-AI/stable-fast-3d`
- `supersplat` — `https://github.com/playcanvas/supersplat`
- `terra` — `https://github.com/xKrvZ/Terra`
- `texture_generator` — `https://github.com/boytchev/texture-generator`
- `tidewright` — `https://github.com/winchxyz/tidewright`
- `tinyrenderer` — `https://github.com/Mr-Robot-err-404/tinyrenderer`
- `trellis_cpp` — `https://github.com/pwilkin/trellis.cpp`
- `triposr` — `https://github.com/VAST-AI-Research/TripoSR`
- `ultra_shape` — `https://github.com/PKU-YuanGroup/UltraShape-1.0`
- `volrend` — `https://github.com/sxyu/volrend`
- `webgpu_water` — `https://github.com/jeantimex/webgpu-water`
- `wonder3d` — `https://github.com/xxlong0/Wonder3D`
- `world_gen` — `https://github.com/ZiYang-xie/WorldGen`
- `world_stereo` — `https://github.com/FuchengSu/WorldStereo`
- `zero123plus` — `https://github.com/SUDO-AI-3D/zero123plus`

## Audit Protocol Compliance

| Requirement | Status |
|---|---|
| Providers NOT deleted | COMPLIANT — 119 existing + 4 new = 123 total, 0 removed |
| Provider implementations NOT modified | COMPLIANT — only analysis performed |
| Registry NOT rewritten | COMPLIANT |
| Provenance classified as VERIFIED/PARTIAL/QUESTIONABLE/MISSING | COMPLIANT |
| Deleted test outputs restored | COMPLIANT — `tools/_test_out/out/` restored via `git checkout HEAD` |
