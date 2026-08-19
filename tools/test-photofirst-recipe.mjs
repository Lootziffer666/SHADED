// Node-runnable tests for PhotoFirstRecipe + RecipeManager (spec §16).
// Run: node tools/test-photofirst-recipe.mjs
import assert from 'node:assert/strict';
import {
  SpatialKernel, RecipeManager, PhotoFirstRecipe, GeometryObservation, OBS_PROVENANCE,
} from '../runtime/spatial-kernel/index.js';

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); passed++; };

// Honest test double provider: it returns a real-looking depth array but is
// explicitly a stub (NOT production inference). Recipe marks it INFERRED.
function stubProvider(depthData) {
  return {
    name: 'stub-depth',
    async provide() {
      return {
        ok: true,
        depth: { data: depthData, width: 4, height: 4 },
        confidence: { data: depthData.map(() => 0.9), width: 4, height: 4 },
        camera: { fx: 320, fy: 320, width: 4, height: 4 },
        modelVersion: 'stub-1',
      };
    },
  };
}

// 1) Recipe WITHOUT provider and fallback disabled must FAIL (no faked depth).
{
  const kernel = new SpatialKernel();
  const rm = new RecipeManager();
  kernel.registerSubsystem('recipes', rm);
  rm.register('photo-first', new PhotoFirstRecipe({ allowFallback: false }));
  const r = await kernel.runRecipe('photo-first', { image: { width: 4, height: 4 }, calibration: {} });
  ok('no provider + no fallback => failure', r.ok === false);
  ok('failure mentions no depth source', /no depth provider/.test(r.error));
  ok('nothing ingested on failure', kernel.observations.size === 0);
}

// 2) Recipe WITHOUT provider but fallback ENABLED => SIMULATED_FALLBACK, not success.
{
  const kernel = new SpatialKernel();
  const rm = new RecipeManager();
  kernel.registerSubsystem('recipes', rm);
  rm.register('photo-first', new PhotoFirstRecipe({ allowFallback: true }));
  const r = await kernel.runRecipe('photo-first', { image: { width: 4, height: 4 }, calibration: {} });
  ok('fallback ingest ok flag', r.ok === true);
  ok('fallback marked simulated', r.simulated === true && r.provenanceClass === OBS_PROVENANCE.SIMULATED_FALLBACK);
  const obs = kernel.observations.get(r.id);
  ok('fallback observation carries simulated provenance', obs.provenanceClass === OBS_PROVENANCE.SIMULATED_FALLBACK);
}

// 3) Recipe WITH provider => INFERRED, depth attached, ingested.
{
  const kernel = new SpatialKernel();
  const rm = new RecipeManager();
  kernel.registerSubsystem('recipes', rm);
  rm.register('photo-first', new PhotoFirstRecipe({ provider: stubProvider([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) }));
  const r = await kernel.runRecipe('photo-first', {
    image: { width: 4, height: 4 },
    calibration: { fov: 55, width: 4, height: 4 },
  });
  ok('provider recipe ok', r.ok === true);
  ok('provider recipe NOT simulated', r.simulated === false);
  ok('provider recipe INFERRED', r.provenanceClass === OBS_PROVENANCE.INFERRED);
  const obs = kernel.observations.get(r.id);
  ok('depth attached', obs.depth && obs.depth.data.length === 16);
  ok('camera fov from calibration', obs.camera.fov === 55);
  ok('provider metadata recorded', obs.provider && obs.provider.name === 'stub-depth');
}

// 4) providerResult path adapts a v1 provider result directly.
{
  const kernel = new SpatialKernel();
  const rm = new RecipeManager();
  kernel.registerSubsystem('recipes', rm);
  rm.register('photo-first', new PhotoFirstRecipe());
  const v1 = {
    format: 'SHADED.spatial-provider-result.v1', provider: 'da3', modelVersion: 'v3', device: 'wasm',
    precision: 'fp32', depthConvention: 'relative-depth-higher-far', metric: false,
    channels: { depth: { file: 'd', dtype: 'float32-le', shape: [4, 4] } },
    camera: { fx: 1, fy: 1, width: 4, height: 4 },
    provenance: { class: 'INFERRED', sourceFile: 'p.png', sourceSha256: 'a'.repeat(64), sourceSize: { width: 4, height: 4 }, processedSize: { width: 4, height: 4 }, provider: 'da3', modelVersion: 'v3', parameters: {} },
  };
  const r = await kernel.runRecipe('photo-first', { providerResult: v1 });
  ok('providerResult path ok', r.ok === true);
  const obs = kernel.observations.get(r.id);
  ok('providerResult depth ref preserved', obs.depth.ref.file === 'd');
  ok('providerResult INFERRED', obs.provenanceClass === OBS_PROVENANCE.INFERRED);
}

// 5) Unknown recipe name => structured failure.
{
  const kernel = new SpatialKernel();
  const rm = new RecipeManager();
  kernel.registerSubsystem('recipes', rm);
  const r = await kernel.runRecipe('does-not-exist', {});
  ok('unknown recipe fails', r.ok === false && /unknown recipe/.test(r.error));
}

console.log(`✅ PhotoFirst Recipe tests passed (${passed} assertions)`);
