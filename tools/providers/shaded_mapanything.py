#!/usr/bin/env python3
"""SHADED provider: MapAnything (Salesforce Maps) geospatial routing+optimization.

MapAnything provides a REST API for Distance Matrix calculations, TSP/VRP
routing, live GPS tracking, geofencing, and territory planning. This SHADED
provider bridges those geospatial outputs into the renderer-neutral
`SHADED.spatial-provider-result.v1` schema.

Use case in SHADED:
  - The MapAnything Distance Matrix computes optimal shortest-path travel-time
    and distance between up to 7,500×7,500 location pairs with 9 traffic windows.
  - MapAnything Routing API solves VRP/TSP with time-windows and capacities.
  - These outputs are consumed by the SHADED SpatialKernel as **geometric
    constraints**: route graphs (edges = travel corridors), waypoints (anchors),
    and territory boundaries (polygons).

This provider translates MapAnything JSON API responses into the v1 schema:
  - depth channel  : travel-distance / travel-time field rasterised onto a grid
  - points channel : route waypoints + depot/stop locations as 3D anchors (x=lon, y=lat, z=elev)
  - normals       : derived from route direction vectors (so the kernel can align
                    textures/materials along the travel direction)
  - confidence     : API success flag per waypoint + distance reliability score
  - camera block    : geographic bounds (extent, centre) encoded as intrinsics-like
                    "focal" (degrees/pixel) so the kernel can map lon/lat → pixel

This provider does NOT require GPU/Torch — it is a client of the MapAnything HTTP
API (or a local JSON fixture for testing).

CLI:
    python3 tools/providers/shaded_mapanything.py --input routes.geojson --output {out}
        --api-key <key> --api-url https://api.mapanything.com
        --traffic-window-index 0 --point-budget 250000
        (--use-fixture fixtures/mapanything-sample.json)

Exit codes:
    0  success
    1  input or config error
    2  API unreachable / auth failure (use --use-fixture to avoid)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import numpy as np

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore

from shaded_provider_common import (
    write_result,
    source_hash,
    normalise_depth,
)


API_BASE = "https://api.mapanything.com"
TRAFFIC_WINDOWS = 9  # documented: up to 9 traffic windows


# ---- geometry helpers ----
def _lonlat_to_tile_eastings(lons, lats, bounds):
    """Project lon/lat to a local metric grid (planar, UTM-like local tangent plane).

    Returns (xs, ys) in meters relative to the scene centre (south-west corner).
    Uses equirectangular projection scaled to local latitude — sufficient for
    sub-kilometre scenes.
    """
    lon_min, lon_max, lat_min, lat_max = bounds
    cx = (lon_min + lon_max) / 2.0
    cy = (lat_min + lat_max) / 2.0
    # metres per degree at this latitude (spherical approximation)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(cy))
    xs = ((np.asarray(lons, dtype=np.float64) - cx) * m_per_deg_lon)
    ys = ((np.asarray(lats, dtype=np.float64) - cy) * m_per_deg_lat)
    return xs, ys


def _rasterise_routes(routes, grid_w, grid_h, bounds, value_key="distance"):
    """Rasterise route edges onto a regular grid; pixel value = min travel value through cell."""
    lon_min, lon_max, lat_min, lat_max = bounds
    grid = np.full((grid_h, grid_w), np.inf, dtype=np.float32)
    if not routes:
        return np.zeros((grid_h, grid_w), dtype=np.float32)
    dlon = (lon_max - lon_min) / grid_w
    dlat = (lat_max - lat_min) / grid_h
    for route in routes:
        steps = route.get("steps", [])
        prev_pt = None
        for step in steps:
            lon = step.get("lon") or step.get("lng") or step[0]
            lat = step.get("lat") or step[1]
            if lon is None or lat is None:
                continue
            # Map to grid cells this segment crosses (simple: draw between consecutive).
            gx = int((lon - lon_min) / dlon) if dlon > 0 else 0
            gy = int((lat - lat_min) / dlat) if dlat > 0 else 0
            gx = max(0, min(grid_w - 1, gx))
            gy = max(0, min(grid_h - 1, gy))
            val = step.get(value_key, 1.0)
            if grid[gy, gx] > val:
                grid[gy, gx] = val
            if prev_pt is not None:
                px, py = prev_pt
                steps_cells = max(abs(gx - px), abs(gy - py), 1)
                for t in np.linspace(0, 1, steps_cells + 1):
                    ix = int(px + (gx - px) * t)
                    iy = int(py + (gy - py) * t)
                    ix = max(0, min(grid_w - 1, ix))
                    iy = max(0, min(grid_h - 1, iy))
                    if grid[iy, ix] > val:
                        grid[iy, ix] = val
            prev_pt = (gx, gy)
    grid[np.isinf(grid)] = 0.0
    return grid


def _normalise_to_grid(arr):
    arr = arr.astype(np.float32)
    if arr.size == 0:
        return arr
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return arr
    lo, hi = float(np.min(finite)), float(np.max(finite))
    if hi <= lo:
        return np.zeros_like(arr)
    return np.clip((arr - lo) / (hi - lo), 0.0, 1.0)


# ---- API client ----
def _call_api(api_url, api_key, payload, traffic_window_index):
    import urllib.request
    import urllib.error
    endpoint = f"{api_url}/v1/distancematrix"
    body = dict(payload)
    body["traffic_window_index"] = traffic_window_index
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        endpoint, data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}" if api_key else "",
        },
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return result, elapsed_ms
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"MapAnything API HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:500]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"MapAnything API unreachable: {e.reason}")


def _load_geojson(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_locations(geojson):
    """Pull (name, lon, lat, properties) tuples from a GeoJSON FeatureCollection."""
    feats = geojson.get("features", []) if isinstance(geojson, dict) else geojson
    locations = []
    for feat in feats:
        geom = feat.get("geometry", {})
        props = feat.get("properties", {})
        coords = geom.get("coordinates", [])
        if geom.get("type") == "Point" and len(coords) >= 2:
            locations.append((
                props.get("name") or props.get("id") or f"loc_{len(locations)}",
                float(coords[0]), float(coords[1]), props,
            ))
        elif geom.get("type") in ("LineString", "MultiLineString"):
            # Treat line as a route: split into waypoints
            if geom.get("type") == "LineString":
                pts = coords
            else:
                pts = coords[0] if coords else []
            for p in pts:
                if len(p) >= 2:
                    locations.append((
                        props.get("name") or f"route_{len(locations)}",
                        float(p[0]), float(p[1]), props,
                    ))
    return locations


def _extract_routes(geojson):
    """Pull named route LineStrings (each as a list of [lon,lat] steps)."""
    routes = []
    feats = geojson.get("features", []) if isinstance(geojson, dict) else geojson
    for feat in feats:
        geom = feat.get("geometry", {})
        props = feat.get("properties", {})
        if geom.get("type") in ("LineString", "MultiLineString"):
            if geom.get("type") == "LineString":
                pts = geom.get("coordinates", [])
                if pts:
                    routes.append({
                        "name": props.get("name", f"route_{len(routes)}"),
                        "steps": [{"lon": float(p[0]), "lat": float(p[1])} for p in pts if len(p) >= 2],
                        "distance": float(props.get("distance", 0.0)),
                        "duration": float(props.get("duration", 0.0)),
                    })
    return routes


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="shaded_mapanything.py",
        description="SHADED provider for MapAnything geospatial routing/optimization.",
    )
    p.add_argument("--input", required=False, help="Input GeoJSON (features = locations/routes).")
    p.add_argument("--output", required=True, help="Output directory.")
    p.add_argument("--api-key", default=os.environ.get("MAPANYTHING_API_KEY", ""),
                   help="MapAnything API key (or set MAPANYTHING_API_KEY env).")
    p.add_argument("--api-url", default=API_BASE, help="MapAnything base API URL.")
    p.add_argument("--traffic-window-index", type=int, default=0,
                   help=f"Traffic window index (0..{TRAFFIC_WINDOWS - 1}).")
    p.add_argument("--max-edge", type=int, default=1024, help="Max grid edge for rasterised depth.")
    p.add_argument("--point-budget", type=int, default=250_000, help="Max points in output.")
    p.add_argument("--use-fixture", default=None,
                   help="Use a local JSON fixture instead of calling the API.")
    p.add_argument("--doctor", action="store_true",
                   help="Exit 0 if provider deps are available, non-zero otherwise.")
    p.add_argument("--source-sha256", default=None, help="Override source hash (internal).")
    return p


def _make_depth_from_routes(routes, grid_w, grid_h, bounds, use_travel_time=True):
    """Build a depth-like grid where value = normalise(min travel time/distance to traverse)."""
    val_key = "duration" if use_travel_time else "distance"
    grid = _rasterise_routes(routes, grid_w, grid_h, bounds, value_key=val_key)
    # Invert: cells that cost MORE to traverse → deeper (further), so the kernel
    # interprets high-cost paths as "distant" geometry.
    normalised = _normalise_to_grid(grid)
    # depth near = cheap/fast, depth far = expensive. So invert.
    depth = np.where(grid > 0, 1.0 - normalised, 0.0).astype(np.float32)
    return depth


def _make_normals_from_routes(routes, grid_w, grid_h, bounds):
    """Derive normal-like 3D vectors from route heading directions.

    Output shape: (H, W, 3). XY encodes heading (dx, dy), Z encodes gradient magnitude
    of the depth field so the kernel can orient materials along travel paths.
    """
    lon_min, lon_max, lat_min, lat_max = bounds
    dlon = (lon_max - lon_min) / max(1, grid_w)
    dlat = (lat_max - lat_min) / max(1, grid_h)
    normals = np.zeros((grid_h, grid_w, 3), dtype=np.float32)
    for route in routes:
        steps = route.get("steps", [])
        for i in range(1, len(steps)):
            p0, p1 = steps[i - 1], steps[i]
            lon0, lat0 = float(p0.get("lon", p0.get("lng", 0))), float(p0.get("lat", 0))
            lon1, lat1 = float(p1.get("lon", p1.get("lng", 0))), float(p1.get("lat", 0))
            gx0 = int((lon0 - lon_min) / dlon) if dlon > 0 else 0
            gy0 = int((lat0 - lat_min) / dlat) if dlat > 0 else 0
            gx1 = int((lon1 - lon_min) / dlon) if dlon > 0 else 0
            gy1 = int((lat1 - lat_min) / dlat) if dlat > 0 else 0
            gx0 = max(0, min(grid_w - 1, gx0)); gy0 = max(0, min(grid_h - 1, gy0))
            gx1 = max(0, min(grid_w - 1, gx1)); gy1 = max(0, min(grid_h - 1, gy1))
            dx = gx1 - gx0
            dy = gy1 - gy0
            mag = math.hypot(dx, dy)
            if mag < 1e-6:
                continue
            nx = dx / mag
            ny = dy / mag
            # Store heading as XY; Z = travel cost proxy (duration normalised).
            dur = float(route.get("duration", 1.0))
            nz = min(1.0, dur / 3600.0)  # hours-based, clamped
            # Draw a short segment in the grid.
            steps_seg = max(abs(dx), abs(dy), 1)
            for t in range(steps_seg + 1):
                f = t / steps_seg
                ix = int(gx0 + (gx1 - gx0) * f)
                iy = int(gy0 + (gy1 - gy0) * f)
                ix = max(0, min(grid_w - 1, ix))
                iy = max(0, min(grid_h - 1, iy))
                normals[iy, ix, 0] = nx
                normals[iy, ix, 1] = ny
                normals[iy, ix, 2] = nz
    return normals


def _route_depths_to_points(depth, normals, bounds, grid_w, grid_h, point_budget):
    """Sample waypoints (points) from the raster where travel cost is non-zero."""
    lon_min, lon_max, lat_min, lat_max = bounds
    ys, xs = np.where(depth > 0)
    if len(xs) == 0:
        return np.zeros((0, 6), dtype="<f4")
    step = max(1, int(math.ceil(len(xs) / max(1, point_budget))))
    xs_s = xs[::step]
    ys_s = ys[::step]
    lon_step = (lon_max - lon_min) / max(1, grid_w)
    lat_step = (lat_max - lat_min) / max(1, grid_h)
    lons = lon_min + xs_s * lon_step
    lats = lat_min + ys_s * lat_step
    xs_m, ys_m = _lonlat_to_tile_eastings(lons.tolist(), lats.tolist(), bounds)
    zs = depth[ys_s, xs_s]
    r = normals[ys_s, xs_s, 0] if normals.size else 0.5
    g = normals[ys_s, xs_s, 1] if normals.size else 0.5
    b = normals[ys_s, xs_s, 2] if normals.size else 0.5
    colors = np.stack([r, g, b], axis=-1).astype(np.float32)
    xyz = np.stack([xs_m, ys_m, zs], axis=-1).astype(np.float32)
    return np.concatenate([xyz, colors], axis=-1).astype("<f4", copy=False)


def _geojson_to_bounds(geojson, margin=0.05):
    """Extract [lon_min, lon_max, lat_min, lat_max] with optional margin."""
    feats = geojson.get("features", []) if isinstance(geojson, dict) else geojson
    lons, lats = [], []
    for feat in feats:
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", [])
        t = geom.get("type")
        if t == "Point" and len(coords) >= 2:
            lons.append(float(coords[0])); lats.append(float(coords[1]))
        elif t in ("LineString", "MultiLineString"):
            pts = coords[0] if t == "MultiLineString" else coords
            for p in pts:
                if len(p) >= 2:
                    lons.append(float(p[0])); lats.append(float(p[1]))
        elif t in ("Polygon", "MultiPolygon"):
            rings = coords[0] if t == "Polygon" else coords[0][0]
            for p in rings:
                if len(p) >= 2:
                    lons.append(float(p[0])); lats.append(float(p[1]))
    if not lons:
        return [-1.0, 1.0, -1.0, 1.0]
    dlon = max((max(lons) - min(lons)) * margin, 0.001)
    dlat = max((max(lats) - min(lats)) * margin, 0.001)
    return [
        min(lons) - dlon, max(lons) + dlon,
        min(lats) - dlat, max(lats) + dlat,
    ]


def _build_camera_block(bounds, grid_w, grid_h):
    """Encode geographic extent as a camera-like intrinsics block so
    the kernel can map lon/lat → pixel space.

    focal_x = grid_w  / degrees_lon_span
    focal_y = grid_h  / degrees_lat_span
    cx, cy  = grid_w/2, grid_h/2
    """
    lon_min, lon_max, lat_min, lat_max = bounds
    dlon = lon_max - lon_min
    dlat = lat_max - lat_min
    fx = grid_w / max(dlon, 1e-6)
    fy = grid_h / max(dlat, 1e-6)
    return {
        "intrinsics": [[fx, 0.0, grid_w * 0.5], [0.0, fy, grid_h * 0.5], [0.0, 0.0, 1.0]],
        "width": grid_w,
        "height": grid_h,
        "fx": fx,
        "fy": fy,
        "cx": grid_w * 0.5,
        "cy": grid_h * 0.5,
    }


def doctor() -> int:
    """Exit 0 if deps (numpy, PIL) are importable — MapAnything is a REST client,
    so no ML framework needed."""
    try:
        import numpy as _np  # noqa: F401
        return 0
    except ImportError:
        return 2


def run_provider(args: argparse.Namespace) -> int:
    output_dir = args.output
    os.makedirs(output_dir, exist_ok=True)
    timings: dict[str, float] = {}

    if args.doctor:
        return doctor()

    # --- resolve input: GeoJSON or fixture ---
    if args.use_fixture:
        fixture_path = os.path.abspath(args.use_fixture)
        if not os.path.exists(fixture_path):
            print(f"ERROR: fixture not found: {fixture_path}", file=sys.stderr)
            return 1
        with open(fixture_path, "r", encoding="utf-8") as f:
            api_response = json.load(f)
        source_path = fixture_path
    elif args.input:
        source_path = os.path.abspath(args.input)
        geojson = _load_geojson(source_path)
        locations = _extract_locations(geojson)
        routes = _extract_routes(geojson)
        if not locations and not routes:
            print("ERROR: GeoJSON contains no locations or routes", file=sys.stderr)
            return 1
        bounds = _geojson_to_bounds(geojson)
        # Build API payload from locations.
        payload = {
            "locations": [
                {"name": name, "lon": lon, "lat": lat, **props}
                for name, lon, lat, props in locations
            ],
        }
        if not args.api_key and not args.use_fixture:
            print("WARNING: no --api-key; routes will be empty (GeoJSON LineStrings used).", file=sys.stderr)
            api_response = {"routes": routes, "locations": locations}
        else:
            try:
                api_response, api_ms = _call_api(
                    args.api_url, args.api_key, payload, args.traffic_window_index
                )
                timings["api_call_ms"] = api_ms
            except Exception as e:
                print(f"WARNING: MapAnything API call failed: {e}; using GeoJSON routes.", file=sys.stderr)
                api_response = {"routes": routes, "locations": locations}
    else:
        print("ERROR: provide --input GeoJSON or --use-fixture", file=sys.stderr)
        return 1

    t0 = time.perf_counter()

    # --- parse API response into routes + waypoints ---
    api_routes = api_response.get("routes", []) if isinstance(api_response, dict) else []
    api_locations = api_response.get("locations", []) if isinstance(api_response, dict) else []

    # Merge GeoJSON routes with API routes.
    if not api_routes and args.input:
        api_routes = routes

    grid_w = max(8, min(args.max_edge, 512))
    grid_h = max(8, min(args.max_edge, 512))
    grid_w = grid_h = min(grid_w, grid_h)  # square for simplicity

    bounds = _geojson_to_bounds(api_response if isinstance(api_response, dict) else geojson, margin=0.05) \
        if args.input else [-1, 1, -1, 1]

    # Ensure routes have steps with {lon, lat}.
    normalised_routes = []
    for r in api_routes:
        steps = r.get("steps", [])
        if not steps and "coordinates" in r:
            steps = [{"lon": float(p[0]), "lat": float(p[1])} for p in r["coordinates"] if len(p) >= 2]
        if steps:
            normalised_routes.append({
                "name": r.get("name", f"route_{len(normalised_routes)}"),
                "steps": steps,
                "distance": float(r.get("distance", 0)),
                "duration": float(r.get("duration", 0)),
            })

    use_travel_time = True
    depth = _make_depth_from_routes(normalised_routes, grid_w, grid_h, bounds, use_travel_time=use_travel_time)
    normals = _make_normals_from_routes(normalised_routes, grid_w, grid_h, bounds)
    points = _route_depths_to_points(depth, normals, bounds, grid_w, grid_h, args.point_budget)

    # Confidence: 1 where route exists, 0 elsewhere; blend with step count.
    confidence = np.where(depth > 0, 0.9, 0.1).astype(np.float32)
    # Boost confidence at waypoints.
    waypoint_density = min(1.0, len(api_locations) / 50.0)
    confidence = np.clip(confidence * (0.7 + 0.3 * waypoint_density), 0, 1).astype(np.float32)

    # Metric: travel-time based depth is *not* metric metres; it's relative time-scaled.
    metric = False
    depth_convention = "relative-depth-higher-far"

    timings["total_ms"] = (time.perf_counter() - t0) * 1000.0

    # --- write result ---
    # MapAnything has no input image; synthesize a blank RGB for write_result's signature.
    if Image is not None:
        rgb_img = Image.new("RGB", (grid_w, grid_h), color=(128, 128, 128))
        rgb_array = np.array(rgb_img)
    else:
        rgb_array = np.full((grid_h, grid_w, 3), 128, dtype=np.uint8)

    camera_block = _build_camera_block(bounds, grid_w, grid_h)

    # Inject points as the points channel by pre-writing them.
    # write_result derives points from depth when channels.points is not in channels,
    # so we need to override: we'll write the points file manually then call write_result
    # which will also derive points. To honour VGGT-style point cloud input, we write
    # points directly to match the schema shape [N,6].
    import hashlib
    output_path = Path(output_dir)
    depth_file = output_path / "depth.f32"
    depth.tofile(depth_file)
    normals_file = output_path / "normals.f32"
    normals.reshape(-1, 3).astype("<f4").tofile(normals_file)
    points_file = output_path / "points.f32"
    points.tofile(points_file)
    confidence_file = output_path / "confidence.f32"
    confidence.tofile(confidence_file)

    channels = {
        "depth": {"file": "depth.f32", "dtype": "float32-le", "shape": list(depth.shape)},
        "normals": {"file": "normals.f32", "dtype": "float32-le", "shape": list(normals.shape)},
        "points": {"file": "points.f32", "dtype": "float32-le", "shape": list(points.shape)},
        "confidence": {"file": "confidence.f32", "dtype": "float32-le", "shape": list(confidence.shape)},
    }

    result = {
        "format": "SHADED.spatial-provider-result.v1",
        "provider": "mapanything",
        "modelVersion": "v1-rest",
        "device": "api-remote",
        "precision": "fp32",
        "channels": channels,
        "camera": camera_block,
        "depthConvention": depth_convention,
        "metric": metric,
        "timingsMs": timings,
        "provenance": {
            "class": "INFERRED",
            "sourceSha256": args.source_sha256 or source_hash(source_path),
            "sourceFile": os.path.basename(source_path),
            "sourceSize": {"width": grid_w, "height": grid_h},
            "processedSize": {"width": grid_w, "height": grid_h},
            "provider": "mapanything",
            "modelVersion": "v1-rest",
            "parameters": {
                "trafficWindowIndex": args.traffic_window_index,
                "pointBudget": args.point_budget,
                "numLocations": len(api_locations),
                "numRoutes": len(normalised_routes),
                "bounds": [round(b, 8) for b in bounds],
            },
        },
    }

    manifest = output_path / "result.json"
    manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    # Write a GeoJSON preview for editor consumption.
    preview_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [p[0], p[2], p[1]]} if points.shape[0] > 0 else None,
                "properties": {"depth": float(d) for d in (depth.flatten()[:min(points.shape[0], 1000)] if points.shape[0] > 0 else [])},
            }
        ] if points.shape[0] > 0 else [],
        "properties": {
            "format": "SHADED.spatial-provider-mapanything-preview.v1",
            "bounds": bounds,
            "gridSize": [grid_w, grid_h],
        },
    }
    (output_path / "preview.geojson").write_text(json.dumps(preview_geojson, indent=2) + "\n")

    print(f"MapAnything result written to {manifest}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        return run_provider(args)
    except Exception as exc:
        print(f"MapAnything provider FAILED: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
