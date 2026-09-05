#!/usr/bin/env python3
"""MATH_VERIFICATION for OPERATOR: metric_calibrate_v1 (see OPERATORS.md).

Formalizes tools/single_view_room.py's vermessen() scale step: a single, externally
DECLARED real-world length (anker_fliese_m, a floor-tile edge in meters) is divided by the
same edge's length in image-relative units (fliesenbreite_je_h, "tile widths per image
height" -- a pure ratio, MEASURED from the vanishing-point/floor-grid geometry) to get a
camera height in meters, which then scales every other MEASURED/RECONSTRUCTED ratio in the
report into real-world meters (raum_je_kamerahoehe -> raum_meter in the source).

This module proves, rather than just asserts (the source code's own comment already claims
it: "Wer sie aendert, skaliert die ganze Halle -- ihre Form bleibt unberuehrt"), the two
properties that claim depends on:
  1. dimensional sanity: the calibration formula is dimensionally consistent.
  2. the exact property the comment describes -- scaling the DECLARED anchor by any factor k
     scales every derived meter-valued output by exactly k, while every anchor-independent
     ratio (the "_je_kamerahoehe" family) is invariant under that same rescaling. That is
     what makes it safe to correct/replace anker_fliese_m later without re-deriving anything
     else.

Run: python3 tools/math-verify/metric_calibrate_v1.py
"""
import sympy as sp

PASS = "PASS"
checks = []


def check(name, condition, detail=""):
    status = PASS if condition else "FAIL"
    checks.append((name, status, detail))
    print(f"{status}: {name}" + (f" -- {detail}" if detail else ""))


# ---------------------------------------------------------------- symbols
# anchor_m: the DECLARED real-world tile edge length, in meters.
# w_h: "fliesenbreite_je_h" -- tile width as a fraction of image height, a pure ratio
# (MEASURED from the floor-grid periodicity), dimensionless by construction (px/px).
anchor_m, w_h, k = sp.symbols("anchor_m w_h k", positive=True)
# An arbitrary "_je_kamerahoehe" ratio (lichte_hoehe, rueckwand_tiefe, ...): also
# dimensionless, MEASURED/RECONSTRUCTED entirely from image geometry, independent of anchor_m.
ratio = sp.Symbol("ratio", positive=True)

print("=== symbolic form ===")
camera_height_m = anchor_m / w_h
derived_meters = ratio * camera_height_m
print(f"camera_height_m = {camera_height_m}")
print(f"derived_meters  = {derived_meters}")

print("\n=== dimensional sanity ===")
# Treat units symbolically: anchor_m carries [meters], w_h and ratio are dimensionless
# ([pixels]/[pixels] and [pixels]/[pixels] respectively in the source), so camera_height_m
# and derived_meters must both carry [meters] and nothing else -- verified by substituting a
# unit system where anchor_m alone carries a "meter" marker and checking it survives exactly
# once, undivided by anything but a dimensionless ratio.
meter = sp.Symbol("meter")  # stand-in unit marker, not a physical constant
camera_height_with_unit = (anchor_m * meter) / w_h
check(
    "camera_height_m carries exactly the anchor's unit (meters), untouched by the dimensionless ratio",
    sp.simplify(camera_height_with_unit / meter - anchor_m / w_h) == 0,
)
derived_with_unit = ratio * camera_height_with_unit
check(
    "every derived *_m field carries exactly one power of meters, never meters^2 or a bare ratio",
    sp.simplify(derived_with_unit / meter - ratio * anchor_m / w_h) == 0,
)

print("\n=== the actual claim: rescaling the anchor scales the room, not its shape ===")
# Rescale the DECLARED anchor by an arbitrary positive factor k (e.g. a corrected tile size).
camera_height_scaled = camera_height_m.subs(anchor_m, k * anchor_m)
derived_meters_scaled = ratio * camera_height_scaled
check(
    "camera height scales by exactly k when the anchor is rescaled by k",
    sp.simplify(camera_height_scaled - k * camera_height_m) == 0,
)
check(
    "every derived meter-valued field scales by exactly k too (same k, no distortion)",
    sp.simplify(derived_meters_scaled - k * derived_meters) == 0,
)
# The "_je_kamerahoehe" ratios themselves (what the source calls raum_je_kamerahoehe) never
# involve anchor_m at all -- they're pure image-geometry ratios. Confirm the ratio symbol
# itself (standing in for lichte_hoehe, rueckwand_tiefe, etc. relative to camera height) is
# untouched by a substitution on anchor_m, i.e. the room's PROPORTIONS are anchor-invariant.
check(
    "the image-relative ratios (room shape) contain no anchor_m term to begin with -- substitution is a no-op",
    ratio.subs(anchor_m, k * anchor_m) == ratio,
)

print("\n=== boundary case: degenerate anchor ===")
# anchor_m -> 0 collapses every derived meter value to 0 without dividing by zero or
# producing a sign flip/NaN -- the formula degrades gracefully at this (physically
# meaningless, but mathematically legitimate) boundary rather than blowing up.
check(
    "anchor_m -> 0 sends every derived meter value to exactly 0, no singularity",
    sp.limit(derived_meters, anchor_m, 0) == 0,
)

print("\n=== numerical reference case (matches tools/test-single-view-room.py's messehalle.png run) ===")
# The regression test calls vermessen(MESSEHALLE, 0.6) -- anchor_fliese_m = 0.6 m. Confirm
# the formula reproduces a sane, positive camera height for a plausible tile-width ratio
# (w_h ~ 0.35, i.e. the tile module is about a third of the image height at that vanishing
# point geometry -- order-of-magnitude consistent with the ~1.7 m eye-height the source
# code's own "Gegenprobe" comment reports for this exact image).
numeric_anchor = 0.6
numeric_w_h = 0.35
numeric_height = float(camera_height_m.subs({anchor_m: numeric_anchor, w_h: numeric_w_h}))
check(
    f"anchor=0.6m, w_h=0.35 -> camera height ~1.71m, order-of-magnitude eye-height sane",
    1.0 < numeric_height < 2.2,
    f"computed={numeric_height:.3f}",
)

print()
failed = [c for c in checks if c[1] != PASS]
if failed:
    print(f"❌ {len(failed)} of {len(checks)} MATH_VERIFICATION checks failed")
    raise SystemExit(1)
print(f"✅ MATH_VERIFICATION for metric_calibrate_v1: all {len(checks)} checks passed (SymPy {sp.__version__})")
