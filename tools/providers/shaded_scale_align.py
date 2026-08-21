#!/usr/bin/env python3
"""SHADED provider: ScaleAlignmentCalibrator (Murre et al. CVPR 2025).

Aligns monocular depth (VGGT/DA3 — relative scale only) to SfM sparse depth
(COLMAP — metric scale) using RANSAC-based linear regression. This is the
mandatory step between depth provider output and TSDF fusion — without it,
TSDF voxels and RANSAC planes drift.

Algorithm:
  1. Load monocular depth map (from DA3/VGGT result.json)
  2. Load COLMAP sparse point cloud (from images.txt + cameras.txt)
  3. For each SfM point, sample the monocular depth at the projected pixel
  4. RANSAC: fit s = a * d_mono + b (scale + shift)
  5. Apply s to monocular depth → metric depth

CLI:
    python3 tools/providers/shaded_scale_align.py --monocular {da3}/result.json \
        --sfm-dir {colmap}/sparse/0 --output {out} --scale-only

Exit codes: 0 = success, 1 = input error, 2 = numpy missing
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
        import numpy as _np
        return 0
    except ImportError:
        return 2


def _read_colmap_images(dir_path: str) -> dict:
    """Parse COLMAP images.txt → {image_name: {q, t, camera_id}}."""
    images_txt = Path(dir_path) / "images.txt"
    if not images_txt.exists():
        return {}
    poses = {}
    for line in images_txt.read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 10:
            img_name = parts[9]
            qw, qx, qy, qz = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
            tx, ty, tz = float(parts[5]), float(parts[6]), float(parts[7])
            poses[img_name] = {"q": [qw, qx, qy, qz], "t": [tx, ty, tz], "points": []}
    return poses


def _load_colmap_points_txyz(dir_path: str) -> dict[str, list]:
    """Parse COLMAP's points3D.txt → image_name → list of (u, v, X, Y, Z)."""
    points_file = Path(dir_path) / "points3D.txt"
    images_file = Path(dir_path) / "images.txt"
    if not points_file.exists() or not images_file.exists():
        return {}
    # Build point→image mapping from images.txt
    img_points: dict[str, list] = {}
    point_data = {}
    for line in points_file.read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 8:
            pid = parts[0]
            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
            point_data[pid] = (x, y, z)
    # Parse images.txt for 2D-3D correspondences
    for line in images_file.read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 11:
            img_name = parts[9]
            # POINTS: list of "x,y,POINT_ID" pairs
            points_str = " ".join(parts[10:])
            img_points[img_name] = []
            for token in points_str.split(")"):
                token = token.strip().strip("(")
                if not token:
                    continue
                coords = token.split(",")
                if len(coords) >= 3:
                    u = float(coords[0])
                    v = float(coords[1])
                    pid = coords[2]
                    if pid in point_data:
                        img_points[img_name].append((u, v, *point_data[pid]))
    return img_points


def _quaternion_to_matrix(q):
    w, x, y, z = q
    return np.array([
        [1 - 2*(y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w)],
        [2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w)],
        [2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x - y*y)],  # fixed: was 1 - 2*(x*x + y*y)
    ], dtype=np.float32)


def _ransac_linear_fit(x, y, num_iter=1000, thresh=0.02, min_inliers_ratio=0.6):
    """RANSAC: fit y = a*x + b, return (a, b, inlier_mask)."""
    best_a, best_b = 1.0, 0.0
    best_count = 0
    best_mask = np.zeros(len(x), dtype=bool)
    n = len(x)
    if n < 2:
        return best_a, best_b, best_mask
    for _ in range(num_iter):
        idx = np.random.choice(n, 2, replace=False)
        dx = x[idx[1]] - x[idx[0]]
        if abs(dx) < 1e-8:
            continue
        a = (y[idx[1]] - y[idx[0]]) / dx
        b = y[idx[0]] - a * x[idx[0]]
        residual = np.abs(y - (a * x + b))
        inliers = residual < thresh
        count = inliers.sum()
        if count > best_count:
            best_count = count
            best_a, best_b = a, b
            best_mask = inliers.copy()
    if best_count / n < min_inliers_ratio:
        # Fallback: robust least-squares via all data
        A = np.vstack([x, np.ones(n)]).T
        result, _, _, _ = np.linalg.lstsq(A, y, rcond=None)
        best_a, best_b = float(result[0]), float(result[1])
        residual = np.abs(y - (best_a * x + best_b))
        best_mask = residual < (np.std(residual) * 2 if np.std(residual) > 0 else thresh)
    return best_a, best_b, best_mask


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="shaded_scale_align.py",
        description="ScaleAlignmentCalibrator: align monocular depth to SfM metric scale.",
    )
    p.add_argument("--monocular", required=True, help="Path to DA3/VGGT result.json")
    p.add_argument("--sfm-dir", required=True, help="COLMAP sparse/0 directory with images.txt + points3D.txt")
    p.add_argument("--output", required=True, help="Output directory")
    p.add_argument("--scale-only", action="store_true", help="Only estimate scale (b=0), skip shift")
    p.add_argument("--ransac-iterations", type=int, default=1000)
    p.add_argument("--distance-threshold", type=float, default=0.02)
    p.add_argument("--min-inliers-ratio", type=float, default=0.6)
    p.add_argument("--point-budget", type=int, default=250_000)
    p.add_argument("--device", default="cpu")
    p.add_argument("--precision", default="fp32", choices=["fp16", "fp32"])
    p.add_argument("--doctor", action="store_true")
    p.add_argument("--source-sha256", default=None)
    return p


