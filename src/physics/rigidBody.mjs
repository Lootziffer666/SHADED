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
  mass = 1,
  restitution = DEFAULT_RESTITUTION,
  friction = DEFAULT_FRICTION,
} = {}) {
  // invMass, not mass, is what every impulse formula below actually divides by (Catto's
  // sequential-impulse derivation uses 1/m throughout so a zero-mass/infinite-mass body -- a
  // static wall, here unused but kept for completeness -- drops out of the equations instead of
  // dividing by zero). stepSphereBody (single-body vs. static terrain) never reads mass at all --
  // the terrain has no mass of its own to weigh against, so this field is inert there and only
  // matters once a body contacts another body via stepSphereBodies() below.
  const invMass = mass > 0 ? 1 / mass : 0;
  return {x, y, z, vx, vy, vz, radius, mass, invMass, restitution, friction, resting: false};
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

// -------------------------------------------------------------------------------------------
// Multi-body extension (PHYSICS.md "Rigid Bodies + Contacts", the limitation this module's
// terrain-only slice above named as its own open point). stepSphereBody() resolves one sphere
// against a static, infinite-mass heightfield -- correct as far as it goes
// (VERIFICATION.md's LAW: sphere_terrain_contact_v1), but that same law's own literature search
// names exactly what breaks once bodies can hit EACH OTHER: a single, unrepeated pass of
// sequential impulses loses measurable accuracy (angular velocity, energy) at multi-body/
// multi-point contact versus either a real constraint solver or -- Catto/Box2D's own answer, and
// the one this module takes -- iterating the same sequential-impulse pass over every contact
// multiple times per step, so an impulse actually propagates through a stack instead of only
// through whichever contact happened to be solved last.

// Box2D's own default mixing rules for two DYNAMIC bodies meeting each other (stepSphereBody's
// static-terrain case only ever reads one body's own restitution/friction, since the terrain has
// none of its own to mix in): max() for restitution (the bouncier of the two dominates how a
// first contact feels) and sqrt(a*b) for friction (a standard heuristic: already 1 if both are, 0
// if either is frictionless, bounded appropriately in between).
function mixRestitution(a, b) { return Math.max(a, b); }
function mixFriction(a, b) { return Math.sqrt(Math.max(0, a) * Math.max(0, b)); }

// One velocity-only impulse resolution between two dynamic bodies along `nx,ny,nz` (a unit
// normal pointing from `a` to `b`). Reuses stepSphereBody's exact restitution-threshold
// reasoning rather than assuming it transfers for free (EXECUTION_PLAN.md Task 3 flags this as
// something to check): a resting contact re-penetrates by about |gravityY|*dt every step purely
// because gravity integrates before contact response runs, and that argument doesn't care what is
// on the other side of the contact -- a static heightfield or another dynamic sphere sitting
// under the same gravity produces the same-sized spurious "impact" speed. The impulse-
// conservation and elastic-energy tests in tools/test-world-sandbox-physics.mjs independently
// confirm this doesn't corner-cut genuine collisions: their closing speeds sit far above this
// threshold, so it never engages for them, only for gravity-driven resting contact.
function resolvePairVelocity(a, b, nx, ny, nz, dt, gravityY) {
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0) return 0; // two infinite-mass bodies -- nothing to solve
  const relVelN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
  if (relVelN >= 0) return 0; // already separating, nothing to do this pass
  const impactSpeed = -relVelN;
  const restitutionThreshold = Math.abs(gravityY) * dt * 2;
  const restitution = impactSpeed > restitutionThreshold ? mixRestitution(a.restitution, b.restitution) : 0;

  // Two-body sequential impulse (Catto): j = -(1+e) * relVelN / (invMassA + invMassB) -- the
  // static-terrain formula in stepSphereBody is this exact equation with invMassB = 0 and the
  // terrain's own velocity fixed at 0.
  const j = -(1 + restitution) * relVelN / invSum;
  a.vx -= j * nx * a.invMass; a.vy -= j * ny * a.invMass; a.vz -= j * nz * a.invMass;
  b.vx += j * nx * b.invMass; b.vy += j * ny * b.invMass; b.vz += j * nz * b.invMass;

  const rvx2 = b.vx - a.vx, rvy2 = b.vy - a.vy, rvz2 = b.vz - a.vz;
  const vn2 = rvx2 * nx + rvy2 * ny + rvz2 * nz;
  const tx = rvx2 - vn2 * nx, ty = rvy2 - vn2 * ny, tz = rvz2 - vn2 * nz;
  const tangentSpeed = Math.hypot(tx, ty, tz);
  if (tangentSpeed > 1e-9) {
    // Coulomb friction cone, same as stepSphereBody's, but capped at the impulse that would fully
    // cancel the remaining relative tangential velocity (tangentSpeed / invSum) rather than at
    // tangentSpeed itself -- stepSphereBody's static-terrain cap of `tangentSpeed` is this same
    // formula with invSum = 1 (unit body mass, infinite-mass terrain).
    const friction = mixFriction(a.friction, b.friction);
    const tangentImpulseFull = tangentSpeed / invSum;
    const frictionImpulse = Math.min(friction * Math.abs(j), tangentImpulseFull);
    const scale = frictionImpulse / tangentSpeed;
    a.vx -= tx * scale * a.invMass; a.vy -= ty * scale * a.invMass; a.vz -= tz * scale * a.invMass;
    b.vx += tx * scale * b.invMass; b.vy += ty * scale * b.invMass; b.vz += tz * scale * b.invMass;
  }
  return impactSpeed;
}

