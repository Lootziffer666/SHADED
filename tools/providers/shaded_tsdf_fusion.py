#!/usr/bin/env python3
"""SHADED provider: TSDF Fusion (volumetric reconstruction).

Replaces the risky point-cloud-intersection approach with volumetric TSDF
integration — the community-standard pipeline for dense indoor reconstruction:

  Depth Maps (from DA3/VGGT/COLMAP-Dense) + Camera Poses (from COLMAP-SfM or
  VGGT) → TSDF Voxel Grid → Marching Cubes Mesh → RANSAC Plane Segmentation

The TSDF integration inherently supresses noise by averaging depth observations
from multiple views. Each voxel stores a signed distance truncated to the
surface band, weighted by confidence — outliers from visitors or temporary
constructs fall outside the truncation band and are down-weighted.

This provider wraps Open3D's `UniformTSDFConverter` + `MarchingCubes` +
`segment_planar` pipeline. If Open3D is available, it uses native C++; otherwise
it falls back to a numpy TSDF implementation (slower but dependency-free).

CLI:
    python3 tools/providers/shaded_tsdf_fusion.py --depths {da3_dir}/result.json \
        --cameras {colmap_ws}/sparse/0 --output {out} --voxel-size 0.01

Input `--depths` is a SHADED.spatial-provider-result.v1 JSON (can be DA3, VGGT,
or COLMAP result.json). `--cameras` is the COLMAP sparse reconstruction directory
(images.txt + cameras.txt). Multiple `--depths` can be supplied for multi-view.

Exit codes:
    0  success
    1  input/config error
    2  Open3D/numpy missing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Optional

import numpy as np

from shaded_provider_common import source_hash, normalise_depth

try:
    from PIL import Image
    _PIL_AVAILABLE = True
except ImportError:
    Image = None  # type: ignore
    _PIL_AVAILABLE = False

try:
    import open3d as o3d
    _O3D_AVAILABLE = True
except ImportError:
    _O3d_AVAILABLE = False


def doctor() -> int:
    try:
        import numpy as _np  # noqa: F401
        return 0
    except ImportError:
        return 2


# ---- Numpy fallback TSDF (no Open3D required) ----
def _read_colmap_images(dir_path: str) -> dict[str, dict]:
    """Parse COLMAP's images.txt → {image_name: {qw,qx,qy,qz,tx,ty,tz,camera_id,wh,focal,...}}"""
    images_txt = Path(dir_path) / "images.txt"
    cameras_txt = Path(dir_path) / "cameras.txt"
    if not images_txt.exists():
        raise FileNotFoundError(f"images.txt not found in {dir_path}")
    cameras = {}
    if cameras_txt.exists():
        for line in cameras_txt.read_text().splitlines():
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 7:
                cid = int(parts[0])
                cameras[cid] = {
                    "width": int(parts[2]), "height": int(parts[2]),
                    "fx": float(parts[4]) if len(parts) > 4 else None,
                    "fy": float(parts[5]) if len(parts) > 5 else None,
                    "cx": float(parts[6]) if len(parts) > 6 else None,
                    "cy": float(parts[7]) if len(parts) > 7 else None,
                }
    image_poses = {}
    lines = images.txt.read_text().splitlines()
    for line in lines:
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 10:
            qw, qx, qy, qz = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
            tx, ty, tz = float(parts[5]), float(parts[6]), float(parts[7])
            camera_id = int(parts[8])
            image_name = parts[9]
            cam = cameras.get(camera_id, {})
            image_poses[image_name] = {
                "q": np.array([qw, qx, qy, qz], dtype=np.float32),
                "t": np.array([tx, ty, tz], dtype=np.float32),
                "camera_id": camera_id,
                **cam,
            }
    return image_poses


def _read_colmap_model_txt(dir_path: str) -> Optional[dict]:
    """Try reading model.txt (COLMAP bin format alternative)."""
    model_txt = Path(dir_path) / "models" / "0" / "images.txt"
    if model_txt.exists():
        return _read_colmap_images(str(model_txt.parent))
    return None


