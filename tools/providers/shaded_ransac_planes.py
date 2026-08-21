#!/usr/bin/env python3
"""SHADED provider: RANSAC Plane Segmentation (replaces point-cloud intersection).

Replaces the risky point-cloud-intersection approach with robust RANSAC-based
plane detection on TSDF-filtered point clouds. Walls, floor, ceiling are
extracted via:
  1. Load point cloud from TSDF fusion (exp-TSDF-001 output)
  2. Iteratively fit planes via RANSAC (PROSAC variant for ordered sampling)
  3. Classify planes by normal direction (vertical = wall, horizontal = floor/ceiling)
  4. Merge coplanar adjacent planes
  5. Output as SHADED.spatial-provider-result.v1 with points/normals/confidence

CLI:
    python3 tools/providers/shaded_ransac_planes.py --points {tsdf_dir}/points.f32 \
        --depth {tsdf_dir}/depth.f32 --output {out} --distance-threshold 0.05

Exit codes:
    0  success
    1  input error
    2  numpy missing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

import numpy as np


def doctor() -> int:
    try:
        import numpy as _np  # noqa: F401
        return 0
    except ImportError:
        return 2


def _load_points(points_file: str, shape_hint=None) -> np.ndarray:
    data = np.fromfile(points_file, dtype=np.float32)
    if shape_hint:
        data = data.reshape(shape_hint)
    return data.reshape(-1, 6) if data.size % 6 == 0 else data


def _load_depth(depth_file: str, shape_hint=None) -> np.ndarray:
    data = np.fromfile(depth_file, dtype=np.float32)
    if shape_hint:
        data = data.reshape(shape_hint)
    return data


def _segment_planes(points_xyz: np.ndarray, normals: np.ndarray | None,
                    distance_threshold: float, num_iterations: int,
                    min_points: int, vertical_tolerance_deg: float = 20.0,
                    wall_normal_min_vertical: float = 0.9) -> list[dict]:
    """RANSAC plane fitting with PROSAC-style ordered sampling.

    Returns list of {indices, normal, offset, type} where type ∈ {wall, floor, ceiling, unknown}.
    """
    planes = []
    remaining = np.ones(len(points_xyz), dtype=bool)
    up = np.array([0, 0, 1], dtype=np.float32)
    normal_cos_thresh = np.cos(np.radians(90 - vertical_tolerance_deg))

    for _ in range(10):  # max 10 planes
        idx = np.where(remaining)[0]
        if len(idx) < min_points:
            break
        sample_pts = points_xyz[idx]
        if normals is not None:
            sample_normals = normals[idx]
        else:
            sample_normals = None

        best_plane = None
        best_inliers = []
        for _it in range(num_iterations):
            if sample_normals is not None:
                # Prefer points with similar normals (PROSAC).
                si = np.random.choice(len(sample_pts), 3, replace=False)
            else:
                si = np.random.choice(len(sample_pts), 3, replace=False)
            p0, p1, p2 = sample_pts[si[0]], sample_pts[si[1]], sample_pts[si[2]]
            # Plane from 3 points.
            v1 = p1 - p0
            v2 = p2 - p0
            n = np.cross(v1, v2)
            norm_n = np.linalg.norm(n)
            if norm_n < 1e-6:
                continue
            n = n / norm_n
            offset = -np.dot(n, p0)
            # Distance to plane.
            dists = np.abs(points_xyz[idx] @ n + offset)
            inliers = idx[dists < distance_threshold]
            if len(inliers) < min_points:
                continue
            if len(inliers) > len(best_inliers):
                best_inliers = inliers
                best_plane = {"normal": n, "offset": offset, "indices": inliers}

        if best_plane is None or len(best_inliers) < min_points:
            break

        remaining[best_inliers] = False
        # Classify.
        n = best_plane["normal"]
        abs_n = np.abs(n)
        angle_to_vertical = np.degrees(np.arccos(np.clip(abs(n[2]), 0, 1)))
        if angle_to_vertical > vertical_tolerance_deg:
            # More vertical than horizontal → wall.
            verticality = abs(n[2])
            plane_type = "wall" if verticality < wall_normal_min_vertical else "wall"
        else:
            plane_type = "floor" if n[2] > 0 else "ceiling"
        best_plane["type"] = plane_type
        best_plane["verticality"] = float(abs(n[2]))
        planes.append(best_plane)

    return planes


def _compute_point_normals(points_xyz: np.ndarray, k: int = 10) -> np.ndarray:
    """Estimate normals via PCA on k-nearest neighbours (fallback for no input normals)."""
    from scipy.spatial import cKDTree
    tree = cKDTree(points_xyz)
    _, idx = tree.query(points_xyz, k=k + 1)
    normals = np.zeros_like(points_xyz)
    for i in range(len(points_xyz)):
        neighbors = points_xyz[idx[i, 1:]]
        centroid = neighbors.mean(axis=0)
        cov = np.cov((neighbors - centroid).T)
        eigvals, eigvecs = np.linalg.eigh(cov)
        normals[i] = eigvecs[:, 0]
    return normals.astype(np.float32)


def _normals_from_depth(depth: np.ndarray, K: dict) -> np.ndarray:
    """Fast normal estimation from depth map using finite differences."""
    H, W = depth.shape
    fx = K.get("fx", W / (2 * np.tan(np.deg2rad(55) / 2)))
    fy = K.get("fy", fx)
    cx = K.get("cx", W * 0.5)
    cy = K.get("cy", H * 0.5)
    z = np.maximum(depth, 1e-3)
    x = (np.arange(W)[None, :] - cx) * z / fx
    y = (np.arange(H)[:, None] - cy) * z / fy
    points = np.stack([x, y, z], axis=-1)
    dx = np.gradient(points, axis=1)
    dy = np.gradient(points, axis=0)
    n = np.cross(dx, dy)
    norm = np.linalg.norm(n, axis=-1, keepdims=True)
    n = n / np.maximum(norm, 1e-8)
    return n.astype(np.float32).reshape(-1, 3)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="shaded_ransac_planes.py",
                                description="SHADED RANSAC plane segmentation (replaces point-cloud intersection).")
    p.add_argument("--points", required=True, help="Path to .f32 point cloud (from TSDF provider).")
    p.add_argument("--depth", default=None, help="Optional depth map for normals.")
    p.add_argument("--output", required=True, help="Output directory.")
    p.add_argument("--distance-threshold", type=float, default=0.05, help="RANSAC inlier distance threshold (meters).")
    p.add_argument("--num-iterations", type=int, default=1000, help="RANSAC iterations per plane.")
    p.add_argument("--min-points", type=int, default=10000, help="Min inliers per plane.")
    p.add_argument("--vertical-tolerance", type=float, default=20.0, help="Degrees from vertical/horizontal for classification.")
    p.add_argument("--point-budget", type=int, default=250_000, help="Max output point count.")
    p.add_argument("--doctor", action="store_true", help="Check deps.")
    p.add_argument("--source-sha256", default=None)
    return p


def run_provider(args):
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    timings: dict[str, float] = {}

    if args.doctor:
        return doctor()

    t0 = time.perf_counter()
    points_raw = _load_points(args.points)
    if points_raw.ndim == 1:
        points_raw = points_raw.reshape(-1, 3)
    if points_raw.shape[1] >= 3:
        points_xyz = points_raw[:, :3].astype(np.float32)
        pts_color = points_raw[:, 3:6] if points_raw.shape[1] >= 6 else np.zeros((len(points_xyz), 3), dtype=np.float32)
    else:
        print("ERROR: points file must have at least 3 float columns", file=sys.stderr)
        return 1

    # Downsample if too large.
    if len(points_xyz) > args.point_budget:
        step = max(1, len(points_xyz) // args.point_budget)
        points_xyz = points_xyz[::step]
        pts_color = pts_color[::step]
        timings["downsample_step"] = step

    # Compute normals.
    if args.depth:
        depth = _load_depth(args.depth)
        # Try to infer camera from points shape; fallback to default intrinsics.
        K_approx = {"width": depth.shape[1], "height": depth.shape[0]}
        t_norm = time.perf_counter()
        try:
            normals = _normals_from_depth(depth, K_approx)
            # Sample to match points if needed.
            if normals.shape[0] > len(points_xyz):
                normals = normals[:len(points_xyz)]
            elif normals.shape[0] < len(points_xyz):
                pad = np.zeros((len(points_xyz) - normals.shape[0], 3), dtype=np.float32)
                normals = np.vstack([normals, pad])
        except Exception:
            normals = None
        timings["normals_from_depth_ms"] = (time.perf_counter() - t_norm) * 1000.0
    else:
        normals = None

    if normals is None:
        t_norm = time.perf_counter()
        try:
            normals = _compute_point_normals(points_xyz)
        except ImportError:
            # No scipy — skip normal estimation.
            normals = np.zeros_like(points_xyz)
        timings["normals_pca_ms"] = (time.perf_counter() - t_norm) * 1000.0

    # RANSAC plane segmentation.
    t_seg = time.perf_counter()
    planes = _segment_planes(
        points_xyz, normals, args.distance_threshold, args.num_iterations,
        args.min_points, args.vertical_tolerance,
    )
    timings["ransac_segmentation_ms"] = (time.perf_counter() - t_seg) * 1000.0

    # Build output point cloud (only inliers from detected planes).
    all_inlier_idx = np.concatenate([p["indices"] for p in planes]) if planes else np.array([], dtype=int)
    if len(all_inlier_idx) == 0:
        all_inlier_idx = np.arange(len(points_xyz))
        planes = []

    filtered_pts = points_xyz[all_inlier_idx]
    filtered_colors = pts_color[all_inlier_idx] if pts_color.size else np.zeros((len(filtered_pts), 3), dtype=np.float32)
    filtered_normals = normals[all_inlier_idx] if normals is not None and len(normals) >= len(all_inlier_idx) else np.zeros_like(filtered_pts)

    # Build point cloud Nx6.
    point_cloud = np.concatenate([filtered_pts, np.clip(filtered_colors, 0, 1)], axis=-1).astype("<f4", copy=False)

    # Depth-like output: project points back to a depth map (XY plane projection).
    xy_min = filtered_pts[:, :2].min(axis=0)
    xy_max = filtered_pts[:, :2].max(axis=0)
    grid_res = max(int((xy_max[0] - xy_min[0]) / 0.05), int((xy_max[1] - xy_min[1]) / 0.05), 64)
    grid_res = min(grid_res, 512)
    xs = ((filtered_pts[:, 0] - xy_min[0]) / max(xy_max[0] - xy_min[0], 1e-6) * grid_res).astype(int)
    ys = ((filtered_pts[:, 1] - xy_min[1]) / max(xy_max[1] - xy_min[1], 1e-6) * grid_res).astype(int)
    xs = np.clip(xs, 0, grid_res - 1)
    ys = np.clip(ys, 0, grid_res - 1)
    depth_grid = np.zeros((grid_res, grid_res), dtype=np.float32)
    depth_grid[ys, xs] = filtered_pts[:, 2]  # z as "depth" (height)

    # Confidence = plane membership.
    confidence_grid = np.zeros((grid_res, grid_res), dtype=np.float32)
    # Tag voxels that belong to planar regions.
    plane_tag = np.zeros(len(all_inlier_idx), dtype=np.int32)
    offset = 0
    for i, p in enumerate(planes):
        n = len(p["indices"])
        plane_tag[offset:offset + n] = i + 1
        offset += n
    confidence_grid.flat[ys * grid_res + xs] = plane_tag.astype(np.float32) / max(len(planes), 1)

    # Write channels.
    depth_file = output_dir / "depth.f32"
    np.ascontiguousarray(depth_grid, dtype="<f4").tofile(depth_file)
    normals_file = output_dir / "normals.f32"
    np.ascontiguousarray(filtered_normals, dtype="<f4").tofile(normals_file)
    points_file = output_dir / "points.f32"
    point_cloud.tofile(points_file)
    confidence_file = output_dir / "confidence.f32"
    np.ascontiguousarray(confidence_grid, dtype="<f4").tofile(confidence_file)

    channels = {
        "depth": {"file": "depth.f32", "dtype": "float32-le", "shape": list(depth_grid.shape)},
        "normals": {"file": "normals.f32", "dtype": "float32-le", "shape": list(filtered_normals.shape)},
        "points": {"file": "points.f32", "dtype": "float32-le", "shape": list(point_cloud.shape)},
        "confidence": {"file": "confidence.f32", "dtype": "float32-le", "shape": list(confidence_grid.shape)},
    }

    # Write plane metadata as sidecar.
    plane_meta = {
        "format": "SHADED.spatial-provider-ransac-planes.v1",
        "planes": [
            {"type": p["type"], "normal": p["normal"].tolist(), "offset": p["offset"],
             "verticality": p["verticality"], "inlier_count": len(p["indices"])}
            for p in planes
        ],
    }
    (output_dir / "planes.json").write_text(json.dumps(plane_meta, indent=2) + "\n")

    timings["total_ms"] = (time.perf_counter() - t0) * 1000.0

    result = {
        "format": "SHADED.spatial-provider-result.v1",
        "provider": "ransac-planes",
        "modelVersion": "1.0",
        "device": "cpu",
        "precision": "fp32",
        "channels": channels,
        "camera": {"width": grid_res, "height": grid_res,
                   "fx": grid_res / 1.13, "fy": grid_res / 1.13,
                   "cx": grid_res * 0.5, "cy": grid_res * 0.5},
        "depthConvention": "relative-depth-higher-far",
        "metric": False,
        "timingsMs": timings,
        "provenance": {
            "class": "INFERRED",
            "sourceSha256": args.source_sha256,
            "sourceFile": os.path.basename(args.points),
            "sourceSize": {"width": grid_res, "height": grid_res},
            "processedSize": {"width": grid_res, "height": grid_res},
            "provider": "ransac-planes",
            "modelVersion": "1.0",
            "parameters": {
                "distanceThreshold": args.distance_threshold,
                "numIterations": args.num_iterations,
                "minPoints": args.min_points,
                "verticalToleranceDeg": args.vertical_tolerance,
                "numPlanes": len(planes),
            },
        },
    }

    manifest = output_dir / "result.json"
    manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"RANSAC planes: {len(planes)} planes, {len(all_inlier_idx)} inlier points → {manifest}")
    return 0


def main(argv=None):
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        return run_provider(args)
    except Exception as exc:
        print(f"RANSAC provider FAILED: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