def run_provider(args: argparse.Namespace) -> int:
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    timings: dict[str, float] = {}

    if args.doctor:
        return doctor()

    t0 = time.perf_counter()

    # Load monocular result.
    mono_result = json.loads(Path(args.monocular).read_text())
    if mono_result.get("format") != "SHADED.spatial-provider-result.v1":
        print(f"ERROR: not a v1 result: {Path(args.monocular).name}", file=sys.stderr)
        return 1
    mono_depth_file = Path(args.monocular).parent / mono_result["channels"]["depth"]["file"]
    mono_depth = np.fromfile(str(mono_depth_file), dtype=np.float32)
    mono_shape = mono_result["channels"]["depth"]["shape"]
    mono_depth = mono_depth.reshape(mono_shape)
    camera = mono_result.get("camera", {})
    fx = camera.get("fx", mono_shape[1] * 0.5 / np.tan(np.deg2rad(55) / 2))
    fy = camera.get("fy", fx)
    cx = camera.get("cx", mono_shape[1] * 0.5)
    cy = camera.get("cy", mono_shape[0] * 0.5)

    # Load COLMAP SfM.
    src_file = mono_result.get("provenance", {}).get("sourceFile", "")
    img_poses = _read_colmap_images(args.sfm_dir)
    img_points = _load_colmap_points_txyz(args.sfm_dir)

    pose = img_poses.get(src_file) or img_poses.get(os.path.basename(src_file))
    if not pose:
        # Try to find the closest matching image.
        for k in img_poses:
            if src_file and src_file in k:
                pose = img_poses[k]
                src_file = k
                break
    if not pose:
        print(f"WARNING: no COLMAP pose found for {src_file}; using identity alignment", file=sys.stderr)
        scale, shift = 1.0, 0.0
    else:
        points3d = img_points.get(src_file, [])
        if points3d and pose:
            uvs = np.array([(p[0], p[1]) for p in points3d], dtype=np.float32)
            pt_coords = np.array([(p[2], p[3], p[4]) for p in points3d], dtype=np.float32)
            R = _quaternion_to_matrix(pose["q"])
            t = np.array(pose["t"], dtype=np.float32)
            cam_points = (R @ pt_coords.T + t[:, None]).T  # N, 3 in camera coords
            z_cam = cam_points[:, 2]  # depth in camera coords (metric, meters)
            u_proj = (cam_points[:, 0] * fx / z_cam + cx).round().astype(int)
            v_proj = (cam_points[:, 1] * fy / z_cam + cy).round().astype(int)
            valid = (u_proj >= 0) & (u_proj < mono_shape[1]) & (v_proj >= 0) & (v_proj < mono_shape[0]) & (z_cam > 0)
            if valid.sum() > 2:
                u_v = u_proj[valid]
                v_v = v_proj[valid]
                z_v = z_cam[valid]
                d_mono = mono_depth[v_v, u_v]
                valid_d = (d_mono > 0) & np.isfinite(d_mono) & (z_v > 0)
                if valid_d.sum() > 2:
                    d_mono = d_mono[valid_d]
                    z_v = z_v[valid_d]
                    if args.scale_only:
                        # a = mean(z/d), b=0
                        a = np.mean(z_v / np.maximum(d_mono, 1e-6))
                        scale, shift, mask = a, 0.0, np.ones(len(d_mono), dtype=bool)
                    else:
                        scale, shift, mask = _ransac_linear_fit(
                            d_mono, z_v, args.ransac_iterations,
                            args.distance_threshold, args.min_inliers_ratio
                        )
                    timings["sfm_points_used"] = int(valid_d.sum())
                    timings["inliers"] = int(mask.sum())
                else:
                    scale, shift = 1.0, 0.0
            else:
                scale, shift = 1.0, 0.0
        else:
            scale, shift = 1.0, 0.0
    scale = max(scale, 1e-6)

    # Apply alignment.
    aligned_depth = (mono_depth * scale + shift).astype(np.float32)

    # Write aligned depth.
    depth_file = output_dir / "depth.f32"
    np.ascontiguousarray(aligned_depth, dtype="<f4").tofile(depth_file)

    # Copy normals/points/confidence from mono result if present.
    # For simplicity, recompute points from aligned depth.
    H, W = aligned_depth.shape
    fx_f, fy_f, cx_f, cy_f = float(fx), float(fy), float(cx), float(cy)
    valid = (aligned_depth > 0) & np.isfinite(aligned_depth)
    z = np.maximum(aligned_depth, 1e-6)
    x = (np.arange(W)[None, :] - cx_f) * z / fx_f
    y = (np.arange(H)[:, None] - cy_f) * z / fy_f
    pts = np.stack([x[valid], y[valid], z[valid]], axis=-1)
    if len(pts) > args.point_budget:
        idx = np.linspace(0, len(pts) - 1, args.point_budget).astype(int)
        pts = pts[idx]

    if _PIL_AVAILABLE and mono_result.get("image"):
        rgb = np.array(Image.open(mono_result["image"]).resize((W, H), Image.Resampling.LANCZOS))
    else:
        src_img_path = Path(args.monocular).parent / ".." / os.path.basename(src_file) if src_file else None
        rgb = None
        if src_img_path and src_img_path.exists() and Image:
            rgb = np.array(Image.open(src_img_path).resize((W, H), Image.Resampling.LANCZOS))

    colors = np.full_like(pts, 0.5) if rgb is None else None
    if rgb is not None:
        u = ((np.arange(W)[None, :] - cx_f) * z / fx_f).astype(int)[valid]
        v = ((np.arange(H)[:, None] - cy_f) * z / fy_f).astype(int)[valid]
        if len(u) >= len(pts):
            colors = rgb[v[:len(pts)], u[:len(pts)]] / 255.0

    point_cloud = np.concatenate([pts, colors if colors is not None else np.full((len(pts), 3), 0.5)], axis=-1).astype("<f4", copy=False)
    points_file = output_dir / "points.f32"
    point_cloud.tofile(points_file)

    # Normals from depth gradient.
    normals = np.zeros((H, W, 3), dtype=np.float32)
    normals[:, :, 2] = 1.0
    grad_x = np.gradient(aligned_depth, axis=1)
    grad_y = np.gradient(aligned_depth, axis=0)
    normals[..., 0] = -grad_x / np.maximum(np.abs(grad_x).max() + 1e-8, 1e-8)
    normals[..., 1] = -grad_y / np.maximum(np.abs(grad_y).max() + 1e-8, 1e-8)
    normals_file = output_dir / "normals.f32"
    normals.reshape(-1, 3).astype("<f4").tofile(normals_file)

    confidence = np.ones((H, W), dtype=np.float32) * 0.9
    confidence[~valid] = 0.1
    conf_file = output_dir / "confidence.f32"
    np.ascontiguousarray(confidence, dtype="<f4").tofile(conf_file)

    channels = {
        "depth": {"file": "depth.f32", "dtype": "float32-le", "shape": [H, W]},
        "points": {"file": "points.f32", "dtype": "float32-le", "shape": list(point_cloud.shape)},
        "normals": {"file": "normals.f32", "dtype": "float32-le", "shape": [H, W, 3]},
        "confidence": {"file": "confidence.f32", "dtype": "float32-le", "shape": [H, W]},
    }

    timings["total_ms"] = (time.perf_counter() - t0) * 1000.0

    result = {
        "format": "SHADED.spatial-provider-result.v1",
        "provider": "scale-align",
        "modelVersion": "murre-cvpr2025",
        "device": args.device,
        "precision": args.precision,
        "channels": channels,
        "camera": camera,
        "depthConvention": mono_result.get("depthConvention", "relative-depth-higher-far"),
        "metric": True,
        "timingsMs": timings,
        "provenance": {
            "class": "INFERRED",
            "sourceSha256": args.source_sha256 or source_hash(args.monocular),
            "sourceFile": os.path.basename(args.monocular),
            "sourceSize": {"width": W, "height": H},
            "processedSize": {"width": W, "height": H},
            "provider": "scale-align",
            "modelVersion": "murre-cvpr2025",
            "parameters": {
                "scaleFactor": float(scale),
                "shiftOffset": float(shift),
                "ransacIterations": args.ransac_iterations,
                "distanceThreshold": args.distance_threshold,
                "minInliersRatio": args.min_inliers_ratio,
                "scaleOnly": args.scale_only,
            },
        },
    }

    manifest = output_dir / "result.json"
    manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Scale-aligned depth: scale={scale:.4f}, shift={shift:.4f} → {manifest}")
    return 0


def main(argv=None):
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        return run_provider(args)
    except Exception as exc:
        print(f"ScaleAlign provider FAILED: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
