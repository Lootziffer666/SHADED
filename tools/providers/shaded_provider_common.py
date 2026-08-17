"""Shared output writer for real SHADED depth providers."""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
from PIL import Image


def source_hash(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_rgb(path: str, max_edge: int) -> tuple[Image.Image, tuple[int, int]]:
    image = Image.open(path).convert("RGB")
    original = image.size
    if max_edge > 0 and max(image.size) > max_edge:
        scale = max_edge / max(image.size)
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    return image, original


def normalise_depth(depth: np.ndarray) -> np.ndarray:
    depth = np.asarray(depth, dtype=np.float32)
    if depth.ndim != 2:
        raise ValueError(f"depth must be HxW, got {depth.shape}")
    if not np.isfinite(depth).any():
        raise ValueError("depth contains no finite values")
    finite = depth[np.isfinite(depth)]
    lo, hi = np.percentile(finite, [1.0, 99.0])
    if hi <= lo:
        return np.zeros_like(depth, dtype=np.float32)
    result = np.clip((depth - lo) / (hi - lo), 0.0, 1.0)
    result[~np.isfinite(result)] = 0.0
    return result.astype("<f4", copy=False)


def geometry_depth(depth: np.ndarray, depth_convention: str, metric: bool) -> np.ndarray:
    """Map provider output to the positive camera-space Z used by point export.

    Metric depth is preserved. Relative predictions are percentile-normalised to
    a documented 0.2..1.0 display range; disparity is inverted before mapping.
    The untouched provider prediction remains the canonical depth channel.
    """
    depth = np.asarray(depth, dtype=np.float32)
    if metric:
        result = depth.copy()
        result[~np.isfinite(result)] = 0.0
        return np.maximum(result, 1e-6).astype("<f4", copy=False)
    normalised = normalise_depth(depth)
    if depth_convention == "relative-disparity-higher-near":
        normalised = 1.0 - normalised
    return (0.2 + normalised * 0.8).astype("<f4", copy=False)


def depth_normals(depth: np.ndarray, fx: float, fy: float) -> np.ndarray:
    height, width = depth.shape
    cx, cy = width * 0.5, height * 0.5
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    points = np.stack(((xx - cx) * depth / max(fx, 1e-6), (cy - yy) * depth / max(fy, 1e-6), depth), axis=-1)
    dx = np.gradient(points, axis=1)
    dy = np.gradient(points, axis=0)
    normals = np.cross(dx, dy)
    norm = np.linalg.norm(normals, axis=-1, keepdims=True)
    normals = normals / np.maximum(norm, 1e-8)
    normals[~np.isfinite(normals)] = 0.0
    return normals.astype("<f4", copy=False)


def depth_points(depth: np.ndarray, rgb: np.ndarray, fx: float, fy: float, point_budget: int) -> np.ndarray:
    height, width = depth.shape
    step = max(1, int(np.ceil(np.sqrt((height * width) / max(1, point_budget)))))
    yy, xx = np.mgrid[0:height:step, 0:width:step].astype(np.float32)
    sampled = depth[::step, ::step]
    cx, cy = width * 0.5, height * 0.5
    xyz = np.stack(((xx - cx) * sampled / max(fx, 1e-6), (cy - yy) * sampled / max(fy, 1e-6), sampled), axis=-1)
    color = rgb[::step, ::step].astype(np.float32) / 255.0
    return np.concatenate((xyz, color), axis=-1).reshape(-1, 6).astype("<f4", copy=False)


def write_result(
    output: str,
    provider: str,
    model_version: str,
    device: str,
    precision: str,
    input_path: str,
    image: Image.Image,
    original_size: tuple[int, int],
    depth: np.ndarray,
    confidence: Optional[np.ndarray] = None,
    intrinsics: Optional[np.ndarray] = None,
    extrinsics: Optional[np.ndarray] = None,
    depth_convention: str = "relative-depth-higher-far",
    metric: bool = False,
    timings_ms: Optional[Dict[str, float]] = None,
    point_budget: int = 250_000,
) -> Path:
    started = time.perf_counter()
    destination = Path(output)
    destination.mkdir(parents=True, exist_ok=True)
    depth = np.asarray(depth, dtype="<f4")
    height, width = depth.shape
    rgb = np.asarray(image.resize((width, height), Image.Resampling.LANCZOS), dtype=np.uint8)
    if intrinsics is None:
        focal = width / (2.0 * np.tan(np.deg2rad(60.0) / 2.0))
        intrinsics = np.array([[focal, 0.0, width * 0.5], [0.0, focal, height * 0.5], [0.0, 0.0, 1.0]], dtype=np.float32)
    intrinsics = np.asarray(intrinsics, dtype=np.float32).reshape(3, 3)
    fx, fy = float(intrinsics[0, 0]), float(intrinsics[1, 1])
    point_depth = geometry_depth(depth, depth_convention, metric)
    normals = depth_normals(point_depth, fx, fy)
    points = depth_points(point_depth, rgb, fx, fy, point_budget)

    channels: Dict[str, Dict[str, Any]] = {}

    def write_array(name: str, array: np.ndarray) -> None:
        data = np.asarray(array, dtype="<f4")
        filename = f"{name}.f32"
        data.tofile(destination / filename)
        channels[name] = {"file": filename, "dtype": "float32-le", "shape": list(data.shape)}

    write_array("depth", depth)
    write_array("normals", normals)
    write_array("points", points)
    if confidence is not None:
        confidence = np.asarray(confidence, dtype=np.float32)
        if confidence.shape != depth.shape:
            raise ValueError(f"confidence shape {confidence.shape} does not match depth {depth.shape}")
        write_array("confidence", confidence)

    camera: Dict[str, Any] = {
        "intrinsics": intrinsics.tolist(),
        "width": width,
        "height": height,
        "fx": fx,
        "fy": fy,
        "cx": float(intrinsics[0, 2]),
        "cy": float(intrinsics[1, 2]),
    }
    if extrinsics is not None:
        camera["extrinsics"] = np.asarray(extrinsics, dtype=np.float32).reshape(3, 4).tolist()

    timings = dict(timings_ms or {})
    timings["write"] = (time.perf_counter() - started) * 1000.0
    result = {
        "format": "SHADED.spatial-provider-result.v1",
        "provider": provider,
        "modelVersion": model_version,
        "device": device,
        "precision": precision,
        "channels": channels,
        "camera": camera,
        "depthConvention": depth_convention,
        "metric": bool(metric),
        "timingsMs": timings,
        "provenance": {
            "class": "INFERRED",
            "sourceSha256": source_hash(input_path),
            "sourceFile": os.path.basename(input_path),
            "sourceSize": {"width": original_size[0], "height": original_size[1]},
            "processedSize": {"width": width, "height": height},
            "provider": provider,
            "modelVersion": model_version,
            "parameters": {
                "precision": precision,
                "pointBudget": point_budget,
                "pointDepthMapping": "metric-preserved" if metric else "percentile-1-99-to-camera-z-0.2-1.0",
            },
        },
    }
    manifest = destination / "result.json"
    manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return manifest