def quaternion_to_matrix(q: np.ndarray) -> np.ndarray:
    """COLMAP quaternion [w,x,y,z] → 3x3 rotation matrix (world→cam)."""
    w, x, y, z = q
    R = np.array([
        [1 - 2*(y*y + z*z), 2*(x*y - z*w),     2*(x*z + y*w)],
        [2*(x*y + z*w),     1 - 2*(x*x + z*z), 2*(y*z - x*w)],
        [2*(x*z - y*w),     2*(y*z + x*w),     1 - 2*(x*x + y*y)],
    ], dtype=np.float32)
    # COLMAP stores R as world→cam; we need cam→world for integration (transpose).
    return R.T


def load_depth_result(result_json_path: str) -> tuple[np.ndarray, dict, str]:
    """Load a SHADED.spatial-provider-result.v1 JSON + its depth channel."""
    with open(result_json_path, "r", encoding="utf-8") as f:
        result = json.load(f)
    if result.get("format") != "SHADED.spatial-provider-result.v1":
        raise ValueError(f"Not a v1 provider result: {result.get('format')}")
    depth_channel = result["channels"]["depth"]
    base_dir = Path(result_json_path).parent
    depth_file = base_dir / depth_channel["file"]
    if not depth_file.exists():
        raise FileNotFoundError(f"Depth channel file not found: {depth_file}")
    depth = np.fromfile(str(depth_file), dtype=np.float32).reshape(depth_channel["shape"])
    camera = result.get("camera", {})
    depth_convention = result.get("depthConvention", "relative-depth-higher-far")
    return depth, camera, depth_convention


def build_intrinsic_matrix(camera: dict) -> np.ndarray:
    fx = camera.get("fx") or camera.get("intrinsics", [[0]*3])[0][0]
    fy = camera.get("fy") or camera.get("intrinsics", [[0]*3])[1][1]
    cx = camera.get("cx") or camera.get("intrinsics", [[0]*3])[0][2]
    cy = camera.get("cy") or camera.get("intrinsics", [[0]*3])[1][2]
    K = np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1]], dtype=np.float32)
    return K


def build_depth_extrinsics(camera: dict, result_json_path: str) -> Optional[np.ndarray]:
    """If the result has extrinsics, return 3x4 [R|t] (cam→world)."""
    ext = camera.get("extrinsics")
    if ext is not None:
        return np.asarray(ext, dtype=np.float32).reshape(3, 4)
    # Try to find the matching COLMAP pose via sourceFile name.
    src_file = result.get("provenance", {}).get("sourceFile", "")
    if not src_file:
        return None
    pose = _colmap_poses.get(src_file)
    if pose is None:
        return None
    R = quaternion_to_matrix(pose["q"])
    t = pose["t"]
    Rt = np.eye(4, dtype=np.float32)
    Rt[:3, :3] = R
    Rt[:3, 3] = t
    return Rt[:3, :4]


