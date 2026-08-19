// SHADED Spatial Kernel — WorldLawSolver (spec §11, part B: PHYSICAL/HEURISTIC
// SOLVER). Laws are pure functions (fields, ctx) => void that mutate the
// WorldFields state. The same state can be stepped with different law sets;
// determinism is guaranteed by the seeded RNG in ctx and a fixed dt.
//
// Concrete example laws (water/moisture/snow/ice/fire coupling) are provided
// as reference implementations, not as the exhaustive world-law catalogue.

export class WorldLawSolver {
  constructor() { this.laws = new Map(); }
  register(name, fn) { this.laws.set(name, fn); return this; }
  has(name) { return this.laws.has(name); }
  list() { return Array.from(this.laws.keys()); }

  // Advance all registered laws by dt. ctx provides { params, dt, rng }.
  step(fields, params = {}, dt = 1 / 60) {
    const ctx = { params, dt, rng: fields.rng, size: fields.size };
    for (const fn of this.laws.values()) fn(fields, ctx);
    fields.time += dt;
  }
}

// --- reference laws -------------------------------------------------------

// Temperature drives evaporation: moisture and free water decay faster when hot.
export function evaporationLaw(fields, ctx) {
  const { dt, params } = ctx;
  const temp = params.temperature ?? 0.5;
  const moisture = fields.ensure('moisture');
  const water = fields.ensure('water');
  const k = (0.02 + 0.12 * temp) * dt;
  for (let i = 0; i < moisture.length; i++) {
    moisture[i] = Math.max(0, moisture[i] * (1 - k));
    water[i] = Math.max(0, water[i] * (1 - k * 0.7));
  }
}

// Freeze/thaw: below 0 water->ice; above 0 ice->water (mass-conserving-ish).
export function freezeThawLaw(fields, ctx) {
  const { dt, params } = ctx;
  const temp = params.temperature ?? 0.5;
  const water = fields.ensure('water');
  const ice = fields.ensure('ice');
  const rate = 0.15 * dt;
  if (temp < 0.45) {
    for (let i = 0; i < water.length; i++) {
      const f = Math.min(water[i], rate * (0.45 - temp) * 4);
      water[i] -= f; ice[i] = Math.min(1, ice[i] + f);
    }
  } else if (temp > 0.55) {
    for (let i = 0; i < ice.length; i++) {
      const f = Math.min(ice[i], rate * (temp - 0.55) * 4);
      ice[i] -= f; water[i] = Math.min(1, water[i] + f);
    }
  }
}

// Rain accumulates water; where water is high, mud forms (coupling).
export function rainToMudLaw(fields, ctx) {
  const { dt, params } = ctx;
  const rain = Math.max(0, params.rain ?? 0);
  if (rain < 0.01) return;
  const water = fields.ensure('water');
  const mud = fields.ensure('mud');
  for (let i = 0; i < water.length; i++) {
    water[i] = Math.min(1, water[i] + rain * 0.1 * dt);
    if (water[i] > 0.6) mud[i] = Math.min(1, mud[i] + 0.05 * dt);
  }
}

// Fire consumes fuel, emits heat, then smoke/soot.
export function fireFuelLaw(fields, ctx) {
  const { dt } = ctx;
  const fire = fields.ensure('fire');
  const fuel = fields.ensure('fuelMass');
  const heat = fields.ensure('heat');
  const smoke = fields.ensure('smoke');
  const soot = fields.ensure('soot');
  for (let i = 0; i < fire.length; i++) {
    if (fire[i] > 0.01 && fuel[i] > 0) {
      const burn = Math.min(fuel[i], 0.05 * dt);
      fuel[i] -= burn;
      heat[i] = Math.min(1, heat[i] + burn * 2);
      smoke[i] = Math.min(1, smoke[i] + burn * 1.5);
      soot[i] = Math.min(1, soot[i] + burn * 0.8);
      fire[i] = fuel[i] > 0 ? fire[i] : fire[i] * 0.5;
    } else {
      heat[i] *= (1 - 0.1 * dt);
    }
  }
}

// Register the reference law set on a solver.
export function registerReferenceLaws(solver) {
  solver.register('evaporation', evaporationLaw);
  solver.register('freezeThaw', freezeThawLaw);
  solver.register('rainToMud', rainToMudLaw);
  solver.register('fireFuel', fireFuelLaw);
  return solver;
}
