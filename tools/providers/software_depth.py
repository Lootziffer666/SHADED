#!/usr/bin/env python3
"""Deterministic CPU-only depth fallback for SHADED's one-image world pipeline.

This is deliberately not advertised as measured geometry. It creates a stable
relative relief field from image layout, luminance and local contrast so the
pipeline always has a final software fallback when neural providers are absent.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

import numpy as np

from shaded_provider_common import load_rgb, write_result


def dependencies() -> dict[str, str]:
    versions: dict[str, str] = {}
    for name in ("PIL", "numpy"):
        try:
            module = __import__(name)
            versions[name] = getattr(module, "__version__", "installed")
        except Exception as error:
            versions[name] = f"missing: {error}"
    return versions


def box_blur(values: np.ndarray, radius: int = 4) -> np.ndarray:
    if radius <= 0:
        return values.astype(np.float32, copy=True)
    padded = np.pad(values, ((radius, radius), (radius, radius)), mode="edge")
    integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant").cumsum(0).cumsum(1)
    size = radius * 2 + 1
    out = (
        integral[size:, size:]
        - integral[:-size, size:]
        - integral[size:, :-size]
        + integral[:-size, :-size]
    ) / float(size * size)
    return out.astype(np.float32)


def software_depth(image) -> np.ndarray:
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    height, width = luminance.shape
    yy = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]

    # Generic single-view prior: upper image regions tend to be farther away.
    perspective = 1.0 - yy
    smooth = box_blur(luminance, radius=max(2, min(height, width) // 180))
    detail = np.abs(luminance - smooth)
    gy, gx = np.gradient(smooth)
    edges = np.hypot(gx, gy)
    edge_scale = float(np.percentile(edges, 95)) if np.any(edges) else 1.0
    edges = np.clip(edges / max(edge_scale, 1e-6), 0.0, 1.0)

    # Keep the broad perspective field dominant. Texture only nudges the relief,
    # preventing a brick wall or foliage patch from becoming a fake deep canyon.
    depth = 0.18 + perspective * 0.72
    depth += (smooth - 0.5) * 0.09
    depth -= np.clip(detail * 1.6, 0.0, 1.0) * 0.05
    depth -= edges * 0.035

    # Preserve a finite positive range. Higher values are farther away.
    return np.clip(depth, 0.05, 1.0).astype(np.float32)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--precision", choices=("fp16", "fp32"), default="fp32")
    parser.add_argument("--max-edge", type=int, default=1024)
    parser.add_argument("--point-budget", type=int, default=250_000)
    parser.add_argument("--doctor", action="store_true")
    args = parser.parse_args()

    if args.doctor:
        info = dependencies()
        print(json.dumps(info, indent=2))
        return 0 if all(not value.startswith("missing:") for value in info.values()) else 2
    if not args.input or not args.output:
        parser.error("--input and --output are required")

    image, original_size = load_rgb(args.input, args.max_edge)
    started = time.perf_counter()
    depth = software_depth(image)
    inference_ms = (time.perf_counter() - started) * 1000.0
    manifest = write_result(
        args.output,
        "shaded-software-depth",
        "cpu-relief-v1",
        "cpu",
        "fp32",
        args.input,
        image,
        original_size,
        depth,
        depth_convention="relative-depth-higher-far",
        metric=False,
        timings_ms={"inference": inference_ms},
        point_budget=args.point_budget,
    )
    print(manifest)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"SHADED software depth failed: {error}", file=sys.stderr)
        raise
