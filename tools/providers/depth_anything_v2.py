#!/usr/bin/env python3
"""SHADED adapter for the official Transformers Depth Anything V2 implementation."""
from __future__ import annotations

import argparse
import json
import sys
import time
import numpy as np

from shaded_provider_common import load_rgb, write_result


def dependencies() -> dict[str, str]:
    versions: dict[str, str] = {}
    for name in ("torch", "transformers", "PIL", "numpy"):
        try:
            module = __import__(name)
            versions[name] = getattr(module, "__version__", "installed")
        except Exception as error:  # explicit diagnostic, not a pretend success
            versions[name] = f"missing: {error}"
    return versions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--model", default="depth-anything/Depth-Anything-V2-Small-hf")
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
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    if args.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but torch.cuda.is_available() is false")
    device = torch.device(args.device if args.device.startswith("cuda") else "cpu")
    actual_precision = "fp16" if args.precision == "fp16" and device.type == "cuda" else "fp32"
    image, original_size = load_rgb(args.input, args.max_edge)
    load_started = time.perf_counter()
    processor = AutoImageProcessor.from_pretrained(args.model)
    model = AutoModelForDepthEstimation.from_pretrained(args.model).to(device).eval()
    load_ms = (time.perf_counter() - load_started) * 1000.0
    inputs = {key: value.to(device) for key, value in processor(images=image, return_tensors="pt").items()}
    inference_started = time.perf_counter()
    with torch.inference_mode(), torch.autocast(device_type=device.type, dtype=torch.float16, enabled=actual_precision == "fp16"):
        outputs = model(**inputs)
    prediction = processor.post_process_depth_estimation(outputs, target_sizes=[(image.height, image.width)])[0]["predicted_depth"]
    depth = prediction.detach().float().cpu().numpy().astype(np.float32)
    inference_ms = (time.perf_counter() - inference_started) * 1000.0
    manifest = write_result(
        args.output, "depth-anything-v2.transformers", args.model, str(device), actual_precision,
        args.input, image, original_size, depth, depth_convention="relative-disparity-higher-near",
        metric=False, timings_ms={"modelLoad": load_ms, "inference": inference_ms}, point_budget=args.point_budget,
    )
    print(manifest)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Depth Anything V2 adapter failed: {error}", file=sys.stderr)
        raise