// Baumgarte positional correction for two dynamic bodies -- the two-body generalisation of
// stepSphereBody's single-body correction: instead of moving the (infinite-mass) terrain, split
// the correction between both bodies in proportion to their inverse mass, so a heavier body moves
// less and the correction itself (a pure positional nudge, not an impulse) does not disturb
// momentum.
function correctPairPenetration(a, b, nx, ny, nz, penetration) {
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0) return;
  const correction = Math.max(0, penetration - PENETRATION_SLOP) * BAUMGARTE;
  const moveA = correction * (a.invMass / invSum);
  const moveB = correction * (b.invMass / invSum);
  a.x -= nx * moveA; a.y -= ny * moveA; a.z -= nz * moveA;
  b.x += nx * moveB; b.y += ny * moveB; b.z += nz * moveB;
}

// Advances an array of sphere bodies one fixed step, resolving both sphere-vs-ground and
// sphere-vs-sphere contact. `iterations` (default 4) is the solver-iteration count Task 3 exists
// to introduce: contacts are detected once per step against the post-integration positions, then
// the same sequential-impulse pass runs over every contact `iterations` times (Gauss-Seidel style)
// before positions are corrected once. iterations=1 reproduces the single-pass behaviour
// VERIFICATION.md's LAW: sphere_terrain_contact_v1 already documents as measurably inaccurate at
// multi-body contact; this function exists so a caller can choose a higher count instead.
//
// Bodies not currently touching anything (ground or another body) are simply left at their
// gravity-integrated position/velocity, exactly as stepSphereBody leaves an airborne body.
export function stepSphereBodies(bodies, groundSample, dt, {gravityY = -0.86, iterations = 4} = {}) {
  for (const body of bodies) {
    body.vy += gravityY * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.z += body.vz * dt;
  }

  const contacts = [];
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const ground = groundSample(body.x, body.z);
    const penetration = ground.height + body.radius - body.y;
    if (penetration > 0) {
      contacts.push({kind: 'ground', a: i, nx: ground.normalX, ny: ground.normalY, nz: ground.normalZ, penetration});
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz);
      const penetration = (a.radius + b.radius) - dist;
      if (penetration > 0 && dist > 1e-9) {
        contacts.push({kind: 'pair', a: i, b: j, nx: dx / dist, ny: dy / dist, nz: dz / dist, penetration});
      }
    }
  }

  const lastImpactSpeed = new Array(bodies.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    for (const c of contacts) {
      if (c.kind === 'ground') {
        const body = bodies[c.a];
        const relVelN = body.vx * c.nx + body.vy * c.ny + body.vz * c.nz;
        if (relVelN >= 0) continue;
        const impactSpeed = -relVelN;
        const restitutionThreshold = Math.abs(gravityY) * dt * 2;
        const restitution = impactSpeed > restitutionThreshold ? body.restitution : 0;
        const j = -(1 + restitution) * relVelN;
        body.vx += j * c.nx; body.vy += j * c.ny; body.vz += j * c.nz;

        const vn2 = body.vx * c.nx + body.vy * c.ny + body.vz * c.nz;
        const tx = body.vx - vn2 * c.nx, ty = body.vy - vn2 * c.ny, tz = body.vz - vn2 * c.nz;
        const tangentSpeed = Math.hypot(tx, ty, tz);
        if (tangentSpeed > 1e-9) {
          const frictionImpulse = Math.min(body.friction * j, tangentSpeed);
          const scale = frictionImpulse / tangentSpeed;
          body.vx -= tx * scale; body.vy -= ty * scale; body.vz -= tz * scale;
        }
        lastImpactSpeed[c.a] = impactSpeed;
      } else {
        const impactSpeed = resolvePairVelocity(bodies[c.a], bodies[c.b], c.nx, c.ny, c.nz, dt, gravityY);
        if (impactSpeed > 0) { lastImpactSpeed[c.a] = impactSpeed; lastImpactSpeed[c.b] = impactSpeed; }
      }
    }
  }

  // Positional correction runs once per contact, using the penetration measured at detection
  // time -- iterating this too would fight the velocity solve itself; one pass matches
  // stepSphereBody's own single-body behaviour exactly for the ground case.
  for (const c of contacts) {
    if (c.kind === 'ground') {
      const body = bodies[c.a];
      const correction = Math.max(0, c.penetration - PENETRATION_SLOP) * BAUMGARTE;
      body.x += c.nx * correction; body.y += c.ny * correction; body.z += c.nz * correction;
    } else {
      correctPairPenetration(bodies[c.a], bodies[c.b], c.nx, c.ny, c.nz, c.penetration);
    }
  }

  const restitutionThreshold = Math.abs(gravityY) * dt * 2;
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].resting = lastImpactSpeed[i] > 0 && lastImpactSpeed[i] <= restitutionThreshold;
  }

  return {contactCount: contacts.length};
}