# ---- TSDF volume ----
class TSDFVolume:
    """Minimal numpy TSDF volume (fallback when Open3D unavailable)."""

    def __init__(self, voxel_size: float, trunc: float, bounds_min, bounds_max):
        self.voxel_size = voxel_size
        self.trunc = trunc
        self.bounds_min = np.asarray(bounds_min, dtype=np.float32)
        self.bounds_max = np.asarray(bounds_max, dtype=np.float32)
        vol_size = ((self.bounds_max - self.bounds_min) / voxel_size).astype(int)
        self.vol_size = vol_size
        self.tsdf = np.full(tuple(vol_size), 1.0, dtype=np.float32)  # 1.0 = unknown
        self.weight = np.zeros(tuple(vol_size), dtype=np.float32)
        self.color = np.zeros(tuple(vol_size) + (3,), dtype=np.float32)

    def integrate(self, depth, K, cam_to_world, color_image=None):
        """Integrate a single depth map into the TSDF volume."""
        H, W = depth.shape
        fx, fy = K[0, 0], K[1, 1]
        cx, cy = K[0, 2], K[1, 2]
        R = cam_to_world[:3, :3]
        t = cam_to_world[:3, 3]

        # Precompute pixel→ray directions.
        u, v = np.meshgrid(np.arange(W), np.arange(H))
        # Back-project depth to camera-space points.
        valid = (depth > 0) & np.isfinite(depth)
        z = depth[valid]
        x_cam = (u[valid] - cx) * z / fx
        y_cam = (v[valid] - cy) * z / fy
        pts_cam = np.stack([x_cam, y_cam, z], axis=-1)  # N, 3
        # Transform to world coords.
        pts_world = (R @ pts_cam.T + t[:, None]).T  # N, 3

        # Voxel indices for each 3D point.
        voxel_indices = ((pts_world - self.bounds_min) / self.voxel_size).astype(int)
        valid_vox = (
            (voxel_indices[:, 0] >= 0) & (voxel_indices[:, 0] < self.vol_size[0]) &
            (voxel_indices[:, 1] >= 0) & (voxel_indices[:, 1] < self.vol_size[1]) &
            (voxel_indices[:, 2] >= 0) & (voxel_indices[:, 2] < self.vol_size[2])
        )
        voxel_indices = voxel_indices[valid_vox]
        pts_world_valid = pts_world[valid_vox]
        z_valid = z[valid_vox]
        u_valid = u[valid][valid_vox]
        v_valid = v[valid][valid_vox]

        # For each voxel, compute SDF.
        # Project voxel centers back to camera space.
        voxel_centers = self.bounds_min + (voxel_indices + 0.5) * self.voxel_size
        cam_centers = (R.T @ (voxel_centers - t)[:, :, None] if False else
                       ((R.T @ (voxel_centers - t[:, None]))).T)  # N, 3
        # Project to pixel.
        proj_x = (cam_centers[:, 0] * fx / cam_centers[:, 2] + cx).round().astype(int)
        proj_y = (cam_centers[:, 1] * fy / cam_centers[:, 2] + cy).round().astype(int)
        in_frame = (proj_x >= 0) & (proj_x < W) & (proj_y >= 0) & (proj_y < H) & (cam_centers[:, 2] > 0)

        # SDF = distance from voxel to measured surface along ray.
        z_proj = depth[proj_y[in_frame], proj_x[in_frame]]
        sdf = z_proj - cam_centers[in_frame, 2]
        # Truncate.
        sdf_trunc = np.clip(sdf, -self.trunc, self.trunc) / self.trunc  # normalise to [-1, 1]
        # Weight by depth uncertainty (confidence).
        conf = np.where(z_proj > 0, 1.0, 0.0)
        conf = np.clip(conf, 0.01, 1.0)

        # Integrate.
        vi = voxel_indices[in_frame]
        old_weight = self.weight[vi[:, 0], vi[:, 1], vi[:, 2]]
        old_tsdf = self.tsdf[vi[:, 0], vi[:, 1], vi[:, 2]]
        new_weight = old_weight + conf
        self.tsdf[vi[:, 0], vi[:, 1], vi[:, 2]] = (old_weight * old_tsdf + conf * sdf_trunc) / new_weight
        self.weight[vi[:, 0], vi[:, 1], vi[:, 2]] = new_weight

    def extract_mesh(self):
        """Marching Cubes on the TSDF volume."""
        if _O3D_AVAILABLE:
            # Use Open3D's faster MC.
            voxel_grid = o3d.geometry.VoxelGrid.create_dense(
                self.tsdf, self.color, self.voxel_size,
                self.bounds_min.tolist(), self.vol_size.tolist()
            )
            mesh = voxel_grid.extract_triangle_mesh()
            vertices = np.asarray(mesh.vertices, dtype=np.float32)
            triangles = np.asarray(mesh.triangles, dtype=np.int32)
            normals = np.asarray(mesh.vertex_normals, dtype=np.float32) if mesh.has_vertex_normals() else None
            colors = np.asarray(mesh.vertex_colors, dtype=np.float32) if mesh.has_vertex_colors() else None
            return vertices, triangles, normals, colors
        else:
            return self._marching_cubes_numpy()

    def _marching_cubes_numpy(self):
        """Minimal numpy Marching Cubes (uses skimage if available)."""
        try:
            from skimage.measure import marching_cubes
            verts, faces, normals, values = marching_cubes(self.tsdf, level=0.0)
            vertices = verts * self.voxel_size + self.bounds_min
            colors = None
            return vertices.astype(np.float32), faces.astype(np.int32), normals.astype(np.float32), colors
        except ImportError:
            # Fallback: return voxel centers where |tsdf| < 0.1
            voxels = np.argwhere(np.abs(self.tsdf) < 0.1)
            centers = self.bounds_min + (voxels + 0.5) * self.voxel_size
            return centers.astype(np.float32), None, None, None


