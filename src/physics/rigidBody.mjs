// SHADED's own physics layer (see PHYSICS.md) -- literature-derived core, not a donor port.
// First slice, matching PHYSICS.md's stated scope exactly ("Rigid Bodies + Contacts +
// Constraints + Queries + Terrain Collision + Material Response. Kein gigantischer
// Physics-Engine-Rewrite."): a sphere body, terrain contact, and a real impulse response,
// replacing the single hand-tuned "stone" in world-sandbox-runtime.mjs's old updateBody().
//
// Sources (PHYSICS.md's "Literaturkern"):
//   - integration: semi-implicit (symplectic) Euler -- the standard stable choice for real-time
//     rigid bodies (Baraff & Witkin, "Physically Based Modeling" course notes): integrate
//     velocity first, then advance position from the NEW velocity.
//   - contact/restitution impulse: Erin Catto, "Iterative Dynamics with Temporal Coherence" --
//     the sequential-impulse method behind Box2D/Bullet's contact solvers, applied here against
//     a static (infinite-mass) heightfield, so only this body's own velocity needs solving.
//   - Coulomb friction, capped by the normal impulse magnitude: same source, the standard
//     "friction cone" approximation.
//   - penetration correction: a Baumgarte-style positional correction (push the sphere out along
//     the contact normal, a fraction of the overlap per step) -- the simplest member of the
//     position-based family PHYSICS.md names (Muller et al. PBD / Macklin et al. XPBD), which is
//     all a single sphere against a static heightfield needs; a full PBD/XPBD solver is for when
//     there are constraints between bodies, which this slice does not have yet.
//
// Deliberately generic: this module knows spheres, gravity and a caller-supplied ground sample.
// It does not know SAND/WATER/COMPACTION or any other SHADED field -- that coupling (CONTACT ->
// world state, PHYSICS.md's "Fels-Test") is the caller's job, exactly like PHYSICS.md's own
// layering (PHYSICS is a layer MATTER/WORLD PROCESSES/LIFE sit on top of, not one that reaches up
// into them).

export const DEFAULT_RESTITUTION = 0.32;
export const DEFAULT_FRICTION = 0.55;

// Allowed micro-penetration before positional correction kicks in -- without this, a resting
// body's own weight re-penetrates by a hair every step and the correction fights gravity forever,
// which reads as jitter rather than rest.
const PENETRATION_SLOP = 0.0005;
// Fraction of remaining penetration corrected per step. 1.0 (instant full correction) turns
// contact into a teleport; this is the standard partial-correction compromise.
const BAUMGARTE = 0.2;
// Below this post-impact normal speed, treat the body as settled rather than still bouncing --
// purely a caller-facing classification (body.resting), it does not change the physics itself.
const RESTING_SPEED = 0.01;
// How far clear of the surface a body may drift on a no-penetration step and still count as
// resting rather than airborne -- must be a bit looser than PENETRATION_SLOP to cover the
// correction's own per-step overshoot, not just true rest.
const RESTING_GAP = 0.002;

export function createSphereBody({
  x = 0, y = 0, z = 0,
  vx = 0, vy = 0, vz = 0,
  radius = 0.02,
  restitution = DEFAULT_RESTITUTION,
  friction = DEFAULT_FRICTION,
} = {}) {
  return {x, y, z, vx, vy, vz, radius, restitution, friction, resting: false};
}

// Integrates one sphere body one fixed step against a heightfield ground and resolves contact.
//
// `groundSample(x, z)` must return {height, normalX, normalY, normalZ} (a unit normal) -- see
// groundHeightAndNormal() in world-sandbox-reference.mjs for SHADED's canonical sampler; any
// other heightfield (a different grid, a test fixture) works identically.
//
// `gravityY` is a signed acceleration (negative = down). `accelX/Y/Z` fold in any additional
// force this step already converted to acceleration -- buoyancy, drag, wind -- which is the
// caller's MATTER-layer concern, not this module's.
//
// Mutates `body` in place and returns a contact report the caller can turn into world-state
// consequences (`{contact: false}` when airborne this step).
export function stepSphereBody(body, groundSample, dt, {gravityY = -0.86, accelX = 0, accelY = 0, accelZ = 0} = {}) {
  body.vx += accelX * dt;
  body.vy += (gravityY + accelY) * dt;
  body.vz += accelZ * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.z += body.vz * dt;

  const ground = groundSample(body.x, body.z);
  const penetration = ground.height + body.radius - body.y;

  if (penetration <= 0) {
    // Not penetrating this exact step doesn't mean "airborne" -- a settled body oscillates by a
    // hair around the contact surface (the Baumgarte correction above only removes a fraction of
    // penetration per step, so it routinely overshoots slightly clear of the ground on a
    // no-penetration step right after a contact one). Only classify it as truly resting-vs-not by
    // how close and how slow it actually is, not by which side of exactly-zero this one step
    // landed on.
    const speed = Math.hypot(body.vx, body.vy, body.vz);
    body.resting = -penetration < RESTING_GAP && speed < RESTING_SPEED;
    return {contact: false};
  }

  const nx = ground.normalX;
  const ny = ground.normalY;
  const nz = ground.normalZ;

  const correction = Math.max(0, penetration - PENETRATION_SLOP) * BAUMGARTE;
  body.x += nx * correction;
  body.y += ny * correction;
  body.z += nz * correction;

  const relVelN = body.vx * nx + body.vy * ny + body.vz * nz;
  let impactSpeed = 0;
  if (relVelN < 0) {
    impactSpeed = -relVelN;
    // Box2D's b2_velocityThreshold trick (Erin Catto): below a small multiple of one step's own
    // gravity, an impact isn't a bounce, it's gravity re-penetrating a body that's already at
    // rest. Applying full restitution to that residual forever reflects it back out at ~gravityY
    // * dt every single step -- a body resting under gravity can never actually reach zero
    // velocity, it just oscillates at that floor forever. Below the threshold, restitution drops
    // to zero and the impulse purely cancels the normal velocity instead of reflecting it.
    const restitutionThreshold = Math.abs(gravityY) * dt * 2;
    const restitution = impactSpeed > restitutionThreshold ? body.restitution : 0;
    // Unit-mass sequential impulse: j = -(1+e) * (v . n); the terrain is static (infinite mass,
    // zero velocity), so nothing from its side enters the formula.
    const j = -(1 + restitution) * relVelN;
    body.vx += j * nx;
    body.vy += j * ny;
    body.vz += j * nz;

    // Tangential velocity that survives the normal impulse -- this is what actually rolls a
    // sphere downhill on a slope, since only the normal component was just cancelled/reflected.
    const vn2 = body.vx * nx + body.vy * ny + body.vz * nz;
    const tx = body.vx - vn2 * nx;
    const ty = body.vy - vn2 * ny;
    const tz = body.vz - vn2 * nz;
    const tangentSpeed = Math.hypot(tx, ty, tz);
    if (tangentSpeed > 1e-9) {
      // Coulomb friction, capped by the normal impulse (the "friction cone") so a shallow, slow
      // impact can't brake a body harder than the contact itself allows.
      const frictionImpulse = Math.min(body.friction * j, tangentSpeed);
      const scale = frictionImpulse / tangentSpeed;
      body.vx -= tx * scale;
      body.vy -= ty * scale;
      body.vz -= tz * scale;
    }
    body.resting = impactSpeed <= restitutionThreshold;
  } else {
    body.resting = true;
  }

  return {
    contact: true,
    impactSpeed,
    x: body.x,
    y: body.y,
    z: body.z,
    normalX: nx,
    normalY: ny,
    normalZ: nz,
  };
}
