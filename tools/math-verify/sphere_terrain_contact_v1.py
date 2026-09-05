#!/usr/bin/env python3
"""MATH_VERIFICATION for LAW: sphere_terrain_contact_v1 (see VERIFICATION.md).

Provider-agnostic math check for src/physics/rigidBody.mjs's sequential-impulse contact
solver -- today implemented with SymPy, because SHADED's own verification rule treats "the
mathematical checker" the same way SHADER_IR.md treats a shader language: a replaceable
implementer of a contract (symbolic equivalence, dimensional sanity, boundary conditions,
numerical reference cases, approximation error), not a load-bearing dependency on one vendor.
Wolfram may implement the same contract later, as a second checker or a replacement -- neither
changes what this contract has to prove.

Run: python3 tools/math-verify/sphere_terrain_contact_v1.py
"""
import sympy as sp

PASS = "PASS"
checks = []


def check(name, condition, detail=""):
    status = PASS if condition else "FAIL"
    checks.append((name, status, detail))
    print(f"{status}: {name}" + (f" -- {detail}" if detail else ""))


# ---------------------------------------------------------------- symbols
v_n, e, dt, g, drop_h = sp.symbols("v_n e dt g drop_h", real=True)

print("=== symbolic equivalence: sequential-impulse normal reflection ===")
# rigidBody.mjs: j = -(1+e) * relVelN ; v_n' = v_n + j  (unit mass, so impulse == delta-v)
j = -(1 + e) * v_n
v_n_after = sp.simplify(v_n + j)
classical_elastic_law = -e * v_n
check(
    "impulse formula reduces to the classical elastic collision law v_n' = -e * v_n",
    sp.simplify(v_n_after - classical_elastic_law) == 0,
    f"v_n' = {v_n_after}",
)

print("\n=== boundary conditions ===")
check(
    "e=0 (perfectly inelastic) leaves zero normal velocity after impact",
    sp.simplify(v_n_after.subs(e, 0)) == 0,
)
check(
    "e=1 (perfectly elastic) exactly reverses normal velocity, same magnitude",
    sp.simplify(v_n_after.subs(e, 1) + v_n) == 0,
)

print("\n=== friction cone: never reverses tangential velocity direction ===")
# rigidBody.mjs caps the friction impulse at F = min(mu * j_normal, tangentSpeed) -- the classic
# "friction cone." Proved via monotonicity rather than asserted: remaining_fraction(F) = 1 - F/S
# (S = tangentSpeed > 0) is affine in F with slope -1/S < 0, so it is monotonically decreasing;
# combined with its value at the two ends of the code's own enforced range F in [0, S], that pins
# it to [0, 1] for the entire range -- friction can only shrink the tangential vector toward zero,
# never past it or into reversal.
S = sp.Symbol("S", positive=True)  # tangentSpeed, > 0 in the branch this code guards (tangentSpeed > 1e-9)
F = sp.Symbol("F", nonnegative=True)  # the applied friction impulse magnitude, min(mu*j, S) by construction
remaining_fraction = 1 - F / S
slope = sp.diff(remaining_fraction, F)
value_at_zero_friction = remaining_fraction.subs(F, 0)
value_at_max_friction = remaining_fraction.subs(F, S)
check(
    "remaining_fraction is monotonically decreasing in F (more friction never adds tangential speed back)",
    sp.simplify(slope) == -1 / S,
)
check(
    "remaining_fraction spans exactly [0, 1] over F in [0, tangentSpeed] -- never negative (reversal) or > 1 (amplification)",
    value_at_zero_friction == 1 and sp.simplify(value_at_max_friction) == 0,
    f"remaining_fraction(F=0)={value_at_zero_friction}, remaining_fraction(F=S)={sp.simplify(value_at_max_friction)}",
)

print("\n=== numerical reference case: drop-bounce apex height ===")
# Energy/kinematics derivation, independent of the JS implementation:
#   v_impact = sqrt(2 * g * drop_h)          (free fall, distance drop_h)
#   v_bounce = e * v_impact                  (normal-reflection law proven above)
#   apex_h   = v_bounce^2 / (2 * g)          (rises until gravity cancels v_bounce)
v_impact_expr = sp.sqrt(2 * g * drop_h)
v_bounce_expr = e * v_impact_expr
apex_h_expr = sp.simplify(v_bounce_expr**2 / (2 * g))
expected = e**2 * drop_h
check(
    "derived apex height collapses to e^2 * dropHeight (the exact formula tools/test-world-sandbox-physics.mjs checks numerically)",
    sp.simplify(apex_h_expr - expected) == 0,
    f"apex_h = {apex_h_expr}",
)

print("\n=== approximation error: semi-implicit Euler's one-step contact overshoot ===")
# The module detects contact only AFTER a full dt of free-fall integration, so the velocity
# used in the impulse is g*dt higher in magnitude than the true continuous-time impact speed.
# Relative error should vanish as dt -> 0 (first-order / O(dt) consistency).
v_true = sp.Symbol("v_true", positive=True)
v_measured = v_true + g * dt
relative_error = sp.simplify((v_measured - v_true) / v_true)
limit_as_dt_to_0 = sp.limit(relative_error, dt, 0)
check(
    "discretization error vanishes as dt -> 0 (first-order consistency, not a fixed bias)",
    limit_as_dt_to_0 == 0,
    f"relative_error = {relative_error}, limit as dt->0 = {limit_as_dt_to_0}",
)
# And it's genuinely O(dt), not O(1) -- the error divided by dt has a finite, nonzero limit.
order_check = sp.limit(relative_error / dt, dt, 0)
check(
    "error is exactly first-order in dt (error/dt tends to a finite constant, g/v_true)",
    sp.simplify(order_check - g / v_true) == 0,
    f"error/dt -> {order_check}",
)

print()
failed = [c for c in checks if c[1] != PASS]
if failed:
    print(f"❌ {len(failed)} of {len(checks)} MATH_VERIFICATION checks failed")
    raise SystemExit(1)
print(f"✅ MATH_VERIFICATION for sphere_terrain_contact_v1: all {len(checks)} checks passed (SymPy {sp.__version__})")