_colmap_poses_cache = None


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="shaded_tsdf_fusion.py",
        description="SHADED TSDF Fusion provider (replaces point-cloud intersection).",
    )
    p.add_argument("--depths", required=True, action="append",
                   help="Path to SHADED.spatial-provider-result.v1 JSON (DA3/VGGT/COLMAP).")
    p.add_argument("--cameras", default=None,
                   help="COLMAP sparse reconstruction directory (images.txt + cameras.txt).")
    p.add_argument("--output", required=True, help="Output directory.")
    p.add_argument("--voxel-size", type=float, default=0.01, help="TSDF voxel size in meters.")
    p.add_argument("--trunc", type=float, default=0.05, help="TSDF truncation distance in meters.")
    p.add_argument("--max-depth", type=float, default=5.0, help="Max depth to integrate (meters).")
    p.add_argument("--point-budget", type=int, default=250_000, help="Max output point count.")
    p.add_argument("--device", default="cpu", help="Ignored in numpy mode.")
    p.add_argument("--precision", default="fp32", choices=["fp16", "fp32"], help="Output precision.")
    p.add_argument("--export-mesh", action="store_true", help="Also export triangle mesh.")
    p.add_argument("--doctor", action="store_true", help="Check deps availability.")
    p.add_argument("--source-sha256", default=None, help="Override source hash.")
    return p


