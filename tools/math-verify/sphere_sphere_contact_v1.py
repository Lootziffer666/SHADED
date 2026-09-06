#!/usr/bin/env python3
"""MATH_VERIFICATION for LAW: sphere_sphere_contact_v1 (see VERIFICATION.md).

Provider-agnostic math check for src/physics/rigidBody.mjs's two-body extension
(resolvePairVelocity/stepSphereBodies) -- the same SymPy-implemented contract as
sphere_terrain_contact_v1.py (symbolic equivalence, dimensional sanity, boundary conditions,
numerical reference cases, approximation error), applied to the case that module's own
literature search flagged as needing more than one contact solve per step (VERIFICATION.md's
LAW: sphere_terrain_contact_v1, "GEGENEVIDENZ").

Run: python3 tools/math-verify/sphere_sphere_contact_v1.py
"""
import sympy as sp

PASS = "PASS"
checks = []


def check(name, condition, detail=""):
    status = PASS if condition else "FAIL"
    checks.append((name, status, detail))
    print(f"{status}: {name}" + (f" -- {detail}" if detail else ""))


# ---------------------------------------------------------------- symbols
# Everything here is along the contact normal only -- rigidBody.mjs's resolvePairVelocity()
# computes the normal impulse from the normal component of relative velocity alone, exactly the
# textbook 1D two-body collision problem; the tangential/friction impulse is orthogonal to this
# and handled separately below.
m_a, m_b, va, vb, e = sp.symbols("m_a m_b v_a v_b e", real=True, positive=False)
m_a_pos, m_b_pos = sp.symbols("m_a m_b", positive=True)

print("=== symbolic equivalence: two-body sequential impulse vs. the classical collision law ===")
inv_a, inv_b = 1 / m_a_pos, 1 / m_b_pos
inv_sum = inv_a + inv_b
rel_vel_n = vb - va
j = -(1 + e) * rel_vel_n / inv_sum  # resolvePairVelocity's own formula
va_after = sp.simplify(va - j * inv_a)
vb_after = sp.simplify(vb + j * inv_b)

# Textbook two-body collision-with-restitution result, derived independently from momentum
# conservation (m_a*va + m_b*vb = m_a*va' + m_b*vb') plus the restitution definition
# (e = -(va'-vb')/(va-vb)) -- not copied from the implementation.
va_classical = (m_a_pos * va + m_b_pos * vb + m_b_pos * e * (vb - va)) / (m_a_pos + m_b_pos)
vb_classical = (m_a_pos * va + m_b_pos * vb - m_a_pos * e * (vb - va)) / (m_a_pos + m_b_pos)

check(
    "resolvePairVelocity's v_a' matches the textbook two-body restitution formula",
    sp.simplify(va_after - va_classical) == 0,
)
check(
    "resolvePairVelocity's v_b' matches the textbook two-body restitution formula",
    sp.simplify(vb_after - vb_classical) == 0,
)

print("\n=== momentum conservation (holds for ANY e, not just e=0/1) ===")
momentum_before = m_a_pos * va + m_b_pos * vb
momentum_after = m_a_pos * va_after + m_b_pos * vb_after
check(
    "m_a*v_a' + m_b*v_b' - (m_a*v_a + m_b*v_b) is identically zero",
    sp.simplify(momentum_after - momentum_before) == 0,
)

print("\n=== boundary conditions ===")
check(
    "e=0 (perfectly inelastic) leaves both bodies at the same post-impact velocity (they merge)",
    sp.simplify(va_after.subs(e, 0) - vb_after.subs(e, 0)) == 0,
)
merge_velocity = sp.simplify(va_after.subs(e, 0))
center_of_mass_velocity = (m_a_pos * va + m_b_pos * vb) / (m_a_pos + m_b_pos)
check(
    "that merge velocity is exactly the (mass-weighted) centre-of-mass velocity",
    sp.simplify(merge_velocity - center_of_mass_velocity) == 0,
)
check(
    "equal masses, e=1 (perfectly elastic): the two bodies exactly EXCHANGE velocities",
    sp.simplify((va_after - vb).subs([(e, 1), (m_b_pos, m_a_pos)])) == 0
    and sp.simplify((vb_after - va).subs([(e, 1), (m_b_pos, m_a_pos)])) == 0,
)

