#!/usr/bin/env python3
"""SHADED adapter for the official Depth Anything 3 Python API.

The adapter deliberately does not use the filename ``depth_anything_3.py`` because a
script with that name shadows the installed ``depth_anything_3`` package on Python's
import path when executed directly from this directory.
"""
from __future__ import annotations

import argparse
import importlib
import json
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

from shaded_provider_common import load_rgb, write_result


def dependencies() -> dict[str, str]:
    versions: dict[str, str] = {}
    for name in ("torch", "depth_anything_3", "PIL", "numpy"):
        try:
            module = importlib.import_module(name)
            if name == "depth_anything_3" and not hasattr(module, "__path__"):
                raise ImportError(f"{getattr(module, '__file__', name)} shadows the installed depth_anything_3 package")
            versions[name] = getattr(module, "__version__", "installed")
        except Exception as error:  # explicit diagnostic, not a pretend success
            versions[name] = f"missing: {error}"
    return versions


def first_view(value):
    """Return the first view emitted by DA3 without assuming numpy or torch."""
    if value is None:
        return None
    item = value[0] if getattr(value, "ndim", 0) > 2 else value
    if hasattr(item, "detach"):
        item = item.detach().float().cpu().numpy()
    return np.asarray(item, dtype=np.float32)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--model", default="depth-anything/DA3-SMALL")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--precision", choices=("fp16", "fp32"), default="fp16")
    parser.add_argument("--max-edge", type=int, default=1024)
    parser.add_argument("--point-budget", type=int, default=500_000)
    parser.add_argument("--doctor", action="store_true")
    args = parser.parse_args()
    if args.doctor:
        info = dependencies()
        print(json.dumps(info, indent=2))
        return 0 if all(not value.startswith("missing:") for value in info.values()) else 2
    if not args.input or not args.output:
        parser.error("--input and --output are required")

    import torch
    from depth_anything_3.api import DepthAnything3

    if args.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but torch.cuda.is_available() is false")
    device = torch.device(args.device if args.device.startswith("cuda") else "cpu")
    actual_precision = "fp16" if args.precision == "fp16" and device.type == "cuda" else "fp32"
    image, original_size = load_rgb(args.input, args.max_edge)

    load_started = time.perf_counter()
    model = DepthAnything3.from_pretrained(args.model).to(device).eval()
    load_ms = (time.perf_counter() - load_started) * 1000.0

    # DA3's documented inference API accepts image paths. The temporary file also
    # makes the configured max-edge budget effective instead of merely reporting it.
    with tempfile.TemporaryDirectory(prefix="shaded-da3-") as temporary:
        resized_path = Path(temporary) / "input.png"
        image.save(resized_path)
        inference_started = time.perf_counter()
        # The official inference() method already disables gradients. Keep only
        # autocast here so we do not nest inference_mode around the provider API.
        with torch.autocast(
            device_type=device.type,
            dtype=torch.float16,
            enabled=actual_precision == "fp16",
        ):
            prediction = model.inference([str(resized_path)])
        inference_ms = (time.perf_counter() - inference_started) * 1000.0

    depth = first_view(prediction.depth)
    if depth is None or depth.ndim != 2:
        raise ValueError(f"DA3 returned invalid depth shape: {None if depth is None else depth.shape}")
    confidence = first_view(getattr(prediction, "conf", None))
    intrinsics = first_view(getattr(prediction, "intrinsics", None))
    extrinsics = first_view(getattr(prediction, "extrinsics", None))
    is_metric = "METRIC" in args.model.upper()
    manifest = write_result(
        args.output,
        "depth-anything-3.official",
        args.model,
        str(device),
        actual_precision,
        args.input,
        image,
        original_size,
        depth,
        confidence=confidence,
        intrinsics=intrinsics,
        extrinsics=extrinsics,
        depth_convention="metric-depth-meters" if is_metric else "relative-depth-higher-far",
        metric=is_metric,
        timings_ms={"modelLoad": load_ms, "inference": inference_ms},
        point_budget=args.point_budget,
    )
    print(manifest)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Depth Anything 3 adapter failed: {error}", file=sys.stderr)
        raise