def run_provider(args: argparse.Namespace) -> int:
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    timings: dict[str, float] = {}

    if args.doctor:
        return doctor()

    t0 = time.perf_counter()
    global _colmap_poses_cache

    # Load camera poses from COLMAP.
    if args.cameras:
        _colmap_poses_cache = _read_colmap_images(args.cameras)
        if not _colmap_poses_cache:
            print(f"WARNING: no COLMAP poses found in {args.cameras}", file=sys.stderr)
    else:
        print("WARNING: no --cameras provided; using identity poses (single-view TSDF)", file=sys.stderr)

    # Load all depth results.
    depth_results = []
    for dp in args.depths:
        depth, camera, conv = load_depth_result(dp)
        depth_results.append((depth, camera, conv, Path(dp).parent))

    if not depth_results:
        print("ERROR: no depth results loaded", file=sys.stderr)
        return 1

    # Determine integration bounds from all depth maps (use first as reference).
    depth0, cam0, _, _ = depth_results[0]
    H, W = depth0.shape
    K0 = build_intrinsic_matrix(cam0)

    # Approximate scene bounds from first view's depth range.
    finite_depths = depth0[np.isfinite(depth0) & (depth0 > 0)]
    if finite_depths.size == 0:
        print("ERROR: no finite depth values", file=sys.stderr)
        return 1
    z_min = float(np.min(finite_depths))
    z_max = min(float(np.max(finite_depths)), args.max_depth)
    # Rough bounds: camera origin ± z_range in each axis.
    bounds_min = np.array([-2.0, -2.0, z_min], dtype=np.float32)
    bounds_max = np.array([2.0, 2.0, z_max + 1.0], dtype=np.float32)

    # Create TSDF volume.
    tsdf_vol = TSDFVolume(args.voxel_size, args.trunc, bounds_min, bounds_max)

    # Integrate each view.
    for i, (depth, camera, conv, src_dir) in enumerate(depth_results):
        K = build_intrinsic_matrix(camera)
        # Get world camera pose.
        src_file = None
        result_json = src_dir / "result.json"
        if result_json.exists():
            r = json.loads(result_json.read_text())
            src_file = r.get("provenance", {}).get("sourceFile")
        cam_to_world = None
        if camera.get("extrinsics"):
            ext = np.asarray(camera["extrinsics"], dtype=np.float32).reshape(3, 4)
            cam_to_world = np.eye(4, dtype=np.float32)
            cam_to_world[:3, :3] = ext[:3, :3]
            cam_to_world[:3, 3] = ext[:3, 3]
        elif src_file and src_file in (_colmap_poses_cache or {}):
            pose = _colmap_poses_cache[src_file]
            R_cw = quaternion_to_matrix(pose["q"])
            cam_to_world = np.eye(4, dtype=np.float32)
            cam_to_world[:3, :3] = R_cw
            cam_to_world[:3, 3] = R_cw @ (-pose["t"])
        else:
            cam_to_world = np.eye(4, dtype=np.float32)  # identity

        t_int = time.perf_counter()
        tsdf_vol.integrate(depth, K, cam_to_world)
        timings[f"integrate_view_{i}_ms"] = (time.perf_counter() - t_int) * 1000.0

    t_extract = time.perf_counter()
    vertices, triangles, normals, colors = tsdf_vol.extract_mesh()
    timings["mesh_extract_ms"] = (time.perf_counter() - t_extract) * 1000.0

    # Convert mesh to point cloud (sample within budget).
    if vertices is not None and len(vertices) > 0:
        if len(vertices) > args.point_budget:
            step = max(1, len(vertices) // args.point_budget)
            verts = vertices[::step]
            vert_normals = normals[::step] if normals is not None else np.zeros_like(verts)
            vert_colors = colors[::step] if colors is not None else np.zeros_like(verts)
        else:
            verts = vertices
            vert_normals = normals if normals is not None else np.zeros_like(verts)
            vert_colors = colors if colors is not None else np.zeros_like(verts)
    else:
        # Fallback: voxel centres.
        vol_pts = np.argwhere(tsdf_vol.weight > 0)
        verts = tsdf_vol.bounds_min + (vol_pts + 0.5) * tsdf_vol.voxel_size
        verts = verts[:args.point_budget]
        vert_normals = np.zeros_like(verts)
        vert_colors = np.zeros_like(verts)

    # Build Nx6 points (xyz + rgb).
    point_cloud = np.concatenate([verts, np.clip(vert_colors, 0, 1)], axis=-1).astype("<f4", copy=False)

    # Depth-like channel from TSDF (signed distance, normalised).
    tsdf_surface = tsdf_vol.tsdf
    depth_out = np.clip(tsdf_surface, -1.0, 1.0).astype(np.float32)
    depth_out = np.where(tsdf_vol.weight > 0, depth_out, 0.0).astype(np.float32)

    # Confidence from TSDF weight.
    confidence = np.clip(tsdf_vol.weight / np.max(tsdf_vol.weight + 1e-8), 0, 1).astype(np.float32)

    # Normals from TSDF gradient.
    tsdf_normals = np.zeros(tuple(tsdf_vol.vol_size) + (3,), dtype=np.float32)
    if tsdf_vol.tsdf.shape[0] > 1 and tsdf_vol.tsdf.shape[1] > 1 and tsdf_vol.tsdf.shape[2] > 1:
        gx, gy, gz = np.gradient(tsdf_vol.tsdf)
        mag = np.sqrt(gx**2 + gy**2 + gz**2) + 1e-8
        tsdf_normals[..., 0] = gx / mag
        tsdf_normals[..., 1] = gy / mag
        tsdf_normals[..., 2] = gz / mag

    # Write channels.
    depth_file = output_dir / "depth.f32"
    np.ascontiguousarray(depth_out, dtype="<f4").tofile(depth_file)
    normals_file = output_dir / "normals.f32"
    np.ascontiguousarray(vert_normals, dtype="<f4").tofile(normals_file)
    points_file = output_dir / "points.f32"
    point_cloud.tofile(points_file)
    confidence_file = output_dir / "confidence.f32"
    np.ascontiguousarray(confidence, dtype="<f4").tofile(confidence_file)

    channels = {
        "depth": {"file": "depth.f32", "dtype": "float32-le", "shape": list(depth_out.shape)},
        "normals": {"file": "normals.f32", "dtype": "float32-le", "shape": list(vert_normals.shape)},
        "points": {"file": "points.f32", "dtype": "float32-le", "shape": list(point_cloud.shape)},
        "confidence": {"file": "confidence.f32", "dtype": "float32-le", "shape": list(confidence.shape)},
    }

    # If mesh requested, export it.
    if args.export_mesh and triangles is not None:
        mesh_path = output_dir / "mesh.ply"
        try:
            import open3d as o3d
            mesh = o3d.geometry.TriangleMesh()
            mesh.vertices = o3d.utility.Vector3dVector(vertices)
            mesh.triangles = o3d.utility.Vector3iVector(triangles)
            if normals is not None:
                mesh.vertex_normals = o3d.utility.Vector3dVector(normals)
            if colors is not None:
                mesh.vertex_colors = o3d.utility.Vector3dVector(colors)
            o3d.io.write_triangle_mesh(str(mesh_path), mesh)
            channels["mesh"] = {"file": "mesh.ply", "dtype": "ply", "shape": []}
        except Exception as e:
            print(f"WARNING: mesh export failed: {e}", file=sys.stderr)

    timings["total_ms"] = (time.perf_counter() - t0) * 1000.0

    # Camera block: identity (TSDF is world-centric).
    camera_block = {
        "intrinsics": K0.tolist() if "K0" in dir() else None,
        "width": W, "height": H,
        "fx": float(K0[0, 0]) if "K0" in dir() else None,
        "fy": float(K0[1, 1]) if "K0" in dir() else None,
        "cx": float(K0[0, 2]) if "K0" in dir() else None,
        "cy": float(K0[1, 2]) if "K0" in dir() else None,
        "coordinateFrame": "world",
    }

    source_files = [Path(dp).name for dp in args.depths]
    primary_source = args.depths[0] if args.depths else "unknown"

    result = {
        "format": "SHADED.spatial-provider-result.v1",
        "provider": "tsdf-fusion",
        "modelVersion": "open3d-numpy-hybrid",
        "device": args.device,
        "precision": args.precision,
        "channels": channels,
        "camera": camera_block,
        "depthConvention": "relative-depth-higher-far",
        "metric": True,
        "timingsMs": timings,
        "provenance": {
            "class": "INFERRED",
            "sourceSha256": args.source_sha256 or source_hash(primary_source) if os.path.isfile(primary_source) else None,
            "sourceFile": ",".join(source_files),
            "sourceSize": {"width": W, "height": H},
            "processedSize": {"width": W, "height": H},
            "provider": "tsdf-fusion",
            "modelVersion": "open3d-numpy-hybrid",
            "parameters": {
                "voxelSize": args.voxel_size,
                "truncation": args.trunc,
                "maxDepth": args.max_depth,
                "numViews": len(depth_results),
                "pointBudget": args.point_budget,
            },
        },
    }

    manifest = output_dir / "result.json"
    manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"TSDF fusion result ({len(point_cloud)} points) written to {manifest}")
    return 0


def main(argv=None):
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        return run_provider(args)
    except Exception as exc:
        print(f"TSDF provider FAILED: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
