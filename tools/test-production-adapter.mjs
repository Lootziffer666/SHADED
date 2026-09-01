// Deterministischer Node-Test fuer runtime/style/production-adapter.js.
import {
  SHADED_CLASSES, SHADED_CLASS_TO_MATERIAL_KIND,
  worldStateForShadedClass, deriveProductionMaterialResponses,
  specularWeightsForShader, styleUniformsForShader,
} from '../runtime/style/production-adapter.js';
import { defaultStyleProfile, setDimension } from '../runtime/style/style-profile.js';

let failed = false;
function check(name, ok, detail) {
  console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}: ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!ok) failed = true;
}

console.log('=== production-adapter.js Regressionstest ===\n');
const EXPECTED_CLASSES = ['grass', 'foliage', 'roof', 'path', 'wood', 'window', 'water', 'rock'];

console.log('Test 1: SHADED-Klasse -> MaterialKind-Abbildung');
check('alle 8 SHADED-Klassen abgebildet', EXPECTED_CLASSES.every((c) => c in SHADED_CLASS_TO_MATERIAL_KIND), Object.keys(SHADED_CLASS_TO_MATERIAL_KIND));
check('SHADED_CLASSES stimmt mit Mapping ueberein', SHADED_CLASSES.length === EXPECTED_CLASSES.length);

console.log('\nTest 2: WorldState folgt persistentem Weltzustand');
const curDry = { wet: 0, puddle: 0, temperature: 0.6, snow: 0, snowfall: 0, decay: 0 };
const wsDry = worldStateForShadedClass('wood', curDry);
check('origin bleibt manual', wsDry.fields.moisture.origin === 'manual');
check('moisture folgt CUR.wet', wsDry.fields.moisture.value === 0);
const curWet = { wet: 0.8, puddle: 0.5, temperature: 0.6, snow: 0, snowfall: 0, decay: 0 };
const wsWet = worldStateForShadedClass('wood', curWet);
check('moisture folgt CUR.wet (nass)', wsWet.fields.moisture.value === 0.8);
check('water = wet*puddle', Math.abs(wsWet.fields.water.value - 0.4) < 1e-9, wsWet.fields.water.value);
const settledSnow = worldStateForShadedClass('rock', { ...curDry, temperature: 0.2, snow: 0.75, snowfall: 0 });
check('snowCap folgt Schneedecke, nicht aktuellem Schneefall', Math.abs(settledSnow.fields.snowCap.value - 0.75) < 1e-9, settledSnow.fields.snowCap.value);
const fallingOnly = worldStateForShadedClass('rock', { ...curDry, temperature: 0.2, snow: 0, snowfall: 1 });
check('Schneefall ohne Schneedecke erzeugt keinen sofortigen snowCap', fallingOnly.fields.snowCap.value === 0, fallingOnly.fields.snowCap.value);

console.log('\nTest 3: deriveProductionMaterialResponses()');
const responsesDry = deriveProductionMaterialResponses(curDry);
check('acht Antworten', Object.keys(responsesDry).length === 8);
check('trocken: wetness ueberall 0', EXPECTED_CLASSES.every((c) => responsesDry[c].wetness === 0));
const responsesWet = deriveProductionMaterialResponses(curWet);
check('nass: wetness > 0', EXPECTED_CLASSES.every((c) => responsesWet[c].wetness > 0));
check('Holz dunkelt bei Naesse ab', responsesWet.wood.baseColor[0] < responsesDry.wood.baseColor[0], { dry: responsesDry.wood.baseColor, wet: responsesWet.wood.baseColor });

console.log('\nTest 4: bounded materialabhaengige Specular-Gewichte');
const weightsDry = specularWeightsForShader(responsesDry);
check('vier gated Klassen vorhanden', ['roof', 'path', 'rock', 'wood'].every((c) => c in weightsDry));
check('path/rock identisch', weightsDry.path === weightsDry.rock, weightsDry);
check('roof > path/rock', weightsDry.roof > weightsDry.path, weightsDry);
check('wood > path/rock', weightsDry.wood > weightsDry.path, weightsDry);
const storm = { wet: 1, puddle: 0.92, temperature: 0.52, snow: 0, snowfall: 0, decay: 0 };
const weightsStorm = specularWeightsForShader(deriveProductionMaterialResponses(storm));
check('wet preset kann Specular-Gewichte nicht mehr order-of-magnitude aufblasen', Object.values(weightsStorm).every((v) => Number.isFinite(v) && v >= 0 && v <= 2.5), weightsStorm);
const dryMean = Object.values(weightsDry).reduce((s, v) => s + v, 0) / 4;
const stormMean = Object.values(weightsStorm).reduce((s, v) => s + v, 0) / 4;
check('globale Gewichtsskala bleibt normalisiert statt Wetness doppelt anzuwenden', Math.abs(dryMean - 1) < 0.35 && Math.abs(stormMean - 1) < 0.35, { dryMean, stormMean });

console.log('\nTest 5: Default-Profil reproduziert alte 0.28 Intensitaet');
const profile = defaultStyleProfile('test', 'Test');
const uniformsFull = styleUniformsForShader(profile, 'FULL', responsesDry);
check('specStyleIntensity == 0.28', Math.abs(uniformsFull.specStyleIntensity - 0.28) < 1e-9, uniformsFull.specStyleIntensity);
check('specStyleMode(default) == 0', uniformsFull.specStyleMode === 0);
check('shadowWarmth(default) == 0', uniformsFull.shadowWarmth === 0);

console.log('\nTest 6: RenderBudget trennt Kosten von Stilidentitaet');
const warmProfile = setDimension(setDimension(profile, 'shadow.warmth', 0.7), 'specular.mode', 'banded');
const uniformsFullWarm = styleUniformsForShader(warmProfile, 'FULL', responsesDry);
const uniformsMobileWarm = styleUniformsForShader(warmProfile, 'MOBILE', responsesDry);
check('specStyleMode == 1', uniformsFullWarm.specStyleMode === 1);
check('MOBILE specular == FULL * 0.6', Math.abs(uniformsMobileWarm.specStyleIntensity - uniformsFullWarm.specStyleIntensity * 0.6) < 1e-9, { full: uniformsFullWarm.specStyleIntensity, mobile: uniformsMobileWarm.specStyleIntensity });
check('shadowWarmth budget-unabhaengig', uniformsFullWarm.shadowWarmth === uniformsMobileWarm.shadowWarmth && uniformsFullWarm.shadowWarmth === 0.7);
check('Specular-Gewichte budget-unabhaengig', uniformsFullWarm.specWeightWood === uniformsMobileWarm.specWeightWood && uniformsFullWarm.specWeightRoof === uniformsMobileWarm.specWeightRoof);

console.log();
console.log(failed ? '❌ test-production-adapter FAILED' : '✅ test-production-adapter PASSED');
process.exit(failed ? 1 : 0);