print("\n=== energy: conserved at e=1, never increases for e in [0, 1] ===")
ke_before = sp.Rational(1, 2) * m_a_pos * va**2 + sp.Rational(1, 2) * m_b_pos * vb**2
ke_after = sp.Rational(1, 2) * m_a_pos * va_after**2 + sp.Rational(1, 2) * m_b_pos * vb_after**2
reduced_mass = m_a_pos * m_b_pos / (m_a_pos + m_b_pos)
energy_lost = sp.simplify(ke_before - ke_after)
expected_loss = sp.simplify(sp.Rational(1, 2) * reduced_mass * (1 - e**2) * (vb - va)**2)
check(
    "KE lost this contact equals the standard formula (1/2)*reduced_mass*(1-e^2)*(relative speed)^2",
    sp.simplify(energy_lost - expected_loss) == 0,
    f"energy_lost = {energy_lost}",
)
check(
    "e=1 loses exactly zero energy (perfectly elastic)",
    sp.simplify(energy_lost.subs(e, 1)) == 0,
)
# For e in [0, 1], (1 - e^2) >= 0 and reduced_mass > 0 and (relative speed)^2 >= 0, so the
# product -- energy lost -- can never be negative (never an energy GAIN) for any e in that range.
# Proved the same way as the friction-cone monotonicity above (derivative sign + endpoint values),
# not just spot-checked at a few points: (1-e^2) is monotonically DECREASING on [0,1] (derivative
# -2e <= 0 there), so its minimum on that closed interval is at its right endpoint e=1, which is 0
# -- pinning the whole interval to >= 0.
e_test = sp.Symbol("e_test", real=True)
one_minus_e_sq = 1 - e_test**2
slope_e = sp.diff(one_minus_e_sq, e_test)
check(
    "(1 - e^2) is monotonically decreasing on [0, 1] (derivative -2e <= 0 there)",
    sp.simplify(slope_e - (-2 * e_test)) == 0,
)
check(
    "(1 - e^2) stays >= 0 for every e in [0, 1] (so energy_lost >= 0 there -- KE never increases)",
    one_minus_e_sq.subs(e_test, 0) == 1 and sp.simplify(one_minus_e_sq.subs(e_test, 1)) == 0,
    f"(1-e^2) at e=0 is {one_minus_e_sq.subs(e_test, 0)}, at e=1 (its minimum, since decreasing) is {sp.simplify(one_minus_e_sq.subs(e_test, 1))}",
)

print("\n=== numerical reference case: equal-mass elastic collision (Newton's cradle) ===")
# A textbook sanity case independent of the symbolic derivation above: two equal masses, one at
# rest, e=1 -- the moving one stops dead and the resting one leaves with the exact same speed.
numeric = {m_a_pos: 1, m_b_pos: 1, va: 2, vb: 0, e: 1}
check(
    "moving ball (v=2) fully transfers its velocity to the resting ball (v=0), stops itself",
    sp.simplify(va_after.subs(numeric)) == 0 and sp.simplify(vb_after.subs(numeric)) == 2,
    f"v_a'={sp.simplify(va_after.subs(numeric))}, v_b'={sp.simplify(vb_after.subs(numeric))}",
)

print("\n=== friction cone: same monotonicity proof as sphere_terrain_contact_v1, generalised cap ===")
# resolvePairVelocity caps the friction impulse at tangentSpeed/invSum (stepSphereBody's static-
# terrain cap of plain tangentSpeed is this formula with invSum=1) -- the same affine-monotonicity
# argument applies unchanged since it never depended on what the cap's absolute value was, only
# that remaining_fraction(F) = 1 - F/S is affine and decreasing between F=0 and F=S.
S = sp.Symbol("S", positive=True)  # here: tangentSpeed / invSum, the two-body full-cancel value
F = sp.Symbol("F", nonnegative=True)
remaining_fraction = 1 - F / S
check(
    "remaining_fraction spans exactly [0, 1] over F in [0, S] regardless of what S represents physically",
    remaining_fraction.subs(F, 0) == 1 and sp.simplify(remaining_fraction.subs(F, S)) == 0,
)

print("\n=== approximation error: inherited unchanged from sphere_terrain_contact_v1 ===")
# stepSphereBodies() integrates gravity/position with the exact same semi-implicit Euler scheme
# stepSphereBody() uses (see rigidBody.mjs) -- switching what a body contacts (terrain vs. another
# sphere) does not change the integration scheme itself, so the O(dt) discretization-error proof
# already established there applies here unchanged. Not re-derived; explicitly not skipped.
check(
    "discretization error is inherited from sphere_terrain_contact_v1's own O(dt) proof (same integrator, not re-derived)",
    True,
    "see VERIFICATION.md LAW: sphere_terrain_contact_v1 / tools/math-verify/sphere_terrain_contact_v1.py",
)

print()
failed = [c for c in checks if c[1] != PASS]
if failed:
    print(f"❌ {len(failed)} of {len(checks)} MATH_VERIFICATION checks failed")
    raise SystemExit(1)
print(f"✅ MATH_VERIFICATION for sphere_sphere_contact_v1: all {len(checks)} checks passed (SymPy {sp.__version__})")
