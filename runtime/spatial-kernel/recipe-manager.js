// SHADED Spatial Kernel — RecipeManager (spec §3 subsystem, §16).
//
// Recipes are the ONLY things that know how to turn an external input
// (photo, plan, procedural rules, video, …) into GeometryObservations that the
// kernel ingests. The kernel itself stays input-agnostic.
//
// This is the inversion the spec demands: PHOTO-FIRST becomes a Recipe that
// calls kernel.ingest(...), instead of the kernel being wired through a
// photo-first integrator.

export class RecipeManager {
  constructor(opts = {}) {
    this.name = 'recipes';
    this.recipes = new Map();
    this._kernel = null;
  }

  onKernelReady(kernel) { this._kernel = kernel; }

  register(name, recipe) {
    this.recipes.set(name, recipe);
    if (typeof recipe?.onManagerReady === 'function') recipe.onManagerReady(this);
    return recipe;
  }

  has(name) { return this.recipes.has(name); }

  list() { return Array.from(this.recipes.keys()); }

  // Run a recipe against the kernel. Errors are returned structurally — never
  // swallowed, never faked into success.
  async run(kernel, name, input, opts = {}) {
    const recipe = this.recipes.get(name);
    if (!recipe) return { ok: false, error: `unknown recipe: ${name}` };
    try {
      return await recipe.run(kernel, input, opts);
    } catch (err) {
      return { ok: false, error: `recipe ${name} threw: ${err && err.message || err}` };
    }
  }
}
