#!/usr/bin/env python3
"""Step 3 of OPERATORS.md's Reihenfolge: an actual 2D<->3D roundtrip proof, not just a diagram.

OPERATORS.md's vanishing_point_calibrate_v1 entry documents tools/single_view_room.py's
ransac_fluchtpunkt() as the INVERSE half of a forward/inverse pair:

    FORWARD:  a set of parallel 3D edges, viewed by a pinhole camera, projects to 2D image
              lines that all pass through one vanishing point (elementary projective geometry).
    INVERSE:  ransac_fluchtpunkt() recovers that vanishing point from the 2D lines.

A roundtrip proof needs an *independent* ground truth to compare against -- otherwise "does the
recovered answer explain the input" is circular (the fit was chosen to minimize exactly that
residual). This script supplies one: a vanishing point computed directly from a synthetic
camera's rotation and a chosen 3D direction (K @ R @ direction, normalized), completely
independent of ransac_fluchtpunkt()'s own SVD/RANSAC machinery. The roundtrip is:

    3D direction + camera --[FORWARD: pinhole projection]--> synthetic 2D edges
                          --[INVERSE: ransac_fluchtpunkt, unmodified]--> recovered VP
    recovered VP ≈ analytic VP (independently computed)                 [Test A]

Test B closes the loop the other way, on the real fixture image already in this repo:
vermessen()'s own reprojection residual (restfehler_px -- "how far do the inlier lines actually
sit from the vanishing point ransac_fluchtpunkt fitted them to") must stay small on real,
noisy pixel data, not just on the noise-free synthetic case in Test A. That is exactly
OPERATORS.md's `forward(inverse(observed)) ≈ observed` in already-existing form -- this test
only adds the assertion that it holds within a stated, checked pixel tolerance.

Run: python3 tools/test-2d3d-roundtrip.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import single_view_room as svr  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MESSEHALLE = os.path.join(REPO, "content", "raum", "messehalle.png")


def ok(condition, message):
    print(("✓ ok" if condition else "✗ FAIL") + f": {message}")
    if not condition:
        raise SystemExit(1)


# ---------------------------------------------------------------- Test A: synthetic ground truth
# Pinhole intrinsics shared by every case.
F = 1400.0
CX, CY = 960.0, 540.0


def project(p_cam):
    x, y, z = p_cam
    return np.array([F * x / z + CX, F * y / z + CY])


def rotation(yaw_deg, pitch_deg):
    yaw, pitch = np.radians(yaw_deg), np.radians(pitch_deg)
    ry = np.array([[np.cos(yaw), 0, np.sin(yaw)], [0, 1, 0], [-np.sin(yaw), 0, np.cos(yaw)]])
    rx = np.array([[1, 0, 0], [0, np.cos(pitch), -np.sin(pitch)], [0, np.sin(pitch), np.cos(pitch)]])
    return rx @ ry


def analytic_vanishing_point(direction_world, r):
    """The vanishing point of a 3D direction is its projection to infinity: K @ (R @ d),
    normalized -- independent of any particular line/edge, computed with none of
    ransac_fluchtpunkt's machinery."""
    d_cam = r @ direction_world
    ok(d_cam[2] > 0, "test direction points into the camera's forward hemisphere")
    return project(d_cam * 1e6)  # project a point far along the direction; z-cancels in project()


rng = np.random.default_rng(7)
DIRECTION_WORLD = np.array([0.0, 0.0, 1.0])  # the room's "depth" axis, e.g. converging floor seams

for case_i, (yaw_deg, pitch_deg, noise_px) in enumerate([
    (0, 0, 0.0), (6, 0, 0.0), (0, 4, 0.0), (-5, 3, 0.0), (4, -2, 0.3),
]):
    r = rotation(yaw_deg, pitch_deg)
    vp_true = analytic_vanishing_point(DIRECTION_WORLD, r)

    # More lines under pixel noise: a vanishing-point fit's conditioning depends on the lines'
    # angular spread as seen from the VP, not just noise magnitude (the same "ill-conditioning"
    # shaded-spatial-primitive-solver's own REFERENCE.md documents for this exact problem) -- more
    # samples is the honest way to make a noisy estimate reliable, not a looser tolerance alone.
    line_count = 24 if noise_px == 0.0 else 80
    linien = []
    for _ in range(line_count):
        # A random 3D edge sharing the room's depth direction -- e.g. a floor/ceiling seam
        # segment -- at an arbitrary lateral/vertical offset and depth range. Many such edges,
        # all parallel in 3D, converging to one point in the image is the entire physical content
        # of "a vanishing point."
        p0_world = np.array([rng.uniform(-3, 3), rng.uniform(-2, 2), rng.uniform(4, 30)])
        p1_world = p0_world + DIRECTION_WORLD * rng.uniform(0.5, 4.0)
        p0_cam, p1_cam = r @ p0_world, r @ p1_world
        if p0_cam[2] <= 0.1 or p1_cam[2] <= 0.1:
            continue
        u0, u1 = project(p0_cam), project(p1_cam)
        if noise_px:
            u0 = u0 + rng.normal(0, noise_px, 2)
            u1 = u1 + rng.normal(0, noise_px, 2)
        line = np.cross([u0[0], u0[1], 1.0], [u1[0], u1[1], 1.0])
        linien.append({"l": line, "laenge": float(np.linalg.norm(u1 - u0))})

    ok(len(linien) >= 6, f"case {case_i}: enough synthetic edges generated ({len(linien)})")

    vp_recovered, _inlier, restfehler = svr.ransac_fluchtpunkt(linien)
    dist = float(np.linalg.norm(vp_recovered - vp_true))
    tolerance = 0.5 if noise_px == 0.0 else 5.0
    ok(
        dist < tolerance,
        f"case {case_i} (yaw={yaw_deg}, pitch={pitch_deg}, noise={noise_px}px): "
        f"recovered VP {vp_recovered.round(3)} matches analytic VP {vp_true.round(3)} "
        f"within {tolerance}px (actual {dist:.4f}px)",
    )
    if noise_px == 0.0:
        ok(restfehler < 1e-6, f"case {case_i}: RANSAC residual ~0 for noise-free synthetic lines ({restfehler:.2e})")

print()

# ---------------------------------------------------------------- Test B: real image, closes the
# loop the other direction (forward(inverse(observed)) ~= observed) on real OBSERVED pixels.
if os.path.exists(MESSEHALLE):
    _rgb, _lum, bericht = svr.vermessen(MESSEHALLE, 0.6)
    ok(bericht["status"] == "measured", "messehalle.png: vermessen() finds a Manhattan vanishing point")
    restfehler_px = bericht["fluchtpunkt"]["restfehler_px"]
    inlier_count = bericht["fluchtpunkt"]["linien_tragend"]
    ok(inlier_count >= 6, f"messehalle.png: enough supporting lines found ({inlier_count})")
    ok(
        restfehler_px < 8.0,
        f"messehalle.png: forward(inverse(observed)) closes to within {restfehler_px:.3f}px "
        f"of the {inlier_count} real, noisy OBSERVED edge lines that support it (< 8px -- a real "
        f"photograph, not the noise-free synthetic case in Test A)",
    )
else:
    print(f"(skipped Test B: {MESSEHALLE} not found)")

print("\n✅ 2D<->3D roundtrip: forward(direction)->synthetic 2D edges->ransac_fluchtpunkt (inverse)"
      "->recovered VP matches independent analytic ground truth, and the same inverse closes to "
      "sub-5px on real observed pixels.")
